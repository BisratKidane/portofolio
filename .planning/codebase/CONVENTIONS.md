# Coding Conventions

**Analysis Date:** 2026-07-11

## Naming Patterns

**Files:**
- Backend: lowerCamelCase or dotted-role filenames, e.g. `user.resolver.js`, `user.schema.js`, `auth.js`, `env.js`, `database.js`. Model class files are PascalCase matching the exported class: `User.js`.
- Frontend: React components and pages use PascalCase `.jsx` filenames matching the exported component: `Login.jsx`, `Dashboard.jsx`, `ProtectedRoute.jsx`, `AppLayout.jsx`. Non-component modules use camelCase `.js`/`.jsx`: `graphqlClient.js`, `theme.js`, `AuthContext.jsx` (context is capitalized because it exports a component-like provider).
- Index/barrel files named `index.js` aggregate a directory's exports (`backend/src/models/index.js`, `backend/src/schemas/index.js`, `backend/src/resolvers/index.js`).

**Functions:**
- camelCase verbs describing action: `signToken`, `getUserFromRequest`, `requireAuth`, `requireAdmin`, `createResetToken`, `resetTokenExpiry`, `serializeUser`, `normalizeGraphqlUrl`, `graphqlRequest`.
- React components are top-level `export default function ComponentName()` in PascalCase (`frontend/src/pages/Login.jsx:7`, `frontend/src/components/ProtectedRoute.jsx:5`).
- Event handlers inside components use `handle` prefix: `handleSubmit` (`frontend/src/pages/Login.jsx:14`).

**Variables:**
- camelCase throughout: `existingUser`, `userCount`, `resetToken`, `clientOrigins`, `graphqlClient`.
- GraphQL query/mutation string constants use SCREAMING_SNAKE_CASE with a `_QUERY`/`_MUTATION` suffix: `ME_QUERY`, `LOGIN_MUTATION`, `REGISTER_MUTATION`, `LOGOUT_MUTATION` (`frontend/src/context/AuthContext.jsx:6-24`).
- GraphQL resolver args destructure with leading underscore for unused positional params: `(_parent, _args, { user })` (`backend/src/resolvers/user.resolver.js:9`), `(_req, res)` for unused Express request (`backend/src/server.js:13`).

**Types:**
- No TypeScript in this codebase — plain JS/JSX with ES modules (`"type": "module"` in both `backend/package.json` and `frontend/package.json`).
- Sequelize model fields declared via `DataTypes` object literals, not classes/interfaces (`backend/src/models/User.js:11-45`).
- GraphQL schema types are the closest thing to a type system; defined as tagged template literals with `#graphql` pragma comment (`backend/src/schemas/user.schema.js:1`).

## Code Style

**Formatting:**
- No Prettier or `.prettierrc` config present in the repo.
- Observed style: 2-space indentation, single quotes for strings, no semicolons omitted (semicolons ARE used), trailing commas avoided in single-line objects.
- Object shorthand used consistently: `{ models, user: await getUserFromRequest(req, models) }` (`backend/src/server.js:35-36`).

**Linting:**
- No ESLint config (`.eslintrc*`, `eslint.config.*`) found anywhere in the repo.
- No lint script defined in `package.json` at root, backend, or frontend.
- Backend has a `check` script (`backend/package.json:13`) that runs `node --check src/server.js` — a syntax-only sanity check, not a linter.

## Import Organization

**Order (backend, ES modules):**
1. Third-party/external packages first (`express`, `cors`, `@apollo/server`)
2. Local relative imports next, ordered roughly by dependency direction: config → models → schemas → resolvers → utils (`backend/src/server.js:1-9`)

**Order (frontend, React):**
1. React/third-party libraries (`react`, `@mui/material`, `react-router-dom`, `axios`)
2. Local relative imports last, always with explicit `.js`/`.jsx` extension (`frontend/src/pages/Login.jsx:1-5`)

**Path Aliases:**
- None configured. All local imports use explicit relative paths with file extensions, e.g. `'../context/AuthContext.jsx'`, `'./config/env.js'`. `vite.config.js` (`frontend/vite.config.js`) defines no `resolve.alias`.

## Error Handling

**Backend (GraphQL resolvers):**
- Throw plain `Error` objects with user-facing messages; Apollo Server surfaces these as GraphQL errors: `throw new Error('A user with this email already exists.')` (`backend/src/resolvers/user.resolver.js:27`), `throw new Error('Invalid email or password.')` (`:41`).
- Auth guard functions (`requireAuth`, `requireAdmin` in `backend/src/utils/auth.js:22-29`) throw synchronously and are called at the top of resolver bodies before any other logic.
- Token verification failures are swallowed silently and normalized to `null`: `try { ... } catch { return null; }` (`backend/src/utils/auth.js:14-19`) — auth failures degrade to "not logged in" rather than propagating errors.
- CORS violations reject via callback error: `return callback(new Error(...))` (`backend/src/server.js:20`).

**Frontend:**
- Async handlers wrap calls in `try/catch/finally`, storing the error message in local component state for display via MUI `<Alert>`: see `handleSubmit` in `frontend/src/pages/Login.jsx:14-26`.
- `finally` blocks always reset loading state, regardless of success or failure.
- `graphqlRequest` (`frontend/src/api/graphqlClient.js:23-36`) centralizes GraphQL error extraction: checks `response.data.errors` and joins messages into a single `Error`; also special-cases network failures with a more actionable message.
- `AuthContext`'s `loadUser` effect catches token-verification failures silently and clears `localStorage`, without surfacing an error to the user (`frontend/src/context/AuthContext.jsx:36-43`).

## Logging

**Framework:** None — plain `console.log`.

**Patterns:**
- Backend startup logs a single line on successful boot: `console.log(\`Backend ready at http://localhost:${env.port}/graphql\`)` (`backend/src/server.js:42`).
- Sequelize query logging is conditionally enabled only in development: `logging: env.nodeEnv === 'development' ? console.log : false` (`backend/src/config/database.js:8`).
- No structured logging, no log levels, no request logging middleware.

## Comments

**When to Comment:**
- Minimal inline comments; code favors self-explanatory naming over comments. No comment blocks found in any reviewed source file.
- GraphQL schema uses the `#graphql` pragma comment for tooling/syntax highlighting only (`backend/src/schemas/user.schema.js:1`).

**JSDoc/TSDoc:**
- Not used anywhere in the codebase.

## Function Design

**Size:** Small, single-purpose functions. Resolver functions are typically 3-10 lines. Utility functions in `backend/src/utils/auth.js` are all one-liners or near one-liners.

**Parameters:**
- GraphQL resolvers use the standard 4-arg signature `(parent, args, context, info)`, destructuring only what's needed and prefixing unused params with `_`: `(_parent, { name, email, password }, { models })` (`backend/src/resolvers/user.resolver.js:25`).
- React components take a single `props` object, destructured in the function signature: `function ProtectedRoute({ allowedRoles })` (`frontend/src/components/ProtectedRoute.jsx:5`).

**Return Values:**
- Resolvers return plain objects/values matching GraphQL schema shapes directly (no wrapping/envelope pattern) — e.g. `return { token: signToken(user), user }` (`backend/src/resolvers/user.resolver.js:37`).
- Guard clauses return early: `if (!token) return null;` (`backend/src/utils/auth.js:12`), `if (!user) return <Navigate to="/login" replace />;` (`frontend/src/components/ProtectedRoute.jsx:16`).

## Module Design

**Exports:**
- Named exports are the default convention for utilities and config (`export function signToken`, `export const env`, `export const models`).
- React components/pages use `export default function ComponentName()`.
- Backend aggregates domain-specific modules into barrel `index.js` files that merge everything into one object: `backend/src/resolvers/index.js` merges `userResolvers` into a combined `resolvers` export; `backend/src/schemas/index.js` likely concatenates `userTypeDefs` into `typeDefs` (same pattern as `backend/src/models/index.js:6-8`).

**Barrel Files:**
- Used on the backend for `models/`, `schemas/`, `resolvers/` — single feature module (`user`) today, but the barrel pattern anticipates multiple feature modules being merged (e.g. adding a `post.resolver.js` alongside `user.resolver.js` and merging both in `resolvers/index.js`).
- Not used on the frontend; components/pages are imported individually and directly in `frontend/src/App.jsx:2-8`.

---

*Convention analysis: 2026-07-11*
