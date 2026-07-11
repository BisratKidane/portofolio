---
phase: 03-backend-integration-tests
plan: 02
subsystem: testing
tags: [vitest, apollo-server, graphql, jwt, integration-testing, access-control]

# Dependency graph
requires:
  - phase: 03-backend-integration-tests
    plan: 01
    provides: "graphql()/resetTables()/createTestUser() helper contract in backend/test/helpers.js"
provides:
  - "login mutation integration spec (BE-05): valid-JWT issuance, wrong-password rejection, unknown-email rejection with an identical anti-enumeration message"
  - "dashboard/me query integration spec (BE-06): ADMIN vs USER dashboard access-control behavior, unauthenticated rejection, and me's authenticated/unauthenticated shapes"
affects: [03-03, "any future phase touching login/dashboard/me resolvers or requireAuth"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context injection for role-gated queries: createTestUser({ role: 'ADMIN' | 'USER' }) passed directly as graphql()'s user arg, bypassing the register mutation's first-user-ADMIN order dependence entirely"
    - "Reused the graphql()/resetTables()/createTestUser() contract from Plan 03-01 with zero changes to backend/test/helpers.js"

key-files:
  created:
    - backend/src/resolvers/login.test.js
    - backend/src/resolvers/dashboard.test.js
  modified: []

key-decisions:
  - "Asserted the exact 'You must be logged in to perform this action.' string by reading it directly from backend/src/utils/auth.js rather than assuming it matched register/login's phrasing, per the plan's explicit instruction (D-11)"
  - "me's unauthenticated case asserts data.me === null with errors undefined (not an errors array), reflecting that me has no requireAuth guard unlike dashboard"

patterns-established:
  - "Role-gated resolver specs create the context user directly via createTestUser({ role }) instead of going through register, to control ADMIN/USER deterministically without depending on table insertion order"

requirements-completed: [BE-05, BE-06]

# Metrics
duration: 2min
completed: 2026-07-12
---

# Phase 3 Plan 2: Login and Dashboard/Me Integration Tests Summary

**Added login mutation and dashboard/me query integration specs, pinning the JWT-issuance contract, the anti-enumeration login rejection message, and ADMIN/USER dashboard access-control behavior via direct role-injected context users.**

## Performance

- **Duration:** ~2 min (2026-07-11T23:45:21Z - 2026-07-11T23:46:34Z, wall clock includes read/verify time)
- **Started:** 2026-07-12T01:45:21+02:00
- **Completed:** 2026-07-12T01:46:34+02:00
- **Tasks:** 2 completed
- **Files modified:** 2 (0 modified, 2 created)

## Accomplishments
- `backend/src/resolvers/login.test.js` delivers 3 passing tests: valid credentials issue a JWT that `jwt.verify` accepts with matching `sub`/`role` claims; wrong password and unknown email both reject with the identical `'Invalid email or password.'` message (no account-enumeration signal)
- `backend/src/resolvers/dashboard.test.js` delivers 5 passing tests: ADMIN dashboard returns a populated `users` array with the admin-specific message; USER dashboard returns `users: null` with the user-specific message; unauthenticated dashboard rejects with the exact `requireAuth` message; `me` returns the authenticated user's fields; `me` returns `null` (no error) when unauthenticated
- Full backend suite remains green: 37/37 tests across 8 files (up from 29/29 across 6 files pre-plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write login mutation integration tests (BE-05)** - `acc2114` (test)
2. **Task 2: Write dashboard/me query integration tests (BE-06)** - `d419bad` (test)

**Plan metadata:** committed separately after this summary is written.

## Files Created/Modified
- `backend/src/resolvers/login.test.js` - new integration spec, 3 tests covering login's JWT-issuance and negative-credential paths
- `backend/src/resolvers/dashboard.test.js` - new integration spec, 5 tests covering ADMIN/USER dashboard access control, unauthenticated rejection, and `me`'s authenticated/unauthenticated shapes

## Decisions Made
- Read `requireAuth`'s exact rejection string directly from `backend/src/utils/auth.js` before asserting it, per the plan's explicit caution not to assume it matched register/login's phrasing (D-11)
- Used `createTestUser({ role: 'ADMIN' | 'USER' })` injected directly as the `graphql()` context user for dashboard specs, deterministically controlling role without depending on the first-user-ADMIN registration order quirk (D-06)

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (targeted Vitest runs) passed on the first attempt with no auto-fixes required.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BE-05 and BE-06 are fully satisfied; the full backend suite (37/37) is green including Phase 1/2 tests, `register.test.js` (03-01), `login.test.js`, and `dashboard.test.js` (this plan)
- The `graphql()`/`createTestUser({ role })` context-injection pattern is proven for role-gated resolvers and is ready for Wave 2's remaining plan (03-03, requestPasswordReset/resetPassword, BE-07) to reuse
- No blockers.

---
*Phase: 03-backend-integration-tests*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created files and task commit hashes verified to exist:
- `backend/src/resolvers/login.test.js` — FOUND
- `backend/src/resolvers/dashboard.test.js` — FOUND
- `acc2114` (Task 1) — FOUND
- `d419bad` (Task 2) — FOUND
