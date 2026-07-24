---
phase: 16-photo-upload
plan: 04
subsystem: api
tags: [multer, file-type, express, non-graphql-route, tdd, adversarial-testing, sequelize, vitest]

# Dependency graph
requires:
  - phase: 16-photo-upload
    plan: 16-01
    provides: photoStorageConfig, family_members.profilePicture column, real image byte fixtures
  - phase: 16-photo-upload
    plan: 16-02
    provides: photoStorage.service.js (generatePhotoFilename, writePhotoFile, finalizePhotoReplacement)
provides:
  - "POST /api/family-members/:id/photo — the app's first non-Apollo HTTP route"
  - "FamilyMember.photoUrl computed GraphQL field"
affects: [16-05, 16-06, 16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "non-GraphQL Express route mounted under app.use('/api', ...) with no express.json() (multipart body), living alongside the existing Apollo /graphql mount"
    - "adversarial-first TDD: 4 security-boundary tests (path-traversal, content-type x2, oversized-file) written and committed RED before any happy-path test existed in the same file"
    - "dedicated 4-arg multerErrorHandler mounted after the route, since MulterError bypasses the route handler's own try/catch (raised by middleware, not handler body)"

key-files:
  created:
    - backend/src/routes/photo.routes.js
    - backend/src/routes/photo.upload.test.js
  modified:
    - backend/src/server.js
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js

key-decisions:
  - "Task 1 (adversarial RED->GREEN) and Task 2 (happy-path/outside-scope/replace RED->GREEN, photoUrl field) executed as two separate RED->GREEN cycles, matching the plan's task boundary and preserving a clean git-log proof that the adversarial tests predate any happy-path test in the file"
  - "Task 1's GREEN implementation deliberately used the plan-specified naive DB write (generatePhotoFilename + writePhotoFile + FamilyMember.update) rather than jumping straight to finalizePhotoReplacement, so Task 2's replace test would genuinely RED (old file left orphaned) before the transaction-safe rework"
  - "outside-scope test (Task 2) passed immediately on first run rather than RED-failing, because the scope check it exercises was already implemented in Task 1's route handler (reused computeEditableScope verbatim, per T-16-11) — documented as expected, not a TDD violation, since it verifies pre-existing correct behavior rather than new functionality"

patterns-established:
  - "photo.routes.js is the template for any future non-GraphQL route: mounted after /graphql, no express.json(), imports models/sequelize directly from ../models/index.js (never req.app.locals)"

requirements-completed: [PHOTO-01, PHOTO-03, QUAL-01]

# Metrics
duration: 9min
completed: 2026-07-24
---

# Phase 16 Plan 04: Photo Upload Route Summary

**POST /api/family-members/:id/photo — the app's first non-GraphQL route, with magic-byte-only file-type sniffing (file-type/fileTypeFromBuffer), server-generated UUID filenames, transaction-safe orphan-free replace (finalizePhotoReplacement), and a computed FamilyMember.photoUrl field — adversarial tests (path-traversal, content-type spoofing x2, oversized file) written and GREEN before any happy-path test existed**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-24T20:29:00+02:00 (approx, base reset)
- **Completed:** 2026-07-24T20:38:41+02:00
- **Tasks:** 2 (both executed as their own TDD RED -> GREEN cycle)
- **Files created:** 2
- **Files modified:** 3

## Accomplishments
- `backend/src/routes/photo.routes.js` — the app's first non-Apollo HTTP route: `multer.memoryStorage()` with a 5 MB/1-file limit (D-04), `fileTypeFromBuffer` as the sole authority for accept/reject (never the multipart `Content-Type` header or client filename, D-06), `requireFamilyAccess`/`computeEditableScope` reused verbatim from Phase 14 (T-16-11, no new authz invented), and a dedicated 4-arg `multerErrorHandler` returning a clean 400 for oversized uploads instead of a 500 (Pitfall 2)
- `backend/src/routes/photo.upload.test.js` — 7 tests: 4 adversarial (path-traversal filename never reaches the stored value, mislabeled-malicious rejected 400, mislabeled-real accepted 200 purely on magic bytes, oversized file rejected 400) proven RED (404, route absent) before GREEN, then happy path + outside-scope + replace
- `FamilyMember.photoUrl: String` added to the GraphQL SDL and as a computed resolver field (`profilePicture ? /api/family-members/{id}/photo : null`) — the raw stored filename is never exposed to clients
- Route mounted in `server.js` via `app.use('/api', photoRouter)`, placed after the existing `/graphql` mount, with no `express.json()` on this path
- Transaction-safe replace: the route opens a `sequelize.transaction`, `findByPk`s the target, and calls `finalizePhotoReplacement` (16-02) so a replaced photo's old file is deleted only after the DB commit succeeds — no orphaned files, proven by a real-filesystem `fs.access` test
- Full backend suite: 308/308 green (301 prior + 7 new), no regressions

## Task Commits

Each task was committed as its own RED -> GREEN cycle:

1. **Task 1: adversarial vectors** - `d3562cf` (test, RED — 4 tests fail with 404) → `5a712e6` (feat, GREEN — route exists, all 4 pass)
2. **Task 2: happy path, outside-scope, replace, photoUrl field** - `5012b7f` (test, RED — happy path fails on missing `photoUrl` field, replace fails on orphaned file) → `2513ada` (feat, GREEN — schema/resolver + transaction-safe rework, all 7 pass)

_Confirmed via `git log`: `d3562cf` (adversarial RED) precedes `5a712e6` (adversarial GREEN) precedes `5012b7f` (happy-path RED) precedes `2513ada` (happy-path GREEN) — the adversarial tests were written and committed before any happy-path test existed anywhere in the file, satisfying Success Criterion #3._

## Files Created/Modified
- `backend/src/routes/photo.routes.js` - Express router: `POST /family-members/:id/photo`, multer memory storage, magic-byte sniff, scope check, transaction-safe replace, `multerErrorHandler`
- `backend/src/routes/photo.upload.test.js` - 7 tests (4 adversarial + happy path + outside-scope + replace)
- `backend/src/server.js` - imports and mounts `photoRouter` under `/api`, after `/graphql`, no `express.json()`
- `backend/src/schemas/familyMember.schema.js` - added `photoUrl: String` to the `FamilyMember` type
- `backend/src/resolvers/familyMember.resolver.js` - added `photoUrl` computed field resolver to the `FamilyMember` map

## Decisions Made
- Split the plan's single tdd="true" task-2 behavior set (happy path, outside-scope, replace, schema field) into one RED commit (all 3 new tests) and one GREEN commit (schema + resolver + route rework) — mirrors the 16-01/16-02 precedent of grouping tightly-coupled behaviors into one cycle when there's no meaningful intermediate passing state between them.
- Deliberately implemented Task 1's GREEN step with the plan-specified *naive* DB write (no transaction, no `finalizePhotoReplacement`) rather than jumping straight to the final transaction-safe version, so that Task 2's replace test would demonstrably fail (old file orphaned) before the rework — preserves the two-task RED/GREEN boundary the plan defines instead of collapsing both tasks' GREEN states into one.
- The outside-scope test (Task 2) passed on its very first run rather than RED-failing, because Task 1's route already reused `computeEditableScope` for the identical check. This is expected and documented, not a violation of the fail-fast unexpectedly-passing-test rule: that rule targets a test asserting NEW behavior that turns out to already exist unintentionally; here the test intentionally documents pre-existing, correctly-implemented Task 1 behavior as explicit regression coverage.
- Fixed a self-authored acceptance-criteria failure during Task 1: the file's own explanatory comments initially contained the literal substring `req.file.originalname` (in prose, not code), which the plan's `grep -c "req.file.originalname" ... returns 0` acceptance check would have failed. Reworded both comments to describe the same constraint without using that literal token.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded explanatory comments to satisfy the zero-match `req.file.originalname` grep**
- **Found during:** Task 1 GREEN step, immediately after writing `photo.routes.js`
- **Issue:** Two comments describing the "client filename is never trusted" security property literally contained the string `req.file.originalname`, which would make `grep -c "req.file.originalname" backend/src/routes/photo.routes.js` return `2`, failing the plan's explicit acceptance criterion (which exists as a proxy for "the client-supplied filename is never read").
- **Fix:** Reworded both comments to convey the identical constraint ("the client-supplied upload filename is never trusted/read") without using the literal grepped string.
- **Files modified:** `backend/src/routes/photo.routes.js`
- **Verification:** `grep -c "req.file.originalname" backend/src/routes/photo.routes.js` returns `0`; full test suite re-run confirmed still green.
- **Committed in:** `5a712e6` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (grep-compliance comment rewording, no behavior change)
**Impact on plan:** None on functionality — purely a wording fix to satisfy a textual acceptance check; the underlying security property (server-generated filenames only) was already correctly implemented in the code, not just the comments.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `POST /api/family-members/:id/photo` and `FamilyMember.photoUrl` are live, tested, and ready for 16-05 (photo serving/delete route) and 16-06/16-07 (frontend crop/upload UI) to build against.
- `photo.routes.js` establishes the pattern for 16-05's serving route: import `models`/`sequelize` directly, reuse `requireFamilyAccess`/`computeEditableScope` for any write path, and mount under the same `/api` router without `express.json()`.
- No blockers identified for 16-05 onward.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files verified present on disk; all commits verified present in git log:
- `backend/src/routes/photo.routes.js` — created, confirmed present
- `backend/src/routes/photo.upload.test.js` — created, confirmed present
- `backend/src/server.js` — modified, confirmed present
- `backend/src/schemas/familyMember.schema.js` — modified, confirmed present
- `backend/src/resolvers/familyMember.resolver.js` — modified, confirmed present
- `d3562cf` (Task 1 RED) — FOUND
- `5a712e6` (Task 1 GREEN) — FOUND
- `5012b7f` (Task 2 RED) — FOUND
- `2513ada` (Task 2 GREEN) — FOUND
