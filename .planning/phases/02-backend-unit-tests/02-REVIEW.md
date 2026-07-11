---
phase: 02-backend-unit-tests
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - backend/src/models/User.test.js
  - backend/src/utils/auth.test.js
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the two backend unit-test files added in Phase 2: `auth.test.js` (JWT/auth utilities) and `User.test.js` (User model password hashing + `validatePassword`). Overall the tests are genuine — they exercise real code paths rather than mocking the unit under test, and the negative auth cases (expired token, tampered signature, wrong secret, missing header) correctly assert that the stubbed `findByPk` is never reached, which is a strong isolation pattern.

Test isolation is sound: neither file opens a database connection. `User.test.js` uses `User.build()`, `User.runHooks(...)`, and `bcrypt` directly (no persistence), and `auth.test.js` stubs `models.User.findByPk`. The real DB connect/sync lives in the out-of-scope `backend/test/globalSetup.js` behind a `assertTestDatabase()` guard, and `vitest.config.js` points `ENV_FILE` at `env/test.env` with `NODE_ENV=test`. No shared mutable state leaks between tests.

No blockers found. The concerns are: one assertion is too loose to catch a wrong-magnitude bug (`resetTokenExpiry`), and two model hooks that are core to the User model (`beforeUpdate` re-hash, `beforeValidate` email normalization) are entirely uncovered. Remaining items are minor coverage/assertion-quality notes.

## Warnings

### WR-01: `resetTokenExpiry` assertion is too loose to catch a wrong-magnitude bug

**File:** `backend/src/utils/auth.test.js:118-125`
**Issue:** The lower-bound check is only `expect(expiry.getTime()).toBeGreaterThan(now)`. Because the expiry is computed inside `resetTokenExpiry()` *before* `now` is captured, this passes for any positive offset — including a broken implementation that dropped the `* 60 * 1000` conversion and returned `Date.now() + env.resetTokenExpiresMinutes` (i.e. ~30 ms in the future instead of ~30 minutes). The upper bound (`<= now + (minutes + 1) * 60000`) also passes for that bug, so the test gives false confidence that the offset magnitude is correct. The behavior the test claims to verify ("within tolerance of `env.resetTokenExpiresMinutes`") is not actually asserted on the lower side.
**Fix:** Assert a tight lower bound close to the expected offset so a magnitude error fails:
```js
const expiry = resetTokenExpiry();
const now = Date.now();
const expected = env.resetTokenExpiresMinutes * 60000;
expect(expiry.getTime()).toBeGreaterThan(now + expected - 60000); // within 1 min below
expect(expiry.getTime()).toBeLessThanOrEqual(now + expected + 60000);
```

### WR-02: Core User model hooks are untested (`beforeUpdate` re-hash, `beforeValidate` email normalization)

**File:** `backend/src/models/User.test.js:23-49` (scope of the `beforeCreate` block; siblings omitted)
**Issue:** The phase covers "the User model," but two behaviors defined in `backend/src/models/User.js:51-59` have zero coverage:
- `beforeUpdate` (line 57-58) re-hashes `passwordHash` only when `user.changed('passwordHash')` is true. A regression that dropped the `changed()` guard would double-hash on every save (locking users out), or dropping the hook entirely would persist a plaintext password on update — both auth-critical and currently uncaught.
- `beforeValidate` (line 51-52) lowercases/trims `email`. This underpins case-insensitive email uniqueness; a regression here would allow duplicate accounts (`A@x.com` vs `a@x.com`). Untested.
**Fix:** Add hook-level tests mirroring the existing `beforeCreate` pattern (no persistence needed):
```js
it('re-hashes only when passwordHash changed on update', async () => {
  const user = User.build({ passwordHash: 'hashed-value' });
  user.set('passwordHash', 'NewPass123!');       // mark changed
  await User.runHooks('beforeUpdate', user);
  await expect(bcrypt.compare('NewPass123!', user.passwordHash)).resolves.toBe(true);
});

it('normalizes email on beforeValidate', async () => {
  const user = User.build({ email: '  Test@Example.COM ' });
  await User.runHooks('beforeValidate', user);
  expect(user.email).toBe('test@example.com');
});
```

## Info

### IN-01: Missing coverage for the non-`Bearer` Authorization header branch

**File:** `backend/src/utils/auth.test.js:23-78`
**Issue:** `getUserFromRequest` has a distinct branch (`auth.js:11`) for headers that exist but do not start with `"Bearer "` (e.g. a bare token, or `Basic ...`), which returns `null` before any `jwt.verify`. Tests cover the empty-header case and several verify-failure cases, but not this prefix branch. A regression that changed the prefix check or the `slice(7)` offset would go undetected.
**Fix:** Add a case with `{ headers: { authorization: 'token-without-bearer-prefix' } }` and assert the result is `null` and `findByPk` is not called.

### IN-02: Happy-path `getUserFromRequest` assertion largely re-checks the stub

**File:** `backend/src/utils/auth.test.js:24-34`
**Issue:** `expect(result).toEqual({ id: 7, role: 'USER' })` compares against the object the stub itself returns, so it mostly verifies the stub, not `getUserFromRequest`. The load-bearing assertion is `expect(calledWith).toBe(7)` (that the decoded `sub` is passed through). This is acceptable but the object-equality check adds little signal; consider asserting identity/pass-through (`expect(result).toBe(returnedStubObject)`) to make the intent explicit.
**Fix:** Optional — keep `calledWith` as the primary assertion; return a sentinel object from the stub and assert the function returns that same reference.

### IN-03: `signToken` test does not assert the expiry (`exp`) claim

**File:** `backend/src/utils/auth.test.js:13-21`
**Issue:** `signToken` sets `expiresIn: env.jwtExpiresIn` (`auth.js:6`), but the test only checks `sub` and `role`. A regression dropping or mis-configuring `expiresIn` (e.g. tokens that never expire) would pass. Note also the `expired token` test at line 45 relies on `jwt.sign(..., { expiresIn: '-1s' })` rather than on `signToken`, so `signToken`'s own expiry wiring is never asserted.
**Fix:** Assert `payload.exp` is defined and greater than `payload.iat` in the `signToken` test.

---

## Narrative Findings (AI reviewer)

All findings above are narrative findings from direct review of the two test files and their subjects under test (`backend/src/utils/auth.js`, `backend/src/models/User.js`). No `<structural_findings>` block was provided, so there is no fallow substrate section.

---

_Reviewed: 2026-07-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
