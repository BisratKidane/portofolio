# Phase 6: Root Orchestration & CI Pipeline - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the "runs everywhere" layer on top of the full-stack test suite built in Phases 1–5. It satisfies SETUP-03, CI-01, CI-02, CI-03:

- **SETUP-03:** A single root-level npm command runs both workspace test suites (backend + frontend) in one invocation.
- **CI-01:** A GitHub Actions workflow runs the full test suite on every push and pull request.
- **CI-02:** CI provisions the test-database dependency so the backend integration tests pass in the pipeline exactly as they do locally.
- **CI-03:** A failing test fails the CI run and blocks/flags the merge — a red build is visible on the PR.

It is **non-destructive** (adds a root `test` script + CI config only; no application runtime changes) and **adds no new test coverage** — it orchestrates and enforces the suites that already exist. It does NOT fix any documented security bug (v2 / FIX-01) and does NOT add coverage reporting/thresholds or a linter gate (deferred to v2 — QUAL-01/QUAL-02).

</domain>

<decisions>
## Implementation Decisions

### Root test command (SETUP-03)
- **D-01:** Add a `test` script to the **root `package.json`** defined as **`npm test --workspaces`**. This runs each workspace's existing `test` script (both are `vitest run`) in workspace order — backend, then frontend — **sequentially**. Chosen over an explicit `-w backend && -w frontend` chain (npm-native and needs no hardcoded workspace names) and over `concurrently` parallel execution (sequential keeps failure output readable, and the backend suite owns a shared MySQL DB so serial execution avoids any cross-suite contention). The root `package.json` currently has **no** `test` script — this is a new addition.
- **D-02:** **The CI workflow invokes this same root command** (`npm test` at the repo root) rather than re-listing per-workspace commands. Single source of truth: what runs locally is exactly what runs in CI.

### CI test-database provisioning (CI-02)
- **D-03:** CI provisions MySQL via a GitHub Actions **`services:` container** using **`image: mysql:8.4`** (matches the `docker-compose.yml` mysql service and the local dev DB), with a **health check gate** so the job waits until MySQL is accepting connections before running tests.
- **D-04:** The service container is configured to **match the committed `env/test.env`** (which defines the `portofolio_test` connection). Backend tests then run **as-is** through the existing Phase-1 harness (`backend/vitest.config.js` → `ENV_FILE=env/test.env`, `NODE_ENV=test`, per-run `sync({ force: true, match: /_test$/ })`) with **no env rewriting inside the workflow**. Chosen over injecting DB creds via workflow env/secrets — reusing the committed test env keeps "CI runs exactly what runs locally" intact.
- **D-05 (planner MUST reconcile):** The service container's `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_ROOT_PASSWORD` and the mapped host port must line up **exactly** with `env/test.env`'s `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT`. **Watch item:** GitHub Actions runs the test job on the runner host and reaches a service container over `127.0.0.1:<mapped-port>` — if `env/test.env` sets `DB_HOST` to a Docker service name (e.g. `mysql`) rather than `localhost`/`127.0.0.1`, that must be handled (align the workflow's port mapping to the test.env port, and confirm the host value resolves on the runner). The planner/researcher must read `env/test.env` to confirm the exact values and whether any host override is needed.

### Merge enforcement & triggers (CI-01, CI-03)
- **D-06:** The workflow triggers on **both `push` and `pull_request`, across all branches** (no branch filter). Broad triggering is fine for a solo portfolio repo and guarantees every PR and every pushed branch gets a run.
- **D-07:** "Blocks merge" (CI-03) is delivered as **the workflow file PLUS a short documentation note** (README or a CI section) explaining how to enable GitHub **branch protection** to mark the CI check as *required*. Rationale: a workflow file alone cannot block a merge — that is a repo-admin setting. Shipping the failing-check mechanism + the documented one-time protection step together is what actually satisfies "a red build blocks the merge." The visible failing check is the automated half; the documented branch-protection step is the enforcement half.

### Claude's Discretion
- **CI job structure (not discussed — planner's call):** Default to a **single job on Node 18** (matches `.nvmrc` / `engines: 18.x`) that runs the full root command with the MySQL service attached. A version matrix or split backend/frontend jobs are unnecessary for this repo's scope; if the planner splits jobs, only the backend job needs the DB service.
- **npm dependency caching** in the Actions setup (`actions/setup-node` cache) — nice-to-have for speed; planner discretion, not required by any requirement.
- **Exact workflow filename** under `.github/workflows/` (e.g. `ci.yml` / `test.yml`) — planner's choice.
- **How `npm ci` / install is scoped** in CI (root install covers both workspaces via the single root lockfile) — planner confirms the install step installs all workspaces before running tests.
- **Where the branch-protection note lives** (README section vs a dedicated CI doc) — planner's choice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test harness & DB provisioning (what CI must reproduce)
- `env/test.env` — Committed test env; defines `DB_NAME=portofolio_test`, `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`, `JWT_SECRET`, etc. The MySQL service container config must be reconciled against these values (D-04, D-05). **MUST read to align the service container.**
- `backend/vitest.config.js` — Sets `ENV_FILE`→`env/test.env`, `NODE_ENV=test`, `pool: 'forks'`, `fileParallelism: false`. This is why "run the suite as-is" works once the DB is present.
- `backend/test/globalSetup.js` — Per-run `sync({ force: true, match: /_test$/ })` + teardown; provisions schema against the CI MySQL service automatically.
- `backend/test/guard.js` — `assertTestDatabase()` (requires `NODE_ENV=test` AND DB name ending `_test`); CI must satisfy this or the suite refuses to run.
- `docker-compose.yml` — The `mysql:8.4` service (image, `MYSQL_*` env, `3306`, healthcheck) is the template for the GitHub Actions `services:` container (D-03).

### Orchestration surface (what this phase edits/creates)
- `package.json` (repo root) — `workspaces: ["backend","frontend"]`; currently **no** `test` script. Add `test: "npm test --workspaces"` here (D-01).
- `backend/package.json` — has `test: "vitest run"` (invoked by the root command).
- `frontend/package.json` — has `test: "vitest run"` (invoked by the root command).
- `.nvmrc` / `engines` — Node **18.x**; CI `setup-node` should match.
- `.github/workflows/` — **does not exist yet** (CI is greenfield); the new workflow file lands here (CI-01/CI-03).
- `README.md` — Target for the branch-protection documentation note (D-07); planner may choose a dedicated CI doc instead.

### Prior context (for how the suites behave)
- `.planning/phases/03-backend-integration-tests/03-CONTEXT.md` — How backend integration tests drive Apollo in-process against the `portofolio_test` DB (explains the DB dependency CI-02 must satisfy).
- `.planning/phases/05-frontend-component-tests/05-CONTEXT.md` and `04-frontend-test-tooling/04-CONTEXT.md` — Frontend suite is jsdom-only (no DB) — the frontend half of the root command needs no service container.
- `.planning/codebase/TESTING.md` — Testing overview across the stack.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Both workspaces already expose `test: "vitest run"` → the root command is a thin aggregator (`npm test --workspaces`), not new test logic.
- `docker-compose.yml` mysql service (image/env/health) is a ready-made spec for the GitHub Actions `services:` MySQL container.
- The Phase-1 harness self-provisions schema (`globalSetup` sync + teardown), so CI only needs to supply a reachable, empty MySQL matching `env/test.env` — no migration/seed step required.

### Established Patterns
- npm workspaces + single root `package-lock.json` → one `npm ci` at the root installs both workspaces for CI.
- Node pinned to 18.x everywhere (`.nvmrc`, `engines`, Docker `node:18-alpine`) → CI pins the same.
- Backend tests require a real MySQL (`portofolio_test`); frontend tests are pure jsdom — the asymmetry drives the "backend job needs the DB service, frontend doesn't" note.

### Integration Points
- New: `test` script in root `package.json`; new workflow file under `.github/workflows/`; a branch-protection note in `README.md`.
- No application source, no existing test files, and no workspace-level configs are modified — this phase only adds orchestration + CI glue.

</code_context>

<specifics>
## Specific Ideas

- Root script: `"test": "npm test --workspaces"` — sequential backend→frontend; CI calls this exact root command (D-01/D-02).
- CI DB: GitHub Actions `services: mysql: { image: mysql:8.4, env: {MYSQL_DATABASE: portofolio_test, ...matching env/test.env}, ports: ["3306:3306"], options: --health-cmd mysqladmin ping ... }`; wait for health before tests (D-03/D-04).
- Reconcile service-container env + port with `env/test.env`; handle the `DB_HOST` = service-name-vs-localhost case on the runner (D-05).
- Triggers: `on: [push, pull_request]`, no branch filter (D-06).
- Enforcement: workflow file + README note documenting how to make the CI check a *required* status check via GitHub branch protection (D-07).
- Job: single job, Node 18 via `actions/setup-node`, `npm ci` at root, MySQL service attached, then `npm test` (Claude's discretion default).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

- Coverage reporting / thresholds (QUAL-01) and a linter/formatter CI gate (QUAL-02) — explicitly deferred to v2 (PROJECT.md Deferred Items). Do not add to this phase.
- Full browser E2E tests (E2E-01) — v2.
- Fixing any documented security bug (reset-token leak, JWT-secret fallback, rate limiting) — v2 / FIX-01; CI surfaces the existing suite, it does not remediate bugs.
- CI deploy/publish steps, caching tuning beyond a basic setup-node cache, and multi-OS/multi-Node matrices — out of scope for "run and enforce the test suite."

</deferred>

---

*Phase: 6-Root Orchestration & CI Pipeline*
*Context gathered: 2026-07-12*
