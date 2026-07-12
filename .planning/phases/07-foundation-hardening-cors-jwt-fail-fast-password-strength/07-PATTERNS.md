# Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 6 (in-scope for this phase)
**Analogs found:** 4 exact / role-match, 2 no-analog (net-new patterns for this repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/server.js` (CORS callback + app export) | middleware/config | request-response | itself (current CORS block) + `backend/test/guard.js` (pure-assertion style) | partial — refactor pattern is net-new |
| `backend/src/config/env.js` (fail-fast assertion) | config | transform (import-time) | `backend/test/guard.js` `assertTestDatabase()` | role-match (closest "env-gated throw" precedent in repo) |
| `backend/src/resolvers/user.resolver.js` (`register`, `resetPassword`) | resolver | CRUD / request-response | itself — existing `register`/`resetPassword` bodies; guard-call convention from `requireAuth`/`requireAdmin` | exact (same file, same convention) |
| `backend/src/utils/passwordPolicy.js` (new) | utility | transform | `backend/src/utils/auth.js` | exact |
| `backend/test/helpers.js` (additive supertest harness) | test helper / HTTP harness | request-response | itself (existing `graphql()` in-process harness) — structural analog only | no analog for the *supertest* part (net-new to repo) |
| New test files (CORS pure-fn test, `assertProductionSecrets` test, `passwordPolicy.test.js`, password-length additions to `register.test.js`/`resetPassword.test.js`, new supertest CORS integration test) | test | request-response / unit | `backend/src/resolvers/register.test.js` (resolver-integration shape); `backend/src/utils/auth.test.js` (pure-function unit shape); `backend/test/guard.test.js` (env-mutation fail-fast shape) | exact |

## Pattern Assignments

### `backend/src/server.js` (middleware/config, request-response)

**Analog:** current file itself (`backend/src/server.js:1-43`), plus `backend/test/guard.js` for the "pure exported assertion" style referenced by this phase's D-05/discretion note.

**Current CORS block to replace** (lines 17-23):
```javascript
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true
}));
```
This is the exact echo bug (CORS-01): the rejected `origin` value is interpolated straight into the client-visible `Error` message. Per D-02, replace with a `console.warn`-logged origin server-side and the fixed constant `'Not allowed by CORS.'` in the callback's `Error`. No existing `console.warn` call exists anywhere in the codebase — the only console precedent is `console.log` at boot (`server.js:42`) and conditional Sequelize query logging (`backend/src/config/database.js:8`, `logging: env.nodeEnv === 'development' ? console.log : false`) — so this is a new but conventional Node built-in call, not a new dependency.

**Import block** (lines 1-9) — follow exactly for any new imports (e.g. if extracting a `corsOriginValidator`/`buildCorsOptions` pure function per Claude's Discretion, add it here as a named import from a new sibling module, matching the existing flat relative-import style):
```javascript
import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { env } from './config/env.js';
import { initializeDatabase, models } from './models/index.js';
import { typeDefs } from './schemas/index.js';
import { resolvers } from './resolvers/index.js';
import { getUserFromRequest } from './utils/auth.js';
```

**`app.listen()` decoupling** (lines 11, 41-43) — currently `app` is created and `.listen()`'d unconditionally at module-import time with no `export`:
```javascript
const app = express();
...
app.listen(env.port, () => {
  console.log(`Backend ready at http://localhost:${env.port}/graphql`);
});
```
No existing analog in this repo for separating an importable `app` from its `.listen()` call — this is a net-new refactor shape this phase introduces (see "No Analog Found" below). Keep the rest of the file's top-level `await` boot sequence (`apollo.start()`, `initializeDatabase()`, `expressMiddleware` mount) unchanged in order; only wrap/guard the final `app.listen(...)` and add `export { app };` (or `export default app;` — Claude's Discretion per CONTEXT.md) so `backend/test/helpers.js` can import `app` without triggering a real port bind.

**Pure-assertion style precedent** — `backend/test/guard.js` (full file, 15 lines) shows this repo's existing "checked at boot/setup, throws a descriptive Error" idiom, useful as a style reference for `assertProductionSecrets`/`corsOriginValidator` if extracted as pure functions:
```javascript
import { env } from '../src/config/env.js';

export function assertTestDatabase() {
  const isTestEnv = env.nodeEnv === 'test';
  const isTestDbName = /_test$/.test(env.database.name);

  if (!isTestEnv || !isTestDbName) {
    throw new Error(
      `Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test", ` +
      `got NODE_ENV=${env.nodeEnv} DB_NAME=${env.database.name}. ` +
      `Check that ENV_FILE points at env/test.env before Vitest loads.`
    );
  }
}
```
Mirror this shape (plain exported function, reads from `env`, throws a template-string `Error`) for whichever pure-function extraction is chosen for CORS/fail-fast — a named export taking plain arguments so it unit-tests without booting Express, exactly as `guard.test.js` unit-tests `assertTestDatabase()` with plain `env` mutations (see excerpt below under `env.js`).

---

### `backend/src/config/env.js` (config, transform/import-time)

**Analog:** `backend/test/guard.js` `assertTestDatabase()` (role-match — closest "env-gated fail-fast throw" precedent in the repo) and `backend/test/guard.test.js` (test shape for it).

**Current `jwtSecret` default to guard** (line 21, full `env` object lines 16-31):
```javascript
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || clientOrigins[0],
  clientOrigins,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  resetTokenExpiresMinutes: Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 30),
  database: { ... }
};
```
Per D-05, the fail-fast must fire only when `nodeEnv === 'production'` AND `jwtSecret` is unset/`'change-me'`, and must be invoked as a pure function taking plain arguments (not inlined into the `dotenv.config()`-driven module) so it unit-tests without module-reset gymnastics — call it after the `env` object is built, at the bottom of this file.

**Test-shape analog** — `backend/test/guard.test.js` (full file) shows exactly how this repo unit-tests an env-gated assertion by mutating the live `env` object and restoring it in `afterEach`:
```javascript
import { describe, it, expect, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { assertTestDatabase } from './guard.js';

const originalNodeEnv = env.nodeEnv;
const originalDbName = env.database.name;

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
For `assertProductionSecrets`, prefer the plain-argument-object variant CONTEXT.md/ARCHITECTURE.md call for (`assertProductionSecrets({ nodeEnv, jwtSecret })`) rather than mutating the live `env` singleton — plain arguments avoid any `afterEach` restore ceremony and test both `test`/`development` (must NOT throw) and `production` (must throw only on the insecure default) with zero shared state. Whichever shape is chosen, `env.js` must call it with `env.nodeEnv`/`env.jwtSecret` after the `env` const is fully built, so importing `env.js` under `NODE_ENV=test`/`development` (the entire existing 51-test v1.0 suite, keyed by `vitest.config.js`'s `process.env.NODE_ENV = 'test'`) never throws.

---

### `backend/src/resolvers/user.resolver.js` (resolver, CRUD/request-response)

**Analog:** itself — existing `register`/`resetPassword` mutation bodies and the `requireAuth`/`requireAdmin` "guard called first" convention used elsewhere in the same file.

**`register` mutation, current body** (lines 25-38) — password-check insertion point is before `models.User.create`:
```javascript
register: async (_parent, { name, email, password }, { models }) => {
  const existingUser = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (existingUser) throw new Error('A user with this email already exists.');

  const userCount = await models.User.count();
  const user = await models.User.create({
    name,
    email,
    passwordHash: password,
    role: userCount === 0 ? 'ADMIN' : 'USER'
  });

  return { token: signToken(user), user };
},
```

**`resetPassword` mutation, current body** (lines 63-74) — password-check insertion point is before `user.passwordHash = password`:
```javascript
resetPassword: async (_parent, { token, password }, { models }) => {
  const user = await models.User.findOne({ where: { resetPasswordToken: token } });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new Error('The password reset token is invalid or has expired.');
  }

  user.passwordHash = password;
  user.resetPasswordToken = null;
  user.resetPasswordExpiresAt = null;
  await user.save();
  return true;
}
```

**Throw-plain-Error convention** (module-wide, e.g. line 27, line 41, line 66-67) — both new checks must follow this exact convention (`throw new Error('<exact message>')`), matching D-01's verbatim message `Password must be at least 8 characters.`:
```javascript
if (existingUser) throw new Error('A user with this email already exists.');
```

**Existing named-import guard style** (line 1) — if `passwordPolicy.js` exports a throwing validator (e.g. `assertValidPassword(password)`), import it the same way `auth.js` helpers are already imported into this file:
```javascript
import { createResetToken, requireAdmin, requireAuth, resetTokenExpiry, signToken } from '../utils/auth.js';
```

---

### `backend/src/utils/passwordPolicy.js` (new file — utility, transform)

**Analog:** `backend/src/utils/auth.js` (exact match — same directory, same "flat named-export pure/near-pure functions" convention).

**Full analog file** (`backend/src/utils/auth.js`, 37 lines) showing the convention to copy — plain named exports, no classes, throws bare `Error` with a user-facing message for guard-style functions:
```javascript
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
`requireAuth`/`requireAdmin` are the closest existing shape to a "throwing validator" — `passwordPolicy.js` should mirror `requireAuth`'s form: a single exported function (name is Claude's Discretion per CONTEXT.md, e.g. `assertPasswordStrength(password)` or `validatePasswordStrength(password)`) that throws `new Error('Password must be at least 8 characters.')` (D-01 exact string) when `password.length < 8`, and returns nothing / returns the password otherwise, so both `register` and `resetPassword` can call it as a one-line guard identical in spirit to `requireAuth(user)`.

**Zero-dependency constraint (D-03):** no `import` of `validator` or any npm package — plain `password.length < 8` check only, per the NIST length-only policy (D-04): no composition/uppercase/digit/symbol rules, no max length, no blocklist.

---

### `backend/test/helpers.js` (additive — test helper / HTTP harness)

**Analog:** itself — existing in-process `graphql()` harness (full file, 28 lines) is the structural analog for how this repo shapes test helpers (plain named async exports, imports models/schema/resolvers directly, no class wrapper):
```javascript
import { ApolloServer } from '@apollo/server';
import { models } from '../src/models/index.js';
import { typeDefs } from '../src/schemas/index.js';
import { resolvers } from '../src/resolvers/index.js';

const server = new ApolloServer({ typeDefs, resolvers });

export async function graphql(query, variables, user = null) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user } }
  );
  return response.body.singleResult;
}

export async function resetTables() {
  await models.User.destroy({ where: {}, truncate: true });
}

export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    ...overrides
  });
}
```
This is additive-only per CONTEXT.md — do not remove/rename `graphql()`, `resetTables()`, `createTestUser()`; all existing resolver tests depend on this exact API surface. Add a new named export (e.g. `request` or `httpClient`, Claude's Discretion) built on `supertest` wrapping the exported `app` from `backend/src/server.js`:
```javascript
import request from 'supertest';
import { app } from '../src/server.js';

export function httpClient() {
  return request(app);
}
```
(Illustrative shape only — no in-repo `supertest` precedent exists yet; this is the first HTTP-boundary test helper in the codebase. `supertest@^7.2.2` is not yet in `backend/package.json` devDependencies — confirmed via `backend/package.json:22-25`, current devDependencies are only `nodemon` and `vitest` — must be added, per `.planning/research/STACK.md` line 27 and its `npm install --workspace backend -D supertest@^7.2.2` install command, line 62.)

---

### New test files (test, request-response/unit)

**Analog 1 — resolver-integration shape:** `backend/src/resolvers/register.test.js` (full file, 76 lines). Copy this exact shape for the password-length additions to `register.test.js`/`resetPassword.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const REGISTER_MUTATION = ` ... `;

beforeEach(resetTables);

describe('register', () => {
  it('rejects a duplicate email with the exact API-contract message', async () => {
    await createTestUser({ email: 'dup@example.com' });
    const { data, errors } = await graphql(REGISTER_MUTATION, { name: 'Dup', email: 'dup@example.com', password: 'Password123!' });
    expect(errors[0].message).toBe('A user with this email already exists.');
    expect(data).toBeNull();
  });
});
```
For the new PWD-01 case, follow the identical `errors[0].message` exact-string-assertion + `expect(data).toBeNull()` pattern, asserting `Password must be at least 8 characters.` (D-01) for a `password: 'short'` (or similar <8-char) input. Per SUMMARY.md, `register.test.js`'s malformed-email test and every `login`/`dashboard` test (which use `createTestUser()`, bypassing the `register` resolver entirely) are NOT touched by this fix — only add new `it(...)` blocks, don't modify existing ones.

**Analog 2 — pure-function unit-test shape:** `backend/src/utils/auth.test.js` (full file, 127 lines) — use this shape for `passwordPolicy.test.js` (and any extracted `corsOriginValidator`/`assertProductionSecrets` unit tests):
```javascript
import { describe, it, expect } from 'vitest';
import { signToken, requireAuth } from './auth.js';

describe('requireAuth', () => {
  it('does not throw for an authenticated user', () => {
    expect(() => requireAuth({ id: 1, role: 'USER' })).not.toThrow();
  });

  it('throws for null', () => {
    expect(() => requireAuth(null)).toThrow();
  });
});
```
For `passwordPolicy.test.js`: `describe`/`it` blocks asserting `expect(() => assertPasswordStrength('short')).toThrow('Password must be at least 8 characters.')` and `expect(() => assertPasswordStrength('longenough1')).not.toThrow()` — zero DB, zero mocking, pure function in/out, matching this file's style exactly.

**Analog 3 — env-gated fail-fast test shape:** `backend/test/guard.test.js` (full file, 34 lines, excerpted above under `env.js`) — use this shape for `assertProductionSecrets` tests: mutate/pass `nodeEnv`/`jwtSecret` combinations and assert `toThrow()`/`not.toThrow()` for each of the four quadrants (production+unset, production+`'change-me'`, production+real-secret, non-production+anything).

**Analog 4 — new supertest CORS integration test:** no in-repo analog (first HTTP-layer test in the codebase). Structure it like `register.test.js` (`describe`/`it`, `beforeEach` where relevant) but drive it through the new `httpClient()`/`request(app)` helper instead of `graphql()`, e.g.:
```javascript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('CORS', () => {
  it('rejects a disallowed origin without echoing it back', async () => {
    const res = await request(app).post('/graphql').set('Origin', 'https://evil.example').send({ query: '{ __typename }' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain('evil.example');
  });
});
```
(Illustrative — exact assertions/status code are Claude's Discretion at plan/execute time; the load-bearing requirement is asserting the response body never contains the rejected origin string, per D-02/CORS-01.)

---

## Shared Patterns

### Throw-plain-Error convention
**Source:** `backend/src/resolvers/user.resolver.js:27,41,66-67`, `backend/src/utils/auth.js:22-23,26-28`
**Apply to:** `passwordPolicy.js`, `register`/`resetPassword` password checks, any extracted `assertProductionSecrets`/`corsOriginValidator`.
```javascript
if (existingUser) throw new Error('A user with this email already exists.');
```
Never use `GraphQLError`/`extensions.code` — this codebase's house style is bare `Error` objects surfaced by Apollo automatically.

### Env-gated fail-fast assertion
**Source:** `backend/test/guard.js` (full file)
**Apply to:** `assertProductionSecrets` in `env.js`.
```javascript
export function assertTestDatabase() {
  const isTestEnv = env.nodeEnv === 'test';
  const isTestDbName = /_test$/.test(env.database.name);
  if (!isTestEnv || !isTestDbName) {
    throw new Error(`Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test", got NODE_ENV=${env.nodeEnv} DB_NAME=${env.database.name}. ...`);
  }
}
```

### Exact-string test assertions
**Source:** `backend/src/resolvers/register.test.js:60`, `backend/src/resolvers/resetPassword.test.js:25-27`
**Apply to:** all new PWD-01/PWD-02/CORS-01 tests.
```javascript
expect(errors[0].message).toBe('A user with this email already exists.');
expect(data).toBeNull();
```

### Test-file co-location + import path convention
**Source:** `backend/src/resolvers/register.test.js:1-5`, `backend/src/utils/auth.test.js:1-11`
**Apply to:** all new test files — co-locate `*.test.js` beside the module it tests (not in `backend/test/`, which is reserved for cross-cutting harness/setup files), import the harness via relative path `../../test/helpers.js` from `src/resolvers/`, or `./auth.js`-style same-directory relative import for direct unit tests.

## No Analog Found

| File/Change | Role | Data Flow | Reason |
|---|---|---|---|
| `app.listen()` decoupling in `server.js` (exporting `app` separately) | config/bootstrap | request-response | No prior refactor of this shape exists in the repo — `server.js` has always been a single top-to-bottom boot script with no `export`. Follow `.planning/research/STACK.md` line 27 and `.planning/research/ARCHITECTURE.md`'s guidance directly (guard `app.listen()` so importing the module for tests doesn't bind a real port). |
| `supertest`-based HTTP harness in `backend/test/helpers.js` | test helper | request-response (HTTP) | First HTTP-boundary test in the codebase — every existing test goes through `graphql()`'s in-process `executeOperation()`. `supertest@^7.2.2` must be added as a new devDependency (`npm install --workspace backend -D supertest@^7.2.2`, per STACK.md line 62); no in-repo precedent to pattern-match, only the STACK.md/ARCHITECTURE.md excerpts above. |

## Metadata

**Analog search scope:** `backend/src/**`, `backend/test/**`, `backend/package.json`, `.planning/research/{STACK,ARCHITECTURE}.md`
**Files scanned:** `server.js`, `config/env.js`, `resolvers/user.resolver.js`, `resolvers/register.test.js`, `resolvers/resetPassword.test.js`, `utils/auth.js`, `utils/auth.test.js`, `test/helpers.js`, `test/guard.js`, `test/guard.test.js`, `test/globalSetup.js`, `src/smoke.test.js`, `vitest.config.js`, `backend/package.json`
**Pattern extraction date:** 2026-07-12
