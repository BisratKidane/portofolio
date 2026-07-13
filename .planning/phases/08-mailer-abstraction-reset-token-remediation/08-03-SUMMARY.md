---
phase: 08-mailer-abstraction-reset-token-remediation
plan: 03
subsystem: auth
tags: [graphql, apollo, vitest, mailer, password-reset, account-takeover]

# Dependency graph
requires:
  - phase: 08-01
    provides: "backend/src/services/mailer.js — sendMail() + sendPasswordResetEmail() named exports"
provides:
  - "resetToken deleted from PasswordResetPayload SDL — querying it is a GraphQL validation error"
  - "requestPasswordReset sends the reset link via sendPasswordResetEmail() fire-and-forget, existing accounts only"
  - "resetPassword.test.js: mailer-boundary vi.mock() assertions + single-use/expiry regression tests"
affects: [09-session-revocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mock() module-scope mailer interception for resolver integration tests (first use of Vitest mocking in this backend workspace)"
    - "fire-and-forget async call with .catch()-only error handling, to preserve response-timing parity across branches"

key-files:
  created: []
  modified:
    - backend/src/schemas/user.schema.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/resetPassword.test.js

key-decisions:
  - "resetToken field deleted from the SDL entirely (schema-level), not resolver-nulled — closes the account-takeover vector at the type-system level (PITFALLS.md Pitfall 5)"
  - "sendPasswordResetEmail() called fire-and-forget (not awaited) after user.save(), matching D-08 — preserves response-timing parity between existing and nonexistent accounts"
  - "Mailer-call assertions check call arguments (to + exact persisted token), not just call count, per D-05/Pitfall 6"

patterns-established:
  - "vi.mock('../services/mailer.js', ...) at module scope, before any describe block, for resolver-level mailer boundary tests"
  - "vi.waitFor() for asserting fire-and-forget async side effects deterministically, without a raw microtask flush"

requirements-completed: [MAIL-02, RESET-01, RESET-02, RESET-03, RESET-04]

# Metrics
duration: 3min
completed: 2026-07-13
---

# Phase 8 Plan 03: Reset-Token Schema Deletion & Mailer Wiring Summary

`resetToken` deleted from the GraphQL SDL (not just nulled in the resolver), `requestPasswordReset` now delivers the token exclusively via `sendPasswordResetEmail()` fire-and-forget, and both the anti-enumeration message and the token's single-use/expiry behavior are regression-proofed by test.

## Performance

- **Duration:** ~3 min (RED commit to final GREEN test commit)
- **Started:** 2026-07-13T21:43:55+02:00
- **Completed:** 2026-07-13T21:46:16+02:00
- **Tasks:** 2 completed
- **Files modified:** 3 (`user.schema.js`, `user.resolver.js`, `resetPassword.test.js`)

## Accomplishments
- `PasswordResetPayload.resetToken` deleted from the SDL — querying it is now a GraphQL validation error (`errors` defined, `data` falsy), not a resolver-returned `null`, closing the account-takeover vector this phase exists to fix (RESET-01, T-08-06).
- `requestPasswordReset` calls `sendPasswordResetEmail({ to: user.email, token: resetToken })` fire-and-forget, only for existing accounts, with a `.catch()` that logs failures server-side only (RESET-02, T-08-08).
- Both existing-account and nonexistent-account branches return the identical D-11 message `'If the account exists, a password reset link has been sent.'` (RESET-03, T-08-07).
- Resolver tests assert the mailer call at the argument level (`to` + exact persisted `resetPasswordToken`), via `vi.mock()` + `vi.waitFor()` — no live SMTP transport touched (MAIL-02, D-05).
- A previously-consumed reset token and an expired reset token are both regression-proofed as rejected by `resetPassword` (RESET-04, T-08-09).

## Task Commits

Each task was committed atomically, following strict RED → GREEN ordering:

1. **Task 1 (RED): failing tests for reset-token removal and mailer delivery** - `5bee0dc` (test)
2. **Task 1 (GREEN): remove resetToken from schema, deliver reset link via mailer** - `fe38ec7` (feat)
3. **Task 2: single-use + expiry regression tests (RESET-04)** - `9b0cafc` (test)

_TDD gate sequence verified in git log: `test(08-03)` precedes `feat(08-03)` (Task 1); Task 2 is an additive regression-test-only task against unchanged `resetPassword` resolver code, so no separate feat commit was needed._

## TDD Gate Compliance

RED gate observed correctly: `npm test --workspace backend -- resetPassword` was run against the *unmodified* schema/resolver after the Task 1 RED edit and before any implementation change. All three targeted assertions failed for the expected reasons:
- Both D-11 message assertions failed (`Received: "...token has been generated."` vs `Expected: "...link has been sent."`)
- The Test-3 validation-error assertion failed (`expected undefined to be defined` — `resetToken` was still a queryable field, so the query validated successfully)
- (Test 1's mailer-call assertion could not even be reached as a distinct failure since the message assertion above it failed first in the same test — the test as a whole failed, which satisfies the RED requirement; the mailer was never called until the GREEN implementation step wired the import.)

No case passed unexpectedly before implementation — RED was confirmed genuine, not skipped. GREEN gate confirmed all 3 targeted cases (and the full 4-test file) pass after the schema/resolver edit, and the full backend suite (14 files, 60 tests) stayed green.

## Files Created/Modified
- `backend/src/schemas/user.schema.js` - `resetToken: String` field deleted from `PasswordResetPayload`; type is now `{ message: String! }`
- `backend/src/resolvers/user.resolver.js` - added `import { sendPasswordResetEmail } from '../services/mailer.js'`; `requestPasswordReset` rewritten to drop `resetToken` from both branches, update the message to D-11's wording, and fire-and-forget the mailer call after `await user.save()`
- `backend/src/resolvers/resetPassword.test.js` - `vi.mock()` mailer interception added at module scope; `REQUEST_RESET_MUTATION` selection set shrunk to `{ message }`; new `REQUEST_RESET_WITH_TOKEN_FIELD` constant for the validation-error test; both message assertions updated to D-11 wording; mailer call-argument assertions added (positive + negative case); two new regression tests appended to `describe('resetPassword', ...)` for single-use and expiry

## Decisions Made
Followed the plan and 08-CONTEXT.md decisions exactly — no new decisions required beyond what was already locked (D-05, D-06, D-08, D-11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect literal-string assertion in the expiry regression test**
- **Found during:** Task 2 (expired reset token test), while writing the test
- **Issue:** The plan's action text suggested asserting `user.passwordHash` equals the literal `createTestUser` default string `'Password123!'` after reload. `User.js`'s `beforeCreate` hook bcrypt-hashes `passwordHash` on creation (`backend/src/models/User.js:54-55`), so the persisted value is never the plaintext literal — an assertion against the literal string would fail even on correct behavior (a false negative), not verify the intended invariant.
- **Fix:** Captured `user.passwordHash` immediately after `createTestUser()` (the already-hashed value) and asserted the post-attempt value is unchanged from that captured value, which correctly proves the expired-token rejection left the password untouched.
- **Files modified:** `backend/src/resolvers/resetPassword.test.js`
- **Verification:** Test passes; full backend suite green (62/62).
- **Committed in:** `9b0cafc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in test logic)
**Impact on plan:** No scope creep — the fix corrects a would-be false-negative test assertion; the actual security guarantee (expired token rejected, password left untouched) is exactly what the plan intended and is what's now verified.

## Issues Encountered

**Plan's literal acceptance-criteria grep is inconsistent with its own action instructions.** The plan's Task 1 `<acceptance_criteria>` states `grep -rn "resetToken" backend/src/resolvers/user.resolver.js` should return zero matches. However, the same task's `<action>` text explicitly instructs keeping the local variable `const resetToken = createResetToken();` and calling `sendPasswordResetEmail({ to: user.email, token: resetToken })` — both of which necessarily contain the substring `resetToken`. The pre-existing (untouched-by-this-plan) utility functions `createResetToken()` and `resetTokenExpiry()` (imported from `utils/auth.js`, built in a prior phase) also match the substring. Renaming these to satisfy a literal zero-match grep would be an unplanned, unrequested identifier rename touching a shared utility module outside this plan's `files_modified` list — out of scope per the plan's own scope boundary.

**Resolution:** Did not rename identifiers. The security-relevant guarantee this criterion was actually protecting — no `resetToken` field on the GraphQL schema or in any resolver *return value* — is fully satisfied and independently verified by:
- `grep -n "resetToken: String" backend/src/schemas/user.schema.js` → zero matches (confirmed)
- Test 3 (`rejects querying the removed resetToken field with a GraphQL validation error`) → passes
- Manual inspection: `requestPasswordReset` returns only `{ message }` on both branches — no `resetToken` key in either returned object

This is flagged for visibility, not treated as a plan failure — the substantive RESET-01/SC-2 guarantee is closed.

## Next Phase Readiness
- RESET-01 through RESET-04 and MAIL-02 are fully closed; full backend suite (14 files, 62 tests) green.
- Phase 9 (session revocation via `passwordChangedAt`) will touch the same `resetPassword` resolver next, per the dependency note in ROADMAP.md — the resolver's current shape (token nulled + `user.save()` on success) is the extension point.
- No blockers.

---
*Phase: 08-mailer-abstraction-reset-token-remediation*
*Completed: 2026-07-13*

## Self-Check: PASSED

All modified files exist on disk (`backend/src/schemas/user.schema.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/resetPassword.test.js`); all task commits (`5bee0dc`, `fe38ec7`, `9b0cafc`) and the summary commit (`e4d87b2`) exist in git history.
