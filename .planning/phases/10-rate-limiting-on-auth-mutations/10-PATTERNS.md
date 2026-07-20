# Phase 10: Rate Limiting on Auth Mutations - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 6 (2 new modules, 1 new plugin file (may fold into store module), 1 new test file, 2 modified files)
**Analogs found:** 6 / 6 (all partial/role-match — this codebase has no existing Apollo plugin, in-memory store, or IP-derivation code; every analog below is the closest structural precedent, not a literal prior art)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `backend/src/plugins/rateLimitPlugin.js` (new — exact path is planner's call; CONTEXT.md doesn't pin one) | middleware (Apollo plugin) | event-driven (pre-resolver hook) | `backend/src/server.js` (Apollo construction + `context()`) | role-match (no plugin precedent exists) |
| `backend/src/utils/rateLimitStore.js` (new) | utility (module-level singleton store) | CRUD (in-memory counter) | `backend/src/models/index.js` (module-level singleton `models`/`sequelize`) + `backend/test/helpers.js` `resetTables()` | role-match |
| `backend/src/config/rateLimits.js` (new — config map keyed by operation name) | config | transform (lookup table) | `backend/src/config/env.js` (plain exported config object) | role-match |
| `backend/src/server.js` (modify) | config/bootstrap | request-response | itself (existing file, this phase edits it) | exact (same file) |
| `backend/test/helpers.js` (modify) | test utility | request-response | itself (existing file, this phase edits it) | exact (same file) |
| `backend/src/resolvers/rateLimit.test.js` (new, name planner's call) | test | request-response | `backend/src/resolvers/login.test.js`, `backend/src/resolvers/sessionRevocation.test.js` | exact (same test-file conventions) |

## Pattern Assignments

### `backend/src/plugins/rateLimitPlugin.js` (new — Apollo plugin, event-driven)

**No direct analog exists.** There are zero Apollo Server plugins anywhere in this codebase today (`grep -rn "ApolloServerPlugin\|didResolveOperation" backend/src backend/test` returns nothing). The closest structural precedent is how the single `ApolloServer` instance is constructed and how its `context()` function is wired in `backend/src/server.js`, since the plugin is registered at construction time and reads from the same `contextValue` shape that `context()` builds.

**Apollo construction site to extend** (`backend/src/server.js:22`):
```javascript
const apollo = new ApolloServer({ typeDefs, resolvers });
```
This becomes `new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] })`. Per D-10/Integration Points in CONTEXT.md, the **same** `plugins` array/factory must be shared with `backend/test/helpers.js`'s separate `ApolloServer` instance (line 8 there) — otherwise `executeOperation()` tests never exercise the limiter.

**contextValue shape the plugin will read from** (`backend/src/server.js:31-34`):
```javascript
context: async ({ req }) => ({
  models,
  user: await getUserFromRequest(req, models)
})
```
Per D-05, this becomes `{ models, user, clientIp }`. The plugin must read `contextValue.clientIp` (never `req`) — this mirrors the existing convention that resolvers only ever destructure from the context object, never reach into `req`/`res` directly (see `user.resolver.js` destructuring `{ models, user }` from context throughout).

**Plugin shape** (`@apollo/server` v4.11.3 API — confirmed installed at `node_modules/@apollo/server`): a plugin is a plain object with an async `requestDidStart()` returning an object with a `didResolveOperation({ contextValue, operationName })` hook. This is new code with no prior in-repo pattern; follow the official `ApolloServerPlugin` shape:
```javascript
export const rateLimitPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ contextValue, operationName }) {
        // look up limit for operationName in the config map (rateLimits.js)
        // key = `${contextValue.clientIp}:${operationName}`
        // check/increment via rateLimitStore.js
        // throw GraphQLError with extensions.code = 'TOO_MANY_REQUESTS' on breach
      }
    };
  }
};
```

**Error-throw convention to reuse** (mirrors `backend/src/resolvers/user.resolver.js:39`, `:53`, `:92`, `:104` — all `throw new Error('...')` with a single user-facing string, no leaked internals):
```javascript
// user.resolver.js:53
if (!user || !(await user.validatePassword(password))) throw new Error('Invalid email or password.');
```
The rate limiter follows the same single-message, no-detail-leak convention (D-08): throw once, with a fixed generic string, no attempt count / retry-after. Difference from existing code: use `GraphQLError` from the `graphql` package (already a direct dependency, v16.10.0) instead of plain `Error`, so `extensions.code = 'TOO_MANY_REQUESTS'` can be set — there is no existing `GraphQLError` usage in this repo to copy from (verified via grep), so this is new-pattern code, not a copy.

---

### `backend/src/utils/rateLimitStore.js` (new — module-level singleton store, CRUD)

**Analog:** `backend/src/models/index.js` (module-level singleton pattern) + `backend/test/helpers.js` `resetTables()` (test-reset hook pattern)

**Module-level singleton pattern** (`backend/src/models/index.js:1-8`):
```javascript
import { sequelize } from '../config/database.js';
import { initUser } from './User.js';

const User = initUser(sequelize);

export const models = {
  User
};
```
This shows the established convention: a private module-scope value constructed once at import time, exposed via a named export. `rateLimitStore.js` follows the same shape — a module-scope `Map` constructed once, with functions (`checkAndIncrement`, or similar) exported to operate on it. Per Claude's Discretion in CONTEXT.md, the exact data-shape (fixed-window vs sliding, counter+timestamp fields) is left open, but it must be a **module-level singleton**, not a class instance passed around — matching the `models`/`sequelize` precedent, not a DI pattern.

**Test-reset hook pattern to mirror** (`backend/test/helpers.js:22-24`):
```javascript
export async function resetTables() {
  await models.User.destroy({ where: {}, truncate: true });
}
```
D-03 requires a `resetRateLimitStore()` function with the same "clear all state between tests" contract. Since the store is in-memory (not DB-backed), this will be synchronous (`Map.clear()`) rather than async, but the calling convention in tests — called in `beforeEach` alongside/after `resetTables()` — should mirror how `resetTables()` is invoked (`backend/src/resolvers/login.test.js:15`: `beforeEach(resetTables);`, and `sessionRevocation.test.js:40-43`: `beforeEach(async () => { await resetTables(); vi.clearAllMocks(); });`).

**Test isolation requirement (D-03):** the reset hook must be exported and called from every rate-limit test's `beforeEach`, exactly as `resetTables()` is today.

---

### `backend/src/config/rateLimits.js` (new — config map, transform)

**Analog:** `backend/src/config/env.js` (plain exported config object built from constants, `backend/src/config/env.js:18-38`)

```javascript
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  ...
  resetTokenExpiresMinutes: Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 30),
  ...
};
```
`env.js` establishes the convention of a single exported plain-object config, built once at module load, consumed by name elsewhere (`import { env } from '../config/env.js'`). `rateLimits.js` follows the same shape but with **hardcoded** values per D-06 (no env-var surface this milestone):
```javascript
export const RATE_LIMITS = {
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  requestPasswordReset: { max: 5, windowMs: 60 * 60 * 1000 }
};
```
Per D-07, operations absent from this map are unlimited — the plugin must treat a missing key as "no limit", not "limit of 0" (guard-clause-first convention, matching `if (!token) return null;` in `backend/src/utils/auth.js:12`). Phase 11 adds `resendVerificationEmail` as a one-line entry here, per the ROADMAP dependency note.

---

### `backend/src/server.js` (modify — trust proxy + clientIp on contextValue)

**No existing analog for `trust proxy` / `req.ip`** — grep confirms zero references to `trust proxy`, `trust-proxy`, or `req.ip` anywhere in the backend today. This is genuinely new code in an already-small, well-understood file.

**Current full context (`backend/src/server.js:1-42`, already read in full — no re-read needed):**
```javascript
const app = express();
...
app.use(cors(buildCorsOptions(env)));

const apollo = new ApolloServer({ typeDefs, resolvers });

await apollo.start();
await initializeDatabase();

app.use(
  '/graphql',
  express.json(),
  expressMiddleware(apollo, {
    context: async ({ req }) => ({
      models,
      user: await getUserFromRequest(req, models)
    })
  })
);
```
Three edits land here per D-04/D-05/Integration Points:
1. `app.set('trust proxy', 1);` — added near `const app = express();` (line 12), following the existing flat, unconditional style of `app.use(cors(...))` (no config gate — this is hardcoded like the rest of the Express setup).
2. `const apollo = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });` — plugins array is new; `rateLimitPlugin` imported from the new plugin module (import-block convention: `backend/src/server.js:1-10` is a flat list of named imports, add one more line in the same style).
3. `context: async ({ req }) => ({ models, user: await getUserFromRequest(req, models), clientIp: req.ip })` — one more key on the returned object, matching the existing two-key object-literal style exactly.

---

### `backend/test/helpers.js` (modify — clientIp injection + resetRateLimitStore + shared plugin)

**Full current file already read (`backend/test/helpers.js:1-34`, no re-read needed).**

```javascript
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
```
Three edits land here per D-05/D-03/Integration Points:
1. `new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] })` — same plugins array as `server.js`, imported from the same shared module, so the test Apollo instance exercises the real plugin (this is the critical integration point flagged in CONTEXT.md — without it, `executeOperation()` tests bypass rate limiting entirely).
2. `graphql(query, variables, user = null, clientIp = '127.0.0.1')` (or an options-object variant — planner's call) — extends the function signature to accept and inject `clientIp` into `contextValue`, mirroring how `user` is already an optional trailing parameter defaulted to a safe value.
3. `export function resetRateLimitStore() { ... }` re-exported (or imported and re-exported) from `rateLimitStore.js`, placed alongside `resetTables()` in the same barrel-of-test-utilities style this file already uses (`resetTables`, `createTestUser` are both simple named exports at the bottom of the file — `resetRateLimitStore` follows the same flat pattern, no wrapping needed unless it needs `models`-style indirection).

---

### `backend/src/resolvers/rateLimit.test.js` (new — test file, request-response)

**Analog:** `backend/src/resolvers/login.test.js` (simple `graphql()`-driven resolver test) and `backend/src/resolvers/sessionRevocation.test.js` (fake-timer-driven, cross-cutting security test)

**Structure to copy from `login.test.js` (full file already read, lines 1-55):**
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id role }
    }
  }
`;

beforeEach(resetTables);

describe('login', () => {
  it('returns a verifiable JWT for valid credentials', async () => {
    const user = await createTestUser({ email: 'ada@example.com', role: 'ADMIN' });
    const { data, errors } = await graphql(LOGIN_MUTATION, { email: 'ada@example.com', password: 'Password123!' });
    expect(errors).toBeUndefined();
    ...
  });
});
```
Rate-limit tests follow this exact shape but call `graphql(..., clientIp)` with a fixed IP repeated across N calls, and add `resetRateLimitStore()` to `beforeEach` (per D-03) alongside `resetTables()`:
```javascript
beforeEach(async () => {
  await resetTables();
  resetRateLimitStore();
});
```
matching the multi-statement `beforeEach` style already used in `sessionRevocation.test.js:40-43`.

**Fake-timer pattern for window-expiry tests** (`sessionRevocation.test.js:1,46-47,55,71,79,89,105`):
```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
...
afterEach(() => {
  vi.useRealTimers();
});
...
vi.setSystemTime(new Date('2026-01-01T11:59:59.000Z'));
...
vi.useRealTimers();
```
This is the established convention for deterministic time-window control in tests — directly reusable for asserting a rate-limit window resets after `windowMs` elapses (Claude's Discretion note: "deterministic test control over time (e.g. injectable clock or fake timers)" is already satisfied by this existing project-wide Vitest fake-timer convention; no new time abstraction is needed).

**Real-vs-nonexistent parity test (D-08)** follows the same-message assertion style already used in `login.test.js:41` and `:51`:
```javascript
expect(errors[0].message).toBe('Invalid email or password.');
```
The parity test asserts the 429 fires on the identical Nth attempt and with the identical message for both a real email (`createTestUser` first) and a nonexistent one — no new assertion pattern, just applying the existing "assert exact `errors[0].message`" convention twice with different fixtures.

---

## Shared Patterns

### Guard-function / early-return convention
**Source:** `backend/src/utils/auth.js:32-38` (`requireAuth`, `requireAdmin`)
**Apply to:** the rate-limit plugin's core check
```javascript
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
CONTEXT.md explicitly calls this out (canonical_refs) as "the analogous central pre-resolver guard" — the rate limiter's check-and-throw function should read the same way: a small, synchronous, single-responsibility guard called once per request, throwing immediately on failure, no side-channel state.

### Single-message error convention (no detail leaking)
**Source:** `backend/src/resolvers/user.resolver.js:39,53,92,104`
**Apply to:** the plugin's 429 `GraphQLError`
```javascript
throw new Error('A user with this email already exists.');
throw new Error('Invalid email or password.');
```
Every existing thrown error in this codebase is a single fixed string with zero interpolated internals (no stack traces, no counts, no timing data surfaced to the client). D-08 requires the exact same discipline for the 429: `"Too many requests. Please try again later."`, no retry-after/remaining-attempts.

### Module-level singleton + explicit test-reset hook
**Source:** `backend/src/models/index.js:6-8` (singleton) + `backend/test/helpers.js:22-24` (reset hook)
**Apply to:** `rateLimitStore.js`
```javascript
export const models = { User };
...
export async function resetTables() {
  await models.User.destroy({ where: {}, truncate: true });
}
```
Every piece of shared mutable state in this codebase (the Sequelize `models` singleton, now the rate-limit `Map`) is paired with an explicit reset function that tests call in `beforeEach`. There is no auto-reset/mocking-framework magic — resets are always plain, explicit function calls.

### Plain exported config object, built once at module load
**Source:** `backend/src/config/env.js:18-38`
**Apply to:** `rateLimits.js`
```javascript
export const env = { nodeEnv: ..., port: ..., resetTokenExpiresMinutes: ... };
```
Config in this codebase is always a plain object literal exported by name, never a class or factory function. `RATE_LIMITS` follows this exactly, just without the `process.env` indirection (per D-06, hardcoded this milestone).

## No Analog Found

Files/patterns with no close match in the codebase (planner should rely on the official `@apollo/server` v4.11.3 plugin API docs / RESEARCH-equivalent knowledge instead of an in-repo copy source):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/plugins/rateLimitPlugin.js` | middleware (Apollo plugin) | event-driven | Zero `ApolloServerPlugin` / `didResolveOperation` usage anywhere in the repo today (confirmed via grep across `backend/src` and `backend/test`) — this is the first plugin ever added to this Apollo instance. |
| `GraphQLError` usage with `extensions.code` | error type | n/a | Zero existing `GraphQLError` imports/usage in the repo — all current errors are plain `Error` (see `user.resolver.js`). The rate-limit 429 is the first place `extensions.code = 'TOO_MANY_REQUESTS'` is needed, so there's no in-repo precedent for the extensions shape, only the general "single fixed message" convention noted above. |
| `app.set('trust proxy', 1)` / `req.ip` derivation | Express config | n/a | Zero references to Express trust-proxy settings or `req.ip` anywhere in `backend/src` today — this is new Express-config surface, not a modification of an existing pattern. |

## Metadata

**Analog search scope:** `backend/src/**`, `backend/test/**` (entire backend workspace; frontend excluded — CONTEXT.md scopes this phase to backend-only enforcement plus reuse of the existing frontend `<Alert>` error surface per D-09, which requires no new frontend pattern mapping)
**Files scanned:** 29 backend `.js` files (via `find backend -type f -name "*.js" | grep -v node_modules`)
**Pattern extraction date:** 2026-07-20
