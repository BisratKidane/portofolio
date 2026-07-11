# Phase 1: Backend Test Tooling & Test Database - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the backend **test harness** — a working Vitest runner and an isolated MySQL test database with automatic provisioning, teardown, config separation, and a safety guard — proven end-to-end by a smoke test and a live DB-connectivity test. It does NOT write the auth unit tests (Phase 2) or integration tests (Phase 3); it builds the foundation those phases consume.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `01-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `01-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Vitest installed and configured for the backend (ESM) workspace
- `test` script wired into `backend/package.json` so `npm test` works in the workspace
- A dedicated `env/test.env` with a distinct test-database name
- Per-run provisioning (`sync`) and teardown of the test database
- A runtime safety guard preventing tests from targeting a non-test database
- One passing smoke test and one live test-DB connectivity test
- Shared test setup/helpers needed to bootstrap and tear down the DB for later phases

**Out of scope (from SPEC.md):**
- Auth token / password / role-guard unit tests — Phase 2
- register / login / dashboard / password-reset integration tests — Phase 3
- Frontend test tooling (jsdom + React Testing Library) — Phase 4
- Root-level command running both suites — Phase 6
- GitHub Actions CI and its test-DB service container — Phase 6
- Coverage reporting / thresholds and linter/formatter — deferred to v2 (QUAL-01, QUAL-02)
- Any change to application runtime behavior or migrating off `sequelize.sync()` — non-destructive, tests/tooling only

</spec_lock>

<decisions>
## Implementation Decisions

### Test Database Lifecycle
- **D-01:** The MySQL test database (`portofolio_test`) is **pre-created**, not created by the harness. The harness connects with the ordinary app credentials and manages only *tables* — no `CREATE DATABASE`/`DROP DATABASE` privileges required (least-privilege). Maps cleanly to the Phase 6 CI service container.
- **D-02:** Table state is reset with **`sequelize.sync({ force: true })` once per run** in the Vitest globalSetup (drop + recreate all tables before the suite starts). Individual test files share the schema and own their row-level cleanup.
- **D-03:** End-of-run teardown **drops all tables and closes the Sequelize connection** — leaves no residual rows (satisfies SPEC req 3) and lets Vitest exit cleanly without a hanging connection pool.

### Test Environment & Safety Guard
- **D-04:** Tests load `env/test.env` by reusing the existing `ENV_FILE` override hook in `backend/src/config/env.js`. `ENV_FILE` (absolute path to `env/test.env`) and `NODE_ENV=test` are **set at the top of `vitest.config.js`** (Node evaluates the config before any test/module load) — cross-platform, no new dependency, keeps the npm script a clean `vitest run`. (Chosen over inline `VAR=val` script syntax and over adding `cross-env`/`dotenv-cli` to the backend workspace.)
- **D-05:** A **safety guard runs in the Vitest globalSetup and throws before any DB connection** unless BOTH: `NODE_ENV === 'test'` AND the resolved `DB_NAME` ends with `_test`. Two independent signals catch a wrong env file *and* an accidental dev/prod DB name. The guard aborts the entire run (globalSetup runs once).

### Test File Location & Structure
- **D-06:** Test specs are **co-located** with the code they cover: `src/**/*.test.js` (e.g. `src/utils/auth.test.js`). This is the convention Phases 2 & 3 inherit for backend unit/integration tests.
- **D-07:** Shared test infrastructure (globalSetup, DB helpers, safety guard) lives in a dedicated **`backend/test/`** directory (singular) — distinct from the co-located `*.test.js` specs.

### Shared DB Harness Shape
- **D-08:** Two-layer harness: (1) **Vitest globalSetup** (in `backend/test/`) automatically runs guard → `sync({force:true})` → teardown for every run; (2) **importable helpers** (e.g. `resetTables()`, `createTestUser()`) that Phases 2/3 call for per-test row cleanup and fixtures. Global lifecycle is automatic so no suite can skip the isolation guarantee.
- **D-09:** Phase 1 proof is **two focused specs**: a trivial smoke spec (proves the runner works → SPEC req 2) and a separate DB-connect spec running `sequelize.authenticate()` + a trivial User query/count against the provisioned test DB (proves the DB harness → SPEC req 5).

### Local Developer Provisioning
- **D-10:** `portofolio_test` is created for local docker users via a **MySQL init script mounted into the `mysql` service** in `docker-compose.yml` (`CREATE DATABASE IF NOT EXISTS portofolio_test` + grant the app user access). This is the documented supported path and mirrors how the Phase 6 CI service container will provision the DB. Non-docker devs get the same statement documented as a one-time step.

### Claude's Discretion
- Exact Vitest version pin — SPEC defers this to research/plan.
- Precise filenames within `backend/test/` (e.g. `globalSetup.js`, `db.js`, `guard.js`) and the exact `vitest.config.js` structure — planner/researcher to determine, respecting D-04..D-08.
- The exact form of the docker-compose init-script mount (`.sql` in a mounted `docker-entrypoint-initdb.d/` vs equivalent) — planner to determine, respecting D-10.
- Helper API surface beyond `resetTables()`/`createTestUser()` — add what Phases 2/3 actually need.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/01-backend-test-tooling-test-database/01-SPEC.md` — Locked requirements, boundaries, and acceptance criteria. MUST read before planning.

### Codebase maps
- `.planning/codebase/TESTING.md` — Confirms zero existing test tooling; lists mock candidates and key error paths.
- `.planning/codebase/CONCERNS.md` — Known security bugs (reset-token leak, JWT-secret fallback, no rate limiting) to keep in mind; documented not fixed this milestone.
- `.planning/codebase/STACK.md` — ESM/Node 18/npm-workspaces/Sequelize/MySQL stack details.
- `.planning/codebase/CONVENTIONS.md` — Naming conventions (dotted filenames, camelCase) the test files should match.
- `.planning/codebase/STRUCTURE.md` — Backend directory layout for placing `backend/test/` and co-located specs.

### Code touchpoints (read to implement the harness)
- `backend/src/config/env.js` — The `ENV_FILE` override hook (D-04) and `env.database.*` shape; env is read at module load.
- `backend/src/config/database.js` — The module-level `sequelize` instance the harness drives.
- `backend/src/models/index.js` — `initializeDatabase()` / `sequelize.sync()` pattern the harness mirrors for `sync({force:true})`.
- `backend/package.json` — Where the `test` script and Vitest devDependency are added.
- `env/local.env` — Template/shape for the new `env/test.env` (distinct `DB_NAME=portofolio_test`).
- `docker-compose.yml` — The `mysql` service to mount the test-DB init script into (D-10).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ENV_FILE` override hook in `backend/src/config/env.js` — reused directly to point tests at `env/test.env` (no new env machinery needed).
- `sequelize.sync()` pattern in `backend/src/models/index.js` — the harness reuses this (with `{force:true}`) rather than inventing schema management.
- Root `env/` directory with `local.env`/`local.container.env`/`remote.env` — `env/test.env` slots in alongside them.

### Established Patterns
- ESM throughout (`"type": "module"`) — Vitest chosen partly for native ESM support; no bundler/transpile step.
- npm workspaces — `npm test --workspace backend` is the invocation; backend owns its own Vitest config.
- Dotted/camelCase filenames (CONVENTIONS.md) — co-located specs follow `<name>.test.js`.

### Integration Points
- New code connects at `backend/package.json` (test script + devDep), a new `vitest.config.js`, a new `backend/test/` infra dir, new co-located `*.test.js` specs, a new `env/test.env`, and a MySQL init script wired into `docker-compose.yml`.
- Runtime application code is NOT modified — the harness drives the existing `sequelize` instance and env loader from the outside.

</code_context>

<specifics>
## Specific Ideas

- Test DB name: `portofolio_test` (dev DB is `portofolio`); guard requires a `_test` suffix so future test DBs remain valid.
- Guard placement: Vitest globalSetup, throws before any connection — fail-fast, whole-run abort.
- Two proof specs, not one combined file — cleanly separates "runner works" (req 2) from "DB harness works" (req 5).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Per-test-file DB reset was raised and deferred to Phase 3 if integration tests need stronger isolation than the per-run reset chosen in D-02.)

</deferred>

---

*Phase: 1-Backend Test Tooling & Test Database*
*Context gathered: 2026-07-11*
