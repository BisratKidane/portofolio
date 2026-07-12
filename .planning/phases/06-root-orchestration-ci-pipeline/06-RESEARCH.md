# Phase 6: Root Orchestration & CI Pipeline - Research

**Researched:** 2026-07-12
**Domain:** npm workspaces root scripting + GitHub Actions CI (service containers, branch protection)
**Confidence:** HIGH

## Summary

This phase is pure orchestration: wire up a root `npm test` that runs both existing workspace suites, then reproduce that exact command inside a greenfield GitHub Actions workflow with a MySQL service container that matches the committed `env/test.env`. No new test code, no new npm dependencies, no application runtime changes.

Two things emerged from reading the live repo (not from CLAUDE.md/README, which are stale on this point) that materially change what the planner should write:

1. **Node version is 24.x, not 18.x.** `.nvmrc`, all three `package.json` `engines` fields, and the installed local toolchain (`node v24.15.0`, `npm 11.12.1`) all say `24.x`. Commit `2611f27` ("chore: bump Node pin from 18.x to 24.x across workspaces and Docker") already happened. CLAUDE.md and README.md still say "Node.js 18" — that's stale documentation, not the current contract. The CI job must use Node 24, and the safest way to guarantee drift-proof alignment is `node-version-file: '.nvmrc'` in `actions/setup-node` rather than a hardcoded `node-version: 18`.
2. **D-05's feared DB_HOST mismatch does not exist.** `env/test.env` already sets `DB_HOST=127.0.0.1` and `DB_PORT=3306` — it is not using a Docker Compose service name (`mysql`) the way `env/local.container.env`/`env/remote.env` do. A GitHub Actions job running directly on the runner (not inside a container) reaches a `services:` container via `127.0.0.1:<mapped-port>` by design, so `env/test.env` is already runner-compatible with zero edits. The only thing that must line up is the service container's `ports: ["3306:3306"]` mapping and its `MYSQL_DATABASE`/`MYSQL_USER`/`MYSQL_PASSWORD` matching `env/test.env`'s `DB_NAME=portofolio_test` / `DB_USER=portofolio` / `DB_PASSWORD=portofolio`.

**Primary recommendation:** Add `"test": "npm test --workspaces"` to root `package.json` (verified empirically to run backend then frontend sequentially, in `workspaces` array order, and to propagate a non-zero exit code if either fails even though it does not stop early). Add `.github/workflows/ci.yml` triggered on `[push, pull_request]` with a single Node-24 job, a `mysql:8.4` service container seeded to match `env/test.env` exactly, `actions/checkout@v7` + `actions/setup-node@v6` (`node-version-file: '.nvmrc'`, `cache: 'npm'`), `npm ci` at root, then `npm test`. Document required-status-check branch protection in README.md.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Root test orchestration (SETUP-03) | Build/Tooling (root `package.json`) | — | npm workspaces root script is the correct place to aggregate per-workspace `test` scripts; no app tier involved |
| CI workflow execution (CI-01) | CI/CD (GitHub Actions) | — | New concern, no existing tier; lives entirely in `.github/workflows/` |
| Test-DB provisioning in CI (CI-02) | CI/CD (GitHub Actions `services:`) | Database/Storage (MySQL) | The service container *is* the database tier for the duration of the job; existing `backend/test/globalSetup.js` (already Database tier code) provisions schema against it unchanged |
| Merge enforcement (CI-03) | CI/CD (GitHub Actions status check) | Repo admin config (branch protection, not code) | A workflow file only produces a check result; "blocking" requires a GitHub Settings action, documented not automated |

## User Constraints

<user_constraints>

### Locked Decisions (from CONTEXT.md D-01 through D-07)

- **D-01:** Root `package.json` gets `"test": "npm test --workspaces"` (new script; none exists today). Runs backend then frontend, sequentially, via `npm test --workspaces` (npm-native, no hardcoded workspace names, sequential to keep failure output readable and avoid DB contention).
- **D-02:** The CI workflow invokes this exact same root command (`npm test`) rather than re-listing per-workspace commands — single source of truth between local and CI.
- **D-03:** CI provisions MySQL via a GitHub Actions `services:` container using `image: mysql:8.4` (matches `docker-compose.yml`), with a health check gate so the job waits for MySQL readiness before tests run.
- **D-04:** The service container is configured to match the committed `env/test.env` (the `portofolio_test` connection) exactly. Backend tests run as-is through the existing Phase-1 harness (`ENV_FILE=env/test.env`, `NODE_ENV=test`, `sync({ force: true, match: /_test$/ })`) with **no env rewriting inside the workflow**.
- **D-05 (researcher reconciled — see Summary):** Service container `MYSQL_DATABASE`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_ROOT_PASSWORD` and mapped host port must line up exactly with `env/test.env`'s `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT`. **Resolved:** `env/test.env` already uses `DB_HOST=127.0.0.1`, `DB_PORT=3306` — no service-name-vs-localhost mismatch exists. No host override needed; just map the service container's port to `3306:3306` and set `MYSQL_DATABASE=portofolio_test`, `MYSQL_USER=portofolio`, `MYSQL_PASSWORD=portofolio`, `MYSQL_ROOT_PASSWORD=<any value>`.
- **D-06:** Workflow triggers on both `push` and `pull_request`, across all branches (no branch filter).
- **D-07:** "Blocks merge" (CI-03) = the workflow file (produces a red/green check) **plus** a documentation note (README or dedicated CI doc) explaining how to enable GitHub branch protection to mark the CI check as a *required* status check. A workflow alone cannot block a merge — that's a repo-admin setting.

### Claude's Discretion

- **CI job structure:** Default to a single job on Node **24** (see Summary — corrects the CONTEXT.md note which assumed Node 18 from stale docs) that runs the full root command with the MySQL service attached. No version matrix, no split backend/frontend jobs needed; if split, only the backend job needs the DB service.
- **npm dependency caching** in `actions/setup-node` (`cache: 'npm'`) — nice-to-have, not required by any requirement. Recommended: trivial to add, meaningful speedup.
- **Exact workflow filename** under `.github/workflows/` — recommend `ci.yml` (conventional, matches CI-01/CI-03 naming).
- **Install scoping in CI:** `npm ci` at repo root — confirmed below to install both workspaces via the single root `package-lock.json` (lockfileVersion 3, npm-ci-compatible).
- **Where the branch-protection note lives:** recommend a new `## Continuous Integration` section in README.md (existing README already has topic sections like `## Troubleshooting...`, `## Authentication workflow` — this fits the existing structure without a new file).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Explicitly deferred to v2 and NOT part of this phase: coverage reporting/thresholds (QUAL-01), linter/formatter CI gate (QUAL-02), full browser E2E (E2E-01), fixing documented security bugs (FIX-01), CI deploy/publish steps, multi-OS/multi-Node matrices.

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|------------------|
| SETUP-03 | A single root-level command runs both workspace test suites | Verified empirically: `"test": "npm test --workspaces"` at root runs `backend` then `frontend` `test` scripts sequentially (workspace array order), and exits non-zero if either fails. See Code Examples. |
| CI-01 | A GitHub Actions workflow runs the full test suite on every push and pull request | `.github/workflows/ci.yml` with `on: [push, pull_request]`, no branch filter (D-06). Action versions verified live: `actions/checkout@v7` (v7.0.0), `actions/setup-node@v6` (v6.4.0). |
| CI-02 | CI provisions the test-database dependency so backend integration tests pass in the pipeline | `services:` block running `mysql:8.4` with env matching `env/test.env`, health-check gated. Confirmed no `DB_HOST` mismatch (D-05 resolved). `backend/test/globalSetup.js` self-provisions schema — CI needs only a reachable empty DB. |
| CI-03 | CI fails the build (blocks merge) when any test fails | Root `npm test --workspaces` propagates non-zero exit on any workspace failure (verified). Workflow step then fails → red check on PR. "Blocks" requires README-documented branch protection (D-07) — code alone cannot enforce this. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **JavaScript ES Modules, npm workspaces** — no bundler rewrite; this phase adds only a plain npm script and YAML, fully compatible.
- **CLAUDE.md states "Node 18.x"** — this is **stale**. Verified live: `.nvmrc` = `24`, all three `package.json` `engines.node` = `"24.x"`, and commit `2611f27` already bumped the pin. **The plan must target Node 24 in CI**, not 18. Flag this discrepancy explicitly in the plan so it isn't silently "corrected" back to 18 by pattern-matching CLAUDE.md.
- **Non-destructive milestone constraint** — "this milestone must not change application runtime behavior — it only adds tests, tooling, and CI config." Phase 6 fully complies: no `backend/src/**` or `frontend/src/**` edits.
- **Backend integration tests need an isolated test database** — already satisfied by the existing Phase 1/3 harness (`env/test.env`, `globalSetup.js`, `guard.js`); Phase 6 only needs to make that DB reachable in CI, not redesign it.
- **CI: GitHub Actions, running the workspace test suite on push/PR** — directly maps to CI-01/D-06.
- **GSD Workflow Enforcement** — no bearing on research content, procedural note only.

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|---------------|
| `actions/checkout` | `v7` (v7.0.0) | Checks out repo code into the runner workspace | Official GitHub action; required first step of virtually every workflow. **[VERIFIED: GitHub API — `api.github.com/repos/actions/checkout/releases/latest` → `tag_name: v7.0.0`, published 2026-06-18]** |
| `actions/setup-node` | `v6` (v6.4.0) | Installs Node.js matching a version spec, optionally caches npm deps | Official GitHub action for Node toolchains; supports `node-version-file` to read `.nvmrc` directly, keeping CI and local Node pin in sync automatically. **[VERIFIED: GitHub API — `api.github.com/repos/actions/setup-node/releases/latest` → `tag_name: v6.4.0`, published 2026-04-20]** |
| `mysql` (Docker Hub official image) | `8.4` | Test database service container in CI | Matches `docker-compose.yml`'s `image: mysql:8.4` exactly (already the project's chosen MySQL version) — D-03. **[CITED: docker-compose.yml, hub.docker.com/_/mysql]** |
| `vitest` (existing) | `^4.1.10` (already installed both workspaces) | Test runner invoked by `npm test` in each workspace | Already in place from Phases 1–5; this phase does not touch it | **[VERIFIED: backend/package.json, frontend/package.json]** |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| npm workspaces (`--workspaces` flag) | npm 11.x (bundled with Node 24) | Fan out a root script to every workspace's same-named script | Already the project's monorepo mechanism (`workspaces: ["backend","frontend"]` in root `package.json`) — D-01/D-02 |
| `npm ci` | npm 11.x | Deterministic install from `package-lock.json` in CI | Root `package-lock.json` is `lockfileVersion: 3` and covers both workspaces (single lockfile at repo root) — **[VERIFIED: package-lock.json header, `npm ci` local behavior]** |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions `services:` container for MySQL | `mysql-action` marketplace action, or manual `docker run` step | `services:` is the first-party, health-checked, zero-extra-dependency mechanism; matches D-03 exactly and needs no third-party action |
| Sequential `npm test --workspaces` | `concurrently` (already a root devDependency, but only wired for `dev`/`start`) | Rejected per D-01: backend owns a shared MySQL DB, parallel runs risk cross-suite contention; sequential also keeps CI log output readable |
| Single CI job | Matrix (multiple Node versions) or split backend/frontend jobs | Explicitly rejected in CONTEXT.md "Claude's Discretion" as unnecessary scope for this repo |

**Installation:** No new packages. This phase adds zero `dependencies`/`devDependencies`. All tooling (`actions/checkout`, `actions/setup-node`) is referenced by version tag directly in the workflow YAML, not installed via npm.

**Version verification performed:**
```bash
curl -s https://api.github.com/repos/actions/checkout/releases/latest | grep tag_name
# "tag_name": "v7.0.0"  (published_at 2026-06-18)
curl -s https://api.github.com/repos/actions/setup-node/releases/latest | grep tag_name
# "tag_name": "v6.4.0"  (published_at 2026-04-20)
```

## Package Legitimacy Audit

**Not applicable.** This phase installs no new npm packages — it adds a root `package.json` script (plain string, no new dependency), a GitHub Actions workflow YAML referencing first-party GitHub Actions by pinned version tag, and a README documentation section. `slopcheck`/registry verification is not relevant because nothing is being installed via `npm install`.

## Architecture Patterns

### System Architecture Diagram

```text
Developer / GitHub Event
        │
        ├─ Local: `npm test` (repo root)
        │        │
        │        ▼
        │  npm workspaces runner (sequential, workspace-array order)
        │        │
        │        ├─► backend:  vitest run  ──► needs MySQL "portofolio_test" (local docker-compose mysql or existing dev MySQL)
        │        └─► frontend: vitest run  ──► jsdom only, no DB
        │
        └─ push / pull_request  ──►  GitHub Actions runner (ubuntu-latest, single job)
                 │
                 ├─ services: mysql:8.4 container starts, health-checked
                 │        (MYSQL_DATABASE=portofolio_test, MYSQL_USER=portofolio,
                 │         MYSQL_PASSWORD=portofolio, ports 3306:3306)
                 │
                 ├─ actions/checkout@v7          (get repo code)
                 ├─ actions/setup-node@v6        (Node from .nvmrc = 24, npm cache)
                 ├─ npm ci                        (root lockfile → installs backend + frontend)
                 └─ npm test                      (same root command as local)
                          │
                          ├─► backend: ENV_FILE=env/test.env, NODE_ENV=test
                          │       globalSetup.js: guard.js assertTestDatabase()
                          │       → sequelize.sync({force:true, match:/_test$/})
                          │       → connects to 127.0.0.1:3306 (service container, host-mapped)
                          │       → vitest run → teardown drops schema
                          └─► frontend: vitest run (jsdom, no DB)
                                   │
                                   ▼
                          exit code 0 = green check   /   exit code ≠0 = red check on PR
                                   │
                                   ▼
                    (documented, not automated) branch protection
                    marks this check "required" → merge button blocked on red
```

### Recommended Project Structure

```
.github/
└── workflows/
    └── ci.yml           # new — single job: checkout, setup-node, npm ci, npm test
package.json             # root — add "test": "npm test --workspaces"
README.md                # add "## Continuous Integration" section documenting
                          # required-status-check branch protection (D-07)
```

### Pattern 1: npm workspaces root script fan-out

**What:** A root `package.json` script that has npm itself iterate every workspace and run the same-named script in each.
**When to use:** Any monorepo where every workspace already exposes an equivalent script (`test`, here) and you want one command as the single entry point for both humans and CI.
**Example:**
```json
// Source: verified empirically (see Code Examples) — root package.json
{
  "scripts": {
    "test": "npm test --workspaces"
  }
}
```
Running `npm test` at the repo root re-enters this same script name, but because `--workspaces` is present npm fans out to `backend`'s and `frontend`'s own `test` scripts instead of recursing into itself — this is the documented npm workspaces behavior, not infinite recursion.

### Pattern 2: GitHub Actions service container gated by health check

**What:** Declare `services: mysql: {...}` at the job level; GitHub Actions starts the container before any steps run and (with `options: --health-cmd ...`) blocks step execution until the container reports healthy.
**When to use:** Any CI job whose tests need a real running database rather than a mock.
**Example:**
```yaml
# Source: docs.github.com service containers pattern (Postgres reference doc,
# generalized to MySQL per docker-compose.yml's existing healthcheck) +
# multiple cross-verified community examples (ovirium.com, firefart.at, oneuptime.com)
services:
  mysql:
    image: mysql:8.4
    env:
      MYSQL_DATABASE: portofolio_test
      MYSQL_USER: portofolio
      MYSQL_PASSWORD: portofolio
      MYSQL_ROOT_PASSWORD: root_ci_password
    ports:
      - 3306:3306
    options: >-
      --health-cmd="mysqladmin ping -h localhost"
      --health-interval=10s
      --health-timeout=5s
      --health-retries=10
```
Because the job itself runs directly on the `ubuntu-latest` runner (not inside a container), it reaches this service over `127.0.0.1:3306` — exactly what `env/test.env`'s `DB_HOST=127.0.0.1`/`DB_PORT=3306` already expect. No `DB_HOST` override step is needed in the workflow (resolves D-05).

### Anti-Patterns to Avoid

- **Hardcoding `node-version: 18`:** Contradicts the repo's actual pin (24.x) and would silently diverge from local dev/CI as soon as `.nvmrc` changes again. Use `node-version-file: '.nvmrc'` instead.
- **Injecting DB credentials via GitHub Secrets/workflow `env:`:** D-04 explicitly rejects this — reuse the committed, non-sensitive `env/test.env` values as-is so "CI runs exactly what runs locally" holds. These are test-only, non-production credentials already committed to the repo.
- **Running `npm install` instead of `npm ci` in CI:** `npm install` can silently update the lockfile and drift from what's committed; `npm ci` is the standard CI-safe, deterministic install.
- **Believing a workflow file alone blocks merges:** It only produces a check result. Merge blocking is a branch-protection setting configured in GitHub repo Settings — must be documented (D-07), and cannot be committed as code (branch protection API calls are technically possible via `gh api` but out of scope per Claude's Discretion / D-07's own framing as "documented, not automated").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Waiting for MySQL to accept connections before running tests | A custom `wait-for-it.sh` / polling loop step in the workflow | GitHub Actions `services:` `options: --health-cmd/--health-interval/--health-timeout/--health-retries` | First-party mechanism, already proven working in this exact repo's `docker-compose.yml` healthcheck (same `mysqladmin ping` command) — zero new scripts needed |
| Running multiple workspace test suites from one command | A custom shell loop (`for d in backend frontend; do (cd $d && npm test); done`) or `concurrently` | npm workspaces' built-in `--workspaces` flag | Native to npm, already the project's chosen monorepo tool (root `workspaces` array), needs no new dependency, and is explicitly the mechanism D-01 chose |
| Making CI mirror local test config | Duplicating `ENV_FILE`/`NODE_ENV`/DB env vars inline in the workflow YAML | Let `backend/vitest.config.js` and `env/test.env` do what they already do — CI only needs to make the DB *reachable*, not reconfigure the harness | D-04's explicit rationale; also avoids two sources of truth for test env values |

**Key insight:** Every mechanism this phase needs (health-checked service waiting, workspace fan-out, env-driven test config) already exists as a first-party or already-adopted tool in this repo. The entire phase is wiring, not building.

## Common Pitfalls

### Pitfall 1: Assuming Node 18 because CLAUDE.md/README say so

**What goes wrong:** A CI job pinned to `node-version: 18` would technically run (Vitest 4 and the current deps don't strictly require Node 24), but it silently diverges from the actual dev/Docker environment (`node:18-alpine` images no longer match `engines: "24.x"` — Dockerfiles may also be stale; not in this phase's scope to fix, but worth flagging) and could surface subtle Node-version-dependent test behavior differences that never show up locally.
**Why it happens:** CLAUDE.md and README.md were not updated after commit `2611f27` bumped the Node pin from 18.x to 24.x.
**How to avoid:** Use `node-version-file: '.nvmrc'` in `actions/setup-node` so the workflow always tracks whatever `.nvmrc` says, rather than a hardcoded literal. Verified live: `.nvmrc` = `24`.
**Warning signs:** CI passes locally-reproducible tests but on a different Node major than `node --version` reports on the developer's machine.

### Pitfall 2: MYSQL_ROOT_PASSWORD omission

**What goes wrong:** The official `mysql` Docker image requires `MYSQL_ROOT_PASSWORD` (or `MYSQL_ALLOW_EMPTY_PASSWORD`/`MYSQL_RANDOM_ROOT_PASSWORD`) to be set or the container refuses to initialize, and the service never becomes healthy — the job hangs until the health-check retries are exhausted, then fails with an opaque timeout rather than a clear config error.
**Why it happens:** `env/test.env` doesn't define `MYSQL_ROOT_PASSWORD` (it only has `DB_USER`/`DB_PASSWORD` for the app-level `portofolio` user, not root) — a naive "copy env/test.env keys 1:1 into the service `env:` block" approach would leave it unset.
**How to avoid:** Set `MYSQL_ROOT_PASSWORD` to any value directly in the workflow YAML (it is never used by the app or the test harness, only by the image's own bootstrap and the health-check's `mysqladmin ping -u root`). **[VERIFIED: hub.docker.com/_/mysql — "MYSQL_ROOT_PASSWORD is mandatory"]**
**Warning signs:** The `services.mysql` step in the Actions log shows repeated "unhealthy" retries and eventually times out before any test step starts.

### Pitfall 3: `npm test --workspaces` not stopping on first failure (behavior, not a bug)

**What goes wrong:** If backend tests fail, `npm test --workspaces` still runs the frontend suite afterward (verified empirically — see Code Examples) rather than short-circuiting. A planner/reviewer might think this is broken because "CI should fail fast."
**Why it happens:** This is standard npm workspaces behavior: it always attempts a script in every workspace and only propagates a non-zero aggregate exit code at the end.
**How to avoid:** No fix needed — CI-03 only requires that the *overall* command exits non-zero on any failure, which is verified true. Document this as expected behavior (frontend still runs and reports its own results even if backend already failed) rather than treating it as a defect to patch.
**Warning signs:** None — this is correct/expected; flagging only so the planner doesn't "fix" it by adding `--if-present` chaining or `&&`-joined per-workspace commands that would in fact change (and complicate) the D-01-mandated behavior.

### Pitfall 4: GitHub Actions `services:` env vars are not automatically inherited from job-level `env:`

**What goes wrong:** Defining `MYSQL_DATABASE` etc. once at the job or workflow level and expecting the `services.mysql.env` block to pick it up silently — it doesn't; each service's `env:` must be spelled out explicitly inside the `services:` block. **[CITED: WebSearch cross-reference of GitHub Actions services documentation — "Services have stopped automatically receiving all env values from the job-level scope"]**
**Why it happens:** Service containers are a separate execution context from the job's own steps.
**How to avoid:** Duplicate the four `MYSQL_*` values explicitly inside `services.mysql.env:` (not just once at job level) — see Code Examples.
**Warning signs:** MySQL container starts with default/empty credentials, and the app-level `portofolio` user never gets created, causing backend test connection failures despite the health check passing (the health check only verifies MySQL itself is up, not that the target database/user exist).

### Pitfall 5: Confusing "workflow exists" with "merge is blocked"

**What goes wrong:** After adding `ci.yml`, a red check appears on failing PRs, but the "Merge" button in GitHub's UI remains clickable — nothing was actually enforced.
**Why it happens:** GitHub Actions checks are purely informational until a branch protection rule explicitly marks a specific check as "required." This is a one-time repo Settings action, not something expressible in the workflow YAML itself.
**How to avoid:** Ship the README documentation (D-07) describing: Settings → Branches → Branch protection rule → enable "Require status checks to pass before merging" → select the CI workflow's job name as required.
**Warning signs:** A failing PR still shows a green "Merge" button.

## Code Examples

### Root `package.json` test script (D-01) — verified sequential fan-out

```json
// Source: empirically verified in this research session (npm 11.12.1, workspaces array
// ["backend","frontend"]) — a minimal reproduction confirmed backend runs before frontend,
// and a non-zero exit from backend still propagates to the overall exit code even though
// frontend still runs afterward.
{
  "scripts": {
    "test": "npm test --workspaces"
  }
}
```

Empirical verification transcript (scratchpad reproduction, not part of the repo):
```
$ npm test
> npm test --workspaces
> node -e "console.log('BACKEND')"
BACKEND
> node -e "console.log('FRONTEND')"
FRONTEND
```
And with a failing backend script (`process.exit(1)`):
```
$ npm test; echo "EXIT CODE: $?"
BACKEND
npm error Lifecycle script `test` failed with error: npm error code 1 ... workspace backend
FRONTEND
EXIT CODE: 1
```

### `.github/workflows/ci.yml` (D-01 through D-06 combined)

```yaml
# Source: actions/checkout@v7 and actions/setup-node@v6 confirmed live via GitHub API
# (api.github.com/repos/actions/{checkout,setup-node}/releases/latest); services: pattern
# per docs.github.com service-container documentation, generalized from Postgres example
# to MySQL using this repo's own docker-compose.yml healthcheck command.
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_DATABASE: portofolio_test
          MYSQL_USER: portofolio
          MYSQL_PASSWORD: portofolio
          MYSQL_ROOT_PASSWORD: root_ci_password
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=10

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - run: npm test
```

Notes tying this back to the phase's decisions:
- `on: [push, pull_request]`, no `branches:` filter — D-06.
- `services.mysql` matches `env/test.env`'s `DB_NAME=portofolio_test`/`DB_USER=portofolio`/`DB_PASSWORD=portofolio` exactly, and `ports: 3306:3306` matches `DB_PORT=3306` with `DB_HOST=127.0.0.1` requiring no override — D-04/D-05.
- The final `npm test` step is the identical root command a developer runs locally — D-02.
- `npm ci` at root installs both `backend` and `frontend` workspaces from the single root `package-lock.json` (`lockfileVersion: 3`) before `npm test` executes.
- No `ENV_FILE`/`NODE_ENV`/DB credentials are set in the workflow `env:` — the existing `backend/vitest.config.js` already sets `process.env.ENV_FILE` and `process.env.NODE_ENV='test'` itself, exactly as it does locally — D-04.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `node-version: 18` hardcoded (matches stale CLAUDE.md/README) | `node-version-file: '.nvmrc'` reading the repo's actual current pin (24) | Repo already changed at commit `2611f27`; docs haven't caught up | CI must target Node 24 to match the real toolchain, not the documented-but-stale 18 |
| Manual polling loops to wait for a DB in CI | Native GitHub Actions `services:` + `options:` health-check gate | Long-standing GitHub Actions feature, still current best practice | No custom scripting needed; matches this repo's own `docker-compose.yml` healthcheck pattern already |
| `actions/checkout@v4` / `actions/setup-node@v4` (commonly seen in older tutorials) | `actions/checkout@v7`, `actions/setup-node@v6` | v7.0.0 (checkout) published 2026-06-18; v6.4.0 (setup-node) published 2026-04-20 — both confirmed via live GitHub API | Pin to these current majors; many still-circulating examples online reference v3/v4 and are stale |

**Deprecated/outdated:** None specific to this phase beyond the version pins above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MYSQL_ROOT_PASSWORD` value used in the service container (`root_ci_password`) is arbitrary and never consumed by the app or test harness | Code Examples / Pitfall 2 | Low — if wrong, the only effect is the health-check's own `mysqladmin ping -u root -p...` call; any non-empty string works, this is not a security-sensitive value since it never leaves the ephemeral CI container |
| A2 | GitHub-hosted `ubuntu-latest` runners have the `mysql` client CLI available if the planner ever wants a `mysqladmin ping` step outside the service's own internal health check | Architecture Patterns | Low — the health check itself runs *inside* the mysql container image (which always has `mysqladmin`), not on the runner, so this is not actually a dependency; flagged only in case the planner adds an extra runner-side wait step, which is not recommended (avoid — see Don't Hand-Roll) |
| A3 | Backend Dockerfile (`node:18-alpine`) staleness relative to the 24.x `engines` pin is out of scope for this phase and not something Phase 6 should fix | Common Pitfalls / Pitfall 1 | Low for this phase (CI doesn't build/use `backend/Dockerfile`), but worth a one-line flag to the user since it's the same root cause (stale Node pin) surfacing in a second place |

## Open Questions (RESOLVED)

1. **RESOLVED: Does the workflow job name need to exactly match what's typed into GitHub's branch-protection "required status checks" picker?**
   - What we know: GitHub's branch protection UI lists the job's `name:`/`id` (here, `test`) as the selectable check once at least one workflow run has completed.
   - What's unclear: Nothing blocking — this is standard GitHub UI behavior, just worth calling out explicitly in the README note so the documented steps are copy-pasteable.
   - Recommendation: In the README section, tell the user to push once first (so GitHub has seen the check at least once), then go configure branch protection and select the `test` job.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Root `npm test`, all workspace scripts | ✓ | v24.15.0 (matches `.nvmrc`=24) | — |
| npm | `npm ci`, `npm test --workspaces` | ✓ | 11.12.1 | — |
| Docker | Only relevant for locally reproducing the CI MySQL service (not required to write/merge this phase) | ✓ | 29.2.0 | Not needed for CI itself — GitHub-hosted runners provide Docker for `services:` natively |
| `gh` CLI | Optional, for the user to verify workflow runs/branch protection from the terminal instead of the web UI | ✓ | 2.92.0 | Web UI works identically |
| GitHub Actions (`ubuntu-latest` runner) | CI-01/CI-02/CI-03 execution environment | N/A (verified via live GitHub API calls to actions/checkout and actions/setup-node release endpoints) | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — everything required is already present.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (both workspaces, already configured — Phases 1–5) |
| Config file | `backend/vitest.config.js`, `frontend/vitest.config.js` (unchanged by this phase) |
| Quick run command | `npm test` (repo root) — same command CI uses |
| Full suite command | `npm test` (repo root) — this phase has no partial/quick vs. full distinction; it's already the whole suite |

### Phase Requirements → Test Map

This phase's requirements are about orchestration/CI infrastructure itself, not new application behavior, so "tests" here mean verifying the tooling works, not unit/integration tests of app code.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETUP-03 | `npm test` at root runs both suites sequentially and reports pass/fail | manual-only (run and inspect output) | `npm test` (repo root) | ✅ — verifiable immediately once `package.json` is edited |
| CI-01 | Workflow runs on push/PR | manual-only (push a commit/open a PR, inspect Actions tab) | `git push` → check `gh run list` / Actions UI | ❌ Wave 0 — `.github/workflows/ci.yml` must be created |
| CI-02 | Backend integration tests pass in CI against the service-container DB | manual-only (inspect the CI run's backend job log for vitest pass output) | Same `npm test` step in CI, backend portion | ❌ Wave 0 — depends on CI-01's workflow file existing |
| CI-03 | A failing test produces a red/failed check | manual-only (temporarily break a test, push, confirm red check, then revert) | Push a deliberately-failing commit to a scratch branch, observe Actions run status = failure, then revert/discard | ❌ Wave 0 — same workflow file; verification is a one-time manual smoke test, not a permanent automated test |

### Sampling Rate

- **Per task commit:** `npm test` locally (verifies SETUP-03's script works before pushing).
- **Per wave merge:** Push to a branch/open a PR and watch the Actions run complete (verifies CI-01/CI-02).
- **Phase gate:** One deliberate failing-test smoke test (verifies CI-03 actually turns the check red) — recommended as an explicit verification task in the plan, e.g. temporarily change an `expect` in an existing backend test to a wrong value, push to a scratch branch, confirm the Actions check fails, then revert. Do not leave a broken test committed.

### Wave 0 Gaps

- [ ] `.github/workflows/ci.yml` — does not exist yet (CI is greenfield); required for CI-01/CI-02/CI-03 verification.
- [ ] Root `package.json` `test` script — does not exist yet; required for SETUP-03 verification and is also what CI-01's workflow invokes.

*(No test framework/fixture gaps — Vitest is already fully configured in both workspaces from prior phases; this phase's "gaps" are the orchestration artifacts themselves, not test infrastructure.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | This phase touches no auth code |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | No | N/A |
| V6 Cryptography | No | N/A |
| V14 Configuration (closest fit — CI/CD & secrets handling) | Yes | Do not introduce real secrets into the workflow; reuse the already-committed, non-production `env/test.env` values (D-04) and use an arbitrary throwaway value for `MYSQL_ROOT_PASSWORD` in the service container. No `GITHUB_TOKEN`-scoped write permissions are needed — default read-only `permissions:` is sufficient since this workflow only runs tests. |

### Known Threat Patterns for GitHub Actions CI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Workflow triggers on `pull_request` from forks executing arbitrary code with repo secrets | Elevation of Privilege | Not a concern here — this workflow uses no secrets at all (test env is committed, non-sensitive); `pull_request` (not `pull_request_target`) already runs with restricted, read-only default token permissions for fork PRs |
| Unpinned/floating action versions (`@main`, `@v1` without minor) drifting to a compromised update | Tampering | Pin to specific major version tags as verified live (`actions/checkout@v7`, `actions/setup-node@v6`) — both are GitHub's own first-party actions, low supply-chain risk, but pinning to a major (not a mutable branch) is still the standard practice |
| Accidentally committing production secrets into `env:` blocks when "matching env/test.env" | Information Disclosure | Explicitly avoided by design (D-04): `env/test.env` contains only test-only, throwaway credentials (`portofolio`/`portofolio`, `change-me-local-jwt-secret`) already committed to the repo — nothing new or sensitive is added |

## Sources

### Primary (HIGH confidence)
- GitHub REST API `api.github.com/repos/actions/checkout/releases/latest` — confirmed `actions/checkout` latest tag `v7.0.0`, published 2026-06-18
- GitHub REST API `api.github.com/repos/actions/setup-node/releases/latest` — confirmed `actions/setup-node` latest tag `v6.4.0`, published 2026-04-20
- Local empirical reproduction (npm 11.12.1, Node v24.15.0) confirming `npm test --workspaces` sequential execution order and non-zero exit code propagation on failure
- `env/test.env`, `docker-compose.yml`, `backend/vitest.config.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `package.json`, `backend/package.json`, `frontend/package.json`, `.nvmrc`, `package-lock.json` — all read directly from the live repo

### Secondary (MEDIUM confidence)
- docs.github.com service-container documentation pattern (Postgres reference page, generalized to MySQL per this repo's own `docker-compose.yml` healthcheck command, cross-verified against `hub.docker.com/_/mysql` for required/optional env vars)
- `actions/setup-node` README (`raw.githubusercontent.com/actions/setup-node/v6/README.md`) — confirmed `node-version-file` and `cache: 'npm'` inputs

### Tertiary (LOW confidence)
- WebSearch aggregation of community MySQL-in-GitHub-Actions blog posts (ovirium.com, firefart.at, oneuptime.com) used only to cross-verify the health-check `options:` syntax pattern already independently confirmed by the official docs generalization and this repo's own `docker-compose.yml`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — action versions verified via live GitHub API calls, not training data
- Architecture: HIGH — every piece (workspaces fan-out, service container health-check, env alignment) verified either empirically or against the live repo's own existing files
- Pitfalls: HIGH — MySQL image env requirements verified against Docker Hub docs; npm workspaces sequential/exit-code behavior verified by direct local reproduction

**Research date:** 2026-07-12
**Valid until:** 30 days (stable domain — npm workspaces behavior and GitHub Actions core mechanics change rarely; re-check action version pins if this research is reused after ~30 days, since `actions/checkout`/`actions/setup-node` do cut new majors periodically)
