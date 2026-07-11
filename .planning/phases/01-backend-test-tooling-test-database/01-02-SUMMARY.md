---
phase: 01-backend-test-tooling-test-database
plan: 02
subsystem: testing
tags: [vitest, sequelize, mysql, docker, database-harness, esm]

# Dependency graph
requires:
  - phase: 01-backend-test-tooling-test-database (Plan 01)
    provides: "Working Vitest runner (backend/vitest.config.js), env/test.env, passing smoke spec"
provides:
  - "D-05 safety guard (backend/test/guard.js) — assertTestDatabase() aborts before any DB connection unless NODE_ENV==='test' AND DB_NAME ends '_test', covered by 3 automated unit tests"
  - "Vitest globalSetup lifecycle (backend/test/globalSetup.js) — guard -> authenticate -> sync({force:true, match:/_test$/}) -> teardown (drop + close), wired into vitest.config.js"
  - "Importable row-level fixture helpers (backend/test/helpers.js) — resetTables(), createTestUser()"
  - "portofolio_test MySQL database provisioned on the running dev container, plus a Docker init script (backend/test/init/01-create-test-db.sh) for fresh-volume/CI provisioning"
  - "Live DB-connectivity proof spec (backend/src/models/database.test.js) — authenticate() + asserts resolved DB name ends in _test + a trivial User query"
affects: [02-backend-unit-tests, 03-backend-integration-tests, 06-ci-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "globalSetup imports the models aggregator (../src/models/index.js), not config/database.js directly — model registration (initUser(sequelize)) is a side effect of importing models/index.js, and sync() only creates tables for models already attached to the sequelize instance at call time"
    - "Guard-throws-Error convention (matching requireAuth/requireAdmin in backend/src/utils/auth.js) applied to assertTestDatabase() — plain Error, synchronous throw, called first"
    - "Docker MySQL init scripts use .sh (not .sql) specifically to access the container's own injected $MYSQL_ROOT_PASSWORD/$MYSQL_USER env vars — the official mysql image only interpolates env vars in .sh init scripts"

key-files:
  created:
    - backend/test/guard.js
    - backend/test/guard.test.js
    - backend/test/globalSetup.js
    - backend/test/helpers.js
    - backend/test/init/01-create-test-db.sh
    - backend/src/models/database.test.js
  modified:
    - backend/vitest.config.js
    - docker-compose.yml

key-decisions:
  - "globalSetup dynamically imports ../src/models/index.js (not ../src/config/database.js) so the User model is registered on the sequelize instance before sync({force:true}) runs — importing config/database.js alone left zero models attached, so sync() silently created no tables (discovered as a bug during Task 3 verification)"
  - "helpers.js imports only { models } from models/index.js, not sequelize — sequelize is unused by resetTables()/createTestUser() as currently scoped; avoided importing a dead reference"
  - "Provisioned portofolio_test directly on the already-running mysql container (idempotent CREATE DATABASE IF NOT EXISTS) in addition to adding the init script, since the existing mysql_data volume predates the script and Docker only runs docker-entrypoint-initdb.d on a fresh/empty volume"

patterns-established:
  - "Two-layer DB test harness: automatic globalSetup lifecycle (schema-level, once per run) + importable helpers (row-level, per-test) — Phase 2/3 specs call resetTables()/createTestUser() for fixtures without touching schema provisioning"
  - "Defense-in-depth DB safety: custom two-signal guard (NODE_ENV + DB_NAME suffix) AND Sequelize's own sync({match: /_test$/}) regex safety net, both independently required before any destructive DDL"

requirements-completed: [SETUP-04]

# Metrics
duration: 2min
completed: 2026-07-11
---

# Phase 01 Plan 02: Backend DB Test Harness Summary

**Vitest globalSetup lifecycle provisions and tears down an isolated `portofolio_test` MySQL database per run, gated by a two-signal safety guard, with row-level fixture helpers and a live connectivity proof spec — full backend suite (6 tests) passes end-to-end against the real, isolated test database.**

## Performance

- **Duration:** ~2 min (execution only; most groundwork was already laid by Plan 01)
- **Started:** 2026-07-11T20:14:30Z
- **Completed:** 2026-07-11T20:16:34Z
- **Tasks:** 3 completed
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- Built the D-05 safety guard (`backend/test/guard.js`) with full positive/negative-path unit test coverage (`backend/test/guard.test.js`) — aborts before any DB connection unless `NODE_ENV==='test'` AND `DB_NAME` ends `_test`
- Wired `backend/test/globalSetup.js` into `backend/vitest.config.js`: guard → authenticate → `sync({force:true, match:/_test$/})` → returns teardown (`drop()` + `close()`)
- Added importable fixture helpers (`backend/test/helpers.js`): `resetTables()`, `createTestUser()`
- Provisioned `portofolio_test` on the running Docker MySQL container and added `backend/test/init/01-create-test-db.sh` (mounted into `docker-compose.yml`) for future fresh-volume/CI provisioning, scoped to `portofolio_test.*` only (least privilege)
- Added the live DB-connectivity proof spec (`backend/src/models/database.test.js`) — authenticates, asserts the resolved DB name ends in `_test`, and runs a trivial `User.count()` query
- `npm test --workspace backend` passes end-to-end: 6/6 tests green (1 smoke + 3 guard + 2 database-connectivity), `portofolio_test` has zero tables after teardown, and the dev `portofolio` database (1 existing user row) is unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the safety guard and its automated unit test** - `27cc949` (test)
2. **Task 2: Write globalSetup + helpers and wire vitest.config.js** - `61e8f27` (feat)
3. **Task 3: Provision portofolio_test, add the Docker init script, write the DB-connectivity spec, and verify end-to-end** - `bf063fa` (test) — includes the globalSetup import-path bug fix (see Deviations)

## Files Created/Modified
- `backend/test/guard.js` - `assertTestDatabase()`, the D-05 two-signal safety check
- `backend/test/guard.test.js` - 3 unit tests: both-signals-good (no throw), bad-NODE_ENV (throws), bad-DB_NAME (throws)
- `backend/test/globalSetup.js` - Vitest globalSetup: guard → authenticate → sync(force) → returns teardown (drop + close)
- `backend/test/helpers.js` - `resetTables()`, `createTestUser()` row-level fixture helpers
- `backend/vitest.config.js` - added `test.globalSetup: ['./test/globalSetup.js']` alongside Wave 1's `pool`/`fileParallelism`
- `backend/test/init/01-create-test-db.sh` - Docker MySQL init script: `CREATE DATABASE IF NOT EXISTS portofolio_test` + scoped `GRANT ... ON portofolio_test.*` using the container's own `$MYSQL_ROOT_PASSWORD`/`$MYSQL_USER`
- `docker-compose.yml` - mounted the init script read-only into the `mysql` service's `volumes:` list
- `backend/src/models/database.test.js` - live DB-connectivity proof spec, co-located with `models/index.js`

## Decisions Made
- `globalSetup.js` imports `../src/models/index.js` (the models aggregator) rather than `../src/config/database.js` directly — this is a deviation from the plan's literal instruction, required for correctness (see Deviations below)
- `helpers.js` imports only `{ models }`, not `sequelize`, since `sequelize` is unused by the two currently-scoped helper functions
- Provisioned `portofolio_test` on the live container immediately (idempotent `CREATE DATABASE IF NOT EXISTS`) rather than requiring a volume reset, preserving existing dev data per RESEARCH.md Pitfall 3 guidance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `globalSetup.js` imported the wrong module, leaving zero models registered before `sync()`**
- **Found during:** Task 3 (running `npm test --workspace backend` to verify end-to-end)
- **Issue:** The plan's action text (and RESEARCH.md/PATTERNS.md's code examples) specified `const { sequelize } = await import('../src/config/database.js')` inside `globalSetup.js`. This imports the raw Sequelize instance directly, but the `User` model is only registered on that instance as a side effect of importing `../src/models/index.js` (which calls `initUser(sequelize)` at module-load time). Since `globalSetup` runs in a separate scope from the test-file fork (per Vitest's own documented globalSetup isolation) and never itself imported `models/index.js`, `sync({force:true, match:/_test$/})` ran against zero registered models — it succeeded but silently created no tables. The full-suite run then failed with `SequelizeDatabaseError: Table 'portofolio_test.users' doesn't exist` on the `User.count()` query in `database.test.js`.
- **Fix:** Changed the dynamic import in `globalSetup.js` from `'../src/config/database.js'` to `'../src/models/index.js'`, which imports the same underlying `sequelize` singleton but also runs `initUser(sequelize)` first, registering the `User` model before `sync()` executes.
- **Files modified:** `backend/test/globalSetup.js`
- **Verification:** `npm test --workspace backend` — 6/6 tests pass; manual check confirmed `users` table exists during the run (implicit, via the passing `User.count()` query) and is dropped after (`SHOW TABLES FROM portofolio_test` returns no rows post-run)
- **Committed in:** `bf063fa` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for correctness — without this fix, `sync({force:true})` would silently no-op every run (no tables ever created), and every future Phase 2/3 test touching the `User` model would fail with the same "table doesn't exist" error. No scope creep; the fix is a one-line import-path change, same lifecycle shape (guard → authenticate → sync → teardown) as planned.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. `portofolio_test` was provisioned directly against the already-running local Docker MySQL container as part of Task 3; the mounted init script (`backend/test/init/01-create-test-db.sh`) automatically provisions it for future fresh-volume or CI environments without further manual steps.

## Next Phase Readiness
- Full backend test harness (Vitest runner + isolated DB lifecycle) is complete and verified end-to-end: `npm test --workspace backend` exits 0 with 6/6 tests passing.
- `portofolio_test` is reachable via the same app DB credentials as `portofolio` (dev), schema is provisioned fresh each run and fully torn down after (zero residual tables/rows), and the dev database is provably unaffected (row count checked before/after).
- Phase 2 (backend unit tests) and Phase 3 (backend integration tests) can now import `resetTables()`/`createTestUser()` from `backend/test/helpers.js` for per-test fixtures, and rely on the globalSetup lifecycle running automatically — no test file needs to manage schema provisioning itself.
- No blockers for Phase 2.

---
*Phase: 01-backend-test-tooling-test-database*
*Completed: 2026-07-11*
