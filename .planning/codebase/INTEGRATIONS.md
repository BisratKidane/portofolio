# External Integrations

**Analysis Date:** 2026-07-11

## APIs & External Services

**None detected.** No third-party SaaS APIs (payment, email, SMS, analytics, etc.) are integrated. The only network-facing service the backend talks to is its own MySQL database. The password reset flow (`backend/src/resolvers/user.resolver.js` `requestPasswordReset`) generates a reset token and returns it directly in the GraphQL response instead of sending it via an email provider — `README.md` explicitly flags this: "Password reset currently returns a development reset token from the GraphQL mutation so the flow works without email infrastructure. For production, connect `requestPasswordReset` to an email provider and avoid returning the token to the browser."

## Data Storage

**Databases:**
- MySQL 8 (containerized as `mysql:8.4` in `docker-compose.yml`; MySQL 8+ required for non-Docker dev per `README.md`)
  - Connection: configured via `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` env vars, consumed in `backend/src/config/env.js` and passed to Sequelize in `backend/src/config/database.js`
  - Client/ORM: Sequelize (`sequelize` package) with the `mysql2` driver, dialect `'mysql'`
  - Schema management: no migrations directory found; schema sync happens at runtime via `sequelize.sync()` in `backend/src/models/index.js` (`initializeDatabase`)
  - Single model currently defined: `User` (`backend/src/models/User.js`), table `users`

**File Storage:**
- Local filesystem only - no object storage (S3, GCS, etc.) integration detected. Frontend static build output goes to `frontend/dist/`.

**Caching:**
- None detected - no Redis, Memcached, or in-process cache library present in either `package.json`.

## Authentication & Identity

**Auth Provider:**
- Custom (self-hosted, no third-party auth/IdP)
  - Implementation: JWT-based session tokens signed/verified with `jsonwebtoken` in `backend/src/utils/auth.js` (`signToken`, `getUserFromRequest`)
  - Secret: `JWT_SECRET` env var (falls back to insecure default `'change-me'` in `backend/src/config/env.js` if unset — must be overridden for any real deployment)
  - Expiry: `JWT_EXPIRES_IN` env var (default `'1d'`)
  - Password hashing: `bcryptjs`, cost factor 12, applied via Sequelize `beforeCreate`/`beforeUpdate` hooks in `backend/src/models/User.js`
  - Token transport: `Authorization: Bearer <token>` header, read server-side in `getUserFromRequest`; stored client-side in `localStorage` under key `authToken` and attached to every request via an Axios request interceptor in `frontend/src/api/graphqlClient.js`
  - Authorization: role-based (`ADMIN` / `USER` enum on the `User` model); `requireAuth`/`requireAdmin` guards in `backend/src/utils/auth.js`, enforced per-resolver in `backend/src/resolvers/user.resolver.js` (e.g., `dashboard`, `users` queries)
  - First registered account is auto-promoted to `ADMIN` (`backend/src/resolvers/user.resolver.js` `register` mutation, based on `models.User.count() === 0`)
  - Password reset tokens: generated with `crypto.randomBytes(32)` (`createResetToken` in `backend/src/utils/auth.js`), stored on the user row (`resetPasswordToken`, `resetPasswordExpiresAt`), expiry controlled by `RESET_TOKEN_EXPIRES_MINUTES` env var (default 30 minutes)

## Monitoring & Observability

**Error Tracking:**
- None - no Sentry, Bugsnag, or similar error-tracking SDK detected in dependencies.

**Logs:**
- `console.log`/`console.error` only. Sequelize query logging is conditionally enabled in development (`backend/src/config/database.js`: `logging: env.nodeEnv === 'development' ? console.log : false`). No structured logging library (Winston, Pino) present.

## CI/CD & Deployment

**Hosting:**
- Self-managed via Docker Compose (`docker-compose.yml`) - three services: `mysql`, `backend`, `frontend`, each with its own port mapping (`DB_PORT`/3306, `PORT`/4000, `CLIENT_PORT`/5173 by default).
- `README.md` recommends placing a reverse proxy (Nginx, Caddy, or a load balancer) in front of frontend/backend for HTTPS in remote deployments; no reverse proxy config file is checked into the repo.

**CI Pipeline:**
- None detected - no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or similar CI configuration found in the repo.

## Environment Configuration

**Required env vars (names only; values not read per security policy):**
- App/runtime: `NODE_ENV`, `PORT`, `CLIENT_PORT`
- CORS/client: `CLIENT_URL`, `CLIENT_ORIGINS`
- Frontend/Vite: `VITE_API_URL`, `VITE_PROXY_TARGET`
- Auth: `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESET_TOKEN_EXPIRES_MINUTES`
- Database (app): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Database (MySQL container): `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`

**Secrets location:**
- Plaintext env files under `env/` at repo root: `env/local.env`, `env/local.container.env`, `env/remote.env`. These are tracked as ordinary files in this checkout (contents not inspected here per forbidden-files policy); `README.md` instructs replacing all placeholder secrets in `env/remote.env` (`JWT_SECRET`, `DB_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `CLIENT_URL`, `CLIENT_ORIGINS`, `VITE_API_URL`) before production use. No secrets manager (Vault, AWS Secrets Manager, Doppler) integration detected.

## Webhooks & Callbacks

**Incoming:**
- None - the only exposed HTTP endpoints are `/health` (plain JSON status check) and `/graphql` (GraphQL API), both defined in `backend/src/server.js`. No webhook receiver routes found.

**Outgoing:**
- None - no outbound webhook dispatch or third-party callback logic detected anywhere in `backend/src`.

---

*Integration audit: 2026-07-11*
