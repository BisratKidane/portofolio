---
phase: 01-backend-test-tooling-test-database
verified: 2026-07-11T22:32:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 01: Backend Test Tooling & Test Database Verification Report

**Phase Goal:** The backend workspace has a working test runner and a safe, isolated test database that unit and integration tests can rely on.
**Verified:** 2026-07-11T22:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `npm test` in the backend workspace executes the configured test runner and reports pass/fail | ✓ VERIFIED | Ran `npm test --workspace backend` directly: `Test Files 3 passed (3) / Tests 6 passed (6)`, exit 0. |
| 2 | At least one passing smoke test is observable in the terminal output | ✓ VERIFIED | `backend/src/smoke.test.js` (`describe('smoke', ...)`, `expect(1+1).toBe(2)`) is one of the 3 passing test files in the live run above. |
| 3 | Test configuration is clearly separated from local-dev configuration (a developer cannot accidentally point tests at their dev database) | ✓ VERIFIED | `backend/vitest.config.js` sets `process.env.ENV_FILE`/`NODE_ENV` as literal first statements before `defineConfig`, pointing at `env/test.env` (distinct file, `DB_NAME=portofolio_test`) regardless of ambient shell env — confirmed by attempting to force `ENV_FILE=env/local.env NODE_ENV=development` via shell before invoking vitest; the config file's own mutation won, ignoring the shell override. |
| 4 | Backend tests run against a dedicated MySQL database (`portofolio_test`), never the dev database (`portofolio`) | ✓ VERIFIED | `backend/src/models/database.test.js` asserts `sequelize.config.database` matches `/_test$/` — this ran and passed live. Also confirmed dev DB `portofolio` untouched: `SHOW TABLES FROM portofolio` still shows `users` with 1 row before and after the run. |
| 5 | The test DB schema is provisioned (sync force) before the run and torn down (tables dropped) after, leaving no residual rows | ✓ VERIFIED | Ran full suite, then queried `SHOW TABLES FROM portofolio_test` directly against the live Docker MySQL container — returned zero rows, confirming `globalSetup`'s `sequelize.drop()` executed. |
| 6 | A safety guard aborts the entire test run with a clear error before any DB connection opens, unless `NODE_ENV==='test'` AND `DB_NAME` ends with `_test` | ✓ VERIFIED | Live-broke `env/test.env` (`DB_NAME=portofolio_test` → `DB_NAME=portofolio`), re-ran `npm test --workspace backend`: run aborted immediately with `Error: Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test", got NODE_ENV=test DB_NAME=portofolio...`, thrown synchronously inside `globalSetup` before any DB module executed, npm exited non-zero. File restored afterward (`diff` confirms byte-identical to original; `git status` clean). Also: `backend/test/guard.test.js`'s 3 unit tests (both-good/bad-NODE_ENV/bad-DB_NAME) pass in isolation (`npx vitest run test/guard.test.js` → 3/3 passed). |
| 7 | A live connectivity test authenticates against the provisioned test database and asserts the resolved database name actually ends in `_test` | ✓ VERIFIED | `backend/src/models/database.test.js` contains both assertions (`sequelize.authenticate()` + `expect(sequelize.config.database).toMatch(/_test$/)`) and a `models.User.count()` live query; both specs pass in the live run. |
| 8 | Local Docker developers get `portofolio_test` provisioned via a documented, repeatable path | ✓ VERIFIED | `backend/test/init/01-create-test-db.sh` exists, is executable (`-rwxr-xr-x`), uses container-injected `$MYSQL_ROOT_PASSWORD`/`$MYSQL_USER` (no hardcoded creds), scoped `GRANT ... ON portofolio_test.*` (least privilege). Mounted read-only in `docker-compose.yml`'s `mysql.volumes` (`./backend/test/init/01-create-test-db.sh:/docker-entrypoint-initdb.d/01-create-test-db.sh:ro`). `portofolio_test` confirmed present on the live container (`SHOW DATABASES LIKE 'portofolio_test'` returns a row) — provisioned directly per the plan since the existing volume predates the script (documented, correct handling of Docker's fresh-volume-only init behavior). |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/vitest.config.js` | Vitest runner config; ENV_FILE/NODE_ENV mutation; globalSetup registration | ✓ VERIFIED | Exists, sets `process.env.ENV_FILE`/`NODE_ENV` before `defineConfig`, `pool: 'forks'`, `fileParallelism: false`, `globalSetup: ['./test/globalSetup.js']`. |
| `backend/package.json` | `test` script + vitest devDependency | ✓ VERIFIED | `scripts.test === "vitest run"`, `devDependencies.vitest === "^4.1.10"`, confirmed installed via `npm ls vitest --workspace backend` → `vitest@4.1.10`. |
| `env/test.env` | Dedicated test env config, distinct `DB_NAME` | ✓ VERIFIED | Exists, `DB_NAME=portofolio_test`, `NODE_ENV=test`, distinct file from `env/local.env`. |
| `backend/src/smoke.test.js` | Trivial passing assertion | ✓ VERIFIED | 5 lines, `describe`/`it`/`expect(1+1).toBe(2)`; passes in live run. |
| `backend/test/guard.js` | `assertTestDatabase()` two-signal check | ✓ VERIFIED | Exports `assertTestDatabase`, throws plain `Error` with both expected/actual values when either signal fails. |
| `backend/test/guard.test.js` | Positive + negative-path coverage | ✓ VERIFIED | 30 lines, 3 `it` blocks (both-good, bad-NODE_ENV, bad-DB_NAME); all 3 pass standalone. |
| `backend/test/globalSetup.js` | guard → authenticate → sync(force) → teardown (drop+close) | ✓ VERIFIED | Calls `assertTestDatabase()` before dynamic import of models aggregator; `sequelize.authenticate()`, `sequelize.sync({force:true, match:/_test$/})`; returns teardown calling `sequelize.drop()` + `sequelize.close()`. Confirmed live: tables exist during run (User.count() query succeeds), zero tables after (checked directly against MySQL). |
| `backend/test/helpers.js` | `resetTables()`, `createTestUser()` | ✓ VERIFIED | Both exported; `createTestUser` passes raw `passwordHash` string matching the `beforeCreate` hashing hook convention used by the register resolver. |
| `backend/test/init/01-create-test-db.sh` | Docker MySQL init script | ✓ VERIFIED | Executable, `.sh` (correctly, not `.sql`, to access container env var interpolation), scoped GRANT, mounted in `docker-compose.yml`. |
| `backend/src/models/database.test.js` | Live DB-connectivity proof spec | ✓ VERIFIED | 15 lines, both assertions present and passing live. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `backend/vitest.config.js` | `env/test.env` | `process.env.ENV_FILE` mutation read by `backend/src/config/env.js`'s `dotenv.config()` | ✓ WIRED | Confirmed live — `database.test.js`'s `sequelize.config.database` resolves to `portofolio_test`, proving the env chain propagates into the actual test-worker fork, not just `globalSetup`'s own process. |
| `backend/vitest.config.js` | `backend/test/globalSetup.js` | `test.globalSetup: ['./test/globalSetup.js']` | ✓ WIRED | Present in config; globalSetup demonstrably runs (guard fires when broken, teardown drops tables when working). |
| `backend/test/globalSetup.js` | `backend/test/guard.js` | `assertTestDatabase()` called before any DB import/connection | ✓ WIRED | Textually first statement in `setup()`, confirmed to actually block the run when the guard's conditions fail (live-break test above). |
| `backend/test/globalSetup.js` | `backend/src/models/index.js` (deviation from plan's literal `config/database.js`, documented and correct) | dynamic import + `sequelize.authenticate()/sync()/drop()/close()` | ✓ WIRED | Deviation documented in SUMMARY as a necessary bug fix (importing `config/database.js` alone left zero models registered, causing `sync()` to silently no-op). Live run confirms `User` table is created and torn down correctly with the corrected import. |
| `docker-compose.yml` | `backend/test/init/01-create-test-db.sh` | `mysql` service `volumes` mount into `/docker-entrypoint-initdb.d/` | ✓ WIRED | Mount line present, `portofolio_test` confirmed present on the live container. |

### Data-Flow Trace (Level 4)

Not applicable in the strict UI-rendering sense — this phase produces test infrastructure, not user-facing dynamic data. The equivalent trace (env value → config resolution → live DB connection → real query result) was performed directly:
- `env/test.env`'s `DB_NAME=portofolio_test` → `vitest.config.js` mutation → `env.js`'s `dotenv.config()` → `database.test.js`'s `sequelize.config.database` — confirmed to resolve to the real value (`/_test$/` match), not a stub or hardcoded string, via a live run.
- `globalSetup`'s `sync({force:true})` → real `CREATE TABLE` DDL against MySQL, confirmed by `User.count()` succeeding during the run and `SHOW TABLES` returning empty after teardown.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite passes end-to-end | `npm test --workspace backend` | `Test Files 3 passed (3) / Tests 6 passed (6)`, exit 0 | ✓ PASS |
| Guard unit tests pass standalone | `npx vitest run test/guard.test.js` (from `backend/`) | `Test Files 1 passed (1) / Tests 3 passed (3)` | ✓ PASS |
| Guard blocks a real run when `DB_NAME` doesn't end in `_test` | Edited `env/test.env` to `DB_NAME=portofolio`, re-ran `npm test --workspace backend` | Run aborted: `Error: Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test"...`, npm exited non-zero; file restored, verified byte-identical, `git status` clean | ✓ PASS |
| `portofolio_test` exists and has zero tables post-run (teardown) | `docker compose exec mysql mysql ... SHOW TABLES FROM portofolio_test;` | No rows returned | ✓ PASS |
| Dev DB `portofolio` unaffected by test runs | `docker compose exec mysql mysql ... SHOW TABLES FROM portofolio; SELECT COUNT(*) FROM portofolio.users;` | `users` table present, 1 row (unchanged) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SETUP-01 | 01-01-PLAN.md | Backend has a configured test runner; `npm test` executes the suite and reports pass/fail | ✓ SATISFIED | Live run confirms exit 0, 6/6 passing; REQUIREMENTS.md already marks Complete. |
| SETUP-04 | 01-02-PLAN.md | Backend integration tests run against an isolated test database (never dev data), set up and torn down per run | ✓ SATISFIED | Live DB checks confirm isolation, provisioning, and teardown; dev DB confirmed untouched; REQUIREMENTS.md already marks Complete. |

No orphaned requirements — REQUIREMENTS.md maps only SETUP-01 and SETUP-04 to Phase 1, both declared in plan frontmatter and both verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | Scanned all 11 phase-modified files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" — zero matches. |

### Human Verification Required

None. This phase produces backend tooling/infrastructure only (test runner config, DB harness, Docker init script) — every claim is mechanically verifiable via command execution and direct database inspection, which was performed above rather than relying on SUMMARY.md narration.

### Gaps Summary

No gaps. All 8 merged observable truths (from ROADMAP.md Success Criteria + both plans' frontmatter `must_haves`) are verified against the live codebase and a live-running MySQL container, not just SUMMARY.md claims. Both documented deviations in the SUMMARYs (dropping deprecated `poolOptions.forks.singleFork` for Vitest 4's `fileParallelism: false`; importing `models/index.js` instead of `config/database.js` in `globalSetup.js` so the `User` model is registered before `sync()`) were necessary bug fixes discovered during the executors' own verification, and both are confirmed correct by this independent live run — the full suite passes, the guard genuinely blocks bad configurations, and the dev database is provably untouched.

---

*Verified: 2026-07-11T22:32:00Z*
*Verifier: Claude (gsd-verifier)*
