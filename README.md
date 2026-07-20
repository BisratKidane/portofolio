# Portofolio

A full-stack Node.js 18 application with an Express, MySQL, Sequelize, and GraphQL backend plus a React, Axios, GraphQL, and MUI frontend.

## Features

- Node.js 18 across local scripts and Docker images.
- Express backend exposing GraphQL at `/graphql`.
- Sequelize models are collected and exported from `backend/src/models/index.js` as a single `models` object.
- GraphQL schemas live in `backend/src/schemas` and resolvers live in `backend/src/resolvers`.
- User registration, login, logout, password reset token generation, and password reset.
- Role-based access with `ADMIN` and `USER` roles.
  - The first registered account becomes `ADMIN`.
  - Later registered accounts become ordinary `USER` accounts.
  - Admins can see system users on the dashboard; ordinary users only see their own dashboard.
- React Router protected dashboard route.
- MUI components for the UI.
- Frontend GraphQL requests are centralized in `frontend/src/api/graphqlClient.js` and made through Axios. The browser calls `/graphql` by default so Vite can proxy requests to the correct backend in npm, local Docker, and remote Docker environments.

## Requirements

- Node.js 18.x
- npm 9+
- MySQL 8+ for non-Docker local development
- Docker and Docker Compose for container deployments

If you use `nvm`, run:

```bash
nvm use
```

## Environment files

Environment files are in the `env` folder:

- `env/local.env` - local npm defaults for `npm start` and `npm run dev`; it also tells Docker Compose to load `env/local.container.env` for services.
- `env/local.container.env` - local Docker Compose service defaults where the database and API hosts use Compose service names.
- `env/remote.env` - remote Docker Compose template. Replace passwords, `JWT_SECRET`, `CLIENT_URL`, `CLIENT_ORIGINS`, and public API settings before using it in production.

The same code runs in local npm, local Docker, and remote Docker environments. Change the environment file or Docker Compose command; do not change application code. For local browser usage, keep `VITE_API_URL=/graphql` so requests go through the Vite proxy; set `VITE_PROXY_TARGET` to the backend location (`http://localhost:4000` for npm, `http://backend:4000` for Compose).

## Install dependencies

```bash
npm install
```

## Run locally with npm

1. Start or create a local MySQL database matching `env/local.env`:

   ```bash
   docker compose --env-file env/local.env up -d mysql
   ```

   You can also use any MySQL server if it has the database, user, and password from `env/local.env`.

2. Start the backend and frontend together:

   ```bash
   npm run dev
   ```

   Or run the non-watch start command:

   ```bash
   npm start
   ```

3. Open the app:

   - Frontend: <http://localhost:5173>
   - Frontend API calls: `/graphql` proxied to <http://localhost:4000/graphql>
   - Direct GraphQL endpoint: <http://localhost:4000/graphql>
   - Backend health check: <http://localhost:4000/health>

## Run locally with Docker Compose

Use the local environment file and build all services:

```bash
npm run docker:local
```

Equivalent direct Docker Compose command:

```bash
docker compose --env-file env/local.env up --build
```

Docker Compose starts:

- MySQL on port `3306`
- Backend on port `4000`
- Frontend on port `5173`

## Deploy remotely with Docker Compose

1. Copy the repository to the server.
2. Edit `env/remote.env` and replace every placeholder secret or URL:
   - `CLIENT_URL`
   - `CLIENT_ORIGINS`
   - `VITE_API_URL`
   - `JWT_SECRET`
   - `DB_PASSWORD`
   - `MYSQL_PASSWORD`
   - `MYSQL_ROOT_PASSWORD`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (see [Email configuration](#email-configuration))
3. Start the stack:

   ```bash
   npm run docker:remote
   ```

   Equivalent direct Docker Compose command:

   ```bash
   docker compose --env-file env/remote.env up --build -d
   ```

4. Put a reverse proxy such as Nginx, Caddy, or a load balancer in front of the frontend/backend as needed for HTTPS and your public domain.

## Troubleshooting registration network errors

If registration shows `Network Error`, the browser could not reach the GraphQL API. Check these items first:

1. The backend is running and <http://localhost:4000/health> returns `{ "status": "ok" }`.
2. `VITE_API_URL` is `/graphql` for local npm and Docker runs so the frontend uses the Vite proxy instead of making a cross-origin request.
3. `VITE_PROXY_TARGET` points to the backend from the frontend process:
   - `http://localhost:4000` for `npm run dev` or `npm start`
   - `http://backend:4000` inside Docker Compose
4. If you intentionally use a full API URL in the browser, add the frontend origin to `CLIENT_ORIGINS` so the backend CORS middleware allows it.

## Authentication workflow

1. Register the first account. It is automatically assigned the `ADMIN` role.
2. Register additional accounts. They are assigned the `USER` role.
3. Login stores a JWT in browser local storage.
4. The protected dashboard route sends the JWT in the `Authorization: Bearer <token>` header.
5. Logout clears the token from local storage and calls the backend logout mutation.
6. Password reset is email-based. `requestPasswordReset` never returns the reset token: it emails a single-use link to the account address and always responds with the same generic message, whether or not the account exists. The token is delivered only by email and expires after `RESET_TOKEN_EXPIRES_MINUTES`.

## Rate Limiting

The backend throttles brute-force and enumeration attempts against `login`, `register`, and `requestPasswordReset` on a per-client-IP basis:

| Mutation | Limit |
|---|---|
| `login` | 5 attempts / 15 minutes |
| `register` | 5 attempts / hour |
| `requestPasswordReset` | 5 attempts / hour |

`backend/src/config/rateLimits.js` is the single edit point for tuning these thresholds. A field left out of that map (e.g. `me`, `dashboard`, `logout`) is never throttled.

Counters are held in an in-memory, per-process store — they reset on every backend restart and are not shared across multiple backend instances. This is an accepted trade-off for this milestone's single-instance deployment, not a bug.

The backend sets `trust proxy = 1`, meaning it trusts exactly one reverse-proxy hop when deriving the client IP from `X-Forwarded-For`. It must only ever be deployed behind exactly one trusted reverse proxy (the Nginx/Caddy setup described above) — trusting more hops than actually exist would let a client forge its own apparent IP and evade the limiter entirely.

## Email configuration

The mailer only sends real email when `NODE_ENV=production`. In development and test it uses a no-op transport, so no SMTP configuration is needed and no mail leaves the machine — the reset link is logged to the console instead.

In production the backend **refuses to boot** unless `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are set. This is deliberate: a silently broken mailer would mean users can never recover their accounts.

| Variable | Required in production | Default | Notes |
|---|---|---|---|
| `SMTP_HOST` | yes | _(none)_ | Hostname of the SMTP relay. |
| `SMTP_PORT` | no | `587` | `587` uses enforced STARTTLS; `465` uses implicit TLS. Both are encrypted — the backend never sends over a cleartext session. |
| `SMTP_USER` | yes | _(none)_ | SMTP username. Many providers use a literal value such as `apikey`. |
| `SMTP_PASS` | yes | _(none)_ | SMTP password or API key. |
| `SMTP_FROM` | no | `no-reply@portfolio.local` | Sender address. Set this to an address on a domain you control, or your relay will reject the message or it will land in spam. |

`CLIENT_URL` is used to build the reset link (`${CLIENT_URL}/reset-password?token=...`), so it must be the public URL of the frontend in production.

The values committed in `env/remote.env` are placeholders. Replace them with real credentials on the server and never commit them.

## Useful scripts

```bash
npm run dev          # Run backend and frontend with env/local.env
npm start            # Run backend and frontend without nodemon
npm run build        # Build the React frontend
npm run docker:local # Build and run the local Docker stack
npm run docker:remote# Build and run the remote Docker stack in detached mode
```

## Continuous Integration

1. `.github/workflows/ci.yml` runs the root `npm test` command (the same command listed under "Useful scripts") on every `push` and every `pull_request`, with no branch filter.
2. A workflow file alone does not block a merge. GitHub Actions checks are purely informational until a branch protection rule marks one as required.
3. One-time setup to make the `test` job required:
   1. Push at least once so the `test` job has run and appears as a selectable check.
   2. In the GitHub repo, go to Settings -> Branches -> add or edit a branch protection rule.
   3. Enable "Require status checks to pass before merging" and select the `test` job.

## Manual Database Migrations

This project has no migration framework. `sequelize.sync()` creates tables for brand-new databases, but it never alters an existing table's columns. Any phase that adds a column to an already-provisioned database ships a hand-written SQL file under `backend/migrations/manual/` plus a documented boot-and-verify procedure — run the SQL by hand once, then confirm the backend boots cleanly against that database.

### Add passwordChangedAt to users (Phase 9 / SESS-01)

1. Apply the migration against your database, using the `DB_USER`/`DB_PASSWORD`/`DB_NAME` values from the active env file:

   ```bash
   docker compose --env-file env/local.env exec -T mysql mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < backend/migrations/manual/009-add-password-changed-at.sql
   ```

   Or run the equivalent statement with any MySQL client pointed at your `DB_HOST`/`DB_PORT`/`DB_NAME`.

2. Boot the backend against that same database (`npm run dev` or `npm start`) and confirm:
   - No `Unknown column 'passwordChangedAt' in 'field list'` error appears anywhere in the startup/request logs.
   - `curl http://localhost:4000/health` returns `{"status":"ok"}`.
   - An existing, pre-migration user can still log in and query `me` — that user's `passwordChangedAt` is `NULL` (no backfill), so their existing token stays valid.

3. Reset that same user's password through the app, then immediately log in again with the new password, and confirm the new session authenticates successfully.

## Project structure

```text
backend/
  src/
    config/      # Environment and Sequelize setup
    models/      # Sequelize models and exported models object
    resolvers/   # GraphQL resolvers
    schemas/     # GraphQL schemas/type definitions
    utils/       # Authentication helpers
frontend/
  src/
    api/         # Central Axios GraphQL client
    components/  # Layout/protected route components
    context/     # Authentication context
    pages/       # Login/register/password reset/dashboard pages
env/             # Local and remote environment files
```
