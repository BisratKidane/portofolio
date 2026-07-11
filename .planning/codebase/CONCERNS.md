# Codebase Concerns

**Analysis Date:** 2026-07-11

## Tech Debt

**Password reset returns token directly instead of emailing it:**
- Issue: `requestPasswordReset` generates a reset token and returns it in the GraphQL response payload instead of sending it via email. The frontend then displays the raw token in the UI.
- Files: `backend/src/resolvers/user.resolver.js:48-61` (mutation), `frontend/src/pages/ForgotPassword.jsx:24-25,50-67` (displays `result.resetToken` in the page)
- Impact: This is explicitly called out in `README.md` ("Password reset currently returns a development reset token... For production, connect `requestPasswordReset` to an email provider and avoid returning the token to the browser.") It is a placeholder implementation, not production-ready.
- Fix approach: Integrate an email provider (SES, SendGrid, Postmark, etc.), send the token via email only, and change the mutation to return only `{ message }` (drop `resetToken` from the `PasswordResetPayload` type in `backend/src/schemas/user.schema.js:21-24`).

**Schema managed by `sequelize.sync()` instead of migrations:**
- Issue: `initializeDatabase()` calls `sequelize.sync()` on every backend boot rather than using a migration tool.
- Files: `backend/src/models/index.js:10-13`
- Impact: No versioned schema history, no safe rollback path, and risk of concurrent `sync()` races if multiple backend replicas start simultaneously against the same database.
- Fix approach: Adopt Sequelize CLI migrations or Umzug; run migrations as a separate deploy step instead of relying on `sync()` at runtime.

**Unbounded user listing:**
- Issue: `dashboard` and `users` resolvers call `models.User.findAll(...)` with no `limit`/`offset`/pagination.
- Files: `backend/src/resolvers/user.resolver.js:12,21`
- Impact: Response payload and query cost grow linearly with user count; the admin dashboard in `frontend/src/pages/Dashboard.jsx:196-259` renders every user row with no virtualization.
- Fix approach: Add pagination arguments to the `users`/`dashboard` GraphQL queries and corresponding `LIMIT`/`OFFSET` in the resolver.

**Unused dependency:**
- Issue: `uuid` is declared in `backend/package.json:25` but never imported anywhere under `backend/src`.
- Files: `backend/package.json`
- Impact: Unnecessary dependency surface (extra install size, potential future CVEs for unused code).
- Fix approach: Remove `uuid` from `backend/package.json` dependencies.

**Frontend Docker image runs the Vite dev server, not a production build:**
- Issue: `frontend/Dockerfile` runs `CMD ["npm", "start"]`, and `start` in `frontend/package.json:11` is `vite --host 0.0.0.0 --port ${CLIENT_PORT:-5173}` — the Vite development server, not a built+served static bundle. This same image/Dockerfile is used for both `npm run docker:local` and `npm run docker:remote` (production-style deployment per `README.md`).
- Files: `frontend/Dockerfile`, `frontend/package.json:9-13`, `docker-compose.yml:36-50`
- Impact: No minification, no code splitting benefits realized in "remote" deployment, larger memory footprint, dev server is not intended/hardened for public traffic.
- Fix approach: Add a production stage that runs `vite build` and serves `frontend/dist` via a lightweight static server (e.g., `serve`, `nginx`) for the `docker:remote` path.

**`passwordHash` field is assigned a raw plaintext password by callers:**
- Issue: Resolvers set `passwordHash: password` (the raw plaintext) directly (`backend/src/resolvers/user.resolver.js:33,69`), relying entirely on the Sequelize `beforeCreate`/`beforeUpdate` hooks in `backend/src/models/User.js:54-58` to hash it before persistence.
- Files: `backend/src/models/User.js:1-65`, `backend/src/resolvers/user.resolver.js:25-43,63-74`
- Impact: The field name implies it always holds a hash, but any future code path that writes to the table outside instance `create`/`save` (bulk inserts, raw SQL, seed scripts, a different hook order) would silently store plaintext passwords.
- Fix approach: Rename the model attribute/param boundary (e.g., accept `password` in resolvers, hash explicitly before constructing the `passwordHash` field) rather than depending implicitly on lifecycle hooks.

## Known Bugs

No reproducible functional bugs were identified during this pass; the codebase is small and the auth flow works as designed. The concerns below are about what the design allows rather than defects in the existing code paths.

## Security Considerations

**Password reset token exposed to anyone who requests it (account takeover):**
- Risk: `requestPasswordReset` returns the freshly generated `resetToken` in the mutation response to whichever caller invoked it — not only to the account owner via email. Anyone who knows a user's email address can call this mutation, receive the reset token directly, then call `resetPassword` to take over that account.
- Files: `backend/src/resolvers/user.resolver.js:48-61,63-74`, `frontend/src/pages/ForgotPassword.jsx:7-11`
- Current mitigation: None at the API layer (the generic "if the account exists" message only obscures whether an account exists, it does not protect the token itself).
- Recommendations: Never return `resetToken` over the API/network. Deliver it exclusively via a verified email channel, and add expiry + single-use enforcement (expiry already exists via `resetPasswordExpiresAt`, single-use is implicit since the field is cleared on success).

**No rate limiting on authentication-sensitive mutations:**
- Risk: `login`, `register`, and `requestPasswordReset` have no throttling, allowing brute-force credential guessing, account enumeration, and reset-token brute forcing.
- Files: `backend/src/server.js` (no rate-limit middleware registered), `backend/src/resolvers/user.resolver.js`
- Current mitigation: None (`grep` for `rate-limit`/`express-rate-limit` in `backend/` returns nothing).
- Recommendations: Add `express-rate-limit` (or an Apollo plugin) scoped to `/graphql`, with tighter limits specifically for `login`, `register`, and `requestPasswordReset`.

**Insecure default JWT secret:**
- Risk: If `JWT_SECRET` is not set in the environment, the app silently falls back to the literal string `'change-me'`.
- Files: `backend/src/config/env.js:21`
- Current mitigation: `README.md` instructs operators to replace `JWT_SECRET` in `env/remote.env` before deploying, but nothing in code enforces this — a misconfigured deployment fails open with a guessable, publicly-known secret, allowing forged JWTs (including admin-role tokens, since `role` is embedded in the JWT payload at `backend/src/utils/auth.js:6`).
- Recommendations: Fail fast at startup (`throw`/`process.exit`) when `NODE_ENV === 'production'` and `JWT_SECRET` is unset or equals the default.

**No JWT/session revocation:**
- Risk: JWTs are stateless with a default 1-day expiry (`env.jwtExpiresIn`, `backend/src/config/env.js:22`). `logout` only deletes the token client-side (`frontend/src/context/AuthContext.jsx:62-69`); the server has no denylist/versioning, so a leaked token remains valid until natural expiry regardless of logout. Similarly, `resetPassword` (`backend/src/resolvers/user.resolver.js:63-74`) does not invalidate JWTs issued before the reset, so a compromised account's old sessions stay valid even after the password is changed.
- Files: `backend/src/utils/auth.js:5-20`, `backend/src/resolvers/user.resolver.js:44-47,63-74`
- Current mitigation: None.
- Recommendations: Add a token version/timestamp claim checked against a `passwordChangedAt` (or similar) column on `User`, invalidating tokens issued before the most recent password change; consider a short-lived access token + refresh token pattern for true logout support.

**No server-side password strength/length validation:**
- Risk: `register` and `resetPassword` mutations accept any non-empty GraphQL `String!` for `password`. The only "validation" is the HTML `required` attribute on the frontend forms.
- Files: `backend/src/schemas/user.schema.js:39,43`, `backend/src/resolvers/user.resolver.js:25-43,63-74`, `frontend/src/pages/Register.jsx:62-70`, `frontend/src/pages/ResetPassword.jsx:62-70`
- Current mitigation: None server-side.
- Recommendations: Add minimum length/complexity checks in the resolver before hashing (client-side validation is bypassable via direct GraphQL calls).

**No email ownership verification on registration:**
- Risk: `register` accepts any email address without confirming the registrant controls it (`backend/src/resolvers/user.resolver.js:25-37`). Combined with "first registered account becomes ADMIN" (`backend/src/resolvers/user.resolver.js:29,34`), the very first registration in a fresh deployment is a race for admin privileges with no verification step.
- Files: `backend/src/resolvers/user.resolver.js:25-37`
- Current mitigation: None.
- Recommendations: Add email verification before granting full account access, and/or provision the initial admin account out-of-band (seed script/env var) instead of "first come, first served."

**CORS rejection leaks the rejected origin in the error message:**
- Risk: When an origin is not in `env.clientOrigins`, the thrown error includes the raw origin value (`backend/src/server.js:20`).
- Files: `backend/src/server.js:17-23`
- Current mitigation: None; low severity, minor information disclosure only.
- Recommendations: Log the origin server-side but return a generic CORS error to the client.

## Performance Bottlenecks

**Unbounded `users`/`dashboard` queries:**
- Problem: Every admin dashboard load and `users` query fetches the entire `users` table with no pagination.
- Files: `backend/src/resolvers/user.resolver.js:12,21`, `frontend/src/pages/Dashboard.jsx:19-27,196-259`
- Cause: `findAll` with no `limit`.
- Improvement path: Add pagination (offset/cursor) to the schema and resolver, and paginate/virtualize the admin table in `frontend/src/pages/Dashboard.jsx`.

**Vite dev server used in containerized deployments:**
- Problem: `frontend/Dockerfile` runs the Vite dev server rather than serving a built bundle, adding unnecessary runtime overhead and slower page loads for both local and "remote" Docker deployments.
- Files: `frontend/Dockerfile`, `frontend/package.json:11`, `docker-compose.yml:36-50`
- Cause: `CMD ["npm", "start"]` maps to the `vite` dev command in both dev and prod-style compose files.
- Improvement path: Build a distinct production image stage using `npm run build` + a static file server.

## Fragile Areas

**Password hashing depends on Sequelize lifecycle hooks:**
- Files: `backend/src/models/User.js:50-60`, `backend/src/resolvers/user.resolver.js:33,69`
- Why fragile: Hashing only happens if code paths go through `create()`/instance `save()` (which trigger `beforeCreate`/`beforeUpdate`). Any bulk operation, raw SQL, or future refactor that writes `passwordHash` differently bypasses hashing silently — no test currently guards this invariant.
- Safe modification: Keep all password writes going through model instance methods; add a unit test asserting `passwordHash` is never equal to the plaintext input after `create`/`save`.
- Test coverage: None — no tests exist for this or any other module (see Test Coverage Gaps below).

**Environment defaults silently mask missing production configuration:**
- Files: `backend/src/config/env.js:16-31`
- Why fragile: Nearly every setting (`jwtSecret`, `database.password`, `database.user`, `clientOrigins`) has a hardcoded fallback. A misconfigured `env/remote.env` (missing a var) does not fail startup — it silently runs with insecure development defaults in what is meant to be a production environment.
- Safe modification: When adding new env-driven settings, avoid defaults for secrets; validate required production vars at boot and exit non-zero if missing/equal to known-insecure defaults.
- Test coverage: None.

## Scaling Limits

**Single database connection pool with no explicit tuning:**
- Current capacity: `backend/src/config/database.js:4-9` instantiates `Sequelize` with no `pool` options, relying on library defaults (max 5 connections).
- Limit: Concurrent request volume beyond the default pool size will queue/block on DB access.
- Scaling path: Configure `pool: { max, min, acquire, idle }` explicitly based on expected concurrency, and consider read replicas if the `users` table grows significantly given the unbounded `findAll` calls noted above.

## Dependencies at Risk

**Node.js 18.x pinned across the project:**
- Risk: `.nvmrc` (`18`), `package.json:6-7` (root), `backend/package.json:6-7`, `frontend/package.json:6-7`, and both `backend/Dockerfile:1`/`frontend/Dockerfile:1` (`FROM node:18-alpine`) all pin Node 18. Node.js 18 reached end-of-life in April 2025 and no longer receives security updates. As of the analysis date (2026-07-11), the entire stack runs on an unsupported runtime.
- Impact: No security patches for the underlying Node runtime; growing incompatibility with newer npm package engine requirements over time.
- Migration plan: Upgrade `.nvmrc`, all `package.json` `engines.node` fields, and both Dockerfiles to a current Node LTS release, then re-test the Sequelize/mysql2/Apollo stack against it.

**`bcryptjs` (pure-JS) instead of native `bcrypt`/`argon2`:**
- Risk: `bcryptjs` (`backend/package.json:17`, used in `backend/src/models/User.js:2,6,55,58`) is a pure-JavaScript bcrypt implementation, meaningfully slower under load than native bindings.
- Impact: Higher CPU cost per login/register/password-reset at scale; not a correctness issue at current traffic levels.
- Migration plan: Consider swapping to `bcrypt` (native) or `argon2` if auth throughput becomes a bottleneck; not urgent for current scale.

## Missing Critical Features

**No email delivery integration:**
- Problem: Password reset has no way to actually deliver a token to the account owner (see Tech Debt above).
- Blocks: Safe, production-ready password recovery.

**No automated tests anywhere in the repository:**
- Problem: Neither `backend/package.json` nor `frontend/package.json` define a test script or reference a test framework/runner. No `*.test.*` or `*.spec.*` files exist under `backend/src` or `frontend/src`.
- Blocks: Safe refactoring, CI-gated merges, regression detection for auth/role logic.

**No CI pipeline:**
- Problem: No `.github/workflows` or other CI configuration exists in the repository.
- Blocks: Automated linting/testing/build verification on push or PR.

**No migration tooling:**
- Problem: Schema changes rely solely on `sequelize.sync()` (see Tech Debt above); no `sequelize-cli`, Umzug, or equivalent is configured.
- Blocks: Safe, reviewable, reversible schema evolution in production.

**No logging/monitoring/error tracking:**
- Problem: The only structured logging is Sequelize's built-in query logger, enabled only in development (`backend/src/config/database.js:8`). There is no error tracking (Sentry, etc.), no request logging middleware (e.g., `morgan`), and no metrics/observability integration anywhere in `backend/src`.
- Blocks: Diagnosing production incidents, tracking error rates, auditing auth attempts.

## Test Coverage Gaps

**Entire application (100% of code):**
- What's not tested: All GraphQL resolvers (`backend/src/resolvers/user.resolver.js`), auth utilities (`backend/src/utils/auth.js`), the Sequelize model/hooks (`backend/src/models/User.js`), and every React component/page under `frontend/src`.
- Files: All of `backend/src`, all of `frontend/src`.
- Risk: Auth, role-assignment (first user becomes ADMIN), password hashing, and password-reset logic are all security-critical and completely unverified by automated tests; regressions would only surface manually or in production.
- Priority: High — given the security-sensitive nature of the code (authentication, authorization, password handling), this should be addressed before any further feature work or a production launch.

---

*Concerns audit: 2026-07-11*
