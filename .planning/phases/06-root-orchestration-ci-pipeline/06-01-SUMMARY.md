---
phase: 06-root-orchestration-ci-pipeline
plan: 01
subsystem: infra
tags: [npm-workspaces, github-actions, ci, mysql, vitest]

# Dependency graph
requires:
  - phase: 01-backend-test-tooling
    provides: "backend `npm test` (vitest run) with isolated env/test.env-driven test database"
  - phase: 04-frontend-test-tooling
    provides: "frontend `npm test` (vitest run) with RTL + jsdom"
provides:
  - "Root-level `npm test` fanning out to both workspaces sequentially (SETUP-03)"
  - "GitHub Actions CI workflow (.github/workflows/ci.yml) running on every push/PR against a health-checked mysql:8.4 service container matching env/test.env"
  - "README documentation for the one-time branch-protection setup that makes CI merge-blocking (D-07)"
affects: [ci-pipeline, deployment, branch-protection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "npm workspaces `--workspaces` flag for root-level fan-out commands (test script mirrors this for future scripts)"
    - "GitHub Actions `services:` block with literal (non-interpolated) env values, since Actions services do not inherit job-level `env:` or Compose-style `${VAR}` interpolation"

key-files:
  created:
    - .github/workflows/ci.yml
  modified:
    - package.json
    - README.md

key-decisions:
  - "npm-native `npm test --workspaces` chosen over a manual `-w backend && -w frontend` chain or `concurrently` parallel execution — sequential avoids cross-suite contention on the shared MySQL DB and keeps failure output readable"
  - "CI workflow invokes the exact same `npm test` script Task 1 added — no CI-only test command, so 'what runs locally is exactly what runs in CI'"
  - "Node version driven by `node-version-file: '.nvmrc'` (resolves to 24.x) rather than a hardcoded `node-version: 18`, since the repo's actual pin (.nvmrc, all three package.json engines.node) is 24.x even though README prose still says Node 18 (pre-existing, out of scope for this plan)"
  - "MYSQL_ROOT_PASSWORD set to an arbitrary throwaway literal (`root_ci_password`) — required by the official mysql image bootstrap/healthcheck but never read by the app or test harness"
  - "No ENV_FILE/NODE_ENV/DB_* overrides added inside the workflow — backend/vitest.config.js and backend/test/guard.js already own and enforce that, per D-04"

patterns-established:
  - "Root package.json scripts fan out to workspaces via `--workspaces`; future cross-workspace commands (lint, build-all, etc.) should follow the same pattern rather than manual workspace chaining"

requirements-completed: [SETUP-03, CI-01, CI-02, CI-03]

# Metrics
duration: 3min
completed: 2026-07-12
---

# Phase 6 Plan 1: Root Orchestration & CI Pipeline Summary

**Root `npm test` fans out to both workspaces via `--workspaces`, and a new GitHub Actions workflow reproduces that exact command on every push/PR against a health-checked mysql:8.4 service container matching env/test.env credentials.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-12T13:44:00Z (approx.)
- **Completed:** 2026-07-12T13:45:41Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- A single `npm test` at the repo root runs both backend (9 files, 39 tests) and frontend (4 files, 12 tests) Vitest suites in one invocation, exiting 0 on success.
- `.github/workflows/ci.yml` triggers on every push and pull_request (no branch filter), provisions a health-checked `mysql:8.4` service container with credentials/port matching `env/test.env` exactly, and runs the identical root `npm test` command with pinned `actions/checkout@v7` / `actions/setup-node@v6` and `.nvmrc`-driven Node 24.
- README.md documents the one-time GitHub branch-protection step (Settings -> Branches -> Require status checks -> select `test` job) needed to make the CI check actually block a merge.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add root-level npm test script** - `d6882ad` (feat)
2. **Task 2: Create the GitHub Actions CI workflow** - `62b5b04` (feat)
3. **Task 3: Document the branch-protection step in README** - `04fd308` (docs)

**Plan metadata:** (pending — see final commit below)

## Files Created/Modified

- `package.json` - Added `"test": "npm test --workspaces"` as the last script entry, no other keys touched.
- `.github/workflows/ci.yml` - New CI workflow: `on: [push, pull_request]`, `test` job on `ubuntu-latest`, `mysql:8.4` service with literal env credentials matching `env/test.env`, health-checked, port `3306:3306`; steps: `actions/checkout@v7`, `actions/setup-node@v6` (`.nvmrc`-driven), `npm ci`, `npm test`.
- `README.md` - New `## Continuous Integration` section inserted after `## Useful scripts`, documenting what `ci.yml` runs and the one-time branch-protection setup steps.

## Decisions Made

None beyond what's captured in `key-decisions` above — plan executed exactly as specified, including the explicit interface values (image tag, action versions, credential mapping, `.nvmrc` usage) provided in the plan's `<interfaces>` block.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep-based structural checks for Task 2, H2-section-count and content checks for Task 3, local `npm test` exit-0 verification for Task 1) passed on first attempt with no auto-fixes required.

## Issues Encountered

None.

## User Setup Required

No environment variables or dashboard configuration needed for the workflow itself. The one manual, one-time step is documented in README.md's new "Continuous Integration" section: after this plan's commits are pushed, a repository admin must go to GitHub Settings -> Branches -> add/edit a branch protection rule -> enable "Require status checks to pass before merging" -> select the `test` job (only selectable after the workflow has run at least once).

## Next Phase Readiness

- SETUP-03, CI-01, CI-02 are fully satisfied by working, verified artifacts (root `npm test` exits 0 locally; `ci.yml` passes all structural acceptance checks).
- CI-03's mechanism (a failing test produces a non-zero `npm test` exit, failing the workflow) is fully wired; the human-facing enablement half (branch protection) is documented but requires a one-time manual GitHub Settings action outside this executor's reach — tracked as "User Setup Required" above, not a blocker for plan completion.
- This is Plan 1 of 2 in Phase 6 (root-orchestration-ci-pipeline) — Plan 2 remains to be executed per STATE.md.

---
*Phase: 06-root-orchestration-ci-pipeline*
*Completed: 2026-07-12*

## Self-Check: PASSED

All claimed files (`package.json`, `.github/workflows/ci.yml`, `README.md`, this SUMMARY.md) verified present on disk. All claimed commit hashes (`d6882ad`, `62b5b04`, `04fd308`) verified present in `git log`.
