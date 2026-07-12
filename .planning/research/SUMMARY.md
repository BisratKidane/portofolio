# Project Research Summary

**Project:** Portfolio Auth App — v1.1 Security Remediation
**Domain:** Security hardening of an existing Express 4 + Apollo Server 4 (GraphQL) + Sequelize/MySQL + JWT auth stack, under a strict TDD (red-green-refactor) mandate with a v1.0 CI-enforced test suite that must stay green throughout
**Researched:** 2026-07-12
**Confidence:** HIGH

## Executive Summary

This is not a greenfield stack pick — it's targeted remediation of 7 documented, previously-deferred vulnerabilities (reset-token exposure, forgeable JWT secret, no rate limiting, no session revocation, no password strength check, first-user-ADMIN land-grab race, CORS origin echo) on an already-built, already-tested app. All four research streams converge on one governing fact: `backend/test/helpers.js` calls `ApolloServer#executeOperation()` **directly, in-process**, bypassing `backend/src/server.js`'s Express app entirely. This single architectural detail determines *how* every fix must be built to stay testable under the existing harness, and it resolves the one real disagreement in the research (see below). Three new backend dependencies are recommended (`nodemailer`, `validator`, `express-rate-limit` for a coarse outer layer only) plus one new dev dependency (`supertest`); four of the seven fixes need no new dependency at all.

**Resolved tension — rate limiting.** FEATURES.md initially leaned toward implementing per-mutation rate limiting as Express middleware (the "default" answer for `express-rate-limit`). STACK.md, ARCHITECTURE.md, and PITFALLS.md all independently converge on the opposite conclusion and this synthesis adopts their recommendation: **per-mutation rate limiting for `login`/`register`/`requestPasswordReset` must be a hand-rolled Apollo Server plugin** (`didResolveOperation` hook, keyed on `${clientIp}:${operationName}` sourced from `contextValue`), because that is the only implementation Apollo fires identically for both `executeOperation()` (tests) and real HTTP traffic — Express middleware is structurally invisible to the existing test suite. A coarse, IP-only, whole-`/graphql` `express-rate-limit` guard is still worth layering in front of the plugin as defense-in-depth against raw connection flooding, but it is secondary and explicitly needs its own new HTTP-level test harness (`supertest` + an importable `app`) since it's a genuine Express-boundary concern the in-process harness cannot reach.

**Recurring structural risk.** The same in-process-harness constraint surfaces independently in STACK, ARCHITECTURE, and PITFALLS: CORS and any Express-layer defenses are untestable through the existing `graphql()` helper. `server.js` currently runs `app.listen()`/side effects at import time, so extracting an importable `app` (decoupled from `.listen()`) plus adding `supertest` is a **prerequisite infrastructure task**, not an optional nice-to-have — it should land as the first task of whichever phase needs it (CORS, and again for the coarse rate-limit layer), not be assumed away. ARCHITECTURE.md offers a partial mitigation (extract pure, dependency-free validator functions like `corsOriginValidator`/`assertProductionSecrets` that unit-test without any HTTP layer at all) — use that pattern for the core logic, but still budget the `supertest` harness for end-to-end confidence on the actual middleware wiring.

**Two landmines that automated tests cannot catch.** (1) `sequelize.sync()` (no `alter`) only creates tables that don't exist — it never adds columns to an already-provisioned table. Every fix that adds a `User` column (`passwordChangedAt`; `isVerified`/`verificationToken`/`verificationTokenExpiresAt`) is invisible-safe in CI and in local test runs, because `globalSetup.js` force-drops and recreates tables every run — but will throw `Unknown column` errors against any real, already-booted dev/prod database. This must be an explicit, documented acceptance-criterion step (manual boot-and-verify against a non-force-synced DB), not something "tests passing" proves. (2) JWT `iat` is seconds-precision; Sequelize `DATE` columns are milliseconds-precision — a naive `passwordChangedAt` revocation comparison either rejects every token or fails to reject stale ones depending on which unit-conversion mistake is made, and the bug is specifically likely to hide in fast CI runs where a reset-then-relogin completes within the same wall-clock second. Both need dedicated boundary tests as mandatory (not optional) red-step cases.

## Key Findings

### Recommended Stack

Three new backend runtime dependencies, one new dev dependency, and four fixes requiring no new dependency at all (see Architecture Approach and Roadmap below for the testability reasoning behind the plugin-not-middleware choice).

**Core technologies:**
- `nodemailer@^9.0.3` — pluggable mailer backing both password-reset delivery and email verification; its `jsonTransport`/`streamTransport` mode returns the composed message with zero network egress, making "console-logs in dev, wired for a real provider in prod" a one-line transport swap behind a single `sendMail()` call.
- `validator@^13.15.35` — server-side `isStrongPassword()` check for `register`/`resetPassword`; purpose-built, no heavy frequency-dictionary data, avoids re-deriving Unicode-aware character-class edge cases by hand.
- `express-rate-limit@^8.5.2` — coarse, per-IP, whole-`/graphql` throttle (defense-in-depth only, *not* the per-mutation mechanism — see Executive Summary).
- `supertest@^7.2.2` (devDependency) — HTTP-level tests for the parts of this milestone that live outside the GraphQL execution path (coarse rate limiter, CORS wiring); requires exporting `app` from `server.js` separately from `app.listen()`.
- **Zero-new-dependency fixes:** JWT secret fail-fast (plain startup check), CORS generic error (plain code change), `passwordChangedAt` revocation (reuses `jsonwebtoken`'s existing `iat` claim), and email verification tokens (reuses the existing `node:crypto`/`resetPasswordToken` pattern already in `utils/auth.js`) — the roadmap should not budget dependency-research time for these.
- Per-mutation rate limiting is **explicitly a hand-rolled `Map`-based Apollo plugin, not a package** — see Executive Summary for the resolved rationale.

### Expected Features

All 7 fixes are P1 — every one closes a documented, tracked vulnerability from `KNOWN-ISSUES.md`/`CONCERNS.md`; there is no P2/P3 tier within the named scope.

**Must have (table stakes) — one line each:**
- Reset-token dropped from the API schema entirely (not just nulled) + delivered via the mailer; frontend `ForgotPassword.jsx` stops rendering it.
- Fail-fast boot refusal in `production` only when `JWT_SECRET` is unset or `'change-me'` — must not fire in `test`/`development`.
- Rate limiting on `login`/`register`/`requestPasswordReset`, keyed by IP (not email — see enumeration-oracle pitfall below), 429/error on breach.
- `passwordChangedAt` column set on password change, checked in `getUserFromRequest` against JWT `iat`.
- 8-character minimum password length on `register`/`resetPassword` (NIST 800-63B: length over composition rules — no forced uppercase/digit/symbol requirements).
- Email verification gating `login`, with ADMIN-role assignment moved from *registration* time to *verification* time (this is the actual race-fix mechanism, not incidental).
- CORS rejection logs the origin server-side only; generic message to the client.

**Should have (differentiators, not required for correctness):**
- Operation-aware rate limiting refinement, `resendVerificationEmail` mutation, frontend-specific 429 error copy, env-seeded initial admin as belt-and-suspenders on top of verification-gated role assignment.

**Defer (explicitly out of scope per PROJECT.md):**
- Refresh-token rotation/true multi-device logout, live SMTP/SES/SendGrid account, MFA/OAuth, Sequelize migrations, GraphQL query complexity/depth limiting, CAPTCHA, password composition rules, password history.

### Architecture Approach

Every fix's implementation is dictated by where in the request pipeline it can be exercised by the existing `executeOperation()`-based harness. Fixes that can be pure functions (CORS validator, JWT-secret assertion, password-strength check) are extracted as small, dependency-free, directly-unit-testable modules — matching the codebase's existing convention of resolvers importing plain helper functions from `utils/`. Fixes that need per-request state (rate limiting, revocation) hook into places every request already passes through: the Apollo plugin lifecycle (`didResolveOperation`) for rate limiting, and the existing `getUserFromRequest` choke point in `utils/auth.js` for both `passwordChangedAt` revocation and (recommended) the email-verification gate — reusing one central check rather than scattering ad hoc guards across resolvers.

**Major components (new/modified):**
1. `backend/src/plugins/rateLimitPlugin.js` — Apollo plugin, in-memory `Map`-based fixed-window counter, keyed `${clientIp}:${operationName}`, with an exported `resetRateLimits()` test hook (module-level singleton state must be reset between test files).
2. `backend/src/services/mailer.js` — new `services/` directory (deliberate small deviation from flat `utils/`, since this is an external-integration boundary); `sendMail`/`sendPasswordResetEmail`/`sendVerificationEmail`, injected via direct import + `vi.mock()` in tests, not via Apollo context.
3. `backend/src/config/assertProductionSecrets.js` + `backend/src/config/corsOptions.js` — pure, exported functions extracted from `env.js`/`server.js` so they unit-test with plain arguments, no module-reset gymnastics or HTTP boot required.
4. `backend/src/utils/passwordPolicy.js` — pure validator, called from `register` and `resetPassword`.
5. `User` model gains `passwordChangedAt`, `isVerified`, `verificationToken`, `verificationTokenExpiresAt` — mirrors the existing `resetPasswordToken`/`resetPasswordExpiresAt` pattern already in the model.
6. New HTTP-level test harness (importable `app` + `supertest`) — supports CORS wiring tests and the coarse IP-only rate limiter; a genuinely new piece of test infrastructure, not a fix in itself.

### Critical Pitfalls

1. **In-process test harness cannot reach Express-layer code** — any fix implemented purely as Express middleware (CORS, coarse rate limiting) is untestable via the existing `graphql()` helper; a "red" test that passes on the first run without any implementation change is the tell. Fix: extract an importable `app` + add `supertest` before writing red tests for these two fixes.
2. **`sequelize.sync()` doesn't alter existing tables** — CI/local test runs force-recreate tables every run (`globalSetup.js`), so this gap is structurally invisible to automated tests; it will surface as `Unknown column` runtime errors on any real, already-provisioned database the first time a resolver touches a new column. Every phase that adds a `User` column must include a manual, non-test verification step (boot against a non-force-synced local DB) as an explicit acceptance criterion.
3. **JWT `iat` (seconds) vs. DB timestamp (milliseconds) precision mismatch** — a naive `passwordChangedAt` comparison either rejects every token or fails to invalidate stale ones; the bug is exactly the kind that hides in fast CI runs (reset-then-relogin within the same second). Mandatory same-second boundary test, not an edge case to add later.
4. **Rate-limit counter becomes a new enumeration oracle** if incremented after a DB lookup (inside the resolver, only for existing accounts) or keyed by email instead of IP — this silently undoes the exact account-enumeration protection the reset-token fix is adding. Increment unconditionally, before any account-existence check, in middleware/plugin — not resolver body.
5. **JWT-secret fail-fast crashes the entire test/CI suite** if not scoped exactly to `NODE_ENV === 'production'` — `env/test.env` deliberately uses a weak/shared secret, and `env.js` executes at module-import time, so an ungated check breaks all 39+ existing backend tests in one commit, for a reason unrelated to whatever's actually being tested.
6. **Email verification "closes the race" only if ADMIN assignment moves to verification time**, not registration time — inserting an `isVerified` flag while still counting `userCount === 0` at `register()` leaves the land-grab fully open (an unverified row still claims the ADMIN slot). This also breaks the `register`→auto-login flow and its v1.0 tests, and `createTestUser()`'s default must add `isVerified: true` in the same change or every unrelated existing integration test that logs in starts failing.

## Implications for Roadmap

Based on combined research, suggested phase structure (6 phases, dependency-ordered, matching the convergent build order across STACK/ARCHITECTURE/PITFALLS):

### Phase 1: Foundation Hardening — CORS, JWT Fail-Fast, HTTP Test Harness
**Rationale:** Both fixes are fully independent of everything else and of each other, structurally simple, and low-risk — good first phase to prove the TDD rhythm before tackling anything with DB/mailer/plugin coupling. The HTTP test harness (importable `app` + `supertest`) is a genuine prerequisite for CORS and is reused again in Phase 5's coarse rate-limit layer, so building it here front-loads a piece of infrastructure two later phases depend on.
**Delivers:** `corsOriginValidator`/`buildCorsOptions` (pure function + wiring) no longer echoing origin to the client; `assertProductionSecrets()` gating boot exclusively on `NODE_ENV === 'production'`; an importable `app` export from `server.js`; initial `supertest`-based test file.
**Addresses:** Fixes #2 (JWT fail-fast) and #7 (CORS) from FEATURES.md.
**Avoids:** Pitfall 1 (harness can't reach Express layer) and the JWT fail-fast crash pitfall (must not fire outside `production`) — both are the two easiest, cheapest pitfalls to catch, so proving the harness rhythm here first is low-cost insurance for later phases.

### Phase 2: Server-Side Password Strength Validation
**Rationale:** Pure module, zero DB/schema coupling, zero dependency on any other fix — the cleanest possible standalone TDD cycle, and it's cheap to slot in before the mailer/reset-token work touches the same resolvers.
**Delivers:** `backend/src/utils/passwordPolicy.js` (8-char minimum, no composition rules) wired into `register` and `resetPassword`.
**Uses:** `validator@^13.15.35` (or a hand-rolled equivalent — open decision, see Gaps).
**Implements:** Resolver-level guard clause matching the existing `throw new Error(...)` convention.

### Phase 3: Mailer Abstraction & Reset-Token Remediation
**Rationale:** Fix #1 (reset-token exposure) requires the mailer to exist first; building the mailer once here means fix #6 (email verification) reuses it later rather than duplicating it. This phase also touches the `resetPassword` resolver that Phase 4 touches next, so sequencing it before Phase 4 avoids re-touching the same function twice with unrelated changes interleaved.
**Delivers:** `backend/src/services/mailer.js` (console transport in dev/test, provider stub for prod); `resetToken` removed from `PasswordResetPayload` at the **schema level** (not just resolver-level nulling); `ForgotPassword.jsx` updated to stop rendering the token and show a static "check your email" state (this frontend page has zero existing test coverage today — add one in this phase, don't defer it).
**Addresses:** Fix #1 from FEATURES.md.
**Avoids:** Stale schema field still queryable, mailer test over-mocking (assert call *arguments*, e.g. token match against `user.resetPasswordToken`, not just call count), frontend silently breaking with no test to catch it.

### Phase 4: Session Revocation via `passwordChangedAt`
**Rationale:** Independent of the mailer and of rate limiting; but it establishes the "central choke-point check inside `getUserFromRequest`" pattern that Phase 6's `isVerified` gate deliberately reuses — sequencing it before Phase 6 means email verification's login gate is a proven pattern extension, not a new design.
**Delivers:** `passwordChangedAt` column (set only inside the existing `changed('passwordHash')`-guarded hook branch, never unconditionally); `getUserFromRequest` iat-vs-`passwordChangedAt` check with explicit seconds/milliseconds unit conversion and inclusive same-second boundary handling; a manual boot-and-verify step against a non-force-synced dev DB.
**Addresses:** Fix #4 from FEATURES.md.
**Avoids:** iat/ms precision bug, scope creep beyond password changes, null `passwordChangedAt` mishandling (must mean "never revoked," not a `NaN` comparison), the schema-drift landmine (flag explicitly, don't rely on green tests as proof).

### Phase 5: Rate Limiting (login / register / requestPasswordReset)
**Rationale:** Deliberately built **after** Phases 2–3 give `register`/`resetPassword`/`login` their final v1.1 resolver shape, so rate-limit tests aren't rewritten when those resolvers change underneath them. This is also where the resolved cross-doc tension (Apollo plugin, not Express middleware, as the primary mechanism) is implemented — see Executive Summary.
**Delivers:** `backend/src/plugins/rateLimitPlugin.js` (Apollo `didResolveOperation` hook, `Map`-based fixed-window store, `resetRateLimits()` test hook, `clientIp` threaded through `contextValue` and the `graphql()` test helper's options); a secondary, coarse `express-rate-limit` guard on the whole `/graphql` route using Phase 1's `supertest` harness.
**Addresses:** Fix #3 from FEATURES.md.
**Avoids:** Path-based limiting throttling `me`/`dashboard` uniformly with `login`; in-memory store state bleed across the sequential single-process Vitest run (needs `resetRateLimits()` called in `beforeEach`); enumeration oracle via asymmetric counter increment timing.

### Phase 6: Email Verification (register→ADMIN race fix)
**Rationale:** The largest, most invasive fix — changes the `register` GraphQL contract, breaks the existing register→auto-login flow and its frontend/backend tests, and needs the mailer (Phase 3) and benefits from rate-limit infrastructure (Phase 5) for a future `resendVerification` mutation. Sequenced last so it composes on top of already-stable resolver behavior rather than being rebased repeatedly as earlier phases land.
**Delivers:** `isVerified`/`verificationToken`/`verificationTokenExpiresAt` columns; `verifyEmail`/`resendVerification` mutations; ADMIN-role assignment **moved from registration time to verification time** (counting only verified users) — this is the actual race-fix mechanism, re-derived here rather than bolted onto the existing registration-time check; `login` and `requireAuth` both gated on `isVerified` (central-check reuse from Phase 4); `createTestUser()` default updated to `isVerified: true` in the same change; new `frontend/src/pages/VerifyEmail.jsx` + route; `AuthContext.authenticate()` split so `register()` no longer auto-logs-in.
**Addresses:** Fix #6 from FEATURES.md.
**Avoids:** Naive verification-as-afterthought that doesn't actually close the JWT-usability gap or the ADMIN race; the schema-drift landmine again (new columns need the same manual-boot verification step as Phase 4).

### Phase Ordering Rationale

- **Dependency chain drives order:** mailer must exist before the reset-token fix and before email verification (both consume it); rate limiting is deliberately built after the resolvers it wraps reach final v1.1 shape so its tests don't get rewritten mid-flight; email verification is last because it's the only fix that changes an existing GraphQL contract (`register`'s return shape) and has the largest frontend blast radius.
- **Risk-graded rollout:** the two fully independent, low-risk fixes (CORS, JWT fail-fast) open the milestone to prove the TDD rhythm cheaply; the highest-complexity, highest-blast-radius fix (email verification) closes it, after every supporting pattern (central-choke-point checks, mailer, harness) has already been proven once.
- **Recurring central-check pattern reused, not re-invented:** `getUserFromRequest` is extended once for `passwordChangedAt` (Phase 4) and extended again for `isVerified` (Phase 6) — sequencing them in that order means Phase 6 is following an established pattern, not inventing a new one under time pressure on the milestone's biggest fix.
- **Schema-drift and test-harness risks are flagged at the phases that introduce them**, not left as a single "hope tests catch it" assumption — Phases 1, 4, and 6 each carry an explicit non-test verification step.

### TDD Red Step: v1.0 Tests That Must Flip

This is the concrete backbone of the TDD workflow for this milestone — each currently passes against the *insecure* v1.0 behavior and must be rewritten to assert the *secure* behavior as the red step:

| Test | Flips because | Phase |
|------|----------------|-------|
| `resetPassword.test.js` — `'returns the generic message and persists a reset token + expiry for an existing email'` | Queries the now-removed `resetToken` field; must drop it from the selection and assert a mailer spy was called with the token instead | 3 |
| `resetPassword.test.js` — `'returns the identical generic message and a null resetToken for a non-existing email'` | Asserts `resetToken` is `null` — the field no longer exists at all; assert `message` only + mailer not called | 3 |
| `KNOWN-ISSUES.md` reset-token-exposure entry | Documentation, not a test, but must be closed out alongside the flip | 3 |
| `register.test.js` — `'makes the first registrant ADMIN and persists a hashed password'` | Asserts `jwt.verify(data.register.token, ...)` — `register` no longer returns an immediately-usable, fully-privileged JWT | 6 |
| `register.test.js` — `'makes subsequent registrants USER'` | Role assertion largely survives; surrounding token-presence/usability assertions need the same update as above | 6 |
| `frontend/src/pages/Register.test.jsx` — `'navigates to /dashboard on successful registration'` | Must mock the new no-token response shape and assert a "check your email" state instead of navigation | 6 |
| `frontend/src/context/AuthContext.jsx`'s `authenticate()` (indirectly exercised by `AuthContext.test.jsx`) | Needs a register-specific branch that does *not* auto-log-in; **new** test coverage required, not strictly a flip | 6 |
| **`createTestUser()` in `backend/test/helpers.js`** | Once `isVerified` defaults to `false` at the model level and `login`/`requireAuth` enforce it, every existing test that logs in via a helper-created user breaks unless the helper defaults to `isVerified: true` (with dedicated verification tests overriding to `false`) — this must land in the *same* change as the `isVerified` gate | 6 |

Two explicit non-flips worth confirming during planning so no time is wasted "fixing" tests that don't touch changed code: `register.test.js`'s malformed-email test and all `login.test.js`/`dashboard.test.js` tests use `createTestUser()`, which bypasses the `register` resolver entirely (goes straight to `models.User.create`) — the password-strength fix (Phase 2) does not affect them.

### Schema-Drift Landmines (cannot be caught by automated tests)

1. **`sequelize.sync()` (no `alter`) never adds columns to an existing table.** `globalSetup.js` force-drops/recreates tables every test run, so CI and `npm test` are structurally incapable of catching this. Any real, already-booted dev or prod database will throw `Unknown column` errors at runtime the first time a resolver touches `passwordChangedAt` or `isVerified`/`verificationToken`. Both column-adding phases (4 and 6) must include an explicit acceptance-criterion step: boot the backend against a non-force-synced, pre-existing local DB and confirm zero SQL errors. A scoped `sequelize.sync({ alter: true })` (non-production only) or a documented manual `ALTER TABLE` step are the two in-scope mitigation options; a real migration tool is out of scope (deferred to a future infra-hardening milestone).
2. **JWT `iat` (seconds) vs. DB timestamp (milliseconds) precision.** A naive comparison (`payload.iat < user.passwordChangedAt.getTime()`) compares numbers on different scales and rejects essentially every token. The fix must floor the DB side to seconds and use an inclusive boundary (`payload.iat >= flooredChangedAtSeconds`, not strict `<`) so a token issued in the *same second* `passwordChangedAt` was set (the common case, since `resetPassword` sets the column and signs the token in the same request) isn't immediately treated as stale. Mandatory same-second boundary test in Phase 4.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new package versions/engines/peer-deps live-verified against the npm registry; existing-stack facts (Node 24 runtime, `executeOperation()`-based harness) confirmed by direct repo inspection, not inference. |
| Features | HIGH for the 5 OWASP/NIST-backed patterns (reset-token handling, password strength, revocation semantics); MEDIUM for rate-limiting *shape* specifically — no single dominant convention exists for GraphQL-aware rate limiting, so exact thresholds and the Express-vs-plugin question needed cross-referencing against ARCHITECTURE/PITFALLS to resolve (done in this synthesis). |
| Architecture | HIGH for the harness-visibility constraint and the resulting plugin/pure-function recommendations (verified against current Apollo Server plugin lifecycle docs); MEDIUM for specific module-boundary choices (e.g. `services/` vs `utils/` for the mailer) — reasonable, opinionated design, not the only valid layout. |
| Pitfalls | HIGH — every pitfall is grounded in direct reads of the actual resolver/model/config/test files, not generic security-advice pattern-matching; the two external claims needing verification (Sequelize `sync()` behavior, `express-rate-limit` store reset methods) were checked against official docs. |

**Overall confidence:** HIGH

### Gaps to Address

These are explicitly flagged across the research as requirements-phase decisions, not settled by research — the roadmapper/requirements phase should surface them for sign-off rather than assume a default:

- **Exact rate-limit thresholds** (window/count per mutation) — FEATURES.md offers commonly-cited starting points (login: 5–10/15min; register: 5–10/hr; requestPasswordReset: 3–5/hr) but there's no single external standard for a GraphQL app the way OWASP gives ranges for token expiry; finalize during requirements.
- **Env-seeded initial admin, on top of or instead of verification-gated role assignment** — `CONCERNS.md` presents this as an "and/or" alternative; PROJECT.md's stated fix is verification-only. Treat as an optional enhancement to flag for explicit sign-off, not assumed in scope for Phase 6.
- **`register`'s return-type change shape** — a message-only `RegisterPayload { message }` (recommended, cleanest) vs. an `AuthPayload` that would 403 on first protected use (more backward-compatible-looking, but ships a token that's immediately half-broken). Recommend the message-only shape; needs explicit sign-off since it's a breaking schema change with real frontend rework attached.
- **Verification-token expiry window** — no external standard cited; reset-token uses 30 min (existing `RESET_TOKEN_EXPIRES_MINUTES`), verification is lower time-sensitivity (suggested 24h) — a judgment call for requirements, not fixed by research.
- **`validator` package vs. hand-rolled password-strength check** — either satisfies the table-stakes requirement; the dependency-vs-zero-dependency tradeoff is an implementation choice, not settled here.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`) — live-verified versions/engines/peer-deps for `express-rate-limit`, `nodemailer`, `validator`, `supertest`, and rejected alternatives (`zxcvbn`, `graphql-rate-limit-directive`, `rate-limiter-flexible`).
- Apollo Server Plugin Event Reference and Creating Apollo Server Plugins docs — `didResolveOperation` lifecycle, confirmed to fire identically for `executeOperation()` and HTTP transport.
- Sequelize v6 Model Synchronization docs — confirms plain `sync()` never alters existing tables.
- Nodemailer Stream Transport docs — confirms no-network dev/test transport behavior.
- Direct repo inspection: `backend/src/server.js`, `backend/src/config/env.js`, `backend/src/utils/auth.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/models/User.js`, `backend/src/models/index.js`, `backend/src/schemas/user.schema.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/vitest.config.js`, all existing `*.test.js`/`*.test.jsx` files, `frontend/src/pages/ForgotPassword.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/context/AuthContext.jsx`, `.github/workflows/ci.yml`, `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `KNOWN-ISSUES.md`.

### Secondary (MEDIUM confidence)
- OWASP Forgot Password Cheat Sheet / Authentication Cheat Sheet — token handling, rate-limiting/lockout guidance.
- validator.js README — `isStrongPassword()` API shape.
- express-rate-limit wiki (Creating Your Own Store) — `resetKey()`/`resetAll()` reset semantics for the coarse layer.
- graphql-rate-limit-directive npm listing — confirms no single dominant Express+Apollo rate-limiting convention exists.

### Tertiary (LOW confidence)
- Community JWT `iat`-precision discussion (single Medium post) — used only to corroborate a pattern already derivable from first principles of the JWT spec and this codebase's actual `signToken`/`jwt.verify` calls; not load-bearing on its own.

---
*Research completed: 2026-07-12*
*Ready for roadmap: yes*
