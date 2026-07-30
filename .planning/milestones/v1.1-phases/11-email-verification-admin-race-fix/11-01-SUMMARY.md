---
phase: 11-email-verification-admin-race-fix
plan: 01
subsystem: auth
tags: [sequelize, jwt, email-verification, tdd]

# Dependency graph
requires:
  - phase: 09-session-revocation
    provides: passwordChangedAt-based JWT revocation in getUserFromRequest, the insertion point this plan's gate is chained after
provides:
  - emailVerified/emailVerificationToken/emailVerificationExpiresAt columns on the User model
  - createVerificationToken/hashVerificationToken/verificationTokenExpiry helpers mirroring the reset-token helpers
  - Central getUserFromRequest gate silently rejecting any authenticated request whose user has emailVerified=false
  - createTestUser() defaulting to emailVerified: true so the rest of the backend suite stays green
affects: [11-02, 11-03, 11-04, 11-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token helper trio (create/hash/expiry) cloned verbatim from the reset-token pattern for a new token type"
    - "Central auth gate: additional silent-return-null checks appended inside getUserFromRequest after the passwordChangedAt check, before the final return user"

key-files:
  created: []
  modified:
    - backend/src/models/User.js
    - backend/src/models/User.test.js
    - backend/src/utils/auth.js
    - backend/src/utils/auth.test.js
    - backend/test/helpers.js

key-decisions:
  - "createTestUser() defaults emailVerified: true (placed before the ...overrides spread) so pre-existing seeded test users remain authenticate-able; tests needing an unverified fixture override explicitly"
  - "Central gate placed after the passwordChangedAt revocation check and before return user, preserving the file's silent-degrade-to-null convention (no throw)"

patterns-established:
  - "New token types are added to auth.js as a create/hash/expiry trio, exported alongside the existing reset-token trio"

requirements-completed: [VERIFY-01, VERIFY-05, VERIFY-06]

# Metrics
duration: 13min
completed: 2026-07-20
---

# Phase 11 Plan 01: Email Verification Data Layer & Central Auth Gate Summary

**Added emailVerified/emailVerificationToken/emailVerificationExpiresAt columns to User, cloned the reset-token helper trio for verification tokens, and inserted a central `getUserFromRequest` gate that silently rejects any authenticated request whose user is unverified — full backend suite green (105 tests).**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-20T21:38:19+02:00 (first task commit)
- **Completed:** 2026-07-20T21:51:27+02:00
- **Tasks:** 3 completed
- **Files modified:** 5

## Accomplishments
- `User` model gained three new columns exactly matching the plan's shapes: `emailVerified` (BOOLEAN, `allowNull: false`, `defaultValue: false`), `emailVerificationToken` (nullable STRING), `emailVerificationExpiresAt` (nullable DATE)
- `auth.js` gained `createVerificationToken()`, `hashVerificationToken(token)`, `verificationTokenExpiry()` — structurally identical to the existing `createResetToken`/`hashResetToken`/`resetTokenExpiry` helpers
- `getUserFromRequest` now has a central `if (!user.emailVerified) return null;` gate, inserted after the `passwordChangedAt` revocation check and before `return user` — every protected resolver inherits this transitively via `requireAuth`
- `createTestUser()` now defaults to `emailVerified: true` (with an explicit override path preserved), keeping the rest of the backend suite green against the new restrictive column default

## Task Commits

Each task was committed atomically (RED → GREEN per TDD task):

1. **Task 1: emailVerified/emailVerificationToken/emailVerificationExpiresAt columns (VERIFY-01)**
   - `e878ec6` test(11-01): add failing test for email verification columns
   - `f2dbb0b` feat(11-01): add email verification columns to User model (VERIFY-01)
2. **Task 2: verification token helpers + central emailVerified gate (VERIFY-05, VERIFY-06, D-07/D-08)**
   - `dceb09e` test(11-01): add failing tests for verification token helpers and email gate
   - `bf70194` feat(11-01): add verification token helpers and central email-verification gate (VERIFY-05/06)
3. **Task 3: fix createTestUser() default so the rest of the suite stays green**
   - `66b7856` fix(11-01): default createTestUser() to emailVerified: true

_TDD tasks each produced a test(RED) commit followed by a feat(GREEN) commit, confirmed failing then passing before commit._

## Files Created/Modified
- `backend/src/models/User.js` - Added the three new columns after `passwordChangedAt`
- `backend/src/models/User.test.js` - Added a describe block proving default-false-on-build and nullable-without-default for the two token/expiry columns
- `backend/src/utils/auth.js` - Added `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry`; inserted the central `emailVerified` gate in `getUserFromRequest`
- `backend/src/utils/auth.test.js` - Added 4 new token-helper tests, a new positive/negative describe block for the gate (VERIFY-05 Tests 5/6), and updated 3 pre-existing `findByPk` stub returns to include `emailVerified: true` so they keep representing already-verified accounts
- `backend/test/helpers.js` - `createTestUser()` now defaults `emailVerified: true`, positioned before the `...overrides` spread

## Decisions Made
- `createTestUser()`'s `emailVerified: true` default sits before `...overrides` so any test needing an unverified fixture can still override it explicitly (e.g. `createTestUser({ emailVerified: false })`) — avoids touching dozens of unrelated test files.
- The gate was added as a single extra guard clause rather than a new hook/middleware, matching the file's existing pattern of sequential silent-return-null checks inside `getUserFromRequest`.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` steps precisely; no Rule 1-4 fixes were needed beyond what the plan itself specified.

## Issues Encountered

**Full-suite flakiness caused by a shared MySQL test database across parallel worktree agents (environmental, not a code defect).** This worktree runs alongside sibling worktree agents (`agent-ac3d95b4140c3ffe2`, `agent-ad532501e57f9359f`) executing other plans in the same wave, all pointed at the same physical docker-compose MySQL container (`env/test.env`'s `DB_HOST=127.0.0.1:3306` is not per-worktree isolated). Each full `npm test` run's `globalSetup` does `sequelize.sync({ force: true, match: /_test$/ })`, dropping and recreating tables — when two agents' test runs overlap, one agent's drop/recreate cycle can hit mid-query in another agent's run, producing transient `Unknown column` or `SequelizeDatabaseError` failures, plus timing-sensitive race-condition tests (`rateLimit.test.js` RATE-02, `resetPassword.test.js` WR-02, `sessionRevocation.test.js`) occasionally flipping under the added DB load. None of the affected files are in this plan's `files_modified` list. Verified the fix is correct by: (1) running the three task-owned test files in isolation — all green; (2) running the full 105-test suite to completion with zero competing `vitest` processes present (confirmed via `pgrep`) — 105/105 passed cleanly. This is a pre-existing shared-infrastructure limitation of running multiple worktree agents against one docker-compose MySQL instance, out of this task's scope per the deviation rules' scope boundary (not caused by this plan's changes, not touched).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 11-02 through 11-05 (register/login/verifyEmail/resendVerificationEmail resolvers, migration) can now consume: the three `User` columns, the verification-token helper trio, and rely on `getUserFromRequest` already rejecting unverified sessions.
- `createTestUser()`'s new default means any future test needing an explicitly unverified fixture must pass `{ emailVerified: false }`.
- No blockers. Full backend suite (105 tests) is green when run without competing parallel-worktree DB load; recommend the orchestrator serialize (or isolate) full-suite runs across parallel wave agents sharing the same docker-compose MySQL instance to avoid this class of transient flake in future waves.

---
*Phase: 11-email-verification-admin-race-fix*
*Completed: 2026-07-20*
