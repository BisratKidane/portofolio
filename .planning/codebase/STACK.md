# Technology Stack

**Analysis Date:** 2026-07-11

## Languages

**Primary:**
- JavaScript (ES Modules) - Used across both `backend` and `frontend` workspaces. Backend uses `"type": "module"` (`backend/package.json`); frontend is JSX-flavored JavaScript compiled by Vite/React plugin.

**Secondary:**
- JSX - React component files under `frontend/src/**/*.jsx`.

## Runtime

**Environment:**
- Node.js 18.x - pinned via `.nvmrc` (`18`) and `"engines": { "node": "18.x" }` in `package.json`, `backend/package.json`, and `frontend/package.json`.
- Docker images use `node:18-alpine` (`backend/Dockerfile`, `frontend/Dockerfile`).

**Package Manager:**
- npm with npm workspaces - root `package.json` declares `"workspaces": ["backend", "frontend"]`.
- Lockfile: present - `package-lock.json` at repo root (single lockfile shared across workspaces).

## Frameworks

**Core (Backend):**
- Express 4.21 (`express`) - HTTP server, mounts GraphQL middleware. Entry point: `backend/src/server.js`.
- Apollo Server 4.11 (`@apollo/server`) - GraphQL execution engine, integrated via `@apollo/server/express4` `expressMiddleware`.
- GraphQL 16.10 (`graphql`) - Schema/query language runtime underlying Apollo Server.
- Sequelize 6.37 (`sequelize`) with `mysql2` 3.11 driver - ORM/ODM for MySQL access. Config: `backend/src/config/database.js`.

**Core (Frontend):**
- React 18.3 (`react`, `react-dom`) - UI library.
- React Router 6.28 (`react-router-dom`) - Client-side routing, including protected routes (`frontend/src/components/ProtectedRoute.jsx`).
- MUI 6.3 (`@mui/material`, `@mui/icons-material`) with Emotion 11.14 (`@emotion/react`, `@emotion/styled`) - Component library and CSS-in-JS styling engine.
- Axios 1.7 (`axios`) - HTTP client for GraphQL requests, centralized in `frontend/src/api/graphqlClient.js`.

**Testing:**
- None detected - no test framework, test config, or test files found in either workspace (`backend/package.json` and `frontend/package.json` have no test dependencies; no `*.test.js`/`*.spec.js` files under `backend/src` or `frontend/src`).

**Build/Dev:**
- Vite 6.0 (`vite`, `@vitejs/plugin-react` 4.3) - Frontend dev server and production bundler. Config: `frontend/vite.config.js`.
- Nodemon 3.1 (`nodemon`) - Backend dev auto-reload, invoked via `backend/package.json` `dev` script.
- Concurrently 8.2 (`concurrently`) + dotenv-cli 7.4 (`dotenv-cli`) - Root-level orchestration to run backend and frontend together with a shared env file (root `package.json` `dev`/`start` scripts).

## Key Dependencies

**Critical:**
- `jsonwebtoken` 9.0 - Issues and verifies JWTs for authentication (`backend/src/utils/auth.js`).
- `bcryptjs` 2.4 - Password hashing (`backend/src/models/User.js`, hashed on `beforeCreate`/`beforeUpdate` hooks).
- `uuid` 11.0 - Declared dependency in `backend/package.json` (no direct usage found in current resolver/model code beyond dependency declaration).
- `cors` 2.8 - CORS middleware restricting allowed origins to `CLIENT_ORIGINS`/`CLIENT_URL` (`backend/src/server.js`).

**Infrastructure:**
- `dotenv` 16.4 - Loads environment variables from the `env/` folder at backend startup (`backend/src/config/env.js`).
- `mysql2` 3.11 - MySQL driver used by Sequelize's `mysql` dialect.

## Configuration

**Environment:**
- Environment files live in `env/` at repo root, not per-workspace:
  - `env/local.env` - defaults for `npm run dev` / `npm start` (non-Docker), also tells Docker Compose which container env file to use via `COMPOSE_ENV_FILE`.
  - `env/local.container.env` - Docker Compose service env (service-name hosts like `mysql`, `backend`).
  - `env/remote.env` - template for remote/production Docker Compose deployment; secrets and URLs must be replaced before use.
- Backend loads env via `dotenv.config({ path: process.env.ENV_FILE || <repo>/env/local.env })` in `backend/src/config/env.js`, with an `ENV_FILE` override hook.
- Frontend env vars (Vite-prefixed, e.g. `VITE_API_URL`, `VITE_PROXY_TARGET`) are injected at container/process level and read via `import.meta.env` (`frontend/src/api/graphqlClient.js`) and `process.env` in `frontend/vite.config.js`.
- Key variable names (values intentionally not read - see forbidden files policy): `NODE_ENV`, `PORT`, `CLIENT_PORT`, `CLIENT_URL`, `CLIENT_ORIGINS`, `VITE_API_URL`, `VITE_PROXY_TARGET`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESET_TOKEN_EXPIRES_MINUTES`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`.

**Build:**
- `frontend/vite.config.js` - Vite config with React plugin and a dev-server proxy that forwards `/graphql` to `VITE_PROXY_TARGET` (or `BACKEND_URL`, or `http://localhost:4000` fallback).
- No `tsconfig.json`, no ESLint/Prettier config files detected in the repo.
- `docker-compose.yml` (repo root) - defines three services: `mysql`, `backend`, `frontend`; builds backend/frontend from their respective `Dockerfile`s using the repo root as build context.
- `backend/Dockerfile` / `frontend/Dockerfile` - each installs only its own workspace (`npm install --workspace <name>`) from `node:18-alpine`.

## Platform Requirements

**Development:**
- Node.js 18.x, npm 9+ (per `README.md`).
- MySQL 8+ for non-Docker local development, or Docker Compose to run the bundled `mysql:8.4` service.
- `nvm use` supported via `.nvmrc`.

**Production:**
- Docker Compose deployment (`npm run docker:remote`, using `env/remote.env`) - `mysql`, `backend`, `frontend` containers.
- No CI/CD pipeline files, no cloud-specific IaC (e.g., Terraform, k8s manifests) detected.
- Deployment expects a reverse proxy (Nginx/Caddy) in front of frontend/backend for HTTPS, per `README.md` troubleshooting/deployment section.

---

*Stack analysis: 2026-07-11*
