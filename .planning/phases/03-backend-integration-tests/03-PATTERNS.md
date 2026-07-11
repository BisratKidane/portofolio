# Phase 3: Backend Integration Tests - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 3 (integration spec file(s), optional test helper extension, KNOWN-ISSUES.md)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/src/resolvers/user.resolver.test.js` (or per-flow `*.test.js` files, planner's choice) | test (integration) | request-response (GraphQL, in-process) | `backend/src/utils/auth.test.js` (spec conventions) + `backend/test/helpers.js` (fixtures) | role-match (no existing integration/resolver spec; unit-test conventions + Phase-1 helpers are the closest real analogs) |
| `backend/test/helpers.js` extension — optional `graphql()` wrapper (or a new `backend/test/graphqlTestServer.js`) | utility (test helper) | request-response (Apollo executeOperation wrapper) | `backend/test/helpers.js` (existing file, extend in place) | exact (same file, established export style) |
| `KNOWN-ISSUES.md` (repo root) | doc/config | transform (source data → structured doc) | `README.md` (repo-root doc, Markdown section conventions) + `.planning/codebase/CONCERNS.md` (source content, per-issue structure) | role-match |

## Pattern Assignments

### `backend/src/resolvers/user.resolver.test.js` (test, integration/request-response)

**Analog 1 (spec structure/conventions):** `backend/src/utils/auth.test.js`
**Analog 2 (DB-aware spec conventions):** `backend/src/models/User.test.js`
**Analog 3 (fixtures to call, not modify):** `backend/test/helpers.js`

**Imports pattern** (from `backend/src/utils/auth.test.js:1-11`):
```javascript
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  signToken,
  getUserFromRequest,
  requireAuth,
  requireAdmin,
  createResetToken,
  resetTokenExpiry
} from './auth.js';
```
Apply the same relative-path/no-extension-omitted ESM style for the new spec. Since this file lives at `backend/src/resolvers/user.resolver.test.js`, the equivalent imports are:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { ApolloServer } from '@apollo/server';
import { env } from '../config/env.js';
import { typeDefs } from '../schemas/index.js';
import { resolvers } from './index.js';
import { models } from '../models/index.js';
import { resetTables, createTestUser } from '../../test/helpers.js';
```
Note the relative path from `src/resolvers/` to `test/helpers.js` is `../../test/helpers.js` (one level further up than `backend/src/models/User.test.js` needs, since that file only reaches `./index.js` — check actual relative depth when placing the file).

**DB-aware `describe`/fixture pattern** (from `backend/src/models/User.test.js:1-21`):
```javascript
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from './index.js';

const { User } = models;

describe('validatePassword', () => {
  it('resolves true for the correct password against a known bcrypt hash', async () => {
    const known = await bcrypt.hash('Password123!', 12);
    const user = User.build({ passwordHash: known });

    await expect(user.validatePassword('Password123!')).resolves.toBe(true);
  });
});
```
This establishes the project's convention of importing `models` directly and driving real Sequelize instances in tests (no mocking of the ORM) — the new integration specs should do the same, importing `models` from `backend/src/models/index.js` for both `contextValue.models` and post-mutation DB spot-checks (D-10).

**Fixture helpers to call as-is** (`backend/test/helpers.js:1-15`, full file — do not duplicate this logic in the new spec):
```javascript
import { models } from '../src/models/index.js';

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
`beforeEach(resetTables)` per D-04; `createTestUser({ role: 'ADMIN' | 'USER', email })` for seeding and for building `contextValue.user` in authed cases (D-02, D-06).

**Core in-process GraphQL execution pattern** (verified in RESEARCH.md Pattern 1/2 — no direct codebase analog exists yet since this is the first integration spec; RESEARCH.md's prototype-verified shape is the closest thing to ground truth):
```javascript
const server = new ApolloServer({ typeDefs, resolvers });

async function graphql(query, variables, user = null) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user } }
  );
  return response.body.singleResult; // { data, errors }
}
```
Construct `server` once at module scope (mirrors `const { User } = models;` module-scope destructuring convention in `User.test.js:5`). No `.start()` call (D-01 anti-pattern warning). Do NOT import `backend/src/server.js` — it has top-level side effects (`apollo.start()`, `initializeDatabase()`, `app.listen`).

**`describe`/`it` nesting convention** (from `backend/src/utils/auth.test.js` — one `describe` block per exported function/flow, each `it` a single behavior):
```javascript
describe('register', () => {
  it('makes the first registrant ADMIN', async () => { /* ... */ });
  it('makes subsequent registrants USER', async () => { /* ... */ });
  it('rejects a duplicate email with the exact API-contract message', async () => { /* ... */ });
  it('rejects invalid input (malformed email)', async () => { /* ... */ });
});

describe('login', () => { /* ... */ });
describe('dashboard / me', () => { /* ... */ });
describe('requestPasswordReset', () => { /* ... */ });
```
Nest one `describe` per flow (register/login/dashboard-me/requestPasswordReset), matching how `auth.test.js` nests one `describe` per exported function (`signToken`, `getUserFromRequest`, `requireAuth`, `requireAdmin`, `createResetToken`, `resetTokenExpiry`).

**`beforeEach` isolation pattern** (new to this phase per D-04 — no existing spec file uses `beforeEach` yet, since Phase 1/2 specs are pure-unit and don't touch table state across tests; this is the one new structural element vs. the analogs):
```javascript
import { beforeEach } from 'vitest';
import { resetTables } from '../../test/helpers.js';

beforeEach(resetTables);
```
Place at the top of the file (or inside each `describe` block that calls `register`), before any `it` blocks.

**JWT claim assertion pattern** (from `backend/src/utils/auth.test.js:13-20`, reused verbatim for register/login assertions per D-10):
```javascript
describe('signToken', () => {
  it('produces a token whose decoded payload carries the expected sub and role claims', () => {
    const token = signToken({ id: 42, role: 'ADMIN' });
    const payload = jwt.verify(token, env.jwtSecret);

    expect(payload.sub).toBe(42);
    expect(payload.role).toBe('ADMIN');
  });
});
```
Apply the same `jwt.verify(token, env.jwtSecret)` call against the `token` returned from `register`/`login` mutations; assert `payload.sub` and `payload.role`.

**Error-message assertion pattern** (established by `auth.test.js`'s `toThrow()` usage, adapted per D-03/D-11 since Apollo does NOT throw — errors are returned in `singleResult.errors`):
```javascript
// auth.test.js precedent (synchronous throw, NOT applicable to executeOperation):
it('throws for null', () => {
  expect(() => requireAuth(null)).toThrow();
});

// Correct adaptation for GraphQL integration specs (D-03, D-11) — do NOT use .rejects.toThrow():
it('rejects a duplicate email with the exact API-contract message', async () => {
  await createTestUser({ email: 'dup@example.com' });
  const { data, errors } = await graphql(REGISTER_MUTATION, {
    name: 'Dup', email: 'dup@example.com', password: 'Password123!'
  });
  expect(errors[0].message).toBe('A user with this email already exists.');
  expect(data).toBeNull();
});
```

**Code under test — read for exact assertion targets:**
- `backend/src/resolvers/user.resolver.js:1-76` (full file, small) — `register` (lines 25-38), `login` (39-43), `logout` (44-47), `requestPasswordReset` (48-62), `resetPassword` (63-74), `dashboard` (10-18), `me` (9). Exact error strings: `'A user with this email already exists.'` (27), `'Invalid email or password.'` (41), generic reset message `'If the account exists, a password reset token has been generated.'` (50).
- `backend/src/schemas/user.schema.js:1-45` (full file, small) — `AuthPayload { token, user }`, `PasswordResetPayload { message, resetToken }`, `Dashboard { message, user, users }` — exact field shapes for GraphQL query strings in the new spec.
- `backend/src/utils/auth.js` — `requireAuth`/`requireAdmin` are the source of the `'You must be logged in to perform this action.'`-style string (read this file directly for the exact literal before asserting D-11's `dashboard` unauthenticated case).
- `backend/src/models/User.js` — field names for DB spot-checks: `passwordHash`, `resetPasswordToken`, `resetPasswordExpiresAt`, and the `validatePassword` instance method.

**Barrels to import (not `server.js`):**
```javascript
// backend/src/schemas/index.js
export const typeDefs = [userTypeDefs];   // array form — feed directly to ApolloServer

// backend/src/resolvers/index.js
export const resolvers = [userResolvers]; // array form — feed directly to ApolloServer
```
`ApolloServer` accepts arrays for both `typeDefs` and `resolvers` (Apollo merges them internally) — no need to unwrap.

---

### `backend/test/helpers.js` extension (utility, optional)

**Analog:** the file itself — extend in place, matching its existing named-export style.

**Current full content** (`backend/test/helpers.js:1-15`):
```javascript
import { models } from '../src/models/index.js';

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
If the planner chooses to add a shared `graphql()` wrapper here (RESEARCH.md's recommendation), follow the same pattern: a plain named `async function` export, no class, no default export — consistent with `resetTables`/`createTestUser`. Would additionally need `import { ApolloServer } from '@apollo/server'` and imports of `typeDefs`/`resolvers` at the top of this file (or a separate new file `backend/test/graphqlTestServer.js`, per RESEARCH.md's "Recommended Project Structure").

---

### `KNOWN-ISSUES.md` (repo root, new doc)

**Analog 1 (repo-root Markdown doc conventions):** `README.md`
**Analog 2 (source content + per-issue structure to port from):** `.planning/codebase/CONCERNS.md`

**README.md heading/section style** (`README.md:1-18`) — plain `#`/`##` Markdown, no frontmatter, short declarative bullet lists. `KNOWN-ISSUES.md` should match this same plain-Markdown style (no special tooling/format).

**CONCERNS.md per-issue structure to replicate** (`.planning/codebase/CONCERNS.md:49-53`, the primary source entry):
```markdown
**Password reset token exposed to anyone who requests it (account takeover):**
- Risk: `requestPasswordReset` returns the freshly generated `resetToken` in the mutation response to whichever caller invoked it — not only to the account owner via email. Anyone who knows a user's email address can call this mutation, receive the reset token directly, then call `resetPassword` to take over that account.
- Files: `backend/src/resolvers/user.resolver.js:48-61,63-74`, `frontend/src/pages/ForgotPassword.jsx:7-11`
- Current mitigation: None at the API layer (the generic "if the account exists" message only obscures whether an account exists, it does not protect the token itself).
- Recommendations: Never return `resetToken` over the API/network. Deliver it exclusively via a verified email channel, and add expiry + single-use enforcement (expiry already exists via `resetPasswordExpiresAt`, single-use is implicit since the field is cleared on success).
```
Per D-07, `KNOWN-ISSUES.md`'s per-issue section shape is: **Title, Location (`file:line`), Expected vs. Actual, Severity, pointer to the test that documents it** — a reshaping of the CONCERNS.md fields (Risk→Expected vs Actual, add Severity, add "Documented by test:" pointer; drop "Recommendations" prose or fold into "Expected"). Example target shape for the primary entry (content per CONTEXT.md `<specifics>` D-07/D-08/`<specifics>` block):
```markdown
## Reset-token exposure in `requestPasswordReset` response

- **Location:** `backend/src/resolvers/user.resolver.js:48-61`
- **Expected:** Reset token delivered only via a verified email channel, never in the API response.
- **Actual:** The mutation returns `resetToken` directly in the `PasswordResetPayload` — any caller who knows a user's email can retrieve it and call `resetPassword` to take over the account.
- **Severity:** High
- **Documented by test:** `backend/src/resolvers/user.resolver.test.js` — `requestPasswordReset` suite
- **Full audit:** see `.planning/codebase/CONCERNS.md` (Security Considerations)
```
Other candidate entries per D-08 scope (only if the chosen "invalid input" test case touches them):
- No server-side password strength/length validation (`.planning/codebase/CONCERNS.md:73-77`) — include only if register's invalid-input test asserts on password strength; per RESEARCH.md Pitfall 4, the planner's chosen invalid-input case is a malformed **email** (Sequelize `isEmail` validator), not password strength — so this entry is likely **optional/out of scope** unless the planner also adds a password-strength case.
- Account enumeration via `requestPasswordReset`'s generic message (`.planning/codebase/CONCERNS.md:55-58`, partially) — only if a test explicitly asserts the enumeration-resistant behavior as a documented characteristic (D-09 says the happy-path generic-message test already covers this implicitly).

Add a short top-of-file pointer line:
```markdown
> For the full security/architecture audit, see `.planning/codebase/CONCERNS.md`.
```

---

## Shared Patterns

### In-process Apollo test server construction (D-01)
**Source:** RESEARCH.md Pattern 1 (verified via disposable prototype against `portofolio_test`); barrels at `backend/src/schemas/index.js` and `backend/src/resolvers/index.js`.
**Apply to:** Every `describe` block / test file in this phase.
```javascript
import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../schemas/index.js';
import { resolvers } from './index.js';
import { models } from '../models/index.js';

const server = new ApolloServer({ typeDefs, resolvers });
```

### Context injection (D-02)
**Source:** RESEARCH.md Pattern 2; mirrors `backend/src/server.js`'s real `context` function shape `{ models, user }` (do not import `server.js` itself).
**Apply to:** Every `graphql(query, variables, user)` call — `user` is `null` for anonymous, or a `createTestUser({ role })` instance for authed.

### Per-test table reset (D-04)
**Source:** `backend/test/helpers.js` `resetTables()`.
**Apply to:** `beforeEach(resetTables)` in every spec file/describe block that calls `register` (order-independence for the first-user-ADMIN quirk, Pitfall 3).

### Exact error-string assertions (D-11)
**Source:** `backend/src/resolvers/user.resolver.js` (`'A user with this email already exists.'` line 27, `'Invalid email or password.'` line 41) and `backend/src/utils/auth.js` (`requireAuth`'s message — read directly for exact wording).
**Apply to:** Every negative-path test; assert on `errors[0].message` only — never `errors[0].extensions.code` (always `'INTERNAL_SERVER_ERROR'` for plain thrown `Error`s in this codebase, per RESEARCH.md Pitfall 2).

### JWT claim verification (D-10)
**Source:** `backend/src/utils/auth.test.js:13-20` (`jwt.verify(token, env.jwtSecret)`, asserting `payload.sub`/`payload.role`).
**Apply to:** `register` and `login` success-path assertions.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| The in-process `executeOperation`/`graphql()` wrapper itself | test helper | request-response | No prior integration/resolver spec exists in this codebase (Phase 1/2 are pure-unit); RESEARCH.md's prototype-verified code (executed and confirmed against the live DB this session, then deleted) is the only ground truth — treat RESEARCH.md's "Code Examples" section as the primary source for this specific pattern instead of a codebase analog. |

## Metadata

**Analog search scope:** `backend/src/**/*.test.js`, `backend/test/*.js`, `backend/src/resolvers/`, `backend/src/schemas/`, `backend/src/models/`, `backend/src/utils/`, `backend/src/config/`, repo-root `README.md`, `.planning/codebase/CONCERNS.md`
**Files scanned:** `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/vitest.config.js`, `backend/src/utils/auth.test.js`, `backend/src/utils/auth.js`, `backend/src/models/User.test.js`, `backend/src/models/User.js`, `backend/src/models/index.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/index.js`, `backend/src/schemas/user.schema.js`, `backend/src/schemas/index.js`, `backend/src/config/env.js`, `README.md`, `.planning/codebase/CONCERNS.md`
**Pattern extraction date:** 2026-07-12
