# Phase 9: Session Revocation via passwordChangedAt - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 6 (3 modified source files + 3 modified/extended test files)
**Analogs found:** 6 / 6 (all are self-analogs — every file in scope is an existing file being extended, so the "closest analog" for each is itself: the same file's existing sibling column/branch/test)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/models/User.js` | model | CRUD (schema + hook) | itself — `resetPasswordExpiresAt` column def (lines 41-44) + `beforeUpdate` hook (lines 57-59) | exact (same file, sibling pattern) |
| `backend/src/utils/auth.js` | utility (auth/session) | request-response (per-request auth gate) | itself — `getUserFromRequest` (lines 9-20) + `createResetToken` (lines 31-33) | exact (same file, sibling pattern) |
| `backend/src/resolvers/user.resolver.js` | resolver | request-response (GraphQL mutation) | itself — `requestPasswordReset`/`resetPassword` mutations (lines 60-101) | exact (same file, being extended in place) |
| `backend/src/utils/auth.test.js` | test (unit) | request-response | itself — `describe('getUserFromRequest', ...)` block (lines 23-78) | exact |
| `backend/src/models/User.test.js` | test (unit) | CRUD (hook) | itself — `describe('beforeCreate hashing hook', ...)` block (lines 23-49), esp. `User.runHooks(...)` pattern | exact |
| `backend/src/resolvers/resetPassword.test.js` | test (integration) | request-response (GraphQL) | itself — existing `createTestUser({ resetPasswordToken: ... })` fixtures (lines 115-119, 134-138, 154-159) + mailer assertion (line 59-61) | exact |

No cross-file analogs were needed: every file in scope already contains the exact structural pattern (column definition shape, hook branch, null-degrading auth check, unit test harness) that the new code must extend. This is a "grow the existing pattern" phase, not a "port a pattern from elsewhere" phase.

## Pattern Assignments

### `backend/src/models/User.js` (model, CRUD)

**Analog:** itself — `resetPasswordExpiresAt` column (lines 41-44) for the column-definition shape; `beforeUpdate` hook (lines 57-59) for the hook-branch shape.

**Column definition pattern to copy** (`backend/src/models/User.js:37-44`):
```javascript
resetPasswordToken: {
  type: DataTypes.STRING,
  allowNull: true
},
resetPasswordExpiresAt: {
  type: DataTypes.DATE,
  allowNull: true
}
```
New column follows the identical `{ type, allowNull: true }` shape, but with explicit fractional-second precision per RESEARCH.md Pitfall 1:
```javascript
passwordChangedAt: {
  type: DataTypes.DATE(3),
  allowNull: true,
  defaultValue: null
}
```
Insert as a new sibling key inside the `User.init({...})` attributes object (`backend/src/models/User.js:12-45`), after `resetPasswordExpiresAt`.

**Hook pattern to extend** (`backend/src/models/User.js:57-59`):
```javascript
async beforeUpdate(user) {
  if (user.changed('passwordHash')) user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
}
```
Add the stamp **inside** this existing guarded branch (do not add a new hook, do not check `changed('passwordChangedAt')`):
```javascript
async beforeUpdate(user) {
  if (user.changed('passwordHash')) {
    user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
    user.passwordChangedAt = new Date();
  }
}
```
This mirrors the existing single-line-to-block expansion already done nowhere else in this file — the guard clause (`if (user.changed('passwordHash'))`) is the reusable asset; only the body grows from one statement to two.

---

### `backend/src/utils/auth.js` (utility, request-response)

**Analog:** itself — `getUserFromRequest` (lines 9-20) for the revocation check insertion point; `createResetToken` (lines 31-33) for the `crypto`-based helper-function shape.

**Imports pattern** (`backend/src/utils/auth.js:1-3`) — no new imports needed, `crypto` is already imported:
```javascript
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
```

**Core pattern — current `getUserFromRequest`** (`backend/src/utils/auth.js:9-20`):
```javascript
export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return models.User.findByPk(payload.sub);
  } catch {
    return null;
  }
}
```
Extend by inserting the revocation check between the `findByPk` call and the return, per RESEARCH.md Pattern 1 (D-01: strict `<`, whole-second floor; D-05: NULL never revokes):
```javascript
export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await models.User.findByPk(payload.sub);
    if (!user) return null;

    if (user.passwordChangedAt) {
      const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < changedAtSeconds) return null;
    }

    return user;
  } catch {
    return null;
  }
}
```

**Error-handling pattern to preserve** (`backend/src/utils/auth.js:14-19`): the existing `try { ... } catch { return null; }` shape — every failure mode (missing header, expired token, bad signature, wrong secret, revoked-by-passwordChangedAt) must degrade to `null`, never throw. The new `if (!user) return null;` and revocation-`return null` both live inside this same `try` block, consistent with the file's established "auth failures degrade to null" convention (see CLAUDE.md `## Error Handling`).

**Helper-function pattern to copy for `hashResetToken`** (`backend/src/utils/auth.js:31-33`, `createResetToken`):
```javascript
export function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}
```
New function follows the identical "one-line named export wrapping a `crypto` call" shape:
```javascript
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```
Place as a new named export alongside `createResetToken`/`resetTokenExpiry` (`backend/src/utils/auth.js:31-37`).

---

### `backend/src/resolvers/user.resolver.js` (resolver, request-response)

**Analog:** itself — `requestPasswordReset` (lines 60-87) and `resetPassword` (lines 88-101) mutations, already established in this file.

**Imports pattern to extend** (`backend/src/resolvers/user.resolver.js:1`):
```javascript
import { createResetToken, requireAdmin, requireAuth, resetTokenExpiry, signToken } from '../utils/auth.js';
```
Add `hashResetToken` to this named-import list (alphabetically inserted per the file's existing sorted-import convention):
```javascript
import { createResetToken, hashResetToken, requireAdmin, requireAuth, resetTokenExpiry, signToken } from '../utils/auth.js';
```

**Core pattern — `requestPasswordReset` token persistence** (`backend/src/resolvers/user.resolver.js:67-74`):
```javascript
const resetToken = createResetToken();
user.resetPasswordToken = resetToken;
user.resetPasswordExpiresAt = resetTokenExpiry();
await user.save();

sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
  console.error('Failed to send password reset email:', err);
});
```
Modify to persist the hash while emailing the raw token (RESET-06 / D-06/D-07):
```javascript
const resetToken = createResetToken();
user.resetPasswordToken = hashResetToken(resetToken);
user.resetPasswordExpiresAt = resetTokenExpiry();
await user.save();

sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
  console.error('Failed to send password reset email:', err);
});
```
Note: `resetToken` (raw) remains the local variable emailed; only the assignment to `user.resetPasswordToken` changes. This is a one-line diff inside the existing `issueResetToken` inner function (`backend/src/resolvers/user.resolver.js:63-75`) — the surrounding anti-enumeration timing-floor structure (CR-01, lines 60-86) is untouched.

**Core pattern — `resetPassword` lookup** (`backend/src/resolvers/user.resolver.js:88-91`):
```javascript
resetPassword: async (_parent, { token, password }, { models }) => {
  const user = await models.User.findOne({ where: { resetPasswordToken: token } });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new Error('The password reset token is invalid or has expired.');
  }
```
Modify only the `where` clause to look up by hash:
```javascript
resetPassword: async (_parent, { token, password }, { models }) => {
  const user = await models.User.findOne({ where: { resetPasswordToken: hashResetToken(token) } });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new Error('The password reset token is invalid or has expired.');
  }
```
Everything below this line (`backend/src/resolvers/user.resolver.js:94-100`: `assertPasswordStrength`, `user.passwordHash = password`, clearing `resetPasswordToken`/`resetPasswordExpiresAt`, `await user.save()`) is unchanged — `passwordChangedAt` is set automatically via the `User.js` `beforeUpdate` hook when `user.save()` runs, since `passwordHash` is being reassigned (`user.changed('passwordHash')` will be true). **Do not** add a resolver-level `user.passwordChangedAt = new Date()` assignment here — that would violate the "stamp only inside the model hook" pattern (RESEARCH.md Anti-Patterns).

**Error handling pattern to preserve**: `throw new Error('...')` for validation/lookup failures (matches CLAUDE.md `## Error Handling` — plain `Error` objects, Apollo surfaces them as GraphQL errors). No new error types introduced.

---

### `backend/src/utils/auth.test.js` (test, unit)

**Analog:** itself — existing `describe('getUserFromRequest', ...)` block (lines 23-78), specifically the "mocked `req` + mocked `models.User.findByPk`" harness.

**Test harness pattern to copy** (`backend/src/utils/auth.test.js:24-34`):
```javascript
it('resolves the stubbed user for a valid Bearer token', async () => {
  const token = signToken({ id: 7, role: 'USER' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let calledWith;
  const models = { User: { findByPk: (id) => { calledWith = id; return { id, role: 'USER' }; } } };

  const result = await getUserFromRequest(req, models);

  expect(calledWith).toBe(7);
  expect(result).toEqual({ id: 7, role: 'USER' });
});
```
New `describe('getUserFromRequest — passwordChangedAt revocation (SESS-03)', ...)` block follows this exact shape but stubs `findByPk` to return a user with a `passwordChangedAt` field, and uses `jwt.sign(..., { iat: ... })` directly (bypassing `signToken`, since `signToken` doesn't accept an explicit `iat`) — see RESEARCH.md "Code Examples" section for the full three-test block (same-second accept, prior-second reject, NULL-never-revokes). This is a same-file, same-pattern extension — no new import beyond `jwt` (already imported line 2).

**Critical constraint (RESEARCH.md Pitfall 2):** these tests MUST be direct unit tests of `getUserFromRequest` in this file — NOT written via `backend/test/helpers.js`'s `graphql()` helper, which injects `user` directly into `contextValue` and never calls `getUserFromRequest` at all (`backend/test/helpers.js:14-20`). This file's existing pattern (mocked `req`/`models`, direct function call) is the only one that actually exercises the code under test.

---

### `backend/src/models/User.test.js` (test, unit)

**Analog:** itself — `describe('beforeCreate hashing hook', ...)` block (lines 23-49), specifically the `User.runHooks(...)` invocation pattern.

**Test harness pattern to copy** (`backend/src/models/User.test.js:35-48`):
```javascript
it('hashes the password when the beforeCreate hook runs, without persisting', async () => {
  const user = User.build({
    name: 'Test',
    email: 'test@example.com',
    passwordHash: 'Password123!',
    role: 'USER'
  });

  await User.runHooks('beforeCreate', user);

  expect(user.passwordHash).not.toBe('Password123!');
  await expect(bcrypt.compare('Password123!', user.passwordHash)).resolves.toBe(true);
  expect(user.isNewRecord).toBe(true);
});
```
New test asserts `passwordChangedAt` stamping is gated on `changed('passwordHash')`, using `User.runHooks('beforeUpdate', user)` (mirroring `beforeCreate` usage above but for the `beforeUpdate` hook under test). To make `user.changed('passwordHash')` true, build the instance, then mutate `passwordHash` post-build (Sequelize instances only report `changed()` on fields set after initial construction/reload) — or use `User.build(...)` followed by `user.set('passwordHash', 'NewPass123!')` before calling `runHooks('beforeUpdate', user)`. Add a companion test asserting `passwordChangedAt` stays untouched when only `name`/`role` changes (no `passwordHash` mutation) — this is the SC-1 regression pin (SESS-01) referenced in RESEARCH.md.

---

### `backend/src/resolvers/resetPassword.test.js` (test, integration)

**Analog:** itself — existing seeded fixtures (lines 115-119, 134-138, 154-159) and the mailer-argument assertion (lines 59-61).

**Fixture pattern currently in place** (`backend/src/resolvers/resetPassword.test.js:115-119`):
```javascript
const user = await createTestUser({
  email: 'reset-me@example.com',
  resetPasswordToken: 'a-valid-reset-token',
  resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
});
```
Per RESEARCH.md Pitfall 4, every such fixture (3 occurrences: `'a-valid-reset-token'` line 117, `'single-use-token'` line 136, `'expired-token'` line 157) must wrap the seeded value with `hashResetToken(...)` while the mutation-argument `token:` value (lines 122, 141/146, 163) stays the raw literal string unchanged:
```javascript
const user = await createTestUser({
  email: 'reset-me@example.com',
  resetPasswordToken: hashResetToken('a-valid-reset-token'),
  resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
});
```
Add `import { hashResetToken } from '../utils/auth.js';` to this test file's import block (`backend/src/resolvers/resetPassword.test.js:1-9`).

**Mailer-assertion pattern to modify** (`backend/src/resolvers/resetPassword.test.js:59-61`):
```javascript
await vi.waitFor(() =>
  expect(sendPasswordResetEmail).toHaveBeenCalledWith({ to: user.email, token: user.resetPasswordToken })
);
```
Per RESEARCH.md Pitfall 5, this compares the emailed token directly against the reloaded DB column — which will diverge post-RESET-06 (DB holds hash, email gets raw). Capture the mock call argument and compare its hash to the DB value instead:
```javascript
await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalled());
const rawToken = sendPasswordResetEmail.mock.calls[0][0].token;
expect(hashResetToken(rawToken)).toBe(user.resetPasswordToken);
```
This must run after `await user.reload();` (already present at line 55) so `user.resetPasswordToken` reflects the persisted hash.

**Existing test structure to preserve unchanged**: `beforeEach` truncation (lines 39-42), `vi.mock('../services/mailer.js', ...)` (lines 4-6), the anti-enumeration timing test (lines 74-103), and the single-use/expiry assertions' error-message checks (lines 150, 167) — only the fixture seed values and the one mailer assertion change; the pass/fail logic paths under test are untouched.

---

## Shared Patterns

### Null-degrading auth failure (all `getUserFromRequest` changes)
**Source:** `backend/src/utils/auth.js:14-19` (existing `try/catch { return null }` wrapper)
**Apply to:** The new revocation check inside `getUserFromRequest` — it must return `null`, never throw, consistent with every other failure branch in this function (missing header at line 12, JWT verify/decode failure in the `catch` at line 18).
```javascript
try {
  const payload = jwt.verify(token, env.jwtSecret);
  const user = await models.User.findByPk(payload.sub);
  if (!user) return null;
  // revocation check also returns null, not throw
} catch {
  return null;
}
```

### Guarded hook branch, not resolver-level side effect
**Source:** `backend/src/models/User.js:57-59` (`beforeUpdate`, gated on `user.changed('passwordHash')`)
**Apply to:** `passwordChangedAt` stamping (SESS-02) — must live inside this exact guard, never as a `resolvers/user.resolver.js` assignment. This is the single invariant every password-changing code path (currently only `resetPassword`, but future ones too) inherits for free.

### One-line named-export helper wrapping `node:crypto`
**Source:** `backend/src/utils/auth.js:31-33` (`createResetToken`)
**Apply to:** `hashResetToken` — same file, same "no new import, one-line function body, named export" shape.

### Sequelize column definition: `{ type, allowNull: true }` for optional metadata fields
**Source:** `backend/src/models/User.js:41-44` (`resetPasswordExpiresAt`)
**Apply to:** `passwordChangedAt` column definition — identical shape, with `DataTypes.DATE(3)` instead of bare `DataTypes.DATE` (RESEARCH.md Pitfall 1: MySQL rounds, not truncates, fractional seconds on under-precision columns).

### Direct-unit-test harness for auth utilities (mocked req + mocked models, no DB, no GraphQL helper)
**Source:** `backend/src/utils/auth.test.js:24-34` (existing `getUserFromRequest` test)
**Apply to:** All new SESS-03 tests. Explicitly do NOT use `backend/test/helpers.js`'s `graphql()` helper for this — it bypasses `getUserFromRequest` entirely by injecting `user` straight into `contextValue` (`backend/test/helpers.js:14-20`), per RESEARCH.md Pitfall 2.

### GraphQL integration test harness (`graphql()` + `createTestUser()` + `resetTables()`)
**Source:** `backend/test/helpers.js:14-34`, consumed throughout `backend/src/resolvers/resetPassword.test.js`
**Apply to:** RESET-06 fixture updates and any `resetPassword`/`requestPasswordReset` behavioral test — unchanged harness, only fixture *values* change (raw → hashed).

## No Analog Found

None. Every file in scope is an existing file being extended along an already-established structural pattern within that same file (column definitions, hook branches, helper functions, and test harnesses all have a directly adjacent sibling to copy from). No new files, no new architectural layer, no need to borrow patterns from an unrelated part of the codebase.

## Metadata

**Analog search scope:** `backend/src/models/User.js`, `backend/src/utils/auth.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/utils/auth.test.js`, `backend/src/models/User.test.js`, `backend/src/resolvers/resetPassword.test.js`, `backend/test/helpers.js`, `backend/src/models/index.js`, `backend/src/server.js` (context wiring, read for confirmation only — not modified this phase)
**Files scanned:** 9
**Pattern extraction date:** 2026-07-20
