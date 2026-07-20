---
phase: 09-session-revocation-via-passwordchangedat
fixed_at: 2026-07-20T19:13:00Z
review_path: .planning/phases/09-session-revocation-via-passwordchangedat/09-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-07-20T19:13:00Z
**Source review:** .planning/phases/09-session-revocation-via-passwordchangedat/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02 — Critical + Warning scope; IN-01/IN-02 out of scope per fix_scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: DB errors during auth context resolution are now silently swallowed as "unauthenticated"

**Files modified:** `backend/src/utils/auth.js`, `backend/src/utils/auth.test.js`
**Commit:** 5690ab3
**Applied fix:** Restructured `getUserFromRequest` so only the `jwt.verify` step is wrapped in `try/catch` (auth failures still degrade to `null`, matching the existing fail-safe contract). The `models.User.findByPk()` call now runs outside that `catch`, so a genuine DB/infrastructure error (connection drop, pool exhaustion) propagates as a real rejection instead of being silently converted into "unauthenticated." No change to the function's public contract — same signature, same return values for all previously-passing cases (verified against the existing 5 auth-failure tests plus the 3 `passwordChangedAt` revocation tests, all still pass). Added a new regression test (`'propagates a DB/infrastructure error from findByPk instead of swallowing it as unauthenticated (WR-01)'`) asserting `getUserFromRequest` rejects (rather than resolving `null`) when `findByPk` throws. `backend/src/utils/auth.test.js` now has 19/19 passing (was 18).

### WR-02: Reset-token consumption is not atomic — concurrent requests can both succeed with the same token

**Files modified:** `backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/resetPassword.test.js`
**Commit:** 7225400
**Applied fix:** Replaced the read-then-`save()` consumption sequence in `resetPassword` with a conditional atomic update: after the existing `findOne`/expiry validation (unchanged, still returns the generic "invalid or has expired" error), the actual state transition is now `models.User.update({ passwordHash, resetPasswordToken: null, resetPasswordExpiresAt: null }, { where: { id: user.id, resetPasswordToken: hashed }, individualHooks: true })`. The `WHERE` clause re-checks `resetPasswordToken` matches the token just read, so a second concurrent request whose token was already cleared by the first winner's update gets `affectedCount === 0` and throws the same invalid-token error — no silent overwrite. `individualHooks: true` is required so the `beforeUpdate` hook (bcrypt hashing + `passwordChangedAt` stamping) still fires under `Model.update()`, preserving existing password-hashing and session-revocation behavior. Added a new concurrency regression test (`'allows only one winner when two requests race on the same still-valid token (WR-02)'`) that fires two `resetPassword` mutations concurrently via `Promise.all` on the same valid token and asserts exactly one succeeds and one fails with the invalid/expired error; ran 5x locally with no flakiness. All existing single-use (`'rejects reusing an already-consumed reset token'`) and timing-floor tests in `resetPassword.test.js` still pass unmodified. `backend/src/resolvers/resetPassword.test.js` now has 9/9 passing (was 8).

## Skipped Issues

None — both in-scope findings (WR-01, WR-02) were fixed.

**Note on out-of-scope findings:** IN-01 (documentation clarity on the same-second survival window) and IN-02 (idempotent migration SQL) were excluded per `fix_scope: critical_warning` and were not attempted in this run.

**Full backend suite:** 76/76 passing after both fixes (74 baseline + 2 new regression tests: 1 for WR-01, 1 for WR-02). No regressions introduced.

---

_Fixed: 2026-07-20T19:13:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
