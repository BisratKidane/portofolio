# Phase 1: Backend Test Tooling & Test Database — Specification

**Created:** 2026-07-11
**Ambiguity score:** 0.18 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

The backend workspace gains a working Vitest runner (`npm test` reports pass/fail) and a dedicated MySQL test database that is created and torn down per run, isolated from dev data — proven end-to-end by a passing smoke test and a test that connects to the isolated database.

## Background

The backend workspace has no test runner today: `backend/package.json` defines only `dev`, `start`, and `check` scripts, and its only devDependency is `nodemon`. There are no `*.test.js`/`*.spec.js` files. The stack is ESM (`"type": "module"`), Node 18.x, under npm workspaces.

Database access flows through a single module-level Sequelize instance in `backend/src/config/database.js`, built from `env.database.*` in `backend/src/config/env.js`, which loads `env/local.env` via dotenv with an `ENV_FILE` override hook. `initializeDatabase()` (`backend/src/models/index.js`) runs `sequelize.authenticate()` + `sequelize.sync()`. MySQL 8.4 is available via docker-compose or a local MySQL install. The `env/` directory holds `local.env`, `local.container.env`, and `remote.env` — no test env file exists.

This phase builds the *test harness only* — runner, isolated test database, and config separation — so that Phase 2 (backend unit tests) and Phase 3 (backend integration tests) have a foundation to build on. It does not write the auth tests themselves.

## Requirements

1. **Vitest runner configured**: The backend workspace runs its test suite via Vitest.
   - Current: No test runner, no `test` script; devDeps are `nodemon` only
   - Target: Vitest installed as a devDependency, configured for the ESM backend; `npm test --workspace backend` (and `npm test` inside `backend/`) executes the suite and reports pass/fail
   - Acceptance: `npm test` in the backend workspace runs Vitest, exits 0 when tests pass, and exits non-zero when a test fails

2. **Passing smoke test**: At least one trivial test proves the runner executes.
   - Current: No test files exist
   - Target: A smoke test (e.g. asserting a basic truth) is present and passes under Vitest
   - Acceptance: The backend suite contains ≥1 passing test; a green run is observable in the terminal

3. **Dedicated MySQL test database**: Tests run against a separate MySQL database, never dev data.
   - Current: A single Sequelize instance points at the dev database (`env/local.env`); no test database exists
   - Target: Test runs target a distinct MySQL database (e.g. `portofolio_test`) via a dedicated `env/test.env`; the schema is provisioned (`sync`) before the run and torn down (dropped/truncated) after, leaving no residual test data
   - Acceptance: A test authenticates and connects to the test database; after the run the dev database is unmodified and the test database contains no leftover rows from the run

4. **Test config separated from dev config**: A developer cannot accidentally run tests against the dev database.
   - Current: Only dev/container/remote env files exist; nothing distinguishes a test run
   - Target: A dedicated `env/test.env` (distinct `DB_NAME`) is loaded for test runs, PLUS a runtime safety guard that aborts the test setup if the resolved database name is not the designated test database
   - Acceptance: With the test config, the resolved DB name is the test database; forcing a non-test DB name (e.g. the dev DB) causes the guard to abort the run with a clear error before any writes occur

5. **Live-DB connectivity proof**: The harness is proven to actually reach the isolated database.
   - Current: No test exercises the database connection
   - Target: A test performs `sequelize.authenticate()` (or an equivalent trivial query) against the test database within the provision/teardown lifecycle
   - Acceptance: The connectivity test passes against the freshly provisioned test database and the database is torn down afterward

## Boundaries

**In scope:**
- Vitest installed and configured for the backend (ESM) workspace
- `test` script wired into `backend/package.json` so `npm test` works in the workspace
- A dedicated `env/test.env` with a distinct test-database name
- Per-run provisioning (`sync`) and teardown of the test database
- A runtime safety guard preventing tests from targeting a non-test database
- One passing smoke test and one live test-DB connectivity test
- Shared test setup/helpers needed to bootstrap and tear down the DB for later phases

**Out of scope:**
- Auth token / password / role-guard unit tests — Phase 2
- register / login / dashboard / password-reset integration tests — Phase 3
- Frontend test tooling (jsdom + React Testing Library) — Phase 4
- Root-level command running both suites — Phase 6
- GitHub Actions CI and its test-DB service container — Phase 6
- Coverage reporting / thresholds and linter/formatter — deferred to v2 (QUAL-01, QUAL-02)
- Any change to application runtime behavior or migrating off `sequelize.sync()` — this milestone is non-destructive, tests/tooling only

## Constraints

- Must run under the existing ESM + npm-workspaces setup without a bundler rewrite (Node 18.x).
- Tests require a reachable MySQL instance (local or docker-compose `mysql:8.4`); the test database uses the same MySQL dialect as production for integration fidelity and to match the Phase 6 CI service-container approach.
- Must not modify application runtime behavior — additive tooling, config, and test files only.
- The dev database (`env/local.env`) must never be touched by a test run.

## Acceptance Criteria

- [ ] `npm test` in the backend workspace runs Vitest and reports pass/fail (exit 0 on pass, non-zero on failure)
- [ ] The backend suite contains at least one passing smoke test
- [ ] Vitest is present as a backend devDependency and a `test` script exists in `backend/package.json`
- [ ] A dedicated `env/test.env` exists with a test-database name distinct from the dev database
- [ ] The test database is provisioned before the run and torn down after, leaving the dev database unmodified
- [ ] A live connectivity test authenticates against the isolated test database and passes
- [ ] A safety guard aborts the run with a clear error if the resolved DB name is not the designated test database

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                         |
|--------------------|-------|------|--------|-----------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Vitest + dedicated MySQL test DB + proof locked |
| Boundary Clarity   | 0.80  | 0.70 | ✓      | Harness-only scope; auth/CI explicitly excluded |
| Constraint Clarity | 0.78  | 0.65 | ✓      | Real MySQL required; ESM/workspaces preserved |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 7 pass/fail criteria                          |
| **Ambiguity**      | 0.18  | ≤0.20| ✓      |                                               |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective    | Question summary                          | Decision locked                                        |
|-------|----------------|-------------------------------------------|--------------------------------------------------------|
| 1     | Researcher     | How is the isolated test DB realized?     | Dedicated MySQL DB (create/sync + teardown per run)    |
| 1     | Researcher     | Lock the runner or defer to research?     | Lock Vitest now                                        |
| 1     | Boundary Keeper| What is Phase 1's proof-of-done?          | Smoke test + live test-DB connectivity test            |
| 1     | Failure Analyst| How to prevent hitting the dev DB?        | env/test.env distinct DB name + runtime safety guard   |

---

*Phase: 01-backend-test-tooling-test-database*
*Spec created: 2026-07-11*
*Next step: /gsd:discuss-phase 1 — implementation decisions (Vitest config layout, teardown strategy, guard mechanics)*
