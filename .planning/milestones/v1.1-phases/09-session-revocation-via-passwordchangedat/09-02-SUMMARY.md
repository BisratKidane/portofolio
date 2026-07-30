---
phase: 09-session-revocation-via-passwordchangedat
plan: 02
subsystem: auth
tags: [password-reset, hashing, sha256, sequelize, vitest, tdd]

# Dependency graph
requires:
  - phase: 08-mailer-abstraction-reset-token-remediation
    provides: sendPasswordResetEmail() pluggable mailer, requestPasswordReset/resetPassword resolvers, CR-01 timing floor, resetToken removed from GraphQL schema (08-REVIEW.md WR-08 flagged plaintext-at-rest as remaining gap)
provides:
  - hashResetToken(token) sha256 digest helper in backend/src/utils/auth.js
  - requestPasswordReset persists hashResetToken(resetToken) instead of the raw token, while still emailing the raw token
  - resetPassword looks the user up by hashResetToken(token) instead of raw equality
  - resetPassword.test.js fixtures/assertions updated to hashed values, with new explicit hash-at-rest and mailer-hash assertions
affects: [phase-09-plan-03 (session revocation via passwordChangedAt — touches the same resolver file next)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hash-at-rest for single-use bearer tokens: store sha256(token), never the raw value; the raw value is only ever emailed/returned once at issuance, then looked up via hashResetToken(incoming) at redemption time"

key-files:
  created: []
  modified:
    - backend/src/utils/auth.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/resetPassword.test.js

key-decisions:
  - "sha256 (no work factor) is appropriate for this token, since entropy is already very high (256-bit CSPRNG via crypto.randomBytes(32)) — this is a lookup-key hash, not a password hash, so bcrypt/scrypt-style stretching is unnecessary."
  - "Fold WR-08 remediation into Phase 9 rather than a separate mini-phase/backlog item, reusing the same requestPasswordReset/resetPassword resolver touch this phase already makes (D-08, carried from CONTEXT.md)."

patterns-established:
  - "Hash-at-rest for single-use bearer tokens: raw value only lives in memory + the outbound email; findOne() lookups always hash the incoming value first."

requirements-completed: [RESET-06]

# Metrics
duration: 20min
completed: 2026-07-20
---

# Phase 09 Plan 02: Password-Reset Token Hash-at-Rest Summary

**Password-reset tokens are now stored as sha256 digests, not plaintext — `requestPasswordReset` persists `hashResetToken(resetToken)` while still emailing the raw token, and `resetPassword` looks the user up by `hashResetToken(token)`, closing 08-REVIEW.md finding WR-08.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-20T10:05:00Z (approx.)
- **Completed:** 2026-07-20T10:25:29Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Added `hashResetToken(token)` — a one-line `sha256` digest export in `backend/src/utils/auth.js`, alongside `createResetToken`/`resetTokenExpiry`.
- `requestPasswordReset` now stores `hashResetToken(resetToken)` in `user.resetPasswordToken`; the raw `resetToken` local variable is unchanged and is still what gets passed to `sendPasswordResetEmail`.
- `resetPassword` now looks the user up via `findOne({ where: { resetPasswordToken: hashResetToken(token) } })` — a raw-value equality lookup can no longer match a stored digest.
- `resetPassword.test.js` fixtures for the short-password, single-use, and expired-token test cases now seed `hashResetToken(...)` values while keeping the mutation-argument `token:` as the unchanged raw literal.
- Added a new explicit hash-at-rest pin test (`never persists the raw/emailed reset token — only its hash is stored (RESET-06)`) asserting the stored value is never equal to the raw/emailed token.
- Updated the existing mailer assertion to capture the raw emailed token and assert `hashResetToken(rawToken) === user.resetPasswordToken`, rather than comparing the emailed token directly to the DB value (which now intentionally diverge).
- Full backend suite: 70/70 tests passing, including the unmodified CR-01 timing-floor regression test.

## Task Commits

Each task was committed atomically, following the plan's mandatory RED → GREEN TDD sequence:

1. **Task 1 (RED): add failing tests for reset-token hash-at-rest** - `9b190fd` (test)
   - Confirmed FAILING against the pre-change resolver/auth.js: `hashResetToken is not a function` (3 fixture-seed tests + the mailer-hash assertion) and the new hash-at-rest pin test failed because the stored value was still the raw token (`not to be` assertion tripped on identical raw values). 5 of 8 tests in the file failed as expected; the 3 unrelated tests (non-existing email, timing floor, removed-field validation) still passed untouched.
2. **Task 1 (GREEN): implement hash-at-rest storage/lookup** - `9943fda` (feat)
   - Added `hashResetToken` export, wired it into both resolvers, re-ran the focused test file (8/8 pass) then the full backend suite (70/70 pass).

**Plan metadata:** commit created at end of this summary step (docs: complete plan)

_Note: This was a single TDD task per the plan (`tdd="true"`); RED and GREEN commits are the only two required — no REFACTOR step was needed since the implementation is minimal (one new function, two one-line call-site changes)._

## Files Created/Modified
- `backend/src/utils/auth.js` - added `hashResetToken(token)` sha256 digest export
- `backend/src/resolvers/user.resolver.js` - `requestPasswordReset` stores the hash (still emails the raw token); `resetPassword` looks up by hash
- `backend/src/resolvers/resetPassword.test.js` - fixtures updated to hashed seed values; mailer assertion and short-password reload assertion updated to compare against hashes; new explicit hash-at-rest pin test added

## Decisions Made
- sha256 without a work factor is the right primitive here (T-09-06 in the plan's threat model): the token already carries 256 bits of CSPRNG entropy from `createResetToken()`, so this is a lookup-key hash, not a password hash — stretching (bcrypt/scrypt) would add cost with no meaningful security benefit for an already-high-entropy, single-use, short-lived (30 min) token.
- No new import needed in `auth.js` — `crypto` (`node:crypto`) was already imported for `createResetToken`.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<action>` steps were followed verbatim: RED-only edit to the test file, RED gate confirmed failing, then the GREEN implementation edit to `auth.js`/`user.resolver.js`, then the GREEN gate (focused + full suite).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. This is a pure code-level fix; no schema/migration change (the `resetPasswordToken` column already existed and already stores an opaque string — its *contents* changed from raw token to hex-encoded sha256 digest, but its type/length are unaffected since both are hex strings of similar length).

## Next Phase Readiness

- Plan 09-03 (session revocation via `passwordChangedAt`) touches the same `user.resolver.js` file next (per CONTEXT.md sequencing) — no conflict expected, since this plan only modified `requestPasswordReset`'s token-storage line and `resetPassword`'s lookup line, not the surrounding structure.
- `getUserFromRequest` in `auth.js` was explicitly left untouched per the plan's interface note — it's Plan 09-03's responsibility to add the revocation check there.
- No blockers or concerns raised by this plan's execution.

---
*Phase: 09-session-revocation-via-passwordchangedat*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created/modified files confirmed present on disk; both commits (`9b190fd` test/RED, `9943fda` feat/GREEN) confirmed present in `git log`.
