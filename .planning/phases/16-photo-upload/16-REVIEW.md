---
phase: 16-photo-upload
reviewed: 2026-07-24T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - backend/migrations/manual/013-add-family-members-profile-picture.sql
  - backend/package.json
  - backend/scripts/verify-photo-persistence.sh
  - backend/src/config/photoStorage.js
  - backend/src/models/FamilyMember.js
  - backend/src/models/database.test.js
  - backend/src/resolvers/familyMember.resolver.js
  - backend/src/routes/photo.remove.test.js
  - backend/src/routes/photo.routes.js
  - backend/src/routes/photo.serve.test.js
  - backend/src/routes/photo.upload.test.js
  - backend/src/schemas/familyMember.schema.js
  - backend/src/server.js
  - backend/src/services/photoStorage.service.js
  - backend/src/services/photoStorage.service.test.js
  - backend/test/fixtures/images.js
  - backend/test/fixtures/images.test.js
  - frontend/package.json
  - frontend/src/api/photoClient.js
  - frontend/src/api/photoClient.test.js
  - frontend/src/components/manage/AdminMemberTable.jsx
  - frontend/src/components/manage/AdminMemberTable.test.jsx
  - frontend/src/components/manage/MemberAvatarImage.jsx
  - frontend/src/components/manage/MemberAvatarImage.test.jsx
  - frontend/src/components/manage/MemberCard.jsx
  - frontend/src/components/manage/MemberCard.test.jsx
  - frontend/src/components/manage/PhotoCropDialog.jsx
  - frontend/src/components/manage/PhotoCropDialog.test.jsx
  - frontend/src/components/manage/RelationshipGroupedPanel.jsx
  - frontend/src/components/manage/RelationshipGroupedPanel.test.jsx
  - frontend/src/pages/ManagePage.jsx
  - frontend/src/pages/ManagePage.test.jsx
  - frontend/vite.config.js
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
resolved:
  critical: 1
  warning: 2
status: partially_resolved
---

# Phase 16: Code Review Report

**Reviewed:** 2026-07-24
**Depth:** standard
**Files Reviewed:** 34
**Status:** partially_resolved

## Resolution Log (2026-07-24, post-review remediation)

Fixed during phase execution, TDD (RED tests first, commit `test(16): ... [RED]` → `fix(16): ... [GREEN]`):

- **CR-01 — FIXED.** Upload route switched from a managed to an unmanaged
  transaction so the `commit` handed to `finalizePhotoReplacement` is a genuine
  durable commit; delete-old now runs strictly after the row is persisted.
  New regression test forces a commit failure and asserts the previous file
  survives + DB still references it.
- **WR-01 — FIXED.** Added `mapAuthFailure()` mapping the auth guards' thrown
  Errors to 401 (not logged in) / 403 (linked-account/role) on both write
  routes. Regression tests assert unauthenticated upload/delete return 401.
- **WR-02 — FIXED.** DELETE now nulls the `profilePicture` column before
  unlinking the file. Regression test injects a column-write failure and
  asserts the file survives.
- **WR-04 — NOT A DEFECT (false positive).** The finding assumed a Node 18.x
  runtime from stale CLAUDE.md/tech-stack docs. The repo is actually on Node 24
  everywhere (`.nvmrc`=24, `engines: node 24.x`, `backend/Dockerfile`=
  `node:24-alpine`, local v24.15.0), so `zlib.crc32` (Node 22.2+) is supported.
  No code change; the documentation drift is the only real issue here.
- **WR-03 — OPEN (tracked follow-up).** `photoClient` has no `baseURL`; the Vite
  dev proxy masks it. Cross-origin production deployments need it wired to
  `VITE_API_URL` like `graphqlClient`.
- **IN-01 / IN-02 — OPEN (advisory).** Defense-in-depth path-containment check
  on serve; dead `originalGenerate` capture in a service test.

## Summary

Reviewed the photo upload/serve/remove feature: the new non-Apollo `/api` route
module, magic-byte content sniffing, server-generated filenames, authz reuse,
and the "orphan-free" replace sequencing. The security posture is largely sound:
filenames are UUID-generated (no path traversal from client input), the upload
filename and multipart Content-Type header are correctly ignored in favor of
`fileTypeFromBuffer` magic-byte sniffing, and the write paths reuse the existing
`requireFamilyAccess` / `computeEditableScope` primitives verbatim.

However, the headline invariant this phase claims to guarantee — "no photo is
ever orphaned" during a replace — is **not actually upheld**: the delete-old
step runs *inside* the Sequelize managed transaction (before commit), so a
commit failure permanently loses the member's existing photo and orphans the new
file. This directly contradicts the safety claim in the route comment and is the
one Critical finding. Four Warnings cover incorrect HTTP status semantics on the
write routes, a delete-ordering inversion, a cross-origin API base-URL mismatch,
and a Node-version/`zlib.crc32` inconsistency that can break the entire photo
test suite on the documented runtime.

## Critical Issues

### CR-01: Replace deletes the previous photo *before* the transaction commits — data loss + orphan on commit failure

**File:** `backend/src/services/photoStorage.service.js:31-47`, `backend/src/routes/photo.routes.js:55-67`

**Issue:** The route wraps `finalizePhotoReplacement` in a Sequelize *managed*
transaction (`sequelize.transaction(async (t) => {...})`), which commits only
*after* the callback resolves. Inside `finalizePhotoReplacement`, the sequence is:

1. `writePhotoFile(newFilename)` — new file written
2. `await commit(newFilename)` — this is `target.update(..., { transaction: t })`, which merely *issues* the UPDATE inside the still-uncommitted transaction; it does **not** mean the row is committed
3. `deletePhotoFile(previousFilename)` — **the old file is unlinked here**
4. return → *then* Sequelize commits `t`

So the old file is deleted at step 3, before the outer transaction commits at
step 4. If the commit fails (deadlock, connection drop, deferred constraint —
uncommon but real for MySQL/mysql2), the DB rolls back to the *old* filename,
but that file has already been permanently deleted, and the new file is now
orphaned on disk (unreferenced). This is exactly the orphan/data-loss condition
the code comment claims to prevent: *"write-new -> DB commit -> delete-old,
discarding the new file on commit failure -- no photo is ever orphaned."* The
comment is inaccurate; delete-old happens pre-commit.

Note the unit tests in `photoStorage.service.test.js` cannot catch this: they
call `finalizePhotoReplacement` in isolation where `commit` resolving *is*
success. In the route, `commit` resolving is not the same as the transaction
committing.

**Fix:** Move delete-old *outside* the transaction boundary, so it runs only
after a confirmed commit. Have `finalizePhotoReplacement` (or the route) defer
the old-file unlink until after `sequelize.transaction(...)` resolves:

```js
// photo.routes.js
let previousToDelete = null;
const photoUrl = await sequelize.transaction(async (t) => {
  const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
  if (!target) throw new Error('Family member not found.');
  const newFilename = generatePhotoFilename(detected.ext);
  await writePhotoFile(req.file.buffer, newFilename);
  try {
    await target.update({ profilePicture: newFilename }, { transaction: t });
  } catch (err) {
    await deletePhotoFile(newFilename); // roll back the just-written file
    throw err;
  }
  previousToDelete = target.previous('profilePicture'); // old value
  return `/api/family-members/${targetId}/photo`;
});
// Only after the transaction has actually committed:
if (previousToDelete) await deletePhotoFile(previousToDelete);
```

## Warnings

### WR-01: Unauthenticated / unauthorized upload and delete return HTTP 500 instead of 401/403

**File:** `backend/src/routes/photo.routes.js:27-28`, `:81-82`, `:57`

**Issue:** In the POST and DELETE handlers, `requireFamilyAccess(user)` (and the
`throw new Error('Family member not found.')` inside the upload transaction)
throw plain `Error`s that are caught and passed to `next(err)`. The only
error-handling middleware on this router is `multerErrorHandler`, which forwards
non-Multer errors via `next(err)` to Express's *default* handler — producing a
**500**. So:
- An upload/delete with no JWT or an invalid JWT returns 500 (not 401).
- A logged-in USER whose account isn't linked to a family member ("Your account
  is not yet linked...") returns 500 (not 403).
- `Family member not found` in the *upload* path returns 500, while the *delete*
  and *serve* paths correctly return 404 — inconsistent.

The serve route already demonstrates the intended pattern (it wraps `requireAuth`
and maps the thrown error to 401 at `:121-125`); the write routes do not. Beyond
wrong status semantics, Express's default handler can leak a stack trace when
`NODE_ENV !== 'production'`.

**Fix:** Map thrown auth/validation errors to explicit statuses in the upload and
delete handlers (mirror the serve route's `try { requireFamilyAccess(user) }
catch { res.status(401/403)... }`), or mount a dedicated error handler on
`photoRouter` that translates auth errors to 401/403 and "not found" to 404
before falling through to 500.

### WR-02: DELETE removes the file before nulling the DB column — inverse-orphan / broken image on update failure

**File:** `backend/src/routes/photo.routes.js:99-102`

**Issue:** The delete handler unlinks the file first, then updates the row:

```js
if (target.profilePicture) {
  await deletePhotoFile(target.profilePicture);
  await target.update({ profilePicture: null });
}
```

If `target.update(...)` fails after `deletePhotoFile` succeeds, the DB still
references a filename whose file no longer exists. A subsequent GET
`/photo` then passes the `target.profilePicture` truthiness check and calls
`res.sendFile` on a missing path, producing a 500 (broken image) instead of the
placeholder. This is the same class of ordering hazard as CR-01, inverted.

**Fix:** Update the DB first, then delete the file (deletion is best-effort and
ENOENT-safe, so a post-commit delete that fails leaves at most a harmless
orphaned file rather than a broken DB reference):

```js
if (target.profilePicture) {
  const old = target.profilePicture;
  await target.update({ profilePicture: null });
  await deletePhotoFile(old);
}
```

### WR-03: `photoClient` ignores `VITE_API_URL` — photo upload/serve/remove break in cross-origin deployments

**File:** `frontend/src/api/photoClient.js:9`

**Issue:** `photoClient` is created with `axios.create()` and **no `baseURL`**, so
every request (`/api/family-members/:id/photo` for upload/remove, and the
GraphQL-returned relative `photoUrl` for serve) is issued against the frontend's
*own origin*. In contrast, `graphqlClient` (`graphqlClient.js:10-11`) routes
through `normalizeGraphqlUrl(import.meta.env.VITE_API_URL)`. In any deployment
where `VITE_API_URL` points to a cross-origin backend (a configuration the
codebase explicitly supports), GraphQL works but all photo operations silently
hit the wrong host and fail. The Vite dev proxy masks this in development because
it proxies both `/graphql` and `/api`, but production single-origin assumptions
are not guaranteed.

**Fix:** Derive the photo API base from the same source as GraphQL (strip the
`/graphql` suffix from `VITE_API_URL` to get the API origin, or introduce a
shared `apiBaseUrl` helper) and set it as `photoClient`'s `baseURL`, so both
clients agree on where the backend lives.

### WR-04: `engines: node 24.x` + `zlib.crc32` contradict the documented Node 18.x runtime; fixtures throw on Node 18/20

**File:** `backend/package.json:6-8`, `backend/test/fixtures/images.js:22`

**Issue:** `backend/package.json` now declares `"engines": { "node": "24.x" }`,
while the project's stated constraint is Node 18.x (`.nvmrc` = `18`, CLAUDE.md
"Runtime: Node.js 18.x"). The PNG fixture uses `zlib.crc32(...)`, which was only
added in Node **22.2.0**. If the suite is run on the documented Node 18 (or 20),
`zlib.crc32` is `undefined` and `images.js` throws `TypeError` at import — and
because `images.js` is imported by `photo.upload.test.js`, `photo.serve.test.js`,
and `photo.remove.test.js`, the *entire* photo backend test suite fails to load.
The engines bump also silently breaks the "non-destructive / Node 18" milestone
constraint and should be an explicit, coordinated decision (CI matrix, `.nvmrc`,
Dockerfile `node:18-alpine` all still target 18).

**Fix:** Pick one runtime and make it consistent everywhere. If Node 22+/24 is
intended, update `.nvmrc`, the Dockerfiles (`node:18-alpine`), CI, and CLAUDE.md
together and confirm CI runs it. If Node 18 must be supported, replace
`zlib.crc32` in the fixture with a small inline CRC-32 implementation (or a
precomputed CRC) so the fixtures don't depend on a Node 22.2+ API.

## Info

### IN-01: Serve route has no defense-in-depth path-containment assertion

**File:** `backend/src/routes/photo.routes.js:132-133`

**Issue:** `res.sendFile(resolvePhotoPath(target.profilePicture))` trusts that
`profilePicture` is always a server-generated UUID filename. This is true today
(the column is only ever written by `generatePhotoFilename`), so there is no
current traversal vector. As pure defense-in-depth, a stored value that ever
drifted from the expected pattern would be served without a containment check.

**Fix (optional):** Assert the resolved path stays within
`photoStorageConfig.photosDir` (e.g. `path.resolve(...).startsWith(photosDir +
path.sep)`), or validate `profilePicture` against `^[0-9a-f-]{36}\.[a-z0-9]+$`
before serving.

### IN-02: Dead capture in `finalizePhotoReplacement` test

**File:** `backend/src/services/photoStorage.service.test.js:139,158`

**Issue:** `const originalGenerate = generatePhotoFilename;` is captured but never
meaningfully used; the trailing `void originalGenerate;` only suppresses the
unused-variable signal. This is leftover scaffolding that adds noise to the test.

**Fix:** Remove the `originalGenerate` capture and the `void` statement.

---

_Reviewed: 2026-07-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
