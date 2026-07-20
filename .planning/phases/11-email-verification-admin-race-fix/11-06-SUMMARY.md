---
phase: 11-email-verification-admin-race-fix
plan: 06
subsystem: auth
tags: [react, context, graphql, tdd, email-verification]

# Dependency graph
requires: []
provides:
  - "AuthContext.register resolves to { message } with zero session side-effects"
  - "AuthContext.verifyEmail(token) action that establishes a session identically to login"
affects: [11-07-register-verify-email-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Message-only mutation contract (mirrors ForgotPassword.jsx's requestPasswordReset { message } shape) applied to register"
    - "authenticate() helper reused for any session-establishing mutation (login, verifyEmail) via a shared payload-shape convention (token + user)"

key-files:
  created: []
  modified:
    - frontend/src/context/AuthContext.jsx
    - frontend/src/context/AuthContext.test.jsx

key-decisions:
  - "register is decoupled from authenticate() entirely — a plain graphqlRequest call returning { message } — so there is no code path where a successful register can ever write localStorage/setUser (D-16)"
  - "verifyEmail reuses authenticate() unchanged apart from swapping the payload source from data.register to data.verifyEmail, since register no longer produces a session-shaped payload (D-11)"

patterns-established:
  - "New session-establishing actions delegate to the existing authenticate(mutation, variables) helper rather than duplicating the token/setUser wiring"

requirements-completed: [VERIFY-08]

duration: 1min
completed: 2026-07-20
---

# Phase 11 Plan 06: AuthContext register/verifyEmail contract split Summary

**AuthContext.register now resolves to a message-only payload with zero session side-effects, and a new verifyEmail(token) action becomes the sole session-establishing call for a brand-new account, mirroring login's exact mechanics.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-07-20T19:41:57Z
- **Completed:** 2026-07-20T19:42:58Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- `register` no longer routes through `authenticate()` — it's a plain `graphqlRequest` call resolving to `{ message }`, with the `REGISTER_MUTATION` selection set changed from `{ token user {...} }` to `{ message }`
- New `VERIFY_EMAIL_MUTATION` and `verifyEmail(token)` action added, delegating to the existing `authenticate()` helper exactly like `login` does
- `authenticate()`'s payload derivation updated from `data.login || data.register` to `data.login || data.verifyEmail`
- Two new tests added (register-never-sessions, verifyEmail-establishes-session); all 4 pre-existing tests (including unchanged `login`/`logout` regression tests) still pass

## Task Commits

Each task was committed atomically (TDD red-green cycle):

1. **Task 1 (RED):** add failing tests for message-only register and verifyEmail action - `cbce23f` (test)
2. **Task 1 (GREEN):** AuthContext register is message-only, verifyEmail establishes the session - `ad52949` (feat)

**Plan metadata:** (recorded by orchestrator after merge, per worktree isolation policy)

_Note: TDD task — test → feat commit sequence, no refactor step needed._

## Files Created/Modified
- `frontend/src/context/AuthContext.jsx` - `REGISTER_MUTATION` selection set changed to `{ message }`; new `VERIFY_EMAIL_MUTATION` constant added; `authenticate()` payload source updated to `data.login || data.verifyEmail`; `register` decoupled from `authenticate()`; new `verifyEmail` action added to context value
- `frontend/src/context/AuthContext.test.jsx` - `Probe` extended with `register`/`verifyEmail` buttons destructuring the new actions; two new tests added covering the message-only register contract and the session-establishing verifyEmail action

## Decisions Made
- `register` is fully decoupled from `authenticate()` rather than special-cased inside it, so there's no code path where a successful register call could ever write `localStorage`/`setUser` (D-16) — proven by Test 1 asserting no session artifacts exist after a successful register call
- `verifyEmail` reuses `authenticate()` unchanged in structure, only swapping which mutation/payload key it reads, keeping the session-establishing mechanics identical to `login` (D-11)

## Deviations from Plan

None - plan executed exactly as written. TDD RED gate confirmed 3 test failures as predicted (register test, verifyEmail test, and a cascading failure in the unrelated pre-existing logout test caused by the temporarily-still-authenticate()-routed register code throwing on the `{ message }`-shaped mock — resolved by the GREEN step). GREEN gate confirmed all 6 tests in the file pass, and the full frontend suite (19 tests across 6 files) remains green.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`register` and `verifyEmail` exports are ready for Plan 11-07 (`Register.jsx` and the new `VerifyEmail.jsx` page) to consume. No blockers.

---
*Phase: 11-email-verification-admin-race-fix*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: frontend/src/context/AuthContext.jsx
- FOUND: frontend/src/context/AuthContext.test.jsx
- FOUND: cbce23f (test commit)
- FOUND: ad52949 (feat commit)
