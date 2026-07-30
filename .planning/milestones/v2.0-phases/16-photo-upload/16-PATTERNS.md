# Phase 16: Photo Upload - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 24 (14 new, 10 modified)
**Analogs found:** 22 / 24 (2 flagged "No Analog Found" — genuinely new capability for this codebase)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/routes/photo.routes.js` | route | file-I/O + request-response | `backend/src/server.js` (mounting) + `backend/src/resolvers/familyMember.resolver.js` (auth/scope body) | role-match (first non-Apollo route in the codebase) |
| `backend/src/services/photoStorage.service.js` | service | file-I/O | `backend/src/services/familyMember.service.js` | partial-match (service-module conventions transfer; no fs precedent exists) |
| `backend/src/config/photoStorage.js` | config | transform | `backend/src/config/env.js` | exact (same `__dirname`-relative resolution pattern) |
| `backend/migrations/manual/013-add-family-members-profile-picture.sql` | migration | batch | `backend/migrations/manual/012-add-users-family-member-id.sql` | exact |
| `backend/test/fixtures/images.js` | test (fixture) | transform | `backend/test/familyTreeFactory.js` | role-match (fixture-builder conventions) |
| `backend/src/routes/photo.upload.test.js` | test | request-response | `backend/src/resolvers/familyMember.editMember.test.js` (scope-check assertions) + `backend/src/server.cors.test.js` (raw-HTTP `httpClient()` supertest usage) | role-match |
| `backend/src/routes/photo.serve.test.js` | test | request-response | `backend/src/server.cors.test.js` | role-match |
| `backend/src/services/photoStorage.service.test.js` | test | file-I/O | `backend/src/services/familyMember.scope.test.js` | role-match |
| `backend/src/models/FamilyMember.js` (modified) | model | CRUD | itself (existing column list) | exact |
| `backend/src/schemas/familyMember.schema.js` (modified) | schema | transform | itself (existing SDL) | exact |
| `backend/src/resolvers/familyMember.resolver.js` (modified) | resolver | CRUD | itself, `linkedUser` computed-field resolver (lines 286-291) | exact |
| `backend/src/server.js` (modified) | config/bootstrap | request-response | itself | exact |
| `docker-compose.yml` (modified) | config | batch | itself, `mysql_data` volume precedent | exact |
| `.gitignore` (modified) | config | — | itself | exact |
| `frontend/src/components/manage/PhotoCropDialog.jsx` | component | request-response | `frontend/src/components/manage/EditMemberDialog.jsx` | exact (UI-SPEC mandates mirroring this file) |
| `frontend/src/components/manage/MemberAvatarImage.jsx` | component | streaming (blob fetch) | `frontend/src/components/manage/MemberCard.jsx` (Avatar/placeholder styling only) | no strong analog — new blob-fetch pattern |
| `frontend/src/api/photoClient.js` | service/utility | request-response | `frontend/src/api/graphqlClient.js` | exact (same axios instance + Bearer interceptor pattern, new response type) |
| `frontend/src/components/manage/PhotoCropDialog.test.jsx` | test | — | `frontend/src/components/manage/EditMemberDialog.test.jsx` | role-match |
| `frontend/src/components/manage/MemberAvatarImage.test.jsx` | test | — | `frontend/src/components/manage/MemberCard.test.jsx` | role-match |
| `frontend/src/components/manage/MemberCard.jsx` (modified) | component | request-response | itself | exact |
| `frontend/src/pages/ManagePage.jsx` (modified) | page | request-response | itself, "Remove member?" `Dialog` block (lines 495-513) | exact |
| `frontend/src/components/manage/RelationshipGroupedPanel.jsx` (modified) | component | transform (display-only) | itself | exact |
| `frontend/src/components/manage/AdminMemberTable.jsx` (modified) | component | transform (display-only) | itself | exact |
| `frontend/vite.config.js` (modified) | config | — | itself (existing `/graphql` proxy rule) | exact |

---

## Pattern Assignments

### `backend/src/routes/photo.routes.js` (route, file-I/O + request-response)

**Analogs:** `backend/src/server.js` (mounting shape) + `backend/src/resolvers/familyMember.resolver.js` (auth/scope pattern) + `backend/src/utils/auth.js` (`getUserFromRequest`)

**Mounting pattern to copy** — `backend/src/server.js` lines 30-41 shows the exact style: a plain `app.use('/path', middleware..., handler)` call sitting alongside the Apollo mount, with `context`-style injection done inline (no framework DI). The new routes must be `Router()`-based or plain `app.get`/`app.post` calls added the same way, mounted **after** `await initializeDatabase()`:
```javascript
// backend/src/server.js:30-41 (existing GraphQL mount — mirror this shape,
// NOT this middleware, for the new /api/family-members/:id/photo routes)
app.use(
  '/graphql',
  express.json(),
  expressMiddleware(apollo, {
    context: async ({ req }) => ({
      models,
      user: await getUserFromRequest(req, models),
      clientIp: req.ip,
      loaders: createLoaders(models)
    })
  })
);
```

**Auth + scope-check pattern to copy** — `backend/src/resolvers/familyMember.resolver.js` lines 44-55 (`addParent`) is the canonical non-admin scope-check shape every mutation in this codebase repeats verbatim; the upload route's authorization gate must follow the identical shape (`requireFamilyAccess` then `computeEditableScope(...).ids.has(targetId)`), just moved from a resolver body into an Express handler:
```javascript
// backend/src/resolvers/familyMember.resolver.js:44-55
addParent: async (_parent, { memberId, role, newMember }, { models, user }) => {
  requireFamilyAccess(user);

  const targetId = Number(memberId);
  const isAdmin = user.role === 'ADMIN';

  if (!isAdmin) {
    const scope = await computeEditableScope(user.familyMemberId);
    if (!scope.ids.has(targetId)) {
      throw new Error('This member is outside your editable scope.');
    }
  }
  // ...
```
Translate `throw new Error(...)` → `res.status(403).json({ error: ... })` since this is a plain Express handler, not a GraphQL resolver (GraphQL errors auto-serialize; Express does not).

**JWT verification reuse** — `backend/src/utils/auth.js` lines 9-32 (`getUserFromRequest`) and lines 34-36 (`requireAuth`) are called directly, unchanged, exactly as RESEARCH.md's Pattern 1 shows. Do not duplicate token-parsing logic in the new route file.

**Error handling convention:** this codebase throws plain `Error` objects and expects the caller (Apollo, or here, an explicit `try/catch`) to translate them. In a plain Express route, wrap the async handler body in `try { ... } catch (err) { next(err); }` — there is no existing Express error-handling middleware in this codebase (only Apollo's own error formatting), so the multer 4-arg error handler from RESEARCH.md's Pattern 2 is genuinely new plumbing, not a reuse.

---

### `backend/src/services/photoStorage.service.js` (service, file-I/O)

**Analog:** `backend/src/services/familyMember.service.js` — role-match only; this codebase has no existing file-I/O service.

**Module-shape pattern to copy** — named-export functions, JSDoc-free but comment-annotated with the *why* (see `computeEditableScope`'s inline comments at lines 173-179 and `addChild`'s at lines 112-122), and a transaction-passthrough convention: **when a `transaction` is supplied by the caller, run directly against it; only open a fresh `sequelize.transaction(...)` when none is supplied** (never nest):
```javascript
// backend/src/services/familyMember.service.js:143-152 (setSpouse) — the
// exact "caller-supplied transaction vs open-one-here" convention to mirror
// for photoStorage's own write/unlink sequencing
export async function setSpouse(memberAId, memberBId, { transaction } = {}) {
  if (transaction) {
    return createOrFindSpouseRow(memberAId, memberBId, transaction);
  }
  return sequelize.transaction((t) => createOrFindSpouseRow(memberAId, memberBId, t));
}
```
Apply this same discipline to the write-then-DB-update-then-unlink-old-file sequence Pitfall 3 in RESEARCH.md describes (write new file → DB update in a transaction → unlink old file only after commit → delete the just-written new file if the DB update fails).

**No existing analog for:** `fs.writeFile`/`fs.unlink` error handling, `ENOENT` swallowing on delete, or magic-byte validation — these have zero codebase precedent; follow RESEARCH.md's Pattern 2 and Pitfall 3 directly.

---

### `backend/src/config/photoStorage.js` (config, transform)

**Analog:** `backend/src/config/env.js`

**`__dirname`-relative path resolution pattern to copy** (lines 1-10):
```javascript
// backend/src/config/env.js:1-10
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
// ...
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultEnvPath = path.resolve(__dirname, '../../../env/local.env');
```
The new `photoStorage.js` config must resolve its storage directory the same way — via `path.resolve(__dirname, ...)` from this module's own location — never via `process.cwd()` (RESEARCH.md's explicit warning, since the same relative path must resolve correctly whether launched by `npm start`, `nodemon`, or the Docker `CMD`).

**Module export shape to copy** — a plain exported config object, same as `env.js`'s `export const env = { ... }` (lines 19-45); e.g. `export const photoStorageConfig = { photosDir: path.resolve(__dirname, '../../storage/photos') }`.

---

### `backend/migrations/manual/013-add-family-members-profile-picture.sql` (migration, batch)

**Analog:** `backend/migrations/manual/012-add-users-family-member-id.sql` — exact precedent, mirror the header-comment convention and the fact that this is simpler (no UNIQUE/FK needed):
```sql
-- backend/migrations/manual/012-add-users-family-member-id.sql (full file, 23 lines)
-- Manual, one-time migration (Phase 13 / ACC-05).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the users.familyMemberId column to exist.
-- ...
ALTER TABLE users ADD COLUMN familyMemberId INT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE users ADD CONSTRAINT users_familyMemberId_unique UNIQUE (familyMemberId);
ALTER TABLE users ADD CONSTRAINT users_familyMemberId_fk FOREIGN KEY (familyMemberId) REFERENCES family_members(id) ON DELETE SET NULL ON UPDATE CASCADE;
```
The new 013 migration needs only:
```sql
ALTER TABLE family_members ADD COLUMN profilePicture VARCHAR(255) NULL DEFAULT NULL;
```
Same header-comment convention explaining *why* this is manual (sync() never alters existing tables) and *what* the nullable-no-backfill semantics mean (every existing member starts with no photo, matching D-10's placeholder default).

---

### `backend/test/fixtures/images.js` (test fixture)

**Analog:** `backend/test/familyTreeFactory.js` — role-match for "small, documented, reusable test-data builder module under `backend/test/`", though this new file exports raw byte buffers instead of Sequelize rows.

**Convention to copy** — a doc-comment above each export explaining *what* it produces and *why* (see `familyTreeFactory.js` lines 10-27), and named exports rather than a default export or class. No existing binary-fixture precedent exists in this codebase — RESEARCH.md's Wave 0 Gaps calls for "a few real bytes each, not synthetic" JPEG/PNG/WebP buffers; source these from minimal real-world sample files, not hand-rolled byte arrays.

---

### `backend/src/routes/photo.upload.test.js` / `backend/src/routes/photo.serve.test.js` (integration tests)

**Analogs:** `backend/src/server.cors.test.js` (raw-HTTP-via-`httpClient()` shape) + `backend/src/resolvers/familyMember.editMember.test.js` (scope-check assertion shape) + `backend/test/helpers.js` (`httpClient()`, `resetTables`, `createTestUser`)

**Raw HTTP test pattern to copy** (full file, `backend/src/server.cors.test.js`):
```javascript
import { describe, it, expect } from 'vitest';
import { httpClient } from '../test/helpers.js';
import { env } from './config/env.js';

describe('CORS rejection over HTTP', () => {
  it('never echoes a rejected origin back to the client in the body or headers', async () => {
    const res = await httpClient()
      .post('/graphql')
      .set('Origin', 'https://evil.example')
      .send({ query: HEALTH_QUERY });
    // ...
  });
});
```
`httpClient()` (from `backend/test/helpers.js` lines 12-14, `return request(app)`) is the exact `supertest`-against-`app` helper the new tests reuse — the adversarial multipart tests use `.attach(field, buffer, { filename, contentType })` on the same `httpClient()` object, exactly as RESEARCH.md's Code Examples section already shows verbatim (path-traversal, mislabeled-content-type ×2, oversized-file vectors) — **write these before any happy-path test** (Success Criterion #3 / QUAL-01).

**Scope-check assertion pattern to copy** — `familyMember.editMember.test.js` lines 110-134 (`rejects an id outside the actor editable scope`) is the exact shape for the "outside scope" upload test: build a 3-generation tree, create an actor linked to the innermost node, assert the specific error message and that no state changed.

**Test-file boilerplate to copy** — `beforeEach(resetTables)` (from `backend/test/helpers.js` lines 28-39) at the top of the describe block, `createTestUser({ role: 'USER', familyMemberId: ... })` for building scoped actors.

---

### `backend/src/services/photoStorage.service.test.js` (unit test)

**Analog:** `backend/src/services/familyMember.scope.test.js`

**Pattern to copy** — `beforeEach(resetTables)`, one `describe` block per function under test, one `it` per behavior with a comment tag referencing the requirement id (e.g. `// D-11` for orphan-cleanup), plain `expect(...).toBe(...)`/`toEqual(...)` assertions, no mocking framework in use anywhere in this suite — real Sequelize calls against the isolated test DB:
```javascript
// backend/src/services/familyMember.scope.test.js:1-9
import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { resetTables } from '../../test/helpers.js';
import { computeEditableScope } from './familyMember.service.js';

beforeEach(resetTables);

describe('computeEditableScope (PERM-05, REL-04)', () => {
  it('always includes self, even with no parents/spouse/children recorded', async () => {
    // ...
```
For `photoStorage.service.test.js`, this same shape applies to real filesystem writes/reads against a temp/test storage directory (not mocked) — follow the "real I/O against isolated state" philosophy this whole test suite already uses for the database.

---

### `backend/src/models/FamilyMember.js` (modified, model, CRUD)

**Analog:** itself — add the new column using the exact same `DataTypes` object-literal shape already used for every other nullable string field:
```javascript
// backend/src/models/FamilyMember.js:43-49 (phone/address — nearest sibling
// nullable-string fields to copy the shape from)
phone: {
  type: DataTypes.STRING,
  allowNull: true
},
address: {
  type: DataTypes.STRING,
  allowNull: true
},
```
Add `profilePicture: { type: DataTypes.STRING, allowNull: true }` in the same style. Remember: `sequelize.sync()` only creates this column on a fresh/test DB (Pitfall 4) — the 013 migration is the load-bearing change for any already-provisioned database.

---

### `backend/src/schemas/familyMember.schema.js` (modified, schema)

**Analog:** itself — add a `photoUrl: String` field to the `FamilyMember` SDL type (lines 13-31), following the exact style of the other nullable scalar fields (`email`, `phone`, `address`). Per RESEARCH.md's Open Question #2, `photoUrl` is a *computed* field (relative path like `/api/family-members/42/photo`), not the raw `profilePicture` column value — do not expose the stored filename/key directly in the schema.

---

### `backend/src/resolvers/familyMember.resolver.js` (modified, resolver)

**Analog:** itself — the `linkedUser` computed-field resolver (lines 286-291) is the exact shape for a derived, request-context-aware field resolver on the `FamilyMember` type map:
```javascript
// backend/src/resolvers/familyMember.resolver.js:286-291
linkedUser: async (member, _args, { user }) => {
  const linked = await member.getLinkedUser();
  if (!linked) return null;
  if (user?.role === 'ADMIN' || linked.id === user?.id) return linked;
  return null;
}
```
Add a sibling `photoUrl` field resolver in the same `FamilyMember: { ... }` object (lines 244-292) that derives the relative URL string from `member.profilePicture` (return `null` when no photo is stored), rather than a plain column passthrough.

---

### `frontend/src/components/manage/PhotoCropDialog.jsx` (new component, request-response)

**Analog:** `frontend/src/components/manage/EditMemberDialog.jsx` — UI-SPEC explicitly mandates mirroring this file's structure "exactly."

**Structure to copy** (full file shape, `EditMemberDialog.jsx`):
```javascript
// frontend/src/components/manage/EditMemberDialog.jsx:40-76 (component shell)
export default function EditMemberDialog({ open, member, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(formFromMember(member));
    setError('');
  }, [member, open]);

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await graphqlRequest(EDIT_MEMBER_MUTATION, { id: member.id, fields: form });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };
  // ...
  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit member</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {/* ... */}
          <Stack direction="row" spacing={2}>
            <Button variant="contained" disabled={disableSubmit} onClick={handleSubmit}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="text" disabled={submitting} onClick={handleClose}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
```
`PhotoCropDialog` reuses this `Dialog → DialogTitle → DialogContent → Stack(error Alert, content, action row)` shell verbatim, swapping the form fields for the `react-easy-crop` `<Cropper>` viewport + zoom `Slider` (per UI-SPEC's Interaction States table), and swapping `graphqlRequest(...)` for a `FormData`/multipart POST via axios (see `photoClient.js` below). Copy is also **non-dismissible while submitting** — a NEW behavior not present in `EditMemberDialog` (which has no submitting-blocks-close guard) but present in `ManagePage.jsx`'s delete-confirm dialog: `onClose={() => (deleting ? null : setDeleteTarget(null))}` (line 495) — copy that guard shape instead.

---

### `frontend/src/components/manage/MemberAvatarImage.jsx` (new component, streaming)

**No strong analog** — this is a genuinely new pattern (authenticated blob-fetch-to-`<img>`) with no precedent anywhere in the frontend. RESEARCH.md's Pattern 3 already provides a complete, concrete implementation to use directly:
```javascript
// RESEARCH.md Pattern 3 (full recommended implementation)
import { useEffect, useState } from 'react';
import { Avatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import graphqlClient from '../../api/graphqlClient.js';

export default function MemberAvatarImage({ member }) {
  const [objectUrl, setObjectUrl] = useState(null);
  useEffect(() => {
    if (!member.photoUrl) { setObjectUrl(null); return; }
    let currentUrl, cancelled = false;
    graphqlClient.get(member.photoUrl, { baseURL: '', responseType: 'blob' })
      .then((res) => { if (!cancelled) { currentUrl = URL.createObjectURL(res.data); setObjectUrl(currentUrl); } });
    return () => { cancelled = true; if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [member.photoUrl]);
  return (
    <Avatar src={objectUrl ?? undefined} sx={{ width: 42, height: 42 }}>
      {!objectUrl && <PersonIcon />}
    </Avatar>
  );
}
```
**Reuse only the styling values from `MemberCard.jsx`'s existing placeholder Avatar** (line 16: `sx={{ width: 42, height: 42, bgcolor: '#eef1f8', color: colors.slate }}`) — UI-SPEC requires `PersonRoundedIcon` (not the generic `Person` icon RESEARCH.md sketches, and not `getInitials`) on `#eef1f8`/`colors.slate`, plus a `<Skeleton variant="circular" width={42} height={42}>` fetching state per UI-SPEC's Interaction States table (a state RESEARCH.md's sketch omits — add it).

---

### `frontend/src/api/photoClient.js` (new service/utility, request-response)

**Analog:** `frontend/src/api/graphqlClient.js` — exact match for the axios-instance + Bearer-token-interceptor pattern.

**Auth-header-reuse pattern to copy** (full file):
```javascript
// frontend/src/api/graphqlClient.js:10-21
const graphqlClient = axios.create({
  baseURL: normalizeGraphqlUrl(import.meta.env.VITE_API_URL),
  headers: { 'Content-Type': 'application/json' }
});

graphqlClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```
The new upload/serve client needs the identical `localStorage.getItem('authToken')` → `Bearer` header interceptor, but a **separate axios instance** (or a second `baseURL: ''` call against the same instance, per RESEARCH.md's note) since it POSTs `multipart/form-data` (upload) and GETs with `responseType: 'blob'` (serve) rather than JSON GraphQL bodies. Error-handling convention to copy: `graphqlRequest`'s network-error special-case (lines 30-34) — "Network Error" is caught and re-thrown with an actionable message; apply the same to the photo client's request wrapper.

---

### `frontend/src/components/manage/MemberCard.jsx` (modified)

**Analog:** itself — the existing placeholder `Avatar` (line 16) is replaced by `MemberAvatarImage`, and a `ButtonBase`-wrapped click trigger is added around it per D-01/UI-SPEC's touch-target contract (`ButtonBase` with `minWidth: 44, minHeight: 44`, `borderRadius: '50%'`, hidden `<input type="file">`). The existing `locked` boolean pattern (line 12: `const locked = !isAdmin && !isSelf && member.linkedUser && member.linkedUser.id !== actingUserId`) is the precedent for the new "out of editable scope → avatar not interactive" gate — reuse the same boolean-composition style, do not invent a second lock-condition shape.

---

### `frontend/src/pages/ManagePage.jsx` (modified)

**Analog:** itself — the existing "Remove member?" confirm `Dialog` (lines 495-513) is the exact precedent UI-SPEC calls out for the new "Remove photo?" confirmation:
```javascript
// frontend/src/pages/ManagePage.jsx:495-513
<Dialog open={Boolean(deleteTarget)} onClose={() => (deleting ? null : setDeleteTarget(null))}>
  <DialogTitle>Remove member?</DialogTitle>
  <DialogContent>
    <Stack spacing={2} sx={{ pt: 1 }}>
      {deleteError && <Alert severity="error">{deleteError}</Alert>}
      <Typography>{`Remove ${deleteTarget?.fullname} from the family tree? ...`}</Typography>
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button variant="text" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
        <Button variant="contained" color="error" disabled={deleting} onClick={handleDeleteConfirm}>
          {deleting ? 'Removing…' : 'Remove'}
        </Button>
      </Stack>
    </Stack>
  </DialogContent>
</Dialog>
```
Copy this shape verbatim for "Remove photo?" — same non-dismissible-while-in-flight `onClose` guard, same Cancel-left/destructive-confirm-right action row, same `deleting`/`deleteError`-style local state naming convention (rename to `removingPhoto`/`removePhotoError` or similar). Both `AdminBranch` and `MemberBranch` need this dialog (the existing delete-confirm dialog only exists in `AdminBranch`) since remove-photo is available to non-admins within editable scope (D-11) — check whether `MemberBranch` needs its own copy or a shared component extraction.

---

### `frontend/src/components/manage/RelationshipGroupedPanel.jsx` / `AdminMemberTable.jsx` (modified, display-only)

**Analog:** each file itself — both currently render either `MemberCard` (which now internally uses `MemberAvatarImage`) or a text-only table row. `AdminMemberTable.jsx` has no avatar today (lines 62-73, plain `TableCell`s) — adding a photo thumbnail column, if desired, would need a new `MemberAvatarImage` cell; the UI-SPEC lists this file as "modified, display only" but does not mandate a specific new column, so treat any avatar addition here as optional/discretionary unless CONTEXT.md's downstream plan says otherwise.

---

### `frontend/vite.config.js` (modified)

**Analog:** itself — the existing `/graphql` proxy rule (lines 8-15) is the exact shape to duplicate for `/api`:
```javascript
// frontend/vite.config.js:6-17 (full file)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/graphql': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
```
Add a second `'/api': { target: proxyTarget, changeOrigin: true, secure: false }` entry, reusing the same `proxyTarget` constant (line 4) — per RESEARCH.md's Open Question #2 recommendation.

---

## Shared Patterns

### Server-side authorization (upload route)
**Source:** `backend/src/utils/auth.js` (`requireFamilyAccess`, lines 43-47) + `backend/src/services/familyMember.service.js` (`computeEditableScope`, lines 180-232)
**Apply to:** `backend/src/routes/photo.routes.js` (upload handler only — the serve handler uses `requireAuth` alone, no scope check, per D-07)
```javascript
// backend/src/utils/auth.js:34-47
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}
export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
Never re-derive scope-check logic inline — every Phase 14/15 mutation imports and calls `computeEditableScope`, and this route must do the same.

### JWT verification outside the Apollo context
**Source:** `backend/src/utils/auth.js` (`getUserFromRequest`, lines 9-32)
**Apply to:** both new routes (upload + serve) — call this function directly at the top of each handler, exactly as `server.js`'s Apollo `context` factory does (line 36), so auth semantics stay identical across GraphQL and the new plain routes.

### Axios instance + Bearer-token interceptor
**Source:** `frontend/src/api/graphqlClient.js` (lines 10-21)
**Apply to:** `frontend/src/api/photoClient.js` (new) — same `localStorage.getItem('authToken')` → `Authorization: Bearer` interceptor, applied to a client capable of multipart POST and blob GET.

### Dialog shell (Dialog → DialogTitle → DialogContent → Stack with error Alert + action row)
**Source:** `frontend/src/components/manage/EditMemberDialog.jsx` (full file) and `frontend/src/pages/ManagePage.jsx`'s delete-confirm `Dialog` (lines 495-513)
**Apply to:** `PhotoCropDialog.jsx` (new) and the new "Remove photo?" confirmation in `ManagePage.jsx`.

### Manual-ALTER migration for an already-provisioned database
**Source:** `backend/migrations/manual/012-add-users-family-member-id.sql`
**Apply to:** `backend/migrations/manual/013-add-family-members-profile-picture.sql` (new) — same header-comment convention explaining why `sequelize.sync()` cannot do this on a real deployed database, proven via the same `database.test.js`-style "boot-verify" integration test (see `backend/src/models/database.test.js` lines 28-47, the `familyMemberId link column (ACC-05)` describe block — the exact precedent for the new `profilePicture` round-trip test).

### Raw-HTTP integration test via `httpClient()`
**Source:** `backend/test/helpers.js` (`httpClient()`, lines 12-14) + `backend/src/server.cors.test.js` (usage pattern)
**Apply to:** `photo.upload.test.js`, `photo.serve.test.js` — both new routes are plain Express, not GraphQL, so tests must use `httpClient()` (supertest against `app`) rather than the `graphql()` helper used everywhere else in this suite.

### `crypto.randomUUID()` for server-generated identifiers
**Source:** `backend/src/utils/auth.js` (`crypto` import, line 2; used for `createResetToken`/`createVerificationToken`, lines 49-63)
**Apply to:** `backend/src/services/photoStorage.service.js` — filename generation (PHOTO-03). No new dependency needed; `node:crypto` is already imported elsewhere in this codebase for exactly this class of problem (server-generated, unguessable identifiers).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/services/photoStorage.service.js` (fs write/unlink/validate portion) | service | file-I/O | No file-system-writing code exists anywhere in this backend today — every prior service is pure-Sequelize/transaction logic. Use RESEARCH.md's Pattern 2 and Pitfall 3 as the primary source instead of a codebase analog. |
| `frontend/src/components/manage/MemberAvatarImage.jsx` | component | streaming (blob fetch) | No authenticated-`<img>`/blob-fetch pattern exists anywhere in the frontend — this app's only prior data-fetching pattern is JSON GraphQL via `graphqlRequest`. Use RESEARCH.md's Pattern 3 (already a complete, concrete implementation) as the primary source, adjusted per UI-SPEC's icon/skeleton requirements noted above. |

---

## Metadata

**Analog search scope:** `backend/src/{routes,services,config,models,schemas,resolvers,utils}`, `backend/migrations/manual/`, `backend/test/`, `frontend/src/{api,components/manage,pages}`, `docker-compose.yml`, `.gitignore`, `frontend/vite.config.js`
**Files scanned:** ~70 backend source/test files, ~30 frontend source/test files (via `find`), plus 5 targeted full reads of config/infra files
**Pattern extraction date:** 2026-07-24
