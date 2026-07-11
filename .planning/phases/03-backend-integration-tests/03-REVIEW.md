---
phase: 03-backend-integration-tests
reviewed: 2026-07-11T23:52:49Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - backend/test/helpers.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/login.test.js
  - backend/src/resolvers/dashboard.test.js
  - backend/src/resolvers/resetPassword.test.js
  - KNOWN-ISSUES.md
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-11T23:52:49Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This phase adds a backend integration-test foundation: a shared Apollo `executeOperation`
harness (`backend/test/helpers.js`), four resolver test suites, and a `KNOWN-ISSUES.md`
documenting the reset-token exposure. I reviewed each test against the actual resolver,
model, auth, schema, and test-config source to confirm the tests exercise real behavior
rather than passing vacuously.

The test infrastructure is genuinely solid: `guard.js` hard-refuses to run against any
DB not ending in `_test`, `globalSetup.js` uses `sync({ force: true, match: /_test$/ })`,
and `vitest.config.js` sets `pool: 'forks'` + `fileParallelism: false` so the suites
share one database sequentially without cross-file truncation races. The ENV_FILE side
effect in the config propagates to forked workers via inherited `process.env`, and JWT
sign/verify use the same `env.jwtSecret` module, so those paths are consistent.

**No BLOCKER-level defects were found** — there is no security hole, data-loss risk, or
incorrect behavior in the test code, and the DB safety guard is well designed. However,
several WARNINGs undermine the milestone's stated core value ("auth flows protected by a
test suite that fails loudly"): the highest-risk auth flow (`resetPassword`) has **zero
coverage** despite a file named for it, and one dashboard test's assertions are weak
enough that a real regression would pass unnoticed.

## Warnings

### WR-01: `resetPassword` mutation has zero test coverage; file name is misleading

**File:** `backend/src/resolvers/resetPassword.test.js:1-43`
**Issue:** The file is named `resetPassword.test.js` but contains only a
`requestPasswordReset` suite. The actual `resetPassword` resolver
(`backend/src/resolvers/user.resolver.js:63-74`) — which validates the token, enforces
the expiry check `user.resetPasswordExpiresAt < new Date()`, rehashes the password, and
clears the token — is never exercised. This is the single highest-risk auth path: the
same path `KNOWN-ISSUES.md` flags as enabling account takeover. The milestone's core
value is "auth flows protected by a test suite," yet the token-consumption half of the
reset flow is untested. Critically, the expiry-boundary logic (expired token must be
rejected; valid unexpired token must succeed and null out
`resetPasswordToken`/`resetPasswordExpiresAt`) has no regression protection.
**Fix:** Add a `resetPassword` suite covering at minimum: (1) valid unexpired token
updates the password (verify via `validatePassword`) and clears both reset columns;
(2) expired token (`resetPasswordExpiresAt` in the past) throws
`'The password reset token is invalid or has expired.'`; (3) unknown/garbage token
throws the same message. Example for the expiry case:
```javascript
it('rejects an expired reset token', async () => {
  const user = await createTestUser({
    resetPasswordToken: 'expired-token',
    resetPasswordExpiresAt: new Date(Date.now() - 60_000)
  });
  const { errors } = await graphql(RESET_PASSWORD_MUTATION, {
    token: 'expired-token', password: 'NewPassword123!'
  });
  expect(errors[0].message).toBe('The password reset token is invalid or has expired.');
  await user.reload();
  expect(user.resetPasswordToken).toBe('expired-token'); // unchanged on failure
});
```

### WR-02: Dashboard ADMIN test has vacuous assertions and cannot catch a regression

**File:** `backend/src/resolvers/dashboard.test.js:26-35`
**Issue:** The test title promises "a populated users list for an ADMIN user," but the
assertions are `expect(data.dashboard.users).not.toBeNull()` and
`expect(Array.isArray(data.dashboard.users)).toBe(true)`. An empty array `[]` satisfies
both — so if the resolver regressed to returning `[]` (or dropped the admin's own row),
the test would still pass. The queried `data.dashboard.user` field is never asserted at
all. This is exactly the false-confidence failure mode the suite is meant to prevent.
**Fix:** Assert the list is actually populated and shaped correctly, and assert the
`user` field:
```javascript
expect(data.dashboard.users.length).toBeGreaterThanOrEqual(1);
expect(data.dashboard.users.map((u) => u.id)).toContain(String(admin.id));
expect(data.dashboard.user.id).toBe(String(admin.id));
expect(data.dashboard.user.role).toBe('ADMIN');
```

### WR-03: Assertion couples to Sequelize's internal validation message string

**File:** `backend/src/resolvers/register.test.js:73`
**Issue:** `expect(errors[0].message).toBe('Validation error: Validation isEmail on email failed')`
asserts the exact wording produced by Sequelize's built-in validator, not any message
the application controls. This string is an ORM implementation detail and has changed
between Sequelize major/minor versions; a routine dependency bump (Sequelize is `^6.37.5`,
so minor upgrades auto-resolve) can flip this test to red without any application change —
a "fails loudly" false positive that erodes trust in the suite. It also silently
enshrines the fact that the resolver leaks raw ORM validation text to API clients.
**Fix:** Assert on the stable, controllable part of the contract rather than the exact
ORM phrasing, e.g. `expect(errors[0].message).toMatch(/isEmail/i)` or assert
`data` is null and an error exists; and consider filing a follow-up to have the resolver
normalize validation errors into an app-owned message.

### WR-04: `createTestUser` email uniqueness relies on `Date.now()` millisecond resolution

**File:** `backend/test/helpers.js:23`
**Issue:** The default email is `` `test-${Date.now()}@example.com` ``. Two calls within
the same millisecond (or two calls in a loop) produce identical emails, and because
`email` is `unique` with a `beforeValidate` lowercase/trim, the second `User.create`
throws a unique-constraint error. No current test calls `createTestUser` twice without an
explicit email, so the bug is latent — but it is a flaky-test trap for the next author
who adds a multi-user test, directly at odds with the "isolated, deterministic" testing
goal.
**Fix:** Use a monotonic counter or a random suffix that cannot collide:
```javascript
let seq = 0;
export async function createTestUser(overrides = {}) {
  seq += 1;
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${seq}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    ...overrides
  });
}
```

## Info

### IN-01: `graphql()` helper does not guard the response `kind`

**File:** `backend/test/helpers.js:8-14`
**Issue:** `graphql()` returns `response.body.singleResult` unconditionally. If a future
operation triggers an incremental/streamed response (`body.kind !== 'single'`),
`singleResult` is `undefined` and every downstream `{ data, errors }` destructure yields
`undefined`, producing confusing `TypeError: Cannot read properties of undefined` failures
rather than a clear diagnostic. Not triggerable by the current queries.
**Fix:** Assert the kind before returning:
```javascript
if (response.body.kind !== 'single') {
  throw new Error(`Unexpected response kind: ${response.body.kind}`);
}
return response.body.singleResult;
```

### IN-02: `KNOWN-ISSUES.md` line range is off by one

**File:** `KNOWN-ISSUES.md:11`
**Issue:** The entry cites `backend/src/resolvers/user.resolver.js:48-61`, but the
`requestPasswordReset` resolver actually spans lines 48-62. Minor documentation drift
that will worsen as the file changes.
**Fix:** Update to `:48-62`, or reference the function name instead of a line range to
avoid future drift.

### IN-03: `resetTables` only truncates the `User` model

**File:** `backend/test/helpers.js:16-18`
**Issue:** `resetTables` hard-codes `models.User`. Correct today (User is the only model),
but the moment a second domain model is added (the codebase's barrel pattern explicitly
anticipates this), tests will silently leak state across cases because the new table is
never reset.
**Fix:** Iterate the registered models generically, e.g.
`for (const m of Object.values(models)) await m.destroy({ where: {}, truncate: true });`
(mind FK/truncate ordering if associations are added later).

---

_Reviewed: 2026-07-11T23:52:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
