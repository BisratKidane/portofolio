# Phase 6: Root Orchestration & CI Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 6-Root Orchestration & CI Pipeline
**Areas discussed:** Root test command, CI test-DB provisioning, Merge enforcement scope

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Root test command | How one root command runs both suites; local == CI | ✓ |
| CI test-DB provisioning | How GitHub Actions gets MySQL for backend integration tests | ✓ |
| CI job structure | One job vs split jobs vs Node-version matrix | |
| Merge enforcement scope | Trigger scope + what "blocks merge" includes | ✓ |

**Notes:** CI job structure was intentionally not discussed — left to planner discretion (default: single job on Node 18).

---

## Root test command

| Option | Description | Selected |
|--------|-------------|----------|
| `npm test --workspaces` | Root `test` runs each workspace's test script sequentially (backend→frontend); npm-native, no new deps | ✓ |
| Explicit `-w` chain | `npm test -w backend && npm test -w frontend`; same sequential result, explicit names | |
| `concurrently` (parallel) | Run both in parallel; faster but interleaved output | |

**User's choice:** `npm test --workspaces`
**Notes:** Root `package.json` currently has no `test` script — this adds one. CI invokes the same root command (single source of truth). Sequential is also safest given the backend suite owns a shared MySQL DB.

---

## CI test-DB provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Service container + reuse test.env | GitHub Actions `services:` MySQL 8.4 configured to match committed `env/test.env`; tests run as-is | ✓ |
| Service container + injected creds | Same service container, but inject DB creds via workflow env/secrets | |
| docker-compose up mysql | Reuse repo's docker-compose mysql service in the workflow | |

**User's choice:** Service container + reuse test.env
**Notes:** `env/test.env` is committed and defines the `portofolio_test` connection. MySQL 8.4 matches docker-compose. Planner must reconcile the service container's `MYSQL_*`/port with test.env values and handle the `DB_HOST` service-name-vs-localhost case on the runner (CONTEXT D-05).

---

## Merge enforcement scope

| Option | Description | Selected |
|--------|-------------|----------|
| All branches + document protection | Trigger push + PR (all branches); deliverable includes a README/doc note on enabling branch protection to make the check required | ✓ |
| Main only + document protection | Trigger push + PR against default branch only; same protection note | |
| Workflow file only | Ship workflow (push + PR); visible red check only, no branch-protection docs | |

**User's choice:** All branches + document protection
**Notes:** A workflow file alone can't block a merge — that needs a repo-admin branch-protection setting. CI-03 is satisfied by shipping the failing-check mechanism (automated) plus documenting the one-time branch-protection step (enforcement).

---

## Claude's Discretion

- CI job structure — default single job on Node 18 (matches `.nvmrc`/`engines`); matrix/split jobs unnecessary for repo scope.
- npm dependency caching (`actions/setup-node` cache) — nice-to-have, not required.
- Exact workflow filename under `.github/workflows/`.
- Install scoping (`npm ci` at root covers both workspaces via single lockfile).
- Where the branch-protection note lives (README section vs dedicated CI doc).

## Deferred Ideas

None — discussion stayed within phase scope. (Coverage/thresholds QUAL-01, linter gate QUAL-02, E2E E2E-01, and security-bug fixes FIX-01 remain v2 per PROJECT.md.)
