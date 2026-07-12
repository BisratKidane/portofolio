# Architecture Research — v1.1 Security Remediation Integration

**Domain:** Integrating 7 security fixes into an existing Express 4 + Apollo Server 4 (expressMiddleware) + Sequelize/MySQL + React GraphQL app
**Researched:** 2026-07-12
**Confidence:** HIGH (Apollo Server 4 plugin lifecycle, rate-limiter-flexible API — verified against current docs/README); MEDIUM (specific design choices below are opinionated recommendations, not the only valid architecture)

## Existing Architecture (unchanged, for reference)

```
React SPA ──axios POST /graphql──▶ Express ──▶ expressMiddleware(apollo) ──▶ Apollo Server 4
                                     │                                          │
                                cors() middleware                     context: { models, user }
                                                                                │
                                                                     resolvers (user.resolver.js)
                                                                                │
                                                                      Sequelize models ──▶ MySQL
```

Single `POST /graphql` endpoint. Apollo `context()` runs `getUserFromRequest(req, models)` per request (JWT verify + `findByPk`). Resolvers call `requireAuth`/`requireAdmin` manually. `backend/test/helpers.js` bypasses HTTP entirely: it builds an `ApolloServer` instance directly and calls `server.executeOperation({ query, variables }, { contextValue })`. This matters a lot for every fix below — **anything implemented as Express middleware (before `expressMiddleware`) is invisible to `executeOperation()`-based tests; anything implemented as an Apollo plugin or inside `context()`/resolvers is not.**

## Fix-by-Fix Integration

### 1. Rate limiting on `/graphql` (login, register, requestPasswordReset)

**Where it lives:** An **Apollo Server plugin**, not Express middleware (e.g. `express-rate-limit`). Reasoning:

- There is exactly one HTTP route (`/graphql`); Express-level middleware only sees "a POST arrived," not which GraphQL operation it carries. Distinguishing `login` from `register` from `me` in Express middleware means re-parsing `req.body.query`/`operationName` yourself — duplicate work Apollo already does.
- Apollo Server's request pipeline runs identically whether entered via `expressMiddleware` (HTTP) or `server.executeOperation()` (in-process, used by `backend/test/helpers.js`). A plugin hook fires in both cases; Express middleware only fires for the HTTP path. Since the milestone's TDD strategy is built entirely on the in-process `graphql()` helper, **rate limiting must be a plugin to be testable at all** with the existing test harness — Express middleware would require a parallel supertest-based HTTP test just for this one fix, which is inconsistent with how everything else is tested.
- The `didResolveOperation` lifecycle hook is the right one: it fires after Apollo has parsed and validated the operation, so `requestContext.operationName` and `requestContext.contextValue` are both available, and it fires *before* resolver execution — throwing a `GraphQLError` here aborts the request before any resolver runs, without needing per-resolver guard calls (avoids replicating the "forgot to call requireAuth" anti-pattern already flagged in `.planning/codebase/ARCHITECTURE.md`).

**Keying:** `${clientIp}:${operationName}`, e.g. `1.2.3.4:login`. `clientIp` is **not** derived inside the plugin — it must arrive via `contextValue`, because the plugin has no access to `req` in the in-process test path. Concretely:
- `backend/src/server.js`'s `context()` gains a `clientIp: req.ip` field (Express already provides `req.ip`; note the existing README calls for a reverse proxy in prod, so `app.set('trust proxy', 1)` is a small companion fix worth doing alongside this — flag for roadmap, not a new numbered fix).
- `backend/test/helpers.js`'s `graphql()` helper gains an optional 4th/options argument, e.g. `graphql(query, variables, user, { clientIp })`, merged into `contextValue`. Default it to a stable value (e.g. `'127.0.0.1'`) so existing/unrelated tests are unaffected; dedicated rate-limit tests pass a unique synthetic IP per test (or per `describe` block) to avoid bucket collisions with each other and with the shared Apollo Server singleton in `helpers.js` (that server instance is created once for the whole Vitest run, so limiter state persists across test files unless explicitly isolated/reset).

**Store implementation:** Recommend a small hand-rolled in-memory fixed-window counter (`Map<key, { count, resetAt }>`) rather than pulling in `express-rate-limit` (which is Express-request-shaped and doesn't fit a plugin hook) or a new heavyweight dependency. This codebase already leans lean-dependency (no rate-limiting lib today); a ~30-line module is trivial to reason about, and — critically — you control its testing surface directly: export `resetRateLimits()` for test teardown and a `configure(overrides)` for dedicated rate-limit tests to use tight thresholds without affecting the production config. `rate-limiter-flexible`'s `RateLimiterMemory` (`consume(key, points)`, verified current API) is a solid alternative if a more correct sliding-window/points algorithm is wanted later — mention as a fallback, not the primary recommendation, since the hand-rolled version keeps the dependency surface unchanged and the reset semantics simpler.

**Cross-test isolation is the sharp edge.** Because `helpers.js` builds one `ApolloServer` (and therefore one rate-limit plugin instance) for the entire test run, and because unrelated resolver tests (login/register happy-path tests) will otherwise share the default `'127.0.0.1'` key, the limiter module must export a reset hook that a shared test setup calls between test files (e.g. `resetRateLimits()` alongside the existing `resetTables()` in each file's `beforeEach`), or dedicated rate-limit tests must use one-off synthetic IPs. Recommend both: reset in shared setup AND unique IPs in the dedicated rate-limit test file, so a forgotten reset doesn't silently make unrelated tests flaky.

**New files:**
- `backend/src/plugins/rateLimitPlugin.js` — limiter registry (per-operation config: `{ login: {...}, register: {...}, requestPasswordReset: {...} }`), the in-memory store, `resetRateLimits()`, and the Apollo plugin object (`{ async requestDidStart() { return { async didResolveOperation(ctx) { ... } } } }`).
- `backend/src/plugins/rateLimitPlugin.test.js` — pure unit tests (no DB, no GraphQL — call the exported consume/limit function directly).

**Modified files:**
- `backend/src/server.js` — register plugin: `new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] })`; add `clientIp: req.ip` to `context()`.
- `backend/test/helpers.js` — `graphql()` signature extended with `clientIp`/options; possibly a `resetRateLimits()` re-export for test files to call in `beforeEach`.
- `backend/src/resolvers/user.resolver.test.js` (existing, per PROJECT.md v1.0 validation) — new rate-limit assertions for login/register/requestPasswordReset.

Build this **after** the resolvers it wraps (login/register/requestPasswordReset) have reached their final v1.1 shape (password strength, mailer wiring) — see Build Order — so rate-limit tests aren't rewritten when those resolvers change underneath them. Design the operation-config map generically so the later email-verification fix's `resendVerification` mutation can be added as a one-line config entry, not a plugin rewrite.

### 2. Mailer abstraction

**Where it lives:** `backend/src/services/mailer.js` — a **new `services/` directory**. This is a deliberate, small deviation from the current flat `utils/` convention: `utils/auth.js` holds pure/internal helpers (JWT, crypto), whereas the mailer is an external-integration boundary with a swappable transport (console in dev/test, a real provider in prod). Introducing `services/` now also gives the codebase's "aggregator pattern anticipates more domains" note (`.planning/codebase/ARCHITECTURE.md`) a natural home for future non-`user` integrations, without overloading `utils/`.

**Interface:**
```js
// backend/src/services/mailer.js
export async function sendMail({ to, subject, text }) { /* transport switch */ }
export async function sendPasswordResetEmail(user, token) { /* builds subject/body, calls sendMail */ }
export async function sendVerificationEmail(user, token) { /* builds subject/body, calls sendMail */ }
```
Transport selection is env-driven (`env.mailTransport`, default `'console'` outside `production`): the `'console'` transport `console.log`s the recipient/subject/token (this is what "delivered via a pluggable mailer (logs to console in dev...)" in PROJECT.md means concretely — dev/test never needs a real SMTP account). A `'smtp'`/provider branch is a documented no-op stub for now (out of scope per PROJECT.md: "Live email-provider account/credentials").

**Injection strategy — module import + `vi.mock`, not Apollo context.** Two options exist:
- (a) Add `mailer` to the Apollo `context()` object (`{ models, user, mailer }`) so resolvers receive it as a dependency and tests inject a fake via `contextValue`.
- (b) Resolvers `import { sendPasswordResetEmail } from '../services/mailer.js'` directly (matching how `signToken`/`createResetToken` are already imported from `utils/auth.js` into `user.resolver.js`), and tests use Vitest's `vi.mock('../services/mailer.js')` to intercept calls and assert `expect(sendPasswordResetEmail).toHaveBeenCalledWith(...)`.

**Recommend (b).** It requires zero changes to the `context()` shape, zero changes to `backend/test/helpers.js`'s `graphql()` signature, and matches the existing "resolvers import utils directly" convention exactly — the least invasive option, and idiomatic Vitest (`vi.mock` + `vi.mocked()`) is the standard way this codebase's chosen test stack asserts "a side effect happened" without a real transport. Context-injection (a) is worth revisiting only if the app later needs per-request transport swapping (e.g. multi-tenant), which is out of scope here.

**New files:**
- `backend/src/services/mailer.js`
- `backend/src/services/mailer.test.js` (unit: console transport logs correctly; `sendPasswordResetEmail`/`sendVerificationEmail` build correct subject/body and call `sendMail`)

**Modified files:**
- `backend/src/config/env.js` — add `mailTransport` (or similar) config field.
- `backend/src/resolvers/user.resolver.js` — `requestPasswordReset` and (later) `verifyEmail`/registration flow import and call the mailer instead of returning tokens.

### 3. `passwordChangedAt` (token/session revocation)

**Model column:** `backend/src/models/User.js` gains `passwordChangedAt: { type: DataTypes.DATE, allowNull: true }`. Set it in **both** `beforeCreate` and `beforeUpdate` hooks whenever `passwordHash` changes — i.e. add `user.passwordChangedAt = new Date()` next to the existing `bcrypt.hash(...)` calls in those hooks (same hook, same "changed('passwordHash')" guard already present for `beforeUpdate`). Setting it at creation too (not leaving it `null` for brand-new users) avoids null-handling branches at check time.

**Where the check runs:** `getUserFromRequest` in `backend/src/utils/auth.js` — the single existing choke point every authenticated request already passes through. After `jwt.verify` succeeds and the user row is loaded via `findByPk`, compare the JWT's `iat` claim (seconds since epoch, added automatically by `jsonwebtoken` — no signing changes needed) against `user.passwordChangedAt`:

```js
if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
  return null; // token predates the last password change — treat as unauthenticated
}
```

This follows the existing convention exactly: JWT verification failures are already swallowed and normalized to `null` in this function (not thrown), so a stale-password token degrading to "not logged in" is consistent with how expired/invalid tokens already behave — no new error-handling pattern introduced. `requireAuth`/`requireAdmin` need no changes; they already reject `null` users.

**Modified files:**
- `backend/src/models/User.js` — new column, hook updates.
- `backend/src/utils/auth.js` — `getUserFromRequest` iat comparison.
- `backend/src/resolvers/user.resolver.js` — no change needed (resetPassword already goes through the model's `save()`, which triggers the hook).
- `backend/src/models/User.test.js`, `backend/src/utils/auth.test.js` (existing) — new assertions.
- `backend/test/helpers.js` — `createTestUser` may want an explicit `passwordChangedAt` override for tests that need to simulate a stale token.

### 4. Email verification

**New columns** on `backend/src/models/User.js`: `isVerified` (`BOOLEAN`, `allowNull: false`, `defaultValue: false`), `verificationToken` (`STRING`, nullable), `verificationTokenExpiresAt` (`DATE`, nullable) — same shape as the existing `resetPasswordToken`/`resetPasswordExpiresAt` pair, so the token-generation helpers in `utils/auth.js` (`createResetToken`, a generalized expiry helper) can be reused rather than duplicated.

**New mutations** in `backend/src/resolvers/user.resolver.js` + `backend/src/schemas/user.schema.js`: `verifyEmail(token: String!): Boolean!` and `resendVerification(email: String!): MessagePayload!` (see schema note below). Both follow the existing `requestPasswordReset`/`resetPassword` resolver shape (find by token/email, validate expiry, mutate, save).

**Composing with first-user-ADMIN (the actual race fix):** Recommend moving the ADMIN-assignment decision from `register` to `verifyEmail`, not just gating login on `isVerified`. Today, `register` decides ADMIN based on `models.User.count()` at *registration* time — i.e. whoever calls `register` first wins, regardless of whether they ever prove ownership of that email. That's the literal "land-grab." Gating only `login`/`requireAuth` on `isVerified` does **not** close this race — an attacker can still register first (grabbing the row that will become ADMIN once verified) and then race to verify before the legitimate operator does.

The architecturally correct fix: `register` always creates the row as `role: 'USER'`; the ADMIN decision moves into `verifyEmail`:
```js
// inside verifyEmail, after validating the token
if (!user.isVerified) {
  const verifiedAdminExists = await models.User.count({ where: { isVerified: true, role: 'ADMIN' } });
  user.role = verifiedAdminExists === 0 ? 'ADMIN' : 'USER';
  user.isVerified = true;
  // clear verificationToken/verificationTokenExpiresAt
  await user.save();
}
```
This makes "first to *verify*" (proving real email ownership), not "first to *register*", the actual admin-grant condition — this is the concrete mechanism PROJECT.md's "closing the first-user-becomes-ADMIN land-grab race" implies, but it isn't fully specified there; flag this as a design decision for roadmap sign-off, not a settled fact.

**Login gate:** `login` resolver, after password validation succeeds and before `signToken`, add `if (!user.isVerified) throw new Error('Please verify your email before logging in.')` — gives a clear, resolver-specific message. Additionally (defense in depth, DRY with the existing single-choke-point pattern used for `passwordChangedAt`), add the same check inside `requireAuth` in `utils/auth.js`, so every other protected resolver (`dashboard`, `users`, `logout`) is covered without per-resolver edits — consistent with strengthening `requireAuth` rather than scattering ad hoc checks (the existing anti-pattern already flagged in `.planning/codebase/ARCHITECTURE.md`).

**`register`'s return value — a decision to flag for roadmap sizing, not just code:** Today `register` returns `AuthPayload!` (`{ token, user }`) and `AuthContext.jsx` auto-logs the user in immediately. If `login`/`requireAuth` now reject unverified users, an auto-issued token from `register` would 401 on the very next protected call — a confusing half-authenticated state. Recommend changing `register`'s return type to a new `RegisterPayload { message: String! }` (no token), and updating `AuthContext.jsx` so `register()` no longer auto-authenticates — the UI instead shows a "check your email to verify" message and routes to `/login` after verification. This is the more correct UX and avoids storing a token that immediately fails, but it's a bigger frontend change (splitting `AuthContext`'s shared `authenticate()` helper, which today serves both `login` and `register`) than simply adding a `login` gate — size this fix accordingly in the roadmap.

**Frontend routing:** new `frontend/src/pages/VerifyEmail.jsx` (mirrors `ResetPassword.jsx`'s pattern: read a token from the URL, e.g. `/verify-email/:token`, call the `verifyEmail` mutation via `graphqlClient` on mount, show success/failure via `AuthShell`, link to `/login`). Register `/verify-email/:token` in `frontend/src/App.jsx`. `Register.jsx` copy changes from "redirecting to dashboard" to "check your email." Optionally a lightweight resend-verification affordance (could live inline on `Login.jsx`'s error state when login fails specifically due to `isVerified`, rather than a whole new page — smaller frontend footprint, worth flagging as the cheaper option).

**Schema:** Rename/generalize `PasswordResetPayload { message, resetToken }` → drop `resetToken` per fix #1 and reuse the resulting `{ message: String! }` shape as a shared `MessagePayload` type for both `requestPasswordReset` and `resendVerification` (avoids two near-identical types).

**New files:**
- `frontend/src/pages/VerifyEmail.jsx`, `frontend/src/pages/VerifyEmail.test.jsx` (matching existing colocated-test convention, e.g. `Login.test.jsx`).

**Modified files:**
- `backend/src/models/User.js` (columns)
- `backend/src/schemas/user.schema.js` (new mutations, `MessagePayload`, `register` return type)
- `backend/src/resolvers/user.resolver.js` (register role logic, login gate, verifyEmail, resendVerification)
- `backend/src/utils/auth.js` (requireAuth isVerified check)
- `backend/src/services/mailer.js` consumer (sendVerificationEmail called from register)
- `frontend/src/context/AuthContext.jsx` (split register from auto-login; optionally add `verifyEmail`/`resendVerification` helpers)
- `frontend/src/pages/Register.jsx` (post-register copy/flow)
- `frontend/src/App.jsx` (new route)
- `backend/test/helpers.js` — `createTestUser` should default `isVerified: true` (a "normal, already set up" test user for unrelated tests), with dedicated verification tests overriding `createTestUser({ isVerified: false })`. **This is a required, easy-to-miss step**: once `isVerified` defaults to `false` at the model level and `login`/`requireAuth` enforce it, every existing v1.0 integration test that calls `createTestUser()` then attempts to log in or hit a protected resolver will start failing unless the helper's default is updated in lockstep with the resolver change.

### 5. JWT secret fail-fast

**Where:** `backend/src/config/env.js` is the single import that every other backend module transitively depends on (`server.js` imports it first), so a fail-fast throw here halts boot before Apollo/Express/Sequelize ever initialize — no changes needed to `server.js` itself.

**Testability:** Don't inline the check as a bare `if`/`throw` mixed into the `dotenv.config()`-driven module (that module has side effects at import time — hard to unit test cheaply, would require Vitest module-reset gymnastics). Instead extract a **pure, exported function** taking plain arguments:
```js
// new: backend/src/config/assertProductionSecrets.js
export function assertProductionSecrets({ nodeEnv, jwtSecret }) {
  if (nodeEnv === 'production' && (!jwtSecret || jwtSecret === 'change-me')) {
    throw new Error('JWT_SECRET must be set to a non-default value in production.');
  }
}
```
`env.js` calls `assertProductionSecrets({ nodeEnv: env.nodeEnv, jwtSecret: env.jwtSecret })` at the bottom of the file, after building the `env` object. The pure function is trivially unit-tested with plain object arguments (red/green with zero mocking), independent of `dotenv`/`process.env` module state — matches the "each piece TDD'd independently" requirement directly.

**New files:** `backend/src/config/assertProductionSecrets.js`, `backend/src/config/assertProductionSecrets.test.js`.
**Modified files:** `backend/src/config/env.js` (call the assertion at the end of the module).

### 6. CORS rejection message

**Where:** `backend/src/server.js:17-23` — the origin-validator callback currently interpolates the rejected origin directly into the thrown `Error` message (`` `Origin ${origin} is not allowed by CORS.` ``), which `cors` surfaces to the client. Fix: `console.warn`/log the origin server-side, throw/callback a generic message (e.g. `'Origin not allowed by CORS.'`) to the client.

**Testability:** Extract the origin-validator into a small **exported, pure function** so it can be unit tested without booting Express/HTTP at all (mirrors the `assertProductionSecrets` extraction above):
```js
// new: backend/src/config/corsOptions.js
export function corsOriginValidator(origin, callback, { clientOrigins }) {
  if (!origin || clientOrigins.includes(origin)) return callback(null, true);
  console.warn(`CORS rejected origin: ${origin}`);
  return callback(new Error('Origin not allowed by CORS.'));
}
export function buildCorsOptions(env) { return { origin: (o, cb) => corsOriginValidator(o, cb, env), credentials: true }; }
```
Test calls `corsOriginValidator('https://evil.example', spyCallback, { clientOrigins: [...] })` and asserts the callback receives a generic-message `Error` (no `origin` substring), with zero HTTP/Express dependency — a pure function unit test, consistent with how `utils/auth.js` functions are already tested directly.

**New files:** `backend/src/config/corsOptions.js`, `backend/src/config/corsOptions.test.js`.
**Modified files:** `backend/src/server.js` (`app.use(cors(buildCorsOptions(env)))`).

### 7. Server-side password strength validation

**Where:** `backend/src/utils/passwordPolicy.js` (fits the existing flat `utils/` convention — a pure validator, not an external-integration boundary like the mailer). Interface:
```js
export function validatePasswordStrength(password) {
  // throws Error with a user-facing message, OR returns { valid, reason } — recommend throwing
  // to match the existing "resolvers throw plain Error" convention (user.resolver.js:27,41).
}
```
Minimum bar for a portfolio app: length ≥ 8, not purely numeric/all-same-char — avoid over-engineering complexity rules (composition-class requirements are widely considered bad practice by current NIST guidance) beyond what's easy to test and explain.

**Wiring:** called at the top of `register` (before `models.User.create`) and `resetPassword` (before `user.passwordHash = password`) in `backend/src/resolvers/user.resolver.js` — two call sites, one shared module, zero duplication.

**New files:** `backend/src/utils/passwordPolicy.js`, `backend/src/utils/passwordPolicy.test.js` (pure unit tests, no DB).
**Modified files:** `backend/src/resolvers/user.resolver.js` (two call sites); existing `register`/`resetPassword` integration tests gain weak-password rejection cases.

## The `sequelize.sync()` Constraint (applies to fixes #3 and #4)

`backend/src/models/index.js:12` calls **plain `sequelize.sync()`** (no `alter`/`force`) in `initializeDatabase()`, which runs on every real backend boot (`server.js:28`). Plain `sync()` only issues `CREATE TABLE IF NOT EXISTS` — it does **not** alter an already-existing table to add new columns. This has two very different consequences depending on environment:

- **Test database:** `backend/test/globalSetup.js` calls `sequelize.sync({ force: true, match: /_test$/ })`, which **drops and recreates** all tables at the start of every test run. New columns (`passwordChangedAt`, `isVerified`, `verificationToken`, `verificationTokenExpiresAt`) will always be present correctly in tests — this constraint is **invisible to the test suite** and will not surface as a test failure.
- **Any real, already-provisioned database** (a developer's existing local MySQL, or a `docker-compose` volume that already has a `users` table from a prior boot): plain `sync()` will silently **not** add the new columns. The app will boot without error, then fail at runtime the first time a resolver reads/writes `passwordChangedAt` or `isVerified` (Sequelize will emit `Unknown column` errors from MySQL).

This is out of scope to fully solve this milestone (Sequelize migrations are explicitly deferred to a future "Infra hardening" milestone per PROJECT.md), but it must be **flagged, not silently shipped**: recommend one of — (a) document a manual `ALTER TABLE` step in `README.md`/`KNOWN-ISSUES.md` for anyone with an existing local/deployed DB, or (b) change `initializeDatabase()`'s call to `sequelize.sync({ alter: true })` for non-production environments only (dev convenience, still risky enough in prod to leave prod on the manual-step path). Either way, this belongs in the roadmap as an explicit small task attached to whichever phase adds the new columns (fix #3, and again for fix #4) — not assumed to be "handled" because tests pass.

## Build Order (dependency-respecting, TDD-independent per step)

1. **CORS message fix** — zero dependencies on anything else; smallest possible red/green cycle; extract `corsOriginValidator` first as a pure-function warm-up for the pattern reused in step 5.
2. **JWT secret fail-fast** — zero dependencies; foundational (an insecure secret undermines every other fix); pure-function extraction (`assertProductionSecrets`) TDD'd in isolation.
3. **Password strength validator** — pure module, no schema/DB coupling; build+test the validator standalone, then wire into `register`/`resetPassword` (existing integration tests gain new red cases first).
4. **Mailer abstraction** — new module, no DB coupling; unit-test the console transport and the two domain helpers directly; not yet wired into any resolver.
5. **Reset-token exposure fix** (consumes mailer from step 4) — wire `sendPasswordResetEmail` into `requestPasswordReset`, drop `resetToken` from the schema/response, flip the existing v1.0 "documents the bug" test to assert the fixed behavior, update `ForgotPassword.jsx` to stop rendering the token.
6. **`passwordChangedAt`** — schema/model change, independent of mailer/rate-limiting; wire the `getUserFromRequest` iat check; establishes the "central choke-point check" pattern reused by step 8's `isVerified` check in `requireAuth`.
7. **Rate limiting** — build the generic plugin + operation-config registry; wire into `login`/`register`/`requestPasswordReset` only after their resolver bodies are in final v1.1 shape (post steps 3 and 5), so rate-limit tests aren't rewritten when those resolvers change underneath them; design the config map so step 8's `resendVerification` is a one-line addition later.
8. **Email verification** — largest and most invasive; depends on the mailer (step 4) to send the verification email, benefits from the rate-limit infra (step 7) for `resendVerification`, and reuses the `requireAuth` central-check pattern established in step 6. Sequence: model columns → `verifyEmail`/`resendVerification` resolvers + schema → register/login behavior changes (including the `createTestUser` default-`isVerified` update in `backend/test/helpers.js`, which must land in the same change or every unrelated existing integration test breaks) → frontend routing/UX. Do this last so it composes on top of already-stable resolver behavior rather than being rebased repeatedly.

Each step above is independently TDD-able: steps 1–4 and 7's plugin core have zero DB/resolver coupling (pure-function or module-level unit tests only); steps 5, 6, 8 layer resolver-level integration tests (via the existing `graphql()` helper) on top of already-tested building blocks.

## Integration Points Summary

| Fix | Primary Integration Point | New Module | Testable Via |
|-----|---------------------------|------------|---------------|
| Rate limiting | Apollo plugin (`didResolveOperation`), keyed via `contextValue.clientIp` | `backend/src/plugins/rateLimitPlugin.js` | `graphql()` helper (extended with `clientIp` option) — works because plugins fire identically for `executeOperation()` and HTTP |
| Mailer | Direct module import into resolvers (not Apollo context) | `backend/src/services/mailer.js` | `vi.mock('../services/mailer.js')` in resolver tests |
| `passwordChangedAt` | `getUserFromRequest` (existing per-request choke point) | none (model column + auth.js change) | `graphql()` helper with a stale-`iat` token / pre-set `passwordChangedAt` |
| Email verification | `requireAuth` (central check) + `login`/`register`/`verifyEmail` resolvers | `frontend/src/pages/VerifyEmail.jsx` | `graphql()` helper; `createTestUser({ isVerified: false })` |
| JWT secret fail-fast | `env.js` module load (throws before Express/Apollo boot) | `backend/src/config/assertProductionSecrets.js` | Pure function, plain-argument unit test |
| CORS message | `server.js` `cors()` options | `backend/src/config/corsOptions.js` | Pure function, plain-argument unit test |
| Password strength | `register`/`resetPassword` resolver bodies | `backend/src/utils/passwordPolicy.js` | Pure function unit test + resolver integration test |

## Anti-Patterns to Avoid

### Rate limiting as Express middleware
**What people do:** Reach for `express-rate-limit` mounted before `expressMiddleware`, since it's the most-searched answer for "rate limit Express."
**Why it's wrong here:** It's invisible to `server.executeOperation()`, which is how this codebase's entire TDD strategy is built (`backend/test/helpers.js`). It also can't cleanly distinguish `login` from `register` from `me` without re-parsing the GraphQL body itself.
**Do this instead:** An Apollo plugin (`didResolveOperation`), keyed via a `contextValue` field the `context()` function and the test helper both populate.

### Injecting the mailer via Apollo context "for testability"
**What people do:** Add `mailer` to `context()` so it can be swapped per-request, assuming that's "the DI way" in this codebase.
**Why it's wrong here:** It's unnecessary ceremony — this app has one mailer, selected by env var, not per-request. It would require changing the `graphql()` test helper's signature for every resolver test, not just mailer-related ones. `vi.mock` on a directly-imported module achieves the same test isolation with zero signature changes, and matches the existing "resolvers import utils directly" convention.

### Assuming `sync()` + passing tests means the schema change is "done"
**What people do:** Add a model column, see tests green (because `globalSetup.js` force-drops and recreates tables every run), and consider the change complete.
**Why it's wrong here:** Plain `sequelize.sync()` (used at real boot, not in tests) does not alter existing tables. A schema change that only "works" because the test DB is rebuilt from scratch every run will break on any already-provisioned database.
**Do this instead:** Explicitly flag the manual `ALTER TABLE` step (or scope `sync({ alter: true })` to non-production) any time fixes #3 or #4 land.

## Sources

- [Apollo Server Plugin Event Reference](https://www.apollographql.com/docs/apollo-server/integrations/plugins-event-reference) — `didResolveOperation` fires post-parse/pre-execution with `operationName` and `contextValue` available; confirms plugin hooks fire identically for `executeOperation()` and HTTP transport. HIGH confidence.
- [Creating Apollo Server Plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins) — plugin lifecycle shape (`requestDidStart` returning a listener object). HIGH confidence.
- [rate-limiter-flexible (GitHub)](https://github.com/animir/node-rate-limiter-flexible) / [npm](https://www.npmjs.com/package/rate-limiter-flexible) — `RateLimiterMemory.consume(key, points)` API, confirmed as the alternative to a hand-rolled limiter if needed later. MEDIUM confidence (not adopted as primary recommendation, verified only as a fallback option).
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md` — existing-system facts (component responsibilities, known issues, milestone scope). HIGH confidence (direct repo inspection).
- `backend/src/server.js`, `backend/src/utils/auth.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/models/User.js`, `backend/src/models/index.js`, `backend/src/config/env.js`, `backend/src/schemas/user.schema.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js` — direct code inspection, current as of 2026-07-12. HIGH confidence.

---
*Architecture research for: v1.1 Security Remediation — integration into existing Express/Apollo/Sequelize architecture*
*Researched: 2026-07-12*
