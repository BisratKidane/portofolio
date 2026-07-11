<!-- refreshed: 2026-07-11 -->
# Architecture

**Analysis Date:** 2026-07-11

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React SPA)                    │
├──────────────────┬──────────────────┬───────────────────────┤
│   Pages          │   Components     │    Context/API         │
│  `frontend/src/  │  `frontend/src/  │   `frontend/src/       │
│   pages/`        │   components/`   │   context/`, `api/`    │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         │        HTTP POST /graphql (axios)      │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                Backend (Express + Apollo Server)              │
│  `backend/src/server.js`                                      │
│  - CORS + JSON middleware                                     │
│  - GraphQL context: { models, user }                          │
└────────┬──────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│           GraphQL Layer (schemas + resolvers)                 │
│  `backend/src/schemas/`, `backend/src/resolvers/`             │
└────────┬──────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Data Layer (Sequelize ORM models)                 │
│  `backend/src/models/`                                        │
└────────┬──────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    MySQL 8.4 (Docker volume)                  │
│  `docker-compose.yml` (service: mysql)                         │
└─────────────────────────────────────────────────────────────┘
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

**Overall:** Three-tier monorepo (npm workspaces) with a GraphQL API layer: React SPA client → Express/Apollo GraphQL server → Sequelize ORM → MySQL. No REST endpoints besides a `/health` check.

**Key Characteristics:**
- Single GraphQL endpoint (`/graphql`) for all data operations; no separate REST controllers.
- Stateless JWT auth: token stored in browser `localStorage`, sent as `Authorization: Bearer` header, verified per-request in the Apollo `context` function (`backend/src/server.js:34-37`).
- "Aggregator" module pattern for schemas/resolvers/models: each domain (currently only `user`) exports its own schema/resolver/model, aggregated in an `index.js` barrel file so Apollo receives arrays (`backend/src/schemas/index.js`, `backend/src/resolvers/index.js`).
- Frontend has no GraphQL client library (no Apollo Client/urql) — plain axios POST with raw GraphQL query strings defined inline in components/context (`frontend/src/context/AuthContext.jsx:6-24`, `frontend/src/pages/Dashboard.jsx:19-27`).
- First registered user automatically becomes `ADMIN`; all subsequent registrations are `USER` (`backend/src/resolvers/user.resolver.js:29-35`).

## Layers

**Presentation (Frontend):**
- Purpose: Renders UI, manages client-side auth state, calls GraphQL API
- Location: `frontend/src/`
- Contains: React components, pages, context, API client, theme
- Depends on: Backend GraphQL endpoint (via Vite dev proxy or `VITE_API_URL`)
- Used by: End users via browser

**API Gateway (Express + Apollo):**
- Purpose: HTTP entry point, CORS enforcement, GraphQL request handling, auth context injection
- Location: `backend/src/server.js`
- Contains: Express app setup, Apollo Server instantiation, middleware wiring
- Depends on: schemas, resolvers, models, auth utils, env config
- Used by: Frontend `graphqlClient.js`

**GraphQL Layer (Schema + Resolvers):**
- Purpose: Defines the API contract (SDL) and implements query/mutation logic
- Location: `backend/src/schemas/`, `backend/src/resolvers/`
- Contains: Type definitions, resolver functions, business logic (auth checks, uniqueness checks)
- Depends on: models (data access), utils/auth.js (token/role logic)
- Used by: Apollo Server (`backend/src/server.js`)

**Data Layer (Models):**
- Purpose: ORM definitions, DB hooks (password hashing, email normalization)
- Location: `backend/src/models/`
- Contains: Sequelize model classes/init functions, model aggregation, `initializeDatabase()`
- Depends on: `backend/src/config/database.js` (Sequelize instance)
- Used by: Resolvers

**Configuration Layer:**
- Purpose: Centralizes environment-driven config (ports, secrets, DB creds, CORS origins)
- Location: `backend/src/config/`
- Contains: `env.js` (dotenv loader + config object), `database.js` (Sequelize connection)
- Depends on: `env/*.env` files (see STRUCTURE.md)
- Used by: server.js, models, auth utils

## Data Flow

### Primary Request Path (authenticated query, e.g. Dashboard)

1. User navigates to `/dashboard`; `ProtectedRoute` checks `useAuth()` state, renders `Outlet` if authenticated (`frontend/src/components/ProtectedRoute.jsx:16-19`)
2. `Dashboard` page fires `graphqlRequest(DASHBOARD_QUERY)` on mount (`frontend/src/pages/Dashboard.jsx:78-82`)
3. `graphqlClient` axios interceptor attaches `Authorization: Bearer <token>` from `localStorage` (`frontend/src/api/graphqlClient.js:17-21`)
4. Request POSTs to `/graphql` (proxied to backend in dev via `vite.config.js:9-15`, or via `VITE_API_URL` in prod)
5. Express middleware chain: CORS check → `express.json()` → `expressMiddleware(apollo)` (`backend/src/server.js:17-39`)
6. Apollo `context` callback resolves `user` via `getUserFromRequest(req, models)`, which verifies the JWT and loads the User row (`backend/src/utils/auth.js:9-19`)
7. `dashboard` resolver runs `requireAuth(user)`, conditionally queries all users if role is ADMIN (`backend/src/resolvers/user.resolver.js:10-18`)
8. Response returns through Apollo → Express → axios → component state (`frontend/src/pages/Dashboard.jsx:79-81`)

### Registration/Login Flow

1. `Register`/`Login` page calls `useAuth().register()` or `.login()` (`frontend/src/context/AuthContext.jsx:60-61`)
2. `authenticate()` helper posts the mutation, extracts `token`/`user` from response, persists token to `localStorage`, updates React state (`frontend/src/context/AuthContext.jsx:48-54`)
3. Backend `register` resolver checks email uniqueness, counts existing users to decide ADMIN/USER role, creates the row (password hashed via Sequelize `beforeCreate` hook), signs a JWT (`backend/src/resolvers/user.resolver.js:25-37`, `backend/src/models/User.js:54-56`)
4. `login` resolver verifies password via `user.validatePassword()` (bcrypt compare) and signs a JWT (`backend/src/resolvers/user.resolver.js:39-42`)

### Password Reset Flow

1. `requestPasswordReset` mutation generates a random hex token and expiry timestamp, stores on the User row, returns the token directly in the GraphQL response (no email delivery integration) (`backend/src/resolvers/user.resolver.js:48-61`, `backend/src/utils/auth.js:31-37`)
2. `resetPassword` mutation validates token + expiry, updates `passwordHash` (re-hashed via `beforeUpdate` hook), clears the token fields (`backend/src/resolvers/user.resolver.js:63-74`, `backend/src/models/User.js:57-59`)

**State Management:**
- Frontend: single React Context (`AuthContext`) holds `user` and `loading`; no external state library (no Redux/Zustand). Auth token is the source of truth in `localStorage`; `user` object is re-derived by calling the `me` query on app load (`frontend/src/context/AuthContext.jsx:30-46`).
- Backend: stateless — no server-side sessions; all identity carried in the JWT per-request.

## Key Abstractions

**GraphQL context object `{ models, user }`:**
- Purpose: Single injection point giving every resolver access to the DB models and the resolved authenticated user
- Examples: `backend/src/server.js:34-37`, consumed throughout `backend/src/resolvers/user.resolver.js`
- Pattern: Apollo Server `context` async function, computed per-request

**Aggregator barrel files (`index.js`):**
- Purpose: Combine per-domain schema/resolver/model modules into arrays/objects Apollo and Sequelize expect
- Examples: `backend/src/schemas/index.js`, `backend/src/resolvers/index.js`, `backend/src/models/index.js`
- Pattern: adding a new domain (e.g. "post") means creating `post.schema.js`/`post.resolver.js`/model file, then appending to these barrels

**`useAuth()` hook / AuthContext:**
- Purpose: Central place for auth state and mutations across the whole frontend
- Examples: `frontend/src/context/AuthContext.jsx`, consumed by `ProtectedRoute.jsx`, `AppLayout.jsx`, `Login.jsx`, `Register.jsx`
- Pattern: React Context + custom hook, throws if used outside provider (`frontend/src/context/AuthContext.jsx:76-78`)

**AuthShell wrapper component:**
- Purpose: Shared visual chrome (branded card) for all auth-related pages
- Examples: `frontend/src/components/AuthShell.jsx`, used by `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- Pattern: Presentational wrapper component accepting `eyebrow`/`title`/`subtitle`/`footer`/`children` props

## Entry Points

**Backend server:**
- Location: `backend/src/server.js`
- Triggers: `npm start`/`npm run dev` (nodemon), or Docker container CMD (`backend/Dockerfile:10`)
- Responsibilities: Boots Express, starts Apollo, initializes DB connection, mounts `/graphql` and `/health`

**Frontend app:**
- Location: `frontend/src/main.jsx`
- Triggers: `npm run dev`/`npm start` (Vite dev server), or built and served via Docker (`frontend/Dockerfile`)
- Responsibilities: Mounts React tree with Router, MUI Theme, AuthProvider

**Docker Compose stack:**
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

**What happens:** `requestPasswordReset` returns the raw `resetToken` value in the GraphQL response payload (`backend/src/resolvers/user.resolver.js:58-61`).
**Why it's wrong:** In a real password-reset flow the token should be emailed to the user out-of-band, not handed back to whoever called the mutation — this defeats the purpose of a reset token as a proof of email ownership.
**Do this instead:** Send the token via an email/notification service and return only the generic `message` field to the client; do not include `resetToken` in the response outside of a development/test environment flag.

### Auth guards implemented as thrown-error functions rather than middleware

**What happens:** `requireAuth`/`requireAdmin` are plain functions called manually at the top of each resolver that needs protection (`backend/src/resolvers/user.resolver.js:11,20,45`).
**Why it's wrong:** Easy to forget calling the guard in a new resolver, silently exposing unauthenticated data; no centralized enforcement.
**Do this instead:** As more resolvers are added, consider a schema directive (e.g. `@auth`) or a resolver-wrapping higher-order function applied uniformly, so protection isn't opt-in per resolver body.

## Error Handling

**Strategy:** Resolvers throw plain `Error` objects with user-facing messages; Apollo Server serializes these into the GraphQL `errors` array. The frontend's `graphqlRequest()` helper collapses `response.data.errors` into a single joined `Error` and re-throws it (`frontend/src/api/graphqlClient.js:26-28`).

**Patterns:**
- Backend: `throw new Error('...')` inside resolvers for validation/auth failures (e.g. `backend/src/resolvers/user.resolver.js:27,41,66-67`); `getUserFromRequest` swallows JWT verification errors and returns `null` rather than throwing (`backend/src/utils/auth.js:14-19`).
- Frontend: `try/catch` around `graphqlRequest` calls in page components, error message shown via MUI `<Alert severity="error">` (e.g. `frontend/src/pages/Login.jsx:21-22,44`); `graphqlClient.js` also special-cases network failures into a more descriptive message (`frontend/src/api/graphqlClient.js:30-34`).

## Cross-Cutting Concerns

**Logging:** Sequelize SQL logging only, gated on `NODE_ENV === 'development'` via `console.log` (`backend/src/config/database.js:8`). No structured/application logger; `server.js` uses a single startup `console.log` (`backend/src/server.js:42`).

**Validation:** Minimal — Sequelize model-level validators only (`isEmail` on the `email` field, `allowNull` constraints) (`backend/src/models/User.js:22-31`). GraphQL SDL enforces required/non-null argument types at the schema level (`backend/src/schemas/user.schema.js:39-43`). No dedicated input-validation library (e.g. Zod/Joi/Yup) on either side.

**Authentication:** JWT-based, computed per-request in the Apollo context (`backend/src/server.js:34-37`, `backend/src/utils/auth.js`). Role-based checks (`ADMIN`/`USER`) enforced ad hoc within resolvers via `requireAuth`/`requireAdmin`.

---

*Architecture analysis: 2026-07-11*
