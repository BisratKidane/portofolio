# Codebase Structure

**Analysis Date:** 2026-07-11

## Directory Layout

```
portofolio/                          # npm workspaces monorepo root
├── backend/                         # Express + Apollo GraphQL API (npm workspace)
│   ├── Dockerfile                   # Node 18 alpine image, runs `npm start`
│   ├── package.json                 # workspace deps (apollo-server, sequelize, jsonwebtoken, bcryptjs)
│   └── src/
│       ├── config/                  # env loading + DB connection setup
│       │   ├── env.js
│       │   └── database.js
│       ├── models/                  # Sequelize models
│       │   ├── index.js             # model aggregator + initializeDatabase()
│       │   └── User.js
│       ├── schemas/                  # GraphQL SDL type definitions
│       │   ├── index.js             # typeDefs aggregator
│       │   └── user.schema.js
│       ├── resolvers/                # GraphQL resolver implementations
│       │   ├── index.js             # resolvers aggregator
│       │   └── user.resolver.js
│       ├── utils/                    # cross-cutting helpers
│       │   └── auth.js              # JWT signing/verification, role guards, reset tokens
│       └── server.js                # Express + Apollo entry point
├── frontend/                         # React SPA (Vite, npm workspace)
│   ├── Dockerfile                    # Node 18 alpine image, runs Vite dev server
│   ├── index.html                    # Vite HTML entry
│   ├── package.json                  # workspace deps (react, mui, axios, react-router-dom)
│   ├── vite.config.js                # dev proxy to backend (/graphql -> VITE_PROXY_TARGET)
│   ├── dist/                         # build output (generated, git-ignored)
│   └── src/
│       ├── api/
│       │   └── graphqlClient.js      # axios instance + graphqlRequest() helper
│       ├── components/               # shared/reusable UI components
│       │   ├── AppLayout.jsx         # top nav bar + Outlet
│       │   ├── AuthShell.jsx         # shared card wrapper for auth pages
│       │   ├── BrandMark.jsx         # logo/brand components
│       │   └── ProtectedRoute.jsx    # auth route guard
│       ├── context/
│       │   └── AuthContext.jsx       # global auth state (user, login/register/logout)
│       ├── pages/                     # route-level screens
│       │   ├── Dashboard.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   └── ResetPassword.jsx
│       ├── App.jsx                    # route table
│       ├── main.jsx                   # React root, providers
│       └── theme.js                   # MUI theme + color tokens + getInitials() helper
├── env/                               # environment variable files (not committed secrets, but present)
│   ├── local.env                     # host-run dev config
│   ├── local.container.env           # Docker Compose local config
│   └── remote.env                    # Docker Compose remote/prod config
├── docker-compose.yml                 # mysql + backend + frontend services
├── package.json                       # root workspace scripts (dev/start/build/docker:*)
├── package-lock.json
├── .nvmrc                             # Node version pin
├── .gitignore
├── README.md
└── .planning/                         # GSD planning artifacts (this analysis lives here)
    └── codebase/
```

## Directory Purposes

**`backend/src/config/`:**
- Purpose: Centralizes environment variable loading and database connection instantiation
- Contains: `env.js` (dotenv + typed config export), `database.js` (Sequelize instance)
- Key files: `backend/src/config/env.js`, `backend/src/config/database.js`

**`backend/src/models/`:**
- Purpose: Sequelize ORM model definitions and DB lifecycle helpers
- Contains: One file per model (`User.js`), plus `index.js` aggregator exposing `models` object and `initializeDatabase()`
- Key files: `backend/src/models/index.js`, `backend/src/models/User.js`

**`backend/src/schemas/`:**
- Purpose: GraphQL SDL type definitions (the API contract)
- Contains: One file per domain (`user.schema.js`), plus `index.js` aggregator exporting `typeDefs` array
- Key files: `backend/src/schemas/user.schema.js`

**`backend/src/resolvers/`:**
- Purpose: GraphQL resolver function implementations (business logic)
- Contains: One file per domain (`user.resolver.js`), plus `index.js` aggregator exporting `resolvers` array
- Key files: `backend/src/resolvers/user.resolver.js`

**`backend/src/utils/`:**
- Purpose: Shared helper functions not tied to a specific domain
- Contains: `auth.js` — JWT signing/verification, `getUserFromRequest`, `requireAuth`/`requireAdmin` guards, password-reset token helpers
- Key files: `backend/src/utils/auth.js`

**`frontend/src/api/`:**
- Purpose: HTTP/GraphQL transport layer for the frontend
- Contains: `graphqlClient.js` — axios instance configured with base URL and auth-token interceptor, plus `graphqlRequest()` convenience function
- Key files: `frontend/src/api/graphqlClient.js`

**`frontend/src/components/`:**
- Purpose: Reusable, cross-page UI building blocks (not tied to a single route)
- Contains: Layout shell, auth guard, branded card wrapper, logo components
- Key files: `frontend/src/components/AppLayout.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/components/AuthShell.jsx`, `frontend/src/components/BrandMark.jsx`

**`frontend/src/context/`:**
- Purpose: React Context providers for cross-cutting client state
- Contains: `AuthContext.jsx` (only context currently) — holds `user`/`loading`, exposes `useAuth()` hook
- Key files: `frontend/src/context/AuthContext.jsx`

**`frontend/src/pages/`:**
- Purpose: Route-level screen components, one per URL path
- Contains: `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `Dashboard.jsx`
- Key files: see `frontend/src/App.jsx` for route → page mapping

**`env/`:**
- Purpose: Holds `.env`-style files loaded by `dotenv-cli` (root scripts) and Docker Compose `env_file` directives
- Contains: `local.env` (host dev), `local.container.env` (Docker local), `remote.env` (Docker remote/prod)
- Note: These are configuration files, not source code; do not read/print their contents when handling secrets

## Key File Locations

**Entry Points:**
- `backend/src/server.js`: Express + Apollo Server bootstrap, `/health` and `/graphql` routes
- `frontend/src/main.jsx`: React root render, wraps `App` with Router/Theme/AuthProvider
- `frontend/index.html`: Vite HTML shell

**Configuration:**
- `backend/src/config/env.js`: Backend environment variables (port, JWT secret, DB creds, CORS origins)
- `frontend/vite.config.js`: Vite dev server + GraphQL proxy target
- `docker-compose.yml`: Multi-service orchestration (mysql, backend, frontend)
- `env/local.env`, `env/local.container.env`, `env/remote.env`: Environment variable sets per run mode

**Core Logic:**
- `backend/src/resolvers/user.resolver.js`: All GraphQL mutation/query business logic (auth, dashboard, user management)
- `backend/src/utils/auth.js`: JWT + role-guard logic
- `backend/src/models/User.js`: User schema + password hashing hooks
- `frontend/src/context/AuthContext.jsx`: Client-side auth state machine

**Testing:**
- Not detected — no test files, test framework config, or test scripts found in either `backend/package.json` or `frontend/package.json`

## Naming Conventions

**Files:**
- Backend domain files: `<domain>.schema.js`, `<domain>.resolver.js` (e.g. `user.schema.js`, `user.resolver.js`) — lowercase, dot-separated role suffix
- Backend models: PascalCase matching the exported class/init function (e.g. `User.js` exports `User` class and `initUser()`)
- Backend aggregators: always named `index.js` within their directory (`schemas/index.js`, `resolvers/index.js`, `models/index.js`)
- Frontend components/pages: PascalCase `.jsx` matching the exported component name (e.g. `AppLayout.jsx`, `Dashboard.jsx`)
- Frontend non-component modules: camelCase `.js`/`.jsx` (e.g. `graphqlClient.js`, `theme.js`)

**Directories:**
- Backend: lowercase, plural, role-based (`config`, `models`, `resolvers`, `schemas`, `utils`)
- Frontend: lowercase, plural, role-based (`api`, `components`, `context`, `pages`)

## Where to Add New Code

**New GraphQL domain (e.g. "Post"):**
- Model: `backend/src/models/Post.js` (export `initPost(sequelize)`), then register in `backend/src/models/index.js`
- Schema: `backend/src/schemas/post.schema.js` (export `postTypeDefs`), then add to array in `backend/src/schemas/index.js`
- Resolvers: `backend/src/resolvers/post.resolver.js` (export `postResolvers`), then add to array in `backend/src/resolvers/index.js`
- Follow the existing `user.*` files as the template for structure and naming

**New frontend page/route:**
- Component: `frontend/src/pages/<PageName>.jsx`
- Route registration: add a `<Route>` entry in `frontend/src/App.jsx`, nesting under `<ProtectedRoute>` if auth is required
- Reuse `AuthShell` (`frontend/src/components/AuthShell.jsx`) for any auth-flow page for visual consistency

**New shared UI component:**
- Location: `frontend/src/components/<ComponentName>.jsx`
- Follow the presentational-component pattern seen in `AuthShell.jsx`/`BrandMark.jsx` (props-driven, no internal data fetching)

**New cross-cutting backend helper:**
- Location: `backend/src/utils/<name>.js`, following the plain-function-export style of `auth.js`

**Environment variables:**
- Add new keys to all three files in `env/` (`local.env`, `local.container.env`, `remote.env`) and surface them in `backend/src/config/env.js`'s exported `env` object

## Special Directories

**`frontend/dist/`:**
- Purpose: Vite production build output
- Generated: Yes (via `npm run build`)
- Committed: No (build artifact, not source)

**`env/`:**
- Purpose: Environment variable files consumed by root npm scripts (`dotenv-cli`) and Docker Compose
- Generated: No (manually maintained, though gitignored per `.gitignore` conventions for secrets)
- Committed: Check `.gitignore` before assuming — treat contents as sensitive regardless

**`node_modules/` (root, `backend/node_modules/`, `frontend/node_modules/`):**
- Purpose: npm workspace dependency installs
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and codebase-mapping artifacts (this document's location)
- Generated: Yes, by GSD tooling
- Committed: Project-dependent

---

*Structure analysis: 2026-07-11*
