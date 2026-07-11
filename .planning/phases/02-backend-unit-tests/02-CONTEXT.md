# Phase 2: Backend Unit Tests - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase writes **fast, isolated unit tests** for the security-critical backend utility functions, satisfying BE-01, BE-02, BE-03:

- **Auth token utilities** (`backend/src/utils/auth.js`): `signToken`, the JWT-verify path inside `getUserFromRequest`, and the reset-token helpers `createResetToken` / `resetTokenExpiry`.
- **Password handling** (`backend/src/models/User.js`): the `beforeCreate` hashing hook and the `validatePassword` instance method.
- **Role guards** (`backend/src/utils/auth.js`): `requireAuth`, `requireAdmin`.

It consumes the Phase 1 harness (Vitest runner, co-located `*.test.js` convention, `env/test.env`, DB helpers) but does NOT write GraphQL resolver/integration tests (Phase 3), does NOT touch the frontend (Phases 4–5), and does NOT change any application runtime behavior. Known security bugs are documented in Phase 3, not here.

</domain>

<decisions>
## Implementation Decisions

### Token verify scope (BE-01)
- **D-01:** JWT verification is unit-tested by exercising `getUserFromRequest` **directly with a stubbed `models` object** (`User.findByPk` mocked) and a fake `req` carrying a `Bearer` header. This one test path covers header parsing, sign→verify round-trip, and the silent `null` degradation on missing/invalid tokens — all without a DB connection. (Chosen over testing `jwt.verify` in isolation, because `getUserFromRequest` is the actual exported surface and there is no standalone verify function.)
- **D-02:** `signToken` is tested directly: assert its output is a verifiable JWT carrying the expected `sub`/`role` claims (decode/verify the returned token), and feed a freshly-signed token through `getUserFromRequest` to prove the round-trip.

### Negative-case construction (BE-01)
- **D-03:** Negative cases are constructed **deterministically, without fake timers**:
  - **Expired:** sign with a negative/short expiry (`expiresIn: '-1s'`) so `jwt.verify` rejects immediately.
  - **Tampered:** take a valid token and either mutate a character in the payload/signature segment, or sign with a different secret.
  - Rationale: no `vi.useFakeTimers()` setup/teardown, no subtle interaction with jwt's clock handling — fully reproducible.

### Password handling (BE-02)
- **D-04:** `validatePassword` is unit-tested on an in-memory model instance (no save): set/build a user whose `passwordHash` is a known bcrypt hash, assert it accepts the correct password and rejects an incorrect one.
- **D-05:** The "password is hashed on create, never stored plaintext" assertion exercises the **real `beforeCreate` hashing hook**. The planner picks the lightest path that still runs the actual hook. **Constraint:** in Sequelize 6, `beforeCreate` fires on `save()`/`create()`, NOT on `build()` — so a pure `User.build()` will not hash. Acceptable resolutions: invoke the hook logic directly on a built instance, or use the Phase-1 test-DB harness (`createTestUser`) for just this assertion. Assert the stored `passwordHash !== plaintext` and that it verifies via bcrypt. (See Claude's Discretion.)

### Role guards (BE-03)
- **D-06:** `requireAuth` and `requireAdmin` are tested with **plain-object user stubs** (no model instance, no DB): `requireAuth` throws for `null`/undefined and passes for any user; `requireAdmin` allows `{ role: 'ADMIN' }`, throws for `{ role: 'USER' }`, and throws for unauthenticated (null) input.

### Reset-token utilities (opportunistic — same file)
- **D-07:** `createResetToken` and `resetTokenExpiry` are unit-tested in this phase even though they are not named in BE-01/02/03, because they live in `auth.js` and cost is near-zero. Assert `createResetToken` returns a 64-char hex string and is unique across calls; assert `resetTokenExpiry` returns a future `Date` ~`RESET_TOKEN_EXPIRES_MINUTES` ahead of now. This is unit coverage of the utilities only — the `requestPasswordReset` flow and its known token-exposure bug remain Phase 3.

### Test isolation posture
- **D-08:** Preference is **pure in-memory unit tests with no DB connection** wherever the function under test is pure or operates on an unsaved instance (all of BE-01, BE-03, `validatePassword`, reset utils). The only place a DB touch is permitted is the single "hashed on create" assertion in D-05, and only if invoking the hook directly proves impractical. This keeps Phase 2 genuinely "unit" and minimizes overlap with Phase 3 integration.

### Claude's Discretion
- **DB boundary for D-05** — user delegated. Default to invoking the `beforeCreate` hashing behavior without a live DB if Sequelize allows it cleanly; otherwise fall back to `createTestUser`/`User.create()` against the test DB for that one assertion. Planner/researcher to confirm how Sequelize 6 hook invocation works in isolation.
- Exact spec file names and `describe`/`it` structure — follow the co-located `src/**/*.test.js` convention (e.g. `src/utils/auth.test.js`, `src/models/User.test.js`), per Phase 1 D-06.
- Precise stub/mock mechanism for `models.User` in the `getUserFromRequest` test (`vi.fn()` vs a hand-rolled stub object).
- Whether to assert exact error messages from the guards or just that they throw.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 foundation (the harness this phase builds on)
- `.planning/phases/01-backend-test-tooling-test-database/01-CONTEXT.md` — Locked test-infra decisions (D-06 co-located specs, D-07 `backend/test/`, D-08 helper API, env/guard setup).
- `.planning/phases/01-backend-test-tooling-test-database/01-SPEC.md` — Requirements/boundaries of the harness Phase 2 consumes.
- `backend/vitest.config.js` — Runner config; sets `ENV_FILE`→`env/test.env` and `NODE_ENV=test`, `pool: forks`, `fileParallelism: false`.
- `backend/test/helpers.js` — `createTestUser()` / `resetTables()` available if D-05 needs the DB.
- `backend/test/globalSetup.js` — Per-run `sync({force:true})` provisioning + teardown (only relevant if a spec touches the DB).
- `env/test.env` — Provides `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESET_TOKEN_EXPIRES_MINUTES` used by the code under test.

### Code under test (read to write the specs)
- `backend/src/utils/auth.js` — `signToken`, `getUserFromRequest`, `requireAuth`, `requireAdmin`, `createResetToken`, `resetTokenExpiry`.
- `backend/src/models/User.js` — `validatePassword`, `beforeCreate`/`beforeUpdate` hashing hooks, `beforeValidate` email normalization.
- `backend/src/config/env.js` — Shape of `env.jwtSecret`, `env.jwtExpiresIn`, `env.resetTokenExpiresMinutes` the utilities read.

### Codebase maps
- `.planning/codebase/CONVENTIONS.md` — Naming/style the new specs must match.
- `.planning/codebase/TESTING.md` — Mock candidates and key error paths for the auth utilities.
- `.planning/codebase/CONCERNS.md` — Known security bugs (context only; documented in Phase 3, not fixed or tested-as-bug here).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/test/helpers.js` `createTestUser()` — available as the fallback path for the D-05 "hashed on create" assertion.
- Phase 1 Vitest config + `env/test.env` — `signToken`/reset utils read real env values (`JWT_SECRET`, `RESET_TOKEN_EXPIRES_MINUTES`) with no extra setup.
- Co-located `*.test.js` convention already proven by `backend/test/guard.test.js` and the smoke/DB specs.

### Established Patterns
- ESM throughout; Vitest native ESM — import the modules under test directly (`import { signToken } from '../src/utils/auth.js'`).
- Auth guards are thrown-error functions called at the top of resolvers — unit tests assert throw/no-throw rather than middleware behavior.
- `getUserFromRequest` swallows verification errors and returns `null` — a first-class behavior to assert, not an edge case.

### Integration Points
- New spec files only: `backend/src/utils/auth.test.js` and `backend/src/models/User.test.js` (exact names at planner discretion). No application source is modified.
- Most specs need no DB and therefore no globalSetup interaction; if D-05 uses the harness, it relies on the already-wired per-run provisioning.

</code_context>

<specifics>
## Specific Ideas

- Expired-token trick: `jwt.sign(payload, secret, { expiresIn: '-1s' })` — immediate, deterministic rejection.
- Tampered-token trick: split the JWT on `.` and corrupt the signature segment, or sign with a wrong secret.
- Reset-token asserts: 64 hex chars (32 random bytes → hex) and uniqueness across two calls; expiry ~`RESET_TOKEN_EXPIRES_MINUTES` minutes in the future.
- `requireAdmin` matrix: ADMIN → passes, USER → throws, null → throws (via `requireAuth`).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The `requestPasswordReset` resolver flow and its known reset-token exposure bug are Phase 3 / DOCS-01, not this phase; `getUserFromRequest`'s real DB lookup path is covered by Phase 3 integration.)

</deferred>

---

*Phase: 2-Backend Unit Tests*
*Context gathered: 2026-07-12*
