---
phase: 16-photo-upload
plan: 05
subsystem: api
tags: [express, non-graphql-route, tdd, sequelize, vitest, authz-asymmetry]

# Dependency graph
requires:
  - phase: 16-photo-upload
    plan: 16-02
    provides: photoStorage.service.js (deletePhotoFile, resolvePhotoPath)
  - phase: 16-photo-upload
    plan: 16-04
    provides: photo.routes.js (photoRouter, upload authz shape) — the file this plan extends
provides:
  - "DELETE /api/family-members/:id/photo — scope-gated remove (D-11)"
  - "GET /api/family-members/:id/photo — any-valid-JWT serve, no scope check (D-07)"
affects: [16-06, 16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-07/D-08 authz asymmetry made structurally explicit in one file: write handlers (upload/remove) call computeEditableScope, the view handler (serve) never does — verified by a scoped grep over just the serve handler's body, not the whole file"
    - "thrown-Error-to-HTTP-status mapping done locally per non-GraphQL handler (no shared error middleware exists yet on this router) — requireAuth's Error is caught and mapped to 401 inline in serveHandler"

key-files:
  created:
    - backend/src/routes/photo.remove.test.js
    - backend/src/routes/photo.serve.test.js
  modified:
    - backend/src/routes/photo.routes.js

key-decisions:
  - "Task 1 (DELETE) and Task 2 (GET) executed as two separate RED->GREEN cycles per the plan's task boundary, each its own atomic test-then-implementation commit pair"
  - "Added a 404 'Family member not found' branch to the DELETE handler (not explicitly listed in the plan's 3 behaviors) since target could otherwise be null and target.profilePicture would throw — a Rule 1/2 correctness fix, not a new product behavior, and not exercised by any acceptance-criteria grep"
  - "requireAuth's thrown Error is caught and mapped to 401 directly inside serveHandler rather than relying on next(err), because no downstream error-status middleware exists on this router (confirmed empirically: an uncaught throw here produces a 500, not the required 401) — scoped strictly to the new GET handler, no changes to the existing POST/DELETE handlers' error flow"

patterns-established:
  - "Any future non-GraphQL route handler that needs a specific HTTP status for a thrown auth error must catch and map it locally, since this router has no shared 4xx-mapping middleware (only multerErrorHandler, which is upload-specific)"

requirements-completed: [PHOTO-01, PHOTO-02, QUAL-01]

# Metrics
duration: 9min
completed: 2026-07-24
---

# Phase 16 Plan 05: Photo Remove & Serve Routes Summary

**DELETE (scope-gated, idempotent, D-11) and GET (any-valid-JWT, deliberately no scope check, D-07) added to the existing photo.routes.js — the serve handler is the one place in this phase structurally incapable of an editable-scope check, verified by a grep scoped to just that handler's body**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-24T20:50:00+02:00 (approx, first RED commit)
- **Completed:** 2026-07-24T21:00:11+02:00
- **Tasks:** 2 (each its own TDD RED -> GREEN cycle)
- **Files created:** 2
- **Files modified:** 1

## Accomplishments
- `DELETE /api/family-members/:id/photo` — reuses the exact `getUserFromRequest` -> `requireFamilyAccess` -> non-admin `computeEditableScope(...).ids.has(...)` shape from the upload route verbatim; deletes the stored file via `deletePhotoFile` (already ENOENT-safe from 16-02) then clears `profilePicture`; idempotent `200 { photoUrl: null }` whether or not a photo existed; `403` with the exact scope-error message for outside-scope actors, photo/file left untouched
- `GET /api/family-members/:id/photo` — gated by `requireAuth` only, with `computeEditableScope` structurally absent from the handler body (confirmed via a grep scoped to just the `photoRouter.get(...)` block, not the whole file, since the module-level import and other handlers still reference it); serves the real stored file via `resolvePhotoPath` + `res.sendFile`, `Content-Type` derived from the stored file's actual extension; `401` with the exact `requireAuth` message for missing/invalid JWT; `404 { error: 'This member has no photo.' }` for both no-photo and member-not-found
- 7 new tests (3 remove, 4 serve), all RED-before-GREEN proven live: remove tests failed with 404 (route absent) before implementation, serve tests failed with 404/500/undefined-body before implementation
- Full backend suite: 315/315 green (308 prior + 7 new), no regressions

## Task Commits

Each task was committed as its own RED -> GREEN cycle:

1. **Task 1: DELETE (remove, D-11)** - `31ccc5b` (test, RED — 3 tests fail with 404) → `e0bb0b7` (feat, GREEN — route exists, all 3 pass)
2. **Task 2: GET (serve, D-07) + full suite gate** - `97a9a3b` (test, RED — 4 tests fail: 3x 404, 1x 500-not-401) → `bed6ce2` (feat, GREEN — route exists, all 4 pass, full backend suite 315/315)

_Confirmed via `git log`: `31ccc5b` precedes `e0bb0b7` precedes `97a9a3b` precedes `bed6ce2` — each task's test commit predates its own implementation commit._

## Files Created/Modified
- `backend/src/routes/photo.routes.js` - added `photoRouter.delete(...)` (removeHandler) and `photoRouter.get(...)` (serveHandler) to the existing `Router()` instance
- `backend/src/routes/photo.remove.test.js` - 3 tests: in-scope remove (file deleted, profilePicture nulled), outside-scope 403 (unchanged), idempotent no-photo no-op
- `backend/src/routes/photo.serve.test.js` - 4 tests: any-valid-JWT serves regardless of scope (byte-exact body + Content-Type match), missing/invalid JWT 401, no-photo 404, member-not-found 404

## Decisions Made
- Split the plan's two verbs into two separate RED -> GREEN cycles (one per task), matching the plan's explicit task boundary — no shared red/green state between DELETE and GET since they're independent handlers with no behavioral overlap.
- Added a `404 'Family member not found.'` branch to the DELETE handler's `findByPk` result that the plan's 3 listed behaviors didn't explicitly call out — without it, an in-scope actor referencing a nonexistent member ID would crash on `target.profilePicture` (TypeError on null). This is a Rule 1/2 correctness fix (missing null-safety), not a new product behavior; it isn't exercised by any acceptance-criteria grep and required no test changes.
- Discovered during Task 2 GREEN that this router has no shared error-status-mapping middleware: an uncaught `requireAuth` throw propagating via `next(err)` reaches Express's default handler and returns `500`, not the plan-required `401`. Fixed by catching and mapping the auth error to `401` directly inside `serveHandler` — scoped strictly to this new handler, no change to the existing POST/DELETE handlers' error flow (neither is tested for a missing-JWT 401 by this plan or 16-04's).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `requireAuth` throw was reaching Express's default 500 handler instead of the required 401**
- **Found during:** Task 2 GREEN step, first test run after adding the naive `requireAuth(user)` call (no local catch)
- **Issue:** `photo.routes.js`'s router has no shared 4xx-mapping error middleware (only `multerErrorHandler`, which only recognizes `MulterError`). A bare `requireAuth(user)` call inside the outer `try/catch(err) { next(err) }` propagated the thrown `Error('You must be logged in to perform this action.')` to Express's default error handler, which returns `500`, failing the plan's explicit `401` acceptance criterion.
- **Fix:** Wrapped `requireAuth(user)` in its own local `try/catch` inside `serveHandler` and mapped the caught error directly to `res.status(401).json({ error: authErr.message })`.
- **Files modified:** `backend/src/routes/photo.routes.js`
- **Verification:** `photo.serve.test.js`'s missing/invalid-JWT test now passes (401, exact message); full backend suite re-run confirmed still green.
- **Committed in:** `bed6ce2` (Task 2 GREEN commit)

**2. [Rule 1/2 - Bug/Missing functionality] Added a member-not-found 404 to the DELETE handler**
- **Found during:** Task 1 GREEN step, while implementing `removeHandler`
- **Issue:** The plan's 3 listed behaviors only cover existing members (with/without a photo); an in-scope actor targeting a nonexistent member ID would hit `target.profilePicture` on a `null` `target`, throwing a `TypeError` that would surface as a 500.
- **Fix:** Added `if (!target) return res.status(404).json({ error: 'Family member not found.' });` before accessing `target.profilePicture`.
- **Files modified:** `backend/src/routes/photo.routes.js`
- **Verification:** No test exercises this path directly (out of the plan's 3 listed behaviors), but the existing 3 tests all still pass and the fix eliminates a latent crash.
- **Committed in:** `e0bb0b7` (Task 1 GREEN commit)

### Textual Acceptance-Criteria Mismatch (non-functional, documented not fixed)

**3. Acceptance criterion `photo.routes.js contains "router.delete("` does not literally match**
- **Found during:** Task 1 GREEN step, running the plan's acceptance-criteria greps
- **Issue:** The plan's frontmatter/acceptance-criteria text assumes a `Router()` instance named `router`, but 16-04 (this plan's dependency, already shipped) named it `photoRouter`. The actual code is `photoRouter.delete(...)`, which does not contain the literal lowercase substring `router.delete(` (it contains `Router.delete(` — different case, part of the `photoRouter` identifier).
- **Fix:** Not fixed — renaming the shared `photoRouter` variable to `router` would be a disruptive, out-of-scope change to already-shipped 16-04 code for a purely textual proxy check. The underlying functional requirement (a DELETE route registered on the same Router instance, calling `deletePhotoFile`) is fully satisfied and verified by 3 passing tests plus the full 315/315 backend suite.
- **Impact:** None on functionality. Documented here per the precedent set in 16-04's SUMMARY for identical textual-proxy mismatches.

---

**Total deviations:** 2 auto-fixed (401 mapping bug, member-not-found null-safety), 1 documented-not-fixed (textual grep mismatch, no functional impact)
**Impact on plan:** None on functionality or scope — the 401 fix was required to meet the plan's own stated acceptance criterion; the null-safety fix closes a latent crash the plan's happy-path behaviors didn't anticipate; the grep mismatch is purely a proxy-check wording issue against a variable name established in a prior plan.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `photo.routes.js` now exposes all three verbs (`POST`/`DELETE`/`GET`) the frontend (16-06/16-07) needs: upload/replace, remove, and view — all reachable at the single `/api/family-members/:id/photo` path, differentiated by HTTP method.
- The D-07/D-08 authz asymmetry (write scope-gated, view any-valid-JWT) is now fully implemented and test-proven, ready for 16-06/16-07's frontend crop/upload UI to build against without any further backend authz work.
- No blockers identified for 16-06 onward.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*
