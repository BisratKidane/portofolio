---
phase: 09-session-revocation-via-passwordchangedat
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - backend/src/utils/auth.js
  - backend/src/utils/auth.test.js
  - backend/src/models/User.js
  - backend/src/models/User.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/resetPassword.test.js
  - backend/src/resolvers/sessionRevocation.test.js
  - backend/migrations/manual/009-add-password-changed-at.sql
  - README.md
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the session-revocation-via-`passwordChangedAt` implementation (`SESS-01`/`SESS-02`/`SESS-03`) and the reset-token-hashing-at-rest change (`RESET-06`). The core second-granularity revocation comparison in `getUserFromRequest` (`backend/src/utils/auth.js:19-22`) is correct and matches its test coverage, including the deliberately-accepted same-second boundary case (confirmed against the phase discussion log — this is a reviewed, locked design decision, not a bug). The `beforeUpdate` stamping hook in `backend/src/models/User.js` only fires on an actual `passwordHash` change, and the reset-token-at-rest hashing (`hashResetToken` / SHA-256) is applied consistently at both write (`requestPasswordReset`) and read (`resetPassword`) sites. The manual migration SQL matches the Sequelize model's `DATE(3)` column exactly, and the GraphQL SDL (`backend/src/schemas/user.schema.js`, checked for cross-reference) does not expose `passwordHash`, `resetPasswordToken`, or `passwordChangedAt`, so there's no new data-exposure surface from the new column. All 32+ relevant backend tests pass locally (`sessionRevocation.test.js`, `resetPassword.test.js`, `auth.test.js`, `User.test.js`).

Two real issues were found, both around robustness under failure/concurrency rather than the headline revocation math:

1. A genuine behavioral regression in error handling: the diff moved the `models.User.findByPk()` call to be `await`-ed *inside* the existing `try/catch` in `getUserFromRequest` (previously it was returned un-awaited, so a rejected DB call would NOT have been caught by that `catch`). This is required to run the new revocation check synchronously, but it has the side effect of silently converting genuine DB/infrastructure errors into "unauthenticated" for every request.
2. The reset-password consumption flow (`findOne` then later `save()`) is not atomic, so the "single-use" reset-token guarantee can be violated under concurrent requests.

## Warnings

### WR-01: DB errors during auth context resolution are now silently swallowed as "unauthenticated"

**File:** `backend/src/utils/auth.js:14-27` (specifically line 16)
**Issue:** Before this phase, `getUserFromRequest` returned `models.User.findByPk(payload.sub)` directly (un-awaited) from inside the `try` block. In JavaScript, returning a promise from inside `try` without `await`-ing it does **not** route a later rejection of that promise through the enclosing `catch` — it propagates as a genuine rejection of the async function. (Verified empirically: `return Promise.reject(...)` inside `try/catch` rejects the outer async function rather than being caught.)

This phase changed that line to `const user = await models.User.findByPk(payload.sub);`, which *is* now inside the `try` block's synchronous-await path. As a result, any DB error during the user lookup (connection drop, pool exhaustion, transient outage) is now caught by the generic `catch { return null; }` and silently converted into "no authenticated user," rather than propagating as a real error.

Because `getUserFromRequest` runs on **every** GraphQL request via the Apollo `context` function (`backend/src/server.js:31-34`), a DB outage would now present to every logged-in user as "You must be logged in to perform this action" / `me` returning `null`, instead of surfacing a clear 500-style error. This masks real infrastructure incidents as authentication failures, which will confuse on-call debugging and could trigger client-side logout/redirect behavior for the entire user base during an outage. It fails *safe* (no unauthorized access is granted), so this is not a security bypass, but it is a real, newly-introduced observability/reliability regression, and it's untested — none of the `getUserFromRequest` tests exercise `findByPk` throwing after a successful `jwt.verify`.

**Fix:** Only wrap the token-verification step in `try/catch`; let DB errors from the lookup propagate (or catch/log them separately so they're distinguishable from auth failures):
```js
export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }

  const user = await models.User.findByPk(payload.sub); // DB errors propagate as real errors
  if (!user) return null;

  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAtSeconds) return null;
  }

  return user;
}
```

### WR-02: Reset-token consumption is not atomic — concurrent requests can both succeed with the same token

**File:** `backend/src/resolvers/user.resolver.js:88-101`
**Issue:** `resetPassword` reads the user via `findOne({ where: { resetPasswordToken: hashResetToken(token) } })`, validates expiry, then later calls `user.save()` to hash the new password and clear `resetPasswordToken`/`resetPasswordExpiresAt`. There is no row lock, transaction, or conditional/atomic update (e.g., `UPDATE ... WHERE resetPasswordToken = ? AND resetPasswordExpiresAt > NOW()` checked via affected-row-count) guarding the read-then-write sequence. Two concurrent `resetPassword` requests presented with the same still-valid token can both pass the `findOne`/expiry check before either writes, and both then `save()` — the second write silently overwrites the first, and the "single-use" guarantee (explicitly the subject of the "rejects reusing an already-consumed reset token" test in `resetPassword.test.js:150-169`, which is sequential/`await`-ordered and does not exercise this race) is violated under concurrency. Practical impact is limited (whoever holds the valid raw token already has full reset capability), but it's a real gap against the stated single-use invariant and could produce confusing double-submit behavior for legitimate users.

**Fix:** Make consumption atomic, e.g. via a conditional update and checked affected-row count:
```js
resetPassword: async (_parent, { token, password }, { models }) => {
  const hashed = hashResetToken(token);
  const user = await models.User.findOne({ where: { resetPasswordToken: hashed } });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new Error('The password reset token is invalid or has expired.');
  }

  assertPasswordStrength(password);

  const [affectedCount] = await models.User.update(
    { passwordHash: password, resetPasswordToken: null, resetPasswordExpiresAt: null },
    { where: { id: user.id, resetPasswordToken: hashed }, individualHooks: true }
  );
  if (affectedCount === 0) throw new Error('The password reset token is invalid or has expired.');
  return true;
}
```
(Note: `individualHooks: true` is required for the `beforeUpdate` hashing/`passwordChangedAt` hook to run under `Model.update`.)

## Info

### IN-01: "Same-second survival window" documentation understates the actual exposure

**File:** `backend/src/utils/auth.js:19-22`, `backend/migrations/manual/009-add-password-changed-at.sql:15-18`, `.planning/phases/09-session-revocation-via-passwordchangedat/09-DISCUSSION-LOG.md`
**Issue:** This is a confirmed, deliberate, reviewed design decision (D-01 in the discussion log: "Accepted sub-1s survival window"), not a bug — the code and tests correctly implement it. However, the phrasing "sub-1s survival window" is easy to misread. The actual behavior is: any token whose `iat` (whole-second) matches the same second as `passwordChangedAt` is accepted, and once accepted it remains valid for its **full remaining JWT lifetime** (`JWT_EXPIRES_IN`, e.g. up to a day), not just for the following second. The "sub-1s" part only bounds the *opportunity window* to obtain such a token — it does not bound how long that token stays honored afterward. If `JWT_EXPIRES_IN` is ever increased, or a reader assumes "sub-1s" means "sub-1s of validity," this could be misunderstood as a smaller residual risk than it is.
**Fix:** Add a one-line comment at `auth.js:19-22` (or expand the migration file's rationale comment) clarifying: "a token issued in the same second as the password change survives for its full remaining lifetime, not just briefly — this is an accepted trade-off (see D-01)."

### IN-02: Manual migration is not safely re-runnable

**File:** `backend/migrations/manual/009-add-password-changed-at.sql:20`
**Issue:** `ALTER TABLE users ADD COLUMN passwordChangedAt DATETIME(3) NULL DEFAULT NULL;` has no idempotency guard. If an operator accidentally runs it twice against the same database (plausible given it's a manually-executed, one-time script with no tracking table), it fails with `ERROR 1060 (42S21): Duplicate column name`. MySQL 8.0.29+ (this project targets MySQL 8+/8.4 per `docker-compose.yml`) supports `ADD COLUMN IF NOT EXISTS`, which would make the script a safe no-op on re-run.
**Fix:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordChangedAt DATETIME(3) NULL DEFAULT NULL;
```

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
