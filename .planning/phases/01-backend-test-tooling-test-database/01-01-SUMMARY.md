---
phase: 01-backend-test-tooling-test-database
plan: 01
subsystem: testing
tags: [vitest, npm-workspaces, esm, dotenv, backend]

# Dependency graph
requires: []
provides:
  - "Working Vitest runner wired to backend workspace (`npm test --workspace backend`)"
  - "Dedicated `env/test.env` file, distinct from `env/local.env`, consumed via the existing `ENV_FILE` override hook in `backend/src/config/env.js`"
  - "`backend/vitest.config.js` that mutates `process.env.ENV_FILE`/`NODE_ENV` before Vitest resolves config, using `pool: 'forks'` + `fileParallelism: false` for sequential single-fork execution"
  - "Passing smoke spec (`backend/src/smoke.test.js`) proving the full runner chain works end-to-end"
affects: [01-02-backend-db-harness]

# Tech tracking
tech-stack:
  added: ["vitest@^4.1.10 (backend devDependency)"]
  patterns:
    - "Env-mutation-before-config-resolution: vitest.config.js sets process.env.ENV_FILE/NODE_ENV as the first statements, before importing anything that transitively loads env.js (only imports `defineConfig` from `vitest/config`)"
    - "Vitest 4 top-level pool options: `pool: 'forks'` + `fileParallelism: false` (no nested `poolOptions` — removed in Vitest 4; `fileParallelism: false` alone forces `maxWorkers: 1`, reproducing the old `singleFork: true` behavior)"

key-files:
  created:
    - backend/vitest.config.js
    - env/test.env
    - backend/src/smoke.test.js
  modified:
    - backend/package.json
    - package-lock.json

key-decisions:
  - "Pinned vitest@^4.1.10 exactly as RESEARCH.md specified (Vitest 5 is beta-only, excluded)"
  - "Used `\"test\": \"vitest run\"` (not bare `vitest`) so npm test exits after one run instead of entering watch mode"
  - "env/test.env reuses env/local.env's DB_HOST/PORT/USER/PASSWORD and JWT_SECRET, only DB_NAME and NODE_ENV differ — no separate test-only DB user (least-privilege decision D-01/D-10 deferred to Plan 02's docker-compose grant)"
  - "Dropped the plan's literal `poolOptions: { forks: { singleFork: true } }` snippet — Vitest 4.1.10 (the actual pinned/installed version) removed nested poolOptions; fileParallelism: false alone achieves the same single-worker sequential behavior without the deprecated API"

patterns-established:
  - "vitest.config.js as an env-bootstrap file: process.env mutation happens synchronously before defineConfig() is called, guaranteeing backend/src/config/env.js loads env/test.env instead of env/local.env for the entire test process"

requirements-completed: [SETUP-01]

# Metrics
duration: 12min
completed: 2026-07-11
---

# Phase 01 Plan 01: Backend Vitest Runner Summary

**Backend workspace now runs `npm test` via Vitest 4.1.10 against a dedicated `env/test.env`, proven end-to-end by a passing smoke spec.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-11T21:58:00Z (approx.)
- **Completed:** 2026-07-11T22:11:05Z
- **Tasks:** 3 completed
- **Files modified:** 5 (2 created config, 1 created test, 2 modified package files)

## Accomplishments
- Installed and pinned `vitest@^4.1.10` as a backend devDependency, wired `npm test` to `vitest run`
- Created `backend/vitest.config.js`, which mutates `process.env.ENV_FILE`/`NODE_ENV` before `defineConfig` resolves, ensuring the existing `ENV_FILE` override hook in `backend/src/config/env.js` loads `env/test.env` rather than `env/local.env`
- Created `env/test.env` as a git-tracked, dedicated test env file (`DB_NAME=portofolio_test`) matching the existing `env/local.env` shape
- Added `backend/src/smoke.test.js`, proving the complete chain (`npm test` → `vitest.config.js` env mutation → `pool: forks` → smoke spec) works and exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Vitest devDependency and wire the backend test script** - `ce0e143` (chore)
2. **Task 2: Create backend/vitest.config.js and env/test.env** - `0f6d1c1` (feat)
3. **Task 3: Create the smoke spec and prove `npm test` works end-to-end** - `a969bc0` (test)

**Deviation fix commit:** `00cf21c` (fix) — removed deprecated `poolOptions.forks.singleFork`, discovered while verifying Task 3

## Files Created/Modified
- `backend/vitest.config.js` - Vitest config; mutates `process.env.ENV_FILE`/`NODE_ENV` before `defineConfig`, sets `pool: 'forks'` + `fileParallelism: false`
- `env/test.env` - Dedicated test environment file, `DB_NAME=portofolio_test`, same DB user/host/port as `env/local.env`
- `backend/src/smoke.test.js` - Trivial `describe`/`it`/`expect` spec proving the runner executes
- `backend/package.json` - Added `vitest@^4.1.10` devDependency and `"test": "vitest run"` script
- `package-lock.json` - Updated to resolve the new `vitest` dependency tree

## Decisions Made
- Reused `env/local.env`'s DB credentials and `JWT_SECRET` in `env/test.env` (per plan: no separate test-only DB user this wave; least-privilege grant happens in Plan 02's docker-compose init script)
- Kept `PORT`/`CLIENT_URL`/`CLIENT_ORIGINS` in `env/test.env` for shape-completeness even though Vitest never starts the Express server

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed deprecated `poolOptions.forks.singleFork` from `backend/vitest.config.js`**
- **Found during:** Task 3 (running `npm test --workspace backend` to verify the smoke spec)
- **Issue:** The plan's literal config snippet (`poolOptions: { forks: { singleFork: true } }`) targets a pre-v4 Vitest API. The actually-installed and pinned `vitest@4.1.10` prints `DEPRECATED: test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.` — the option was silently ignored, not applied.
- **Fix:** Removed the nested `poolOptions` block. Verified via Vitest's own type definitions (`node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts`) that `fileParallelism: false` alone already overrides `maxWorkers` to `1`, reproducing the intended single-fork sequential-execution behavior (needed for Plan 02's shared-DB test isolation) without any deprecated nesting.
- **Files modified:** `backend/vitest.config.js`
- **Verification:** `npm test --workspace backend` — no deprecation warning, 1 test file / 1 test passed, exit 0
- **Committed in:** `00cf21c`

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for correctness — the plan's config snippet, if left as-written, would have silently no-opped an intended pool-isolation setting once Plan 02 adds the shared-DB globalSetup. No scope creep; `pool: 'forks'` and `fileParallelism: false` (both already in the plan) are unchanged.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 1 chain (`npm test` → `vitest.config.js` → `env/test.env` → smoke spec) is fully working and verified with exit 0.
- Plan 02 (Wave 2) can now safely add `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/test/helpers.js`, and the DB-connectivity spec on top of this config — `vitest.config.js` intentionally has no `globalSetup` key yet, per this plan's scope boundary.
- No blockers for Plan 02.

---
*Phase: 01-backend-test-tooling-test-database*
*Completed: 2026-07-11*

## Self-Check: PASSED

All created files verified present:
- FOUND: backend/vitest.config.js
- FOUND: env/test.env
- FOUND: backend/src/smoke.test.js
- FOUND: .planning/phases/01-backend-test-tooling-test-database/01-01-SUMMARY.md

All commit hashes verified in git log:
- FOUND: ce0e143 (Task 1)
- FOUND: 0f6d1c1 (Task 2)
- FOUND: 00cf21c (deviation fix)
- FOUND: a969bc0 (Task 3)
- FOUND: 60c4533 (docs: summary)
