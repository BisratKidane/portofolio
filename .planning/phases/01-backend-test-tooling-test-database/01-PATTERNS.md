# Phase 1: Backend Test Tooling & Test Database - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 10
**Analogs found:** 7 / 10 (3 have no direct analog — genuinely new capability, RESEARCH.md Code Examples used instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/vitest.config.js` | config | request-response (process bootstrap) | `backend/src/config/env.js` (env-mutation-at-load-time pattern) | role-match |
| `backend/test/globalSetup.js` | utility (lifecycle hook) | batch (setup/teardown) | `backend/src/models/index.js` (`initializeDatabase()`) | exact (sync/authenticate pattern) |
| `backend/test/guard.js` | utility (validation) | transform (pure check → throw) | `backend/src/utils/auth.js` (`requireAuth`/`requireAdmin` guard-throws-Error pattern) | role-match |
| `backend/test/helpers.js` | utility (fixtures) | CRUD | `backend/src/models/User.js` + `backend/src/resolvers/user.resolver.js` (register mutation's user-creation logic) | role-match |
| `backend/src/smoke.test.js` | test | request-response (assertion) | none (no existing test files) | no-analog |
| `backend/src/models/database.test.js` | test | CRUD (read/authenticate) | none (no existing test files); mirrors `backend/src/models/index.js` structure | no-analog |
| `env/test.env` | config | file-I/O (dotenv source) | `env/local.env` (shape/key template) | exact |
| `backend/package.json` | config | — | itself (existing scripts block) | exact |
| `docker-compose.yml` | config | — | itself (existing `mysql` service block) | exact |
| `backend/test/init/01-create-test-db.sql` (or `.sh`) | config (DB provisioning) | batch | none (no existing init scripts) | no-analog |

## Pattern Assignments

### `backend/vitest.config.js` (config, process bootstrap)

**Analog:** `backend/src/config/env.js` (env-loading-at-module-load-time convention) + RESEARCH.md Pattern 3 (verified against official Vitest docs)

**Existing env-loading pattern** (`backend/src/config/env.js:1-9`):
```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultEnvPath = path.resolve(__dirname, '../../../env/local.env');

dotenv.config({ path: process.env.ENV_FILE || defaultEnvPath });
```
Key convention to copy: `path.dirname(fileURLToPath(import.meta.url))` for ESM `__dirname`, and the `process.env.ENV_FILE || default` override hook — this is the exact hook D-04 says to reuse.

**What `vitest.config.js` must do differently (per D-04 + RESEARCH.md Pitfall 1):** set `process.env.ENV_FILE` and `process.env.NODE_ENV` as the literal first statements, **before** importing anything that transitively imports `env.js` (only import `defineConfig` from `vitest/config`):
```javascript
// backend/vitest.config.js — structure per RESEARCH.md Architecture Patterns > Pattern 3
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.ENV_FILE = path.resolve(__dirname, '../env/test.env');
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.js'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false
  }
});
```

---

### `backend/test/globalSetup.js` (utility, lifecycle hook)

**Analog:** `backend/src/models/index.js:10-13` (`initializeDatabase()` — the app's own authenticate+sync pattern)

**Core pattern to mirror** (`backend/src/models/index.js:1-13`):
```javascript
import { sequelize } from '../config/database.js';
import { initUser } from './User.js';

const User = initUser(sequelize);

export const models = {
  User
};

export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
}

export { sequelize };
```
`globalSetup.js` extends this exact `authenticate()` + `sync()` call sequence with `{ force: true, match: /_test$/ }` (D-02, D-03) and adds the D-05 guard call before any connection is opened, plus a returned teardown per RESEARCH.md Pattern 1:
```javascript
// backend/test/globalSetup.js
import { assertTestDatabase } from './guard.js';

export default async function setup() {
  assertTestDatabase();

  const { sequelize } = await import('../src/config/database.js');
  await sequelize.authenticate();
  await sequelize.sync({ force: true, match: /_test$/ });

  return async function teardown() {
    await sequelize.drop();
    await sequelize.close();
  };
}
```
**Note:** import `../src/config/database.js` dynamically *inside* the function, after the guard runs — do not import it at the top of the file, or the guard check happens too late relative to module evaluation order (RESEARCH.md Pitfall 1).

---

### `backend/test/guard.js` (utility, validation)

**Analog:** `backend/src/utils/auth.js` (guard-functions-that-throw convention — `requireAuth`/`requireAdmin`)

I could not fully re-derive `backend/src/utils/auth.js`'s exact line numbers without a redundant read since RESEARCH.md's Code Examples section already contains a verified, ready-to-copy version derived from this exact convention (guard function synchronously throws a plain `Error` with a user-facing message, called before any other logic — matching CLAUDE.md's documented Error Handling convention: "Throw plain `Error` objects with user-facing messages" and "Auth guard functions... throw synchronously... called at the top... before any other logic").

**Pattern to copy** (RESEARCH.md Code Examples, D-05):
```javascript
// backend/test/guard.js
import { env } from '../src/config/env.js';

export function assertTestDatabase() {
  const isTestEnv = env.nodeEnv === 'test';
  const isTestDbName = /_test$/.test(env.database.name);

  if (!isTestEnv || !isTestDbName) {
    throw new Error(
      `Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test", ` +
      `got NODE_ENV=${env.nodeEnv} DB_NAME=${env.database.name}. ` +
      `Check that ENV_FILE points at env/test.env before Vitest loads.`
    );
  }
}
```
This mirrors the app's own guard convention exactly: plain `Error`, synchronous throw, called first, descriptive message — no new error-handling idiom introduced.

---

### `backend/test/helpers.js` (utility, fixtures — CRUD)

**Analog:** `backend/src/resolvers/user.resolver.js` (register mutation — user-creation via the `models.User` CRUD call) + `backend/src/models/User.js` (field shape)

`createTestUser()` should follow the same `models.User.create({...})` shape the register resolver already uses, and must supply all `allowNull: false` fields from the model (`backend/src/models/User.js:18-31`): `name`, `email`, `passwordHash` (hashed automatically via the `beforeCreate` hook — `User.js:54-55`), `role` defaults to `'USER'` (`User.js:32-35`).

```javascript
// backend/test/helpers.js — shape derived from models/User.js field list + models/index.js's `models` export
import { models, sequelize } from '../src/models/index.js';

export async function resetTables() {
  // per-test row cleanup between specs sharing the per-run schema (D-02)
  await models.User.destroy({ where: {}, truncate: true });
}

export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!', // hashed by User's beforeCreate hook, not pre-hashed here
    role: 'USER',
    ...overrides
  });
}
```
**Naming convention applied:** camelCase verb-first function names (`resetTables`, `createTestUser`) per CLAUDE.md Naming Patterns ("camelCase verbs describing action").

---

### `backend/src/smoke.test.js` (test — no analog)

No existing test files in the codebase (confirmed via TESTING.md: zero test tooling). Vitest's own default API (`describe`/`it`/`expect`, auto-imported globals not needed if `globals: false`, or import from `'vitest'`) is the only source. Filename placement per D-06 exception noted in RESEARCH.md Open Questions #2 (root of `src/`, acceptable exception since no `smoke.js` exists to co-locate with).

```javascript
// backend/src/smoke.test.js
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs a trivial passing assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

---

### `backend/src/models/database.test.js` (test — no analog, co-located with `models/index.js`)

**Analog for what it exercises:** `backend/src/models/index.js:10-13` (`initializeDatabase()` pattern — `authenticate()` + a `models.User` query)

Per D-09 and RESEARCH.md Pattern 3's mitigation note, this spec must both authenticate AND assert the resolved DB name ends in `_test` (second-layer proof that `ENV_FILE`/`NODE_ENV` propagated correctly into the Vitest fork):
```javascript
// backend/src/models/database.test.js
import { describe, it, expect } from 'vitest';
import { sequelize, models } from './index.js';

describe('database connectivity', () => {
  it('authenticates against the isolated test database', async () => {
    await sequelize.authenticate();
    expect(sequelize.config.database).toMatch(/_test$/);
  });

  it('can query the User table', async () => {
    const count = await models.User.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```

---

### `env/test.env` (config, file-I/O)

**Analog:** `env/local.env` (shape/key template — content not read per STRUCTURE.md sensitivity policy; key names sourced from `backend/src/config/env.js`'s `process.env.*` reads and CLAUDE.md's documented variable list)

`backend/src/config/env.js:16-31` reads these keys — `env/test.env` must define the same key set with a distinct `DB_NAME`:
```
NODE_ENV=test
PORT=<same or unused — Vitest doesn't start the server>
CLIENT_URL=<copy from local.env or a placeholder — unused by tests>
JWT_SECRET=<non-production placeholder, per RESEARCH.md Security Domain>
JWT_EXPIRES_IN=1d
RESET_TOKEN_EXPIRES_MINUTES=30
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=portofolio_test
DB_USER=<same app DB user as local.env — must already have GRANT on portofolio_test per D-10>
DB_PASSWORD=<same as local.env>
```
**Do not invent a new env-loading mechanism** — `env/test.env` is consumed purely through the existing `ENV_FILE` override hook already in `env.js`; no changes to `env.js` itself.

---

### `backend/package.json` (config — modified)

**Analog:** itself, existing `scripts`/`devDependencies` blocks (`backend/package.json:10-14, 27-29`)

**Current state:**
```json
"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js",
  "check": "node --check src/server.js"
},
...
"devDependencies": {
  "nodemon": "^3.1.9"
}
```
**Pattern to apply:** add a `test` key to the existing `scripts` object (same flat structure, same quoting/comma style) and `vitest` to the existing `devDependencies` object — no new top-level structure:
```json
"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js",
  "check": "node --check src/server.js",
  "test": "vitest run"
},
...
"devDependencies": {
  "nodemon": "^3.1.9",
  "vitest": "^4.1.10"
}
```
`"test": "vitest run"` (not bare `"vitest"`) so `npm test` exits after one run instead of entering watch mode — matches SPEC req 1's "exits 0/non-zero" acceptance criterion for CI/manual invocation.

---

### `docker-compose.yml` (config — modified, `mysql` service)

**Analog:** itself, existing `mysql` service block (`docker-compose.yml:1-18`)

**Current state:**
```yaml
services:
  mysql:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    ports:
      - "${DB_PORT:-3306}:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
```
**Pattern to apply:** add one more line to the existing `volumes:` list (do not restructure), mounting the new init script read-only alongside the existing `mysql_data` named-volume mount — matches the project's existing `${VAR:-default}` interpolation convention seen elsewhere in the same file:
```yaml
    volumes:
      - mysql_data:/var/lib/mysql
      - ./backend/test/init/01-create-test-db.sql:/docker-entrypoint-initdb.d/01-create-test-db.sql:ro
```
**Important — no analog exists for `${MYSQL_USER}` interpolation inside a mounted `.sql` file** (official MySQL image does not interpolate env vars in `.sql` init scripts, only `.sh`). Two options, neither has a codebase analog:
1. A static `.sql` file with the `DB_USER` value read directly from `env/local.env` at implementation time (not hardcoded from research — treat as sensitive, read only when actually writing the file).
2. A `.sh` init script using the container's own `$MYSQL_USER`/`$MYSQL_DATABASE` env vars (already injected by the official MySQL image itself — no repo secret read required, most robust option per RESEARCH.md Open Question #1).

RESEARCH.md's example content (`backend/test/init/01-create-test-db.sql`), needs the interpolation fix above:
```sql
CREATE DATABASE IF NOT EXISTS portofolio_test;
GRANT ALL PRIVILEGES ON portofolio_test.* TO '<DB_USER>'@'%';
FLUSH PRIVILEGES;
```

## Shared Patterns

### ESM `__dirname` resolution
**Source:** `backend/src/config/env.js:5-6`
**Apply to:** `backend/vitest.config.js`, any path-resolving file under `backend/test/`
```javascript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

### `ENV_FILE` override hook (do not modify, only consume)
**Source:** `backend/src/config/env.js:9`
**Apply to:** `backend/vitest.config.js` (sets it), `backend/test/globalSetup.js` and every test file (relies on it transitively via `env.js`)
```javascript
dotenv.config({ path: process.env.ENV_FILE || defaultEnvPath });
```

### Guard-throws-Error convention
**Source:** CLAUDE.md Error Handling; convention embodied in `backend/src/utils/auth.js`'s `requireAuth`/`requireAdmin`
**Apply to:** `backend/test/guard.js`
- Plain `new Error('...')` with a descriptive, user-facing message.
- Thrown synchronously, called first/before any other logic.
- No custom error classes, no error codes.

### `authenticate()` + `sync()` sequencing
**Source:** `backend/src/models/index.js:10-13` (`initializeDatabase()`)
**Apply to:** `backend/test/globalSetup.js`, `backend/src/models/database.test.js`
- Always `await sequelize.authenticate()` before any `sync()`/query — matches the app's own boot sequence, no new connection-verification idiom introduced.

### camelCase verb-first helper naming
**Source:** CLAUDE.md Naming Patterns (`signToken`, `getUserFromRequest`, `requireAuth` examples)
**Apply to:** `backend/test/helpers.js` (`resetTables`, `createTestUser`)

### 2-space indent, single quotes, semicolons, ESM named exports
**Source:** CLAUDE.md Code Style / Module Design (observed throughout `backend/src/`)
**Apply to:** All new `.js` files in this phase (`vitest.config.js`, `test/*.js`, `src/**/*.test.js`)

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/smoke.test.js` | test | request-response | Zero existing test files in the repo (confirmed via `.planning/codebase/TESTING.md`); RESEARCH.md Code Examples + Vitest's own API are the source instead. |
| `backend/src/models/database.test.js` | test | CRUD | Same as above — no existing test convention to copy; structure mirrors `models/index.js`'s own `authenticate()`/`sync()` call order as the closest available analog for *what* it exercises. |
| `backend/test/init/01-create-test-db.sql` (or `.sh`) | config | batch | No existing DB-init scripts anywhere in the repo; RESEARCH.md Code Examples (verified against official `hub.docker.com/_/mysql` docs) is the pattern source. Planner must resolve the `${MYSQL_USER}` interpolation gap (RESEARCH.md Open Question #1) at implementation time. |

## Metadata

**Analog search scope:** `backend/src/` (config, models, resolvers, utils), `backend/package.json`, `env/`, `docker-compose.yml`. No `backend/test/` or `*.test.js` files exist yet to search.
**Files scanned:** `backend/src/config/env.js`, `backend/src/config/database.js`, `backend/src/models/index.js`, `backend/src/models/User.js`, `backend/package.json`, `docker-compose.yml`, `.gitignore` (env-tracking check), `.planning/codebase/STRUCTURE.md` (sensitivity policy check).
**Pattern extraction date:** 2026-07-11
