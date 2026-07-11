# Phase 2: Backend Unit Tests - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 2 (both new spec files)
**Analogs found:** 2 / 2 (strong matches for both)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/src/utils/auth.test.js` | test (unit, utility) | request-response (JWT verify) + transform (token/reset-token creation) + event-driven (guard throw/no-throw) | `backend/test/guard.test.js` | exact (same role: unit-tests a `utils`-style pure function with `env` mutation/restore convention) |
| `backend/src/models/User.test.js` | test (unit, model) | transform (hook-driven hashing) + CRUD-adjacent (validated instance method) | `backend/src/models/database.test.js` | role-match (same directory/co-location convention, same `models`-import style; database.test.js is integration not pure-unit, so treat as structural analog only — see note below) |

Both new files are **new files**, not modifications. No application source (`backend/src/utils/auth.js`, `backend/src/models/User.js`) is to be touched.

## Pattern Assignments

### `backend/src/utils/auth.test.js` (test, utility — JWT/guards/reset-token)

**Primary analog:** `backend/test/guard.test.js` (structure/style) — full file, 34 lines, read in one pass.
**Secondary analog:** `backend/src/smoke.test.js` (co-location precedent inside `src/`, trivial).

**Imports pattern** (`backend/test/guard.test.js` lines 1-3):
```javascript
import { describe, it, expect, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { assertTestDatabase } from './guard.js';
```
For the new co-located file at `backend/src/utils/auth.test.js`, adapt relative paths to same-directory imports (per RESEARCH.md's verified example):
```javascript
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { signToken, getUserFromRequest, requireAuth, requireAdmin, createResetToken, resetTokenExpiry } from './auth.js';
```

**describe/it structure pattern** (`backend/test/guard.test.js` lines 8-34):
```javascript
describe('assertTestDatabase', () => {
  afterEach(() => {
    env.nodeEnv = originalNodeEnv;
    env.database.name = originalDbName;
  });

  it('does not throw when NODE_ENV is test and DB_NAME ends with _test', () => {
    env.nodeEnv = 'test';
    env.database.name = 'portofolio_test';

    expect(() => assertTestDatabase()).not.toThrow();
  });

  it('throws when NODE_ENV is not test, even if DB_NAME ends with _test', () => {
    env.nodeEnv = 'development';
    env.database.name = 'portofolio_test';

    expect(() => assertTestDatabase()).toThrow();
  });
});
```
Copy this exact shape for `requireAuth`/`requireAdmin` — one `describe` block per function under test, one `it` per case in a matrix (ADMIN passes / USER throws / null throws), asserting via `expect(() => fn(arg)).toThrow()` / `.not.toThrow()`. No `afterEach` is needed for the guard tests (no shared mutable state), but keep the pattern in mind if a future case mutates `env`.

**Env-mutation-and-restore pattern** (`backend/test/guard.test.js` lines 5-6, 9-12) — only relevant if a case needs to vary `env.*` at runtime (not needed for D-01–D-07 per RESEARCH.md Pitfall 4, since the "wrong secret" trick signs with a literal string instead):
```javascript
const originalNodeEnv = env.nodeEnv;
const originalDbName = env.database.name;
// ...
afterEach(() => {
  env.nodeEnv = originalNodeEnv;
  env.database.name = originalDbName;
});
```

**Core pattern — stubbed-dependency verify path** (verified empirically by gsd-phase-researcher, see RESEARCH.md "Pattern 1", lines 103-131 of 02-RESEARCH.md):
```javascript
it('resolves the user via models.User.findByPk for a valid token', async () => {
  const token = signToken({ id: 42, role: 'ADMIN' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let calledWith;
  const stubModels = { User: { findByPk: (id) => { calledWith = id; return { id, role: 'ADMIN' }; } } };

  const result = await getUserFromRequest(req, stubModels);

  expect(calledWith).toBe(42);
  expect(result).toEqual({ id: 42, role: 'ADMIN' });
});

it('returns null (never throws) for an expired token — findByPk is never reached', async () => {
  const expired = jwt.sign({ sub: 1, role: 'USER' }, env.jwtSecret, { expiresIn: '-1s' });
  const req = { headers: { authorization: `Bearer ${expired}` } };
  const stubModels = { User: { findByPk: () => { throw new Error('should not be called'); } } };

  const result = await getUserFromRequest(req, stubModels);

  expect(result).toBeNull();
});
```
Note the stub shape: `findByPk: (id) => ...` — **single argument only** (matches the real call site `backend/src/utils/auth.js:16`, `models.User.findByPk(payload.sub)`). Do not destructure a second `options` parameter.

**Tampered-token pattern** (RESEARCH.md lines 232-240):
```javascript
const parts = token.split('.');
const lastChar = parts[2].slice(-1);
parts[2] = parts[2].slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
const tampered = parts.join('.');
expect(() => jwt.verify(tampered, secret)).toThrow(jwt.JsonWebTokenError);
```
For `getUserFromRequest`, feed the tampered/wrong-secret token through the same "returns null" assertion as the expired-token case above (function swallows all `jwt.verify` errors — `backend/src/utils/auth.js` lines 14-19 `try { ... } catch { return null; }`).

**Error handling pattern (source under test)** (`backend/src/utils/auth.js` lines 14-19, 22-29):
```javascript
try {
  const payload = jwt.verify(token, env.jwtSecret);
  return models.User.findByPk(payload.sub);
} catch {
  return null;
}
```
```javascript
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}
export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
Tests should assert throw/no-throw (per CONTEXT.md discretion item — exact message assertions optional), matching `guard.test.js`'s `.toThrow()`/`.not.toThrow()` style (no message-string assertions there either).

**Reset-token pattern (source under test)** (`backend/src/utils/auth.js` lines 31-37):
```javascript
export function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}
export function resetTokenExpiry() {
  return new Date(Date.now() + env.resetTokenExpiresMinutes * 60 * 1000);
}
```
Assertions (RESEARCH.md lines 252): `expect(createResetToken()).toMatch(/^[0-9a-f]{64}$/)`; call twice, assert inequality; `expect(resetTokenExpiry().getTime()).toBeGreaterThan(Date.now())`.

---

### `backend/src/models/User.test.js` (test, model — password hashing hook)

**Primary analog (co-location + import convention):** `backend/src/models/database.test.js` (full file, 15 lines, read in one pass) — note this analog is a **DB-touching integration spec**, not a pure unit test; copy only its co-location/import-style, not its DB-authenticate pattern (Phase 2 must stay DB-free per D-08).
**Secondary analog (assertion style):** `backend/test/guard.test.js` (same `describe`/`it`/`expect` conventions as above).

**Imports pattern** (`backend/src/models/database.test.js` lines 1-2):
```javascript
import { describe, it, expect } from 'vitest';
import { sequelize, models } from './index.js';
```
Adapted for the new file (per RESEARCH.md's verified "Pattern 2" example, RESEARCH.md lines 140-142) — no `sequelize` import needed since no DB connection is opened:
```javascript
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from './index.js';

const { User } = models;
```

**Core pattern — in-memory hook invocation, no DB** (verified empirically by gsd-phase-researcher, RESEARCH.md lines 146-157):
```javascript
it('hashes passwordHash via the real beforeCreate hook, without persisting', async () => {
  const plain = 'Password123!';
  const user = User.build({ name: 'Test', email: 'test@example.com', passwordHash: plain, role: 'USER' });

  expect(user.passwordHash).toBe(plain); // build() alone does NOT hash

  await User.runHooks('beforeCreate', user);

  expect(user.passwordHash).not.toBe(plain);
  expect(await bcrypt.compare(plain, user.passwordHash)).toBe(true);
  expect(user.isNewRecord).toBe(true); // never saved to a DB
});
```
**Critical:** use `User.runHooks('beforeCreate', user)` — NOT `User.build()` alone (Pitfall 1 in RESEARCH.md) and NOT reaching into `User.options.hooks.beforeCreate[0](...)` (anti-pattern in RESEARCH.md). This is the sanctioned internal entry point `save()`/`create()` themselves call (`node_modules/sequelize/lib/model.js:2436`).

**validatePassword pattern (source under test)** (`backend/src/models/User.js` lines 5-7):
```javascript
async validatePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
}
```
Test on a built-not-saved instance with a known real bcrypt hash (Don't Hand-Roll table, RESEARCH.md line 186):
```javascript
it('accepts the correct password against a known bcrypt hash', async () => {
  const known = await bcrypt.hash('Password123!', 12);
  const user = User.build({ passwordHash: known });

  expect(await user.validatePassword('Password123!')).toBe(true);
  expect(await user.validatePassword('WrongPassword')).toBe(false);
});
```

**Error handling / edge cases (source under test)** (`backend/src/models/User.js` lines 50-59):
```javascript
hooks: {
  beforeValidate(user) { if (user.email) user.email = user.email.toLowerCase().trim(); },
  async beforeCreate(user) { if (user.passwordHash) user.passwordHash = await bcrypt.hash(user.passwordHash, 12); },
  async beforeUpdate(user) { if (user.changed('passwordHash')) user.passwordHash = await bcrypt.hash(user.passwordHash, 12); }
}
```
Only `beforeCreate` is in phase scope (BE-02); `beforeValidate`/`beforeUpdate` are out of scope per CONTEXT.md's domain boundary — do not add extra assertions for them.

---

## Shared Patterns

### Vitest describe/it/expect conventions
**Source:** `backend/test/guard.test.js` (all three spec files in the repo — `guard.test.js`, `smoke.test.js`, `database.test.js` — use identical `describe`/`it`/`expect` style with no custom test utilities or setup/teardown beyond `afterEach` where state is mutated).
**Apply to:** Both new files.
```javascript
import { describe, it, expect } from 'vitest';
```
No `beforeEach`/`afterEach` needed in either new file unless a test mutates shared module state (neither does, per D-08's pure-unit posture — `env` mutation is avoided per RESEARCH.md Pitfall 4, and no `models`/`env` global state is altered across tests).

### Co-located `*.test.js` convention
**Source:** `backend/src/smoke.test.js`, `backend/src/models/database.test.js` (both already co-located in `src/`, unlike the earlier `backend/test/guard.test.js` which predates this convention).
**Apply to:** Both new files — confirms `backend/src/utils/auth.test.js` and `backend/src/models/User.test.js` (siblings of `auth.js`/`User.js`) are the correct locations, per Phase 1 D-06 and CONTEXT.md's discretion note.

### No mocking library needed
**Source:** RESEARCH.md "Don't Hand-Roll" table + Pattern 1/3 examples — confirmed no spec file in this repo currently uses `vi.mock`, `vi.fn()`, or any mocking library; stubs are hand-rolled plain objects (`{ User: { findByPk: (id) => ... } }`).
**Apply to:** Both new files — do not introduce `vi.mock`/`sinon`/`proxyquire`; a hand-rolled stub object is sufficient and matches existing project convention (there is no existing precedent for a mocking library in this codebase to point to, which is itself the pattern to follow).

### `env` singleton read-once caveat
**Source:** `backend/src/config/env.js` lines 9-31 (module-level `dotenv.config()` + object literal, evaluated once at import time); demonstrated by `backend/test/guard.test.js` lines 5-12 (mutates `env.nodeEnv`/`env.database.name` directly on the exported object, not via `process.env`).
**Apply to:** `auth.test.js` only if a future case needs a different secret/expiry — sign with a literal string instead of trying to vary `process.env.JWT_SECRET` (RESEARCH.md Pitfall 4). Not needed for the D-01–D-07 cases as currently scoped.

## No Analog Found

None. Both new files have a strong structural analog (`guard.test.js` for assertion/describe style, `database.test.js`/`smoke.test.js` for `src/`-co-location import style), and RESEARCH.md additionally provides empirically-verified, ready-to-adapt code examples for every required assertion (JWT round-trip, expired/tampered rejection, hook-driven hashing, guard matrix, reset-token shape) — no gap requires inventing a pattern from scratch.

## Metadata

**Analog search scope:** `backend/test/`, `backend/src/**/*.test.js`, `backend/src/utils/auth.js`, `backend/src/models/User.js`, `backend/src/models/index.js`, `backend/src/config/env.js`, `backend/vitest.config.js`
**Files scanned:** 10 (3 existing test specs, 4 source-under-test/config files, 1 test helper, 1 vitest config, 1 models barrel)
**Pattern extraction date:** 2026-07-12
