# Phase 3: Backend Integration Tests - Research

**Researched:** 2026-07-12
**Domain:** Apollo Server 4 in-process GraphQL integration testing (Vitest, Sequelize/MySQL)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Test entry point & auth simulation
- **D-01:** Tests drive the GraphQL layer **in-process via Apollo `server.executeOperation({ query, variables }, { contextValue })`** — NOT full HTTP/supertest. A fresh `new ApolloServer({ typeDefs, resolvers })` is constructed inside a test helper by importing `typeDefs` from `backend/src/schemas/index.js` and `resolvers` from `backend/src/resolvers/index.js` directly. This avoids `server.js`'s top-level side effects (`apollo.start()`, `initializeDatabase()`, `app.listen`), needs no port/network, and adds no supertest dependency. Chosen over supertest because the Express/CORS/`Authorization`-header → JWT path is already unit-tested in Phase 2 (D-01, `getUserFromRequest`), so re-driving it over HTTP adds little integration value.
- **D-02:** The authenticated context is built by **injecting a resolved user directly**: `contextValue = { models, user: <userInstance from createTestUser()> }`, mirroring exactly what the real `context` function returns after `getUserFromRequest`. The unauthenticated case passes `user: null`. No JWT signing / fake `req` / header parsing inside integration tests — that derivation is Phase-2 unit scope.
- **D-03:** `executeOperation` resolves once and returns a `singleResult`; assertions read `body.singleResult.data` and `body.singleResult.errors`. (Planner: remember Apollo wraps results — errors are on `singleResult.errors`, not a thrown exception.)

#### DB isolation & the first-user-ADMIN quirk
- **D-04:** Row state is reset with **`resetTables()` in a `beforeEach`** hook so every test starts from an empty, known `users` table. Chosen over `afterEach` (a crashed cleanup leaves residue) and over per-file `beforeAll` (makes tests order-dependent, which is fatal given the first-user-ADMIN logic). This is the "stronger per-test isolation" Phase 1 explicitly deferred to Phase 3.
- **D-05:** The register test **covers both role branches explicitly**, since `register` makes the first registrant ADMIN (`userCount === 0`) and everyone else USER — a security-relevant behavior worth pinning:
  - **ADMIN branch:** register into an empty table (post-`beforeEach`), assert `role === 'ADMIN'`.
  - **USER branch:** seed a prior user with `createTestUser()` first, then register and assert `role === 'USER'`.
- **D-06:** `dashboard` / `me` tests control role deterministically by **creating the context user directly** via `createTestUser({ role: 'ADMIN' })` / `createTestUser({ role: 'USER' })` and injecting it (D-02) — they do not go through `register`, so the first-user quirk is irrelevant to them. The admin `dashboard` case can assert the `users` array is populated; the non-admin case asserts `users` is null and the standard message.

#### Known-issues doc (DOCS-01)
- **D-07:** The tracked doc is a **new `KNOWN-ISSUES.md` at the repository root**, using per-issue sections: Title, Location (`file:line`), Expected vs. Actual behavior, Severity, and a pointer to the test that documents it. Repo-root for portfolio visibility (sits next to `README.md`). This is a first-class deliverable, distinct from the `.planning/codebase/CONCERNS.md` planning artifact.
- **D-08:** Scope of the doc is **only bugs these four flows actually surface** — every entry is backed by a test in this phase. Primary entry: the **reset-token exposure** (`requestPasswordReset` returns `resetToken` in the API payload — account-takeover risk). Add other issues only if these specific tests directly touch them (e.g. no server-side password strength/length validation on `register`; generic "if the account exists" message / account-enumeration surface on `requestPasswordReset`). A short pointer to `.planning/codebase/CONCERNS.md` covers the full audit so nothing is lost.

#### Reset-flow test posture (BE-07)
- **D-09:** The `requestPasswordReset` test asserts the **happy path only** — the mutation succeeds and returns the generic message for both an existing and a non-existing email, and (per D-11) stores a token + expiry on the user for the existing-email case. It does **not** encode the token-leak as a bug-pinning assertion. The reset-token exposure is documented in `KNOWN-ISSUES.md` (D-07/D-08), not asserted as "expected" behavior in the suite. (User chose this over a characterization/assert-the-bug test.)

#### Assertion depth
- **D-10:** Assertions go **through the GraphQL response AND spot-check key DB side-effects** — this is an integration test, so verifying persistence is the point:
  - `register`: response carries a `token` (a verifiable JWT with correct `sub`/`role` claims) and the expected `user` fields; DB row is persisted with `passwordHash !== plaintext` (guards the fragile hashing-via-hooks invariant CONCERNS.md flags).
  - `login`: valid credentials return a verifiable JWT; DB spot-check optional (row already exists).
  - `requestPasswordReset`: existing-email path stores `resetPasswordToken` + `resetPasswordExpiresAt` on the row.
- **D-11:** Negative cases assert **exact error messages** (these strings are part of the auth API contract the frontend relies on):
  - duplicate email → `'A user with this email already exists.'`
  - invalid credentials → `'Invalid email or password.'`
  - unauthenticated `dashboard` → `'You must be logged in to perform this action.'`
  - Assert both that `errors` is present AND the message matches; `data` is null/absent for the errored field.

### Claude's Discretion
- **Test entry point (D-01):** user said "you decide" — locked to `executeOperation` per the rationale above; planner/researcher confirm the exact Apollo 4 `executeOperation` call shape and `singleResult` access.
- Exact spec file layout — follow co-located `src/**/*.test.js` (Phase 1 D-06). Whether it's one `src/resolvers/user.resolver.test.js` or per-flow files (e.g. `register.test.js`, `login.test.js`) is planner discretion.
- Whether to add a `graphql()` helper (thin wrapper over `server.executeOperation` returning `singleResult`) and/or `authedContext(user)` / `anonContext()` context helpers — add if it reduces per-spec boilerplate; not mandated.
- Whether to also cover `logout` (auth-guarded boolean) and `resetPassword` (consume-token) opportunistically — not required by BE-04..07 but cheap; planner may include for completeness.
- "Invalid input" for register (BE-04) — what counts (e.g. missing/empty fields, malformed email). GraphQL `String!` enforces presence at the schema layer; the resolver adds no format validation, so the planner picks a case that actually exercises a rejection path and notes if schema-level (non-null) vs resolver-level.
- Exact `test-user` email uniqueness approach — `createTestUser()` already uses a timestamped email; with `beforeEach` truncation, fixed emails are also safe. Planner's choice.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

- Fixing any documented bug (reset-token exposure, JWT-secret fallback, rate limiting, password-strength validation) is explicitly v2 / FIX-01, not this phase (PROJECT.md Out of Scope).
- Broader CONCERNS.md items not touched by these four flows (JWT-secret fallback, no rate limiting, no revocation, CORS origin leak, unbounded `users` listing) are left in `.planning/codebase/CONCERNS.md`; `KNOWN-ISSUES.md` links to it rather than re-porting them (D-08).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| BE-04 | The `register` mutation is integration-tested — creates a user, rejects a duplicate email, and rejects invalid input | Confirmed exact `executeOperation` call shape; confirmed ADMIN/USER role-matrix branch condition (`userCount === 0`); confirmed exact duplicate-email error message; confirmed the malformed/empty-email "invalid input" case surfaces via Sequelize's `isEmail` validator (Pitfall 4), not a GraphQL schema-level rejection |
| BE-05 | The `login` mutation is integration-tested — returns a JWT for valid credentials and rejects invalid credentials | Confirmed `signToken`/`jwt.verify` claim shape (`sub`, `role`) reusing Phase 2's established pattern; confirmed exact invalid-credentials error message |
| BE-06 | The protected dashboard/me query is integration-tested — returns data for an authenticated request and rejects an unauthenticated one | Confirmed context-injection pattern (`contextValue.user`) for both ADMIN/USER authed cases and the `null` anonymous case; confirmed exact unauthenticated error message; confirmed ADMIN-only `users` array population behavior |
| BE-07 | The `requestPasswordReset` flow is integration-tested, documenting its current behavior | Confirmed generic-message happy path for both existing/non-existing email; confirmed DB side-effect (`resetPasswordToken`/`resetPasswordExpiresAt`) persistence for the existing-email case; confirmed this phase does NOT assert the token-leak as expected behavior (D-09) |
| DOCS-01 | Security bugs surfaced while writing tests are recorded as tracked known-issues (location + expected vs. actual behavior), not fixed in this milestone | Confirmed no `KNOWN-ISSUES.md` currently exists at repo root; confirmed `.planning/codebase/CONCERNS.md` already documents the primary reset-token-exposure bug (with file:line) to source the new doc's entry from |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives extracted from `./CLAUDE.md` that apply to this phase:

- **Tech stack**: JavaScript ES Modules, npm workspaces — this phase's new test files must use `import`/`export` (ESM), consistent with `backend/package.json`'s `"type": "module"` and every existing spec file (`auth.test.js`, `User.test.js`, `database.test.js`).
- **Test tooling**: Vitest is the confirmed/pinned runner (per Phase 1) — this phase adds Vitest specs only, no new runner or assertion library.
- **Database**: Backend integration tests must run against an isolated test database, never dev data — already satisfied by the Phase-1 harness (`env/test.env`, `assertTestDatabase()` guard, `sync({force:true})`); this phase's `beforeEach(resetTables)` adds per-test isolation on top of Phase 1's per-run isolation.
- **Non-destructive milestone constraint**: "this milestone must not change application runtime behavior — it only adds tests, tooling, and CI config." This phase must NOT modify `backend/src/resolvers/user.resolver.js`, `backend/src/schemas/user.schema.js`, `backend/src/utils/auth.js`, or `backend/src/models/User.js` — verified this phase's plan only adds new test files + `KNOWN-ISSUES.md`, no source edits.
- **GSD Workflow Enforcement**: Direct file edits outside a GSD command are disallowed by CLAUDE.md; the planner must route implementation through `/gsd-execute-phase` (already the mechanism in use for this milestone).
- **Node version note (discrepancy, not a blocker):** CLAUDE.md's Technology Stack section states "Node.js 18.x - pinned via `.nvmrc` (`18`)", but the actual `.nvmrc` in this repository reads `24`, and both root and `backend/package.json` declare `"engines": { "node": "24.x" }` — confirmed by direct inspection this session. The installed runtime is Node v24.15.0. This is a stale-documentation mismatch inherited from a prior milestone, not something this phase should attempt to reconcile (out of scope — non-destructive/testing-only milestone), but the planner should not assume Node 18-specific constraints apply; Vitest 4.1.10 and `@apollo/server` 4.11.3 both run correctly on the actual installed Node 24 runtime (confirmed via `npm test` passing 25/25 in this session).

## Summary

This phase adds integration specs for the four core GraphQL auth flows (`register`, `login`, `dashboard`/`me`, `requestPasswordReset`) driven in-process through `ApolloServer#executeOperation`, against the real Phase-1 test database, plus a repo-root `KNOWN-ISSUES.md` documenting the bugs these tests surface. All CONTEXT.md decisions (D-01 through D-11) were verified directly against this codebase — not just checked against Apollo's docs in the abstract — by writing and running two disposable prototype spec files against the live `portofolio_test` MySQL database (harness confirmed working, then deleted; nothing was committed).

Every load-bearing technical claim in this document was executed and observed, not inferred: the exact `executeOperation({query, variables}, {contextValue})` call shape works with `typeDefs`/`resolvers` imported directly from the barrels; `response.body.kind === 'single'` and `response.body.singleResult.{data,errors}` is the correct access path; no `server.start()` call is needed; and — critically for D-11's exact-string assertions — a plain `throw new Error('message')` inside a resolver surfaces as `singleResult.errors[0].message` (verbatim string) with `extensions.code` always `'INTERNAL_SERVER_ERROR'` (Apollo Server 4 does not preserve custom codes for plain `Error` throws, only for `GraphQLError` with explicit `extensions`). This means negative-case assertions must key on `.message`, never on `.extensions.code`, since all four locked error strings (duplicate email, invalid credentials, unauthenticated, and the incidental Sequelize `isEmail` validation error) share the same generic code.

**Primary recommendation:** Build one shared, side-effect-free Apollo test server (`new ApolloServer({ typeDefs, resolvers })`, no `.start()`) in a small test helper, drive every flow through `executeOperation({ query, variables }, { contextValue })`, assert on `response.body.singleResult.{data,errors}`, reset the `users` table in `beforeEach`, and inject `createTestUser()` instances directly as `contextValue.user` rather than deriving auth from a real JWT/header — exactly as CONTEXT.md's D-01/D-02/D-03 specify. This was proven to work end-to-end in this exact codebase, not just in Apollo's generic docs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GraphQL operation execution (register/login/dashboard/reset) | API / Backend | — | Resolvers own all business logic; tests exercise them via Apollo's in-process execution API, not HTTP |
| Auth context construction (`{ models, user }`) | API / Backend | — | Normally built by `server.js`'s `context` function from a JWT header; tests bypass the header/JWT hop and inject the resolved user object directly (D-02) — this is a test-only seam, not a new architectural layer |
| Row persistence & isolation (`users` table) | Database / Storage | — | Sequelize model layer; Phase-1 harness (`sync({force:true})`, `resetTables()`) already owns provisioning/teardown, this phase only adds per-test truncation via `beforeEach` |
| JWT issuance & verification for assertions | API / Backend | — | `signToken`/`jwt.verify` already unit-tested in Phase 2; this phase re-verifies decoded claims (`sub`, `role`) only as an assertion on integration-test output, not as a new implementation |
| Known-bug documentation | Docs / Repo root | — | `KNOWN-ISSUES.md` is a deliverable artifact, not a runtime component; it lives outside all application tiers |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@apollo/server` | 4.11.3 (installed; confirmed via `backend/package.json` `[VERIFIED: codebase]`) | Provides `ApolloServer` + `executeOperation` in-process test execution API | Official Apollo-documented pattern for integration testing without HTTP — no supertest/port needed |
| `vitest` | 4.1.10 (installed; confirmed via `npx vitest --version` `[VERIFIED: codebase]`) | Test runner already wired via Phase-1 `backend/vitest.config.js` | Already the project's sole runner (SETUP-01); co-located specs auto-discovered, no new config needed |
| `jsonwebtoken` | 9.0.2 (installed `[VERIFIED: codebase]`) | Decode/verify the JWT returned by `register`/`login` for claim assertions (D-10) | Same library `signToken`/`getUserFromRequest` already use; Phase 2's `auth.test.js` establishes the exact `jwt.verify(token, env.jwtSecret)` pattern this phase reuses |
| `sequelize` (via `models` barrel) | 6.37.5 (installed `[VERIFIED: codebase]`) | DB spot-checks (`User.findOne`) after mutations (D-10) | Already the ORM; no new dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `backend/test/helpers.js` (`resetTables`, `createTestUser`) | n/a (project file, not a package) | Per-test table truncation + fixture user creation | Every spec file, in `beforeEach` and wherever an authed/seed user is needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `executeOperation` in-process (chosen, D-01) | `supertest` against a real listening `expressMiddleware(apollo)` HTTP server | Would also exercise CORS + real header→JWT parsing, but that path is already unit-tested in Phase 2; adds port-binding flakiness and a new dev dependency for marginal integration value — correctly rejected in CONTEXT.md |
| Injected `contextValue.user` (chosen, D-02) | Signing a real JWT and passing it through a stubbed `req.headers.authorization` into the real `context` function | Would re-test `getUserFromRequest`, already covered by Phase 2 unit tests; injecting directly keeps this phase focused on resolver/flow behavior |

**Installation:**
No new packages required — every library used here is already an installed dependency of `backend/package.json`. This phase adds test files only.

**Version verification:** All four libraries confirmed installed via direct inspection of `backend/package.json` and `npx vitest --version` (see Environment Availability below) — no `npm view` registry check was needed since no new package is introduced.

## Package Legitimacy Audit

**Not applicable — this phase installs zero new packages.** All libraries used (`@apollo/server`, `vitest`, `jsonwebtoken`, `sequelize`) are pre-existing dependencies verified present in `backend/package.json`. No `slopcheck`/registry audit is required.

## Architecture Patterns

### System Architecture Diagram

```
Test file (backend/src/**/*.test.js)
        │
        │  1. import typeDefs, resolvers directly from barrels
        │     (NOT backend/src/server.js — avoids its top-level
        │      apollo.start()/initializeDatabase()/app.listen side effects)
        ▼
new ApolloServer({ typeDefs, resolvers })   ← constructed once per spec file, no .start() call
        │
        │  2. beforeEach: resetTables() truncates `users`
        ▼
server.executeOperation(
  { query, variables },
  { contextValue: { models, user } }        ← user is null (anon) or a createTestUser() instance (authed)
)
        │
        │  3. Apollo runs the operation through its request pipeline in-process
        │     (parses → validates → executes resolver against real Sequelize models)
        ▼
response.body.kind === 'single'
        │
        ├─► response.body.singleResult.data     — assert shape/values on success
        └─► response.body.singleResult.errors   — assert .message (never .extensions.code —
                                                    always 'INTERNAL_SERVER_ERROR' for plain
                                                    thrown Errors in this codebase)
        │
        ▼
Spot-check DB row via models.User.findOne(...)  ← for register/reset persistence assertions (D-10)
```

### Recommended Project Structure
```
backend/
├── src/
│   └── resolvers/
│       └── user.resolver.test.js     # OR split per-flow (register.test.js, login.test.js, ...) — planner's choice
├── test/
│   ├── helpers.js                    # existing: resetTables(), createTestUser() — reused as-is
│   └── graphqlTestServer.js          # NEW (optional, recommended): shared executeOperation wrapper
└── vitest.config.js                  # unchanged — co-located *.test.js already auto-discovered
KNOWN-ISSUES.md                       # NEW at repo root (D-07)
```

### Pattern 1: Shared in-process Apollo test server + thin `graphql()` wrapper
**What:** One `new ApolloServer({ typeDefs, resolvers })` built at module scope (or in a small `test/graphqlTestServer.js` helper), reused across all specs in a file/suite. A thin wrapper function normalizes `executeOperation`'s result to `{ data, errors }` so every spec doesn't repeat the `body.kind === 'single'` unwrap.
**When to use:** Every integration spec in this phase.
**Example (verified working against this codebase — prototype executed, then removed):**
```javascript
// Source: verified via disposable prototype run against portofolio_test DB
import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../schemas/index.js';
import { resolvers } from './index.js';
import { models } from '../models/index.js';

const server = new ApolloServer({ typeDefs, resolvers });

export async function graphql(query, variables, user = null) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user } }
  );
  // response.body.kind is always 'single' for this schema (no @defer/@stream usage)
  return response.body.singleResult;
}
```
```javascript
// Usage in a spec — no server.start() call needed, Apollo starts itself in the background
const { data, errors } = await graphql(REGISTER_MUTATION, { name, email, password });
expect(errors).toBeUndefined();
expect(data.register.user.role).toBe('ADMIN');
```

### Pattern 2: Injected context for authed/anon cases (D-02)
**What:** Build the second `executeOperation` argument as `{ contextValue: { models, user } }`, where `user` is either `null` (anonymous) or a real `User` model instance obtained from `createTestUser({ role })` (authed). This exactly mirrors what `server.js`'s real `context` function returns after `getUserFromRequest` resolves — but skips signing/parsing a JWT.
**When to use:** `dashboard`/`me` (BE-06) and `logout` (optional) cases; NOT needed for `register`/`login`/`requestPasswordReset`, which read `models` only and receive no authenticated user.
**Example (verified):**
```javascript
// Source: verified via disposable prototype run against portofolio_test DB
const adminUser = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
const { data, errors } = await graphql(DASHBOARD_QUERY, {}, adminUser);
expect(errors).toBeUndefined();
expect(data.dashboard.users).not.toBeNull();       // ADMIN branch populates `users`

const { errors: anonErrors } = await graphql(DASHBOARD_QUERY, {}, null);
expect(anonErrors[0].message).toBe('You must be logged in to perform this action.');
```

### Anti-Patterns to Avoid
- **Importing `backend/src/server.js` in tests:** Its top-level `await apollo.start()`, `await initializeDatabase()`, and `app.listen(...)` run as side effects on import — this is exactly why D-01 mandates constructing a fresh `ApolloServer` from the `typeDefs`/`resolvers` barrels instead.
- **Asserting on `errors[0].extensions.code`:** Every thrown-`Error` case in this codebase surfaces as `'INTERNAL_SERVER_ERROR'` (verified) — there is no `BAD_USER_INPUT`/`UNAUTHENTICATED` distinction to assert on. Assert `.message` only, per D-11.
- **Relying on `afterEach` for table resets:** A test that throws before cleanup runs would leave residue for the next test; `beforeEach` (D-04) guarantees a clean slate regardless of the previous test's outcome.
- **Driving auth through a real JWT + fake `req` object:** Re-tests `getUserFromRequest`, which is already Phase-2 unit-test territory (see CONTEXT.md canonical refs) — adds no integration value and couples these specs to header-parsing details.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Simulating an HTTP GraphQL request | A raw `fetch`/`supertest` call against a listening server | `server.executeOperation` | Apollo's own documented in-process testing API — no port, no CORS, no Express middleware needed (D-01) |
| Building a fake authenticated `req`/session | Hand-rolled request/session mocks | Direct `contextValue.user` injection (D-02) | Mirrors the real `context` function's *output* shape exactly, without re-deriving it |
| Verifying a JWT's claims | Manual base64 decode of the token | `jwt.verify(token, env.jwtSecret)` (same call Phase 2's `auth.test.js` already uses) | Correctly validates signature+expiry, not just shape; reuses established project pattern |
| Truncating test data | Manual raw SQL `DELETE`/`TRUNCATE` | `resetTables()` from `backend/test/helpers.js` | Already implemented, already Sequelize-aware (`models.User.destroy({ where: {}, truncate: true })`) |

**Key insight:** Every piece of the testing seam this phase needs (server construction, auth injection, table reset, JWT verification) already has an established, working pattern in this repo (Phase 1/2) or in Apollo's own documented API — there is no gap that requires new tooling or a new dependency.

## Common Pitfalls

### Pitfall 1: Assuming GraphQL errors are `throw`n and catchable via try/catch
**What goes wrong:** Writing `await expect(graphql(...)).rejects.toThrow(...)` — this never fails even for genuine errors, because `executeOperation` never rejects/throws for GraphQL-level errors.
**Why it happens:** Apollo's design principle (confirmed in official docs): "these errors are not *thrown*" — they're returned in `response.body.singleResult.errors`.
**How to avoid:** Always destructure `{ data, errors }` from the result and assert on `errors` directly; never wrap the call in `expect(...).rejects`.
**Warning signs:** A test that "passes" even when you comment out the resolver's error-throwing line — a sign the assertion isn't actually checking the error path.

### Pitfall 2: Treating the `dashboard` unauthenticated case and register-duplicate-email case as differently-coded errors
**What goes wrong:** Writing `expect(errors[0].extensions.code).toBe('UNAUTHENTICATED')` or `'BAD_USER_INPUT'`, expecting Apollo to auto-classify errors thrown from plain `Error` objects.
**Why it happens:** Some Apollo Server tutorials show `GraphQLError` with explicit `extensions: { code: 'UNAUTHENTICATED' }`; this codebase's resolvers/`requireAuth` throw plain `new Error(...)`, which Apollo Server 4 always classifies as `'INTERNAL_SERVER_ERROR'` unless `formatError` or a `GraphQLError` overrides it — verified: no `formatError` is configured anywhere in this codebase.
**How to avoid:** Assert on `.message` only (per D-11); do not add code-based assertions this codebase's error-throwing style cannot satisfy.
**Warning signs:** A test hardcoding an error code that doesn't match observed output — run once and check actual `extensions.code` before locking an assertion.

### Pitfall 3: Forgetting `register`'s first-user-ADMIN quirk makes tests order-dependent
**What goes wrong:** A test suite that doesn't reset `users` between every single test (e.g., only `beforeAll` per file) can have the ADMIN/USER role assignment silently flip depending on run order or test file interleaving.
**Why it happens:** `register`'s role assignment is `userCount === 0 ? 'ADMIN' : 'USER'` — a global count query against the whole table, not scoped per test.
**How to avoid:** `beforeEach(resetTables)` in every spec file that calls `register` (D-04); explicitly seed a prior user via `createTestUser()` before asserting the USER branch (D-05).
**Warning signs:** A register test asserting `role === 'ADMIN'` that passes in isolation but fails when run after another spec file that also registers users — a sign table state is leaking across files/tests.

### Pitfall 4: Sequelize `isEmail` validation error is the de-facto "invalid input" case for register — not a schema-level rejection
**What goes wrong:** Assuming GraphQL's `String!` non-null constraint is the only "invalid input" surface for `register`, and testing with an empty string expecting a schema-level parse/validation error before the resolver runs.
**Why it happens:** The SDL only declares `email: String!` (presence, not format). An empty string (`''`) and a malformed string (`'not-an-email'`) both pass schema validation and reach the resolver; `models.User.create(...)` then fails via the model's `validate: { isEmail: true }` hook, producing an uncaught `SequelizeValidationError`.
**How to avoid:** Use a malformed/empty email as the "invalid input" case (BE-04) and expect the message to be `'Validation error: Validation isEmail on email failed'` (confirmed via prototype run against the live test DB) — this is a **resolver/model-level rejection**, not a GraphQL schema-level one. Note this distinction in the spec/comment since CONTEXT.md left the exact case to planner discretion.
**Warning signs:** A test expecting a schema-parse error (e.g., asserting a `GRAPHQL_VALIDATION_FAILED` code) for an empty-string email — the actual failure path is a Sequelize validation error surfaced with `extensions.code: 'INTERNAL_SERVER_ERROR'`, same as every other thrown error in this codebase.

## Code Examples

### `register` — full mutation + ADMIN/USER role matrix (D-05, D-10, D-11)
```javascript
// Source: verified via disposable prototype run against portofolio_test DB (this session)
const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      token
      user { id name email role }
    }
  }
`;

it('makes the first registrant ADMIN', async () => {
  const { data, errors } = await graphql(REGISTER_MUTATION, {
    name: 'Ada', email: 'ada@example.com', password: 'Password123!'
  });
  expect(errors).toBeUndefined();
  expect(data.register.user.role).toBe('ADMIN');

  const payload = jwt.verify(data.register.token, env.jwtSecret);
  expect(payload.role).toBe('ADMIN');
  expect(payload.sub).toBe(Number(data.register.user.id));

  const row = await models.User.findOne({ where: { email: 'ada@example.com' } });
  expect(row.passwordHash).not.toBe('Password123!');
  await expect(row.validatePassword('Password123!')).resolves.toBe(true);
});

it('makes subsequent registrants USER', async () => {
  await createTestUser(); // seeds one prior user — count is now 1
  const { data } = await graphql(REGISTER_MUTATION, {
    name: 'Bob', email: 'bob@example.com', password: 'Password123!'
  });
  expect(data.register.user.role).toBe('USER');
});

it('rejects a duplicate email with the exact API-contract message', async () => {
  await createTestUser({ email: 'dup@example.com' });
  const { data, errors } = await graphql(REGISTER_MUTATION, {
    name: 'Dup', email: 'dup@example.com', password: 'Password123!'
  });
  expect(errors[0].message).toBe('A user with this email already exists.');
  expect(data).toBeNull();
});
```

### `login` (BE-05)
```javascript
// Source: derived from backend/src/resolvers/user.resolver.js:39-43
const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { token user { id role } }
  }
`;

it('rejects invalid credentials with the exact API-contract message', async () => {
  await createTestUser({ email: 'ok@example.com' }); // passwordHash: 'Password123!' pre-hash
  const { errors } = await graphql(LOGIN_MUTATION, { email: 'ok@example.com', password: 'WrongPassword' });
  expect(errors[0].message).toBe('Invalid email or password.');
});
```

### `requestPasswordReset` (BE-07, D-09, D-10)
```javascript
// Source: derived from backend/src/resolvers/user.resolver.js:48-61
const REQUEST_RESET_MUTATION = `
  mutation RequestReset($email: String!) {
    requestPasswordReset(email: $email) { message resetToken }
  }
`;

it('returns the generic message and stores a reset token for an existing email', async () => {
  const user = await createTestUser({ email: 'exists@example.com' });
  const { data } = await graphql(REQUEST_RESET_MUTATION, { email: 'exists@example.com' });
  expect(data.requestPasswordReset.message).toBe('If the account exists, a password reset token has been generated.');

  await user.reload();
  expect(user.resetPasswordToken).not.toBeNull();
  expect(user.resetPasswordExpiresAt).not.toBeNull();
});

it('returns the same generic message for a non-existing email', async () => {
  const { data } = await graphql(REQUEST_RESET_MUTATION, { email: 'nobody@example.com' });
  expect(data.requestPasswordReset.message).toBe('If the account exists, a password reset token has been generated.');
  expect(data.requestPasswordReset.resetToken).toBeNull();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `apollo-server-testing` package's `createTestClient` | `ApolloServer#executeOperation` (built into `@apollo/server` v4 core) | Apollo Server 4 (2022) removed the separate testing package | No extra dependency needed — this codebase already has `@apollo/server` 4.11.3, so no version-migration concern applies |

**Deprecated/outdated:** None relevant — `@apollo/server` 4.x's `executeOperation` API is current and stable; no newer major version changes this pattern as of research date.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Apollo Server 4's default error classification (`INTERNAL_SERVER_ERROR` for plain thrown `Error`) will remain stable across any future `@apollo/server` patch releases within the 4.x line | Common Pitfalls #2, Summary | Low — this was verified by direct execution against the installed 4.11.3, not inferred from docs alone; a patch bump is unlikely to change default error-formatting behavior, but if it did, `.extensions.code` assertions would need revisiting (already avoided per D-11) |

**All other claims in this document were verified either by direct code inspection of this repository or by executing disposable prototype tests against the live `portofolio_test` database in this session** — no assumption-only claims remain regarding the core `executeOperation` mechanics, error message strings, or role-matrix behavior.

## Open Questions (RESOLVED)

1. **Whether to split specs per-flow or into one file**
   - What we know: CONTEXT.md explicitly leaves this to planner discretion; Phase 2 precedent (`auth.test.js`, `User.test.js`) uses one file per source module.
   - What's unclear: Whether "one file per source module" maps to one `user.resolver.test.js`, or whether four flows in one resolver file warrants splitting for readability.
   - Recommendation: Follow the Phase 2 precedent — one `backend/src/resolvers/user.resolver.test.js` co-located next to `user.resolver.js`, using nested `describe` blocks per flow (`register`, `login`, `dashboard`/`me`, `requestPasswordReset`), consistent with how `auth.test.js` nests `describe` per exported function.
   - **RESOLVED (planning):** Per-flow spec files (`register.test.js`, `login.test.js`, `dashboard.test.js`, `resetPassword.test.js`) chosen over one combined file — the split lets Wave 2 plans (03-02, 03-03) execute in parallel with zero `files_modified` overlap. Still co-located under `backend/src/resolvers/`, still nested `describe` per flow.

2. **Whether to add the optional `graphqlTestServer.js` helper under `backend/test/`**
   - What we know: The wrapper pattern shown above measurably reduces boilerplate (confirmed in the prototype — the raw `body.kind === 'single'` unwrap is repetitive across every assertion).
   - What's unclear: CONTEXT.md marks this as discretionary ("add if it reduces per-spec boilerplate; not mandated").
   - Recommendation: Add it — the prototype needed the unwrap in every single test; a shared `graphql(query, variables, user)` helper in `backend/test/helpers.js` (extending the existing file, consistent with its role per the canonical refs) removes this repetition with negligible complexity cost.
   - **RESOLVED (planning):** Helper added — as a `graphql()` extension to the existing `backend/test/helpers.js` (created in Task 03-01-01) rather than a separate `graphqlTestServer.js`, matching `03-PATTERNS.md`'s in-place-extension guidance.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test execution | Yes | v24.15.0 | — |
| Vitest | Test runner (Phase 1 harness) | Yes | 4.1.10 | — |
| MySQL (`portofolio_test` reachable at 127.0.0.1:3306) | Integration tests need real DB writes | Yes (`mysqld is alive`, Docker container `portofolio-mysql-1` healthy) | mysql:8.4 (per docker-compose) | — |
| `@apollo/server` | `executeOperation` API | Yes | 4.11.3 | — |
| `jsonwebtoken` | JWT claim assertions | Yes | 9.0.2 | — |
| Existing Phase 1/2 test suite | Confirms harness is healthy before adding Phase 3 specs | Yes — `npm test` in `backend/` passes 25/25 across 5 files | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all dependencies for this phase are already installed and confirmed working.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 |
| Config file | `backend/vitest.config.js` (Phase 1 — unchanged by this phase) |
| Quick run command | `npm test --workspace backend -- src/resolvers/user.resolver.test.js` |
| Full suite command | `npm test --workspace backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-04 | `register` creates a user (ADMIN branch, empty table) | integration | `npm test --workspace backend -- -t "ADMIN"` | ❌ Wave 0 |
| BE-04 | `register` creates a user (USER branch, seeded table) | integration | `npm test --workspace backend -- -t "USER"` | ❌ Wave 0 |
| BE-04 | `register` rejects a duplicate email (exact message, D-11) | integration | `npm test --workspace backend -- -t "duplicate email"` | ❌ Wave 0 |
| BE-04 | `register` rejects invalid input (malformed/empty email → Sequelize `isEmail` validation error) | integration | `npm test --workspace backend -- -t "invalid"` | ❌ Wave 0 |
| BE-05 | `login` returns a verifiable JWT for valid credentials | integration | `npm test --workspace backend -- -t "valid credentials"` | ❌ Wave 0 |
| BE-05 | `login` rejects invalid credentials (exact message, D-11) | integration | `npm test --workspace backend -- -t "invalid credentials"` | ❌ Wave 0 |
| BE-06 | `dashboard`/`me` returns data for an authenticated (ADMIN and USER) request | integration | `npm test --workspace backend -- -t "dashboard"` | ❌ Wave 0 |
| BE-06 | `dashboard` rejects an unauthenticated request (exact message, D-11) | integration | `npm test --workspace backend -- -t "unauthenticated"` | ❌ Wave 0 |
| BE-07 | `requestPasswordReset` documents current behavior (existing + non-existing email, DB spot-check) | integration | `npm test --workspace backend -- -t "requestPasswordReset"` | ❌ Wave 0 |
| DOCS-01 | Known security bugs surfaced by the above tests are recorded in `KNOWN-ISSUES.md`, not fixed | manual (doc review) | n/a — verified by reading `KNOWN-ISSUES.md` exists and has ≥1 entry backed by a test (D-08) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test --workspace backend -- <changed-spec-file>` (targeted rerun)
- **Per wave merge:** `npm test --workspace backend` (full backend suite — currently 25 tests, 5 files, ~2s)
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus a manual check that `KNOWN-ISSUES.md` exists at repo root with the reset-token-exposure entry (DOCS-01 has no automated assertion — it's a doc deliverable).

### Wave 0 Gaps
- [ ] `backend/src/resolvers/user.resolver.test.js` (or per-flow files) — covers BE-04, BE-05, BE-06, BE-07
- [ ] `backend/test/helpers.js` extension (optional `graphql()` wrapper) — reduces boilerplate, not a hard requirement
- [ ] `KNOWN-ISSUES.md` (repo root) — covers DOCS-01; not a test file but a required Wave 0/1 deliverable
- Framework install: none — Vitest, `@apollo/server`, `jsonwebtoken` all already installed; no `npm install` step needed for this phase.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | `login`/`register` credential checks are the subject under test; no new control introduced — tests pin existing `bcryptjs`/`jsonwebtoken` behavior (Phase 2 already unit-tests the primitives) |
| V3 Session Management | Yes | Stateless JWT verified via `jwt.verify(token, env.jwtSecret)` in test assertions; no session store to test |
| V4 Access Control | Yes | `requireAuth`/`requireAdmin` role-gating on `dashboard` is directly asserted (BE-06); role matrix (ADMIN/USER) pinned via D-05 |
| V5 Input Validation | Yes | `register`'s email-format rejection path (Sequelize `isEmail`) is the input-validation case this phase actually tests (Pitfall 4) |
| V6 Cryptography | No | `bcryptjs` hashing already unit-tested in Phase 2 (BE-02); this phase only spot-checks that a hash (not plaintext) lands in the DB (D-10), it does not re-test hashing correctness |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation (documented, not fixed, per D-08) |
|---------|--------|--------------------------------------------------------|
| Password-reset token returned in API response (account takeover) | Information Disclosure / Elevation of Privilege | KNOWN-ISSUES.md entry (D-07/D-08 primary entry); mitigation is out-of-scope (FIX-01, v2) — deliver token via email only, never in the mutation payload |
| Account enumeration via distinguishable responses | Information Disclosure | Already partially mitigated by the generic `'If the account exists...'` message (asserted as happy-path behavior per D-09); no differential-timing test is in scope for this phase |
| No server-side password strength validation on `register` | Tampering (weak credential acceptance) | KNOWN-ISSUES.md entry if the "invalid input" test case touches it (D-08) — this phase's chosen invalid-input case is a malformed *email*, not password strength, so this entry is optional/discretionary per D-08's "only if these specific tests directly touch them" |

## Sources

### Primary (HIGH confidence)
- Direct execution of two disposable prototype Vitest spec files against this repository's `portofolio_test` MySQL database (this session) — confirmed `executeOperation` call shape, `singleResult` access, no-`start()`-required behavior, exact error `.message` strings, `extensions.code` defaulting, and the Sequelize `isEmail` validation-error path
- `backend/src/resolvers/user.resolver.js`, `backend/src/schemas/user.schema.js`, `backend/src/utils/auth.js`, `backend/src/models/User.js`, `backend/src/server.js`, `backend/src/models/index.js` — read directly, this session
- `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/vitest.config.js` — read directly, this session
- `backend/src/utils/auth.test.js`, `backend/src/models/User.test.js` — read directly, this session, to confirm Phase 2's established spec conventions
- `backend/package.json` — confirmed installed versions of `@apollo/server` (4.11.3), `vitest` (4.1.10 via `npx vitest --version`), `jsonwebtoken` (9.0.2), `sequelize` (6.37.5)
- https://www.apollographql.com/docs/apollo-server/testing/testing — official Apollo Server 4 integration testing guide (`executeOperation`, `singleResult`, no-start-required)

### Secondary (MEDIUM confidence)
- WebSearch results on Apollo Server 4 default `extensions.code` behavior for plain thrown errors (`INTERNAL_SERVER_ERROR`) — cross-verified directly against this codebase's actual output in the prototype run, so elevated to effectively HIGH confidence for this specific codebase

### Tertiary (LOW confidence)
- None — every claim in this document was either verified by direct code reading or by executing prototype tests against the live environment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all versions confirmed installed via direct inspection
- Architecture: HIGH — the exact `executeOperation`/`contextValue`/`singleResult` pattern was proven to work in this codebase, not just documented abstractly
- Pitfalls: HIGH — every pitfall (error-code defaulting, order-dependence, isEmail validation path) was directly observed via prototype execution, not inferred

**Research date:** 2026-07-12
**Valid until:** 30 days (stable stack; no fast-moving dependencies in this phase's scope)
