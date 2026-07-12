# Pitfalls Research

**Domain:** Security remediation (7 fixes) on an existing Express 4 + Apollo Server 4 + Sequelize/MySQL + JWT auth stack, under strict TDD with a v1.0 CI-enforced test suite that must stay green
**Researched:** 2026-07-12
**Confidence:** HIGH (codebase-verified: all pitfalls below are grounded in direct reads of `backend/src/resolvers/user.resolver.js`, `backend/src/models/User.js`, `backend/src/config/env.js`, `backend/src/server.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/vitest.config.js`, and every existing `*.test.js`/`*.test.jsx` file) with MEDIUM-confidence external verification (Sequelize docs, express-rate-limit docs/wiki) for the two claims that needed it.

## Critical Pitfalls

### Pitfall 1: The existing `graphql()` test helper bypasses Express entirely — CORS and rate-limit fixes are untestable with it

**What goes wrong:**
`backend/test/helpers.js` calls `server.executeOperation({ query, variables }, { contextValue: { models, user } })` directly against the Apollo `ApolloServer` instance. It never goes through `backend/src/server.js`'s Express app — no `cors()` middleware, no `express.json()`, no future rate-limit middleware, no `expressMiddleware(apollo, { context })`. Every existing integration test (`login.test.js`, `register.test.js`, `resetPassword.test.js`, `dashboard.test.js`) is written against this helper. If rate limiting or the CORS-origin-leak fix is implemented as Express middleware (the natural place for both), **the current test harness cannot exercise either fix at all** — you could write a "red" test that calls `graphql()` and it will never fail, because the code path under test isn't reachable through that helper.

**Why it happens:**
The v1.0 test suite deliberately tested resolvers in isolation for speed and simplicity (no HTTP layer, no Express boot). That was the right call for auth-logic tests, but rate limiting and CORS are HTTP-layer concerns by nature — the mismatch is only exposed once you need to test them.

**How to avoid:**
Before writing any red test for rate limiting or CORS, add a second, HTTP-level test harness — e.g. `supertest` boot of the real Express `app` (this requires extracting `app` from `backend/src/server.js` so it can be imported without calling `app.listen()`/`apollo.start()` twice; currently `server.js` runs top-level side effects on import). Alternatively, if rate limiting is implemented as an Apollo plugin (`requestDidStart`) rather than Express middleware, it *can* be exercised through `executeOperation` — but CORS categorically cannot, since CORS is inherently about the HTTP `Origin` header/response, which `executeOperation` has no concept of. Budget a dedicated "test harness" step before the CORS and rate-limit fixes.

**Warning signs:**
A "red" test for rate limiting or CORS that passes on the very first run without any implementation change — that's proof the test isn't touching the real code path.

**Phase to address:**
A small harness/refactor step must land before (or as the first task of) the rate-limiting and CORS phases — likely bundled into whichever phase implements rate limiting first, since it needs the harness too. Extracting `app` from `server.js` as an importable, non-side-effecting export is the concrete unlock.

---

### Pitfall 2: Rate limiting keyed by path throttles the whole `/graphql` endpoint, not just sensitive mutations

**What goes wrong:**
There is a single `POST /graphql` route (`backend/src/server.js:30-39`) handling every operation — `me`, `dashboard`, `login`, `register`, `requestPasswordReset`, `resetPassword`, `users`. Standard `express-rate-limit` usage (`app.use('/graphql', rateLimiter)`) keys on the route path, which is identical for all of these. A naive implementation throttles legitimate `me`/`dashboard` polling and admin `users` queries at the same rate as brute-force login attempts — either the limit is set generously (useless against brute force) or tightly (breaks normal app usage, e.g. a dashboard auto-refresh).

**Why it happens:**
`express-rate-limit`'s out-of-the-box model assumes one route = one operation. GraphQL collapses many operations onto one route, so path-based middleware can't distinguish them without inspecting the request body.

**How to avoid:**
Rate-limit by *operation*, not by path: inspect `req.body.query`/`operationName` (or `req.body.operationName` if the client sends it) before invoking the limiter, and only apply the limiter's `.consume()`/count logic for `login`, `register`, and `requestPasswordReset`. This can be done either as Express middleware that parses the body and conditionally calls the rate-limit check, or — cleaner given Apollo 4 — as an Apollo Server plugin (`requestDidStart` → `didResolveOperation`) that has `operationName`/`document` already parsed and can key the limiter per-mutation. Do not rate-limit `me`, `dashboard`, `users`, or `logout`.

**Warning signs:**
A test where a burst of `me` queries returns 429s, or where 6 failed `login` attempts followed by a legitimate `dashboard` query also gets throttled.

**Phase to address:**
Rate-limiting phase. Write the red test as: "N+1 failed `login` attempts trigger a 429/GraphQL error; an interleaved `me` query in the same window still succeeds."

---

### Pitfall 3: In-memory rate-limit store carries state across test cases (flaky/order-dependent tests) and is process-local (breaks under multiple workers/replicas)

**What goes wrong:**
Two related failure modes:
1. **Test flakiness:** `express-rate-limit`'s default `MemoryStore` persists hit counts for the lifetime of the process. `backend/vitest.config.js` already sets `pool: 'forks'` and `fileParallelism: false` — meaning **all backend test files run sequentially in a single process** during a given `vitest run`. That's good news for determinism (no cross-process races) but bad news for state bleed: if `login.test.js` exhausts the rate limit for `test@example.com` / a shared IP key, a *later* test file (or a later `it()` in the same file) hitting the same key inherits the exhausted count and fails for the wrong reason — a red test that's red for state-bleed, not for a missing feature.
2. **Multi-instance correctness:** `MemoryStore` state is per-process. If the app is ever deployed with more than one Node process/replica (mentioned as a known future concern — `sequelize.sync()` race risk in `CONCERNS.md` already flags multi-replica boot), each replica has its own independent counter, so the *effective* rate limit is `perInstanceLimit × replicaCount` — silently weaker than configured. This is out of scope to fix in v1.1 (single-instance deployment today) but should be documented as a known limitation, not silently assumed away.

**Why it happens:**
`express-rate-limit`'s default store is deliberately simple (no external dependency). Nobody wires a reset between tests because the library doesn't auto-reset, and nobody notices the multi-instance gap until a second replica is added.

**How to avoid:**
- In tests: call the store's `resetKey(key)` or `resetAll()` between test cases. Either import the limiter instance in `backend/test/helpers.js` and add a `resetTables`-style `resetRateLimits()` helper called in `beforeEach` alongside `resetTables`, or construct a fresh limiter per test file. `express-rate-limit` (v7+) exposes both `resetKey()` and `resetAll()` on the store for exactly this purpose. [MEDIUM confidence — confirmed via express-rate-limit GitHub wiki/docs, not yet run against this codebase's version]
- In the app itself: use a rate-limit key that includes both IP and the targeted mutation/email so unrelated tests/users don't collide, and document (in code comment + `KNOWN-ISSUES.md`-style note, or the new `CONCERNS.md`) that the in-memory store is single-instance-only; a shared store (Redis) is future work if the app scales to multiple replicas — do not attempt to build that in this milestone, it's explicitly out of scope per `PROJECT.md`.

**Warning signs:**
A rate-limit test that passes in isolation (`vitest run login.test.js`) but fails when the full suite runs (`vitest run`), or passes/fails depending on test file order.

**Phase to address:**
Rate-limiting phase. The reset helper must be added to `backend/test/helpers.js` in the same task that adds the limiter, and every rate-limit test must call it in `beforeEach`.

---

### Pitfall 4: Rate-limit responses become a new enumeration/timing oracle

**What goes wrong:**
The whole point of the generic `"If the account exists, a password reset token has been generated."` message (already correctly implemented in `requestPasswordReset`, `backend/src/resolvers/user.resolver.js:50`) is to prevent an attacker from distinguishing "account exists" from "account doesn't exist." A naive rate limiter can reintroduce exactly this leak: if the limiter is keyed by email/username and only increments its counter on an existing account (e.g. because the resolver returns early before the limiter middleware runs, or because the limiter is applied inside the resolver after the `User.findOne` lookup), then hitting the same email repeatedly will start returning 429s sooner for real accounts than for fake ones — the attacker enumerates accounts by timing/count-to-429 instead of by response content.

**Why it happens:**
Rate limiting is naturally tempting to key by the *identity being attacked* (email) rather than the *attacker* (IP), because per-account limiting feels more surgical. But per-account keying only makes sense if the counter increments identically regardless of whether the account exists — which requires the limiter to run *before* any DB lookup, at the Express/Apollo-plugin layer, not inside the resolver.

**How to avoid:**
Key the limiter primarily by IP (or IP + coarse bucket), not by email/username, for `login` and `requestPasswordReset`. If email-based limiting is added as a secondary layer, increment the counter unconditionally before the resolver's `User.findOne` call runs (i.e., in middleware/plugin, not resolver body) so existing and non-existing accounts consume the same budget at the same rate. Verify with a test: N attempts against a real email and N attempts against a fake email hit the 429 threshold at the *same* attempt count.

**Warning signs:**
A test (or manual curl loop) where a real account's requests start 429-ing at a different count than a fake account's requests.

**Phase to address:**
Rate-limiting phase — this must be an explicit acceptance criterion, not an afterthought, since it directly undoes the enumeration protection the reset-token fix is trying to add.

---

### Pitfall 5: The mailer fix leaves a code path (or GraphQL field) that still returns the token

**What goes wrong:**
`requestPasswordReset` currently returns `{ message, resetToken }` and the GraphQL schema explicitly types `resetToken: String` as nullable-but-present (`backend/src/schemas/user.schema.js:21-24`). "Drop it from the API" is easy to under-implement: a common half-fix is to stop *populating* `resetToken` in dev (return `null` always) while leaving the field in the schema, or to gate it behind `NODE_ENV !== 'production'` so it still leaks in a misconfigured/staging deployment. Both leave the account-takeover vector reachable — the schema field itself is the attack surface, not just its current value.

**Why it happens:**
Removing a GraphQL schema field feels "breaking" (frontend/query concerns), so it's tempting to just stop populating it and call the resolver-level change sufficient.

**How to avoid:**
Remove `resetToken` from the `PasswordResetPayload` type in `backend/src/schemas/user.schema.js` entirely (schema-level removal, not just resolver-level nulling) so the field is gone from introspection and cannot be requested even if some client still asks for it. The red test should assert the GraphQL response for `requestPasswordReset { message resetToken }` (querying the now-removed field) returns a schema validation error, or that the field is simply absent from `graphql-schema` introspection — not merely that its value is `null`. The mailer must be the only place the raw token is observable (console log in dev via a `sendMail`/`Mailer.send()` call that tests can spy on).

**Warning signs:**
`grep -rn resetToken backend/src` returning any hits in `schemas/` or `resolvers/` after the fix is supposedly done.

**Phase to address:**
Mailer phase. Include a schema-introspection assertion as part of the red step, not just a resolver-response assertion.

---

### Pitfall 6: Mailer tests pass because they mock the mailer itself, never proving the token reaches it

**What goes wrong:**
The natural implementation is a `sendResetEmail(user, token)` function that's easy to `vi.mock()` in tests. A shallow test asserts `sendResetEmail` was called once — but doesn't assert it was called *with the correct token* (matching what got persisted to `user.resetPasswordToken`), or asserts against a stale/hardcoded token value that happens to match by coincidence. This "mocks too much" failure mode makes the suite green while the actual delivery path is unverified — e.g. a bug where the mailer is called with `user.id` instead of the reset token would still show the mock as "called."

**Why it happens:**
Mocking the transport (SMTP/provider) is correct and necessary (you don't want tests sending real email), but it's easy to over-mock and stop asserting on the mock's call arguments, especially under TDD time pressure to get to green.

**How to avoid:**
Assert on the mock's call arguments, not just call count: `expect(mailerSpy).toHaveBeenCalledWith(expect.objectContaining({ to: user.email, token: expect.any(String) }))`, and cross-check that the token passed to the mailer equals `user.resetPasswordToken` after `user.reload()` (the same pattern the existing `resetPassword.test.js` already uses at line 29-31 — reuse it). Keep the "logs to console in dev" mailer implementation as a thin, directly testable function (`export function sendResetEmail(...)`) separate from any future real-provider adapter, so unit tests can import and spy on it without mocking Express/HTTP.

**Warning signs:**
A mailer test with `expect(mailerSpy).toHaveBeenCalled()` and no argument assertion.

**Phase to address:**
Mailer phase.

---

### Pitfall 7: The frontend `ForgotPassword` page still renders `result.resetToken` after the backend stops returning it

**What goes wrong:**
`frontend/src/pages/ForgotPassword.jsx:9,53-67,82-86` queries `requestPasswordReset(email: $email) { message resetToken }` and conditionally renders a monospace token box + a "Continue to reset" button whenever `result.resetToken` is truthy. Once the backend fix removes `resetToken` from the schema (Pitfall 5), this GraphQL query becomes invalid (`Cannot query field "resetToken"`) and the page will error on every submission — a full functional break of the forgot-password UI. **There is no existing frontend test for `ForgotPassword.jsx` or `ResetPassword.jsx`** (confirmed: only `ProtectedRoute`, `AuthContext`, `Login`, `Register` have test files), so CI will stay green while this page is silently broken in the browser — a classic "tests didn't catch it because nothing tested it" gap.
Additionally, the "Continue to reset" button (`ForgotPassword.jsx:82-86`) is only rendered `if (result?.resetToken)` — once the field is gone, that button *disappears entirely*, breaking the only in-app navigation path to `/reset-password` in dev/testing.

**Why it happens:**
The backend and frontend fixes are easy to sequence wrong — fixing the resolver first without a coordinated frontend PR leaves a broken UI with no test to catch it (mailer fix is backend-only in the fix list, but its frontend blast radius is real).

**How to avoid:**
Update the frontend query and UI in the same phase as the mailer backend fix: drop `resetToken` from the `REQUEST_RESET` query string, remove the token-rendering block, and change the success message/flow to something like "Check your email for a reset link" with a static, always-visible link to `/reset-password` (since there's no token to gate it on anymore). Add a new component test for `ForgotPassword.jsx` (there is none today) asserting the page renders `message` only and never attempts to read a token field — this closes the "no coverage" gap the mailer fix would otherwise walk into blind.

**Warning signs:**
Manually loading `/forgot-password` in the browser after the backend change ships and seeing a GraphQL error alert instead of the success message.

**Phase to address:**
Mailer phase — must include a frontend task, not just backend. Do not treat this as "someone else's phase."

---

### Pitfall 8: `passwordChangedAt` timing precision — JWT `iat` is seconds, DB timestamps are milliseconds

**What goes wrong:**
`jsonwebtoken`'s `sign()` embeds `iat` (issued-at) as **whole seconds** since epoch (`Math.floor(Date.now() / 1000)`), while Sequelize `DataTypes.DATE` columns store **millisecond** precision. A naive revocation check — `if (tokenIat < user.passwordChangedAt) reject` — done by comparing `payload.iat` (seconds) directly against `user.passwordChangedAt.getTime()` (milliseconds) is comparing numbers on different scales and will reject essentially every token (since a seconds-value like `1799999999` is always less than a milliseconds-value like `1799999999000`). The precision mismatch can also bite the *other* direction even with correct unit conversion: `resetPassword`/`register` sets `passwordChangedAt` and *then* `signToken()` is called in the same request — if the token's `iat` (truncated down to the second) lands in the same second as `passwordChangedAt` but sub-second *after* it in wall-clock time, a strict `<` vs `<=` comparison choice determines whether the just-issued token is immediately rejected as "stale." This is a classic off-by-one/off-by-precision bug that only shows up under fast test execution (multiple operations completing within the same second) — exactly the conditions of a Vitest integration test.

**Why it happens:**
JWT spec (`iat`) mandates NumericDate (seconds); JS `Date`/Sequelize/MySQL `DATETIME` default to milliseconds. Developers convert once (e.g. `passwordChangedAt.getTime() / 1000`) but forget to floor/round consistently, or use `<` where `<=` (or a small grace-second buffer) is needed for same-second issuance.

**How to avoid:**
1. Always compare in the same unit: `Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat` → reject. Floor (not round) the DB side to match `iat`'s floor-based truncation.
2. Use `<=`-safe logic or explicitly allow same-second tokens: since `resetPassword`/`register` set `passwordChangedAt` and sign the token in the same request handler, either (a) sign the token *after* persisting `passwordChangedAt`, and treat tokens with `iat` equal to the floored `passwordChangedAt` second as valid (`payload.iat >= flooredChangedAt`, not `>`), or (b) set `passwordChangedAt` to `new Date(Date.now() - 1000)` (one second in the past) before signing, guaranteeing the new token's `iat` is always strictly after it. Option (a) is cleaner and avoids a magic offset.
3. Write the red test explicitly around the boundary: reset password, immediately sign in with the new password, assert the returned token is valid against `getUserFromRequest`/`requireAuth` in the *same second* (don't rely on test execution being slow enough to naturally cross a second boundary — that would hide the bug).

**Warning signs:**
Integration tests that pass locally (slower machine, crosses a second boundary naturally) but fail in CI (faster, stays within one second) or vice versa — a classic "works on my machine" timing bug.

**Phase to address:**
`passwordChangedAt`/revocation phase. Include the same-second boundary test as a mandatory red-step case, not an edge case added later.

---

### Pitfall 9: `passwordChangedAt` set on every profile update vs. only on password reset — and interaction with the existing `beforeUpdate` hook

**What goes wrong:**
`backend/src/models/User.js:57-59` already has a `beforeUpdate` hook that re-hashes `passwordHash` whenever `user.changed('passwordHash')` is true. The natural, minimal-diff place to add `passwordChangedAt` is inside that same hook (`if (user.changed('passwordHash')) { user.passwordHash = await bcrypt.hash(...); user.passwordChangedAt = new Date(); }`), which is actually **correct today** because the only two write paths that touch `passwordHash` are `register` (a `create`, not `update` — hits `beforeCreate`) and `resetPassword` (an `update` — hits `beforeUpdate`). The pitfall is *scope creep*: if a future "update profile" resolver is added that calls `user.save()` for name/email changes and happens to also re-save an unchanged `passwordHash` (e.g. a bulk `Object.assign(user, formData); await user.save()` pattern), Sequelize's `changed('passwordHash')` correctly returns `false` for an unchanged value — so this is actually safe *as implemented via `changed()`*. The real risk is a developer who, instead of relying on `changed('passwordHash')`, sets `passwordChangedAt` unconditionally in a generic `beforeUpdate` that fires on *any* save (including a `role` change by an admin, or `resetPasswordToken` clearing) — that would revoke all of a user's sessions on unrelated updates.

**How to avoid:**
Set `passwordChangedAt` **inside the existing `if (user.changed('passwordHash'))` branch only** — never as an unconditional `beforeUpdate` side effect. Do not set it in `register`'s `beforeCreate` hook (a brand-new user has no prior tokens to revoke; setting it there is harmless but unnecessary — the revocation check only matters for tokens issued *before* a change, and nothing was issued before account creation). Add a unit test (extending the existing `backend/src/models/User.test.js` pattern) asserting: (a) `passwordChangedAt` is set when `passwordHash` changes via `beforeUpdate`, (b) `passwordChangedAt` is untouched when only `role` or `name` changes via `beforeUpdate`.

**Phase to address:**
`passwordChangedAt`/revocation phase. This is a model-hook-level unit test, cheap to add, and directly guards the exact fragile-hook pattern `CONCERNS.md` already flags ("Password hashing depends on Sequelize lifecycle hooks").

---

### Pitfall 10: Adding `passwordChangedAt` revocation breaks the existing `login`/`getUserFromRequest`/`auth.test.js` tests if the check isn't additive

**What goes wrong:**
`getUserFromRequest` (`backend/src/utils/auth.js:9-20`) currently does `jwt.verify` → `findByPk(payload.sub)` with no timestamp comparison. `auth.test.js` stubs `models.User.findByPk` to return a plain object (`{ id, role: 'USER' }`) with **no `passwordChangedAt` field at all** (`backend/src/utils/auth.test.js:28`). If the revocation check is implemented as `if (payload.iat < user.passwordChangedAt) return null` without guarding for `user.passwordChangedAt` being `undefined`/`null`, then `undefined` on the right side of `<` produces `NaN` comparisons (always `false` in JS) — which *happens* to not break these particular stub-based tests (comparison silently no-ops), but is fragile and would behave differently against a real Sequelize instance where a freshly-created user's `passwordChangedAt` might legitimately be `null` (never changed). Explicitly handle `passwordChangedAt == null` as "never revoked, always valid."

**How to avoid:**
Guard clause: `if (user.passwordChangedAt && flooredIat < flooredChangedAtSeconds) return null`. Add this as a new `auth.test.js` case using a stub with `passwordChangedAt: null` (must still authenticate) and one with `passwordChangedAt` set to a future-relative-to-iat date (must return `null`).

**Phase to address:**
`passwordChangedAt`/revocation phase.

---

### Pitfall 11: Email verification breaks the register→auto-login flow and its v1.0 tests, and the first-user-ADMIN race isn't automatically fixed by adding verification

**What goes wrong:**
Today, `register` immediately returns `{ token, user }` (`backend/src/resolvers/user.resolver.js:37`) and the frontend `AuthContext.authenticate()` stores that token and sets `user` synchronously (`frontend/src/context/AuthContext.jsx:48-53`), and `Register.jsx` navigates straight to `/dashboard`. Naively "adding email verification" by inserting a check somewhere *after* token issuance (e.g. gating `dashboard`/`me` on `user.isEmailVerified`) still leaves the JWT itself fully valid and usable for anything not explicitly gated — an unverified user can call `login` again, or any future resolver that doesn't check verification, with a working token. This is the "unverified users still getting a usable JWT" failure mode named in the milestone brief: verification-as-an-afterthought doesn't actually close the account-takeover/spam-registration surface, it just adds a UI speed bump.
Separately, the first-user-becomes-ADMIN logic (`userCount === 0 ? 'ADMIN' : 'USER'`, line 34) counts *all* rows in `users`, including unverified ones. If verification is added by inserting an "unverified" placeholder row at registration time and only flipping a flag on verification, the race is **unchanged** — whoever's `register` mutation executes first (verified or not) still claims `userCount === 0` and gets ADMIN. Naive verification does not fix the race unless the ADMIN assignment is explicitly deferred to verification time (i.e., count only *verified* users, or assign role at verification-completion, not at registration).

**Why it happens:**
Verification is conceptually "send an email, wait for a click" — but the codebase's auth model is 100% JWT-stateless with no session/blocklist, so "wait" has no natural enforcement point unless every protected resolver explicitly re-checks verification status, or the token itself withholds full privileges until verified.

**How to avoid:**
1. Decide and document the design explicitly before implementing: either (a) `register` no longer returns a usable `token` at all — it returns `{ message }` only (pending verification), and `login` itself refuses unverified accounts with a clear error until the email-verify mutation runs; or (b) `register` still returns a token, but a claim (`emailVerified: false` in the payload, checked by `requireAuth`/`requireAdmin` for privileged operations) is embedded and every resolver that should be gated explicitly checks it. Option (a) is simpler to reason about and closes the JWT-usability gap completely — recommended given "unverified users still getting a usable JWT" is called out as the specific pitfall to avoid.
2. Fix the ADMIN race by computing `userCount` (or equivalently, `ADMIN` role assignment) at the point verification completes, not at registration — e.g. count only verified users, or assign `role: 'USER'` unconditionally at registration and promote the first *verified* user to `ADMIN` inside the verify-email resolver (still needs its own race guard — e.g. a transaction/`SELECT ... FOR UPDATE`-style check, or accept "first to verify" as the intended tie-break and test it explicitly).
3. **This breaks the following existing v1.0 tests and requires them to be flipped as the TDD red step** (see Pitfall 13 below for the full enumerated list) — most notably `register.test.js`'s `jwt.verify(data.register.token, ...)` assertion, and `Register.test.jsx`'s `navigateSpy toHaveBeenCalledWith('/dashboard')` assertion (the frontend mock will need to change to reflect option (a) or (b)'s actual response shape, and the component needs a "check your email" branch instead of immediate navigation).

**Warning signs:**
A "verified" flag exists in the schema but no resolver (including `login`) ever reads it — `grep -rn emailVerified backend/src/resolvers` returning nothing outside the `register` mutation itself is the tell.

**Phase to address:**
Email-verification phase — should be sequenced *after* the mailer phase (it reuses the same `sendResetEmail`-style mailer abstraction for verification emails) and is likely the most invasive fix; plan it last or near-last among the 7, since it touches the register/login contract that most other tests depend on.

---

### Pitfall 12: JWT-secret fail-fast crashes the test/dev environment if not scoped tightly to `NODE_ENV === 'production'`

**What goes wrong:**
`backend/src/config/env.js:21` currently falls back to `'change-me'` when `JWT_SECRET` is unset. `backend/vitest.config.js:6-7` explicitly forces `process.env.ENV_FILE = env/test.env` and `process.env.NODE_ENV = 'test'` before any test runs, and `backend/test/guard.js` (`assertTestDatabase`) already relies on `env.nodeEnv === 'test'` being reliably set this way. If `test.env` does not set a strong `JWT_SECRET` (plausible — dev/test secrets are conventionally weak/shared on purpose) and the fail-fast check is written as `if (jwtSecret === 'change-me' || !jwtSecret) process.exit(1)` **without** the `NODE_ENV === 'production'` guard, every `vitest run` invocation crashes at import time (since `env.js` runs its checks at module load, and `models/index.js`/`server.js`/every resolver test transitively imports it) — the entire CI pipeline goes red for a reason that has nothing to do with the actual fix being tested. This is the single easiest way to accidentally break *all* 39+ existing backend tests in one commit.

**Why it happens:**
"Fail fast on insecure secrets" is correct security advice in the abstract, but applied uniformly across all environments it conflicts with the deliberately-weak, deliberately-shared secrets used in `env/test.env` and local dev, both of which are legitimate and shouldn't require a "real" secret.

**How to avoid:**
Gate the fail-fast exclusively on `env.nodeEnv === 'production'` (matching the exact language already used in `PROJECT.md`: "refuse to boot in production"). Do **not** check `NODE_ENV !== 'development'` or invert the condition — it must be an explicit allowlist-of-one (`=== 'production'`), so `test`, `development`, and any other value all pass through unchanged. Write the red test as two cases: `NODE_ENV=production` + `JWT_SECRET=change-me` (or unset) → throws/exits; `NODE_ENV=test` + same weak secret → does not throw. Since `env.js` currently performs its config assembly at module-evaluation time (top-level code, not inside an exported function — see `backend/src/config/env.js:16-31`), the fail-fast logic needs to be tested by re-importing the module with different `process.env` state (via `vi.resetModules()` + dynamic `import()`) or refactored into an exported, independently-callable `assertProductionSecrets()` function (mirroring the existing `assertTestDatabase()` pattern in `backend/test/guard.js`) so it can be unit-tested without mutating global `process.env` before every other test file's imports run.

**Warning signs:**
Any test run failure whose stack trace points at `config/env.js` import, affecting unrelated test files (a sign the crash happens at module load, not inside a specific test).

**Phase to address:**
JWT-secret-fail-fast phase — should be one of the *first* fixes implemented (it's structurally simple and low-risk), but its test must be written and run against the full existing suite immediately to prove zero collateral breakage before moving on.

---

### Pitfall 13: `sequelize.sync()` (no options) will NOT add new columns to the existing `users` table — dev DB silently breaks while tests stay green

**What goes wrong:**
`backend/src/models/index.js:10-13` calls plain `sequelize.sync()` with no arguments. Per Sequelize's own documented behavior, **`sync()` with no options creates a table only if it doesn't already exist, and does nothing if it already exists — it never adds missing columns to an existing table.** [HIGH confidence, verified against Sequelize v6 docs] This milestone adds at least three new `User` model attributes: `passwordChangedAt`, and (depending on email-verification design) `emailVerified`/`isEmailVerified` + a verification token/expiry pair. On a **fresh** test run this is invisible, because `backend/test/globalSetup.js:11` explicitly calls `sequelize.sync({ force: true, match: /_test$/ })` — `force: true` drops and recreates every table on every test run, so the test DB always has the new columns and every integration test passes. But any **existing, already-bootstrapped dev database** (a developer's local MySQL with a pre-existing `users` table from before this milestone, or — more importantly — the `remote`/production-style deployment referenced in `docker-compose.yml`/`README.md`) will NOT get the new columns from a plain `sequelize.sync()` boot. The app will then throw `Unknown column 'passwordChangedAt' in 'field list'` (or silently read `undefined` depending on the exact Sequelize/MySQL error path) the moment any resolver reads/writes that field — a runtime crash that **CI cannot catch**, because CI's MySQL service (`.github/workflows/ci.yml:9-18`) is provisioned fresh on every run and never carries pre-existing schema state.

**Why it happens:**
The gap between "test DB is always force-recreated" and "dev/prod DB persists across deploys" is invisible until someone runs the new code against an already-populated database — exactly the scenario CI is structurally incapable of reproducing.

**How to avoid:**
This milestone's constraints explicitly defer "Sequelize migrations vs `sync()`" to a separate infra-hardening milestone (`PROJECT.md` Out of Scope) — so a full migration system is not the fix here. The pragmatic, in-scope options are:
1. Switch `initializeDatabase()` to `sequelize.sync({ alter: true })` for this milestone only, scoped carefully — `alter: true` *does* add missing columns to existing tables by diffing model vs. DB state. This is explicitly flagged by Sequelize's own docs as risky for production (potential data loss on more complex diffs), but for this specific, additive-only change (new nullable columns, no renames/drops) the risk is low. Document this as a conscious, scoped tradeoff, not a silent behavior change.
2. Alternative/safer: keep plain `sync()` but make all new columns explicitly `allowNull: true` with no `defaultValue` requiring backfill, and have each developer/operator run a one-time manual `ALTER TABLE` (documented in a migration note) — but this is easy to forget and doesn't self-heal.
3. Whichever is chosen, add an explicit **non-test verification step**: after implementing the schema changes, manually boot the backend against a pre-existing (non-force-synced) local dev DB — not just `npm test` — and confirm no `Unknown column` errors, before considering the phase done. This must be called out in the phase's acceptance criteria since automated tests structurally cannot catch it.

**Warning signs:**
`npm test` (backend) is fully green, but `npm run dev` against a previously-running local MySQL instance throws SQL errors the first time a resolver touches a new column.

**Phase to address:**
Whichever phase first adds a new `User` model column — likely both the `passwordChangedAt`/revocation phase and the email-verification phase (each adds columns). Flag this explicitly in both phases' plans; do not assume "tests pass" means "schema change is safe."

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Rate-limit with in-memory `MemoryStore` instead of Redis/shared store | Zero new infra dependency, fast to ship | Silently weaker limiting once >1 backend replica exists; resets on every restart/deploy | Acceptable for this milestone (single-instance deployment today per `docker-compose.yml`) — document the limitation, revisit if horizontal scaling is ever added |
| `sequelize.sync({ alter: true })` instead of real migrations to add the new columns | Unblocks this milestone without a migration-tooling side-project | Sequelize's own docs warn `alter: true` can be destructive on more complex schema diffs; no rollback path | Acceptable *only* for simple, additive, nullable-column changes like this milestone's; must not be reused for future column renames/type changes — a real migration tool is explicitly deferred to the infra-hardening milestone |
| Console-log mailer instead of a real provider | No email-provider account/credentials needed, fully local/dev-testable | Reset/verification emails are not actually delivered until a provider is wired in prod | Explicitly acceptable per `PROJECT.md` Out of Scope — provider integration is a separate future concern; must remain a swappable interface, not hardcoded console.log calls scattered through resolvers |
| Password-strength check as a simple length/regex rule in the resolver | Fast, no new dependency (e.g. `zxcvbn`) | Weaker strength signal than a real strength-estimator library | Acceptable for a portfolio-scale app; note as a possible future upgrade, not a blocker |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| `express-rate-limit` on a single GraphQL route | Keying/limiting by path only, throttling all operations uniformly | Inspect the parsed operation (Apollo plugin `didResolveOperation`, or body-parsed `operationName`) and only apply limits to `login`/`register`/`requestPasswordReset` |
| `express-rate-limit` behind a reverse proxy (README documents an Nginx/Caddy front-end for prod) | Keying by `req.ip` without `app.set('trust proxy', ...)` — every request appears to come from the proxy's IP, either rate-limiting all users together or (with `trust proxy: true` misconfigured) trusting a spoofable `X-Forwarded-For` header | Set `trust proxy` explicitly to the correct hop count/CIDR for the deployment topology, and test that distinct client IPs get distinct buckets; do not leave it at Express's default (`false`, meaning `req.ip` is always the proxy) or blindly `true` (spoofable) |
| Apollo Server 4 `context` function (`backend/src/server.js:34-37`) | Adding rate-limit/verification checks inside resolvers only, missing the fact that `context` already runs `getUserFromRequest` on every request regardless of operation | If revocation (`passwordChangedAt`) should reject a token immediately, check it inside `getUserFromRequest` itself (so `context.user` is `null` for a revoked token everywhere, consistent with how expired/tampered tokens already behave in `backend/src/utils/auth.js:14-19`) rather than duplicating the check per-resolver |
| Sequelize model hooks (`beforeCreate`/`beforeUpdate`) | Adding `passwordChangedAt` logic as a new unconditional hook instead of extending the existing `changed('passwordHash')`-guarded branch | Extend the existing hook body; never add a second, differently-scoped hook that could fire independently and diverge from the hashing hook's guard condition |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Rate-limit store grows unbounded if not TTL'd (unlikely default, but custom stores can miss this) | Slow memory growth over long-running process uptime | Use `express-rate-limit`'s default `MemoryStore` (auto-expires) or confirm any custom store implements TTL/expiry | Only relevant at high sustained traffic + long uptime; not a v1.1-scale concern but worth a one-line check when choosing the store |
| bcrypt cost factor (12, unchanged by this milestone) combined with new server-side password-strength checks running *before* hashing | None expected — strength check should be cheap synchronous string validation | Ensure password-strength validation happens before the (expensive) bcrypt hash, so invalid-password requests fail fast without paying the ~12-round bcrypt cost | Not a real risk at this scale; noted for completeness since `bcryptjs` is already flagged in `CONCERNS.md` as slower than native bcrypt |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rate-limit counter incremented after DB lookup (inside resolver) rather than before (in middleware/plugin) | Re-introduces the exact enumeration oracle the reset-token fix is closing (Pitfall 4) | Increment unconditionally, before any account-existence check, for `login` and `requestPasswordReset` |
| CORS fix changes only the thrown `Error` message but leaves `console.error(origin)` or similar logged where a client can observe it (e.g. echoed in a different error path) | Origin leak just moves rather than closes | Confirm the *only* place the raw origin is written is a server-side log (not sent in any response body/header/GraphQL error) — write a red test asserting the CORS-rejection response body/error message does not contain the origin string, using whatever HTTP-level harness Pitfall 1 introduces |
| Email verification implemented as a client-side-only gate (e.g. hiding the dashboard link until verified) | Server still issues a fully privileged token; determined attacker just calls the GraphQL API directly, bypassing the UI gate entirely | Enforce verification server-side (in `login` and/or `requireAuth`), never rely on frontend UI to withhold access |
| `passwordChangedAt` compared with plain `<` instead of an inclusive boundary, or without unit conversion | Legitimate just-issued tokens rejected (denial of service against the user who just reset their own password) or, inverted, old tokens *not* rejected if the conversion bug goes the other way | See Pitfall 8 — explicit floor-to-seconds conversion, explicit boundary test |

## "Looks Done But Isn't" Checklist

- [ ] **Reset-token removal:** Schema-level (`user.schema.js`) removal verified via introspection/query-validation test, not just resolver-response nulling — verify with `grep -rn resetToken backend/src frontend/src`
- [ ] **Rate limiting:** Verify the enumeration-oracle test (Pitfall 4) passes — same 429-threshold for real vs. fake emails — not just "a limit exists"
- [ ] **Rate limiting tests:** Verify the full suite (`npm test` at root, not just the new rate-limit test file) is still green and order-independent — run `vitest run` twice in a row and diff results
- [ ] **`passwordChangedAt`:** Verify the same-second boundary case (reset password → immediately log in with new password, same second) explicitly, not just "eventually valid"
- [ ] **JWT fail-fast:** Verify by running the *entire* existing test suite after the change lands — a passing new fail-fast test alone doesn't prove zero collateral damage to the other 39+ tests
- [ ] **Email verification:** Verify an unverified user's token is rejected by an actual protected resolver call (e.g. `dashboard`), not just that a `register`-time flag exists in the DB
- [ ] **Schema migrations:** Verify by booting the backend against a **non-force-synced**, pre-existing local dev DB (not just `npm test`) — this is the only way to catch the `sync()`-doesn't-alter-existing-tables gap (Pitfall 13)
- [ ] **ForgotPassword frontend:** Verify by manually loading `/forgot-password` in a browser and submitting — there is no automated test today, so this must be a manual check until a test is added (Pitfall 7)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| JWT fail-fast crashes all tests (Pitfall 12) | LOW | Add the `NODE_ENV === 'production'` guard, re-run full suite; the failure mode is obvious and immediate (every test file errors at import) so it's caught before merge, not in production |
| `sync()` doesn't add columns to existing dev DB (Pitfall 13) | MEDIUM | Manually `ALTER TABLE users ADD COLUMN ...` on the affected DB, or switch to `sync({ alter: true })` and re-run; costlier if discovered only after a real deployment (requires a manual DB migration against live data) |
| Enumeration oracle reintroduced via rate-limit counting (Pitfall 4) | LOW–MEDIUM | Move the counter-increment point earlier (before DB lookup); re-verify with the same-threshold test; low cost if caught in review/TDD red step, higher if it ships and is later found in a security audit |
| ForgotPassword frontend breaks silently (Pitfall 7) | LOW | Add the missing frontend test + fix the query/UI in the same PR as the backend mailer change; cheap if caught immediately, embarrassing (broken feature in a portfolio piece) if it ships unnoticed |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| 1: `executeOperation` helper can't test CORS/rate-limit | First task of Rate-Limiting phase (harness extraction) | New supertest-based (or equivalent) HTTP-level test file exists and is used by both the CORS and rate-limit test suites |
| 2: Path-based limiting throttles everything | Rate-Limiting phase | Test: burst of `me`/`dashboard` queries unaffected while `login` is throttled |
| 3: In-memory store state bleed across tests | Rate-Limiting phase | Full suite run twice consecutively produces identical pass/fail results; `resetRateLimits()` helper exists and is called in `beforeEach` |
| 4: Enumeration oracle via rate-limit counting | Rate-Limiting phase | Test: identical 429-threshold for real vs. fake email/account |
| 5: Stale `resetToken` field/path | Mailer phase | Schema-introspection or query-validation test confirms `resetToken` is unqueryable |
| 6: Mailer test over-mocking | Mailer phase | Mailer spy assertion checks call *arguments* (token match with `user.resetPasswordToken`), not just call count |
| 7: Frontend `ForgotPassword` still expects token | Mailer phase (frontend task) | New `ForgotPassword.test.jsx` added; manual browser check of `/forgot-password` |
| 8: `iat` seconds vs. DB ms precision | `passwordChangedAt`/Revocation phase | Same-second boundary test: reset → immediate re-login succeeds |
| 9: `passwordChangedAt` scope creep beyond password changes | `passwordChangedAt`/Revocation phase | Model hook test: role/name-only update leaves `passwordChangedAt` untouched |
| 10: Revocation check breaks on missing/null `passwordChangedAt` | `passwordChangedAt`/Revocation phase | `auth.test.js` case with `passwordChangedAt: null` stub still authenticates |
| 11: Email verification breaks register→auto-login + ADMIN race | Email-Verification phase (sequence last/near-last) | Enumerated v1.0 test flips (see below) all pass under new behavior; unverified user's token rejected by `dashboard` |
| 12: JWT fail-fast crashes test/dev | JWT-Secret-Fail-Fast phase (do first — low risk, easy to verify) | Full existing suite (`npm test`, root) green after the change; explicit `NODE_ENV=test` + weak-secret case does not throw |
| 13: `sync()` doesn't alter existing tables | Both `passwordChangedAt` and Email-Verification phases (each adds columns) | Manual boot against non-force-synced dev DB, zero `Unknown column` errors |

## Meta-Pitfall: v1.0 tests that assert the OLD (insecure) behavior and must be flipped as the TDD red step

These are concrete, file-and-line-level. Each one currently passes against the insecure v1.0 behavior; under strict TDD, the fix's red step is "this test now fails because it asserts the old behavior," and the green step rewrites the assertion to the new, secure behavior.

| Test | Current assertion (insecure/old) | Must become (secure/new) | Driving fix |
|------|-------------------------------------|------------------------------|-------------|
| `backend/src/resolvers/resetPassword.test.js` — `'returns the generic message and persists a reset token + expiry for an existing email'` | Queries `requestPasswordReset(email: $email) { message resetToken }` and implicitly allows a `resetToken` field to exist in the response shape (even though this specific test doesn't assert its value, the query itself requests the now-removed field) | Query must drop `resetToken` from the GraphQL selection entirely (field no longer exists in schema); assertions shift to confirming `user.resetPasswordToken` is persisted server-side only, and a mailer spy was called with the token | Mailer fix |
| `backend/src/resolvers/resetPassword.test.js` — `'returns the identical generic message and a null resetToken for a non-existing email'` | Explicitly asserts `expect(response.data.requestPasswordReset.resetToken).toBeNull()` — this whole assertion is about a field that will no longer exist | Remove the `resetToken` assertion/selection; assert only `message`; add a new assertion that the mailer was *not* called for a non-existing email | Mailer fix |
| `KNOWN-ISSUES.md` — "Reset-token exposure in `requestPasswordReset` response" entry | Documents the bug as accepted, deferred behavior | Must be removed/closed out once the fix ships (it's documentation, not a test, but it's the paper trail that needs to flip alongside the test) | Mailer fix |
| `backend/src/resolvers/register.test.js` — `'makes the first registrant ADMIN and persists a hashed password'` | `jwt.verify(data.register.token, env.jwtSecret)` — asserts `register` returns an immediately-usable, fully-privileged JWT with no verification gate | If design option (a) from Pitfall 11 is chosen: assert `register` returns no token (or a token that `login`/`dashboard` will reject until verified); if option (b): assert the token carries `emailVerified: false` and privileged operations reject it | Email-verification fix |
| `backend/src/resolvers/register.test.js` — `'makes subsequent registrants USER'` | Registers a second user and immediately checks `data.register.user.role === 'USER'` assuming instant, unconditional account creation | Should still pass largely unchanged for the *role* assertion, but the surrounding registration flow assertions (token presence/usability) need the same update as above | Email-verification fix |
| `frontend/src/pages/Register.test.jsx` — `'navigates to /dashboard on successful registration'` | Mocks `graphqlRequest` to resolve `{ register: { token, user } }` and asserts `navigateSpy` is called with `/dashboard` immediately | Must mock the new response shape (no token, or a "pending verification" response) and assert the component shows a "check your email" state instead of navigating to `/dashboard` | Email-verification fix |
| `frontend/src/context/AuthContext.jsx`'s `register()`/`authenticate()` (not directly unit-tested today, but `AuthContext.test.jsx` tests `login()` via the same `authenticate()` function) | `authenticate()` unconditionally does `localStorage.setItem('authToken', payload.token); setUser(payload.user)` for both login and register responses | If `register` no longer returns a token, `authenticate()` needs a register-specific branch that does *not* immediately log the user in — `AuthContext.test.jsx` doesn't cover `register()` today, so a **new** test must be added here (not strictly a "flip," but a coverage gap directly caused by this fix) | Email-verification fix |
| No existing test — `backend/src/config/env.js` has no test file at all today | N/A — untested | New test(s) needed asserting fail-fast behavior in `production` and pass-through in `test`/`development` | JWT-secret-fail-fast fix |
| No existing test for CORS (`backend/src/server.js:17-23`) | N/A — untested (confirmed via repo-wide grep, no CORS test exists) | New HTTP-level test needed (see Pitfall 1) asserting the rejected-origin error message no longer contains the raw origin | CORS fix |
| No existing test for `passwordChangedAt`/revocation (field doesn't exist yet) | N/A — untested | New tests in `auth.test.js` (revocation logic) and `User.test.js` (hook sets the field) — see Pitfalls 8–10 | `passwordChangedAt` fix |
| No existing test for password strength (`register.test.js`, `resetPassword.test.js` only use the fixed valid password `'Password123!'`) | Existing tests never exercise a weak password, so they won't break — but there's no test proving weak passwords are currently *accepted*, which would have been the natural "red" baseline | Add new tests asserting weak passwords are now rejected in `register` and `resetPassword`; existing tests are unaffected since `'Password123!'` already satisfies any reasonable strength bar | Password-strength fix |

Two additional observations that inform the "what to flip" list:
- `backend/src/resolvers/register.test.js`'s malformed-email test (`'rejects a malformed email via the isEmail model validator'`) and all `login.test.js`/`dashboard.test.js` tests use `createTestUser()` from `backend/test/helpers.js`, which sets `passwordHash: 'Password123!'` directly (bypassing `register`'s resolver-level validation entirely, since it goes straight to `models.User.create`). These tests are **not** affected by the password-strength fix (they don't go through the `register` resolver) and do not need flipping — worth confirming explicitly during planning so nobody wastes time "fixing" tests that don't touch the changed code path.
- Every backend integration test file does `beforeEach(resetTables)` which only truncates `models.User` (`backend/test/helpers.js:16-18`) — if any new fix introduces a second table (e.g. a separate `EmailVerificationTokens` table rather than columns on `User`), `resetTables` must be extended to truncate it too, or state will bleed across tests in exactly the way Pitfall 3 describes for the rate limiter.

## Sources

- Direct codebase reads (HIGH confidence, this repo): `backend/src/resolvers/user.resolver.js`, `backend/src/models/User.js`, `backend/src/config/env.js`, `backend/src/server.js`, `backend/src/utils/auth.js`, `backend/src/schemas/user.schema.js`, `backend/src/models/index.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/vitest.config.js`, `backend/src/resolvers/{login,register,resetPassword,dashboard}.test.js`, `backend/src/utils/auth.test.js`, `backend/src/models/User.test.js`, `backend/test/guard.test.js`, `frontend/src/pages/ForgotPassword.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/context/AuthContext.test.jsx`, `frontend/src/pages/Register.test.jsx`, `.github/workflows/ci.yml`, `package.json` (root/backend), `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/TESTING.md`, `KNOWN-ISSUES.md`
- [Sequelize v6 Model Synchronization docs](https://sequelize.org/docs/v6/core-concepts/model-basics/#model-synchronization) — confirms plain `sync()` does not alter existing tables; `alter: true` does but is documented as risky for production (HIGH confidence, official docs)
- [express-rate-limit "Creating Your Own Store" wiki](https://github.com/express-rate-limit/express-rate-limit/wiki/Creating-Your-Own-Store) and [express-rate-limit npm/docs](https://www.npmjs.com/package/express-rate-limit) — confirms `resetKey()`/`resetAll()` store methods exist for test cleanup (MEDIUM confidence — not yet verified against the exact version to be pinned in this milestone)
- General JWT `iat`-precision discussion (community pattern, not this codebase) — [Medium: "Your Password Changed — But Your Old Sessions Didn't"](https://medium.com/@mr.nt09/your-password-changed-but-your-old-sessions-didnt-the-ghost-session-bug-and-how-to-kill-it-0f0f7a8de6dc) (LOW-MEDIUM confidence, single community source, used only to corroborate a pattern already derivable from first principles of the JWT spec + this codebase's actual `signToken`/`jwt.verify` calls)

---
*Pitfalls research for: v1.1 Security Remediation (7 fixes) on the Portfolio Auth App*
*Researched: 2026-07-12*
