---
phase: 06-root-orchestration-ci-pipeline
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .github/workflows/ci.yml
  - package.json
  - README.md
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 6 adds a GitHub Actions CI workflow (`.github/workflows/ci.yml`), a root `npm test` script, and a "Continuous Integration" section in `README.md`. Overall the wiring is correct: I traced the env chain and confirmed the workflow does not need to pass `ENV_FILE`, because `backend/vitest.config.js` sets `ENV_FILE=env/test.env` and `NODE_ENV=test` internally, and `backend/test/guard.js` refuses to run unless `NODE_ENV=test` and the DB name ends in `_test`. The MySQL service container's `MYSQL_DATABASE=portofolio_test` / `MYSQL_USER=portofolio` / `MYSQL_PASSWORD=portofolio` match `env/test.env`, and MySQL auto-grants the app user full privileges on that database, so `sequelize.sync({ force: true, match: /_test$/ })` works. The hardcoded MySQL credentials are ephemeral CI-service values (non-secret) and are acceptable by design per the phase brief.

I verified the two action version pins against upstream: `actions/checkout@v7` and `actions/setup-node@v6` both resolve to real tags, so they will not break CI. The `on: [push, pull_request]` trigger uses `pull_request` (not `pull_request_target`), which is the safe choice — fork PRs receive a read-only `GITHUB_TOKEN` and no repo secrets, and this workflow references no secrets anyway.

No blockers found. The findings below are documentation inaccuracies introduced/left in the reviewed files, a security-hardening gap in the workflow, and robustness/hygiene improvements.

## Warnings

### WR-01: README CI section falsely claims `npm test` is listed under "Useful scripts"

**File:** `README.md:155`
**Issue:** The new CI section states the workflow "runs the root `npm test` command (the same command listed under 'Useful scripts')." The "Useful scripts" block (`README.md:145-151`) lists only `dev`, `start`, `build`, `docker:local`, and `docker:remote` — `npm test` is not there. The claim is factually wrong and will confuse readers looking for the referenced command.
**Fix:** Either add `npm test` to the Useful scripts block or drop the parenthetical. Example — add to the code block at `README.md:145-151`:
```bash
npm test             # Run the backend + frontend test suites (same command CI runs)
```
and change the sentence to "runs the root `npm test` command".

### WR-02: README states Node.js 18.x but the repo now pins Node 24

**File:** `README.md:3` (also `README.md:7,22`)
**Issue:** The README title/features/requirements describe "Node.js 18" / "Node.js 18.x", but the repo pins Node 24: `.nvmrc` is `24` and root `package.json` `engines.node` is `"24.x"`. The new CI workflow resolves its Node version from `.nvmrc` (`node-version-file: '.nvmrc'`), so CI actually runs on Node 24. A contributor who follows the README (`nvm use` → Node 18, or installs Node 18 to match "requirements") runs on a different major version than CI, which undermines the whole point of this phase (fail loudly and consistently).
**Fix:** Update `README.md` lines 3, 7, and 22 to reference Node.js 24.x to match `.nvmrc` and `package.json` `engines`.

### WR-03: CI workflow has no `permissions` block (over-broad `GITHUB_TOKEN` scope)

**File:** `.github/workflows/ci.yml:5-7`
**Issue:** The workflow declares no `permissions`, so the `GITHUB_TOKEN` inherits the repository/organization default, which can be read/write to contents, packages, etc. This job only checks out code and runs tests, and it executes untrusted PR code (`npm ci` runs install scripts; `npm test` runs test code from the branch under review). Granting the token more than read is unnecessary attack surface. (For fork PRs the token is forced read-only, but same-repo pushes/PRs still get the default scope.)
**Fix:** Add a least-privilege permissions block:
```yaml
permissions:
  contents: read
```
Place it at the workflow top level (after `on:`) or under the `test` job.

## Info

### IN-01: `on: [push, pull_request]` with no `concurrency` group causes duplicate/uncancelled runs

**File:** `.github/workflows/ci.yml:3`
**Issue:** For a branch that has an open PR, both `push` and `pull_request` events fire, running the suite twice. There is also no `concurrency` group, so rapid successive pushes stack up full runs instead of cancelling superseded ones. The phase brief notes the no-branch-filter trigger is deliberate, so this is a hygiene note, not a defect.
**Fix:** Add a concurrency group to auto-cancel superseded runs:
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### IN-02: Job has no `timeout-minutes`

**File:** `.github/workflows/ci.yml:6`
**Issue:** The `test` job sets no `timeout-minutes`. If a test or the DB connection hangs (e.g., MySQL never becomes healthy), the job can run up to the default 6-hour limit, wasting runner minutes and delaying feedback.
**Fix:** Add a bound such as `timeout-minutes: 15` under the `test` job.

### IN-03: `npm test --workspaces` will break CI if a future workspace lacks a `test` script

**File:** `package.json:18`
**Issue:** The root script `"test": "npm test --workspaces"` runs `test` in every workspace. Both `backend` and `frontend` currently define `test`, so it works today. But if any future workspace is added without a `test` script, `npm` fails with "Missing script: test" and CI breaks for an unrelated reason.
**Fix:** Use `"test": "npm test --workspaces --if-present"` to skip workspaces without a `test` script.

### IN-04: MySQL service health check may report healthy before the database is ready

**File:** `.github/workflows/ci.yml:19-23`
**Issue:** The health check is `mysqladmin ping -h localhost`. `mysqladmin ping` returns success (server alive) even when it gets an access-denied response and even against the transient server the MySQL entrypoint runs during first-boot initialization, before `MYSQL_DATABASE`/grants are finalized. This is a known source of flaky "unknown database" / auth failures on the first connection from the job. The 10×10s retry budget usually masks it, but it is not guaranteed.
**Fix:** Make the health check credentialed/DB-aware, e.g. `--health-cmd="mysqladmin ping -h 127.0.0.1 -u portofolio -pportofolio"`, or add an explicit "wait for MySQL" step before `npm test` that polls until a real query against `portofolio_test` succeeds.

---

_Reviewed: 2026-07-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
