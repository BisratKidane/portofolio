# Stack Research

**Domain:** Security remediation on an existing Express 4 + Apollo Server 4 + Sequelize (MySQL) + Vitest full-stack auth app (v1.1 milestone — NOT a greenfield stack pick)
**Researched:** 2026-07-12
**Confidence:** HIGH (all versions/engines verified live against the npm registry; API shapes verified against official docs/README, not training data alone)

## Scope Note

This is an *addendum* to the existing validated stack (`.planning/codebase/STACK.md`), not a re-derivation of it. Only new dependencies/integration points needed for the six v1.1 fixes are covered. Runtime confirmed: `backend/package.json` already declares `"engines": { "node": "24.x" }` — the repo runs Node 24 in practice (`.nvmrc` saying `18` is stale docs, tracked separately in `CONCERNS.md`, out of scope here). **None of the recommendations below require a Node version bump** — every package's minimum supported Node is well under 24.

The existing backend integration test harness (`backend/test/helpers.js`) calls `ApolloServer#executeOperation()` **directly, in-process** — it never goes through `backend/src/server.js`'s Express app or HTTP layer at all. This is the single most important integration constraint for this milestone: **any fix implemented purely as Express middleware is invisible to the existing test pattern.** Each recommendation below states explicitly which layer it lives in and how it stays testable under Vitest as a result.

## Recommended Stack

### Core Technologies (new backend dependencies)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `express-rate-limit` | `^8.5.2` | Coarse, per-IP throttle on the `/graphql` HTTP endpoint (outer defense-in-depth layer against connection/request flooding) | De facto standard Express rate limiter (176 Context7 code snippets, actively maintained, last published 2026-05-14). ESM+CJS dual package (`exports.import`/`exports.require`), peer dep `express: >= 4.11` — satisfied by the installed `express@4.21.2`. Ships a built-in in-memory store, so no Redis/external store is needed at this app's single-instance docker-compose scale. |
| `nodemailer` | `^9.0.3` | The pluggable mailer abstraction backing both password-reset delivery and email verification | Sends real mail via SMTP in prod, and — critically — has a `streamTransport`/`jsonTransport` mode built in for dev/test that **never touches the network or needs a live account**: it just returns the composed message object/buffer to your code. This means "logs to console in dev, wired for a real provider in prod" is a *one-line transport swap* behind a single `sendMail()` call, not two divergent code paths. Actively maintained (published 2026-06-30), works fine imported into ESM (`import nodemailer from 'nodemailer'`) despite being a CJS package — standard Node interop, no bundler involved. |
| `validator` | `^13.15.35` | Server-side password strength check (`validator.isStrongPassword()`) for `register` and `resetPassword` | Purpose-built, actively maintained (published 2026-04-02), pure string-validation utility with zero heavy data files. `isStrongPassword(str, { minLength, minLowercase, minUppercase, minNumbers, minSymbols, returnScore })` does exactly the "length/complexity" check this milestone needs in one call — no dictionary-based entropy scoring, no client-side bundle concerns (server-only usage here). |

### Supporting Libraries (new devDependency)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `supertest` | `^7.2.2` | HTTP-level Vitest tests for the parts of this milestone that live in Express middleware, not resolvers — specifically the coarse `express-rate-limit` throttle and the hardened CORS error response | Needed because `express-rate-limit` and the `cors()` origin callback sit in `backend/src/server.js` *outside* the GraphQL execution path that `executeOperation()`-based tests exercise. Requires exporting the Express `app` instance separately from the `app.listen()` call in `server.js` (a small, expected refactor for this milestone — v1.1 is explicitly allowed to change runtime behavior, unlike v1.0). Actively maintained (published 2026-01-06), works directly against an unlisted `app` instance, no real port binding required, no bundler involved. |

### Zero-New-Dependency Fixes

Four of the six v1.1 fixes need **no new package at all** — they're wiring changes on top of dependencies already installed. Listing them explicitly so the roadmap doesn't budget dependency-research time for them:

| Fix | Uses | Integration point |
|-----|------|--------------------|
| JWT/session revocation via `passwordChangedAt` | `jsonwebtoken@9.0.2` (already embeds `iat` in every signed token unless `noTimestamp: true` is passed — it isn't here) | Add a `passwordChangedAt` `DATE` column to the `User` model (`backend/src/models/User.js`); in `getUserFromRequest` (`backend/src/utils/auth.js`), reject the token if `payload.iat * 1000 < user.passwordChangedAt.getTime()`. Set the column in `resetPassword` (and any future "change password while logged in" mutation). |
| Email verification tokens | `node:crypto` (already used for `createResetToken()` in `backend/src/utils/auth.js:31-33`) | Reuse/generalize the existing `crypto.randomBytes(32).toString('hex')` pattern for an `emailVerificationToken` + `emailVerificationExpiresAt` pair on `User`, mirroring the existing `resetPasswordToken`/`resetPasswordExpiresAt` fields. |
| JWT secret fail-fast | none — plain startup check | In `backend/src/config/env.js`, after computing `jwtSecret`, throw/`process.exit(1)` when `nodeEnv === 'production'` and `(!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me')`. Testable in Vitest via `vi.resetModules()` + dynamic `import()` per test case with different `process.env` values (standard pattern for testing module-level side effects). |
| CORS rejection no longer echoes origin | none — plain code change | In the `cors({ origin(...) })` callback in `backend/src/server.js:17-23`, `console.error` the rejected origin server-side but call `callback(new Error('Not allowed by CORS.'))` with a generic message to the client. Testable via the new `supertest`-based HTTP layer test. |

### Per-mutation rate limiting: recommended pattern

The question of *how* to throttle `login`/`register`/`requestPasswordReset` specifically (not just the whole `/graphql` endpoint) needs a deliberate choice, since all three hit the same `POST /graphql` route. Two real options were evaluated:

1. **`express-rate-limit` with a `skip()` function inspecting `req.body`** (Express-layer keying) — technically possible (parse `req.body.query`/`operationName` after `express.json()`, run a separate limiter instance per sensitive mutation with a `skip` callback), but it duplicates GraphQL-operation parsing that Apollo Server already does internally, and — per the harness constraint above — **would not be exercised by the existing `executeOperation()`-based integration tests at all**, forcing every rate-limit test onto the new `supertest` HTTP layer.
2. **A small custom Apollo Server plugin** (`requestDidStart` → `didResolveOperation`) — Apollo has already parsed and validated the operation by this hook, so you read `requestContext.operation` directly (root field name via the operation's selection set, or `requestContext.operationName`) with zero extra parsing. Throw a plain `Error('Too many attempts. Please try again later.')` (matching the existing resolver error-throwing convention in `backend/src/resolvers/user.resolver.js` — not a `GraphQLError`/`extensions.code`, to stay consistent with house style) when a caller exceeds the limit for a given operation.

**Recommendation: option 2, as a hand-rolled in-memory limiter — no new dependency.** A plugin module (e.g. `backend/src/plugins/rateLimit.js`) exporting a `createRateLimitPlugin()` factory, backed by a `Map<string, { count, resetAt }>` keyed by `` `${ip}:${operationName}` `` with a simple fixed-window counter (~30–40 lines, no external library), is:
- **Directly testable via the existing harness** — pass a synthetic `ip` field into `contextValue` in `helpers.js`'s `graphql()` (e.g. `graphql(query, vars, user, { ip: '1.2.3.4' })`) and call it repeatedly in a loop to assert the Nth call throws. No `supertest`, no port binding.
- **Shared between prod and test for free** — `server.js` wires the plugin into `new ApolloServer({ typeDefs, resolvers, plugins: [createRateLimitPlugin()] })`, and `test/helpers.js`'s `ApolloServer` instance can import and register the *same* plugin factory, guaranteeing test and prod exercise identical logic.
- **Not over-engineered for this app's scale** — a portfolio app on a single docker-compose instance has no need for a distributed store (Redis) or a battle-tested token-bucket library; a fixed-window `Map` with periodic cleanup (or just relying on window expiry) is enough, and it's the security-sensitive logic itself that benefits most from being simple enough to read in one sitting.
- Needs a **test-only reset hook** (e.g. `plugin.__reset()` or a fresh `Map` per test file) since the limiter store is a module-level singleton — same pattern already used for `sequelize`/`models` per the existing architecture (see `.planning/codebase/ARCHITECTURE.md`, "Global state").

Layer the coarse `express-rate-limit` middleware from the Core Technologies table *in front of* this plugin as defense-in-depth against raw connection flooding (any operation, not just the three sensitive mutations) — that layer only needs the `supertest` HTTP-level test, since it's genuinely an HTTP-boundary concern, not GraphQL-operation-aware.

## Installation

```bash
# Core (backend workspace)
npm install --workspace backend express-rate-limit@^8.5.2 nodemailer@^9.0.3 validator@^13.15.35

# Dev dependencies (backend workspace)
npm install --workspace backend -D supertest@^7.2.2
```

No frontend package changes are required for this milestone — all six fixes are backend/API-contract changes (the frontend forms already `required` fields and will need minor UX updates for new mutation responses/errors, but no new frontend *libraries*).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Hand-rolled `Map`-based Apollo plugin for per-mutation limits | `rate-limiter-flexible@11.2.0` (actively maintained, published 2026-06-08) | If the app grows to multiple backend replicas behind a load balancer and needs a shared Redis-backed limiter, or if you want built-in sliding-window/leaky-bucket algorithms instead of a fixed window. Not justified at this app's current single-instance scale — would be pulling in a general-purpose rate-limiting engine to solve a ~30-line problem. |
| `express-rate-limit` skipped for per-mutation logic | `express-rate-limit` with a `skip()` callback parsing `req.body` | If the team wants to avoid touching Apollo plugin internals entirely and is fine with all rate-limit tests living at the HTTP/`supertest` layer instead of the fast in-process harness. Valid, just slower to test and duplicates operation parsing Apollo already does. |
| `validator.isStrongPassword()` | Hand-rolled regex/length check (zero dependency) | If the team wants absolutely zero new dependencies for this specific fix. Fully viable at this app's scale — `validator` is recommended mainly to avoid re-deriving/testing Unicode-aware character-class edge cases by hand for a security-relevant check. |
| `validator.isStrongPassword()` | `@zxcvbn-ts/core@4.1.2` (actively maintained fork, published 2026-06-16) | If a future milestone wants entropy-based strength *scoring* (dictionary/pattern-aware, like the strength meters on major sign-up forms) rather than simple character-class rules. Overkill for this milestone's "server-side password strength validation" ask — adds frequency-list loading and a materially larger dependency for a check `isStrongPassword` already satisfies. |
| `nodemailer` with `streamTransport`/`jsonTransport` in dev | `nodemailer-mock` | If tests need to assert against a richer mock API (call history, per-test reset helpers) than manually configuring a `jsonTransport` transporter provides. Not needed here — `jsonTransport: true` already returns a fully inspectable message object with zero extra dependency. |
| A single `sendMail()`-based mailer abstraction | Hand-rolled `console.log()`-only "mailer" (no nodemailer at all) | Only if the team is certain the mailer will *always* stay console-only and a "real provider" is never wired up even post-milestone. Rejected here because the milestone explicitly says the mailer must be "wired for a real provider in prod" — building on `nodemailer` from day one makes that a transport-config change, not a rewrite of the calling code. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `zxcvbn` (original, Dropbox) | Last published 2022-06-29 — unmaintained for 4 years, heavy embedded frequency dictionaries meant for client-side strength meters, not a lightweight server-side gate | `validator.isStrongPassword()` |
| `graphql-rate-limit-directive` | Last published 2024-12-03 (stale relative to the current `graphql@16.10` and `rate-limiter-flexible@11.x` in this ecosystem); its `peerDependencies` cap `rate-limiter-flexible` at `^2.0.0 \|\| ^3.0.0 \|\| ^4.0.0 \|\| ^5.0.0`, incompatible with the current major. It also requires switching schema construction from plain `typeDefs`/`resolvers` to `makeExecutableSchema` + directive transforms — a bigger structural change than this milestone needs | The hand-rolled Apollo plugin pattern above |
| A Redis-backed rate-limit store (`rate-limit-redis`, etc.) | No horizontal scaling in this app's docker-compose deployment; adding Redis is new infrastructure for a problem the in-memory store already solves at this scale | `express-rate-limit`'s built-in `MemoryStore` (default) + the hand-rolled in-memory Apollo plugin |
| Refresh-token/short-lived-access-token libraries (`passport`, `passport-jwt`, token-rotation schemes) | Explicitly out of scope per `PROJECT.md` — `passwordChangedAt` invalidation is the chosen revocation mechanism this milestone, not a refresh-token architecture | The existing `jsonwebtoken` + new `passwordChangedAt` column |
| A live SMTP/SES/SendGrid account this milestone | Explicitly out of scope per `PROJECT.md` — "standing up an actual SES/SendGrid/Postmark account is a deployment concern, not this milestone" | `nodemailer` with `streamTransport`/`jsonTransport` in dev/test; leave the SMTP transport config wired but unconfigured for prod |
| Sequelize migration tooling (`umzug`, `sequelize-cli`) | Explicitly out of scope per `PROJECT.md` ("Infra hardening... a separate milestone") | Add new columns (`passwordChangedAt`, `emailVerificationToken`, `emailVerificationExpiresAt`) directly to the `User.init()` schema; `sequelize.sync()` (no `alter: true`) creates them fine on the fresh dev/test databases this app currently recreates per run. **Flag for the roadmap:** a plain `sync()` will *not* retrofit these columns onto an already-persisted production database — that's a real gap, but fixing it is the deferred "Infra hardening" milestone's job, not this one's. |
| Bumping Node beyond what's already pinned | Every package above supports Node well below the already-installed `24.x` (`express-rate-limit` needs `>=16`, `nodemailer` needs `>=6`, `validator` needs `>=0.10`, `supertest` has no unusual floor) | No action needed — `backend/package.json`'s `"engines": { "node": "24.x" }` already covers everything here |

## Stack Patterns by Variant

**If the roadmap wants rate-limit tests to run at the fast in-process layer (recommended, matches existing harness):**
- Implement per-mutation limits as an Apollo Server plugin, keyed off `contextValue.ip` + operation name
- Import the same plugin factory in both `backend/src/server.js` and `backend/test/helpers.js`
- Only the coarse, IP-only `/graphql`-wide limiter needs `express-rate-limit` + `supertest`

**If the team later needs multi-instance/horizontally-scaled deployment:**
- Swap the hand-rolled `Map` store for `rate-limiter-flexible`'s `RateLimiterMemory` → `RateLimiterRedis`, and point `express-rate-limit`'s `store` option at `rate-limit-redis` backed by the same Redis instance
- Not needed for this milestone; flagging only so the roadmap doesn't have to re-research it later

**If the mailer needs to actually deliver mail in a later milestone (out of scope for v1.1):**
- Swap `nodemailer.createTransport({ jsonTransport: true })` (dev/test) for `nodemailer.createTransport({ host, port, auth })` (SMTP) or a provider-specific transport plugin (e.g. `nodemailer-sendgrid-transport`) — the calling code (`mailer.sendVerificationEmail(...)`, `mailer.sendPasswordResetEmail(...)`) does not change

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `express-rate-limit@8.5.2` | `express@4.21.2` (installed) | Peer requirement is `express: >= 4.11` — satisfied. Package is ESM-primary with a CJS build (`dist/index.mjs` / `dist/index.cjs`); imports fine as `import { rateLimit } from 'express-rate-limit'` in this ESM (`"type": "module"`) backend. |
| `express-rate-limit` behind a reverse proxy | Deployment expects Nginx/Caddy in front (per `README.md`) | IP-based keying (both this package and the hand-rolled Apollo plugin) requires `app.set('trust proxy', ...)` to be configured correctly in `server.js`, or every request will appear to come from the proxy's IP. Flag for implementation, not a new dependency. |
| `nodemailer@9.0.3` | ESM backend (`"type": "module"`) | CJS package (`main: lib/nodemailer.js`, no `exports.import`); Node's default CJS interop handles `import nodemailer from 'nodemailer'` transparently — no `esModuleInterop`/bundler config needed since there's no bundler on the backend. |
| `validator@13.15.35` | ESM backend | Same CJS-into-ESM interop story as `nodemailer`; `import validator from 'validator'` works directly. |
| `supertest@7.2.2` | `vitest@4.1.10` (installed) | Framework-agnostic — wraps any `http.Server`/Express `app` instance directly; no Jest-specific assumptions, works identically under Vitest's `describe`/`it`. Requires `server.js` to export `app` separately from the `app.listen(...)` call (small refactor). |
| New `User` columns (`passwordChangedAt`, `emailVerificationToken`, `emailVerificationExpiresAt`) | `sequelize@6.37.5` | Plain `DataTypes.DATE`/`DataTypes.STRING` additions to the existing `User.init()` call, same pattern as the existing `resetPasswordToken`/`resetPasswordExpiresAt` fields — no new Sequelize APIs or plugins needed. |

## Sources

- npm registry (`npm view <pkg> version/engines/time.modified/peerDependencies/type/exports`) — live-verified versions, publish dates, and Node engine floors for `express-rate-limit`, `nodemailer`, `validator`, `zxcvbn`, `zxcvbn-ts`, `@zxcvbn-ts/core`, `graphql-rate-limit-directive`, `rate-limiter-flexible`, `supertest`. HIGH confidence (primary source, checked directly against the registry, not a search index).
- Context7 (`ctx7` CLI, `/express-rate-limit/express-rate-limit`) — confirmed express-rate-limit is the standard, actively-benchmarked Express rate-limit middleware. HIGH confidence.
- [Nodemailer — Stream transport](https://nodemailer.com/transports/stream) and official Nodemailer docs — confirmed `streamTransport`/`jsonTransport` behavior (no network egress, no account needed). HIGH confidence (official docs).
- [validator.js README / GitHub](https://github.com/validatorjs/validator.js) — confirmed `isStrongPassword(str, options)` signature and default option values. MEDIUM confidence (WebSearch-surfaced but sourced from the official repo README, not a third-party blog).
- Repo inspection: `backend/package.json`, `backend/src/server.js`, `backend/src/config/env.js`, `backend/src/utils/auth.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/models/User.js`, `backend/src/models/index.js`, `backend/test/helpers.js` — confirmed current dependency versions, Node engine (`24.x`, not `18.x` as stale docs claim), existing token-generation pattern (`node:crypto`), existing in-process test harness bypassing Express entirely, and `sequelize.sync()` (no `alter`) schema-creation behavior. HIGH confidence (primary source, the actual code).
- `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md` — milestone scope, explicit out-of-scope boundaries (no OAuth/MFA, no refresh tokens, no live email account, no migration tooling this milestone). HIGH confidence (project's own planning docs).

---
*Stack research for: v1.1 Security Remediation (new dependencies only) on existing Express 4 + Apollo Server 4 + Sequelize + Vitest stack*
*Researched: 2026-07-12*
