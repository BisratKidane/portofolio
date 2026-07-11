# Phase 1: Backend Test Tooling & Test Database - Research

**Researched:** 2026-07-11
**Domain:** Vitest test-runner setup + isolated MySQL/Sequelize test database harness (Node.js ESM, npm workspaces)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary:** This phase delivers the backend test harness -- a working Vitest runner and an isolated MySQL test database with automatic provisioning, teardown, config separation, and a safety guard -- proven end-to-end by a smoke test and a live DB-connectivity test. It does NOT write the auth unit tests (Phase 2) or integration tests (Phase 3); it builds the foundation those phases consume.

**Test Database Lifecycle**
- D-01: The MySQL test database (`portofolio_test`) is pre-created, not created by the harness. The harness connects with the ordinary app credentials and manages only tables -- no `CREATE DATABASE`/`DROP DATABASE` privileges required (least-privilege). Maps cleanly to the Phase 6 CI service container.
- D-02: Table state is reset with `sequelize.sync({ force: true })` once per run in the Vitest globalSetup (drop + recreate all tables before the suite starts). Individual test files share the schema and own their row-level cleanup.
- D-03: End-of-run teardown drops all tables and closes the Sequelize connection -- leaves no residual rows (satisfies SPEC req 3) and lets Vitest exit cleanly without a hanging connection pool.

**Test Environment & Safety Guard**
- D-04: Tests load `env/test.env` by reusing the existing `ENV_FILE` override hook in `backend/src/config/env.js`. `ENV_FILE` (absolute path to `env/test.env`) and `NODE_ENV=test` are set at the top of `vitest.config.js` (Node evaluates the config before any test/module load) -- cross-platform, no new dependency, keeps the npm script a clean `vitest run`. (Chosen over inline `VAR=val` script syntax and over adding `cross-env`/`dotenv-cli` to the backend workspace.)
- D-05: A safety guard runs in the Vitest globalSetup and throws before any DB connection unless BOTH: `NODE_ENV === 'test'` AND the resolved `DB_NAME` ends with `_test`. Two independent signals catch a wrong env file and an accidental dev/prod DB name. The guard aborts the entire run (globalSetup runs once).

**Test File Location & Structure**
- D-06: Test specs are co-located with the code they cover: `src/**/*.test.js` (e.g. `src/utils/auth.test.js`). This is the convention Phases 2 & 3 inherit for backend unit/integration tests.
- D-07: Shared test infrastructure (globalSetup, DB helpers, safety guard) lives in a dedicated `backend/test/` directory (singular) -- distinct from the co-located `*.test.js` specs.

**Shared DB Harness Shape**
- D-08: Two-layer harness: (1) Vitest globalSetup (in `backend/test/`) automatically runs guard -> `sync({force:true})` -> teardown for every run; (2) importable helpers (e.g. `resetTables()`, `createTestUser()`) that Phases 2/3 call for per-test row cleanup and fixtures. Global lifecycle is automatic so no suite can skip the isolation guarantee.
- D-09: Phase 1 proof is two focused specs: a trivial smoke spec (proves the runner works -> SPEC req 2) and a separate DB-connect spec running `sequelize.authenticate()` + a trivial User query/count against the provisioned test DB (proves the DB harness -> SPEC req 5).

**Local Developer Provisioning**
- D-10: `portofolio_test` is created for local docker users via a MySQL init script mounted into the `mysql` service in `docker-compose.yml` (`CREATE DATABASE IF NOT EXISTS portofolio_test` + grant the app user access). This is the documented supported path and mirrors how the Phase 6 CI service container will provision the DB. Non-docker devs get the same statement documented as a one-time step.

### Claude's Discretion
- Exact Vitest version pin -- SPEC defers this to research/plan. **Resolved by this research: `vitest@^4.1.10`.**
- Precise filenames within `backend/test/` (e.g. `globalSetup.js`, `db.js`, `guard.js`) and the exact `vitest.config.js` structure -- planner/researcher to determine, respecting D-04..D-08.
- The exact form of the docker-compose init-script mount (`.sql` in a mounted `docker-entrypoint-initdb.d/` vs equivalent) -- planner to determine, respecting D-10.
- Helper API surface beyond `resetTables()`/`createTestUser()` -- add what Phases 2/3 actually need.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope. (Per-test-file DB reset was raised and deferred to Phase 3 if integration tests need stronger isolation than the per-run reset chosen in D-02.)

**Also out of scope per SPEC.md:** Auth token/password/role-guard unit tests (Phase 2); register/login/dashboard/password-reset integration tests (Phase 3); frontend test tooling (Phase 4); root-level combined test command (Phase 6); GitHub Actions CI (Phase 6); coverage reporting/thresholds and linter/formatter (v2 QUAL-01/QUAL-02); any change to application runtime behavior or migrating off `sequelize.sync()`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|---------------------|
| SETUP-01 | Backend has a configured test runner; running `npm test` in the backend workspace executes the suite and reports pass/fail | Standard Stack (Vitest 4.1.10 pin + engine verification), Code Examples (`vitest.config.js` skeleton), Validation Architecture req-1 mapping |
| SETUP-04 | Backend integration tests run against an isolated test database (never dev data), set up and torn down per run | Architecture Patterns (globalSetup/teardown lifecycle diagram + Pattern 1-3), Common Pitfalls 1-4, Code Examples (guard.js, Docker init script), Security Domain (least-privilege GRANT, DB-tampering mitigation) |
</phase_requirements>

## Summary

This phase is a pure test-infrastructure build: install Vitest as the backend's test runner, wire a `test` script, and build a two-layer database harness (Vitest `globalSetup` + importable helpers) around the existing Sequelize instance so integration tests in later phases can run safely against a dedicated `portofolio_test` MySQL database. No application runtime code changes.

The critical runtime fact discovered during research: **the project's Node target is now 24.x everywhere** (`.nvmrc`, `package.json` engines in all three workspaces, both Dockerfiles) — confirmed live via `node --version` (v24.15.0) — even though CLAUDE.md's auto-generated STACK.md snapshot still says "Node 18.x" (stale, predates the upgrade commit). Vitest's latest stable major (4.1.10, published 2026-07-06) declares `engines.node: "^20.0.0 || ^22.0.0 || >=24.0.0"` — Node 24 is explicitly supported. Vitest 5 exists only as a beta (`5.0.0-beta.x`) and should not be used. **Recommendation: pin `vitest@^4.1.10`.**

The database harness design maps cleanly onto Vitest's documented `globalSetup` API (run-once before all test files, teardown after) combined with `pool: 'forks'` + `poolOptions.forks.singleFork: true` to guarantee all test files share one process — avoiding N separate Sequelize connection pools opening against MySQL concurrently. Sequelize's own `sync({ force, match })` API has a **built-in regex safety check** (`match: /_test$/`) that pairs naturally with the custom D-05 guard as defense-in-depth. The Docker-Compose MySQL init-script pattern (`docker-entrypoint-initdb.d/*.sql`) is confirmed via the official `mysql` Docker Hub image docs, including the important caveat that these scripts **only execute on a fresh (empty) data volume** — existing local dev volumes will not pick up the new test-DB init script without a volume reset.

**Primary recommendation:** Vitest 4.1.10, `pool: 'forks'` with `singleFork: true`, `globalSetup` default-export-returns-teardown pattern, `ENV_FILE`/`NODE_ENV` set as the very first statements in `vitest.config.js` (before `defineConfig` import side effects run), Sequelize `sync({ force: true, match: /_test$/ })` + `sequelize.close()` in teardown, and a mounted `.sql` init script for the Docker MySQL service.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Test runner execution (`npm test`) | Backend / Node process (dev tooling) | — | Vitest runs inside the backend workspace's Node process, not the app runtime |
| Test-env variable resolution (`ENV_FILE`, `NODE_ENV`) | Backend / Node process (Vitest config) | — | Mirrors the existing `ENV_FILE` override hook in `backend/src/config/env.js`; no new config layer |
| Test DB schema provisioning (`sync({force})`) | Database / Storage | Backend (Sequelize) | Sequelize (backend tier) drives the operation, but the effect lands in the MySQL storage tier |
| Safety guard (abort on non-test DB) | Backend / Node process (Vitest globalSetup) | — | Pure in-process check before any DB connection is opened; no server involved |
| Test DB provisioning for local/Docker devs | Database / Storage (MySQL container init) | — | `docker-entrypoint-initdb.d` runs inside the MySQL container at first boot, outside the backend process entirely |
| Row-level fixtures/cleanup helpers (`resetTables`, `createTestUser`) | Backend / Node process (test helpers) | Database / Storage | Helpers execute Sequelize queries; the app models/schema they act on are the same backend-tier models used at runtime |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | `^4.1.10` | Test runner (ESM-native, no bundler step) | Locked by CONTEXT.md D-04..D-09 as the runner; latest stable major, confirmed Node 24 support via `engines` field `[VERIFIED: npm registry]` |

No other core packages are required — Vitest ships its own assertion API (`expect`), mocking (`vi`), and runner; no separate `chai`/`jest` needed. Sequelize/mysql2 are already backend dependencies (`sequelize@6.37.8`, `mysql2@3.22.6` — both newer patch versions than the `STACK.md` snapshot recorded; confirmed via `npm view` against the installed `^6.37.5`/`^3.11.5` ranges) `[VERIFIED: npm registry]`.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none)* | — | — | No supporting test libraries needed for Phase 1 (no assertion helpers, no mocking library, no coverage tool — coverage is explicitly deferred to v2 QUAL-01) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Jest's ESM support is still experimental/flag-gated (`--experimental-vm-modules`); Vitest is ESM-native by design and was already locked in CONTEXT.md — not re-litigated here |
| `sequelize.sync({force:true})` globalSetup | `sequelize-cli` migrations run once via a setup script | Explicitly out of scope per SPEC.md ("migrating off `sequelize.sync()`" excluded); `sync` matches current app code (`initializeDatabase()` in `backend/src/models/index.js`) |
| Custom `_test` suffix guard only | Sequelize's built-in `sync({ match: /_test$/ })` only | Use **both** — `match` only guards the `sync()` call itself; the custom guard (D-05) also blocks *any* DB connection (including the connectivity-proof test) before `sync` even runs. They are complementary, not either/or. |

**Installation:**
```bash
npm install --workspace backend --save-dev vitest@^4.1.10
```

**Version verification:** `npm view vitest version` → `4.1.10` (published 2026-07-06, per `npm view vitest time.modified`). `npm view vitest engines` → `{ node: '^20.0.0 || ^22.0.0 || >=24.0.0' }` — confirms compatibility with the installed Node v24.15.0. Vitest 5 is beta-only as of research date (`5.0.0-beta.6`); do not use.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `vitest` | npm | ~4.5 yrs (created 2021-12-03) | 75,033,961 / week | github.com/vitest-dev/vitest | **[SUS]** | **Approved — false positive** |

**slopcheck verdict detail:** `slopcheck install vitest` flagged `vitest` as `[SUS]` with the reason *"Suspiciously close to 'vite'. Could be a typosquat."* This is a name-similarity heuristic false positive: `vitest` is the official companion test runner from the Vite/Vitest core team (`vitest-dev` GitHub org, same ecosystem as `vite`, not a typosquat of it), has 75M weekly downloads, a 4.5-year history, and is the package explicitly named in this project's own `CLAUDE.md` constraints ("Vitest as the single runner across backend and frontend"). Verified independently via `npm view` (registry metadata) and cross-referenced against the official docs at vitest.dev.

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — flagged but overridden as approved per the evidence above; the planner does not need to gate this specific install behind `checkpoint:human-verify`, but should note the slopcheck false-positive in the plan if slopcheck is re-run during execution (so a future run doesn't silently block CI).

## Architecture Patterns

### System Architecture Diagram

```
npm test (backend workspace)
        │
        ▼
vitest.config.js loads
  ├─ process.env.ENV_FILE = <repo>/env/test.env   (set FIRST, before defineConfig import chain resolves)
  ├─ process.env.NODE_ENV = 'test'
  └─ defineConfig({ test: { globalSetup, pool: 'forks', poolOptions.forks.singleFork: true, ... } })
        │
        ▼
Vitest main process runs globalSetup (backend/test/globalSetup.js)
  ├─ imports backend/test/guard.js
  │     └─ throws if NODE_ENV !== 'test' OR DB_NAME does not end with '_test'   ──► ABORT (no connection opened)
  ├─ imports backend/src/config/database.js (sequelize instance; env.js dotenv.config() runs NOW, reading env/test.env)
  ├─ sequelize.authenticate()
  ├─ sequelize.sync({ force: true, match: /_test$/ })   (drops + recreates all tables; second regex safety net)
  └─ returns teardown()
        │
        ▼
Vitest forks ONE child process (singleFork: true) to run all *.test.js files sequentially
  ├─ src/**/*.test.js (co-located specs) — import app modules fresh in this fork; env already correct
  │     ├─ smoke.test.js style trivial assertion (SPEC req 2)
  │     └─ db-connect.test.js — sequelize.authenticate() + trivial User query (SPEC req 5)
  └─ backend/test/helpers.js — resetTables(), createTestUser() available for import by any spec
        │
        ▼
All test files complete → Vitest calls teardown() from globalSetup
  ├─ sequelize.drop()        (drops all tables — no residual rows/schema)
  └─ sequelize.close()       (closes connection pool — process exits cleanly, no hanging handles)
        │
        ▼
Vitest process exits 0 (pass) / non-zero (any failure)
```

### Recommended Project Structure
```
backend/
├── vitest.config.js          # ENV_FILE/NODE_ENV set at top; globalSetup + pool config
├── test/                     # shared infra (D-07) — NOT co-located specs
│   ├── globalSetup.js        # guard → sync({force:true, match}) → returns teardown
│   ├── guard.js               # safety check: NODE_ENV==='test' && DB_NAME ends with '_test'
│   └── helpers.js             # resetTables(), createTestUser() — imported by Phase 2/3 specs
└── src/
    ├── config/
    │   ├── env.js              # unchanged — ENV_FILE hook already exists
    │   └── database.js         # unchanged — sequelize instance driven externally by the harness
    ├── smoke.test.js           # OR co-located under a neutral file — trivial assertion (D-06: src/**/*.test.js)
    └── models/
        └── index.test.js       # example location for the DB-connectivity proof spec (co-located, D-06)
```

Note on proof-spec placement: D-06 says specs are co-located `src/**/*.test.js`. Since Phase 1's two proof specs (smoke + DB-connect) don't naturally belong to one existing source file, a reasonable placement is a small dedicated file each — e.g. `backend/src/smoke.test.js` (no matching `smoke.js` — acceptable for a smoke test) and `backend/src/models/database.test.js` (co-located with `models/index.js`, which owns `initializeDatabase()`). Confirm exact filenames at planning time; not locked by CONTEXT.md.

### Pattern 1: globalSetup with default-export teardown
**What:** A single file exporting a default function that performs setup and returns a teardown function, run once before/after the entire suite.
**When to use:** Exactly Phase 1's case — one-time DB provisioning/teardown shared across all test files, not per-file `beforeAll`/`afterAll`.
**Example:**
```javascript
// Source: https://vitest.dev/config/globalsetup (verified 2026-07-11)
// backend/test/globalSetup.js
import { assertTestDatabase } from './guard.js';

export default async function setup() {
  assertTestDatabase(); // throws before any import of the sequelize instance resolves a connection

  const { sequelize } = await import('../src/config/database.js');
  await sequelize.authenticate();
  await sequelize.sync({ force: true, match: /_test$/ });

  return async function teardown() {
    await sequelize.drop();
    await sequelize.close();
  };
}
```
**Caveat (verified via official docs):** "The global setup is running in a different global scope before test workers are even created, so your tests don't have access to global variables defined here." This means globalSetup and the test files run in separate module registries even under `singleFork: true` — you cannot share an in-memory JS reference (e.g., a live `sequelize` instance object) between globalSetup and test files. Test files must import `sequelize` fresh from `backend/src/config/database.js` themselves (Node's ESM module cache within their own fork will return the same singleton to every test file, since they do share a process when `singleFork: true`).

### Pattern 2: `pool: 'forks'` + `singleFork: true` for shared DB access
**What:** Forces every test file to run inside one single forked child process instead of Vitest's default of parallel isolated processes per file.
**When to use:** Whenever multiple test files need to safely share one external resource (one MySQL connection pool, no risk of two forks racing to `sync({force:true})` against the same schema).
**Example:**
```javascript
// Source: https://vitest.dev/guide/improving-performance + https://vitest.dev/config/pool (verified 2026-07-11)
export default defineConfig({
  test: {
    pool: 'forks',              // default pool already; explicit for clarity
    poolOptions: {
      forks: {
        singleFork: true        // default is false — must set explicitly
      }
    },
    fileParallelism: false      // belt-and-suspenders: no file-level parallel scheduling
  }
});
```
`poolOptions.forks.isolate` defaults to `true` (module registry reset between files even within the same fork) — leave at default; it does not reopen new OS processes/connections, it only resets each file's module cache, which is desirable and harmless here `[CITED: vitest.dev/guide/improving-performance, cross-verified via WebSearch summary of official docs]`.

### Pattern 3: `ENV_FILE`/`NODE_ENV` set at the very top of `vitest.config.js`
**What:** Mutating `process.env` as the first executable statements in the config file, before the `defineConfig` call, so both `globalSetup` (same process) and forked test workers (which inherit `process.env` via Node's `child_process.fork()` default env-copy behavior) see the correct values.
**When to use:** Exactly D-04's locked approach.
**Example:**
```javascript
// backend/vitest.config.js
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
**Verification note [MEDIUM confidence]:** Vitest also exposes a `test.env` config option specifically for passing env vars into test files, but official docs explicitly state its values are **NOT available in `globalSetup`** (`env.md`, verified 2026-07-11) — which rules it out for this use case, since `globalSetup` itself must resolve `env.database.name` correctly to run the guard and `sync()`. The "mutate `process.env` before `defineConfig`" approach was cross-verified against community sources but no single official doc sentence explicitly confirms fork-inheritance; this is standard Node `child_process.fork()` behavior (child processes inherit parent `process.env` by default unless overridden) and is the same pattern this project's own root `npm run dev` script already relies on (`dotenv-cli` setting env before `concurrently` spawns child processes). **Recommend a smoke-test check during planning:** the DB-connectivity proof spec inherently verifies this — if `ENV_FILE`/`NODE_ENV` did not propagate to the fork, `env.database.name` would resolve to the dev DB name and the D-05 guard would either abort (safe failure) or, if the guard also fails to see `NODE_ENV=test`, the connectivity test would target the wrong DB. Because the guard checks both signals independently in globalSetup (same process, not a fork), a propagation failure to the *test-file* fork would still be caught by mismatched behavior in the connectivity test itself — worth an explicit assertion in that spec (e.g., assert `sequelize.config.database` ends with `_test`) as a second-layer proof, not just `authenticate()` succeeding.

### Anti-Patterns to Avoid
- **`pool: 'threads'` for this suite:** Worker threads share the same Node process's memory/module state in ways that can cause subtle Sequelize connection-pool leakage across "isolated" test files; `forks` (the default) with `singleFork: true` is the documented-safe pattern for shared external resources.
- **Opening a new Sequelize connection per test file:** With `singleFork: true` + ESM module caching, importing `backend/src/config/database.js` from multiple test files within the same fork returns the *same* singleton `sequelize` instance — do not manually instantiate a second `new Sequelize(...)` in test helpers; reuse the app's own instance so the harness never drifts from production connection config.
- **Relying only on `env/test.env`'s `DB_NAME` without the runtime guard:** A developer could still accidentally invoke Vitest with a manually-exported `DB_NAME=portofolio` in their shell that overrides the file (dotenv does not override existing `process.env` values by default) — this is exactly why D-05's guard checks the *resolved* `env.database.name` at runtime, not just the file's presence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema reset for test DB | Custom raw `DROP TABLE`/`CREATE TABLE` SQL runner | `sequelize.sync({ force: true })` + `sequelize.drop()` | Already the app's own schema-management mechanism (`initializeDatabase()`); reinventing it risks drifting from the real model definitions |
| DB-name safety check | Only the custom string-suffix guard | ALSO Sequelize's built-in `sync({ match: /_test$/ })` | Free, one-line, exists specifically for this purpose; costs nothing to add as defense-in-depth |
| Env var loading for tests | A second dotenv call inside test files | Reuse the existing `ENV_FILE` hook in `backend/src/config/env.js` | Already parametrized for exactly this purpose; adding a parallel loader risks two different env-resolution code paths diverging |
| Test process orchestration/env injection | `cross-env`/`dotenv-cli` as a new backend devDependency | `process.env.ENV_FILE = ...` at the top of `vitest.config.js` | D-04's explicit rationale: cross-platform without adding a dependency; Node evaluates the config before any test/module load |

**Key insight:** Every piece of this harness has a first-party equivalent already present in the codebase or the Vitest/Sequelize APIs themselves — the entire phase should be "wire together existing capabilities," not "write new database-management code."

## Common Pitfalls

### Pitfall 1: `env/test.env` created but `DB_NAME` doesn't actually reach `env.database.name` before `sync()` runs
**What goes wrong:** `backend/src/config/env.js` runs `dotenv.config({ path: process.env.ENV_FILE || defaultEnvPath })` at **module import time** (top-level side effect, not inside a function). If any module imports `config/database.js` (which imports `config/env.js`) *before* `process.env.ENV_FILE` is set, Node's module cache will have already baked in the wrong (dev) env values, and no amount of setting `ENV_FILE` afterward will re-run `dotenv.config()`.
**Why it happens:** ESM module evaluation order — `import` statements are hoisted and executed in source order the first time a module is loaded; once cached, re-importing does not re-execute top-level code.
**How to avoid:** Set `process.env.ENV_FILE` and `process.env.NODE_ENV` as the literal first lines of `vitest.config.js`, before any `import` of app code (only import `defineConfig` from `vitest/config`, which does not transitively import the app's `env.js`). Inside `globalSetup.js`, only import `../src/config/database.js` (and transitively `env.js`) *after* the guard has already validated `process.env.NODE_ENV`/`DB_NAME` are as expected — but note the guard itself needs `env.database.name`, so the guard must import `env.js` too; make sure `vitest.config.js`'s env mutation happens strictly before Vitest even begins loading `globalSetup.js`.
**Warning signs:** The DB-connectivity test connects successfully but to the *dev* database (silent data risk) — always assert the resolved DB name in the connectivity test itself (see Pattern 3 note above), not just that `authenticate()` didn't throw.

### Pitfall 2: Hanging process / Vitest doesn't exit after tests pass
**What goes wrong:** Vitest reports "there are 1 handle(s) keeping the process running" or hangs indefinitely after the suite finishes, requiring `Ctrl+C` or CI timeout.
**Why it happens:** An open Sequelize connection pool (mysql2 sockets) is a classic Node "keep-alive" handle. If `teardown()` in `globalSetup` is skipped (e.g., an error is thrown mid-suite and Vitest's error path doesn't call the returned teardown function reliably in all Vitest versions/modes), or if `sequelize.close()` is omitted, the process never exits.
**How to avoid:** Always call `sequelize.close()` in the returned teardown function `[VERIFIED: sequelize.org/api/v6 — "Close all connections used by this sequelize instance, and free all references so the instance can be garbage collected"]`. Prefer `pool: 'forks'` over `'threads'` — forked child processes are far less prone to leaking handles that block Node's event loop shutdown (community-reported pattern, `[CITED via WebSearch: vitest-dev/vitest GitHub issues #4526, #4415]`).
**Warning signs:** `npm test` finishes printing pass/fail results but the terminal doesn't return control; CI job runs past its normal duration before eventually timing out.

### Pitfall 3: Docker MySQL init script silently doesn't run
**What goes wrong:** A developer adds the `portofolio_test` init `.sql` script, mounts it into `docker-compose.yml`'s `mysql` service, runs `docker compose up`, and the test database still doesn't exist.
**Why it happens:** The official `mysql` Docker image only executes files in `/docker-entrypoint-initdb.d/` **on first container initialization with an empty data directory** `[CITED: hub.docker.com/_/mysql, verified 2026-07-11]`. Since this project already has a running `mysql_data` named volume (per `docker-compose.yml`) from prior local development, the volume is *not* empty, and the init script is silently skipped on subsequent `docker compose up` runs.
**How to avoid:** Document in the plan/README that existing local devs must either (a) run `docker compose down -v` (destroys the volume — dev data loss, acceptable for a local dev DB) or (b) manually run the `CREATE DATABASE IF NOT EXISTS portofolio_test; GRANT ALL PRIVILEGES ON portofolio_test.* TO '<app_user>'@'%'; FLUSH PRIVILEGES;` statements once against their existing running MySQL container/instance. This must be called out explicitly wherever D-10 is implemented — it is not automatic for existing environments.
**Warning signs:** `sequelize.authenticate()` in the connectivity test throws `ER_BAD_DB_ERROR: Unknown database 'portofolio_test'` despite the init script existing in the repo and being correctly mounted.

### Pitfall 4: MYSQL_USER only has grants on `MYSQL_DATABASE`, not on the new test database
**What goes wrong:** Even after the test DB exists, the app's own DB user (`DB_USER`/`MYSQL_USER`) gets `Access denied` connecting to `portofolio_test`.
**Why it happens:** The official MySQL image docs confirm: `MYSQL_USER`/`MYSQL_PASSWORD` are granted superuser permissions **only for the database specified by `MYSQL_DATABASE`** `[CITED: hub.docker.com/_/mysql, verified 2026-07-11]` — creating a second database via a custom init script does not automatically extend that user's grants to it.
**How to avoid:** The init `.sql` script must include an explicit `GRANT ALL PRIVILEGES ON portofolio_test.* TO '<same MYSQL_USER>'@'%'; FLUSH PRIVILEGES;` statement after `CREATE DATABASE IF NOT EXISTS portofolio_test;` — do not assume the existing app user already has access.
**Warning signs:** `ER_DBACCESS_DENIED_ERROR` in the connectivity test/globalSetup despite the database existing.

## Code Examples

### globalSetup guard (D-05)
```javascript
// Source: pattern derived from CONTEXT.md D-05 + Sequelize match option (sequelize.org/docs/v6)
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

### Docker Compose MySQL init script mount (D-10)
```yaml
# Source: pattern verified via hub.docker.com/_/mysql official image docs
# docker-compose.yml (mysql service — add alongside existing mysql_data volume mount)
services:
  mysql:
    image: mysql:8.4
    volumes:
      - mysql_data:/var/lib/mysql
      - ./backend/test/init/01-create-test-db.sql:/docker-entrypoint-initdb.d/01-create-test-db.sql:ro
```
```sql
-- backend/test/init/01-create-test-db.sql
-- Runs only on first container init with an empty data volume (see Pitfall 3).
CREATE DATABASE IF NOT EXISTS portofolio_test;
GRANT ALL PRIVILEGES ON portofolio_test.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
```
Note: the official MySQL image does **not** interpolate `${MYSQL_USER}` inside mounted `.sql` files (only `.sh` scripts have env access) — the plan must either (a) hardcode the known `DB_USER` value from `env/local.env`/`env/local.container.env` directly in the `.sql` file, or (b) mount a `.sh` init script instead that uses `envsubst`/heredoc with `$MYSQL_USER`. Flagged as an open question below for the planner to resolve with the actual (currently-unread, treated-as-sensitive) `DB_USER` value.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Vitest 3.x pinned for Node 18/20 LTS compatibility | Vitest 4.x, requiring Node `^20 \|\| ^22 \|\| >=24` | Vitest 4.0 (2025) dropped Node 18 support | This project just upgraded to Node 24.x — Vitest 4.1.10 is the correct, currently-supported pin; Vitest 3.x would also work but is not the latest stable |
| `package.json`/`.nvmrc` pinned Node 18.x (per CLAUDE.md/STACK.md snapshot) | Node 24.x everywhere (`.nvmrc`, all `engines.node`, both Dockerfiles) | This session, prior to Phase 1 research | STACK.md/CLAUDE.md's "Node 18.x" references are stale documentation, not the current runtime target — confirmed via direct `node --version` (v24.15.0) and `cat .nvmrc`/`package.json` reads |

**Deprecated/outdated:** None specific to this phase's chosen libraries — Vitest and Sequelize are both actively maintained with no relevant deprecations affecting this use case.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Setting `process.env.ENV_FILE`/`NODE_ENV` at the top of `vitest.config.js` reliably propagates into forked test-worker processes under `pool: 'forks'` (relying on Node `child_process.fork()`'s default env-inheritance, not an explicit Vitest doc statement) | Architecture Patterns > Pattern 3 | If it does NOT propagate to the fork (only to the main process/globalSetup), test files would read `env/local.env` instead of `env/test.env` when they import `config/database.js` fresh in their own fork — connectivity test could silently target the dev DB. Mitigation already recommended: add an explicit DB-name assertion inside the connectivity proof spec, not just a successful `authenticate()`. |
| A2 | `docker-entrypoint-initdb.d/*.sql` files do not support `${VAR}` interpolation (only `.sh` scripts do) | Code Examples > Docker Compose init script | If wrong, the simpler `.sql`-with-interpolation approach would work and the `.sh`-with-envsubst fallback would be unnecessary extra complexity. Low risk either way — plan should verify against the actual `DB_USER` value at implementation time. |

## Open Questions

1. **Exact `DB_USER` value for the GRANT statement in the init script**
   - What we know: `env/local.env` and `env/local.container.env` define `DB_USER`/`MYSQL_USER` (variable names confirmed via `grep`), but per `STRUCTURE.md`'s explicit policy these files are treated as sensitive and their values were not read during this research.
   - What's unclear: Whether the app DB user is literally `portofolio` (matching the DB name convention seen in `backend/src/config/env.js`'s fallback default `'portofolio'`) or something else in the actual `env/local.env`.
   - Recommendation: The planner/implementer should read `env/local.env`'s `DB_USER`/`MYSQL_USER` value directly when writing the init script (a legitimate, necessary read at implementation time, not a research-time read), or use a `.sh` init script with `$MYSQL_USER` (already exported into the MySQL container's own environment by the official image) to avoid hardcoding it at all — this is actually the more robust option since the container already has `MYSQL_USER` available as an env var without needing to duplicate it into the `.sql` file.

2. **Exact filenames for the two proof specs (smoke + DB-connect) under D-06's co-location rule**
   - What we know: D-06 locks `src/**/*.test.js` co-location; D-09 locks "two focused specs."
   - What's unclear: A trivial smoke test doesn't naturally "co-locate" with any existing source file (there's no `smoke.js` to sit beside).
   - Recommendation: Planner's discretion per CONTEXT.md — suggested: `backend/src/smoke.test.js` (root of `src/`, acceptable exception) and `backend/src/models/database.test.js` (co-located with `models/index.js`, which owns `initializeDatabase()`/`sequelize` — the natural home for a DB-connectivity proof).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Running Vitest, backend app | ✓ | v24.15.0 | — |
| npm (workspaces) | `npm install --workspace backend`, `npm test` | ✓ | 11.12.1 | — |
| Docker | Local MySQL via docker-compose (D-10) | ✓ | 29.2.0 | — |
| Docker Compose | `docker-compose.yml` mysql service | ✓ | v5.0.2 | — |
| MySQL client (`mysql` CLI) | Manual verification / one-time GRANT for existing volumes (Pitfall 3) | ✓ | MariaDB client 10.5.29 (via `mysql` binary) | Functionally compatible for basic `CREATE DATABASE`/`GRANT` statements against MySQL 8.4; if full MySQL-protocol fidelity is needed, connect via the `mysql` container itself (`docker compose exec mysql mysql ...`) instead of the host CLI |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** MySQL client is a MariaDB build, not upstream MySQL — acceptable for the simple DDL/GRANT statements this phase needs; if issues arise, fall back to running commands inside the `mysql` Docker container.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 |
| Config file | `backend/vitest.config.js` (new — does not exist yet) |
| Quick run command | `npm test --workspace backend` |
| Full suite command | `npm test --workspace backend` (Phase 1 has only 2 specs; "quick" and "full" are the same command until Phase 2/3 add more) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| SPEC req 1 (Vitest runner configured) | `npm test` executes Vitest, exits 0/non-zero correctly | smoke / tooling | `npm test --workspace backend` | ❌ Wave 0 — `backend/vitest.config.js` + `test` script don't exist yet |
| SPEC req 2 (passing smoke test) | ≥1 trivial passing assertion | unit | `npm test --workspace backend` (runs `src/smoke.test.js` or equivalent) | ❌ Wave 0 |
| SPEC req 3 (dedicated test DB, provisioned + torn down) | Schema exists before run, dropped after, dev DB untouched | integration (observed via globalSetup side effects) | `npm test --workspace backend` (globalSetup runs `sync`/`drop` automatically); manual check: `mysql -e "SHOW TABLES" portofolio_test` should be empty after run completes | ❌ Wave 0 |
| SPEC req 4 (test config separated + safety guard) | Guard aborts run when `NODE_ENV`/`DB_NAME` don't match `_test` pattern | unit (guard function) + manual negative-path check | `npm test --workspace backend` (guard runs every time as part of globalSetup, proving the positive path); negative path: temporarily override `DB_NAME` without `_test` suffix and confirm globalSetup throws (manual/CI-negative-test, not part of the standard green run — see Wave 0 gap below) | ❌ Wave 0 — no automated negative-path test exists in SPEC's scope; SPEC acceptance criterion is satisfied by a documented manual check unless the plan adds a dedicated guard unit test |
| SPEC req 5 (live DB connectivity proof) | `sequelize.authenticate()` + trivial User query succeeds against the provisioned test DB | integration | `npm test --workspace backend` (runs `src/models/database.test.js` or equivalent) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test --workspace backend`
- **Per wave merge:** `npm test --workspace backend` (same command — no larger suite exists yet in Phase 1)
- **Phase gate:** Full suite green (`npm test --workspace backend` exit 0) before `/gsd:verify-work`, PLUS the manual guard negative-path check documented in the plan's verification steps (guard logic is safety-critical and should not rely solely on the "it happened not to trigger" positive-path proof).

### Wave 0 Gaps
- [ ] `backend/vitest.config.js` — framework config, does not exist yet
- [ ] `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/test/helpers.js` — shared harness infra
- [ ] `env/test.env` — new dedicated test env file
- [ ] `backend/src/smoke.test.js` (or equivalent) — SPEC req 2
- [ ] `backend/src/models/database.test.js` (or equivalent) — SPEC req 5
- [ ] `backend/package.json` `test` script + `vitest` devDependency
- [ ] Docker init script (`backend/test/init/*.sql` or `.sh`) + `docker-compose.yml` mount — SPEC req 3/D-10 local provisioning
- [ ] A documented (not necessarily automated) manual procedure for verifying the guard's negative path (SPEC req 4's "abort" behavior) — consider whether the plan should add a small dedicated `guard.test.js` unit test that calls `assertTestDatabase()` directly with mocked/monkey-patched env values, which WOULD be fully automatable and is recommended over a manual-only check

*Recommendation for the planner:* Add a small unit test for `guard.js`'s `assertTestDatabase()` function directly (import it, monkeypatch/stub the env module or pass env as a parameter, assert it throws for bad inputs and doesn't throw for good inputs) — this fully automates SPEC req 4's acceptance criterion instead of leaving it to a manual check, and fits cleanly in D-06's `src/**/*.test.js`... actually `guard.js` lives in `backend/test/`, not `backend/src/`, so per D-07 its test would appropriately live alongside it as `backend/test/guard.test.js` (shared-infra directory, not co-located spec convention) — flag this filename choice for the planner.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|---------------------|
| V2 Authentication | No | Phase 1 adds no auth surface — it is test tooling, not app code |
| V3 Session Management | No | N/A |
| V4 Access Control | Partial | The MySQL init script's `GRANT` statement should scope the app DB user's privileges to only `portofolio_test.*` (least-privilege, matching D-01's existing least-privilege stance for the harness itself — no `CREATE DATABASE`/`DROP DATABASE` grants needed by the app user) |
| V5 Input Validation | No | No user input is processed by this phase's code (test harness, not a request-handling path) |
| V6 Cryptography | No | No new cryptographic code; `env/test.env`'s `JWT_SECRET` can reuse a non-production placeholder value since the test DB/JWTs never face real users |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Test suite accidentally targets and destroys the dev/prod database | Tampering / Elevation of Privilege (wrong-scope DB access) | D-05's two-signal runtime guard (`NODE_ENV==='test'` AND `DB_NAME` ends `_test`) + Sequelize's own `sync({match: /_test$/})` regex check — both must independently agree before any destructive `sync({force:true})`/`drop()` call executes |
| `env/test.env` committed to git with real secrets | Information Disclosure | Per `STRUCTURE.md`, all files under `env/` are treated as sensitive regardless of `.gitignore` state — confirm at implementation time whether `env/local.env`/`remote.env` are actually git-tracked or ignored, and follow the same pattern for `env/test.env` (test DB credentials should be low-value/local-only regardless) |
| Over-privileged DB user (app user granted broad MySQL privileges via a poorly-scoped `GRANT` statement) | Elevation of Privilege | Scope the init script's `GRANT` explicitly to `portofolio_test.*` only, mirroring D-01's least-privilege intent (no superuser, no cross-database grants) |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view vitest version/engines/time.modified/versions`) — verified Vitest 4.1.10 is latest stable, Node 24 supported, Vitest 5 is beta-only
- npm registry (`npm view sequelize/mysql2/@apollo/server version`) — confirmed currently-installed-range-compatible versions
- Live environment probes (`node --version`, `docker --version`, `docker compose version`, `mysql --version`, `cat .nvmrc`, `cat backend/package.json`, `cat package.json`) — confirmed actual runtime state (Node 24.x everywhere)
- https://vitest.dev/config/globalsetup — globalSetup API, teardown patterns, process-isolation caveat (fetched 2026-07-11)
- https://sequelize.org/api/v6/class/src/sequelize.js~sequelize — `close()`, `sync()`, `drop()` method signatures (fetched 2026-07-11)
- https://hub.docker.com/_/mysql — official MySQL image: `MYSQL_USER` grant scope, `docker-entrypoint-initdb.d` execution rules and fresh-volume caveat (fetched 2026-07-11)

### Secondary (MEDIUM confidence)
- https://vitest.dev/guide/improving-performance — pool options (`threads`/`forks`/`vmThreads`), sequential-execution config pattern (WebFetch summary, 2026-07-11)
- WebSearch: `poolOptions.forks.singleFork`/`isolate` defaults (`singleFork: false`, `isolate: true`), cross-referenced against vitest.dev/config/pool listing
- WebSearch: `fileParallelism` default `true`, `--no-file-parallelism` CLI flag
- WebSearch: Sequelize `sync({ match: /_test$/ })` regex safety option, cross-referenced against `sequelize/sequelize` GitHub issue #1797 (feature origin) and #10408 (known interaction with `force: false`)
- WebSearch: Vitest hanging-process root causes (open Sequelize/mysql2 handles), cross-referenced against `vitest-dev/vitest` GitHub issues #4526, #4415 and `sequelize/express-example` issue #80

### Tertiary (LOW confidence)
- `process.env` mutation in `vitest.config.js` propagating to forked workers via Node's default `child_process.fork()` env-inheritance — inferred from Node.js child_process semantics and this project's existing `dotenv-cli` + `concurrently` pattern in root `package.json`, not from an explicit Vitest doc statement confirming fork-level env inheritance. Logged as Assumption A1; mitigation (explicit DB-name assertion in the connectivity spec) recommended regardless.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Vitest version/engines verified directly against npm registry; no ambiguity, CONTEXT.md already locked the runner choice
- Architecture: HIGH — globalSetup, pool/singleFork, and Sequelize sync/close/drop APIs all verified against official docs; only the env-propagation-to-fork detail (Pattern 3) is MEDIUM/inferred, and is called out explicitly with a mitigation
- Pitfalls: HIGH — Docker init-script fresh-volume caveat and MYSQL_USER grant-scope limitation both directly confirmed via the official Docker Hub MySQL image documentation, not just community sources

**Research date:** 2026-07-11
**Valid until:** 2026-08-10 (30 days — Vitest is a fast-moving major-version project; re-verify the pinned version before a long-delayed execution)
