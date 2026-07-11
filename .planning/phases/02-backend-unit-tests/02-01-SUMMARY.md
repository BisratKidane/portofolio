---
phase: 02-backend-unit-tests
plan: 01
subsystem: testing
tags: [vitest, jwt, jsonwebtoken, auth, unit-test]

# Dependency graph
requires:
  - phase: 01-backend-test-tooling-test-database
    provides: Vitest runner, co-located *.test.js convention, env/test.env, globalSetup harness
provides:
  - Unit regression coverage for backend/src/utils/auth.js (signToken, getUserFromRequest, requireAuth, requireAdmin, createResetToken, resetTokenExpiry)
affects: [02-backend-unit-tests (User.test.js plan), 03-backend-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stub the models seam (models.User.findByPk) as a hand-rolled plain object, never vi.mock, matching auth.js's single-argument findByPk(id) call shape"
    - "Construct negative JWT cases deterministically: expiresIn:'-1s' for expiry, split-and-mutate the signature segment for tampering, a literal different secret string for wrong-secret — never vi.useFakeTimers or process.env.JWT_SECRET mutation"

key-files:
  created: [backend/src/utils/auth.test.js]
  modified: []

key-decisions:
  - "Followed plan's D-01/D-02/D-03/D-06/D-07 exactly: stub-based getUserFromRequest testing, deterministic negative-case construction, plain-object role-guard stubs, opportunistic reset-token coverage"

patterns-established:
  - "auth.test.js describe-block structure: signToken, getUserFromRequest, requireAuth, requireAdmin, createResetToken, resetTokenExpiry — one describe per exported function"

requirements-completed: [BE-01, BE-03]

# Metrics
duration: 6min
completed: 2026-07-12
---

# Phase 2 Plan 1: Backend Auth Utility Unit Tests Summary

**Unit regression suite for `backend/src/utils/auth.js` (JWT sign/verify, role guards, reset-token utilities) using plain Vitest and hand-rolled stubs — zero DB connection, zero application source changes.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-07-12
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Locked in `signToken`/`getUserFromRequest` sign-verify-reject behavior with 6 deterministic tests (valid token round-trip, missing header, expired token, tampered signature, wrong secret) — all via a hand-rolled `models.User.findByPk` stub, no DB
- Locked in the `requireAuth`/`requireAdmin` role-guard allow/deny matrix (ADMIN passes, USER throws, null/undefined throws)
- Added opportunistic coverage for `createResetToken` (64-hex-char format + uniqueness) and `resetTokenExpiry` (future Date within tolerance of `env.resetTokenExpiresMinutes`)
- Full file: 15 tests, all passing, `backend/src/utils/auth.js` unmodified (confirmed via empty git diff)

## Task Commits

Each task was committed atomically:

1. **Task 1: JWT sign/verify unit tests (BE-01)** - `284592b` (test)
2. **Task 2: Role guard + reset-token utility unit tests (BE-03, D-07)** - `a4c585a` (test)

**Plan metadata:** _pending — orchestrator commits after wave merge (worktree mode)_

_Note: Both tasks are characterization/regression tests over already-correct existing code (no application source under test was modified), so no separate RED/GREEN split applies — each task's tests were written and confirmed passing against the real, unmodified implementation in a single commit._

## Files Created/Modified
- `backend/src/utils/auth.test.js` - Unit tests for `signToken`, `getUserFromRequest`, `requireAuth`, `requireAdmin`, `createResetToken`, `resetTokenExpiry` (15 tests total, all passing)

## Decisions Made
None beyond the plan's own decisions (D-01 through D-08) — followed plan as specified:
- Stubbed `models.User.findByPk` as a hand-rolled plain object (not `vi.fn()`), matching the single-argument call shape (`findByPk(id)`) confirmed in research
- Constructed the expired token via `expiresIn: '-1s'` (no fake timers) and the wrong-secret case via a literal different secret string (no `process.env.JWT_SECRET` mutation)
- Asserted throw/no-throw behavior only for guards, no exact error-message assertions (per D-06 discretion, matching `backend/test/guard.test.js`'s existing convention)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `backend/src/utils/auth.test.js` is complete and green; BE-01 and BE-03 requirements are satisfied for this plan's scope.
- `backend/src/models/User.test.js` (BE-02, this phase's other plan) is unaffected by this work and can proceed independently — no shared state between the two spec files.
- No blockers for Phase 3 (backend integration tests), which can build on this unit-level confidence in `auth.js`'s token/role behavior.

---
*Phase: 02-backend-unit-tests*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: backend/src/utils/auth.test.js
- FOUND: .planning/phases/02-backend-unit-tests/02-01-SUMMARY.md
- FOUND: commit 284592b (Task 1)
- FOUND: commit a4c585a (Task 2)
