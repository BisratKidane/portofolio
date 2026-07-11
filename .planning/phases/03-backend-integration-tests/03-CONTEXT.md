# Phase 3: Backend Integration Tests - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase writes **integration tests** for the four core GraphQL auth flows, exercised against the real Phase-1 test database, and records the security bugs these tests surface in a tracked known-issues doc. It satisfies BE-04, BE-05, BE-06, BE-07, DOCS-01:

- **`register`** mutation (BE-04): creates a user, rejects a duplicate email, rejects invalid input.
- **`login`** mutation (BE-05): returns a JWT for valid credentials, rejects invalid credentials.
- **Protected `dashboard` / `me` query** (BE-06): returns data for an authenticated request, rejects an unauthenticated one.
- **`requestPasswordReset`** flow (BE-07): documents its current behavior.
- **Known-issues doc** (DOCS-01): security bugs surfaced by these tests recorded (location + expected vs. actual), not fixed.

It consumes the Phase-1 harness (Vitest runner, `env/test.env`, per-run `sync({force:true})` + teardown, `resetTables()` / `createTestUser()` helpers) and the co-located `src/**/*.test.js` convention. It does NOT modify any application runtime code (non-destructive), does NOT fix the known bugs (documented, not remediated — see FIX-01/v2), does NOT touch the frontend (Phases 4–5), and does NOT add CI (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Test entry point & auth simulation
- **D-01:** Tests drive the GraphQL layer **in-process via Apollo `server.executeOperation({ query, variables }, { contextValue })`** — NOT full HTTP/supertest. A fresh `new ApolloServer({ typeDefs, resolvers })` is constructed inside a test helper by importing `typeDefs` from `backend/src/schemas/index.js` and `resolvers` from `backend/src/resolvers/index.js` directly. This avoids `server.js`'s top-level side effects (`apollo.start()`, `initializeDatabase()`, `app.listen`), needs no port/network, and adds no supertest dependency. Chosen over supertest because the Express/CORS/`Authorization`-header → JWT path is already unit-tested in Phase 2 (D-01, `getUserFromRequest`), so re-driving it over HTTP adds little integration value.
- **D-02:** The authenticated context is built by **injecting a resolved user directly**: `contextValue = { models, user: <userInstance from createTestUser()> }`, mirroring exactly what the real `context` function returns after `getUserFromRequest`. The unauthenticated case passes `user: null`. No JWT signing / fake `req` / header parsing inside integration tests — that derivation is Phase-2 unit scope.
- **D-03:** `executeOperation` resolves once and returns a `singleResult`; assertions read `body.singleResult.data` and `body.singleResult.errors`. (Planner: remember Apollo wraps results — errors are on `singleResult.errors`, not a thrown exception.)

### DB isolation & the first-user-ADMIN quirk
- **D-04:** Row state is reset with **`resetTables()` in a `beforeEach`** hook so every test starts from an empty, known `users` table. Chosen over `afterEach` (a crashed cleanup leaves residue) and over per-file `beforeAll` (makes tests order-dependent, which is fatal given the first-user-ADMIN logic). This is the "stronger per-test isolation" Phase 1 explicitly deferred to Phase 3.
- **D-05:** The register test **covers both role branches explicitly**, since `register` makes the first registrant ADMIN (`userCount === 0`) and everyone else USER — a security-relevant behavior worth pinning:
  - **ADMIN branch:** register into an empty table (post-`beforeEach`), assert `role === 'ADMIN'`.
  - **USER branch:** seed a prior user with `createTestUser()` first, then register and assert `role === 'USER'`.
- **D-06:** `dashboard` / `me` tests control role deterministically by **creating the context user directly** via `createTestUser({ role: 'ADMIN' })` / `createTestUser({ role: 'USER' })` and injecting it (D-02) — they do not go through `register`, so the first-user quirk is irrelevant to them. The admin `dashboard` case can assert the `users` array is populated; the non-admin case asserts `users` is null and the standard message.

### Known-issues doc (DOCS-01)
- **D-07:** The tracked doc is a **new `KNOWN-ISSUES.md` at the repository root**, using per-issue sections: Title, Location (`file:line`), Expected vs. Actual behavior, Severity, and a pointer to the test that documents it. Repo-root for portfolio visibility (sits next to `README.md`). This is a first-class deliverable, distinct from the `.planning/codebase/CONCERNS.md` planning artifact.
- **D-08:** Scope of the doc is **only bugs these four flows actually surface** — every entry is backed by a test in this phase. Primary entry: the **reset-token exposure** (`requestPasswordReset` returns `resetToken` in the API payload — account-takeover risk). Add other issues only if these specific tests directly touch them (e.g. no server-side password strength/length validation on `register`; generic "if the account exists" message / account-enumeration surface on `requestPasswordReset`). A short pointer to `.planning/codebase/CONCERNS.md` covers the full audit so nothing is lost.

### Reset-flow test posture (BE-07)
- **D-09:** The `requestPasswordReset` test asserts the **happy path only** — the mutation succeeds and returns the generic message for both an existing and a non-existing email, and (per D-11) stores a token + expiry on the user for the existing-email case. It does **not** encode the token-leak as a bug-pinning assertion. The reset-token exposure is documented in `KNOWN-ISSUES.md` (D-07/D-08), not asserted as "expected" behavior in the suite. (User chose this over a characterization/assert-the-bug test.)

### Assertion depth
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 foundation (the harness this phase builds on)
- `.planning/phases/01-backend-test-tooling-test-database/01-CONTEXT.md` — Locked test-infra decisions (D-06 co-located specs, D-08 helper API `resetTables()`/`createTestUser()`, per-run `sync({force:true})` + teardown, guard/env setup).
- `.planning/phases/01-backend-test-tooling-test-database/01-SPEC.md` — Requirements/boundaries of the harness Phase 3 consumes.
- `backend/vitest.config.js` — Runner config; sets `ENV_FILE`→`env/test.env`, `NODE_ENV=test`, `pool: 'forks'`, `fileParallelism: false`.
- `backend/test/globalSetup.js` — Per-run provisioning (`sync({ force: true, match: /_test$/ })`) + teardown (`drop`/`close`); imports the models aggregator so models are attached before sync.
- `backend/test/helpers.js` — `resetTables()` (truncate users) and `createTestUser(overrides)` (creates via `User.create`, so hashing hooks + role default apply). Extend here if new fixtures are needed.
- `backend/test/guard.js` — `assertTestDatabase()` safety guard (NODE_ENV=test AND DB name ends `_test`).
- `env/test.env` — Provides `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESET_TOKEN_EXPIRES_MINUTES`, and `DB_NAME=portofolio_test` the flows/DB rely on.

### Phase 2 (unit coverage that Phase 3 must NOT duplicate)
- `.planning/phases/02-backend-unit-tests/02-CONTEXT.md` — `getUserFromRequest` header→JWT→user derivation (D-01), `signToken` claims (D-02), password hashing hook (D-05), role guards (D-06), reset-token utils (D-07) are already unit-tested. Phase 3 injects users directly and tests flows end-to-end rather than re-testing these units.

### Code under test (read to write the integration specs)
- `backend/src/resolvers/user.resolver.js` — The four flows: `register` (first-user-ADMIN at `userCount === 0`), `login`, `dashboard`/`me`, `requestPasswordReset` (returns `resetToken` — the DOCS-01 bug), plus `logout`/`resetPassword`.
- `backend/src/schemas/index.js` — `typeDefs` to feed the test-only `ApolloServer` (aggregates `backend/src/schemas/user.schema.js`).
- `backend/src/resolvers/index.js` — `resolvers` to feed the test-only `ApolloServer`.
- `backend/src/schemas/user.schema.js` — SDL shapes for assertions: `AuthPayload { token, user }`, `PasswordResetPayload { message, resetToken }`, `Dashboard { message, user, users }`.
- `backend/src/server.js` — The real `context` function `{ models, user: getUserFromRequest(req, models) }` that D-02 mirrors. NOTE its top-level side effects — do NOT import it in tests (D-01).
- `backend/src/models/index.js` — `models` object injected into `contextValue`; `sequelize` instance the harness drives.
- `backend/src/models/User.js` — `beforeCreate` hashing hook + `validatePassword`; field names (`passwordHash`, `resetPasswordToken`, `resetPasswordExpiresAt`) used in DB spot-checks.
- `backend/src/utils/auth.js` — `signToken` (JWT claim shape for register/login assertions), `requireAuth`/`requireAdmin` (source of the exact error strings in D-11).

### Codebase maps
- `.planning/codebase/CONCERNS.md` — Full security audit; the source for `KNOWN-ISSUES.md` entries (reset-token exposure §Security, no password-strength validation, account enumeration) and the "see CONCERNS.md for full audit" pointer (D-08).
- `.planning/codebase/CONVENTIONS.md` — Naming/style the new specs must match.
- `.planning/codebase/TESTING.md` — Key error paths and integration considerations for the resolvers.

### Deliverable created by this phase
- `KNOWN-ISSUES.md` (repo root) — NEW; created per D-07/D-08.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/test/helpers.js` `createTestUser({ role })` — the primary fixture for D-02/D-05/D-06 (creates a real hashed user; accepts role/email overrides). `resetTables()` — the `beforeEach` reset for D-04.
- Phase-1 Vitest config + `env/test.env` + globalSetup — provide the provisioned `portofolio_test` DB automatically; integration specs just import helpers and go.
- `typeDefs` / `resolvers` barrels (`backend/src/schemas/index.js`, `backend/src/resolvers/index.js`) — importable to construct a side-effect-free `ApolloServer` in a test helper (D-01).

### Established Patterns
- ESM + native Vitest ESM — import modules directly (`import { typeDefs } from '../src/schemas/index.js'`).
- Resolvers read everything from `context` (`{ models, user }`) — makes in-process `executeOperation` with an injected context the natural integration seam (D-02).
- Resolvers `throw new Error('...')` for failures; Apollo surfaces these on `singleResult.errors` — assert there, not via try/catch (D-03).
- Password hashing is via Sequelize `beforeCreate`/`beforeUpdate` hooks only — the register DB spot-check (D-10) is what guards the "no plaintext in DB" invariant CONCERNS.md flags as untested/fragile.

### Integration Points
- New spec file(s) only under `backend/src/**/*.test.js` (layout at planner discretion) + a new repo-root `KNOWN-ISSUES.md`. Possibly a small test helper (Apollo/context wrapper) under `backend/test/`.
- No application source is modified — tests construct their own Apollo instance and inject context from the outside; the existing `sequelize`/models/env are driven by the Phase-1 harness.

</code_context>

<specifics>
## Specific Ideas

- Entry seam: `new ApolloServer({ typeDefs, resolvers })` + `server.executeOperation({ query, variables }, { contextValue: { models, user } })`; read result from `body.singleResult.{data,errors}`.
- Auth: authed = inject `createTestUser({ role })` instance as `context.user`; unauth = `user: null`.
- Register role matrix: empty table → ADMIN; seed one user first → next register is USER.
- Register DB spot-check: after mutation, fetch the row and assert `passwordHash !== 'Password123!'` and that `validatePassword('Password123!')` is true.
- JWT assertion: decode/verify the returned `token` and assert `sub` = user id and `role` matches.
- Exact error strings to pin (D-11): `'A user with this email already exists.'`, `'Invalid email or password.'`, `'You must be logged in to perform this action.'`.
- `KNOWN-ISSUES.md` primary entry: `requestPasswordReset` returns `resetToken` over the API — `backend/src/resolvers/user.resolver.js:48-61` — Expected: token delivered only via email; Actual: token returned in response payload (account-takeover). Severity: High. Documented, not fixed (see FIX-01/v2).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

- Fixing any documented bug (reset-token exposure, JWT-secret fallback, rate limiting, password-strength validation) is explicitly v2 / FIX-01, not this phase (PROJECT.md Out of Scope).
- Broader CONCERNS.md items not touched by these four flows (JWT-secret fallback, no rate limiting, no revocation, CORS origin leak, unbounded `users` listing) are left in `.planning/codebase/CONCERNS.md`; `KNOWN-ISSUES.md` links to it rather than re-porting them (D-08).

</deferred>

---

*Phase: 3-Backend Integration Tests*
*Context gathered: 2026-07-12*
