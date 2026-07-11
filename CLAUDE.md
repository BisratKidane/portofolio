<!-- GSD:project-start source:PROJECT.md -->
## Project

**Portfolio Auth App**

A full-stack authentication application built as a portfolio piece: a React + MUI single-page frontend talking to an Express + Apollo GraphQL backend, with user accounts persisted in MySQL via Sequelize. It currently ships working registration, JWT login, protected routes, and a dashboard. This milestone adds an automated testing foundation across the whole stack so the app can keep growing without silently breaking authentication.

**Core Value:** Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.

### Constraints

- **Tech stack**: JavaScript ES Modules, Node 18.x, npm workspaces — tests must run under the existing ESM + workspace setup without a bundler rewrite.
- **Test tooling (proposed)**: Vitest as the single runner across backend and frontend; React Testing Library + jsdom for the frontend; resolver integration via Apollo `executeOperation`. To be confirmed/version-pinned in the research phase.
- **Database**: backend integration tests need an isolated test database (or in-memory/containerized MySQL) so they don't touch dev data.
- **CI**: GitHub Actions, running the workspace test suite on push/PR.
- **Non-destructive**: this milestone must not change application runtime behavior — it only adds tests, tooling, and CI config.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ES Modules) - Used across both `backend` and `frontend` workspaces. Backend uses `"type": "module"` (`backend/package.json`); frontend is JSX-flavored JavaScript compiled by Vite/React plugin.
- JSX - React component files under `frontend/src/**/*.jsx`.
## Runtime
- Node.js 18.x - pinned via `.nvmrc` (`18`) and `"engines": { "node": "18.x" }` in `package.json`, `backend/package.json`, and `frontend/package.json`.
- Docker images use `node:18-alpine` (`backend/Dockerfile`, `frontend/Dockerfile`).
- npm with npm workspaces - root `package.json` declares `"workspaces": ["backend", "frontend"]`.
- Lockfile: present - `package-lock.json` at repo root (single lockfile shared across workspaces).
## Frameworks
- Express 4.21 (`express`) - HTTP server, mounts GraphQL middleware. Entry point: `backend/src/server.js`.
- Apollo Server 4.11 (`@apollo/server`) - GraphQL execution engine, integrated via `@apollo/server/express4` `expressMiddleware`.
- GraphQL 16.10 (`graphql`) - Schema/query language runtime underlying Apollo Server.
- Sequelize 6.37 (`sequelize`) with `mysql2` 3.11 driver - ORM/ODM for MySQL access. Config: `backend/src/config/database.js`.
- React 18.3 (`react`, `react-dom`) - UI library.
- React Router 6.28 (`react-router-dom`) - Client-side routing, including protected routes (`frontend/src/components/ProtectedRoute.jsx`).
- MUI 6.3 (`@mui/material`, `@mui/icons-material`) with Emotion 11.14 (`@emotion/react`, `@emotion/styled`) - Component library and CSS-in-JS styling engine.
- Axios 1.7 (`axios`) - HTTP client for GraphQL requests, centralized in `frontend/src/api/graphqlClient.js`.
- None detected - no test framework, test config, or test files found in either workspace (`backend/package.json` and `frontend/package.json` have no test dependencies; no `*.test.js`/`*.spec.js` files under `backend/src` or `frontend/src`).
- Vite 6.0 (`vite`, `@vitejs/plugin-react` 4.3) - Frontend dev server and production bundler. Config: `frontend/vite.config.js`.
- Nodemon 3.1 (`nodemon`) - Backend dev auto-reload, invoked via `backend/package.json` `dev` script.
- Concurrently 8.2 (`concurrently`) + dotenv-cli 7.4 (`dotenv-cli`) - Root-level orchestration to run backend and frontend together with a shared env file (root `package.json` `dev`/`start` scripts).
## Key Dependencies
- `jsonwebtoken` 9.0 - Issues and verifies JWTs for authentication (`backend/src/utils/auth.js`).
- `bcryptjs` 2.4 - Password hashing (`backend/src/models/User.js`, hashed on `beforeCreate`/`beforeUpdate` hooks).
- `uuid` 11.0 - Declared dependency in `backend/package.json` (no direct usage found in current resolver/model code beyond dependency declaration).
- `cors` 2.8 - CORS middleware restricting allowed origins to `CLIENT_ORIGINS`/`CLIENT_URL` (`backend/src/server.js`).
- `dotenv` 16.4 - Loads environment variables from the `env/` folder at backend startup (`backend/src/config/env.js`).
- `mysql2` 3.11 - MySQL driver used by Sequelize's `mysql` dialect.
## Configuration
- Environment files live in `env/` at repo root, not per-workspace:
- Backend loads env via `dotenv.config({ path: process.env.ENV_FILE || <repo>/env/local.env })` in `backend/src/config/env.js`, with an `ENV_FILE` override hook.
- Frontend env vars (Vite-prefixed, e.g. `VITE_API_URL`, `VITE_PROXY_TARGET`) are injected at container/process level and read via `import.meta.env` (`frontend/src/api/graphqlClient.js`) and `process.env` in `frontend/vite.config.js`.
- Key variable names (values intentionally not read - see forbidden files policy): `NODE_ENV`, `PORT`, `CLIENT_PORT`, `CLIENT_URL`, `CLIENT_ORIGINS`, `VITE_API_URL`, `VITE_PROXY_TARGET`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESET_TOKEN_EXPIRES_MINUTES`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`.
- `frontend/vite.config.js` - Vite config with React plugin and a dev-server proxy that forwards `/graphql` to `VITE_PROXY_TARGET` (or `BACKEND_URL`, or `http://localhost:4000` fallback).
- No `tsconfig.json`, no ESLint/Prettier config files detected in the repo.
- `docker-compose.yml` (repo root) - defines three services: `mysql`, `backend`, `frontend`; builds backend/frontend from their respective `Dockerfile`s using the repo root as build context.
- `backend/Dockerfile` / `frontend/Dockerfile` - each installs only its own workspace (`npm install --workspace <name>`) from `node:18-alpine`.
## Platform Requirements
- Node.js 18.x, npm 9+ (per `README.md`).
- MySQL 8+ for non-Docker local development, or Docker Compose to run the bundled `mysql:8.4` service.
- `nvm use` supported via `.nvmrc`.
- Docker Compose deployment (`npm run docker:remote`, using `env/remote.env`) - `mysql`, `backend`, `frontend` containers.
- No CI/CD pipeline files, no cloud-specific IaC (e.g., Terraform, k8s manifests) detected.
- Deployment expects a reverse proxy (Nginx/Caddy) in front of frontend/backend for HTTPS, per `README.md` troubleshooting/deployment section.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Backend: lowerCamelCase or dotted-role filenames, e.g. `user.resolver.js`, `user.schema.js`, `auth.js`, `env.js`, `database.js`. Model class files are PascalCase matching the exported class: `User.js`.
- Frontend: React components and pages use PascalCase `.jsx` filenames matching the exported component: `Login.jsx`, `Dashboard.jsx`, `ProtectedRoute.jsx`, `AppLayout.jsx`. Non-component modules use camelCase `.js`/`.jsx`: `graphqlClient.js`, `theme.js`, `AuthContext.jsx` (context is capitalized because it exports a component-like provider).
- Index/barrel files named `index.js` aggregate a directory's exports (`backend/src/models/index.js`, `backend/src/schemas/index.js`, `backend/src/resolvers/index.js`).
- camelCase verbs describing action: `signToken`, `getUserFromRequest`, `requireAuth`, `requireAdmin`, `createResetToken`, `resetTokenExpiry`, `serializeUser`, `normalizeGraphqlUrl`, `graphqlRequest`.
- React components are top-level `export default function ComponentName()` in PascalCase (`frontend/src/pages/Login.jsx:7`, `frontend/src/components/ProtectedRoute.jsx:5`).
- Event handlers inside components use `handle` prefix: `handleSubmit` (`frontend/src/pages/Login.jsx:14`).
- camelCase throughout: `existingUser`, `userCount`, `resetToken`, `clientOrigins`, `graphqlClient`.
- GraphQL query/mutation string constants use SCREAMING_SNAKE_CASE with a `_QUERY`/`_MUTATION` suffix: `ME_QUERY`, `LOGIN_MUTATION`, `REGISTER_MUTATION`, `LOGOUT_MUTATION` (`frontend/src/context/AuthContext.jsx:6-24`).
- GraphQL resolver args destructure with leading underscore for unused positional params: `(_parent, _args, { user })` (`backend/src/resolvers/user.resolver.js:9`), `(_req, res)` for unused Express request (`backend/src/server.js:13`).
- No TypeScript in this codebase — plain JS/JSX with ES modules (`"type": "module"` in both `backend/package.json` and `frontend/package.json`).
- Sequelize model fields declared via `DataTypes` object literals, not classes/interfaces (`backend/src/models/User.js:11-45`).
- GraphQL schema types are the closest thing to a type system; defined as tagged template literals with `#graphql` pragma comment (`backend/src/schemas/user.schema.js:1`).
## Code Style
- No Prettier or `.prettierrc` config present in the repo.
- Observed style: 2-space indentation, single quotes for strings, no semicolons omitted (semicolons ARE used), trailing commas avoided in single-line objects.
- Object shorthand used consistently: `{ models, user: await getUserFromRequest(req, models) }` (`backend/src/server.js:35-36`).
- No ESLint config (`.eslintrc*`, `eslint.config.*`) found anywhere in the repo.
- No lint script defined in `package.json` at root, backend, or frontend.
- Backend has a `check` script (`backend/package.json:13`) that runs `node --check src/server.js` — a syntax-only sanity check, not a linter.
## Import Organization
- None configured. All local imports use explicit relative paths with file extensions, e.g. `'../context/AuthContext.jsx'`, `'./config/env.js'`. `vite.config.js` (`frontend/vite.config.js`) defines no `resolve.alias`.
## Error Handling
- Throw plain `Error` objects with user-facing messages; Apollo Server surfaces these as GraphQL errors: `throw new Error('A user with this email already exists.')` (`backend/src/resolvers/user.resolver.js:27`), `throw new Error('Invalid email or password.')` (`:41`).
- Auth guard functions (`requireAuth`, `requireAdmin` in `backend/src/utils/auth.js:22-29`) throw synchronously and are called at the top of resolver bodies before any other logic.
- Token verification failures are swallowed silently and normalized to `null`: `try { ... } catch { return null; }` (`backend/src/utils/auth.js:14-19`) — auth failures degrade to "not logged in" rather than propagating errors.
- CORS violations reject via callback error: `return callback(new Error(...))` (`backend/src/server.js:20`).
- Async handlers wrap calls in `try/catch/finally`, storing the error message in local component state for display via MUI `<Alert>`: see `handleSubmit` in `frontend/src/pages/Login.jsx:14-26`.
- `finally` blocks always reset loading state, regardless of success or failure.
- `graphqlRequest` (`frontend/src/api/graphqlClient.js:23-36`) centralizes GraphQL error extraction: checks `response.data.errors` and joins messages into a single `Error`; also special-cases network failures with a more actionable message.
- `AuthContext`'s `loadUser` effect catches token-verification failures silently and clears `localStorage`, without surfacing an error to the user (`frontend/src/context/AuthContext.jsx:36-43`).
## Logging
- Backend startup logs a single line on successful boot: `console.log(\`Backend ready at http://localhost:${env.port}/graphql\`)` (`backend/src/server.js:42`).
- Sequelize query logging is conditionally enabled only in development: `logging: env.nodeEnv === 'development' ? console.log : false` (`backend/src/config/database.js:8`).
- No structured logging, no log levels, no request logging middleware.
## Comments
- Minimal inline comments; code favors self-explanatory naming over comments. No comment blocks found in any reviewed source file.
- GraphQL schema uses the `#graphql` pragma comment for tooling/syntax highlighting only (`backend/src/schemas/user.schema.js:1`).
- Not used anywhere in the codebase.
## Function Design
- GraphQL resolvers use the standard 4-arg signature `(parent, args, context, info)`, destructuring only what's needed and prefixing unused params with `_`: `(_parent, { name, email, password }, { models })` (`backend/src/resolvers/user.resolver.js:25`).
- React components take a single `props` object, destructured in the function signature: `function ProtectedRoute({ allowedRoles })` (`frontend/src/components/ProtectedRoute.jsx:5`).
- Resolvers return plain objects/values matching GraphQL schema shapes directly (no wrapping/envelope pattern) — e.g. `return { token: signToken(user), user }` (`backend/src/resolvers/user.resolver.js:37`).
- Guard clauses return early: `if (!token) return null;` (`backend/src/utils/auth.js:12`), `if (!user) return <Navigate to="/login" replace />;` (`frontend/src/components/ProtectedRoute.jsx:16`).
## Module Design
- Named exports are the default convention for utilities and config (`export function signToken`, `export const env`, `export const models`).
- React components/pages use `export default function ComponentName()`.
- Backend aggregates domain-specific modules into barrel `index.js` files that merge everything into one object: `backend/src/resolvers/index.js` merges `userResolvers` into a combined `resolvers` export; `backend/src/schemas/index.js` likely concatenates `userTypeDefs` into `typeDefs` (same pattern as `backend/src/models/index.js:6-8`).
- Used on the backend for `models/`, `schemas/`, `resolvers/` — single feature module (`user`) today, but the barrel pattern anticipates multiple feature modules being merged (e.g. adding a `post.resolver.js` alongside `user.resolver.js` and merging both in `resolvers/index.js`).
- Not used on the frontend; components/pages are imported individually and directly in `frontend/src/App.jsx:2-8`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| Express app | HTTP server, CORS, health check, mounts GraphQL middleware | `backend/src/server.js` |
| Apollo Server | GraphQL execution, schema/resolver binding | `backend/src/server.js` |
| Env config | Loads `.env` file, exposes typed config object | `backend/src/config/env.js` |
| Sequelize instance | DB connection config (MySQL dialect) | `backend/src/config/database.js` |
| User model | Schema, password hashing hooks, `validatePassword` | `backend/src/models/User.js` |
| Models aggregator | Wires model inits to Sequelize instance, `initializeDatabase()` | `backend/src/models/index.js` |
| GraphQL schema (SDL) | Type defs for User, AuthPayload, Dashboard, Query/Mutation | `backend/src/schemas/user.schema.js` |
| Schema aggregator | Combines all typeDefs arrays | `backend/src/schemas/index.js` |
| Resolvers | Query/Mutation implementations (auth, dashboard, users) | `backend/src/resolvers/user.resolver.js` |
| Resolver aggregator | Combines all resolver maps | `backend/src/resolvers/index.js` |
| Auth utils | JWT sign/verify, `getUserFromRequest`, role guards, reset tokens | `backend/src/utils/auth.js` |
| React entry | Mounts app with Router, Theme, AuthProvider | `frontend/src/main.jsx` |
| Route table | Declares all routes and layout/guard nesting | `frontend/src/App.jsx` |
| GraphQL client | Axios instance + `graphqlRequest()` helper, attaches JWT header | `frontend/src/api/graphqlClient.js` |
| Auth context | Global auth state (user, loading), login/register/logout | `frontend/src/context/AuthContext.jsx` |
| AppLayout | Top nav bar + outlet, shows user/login state | `frontend/src/components/AppLayout.jsx` |
| ProtectedRoute | Route guard redirecting unauthenticated users | `frontend/src/components/ProtectedRoute.jsx` |
| AuthShell | Shared card wrapper for auth pages | `frontend/src/components/AuthShell.jsx` |
| Pages | Login, Register, ForgotPassword, ResetPassword, Dashboard | `frontend/src/pages/*.jsx` |
## Pattern Overview
- Single GraphQL endpoint (`/graphql`) for all data operations; no separate REST controllers.
- Stateless JWT auth: token stored in browser `localStorage`, sent as `Authorization: Bearer` header, verified per-request in the Apollo `context` function (`backend/src/server.js:34-37`).
- "Aggregator" module pattern for schemas/resolvers/models: each domain (currently only `user`) exports its own schema/resolver/model, aggregated in an `index.js` barrel file so Apollo receives arrays (`backend/src/schemas/index.js`, `backend/src/resolvers/index.js`).
- Frontend has no GraphQL client library (no Apollo Client/urql) — plain axios POST with raw GraphQL query strings defined inline in components/context (`frontend/src/context/AuthContext.jsx:6-24`, `frontend/src/pages/Dashboard.jsx:19-27`).
- First registered user automatically becomes `ADMIN`; all subsequent registrations are `USER` (`backend/src/resolvers/user.resolver.js:29-35`).
## Layers
- Purpose: Renders UI, manages client-side auth state, calls GraphQL API
- Location: `frontend/src/`
- Contains: React components, pages, context, API client, theme
- Depends on: Backend GraphQL endpoint (via Vite dev proxy or `VITE_API_URL`)
- Used by: End users via browser
- Purpose: HTTP entry point, CORS enforcement, GraphQL request handling, auth context injection
- Location: `backend/src/server.js`
- Contains: Express app setup, Apollo Server instantiation, middleware wiring
- Depends on: schemas, resolvers, models, auth utils, env config
- Used by: Frontend `graphqlClient.js`
- Purpose: Defines the API contract (SDL) and implements query/mutation logic
- Location: `backend/src/schemas/`, `backend/src/resolvers/`
- Contains: Type definitions, resolver functions, business logic (auth checks, uniqueness checks)
- Depends on: models (data access), utils/auth.js (token/role logic)
- Used by: Apollo Server (`backend/src/server.js`)
- Purpose: ORM definitions, DB hooks (password hashing, email normalization)
- Location: `backend/src/models/`
- Contains: Sequelize model classes/init functions, model aggregation, `initializeDatabase()`
- Depends on: `backend/src/config/database.js` (Sequelize instance)
- Used by: Resolvers
- Purpose: Centralizes environment-driven config (ports, secrets, DB creds, CORS origins)
- Location: `backend/src/config/`
- Contains: `env.js` (dotenv loader + config object), `database.js` (Sequelize connection)
- Depends on: `env/*.env` files (see STRUCTURE.md)
- Used by: server.js, models, auth utils
## Data Flow
### Primary Request Path (authenticated query, e.g. Dashboard)
### Registration/Login Flow
### Password Reset Flow
- Frontend: single React Context (`AuthContext`) holds `user` and `loading`; no external state library (no Redux/Zustand). Auth token is the source of truth in `localStorage`; `user` object is re-derived by calling the `me` query on app load (`frontend/src/context/AuthContext.jsx:30-46`).
- Backend: stateless — no server-side sessions; all identity carried in the JWT per-request.
## Key Abstractions
- Purpose: Single injection point giving every resolver access to the DB models and the resolved authenticated user
- Examples: `backend/src/server.js:34-37`, consumed throughout `backend/src/resolvers/user.resolver.js`
- Pattern: Apollo Server `context` async function, computed per-request
- Purpose: Combine per-domain schema/resolver/model modules into arrays/objects Apollo and Sequelize expect
- Examples: `backend/src/schemas/index.js`, `backend/src/resolvers/index.js`, `backend/src/models/index.js`
- Pattern: adding a new domain (e.g. "post") means creating `post.schema.js`/`post.resolver.js`/model file, then appending to these barrels
- Purpose: Central place for auth state and mutations across the whole frontend
- Examples: `frontend/src/context/AuthContext.jsx`, consumed by `ProtectedRoute.jsx`, `AppLayout.jsx`, `Login.jsx`, `Register.jsx`
- Pattern: React Context + custom hook, throws if used outside provider (`frontend/src/context/AuthContext.jsx:76-78`)
- Purpose: Shared visual chrome (branded card) for all auth-related pages
- Examples: `frontend/src/components/AuthShell.jsx`, used by `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- Pattern: Presentational wrapper component accepting `eyebrow`/`title`/`subtitle`/`footer`/`children` props
## Entry Points
- Location: `backend/src/server.js`
- Triggers: `npm start`/`npm run dev` (nodemon), or Docker container CMD (`backend/Dockerfile:10`)
- Responsibilities: Boots Express, starts Apollo, initializes DB connection, mounts `/graphql` and `/health`
- Location: `frontend/src/main.jsx`
- Triggers: `npm run dev`/`npm start` (Vite dev server), or built and served via Docker (`frontend/Dockerfile`)
- Responsibilities: Mounts React tree with Router, MUI Theme, AuthProvider
- Location: `docker-compose.yml`
- Triggers: `npm run docker:local` / `npm run docker:remote`
- Responsibilities: Orchestrates `mysql`, `backend`, `frontend` services with env-file-driven config
## Architectural Constraints
- **Threading:** Single-threaded Node.js event loop on both frontend (Vite dev server) and backend (Express); no worker threads or clustering configured.
- **Global state:** Module-level singletons: `sequelize` instance (`backend/src/config/database.js:4-9`), `models` object (`backend/src/models/index.js:6-8`), and the Apollo Server instance (`backend/src/server.js:25`). React side: `AuthContext` is a single global context provider wrapping the whole app (`frontend/src/main.jsx:14-16`).
- **Circular imports:** None detected — dependency direction flows cleanly config → models → resolvers → server, and schemas/resolvers only depend on utils/models.
- **No domain separation beyond `user`:** Every schema/resolver/model file is currently user-specific; the aggregator pattern anticipates more domains but only one exists today.
- **Single GraphQL endpoint, no query complexity/depth limiting:** All resolvers execute directly against the DB with no batching (no DataLoader), so N+1 risk exists once cross-entity resolvers are added.
## Anti-Patterns
### Reset token returned directly in API response
### Auth guards implemented as thrown-error functions rather than middleware
## Error Handling
- Backend: `throw new Error('...')` inside resolvers for validation/auth failures (e.g. `backend/src/resolvers/user.resolver.js:27,41,66-67`); `getUserFromRequest` swallows JWT verification errors and returns `null` rather than throwing (`backend/src/utils/auth.js:14-19`).
- Frontend: `try/catch` around `graphqlRequest` calls in page components, error message shown via MUI `<Alert severity="error">` (e.g. `frontend/src/pages/Login.jsx:21-22,44`); `graphqlClient.js` also special-cases network failures into a more descriptive message (`frontend/src/api/graphqlClient.js:30-34`).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
