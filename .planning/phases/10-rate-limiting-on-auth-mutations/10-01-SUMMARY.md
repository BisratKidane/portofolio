---
phase: 10-rate-limiting-on-auth-mutations
plan: 01
subsystem: api
tags: [rate-limiting, in-memory-store, tdd, vitest, backend]

# Dependency graph
requires: []
provides:
  - "RATE_LIMITS centralized threshold config (login/register/requestPasswordReset)"
  - "checkAndIncrement(key, max, windowMs, now) fixed-window per-key rate limiter"
  - "resetRateLimitStore() synchronous test-isolation hook"
affects: [10-02-plan, 10-03-plan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level singleton Map + exported functions (mirrors models/index.js), never exported directly"
    - "Injectable clock parameter defaulting to Date.now() for deterministic time-based unit tests without fake timers"

key-files:
  created:
    - backend/src/config/rateLimits.js
    - backend/src/utils/rateLimitStore.js
    - backend/src/utils/rateLimitStore.test.js
  modified: []

key-decisions:
  - "Fixed-window algorithm chosen over sliding-window (Claude's Discretion, CONTEXT.md) — simplest option that satisfies correct expiry + per-key isolation, no smoothing requirement"
  - "Store data-shape is {count, windowStart} per key, not a list of timestamps — O(1) check/increment"

patterns-established:
  - "Rate-limit primitives are framework-free (no Apollo/Express/GraphQL imports) so the plugin in 10-02 can consume both modules as pure functions"

requirements-completed: [RATE-04]

# Metrics
duration: 2min
completed: 2026-07-20
---

# Phase 10 Plan 01: Rate-Limit Config + In-Memory Store Summary

**Fixed-window, per-key rate-limit counter (`checkAndIncrement`) and a centralized threshold map (`RATE_LIMITS`), both framework-free and TDD-proven — the two primitives the Apollo plugin in Plan 10-02 will wire together.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-20T17:59:22Z
- **Completed:** 2026-07-20T18:00:49Z
- **Tasks:** 2 completed
- **Files modified:** 3 (all new)

## Accomplishments
- `RATE_LIMITS` config object hardcoded with the ROADMAP-mandated thresholds: `login: 5/15min`, `register: 5/hour`, `requestPasswordReset: 5/hour` — no `process.env` surface (D-06)
- `checkAndIncrement(key, max, windowMs, now = Date.now())` enforces a fixed-window per-key attempt budget with full key isolation (D-01) and a working injectable clock for deterministic window-reset tests
- `resetRateLimitStore()` synchronously clears all counters, mirroring the existing `resetTables()` test-isolation convention (D-03)
- Full RED->GREEN TDD cycle observed and verified: `test(10-01)` commit (module-resolution failure) precedes `feat(10-01)` implementation commit

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the rate-limit config contract (RATE_LIMITS)** - `359c57d` (feat)
2. **Task 2: TDD the in-memory fixed-window rate-limit store**
   - RED: `7a3b79d` (test) - failing tests, `./rateLimitStore.js` module resolution error confirmed
   - GREEN: `07c448c` (feat) - implementation, all 5 tests pass, full backend suite green (81 tests)

**Plan metadata:** (this commit, following SUMMARY.md)

_Note: TDD task produced 2 commits (test → feat); no refactor step was needed._

## Files Created/Modified
- `backend/src/config/rateLimits.js` - `RATE_LIMITS` plain-object config, 3 operations, hardcoded max/windowMs
- `backend/src/utils/rateLimitStore.js` - module-level singleton `Map`, `checkAndIncrement`, `resetRateLimitStore`
- `backend/src/utils/rateLimitStore.test.js` - 5 Vitest cases: threshold, key isolation, window reset, full clear, default clock

## Decisions Made
- Fixed-window algorithm (not sliding-window) — simplest option satisfying CONTEXT.md's correctness bar (expiry + isolation), left to Claude's Discretion in the plan
- Store entry shape `{ count, windowStart }` keyed by opaque string — O(1) operations, no cleanup/TTL sweep needed since key space is small and bounded (accepted per T-10-01a in the plan's threat model)

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Gate sequence verified in `git log`:
1. RED gate: `7a3b79d test(10-01): add failing tests for rateLimitStore` — confirmed failing on `Cannot find module './rateLimitStore.js'` before any implementation existed
2. GREEN gate: `07c448c feat(10-01): implement fixed-window rate-limit store` — all 5 tests pass after implementation
3. No REFACTOR commit needed — implementation was minimal and clean on first pass

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `RATE_LIMITS` and `checkAndIncrement`/`resetRateLimitStore` are ready for Plan 10-02 to wire into an Apollo `didResolveOperation` plugin
- Both modules are pure/framework-free as required — no Apollo, Express, or GraphQL imports
- `resetRateLimitStore()` is ready to be added to `backend/test/helpers.js` and consumed by future rate-limit test files, alongside the existing `resetTables()` convention
- No blockers for Plan 10-02

---
*Phase: 10-rate-limiting-on-auth-mutations*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commit hashes (`359c57d`, `7a3b79d`, `07c448c`) verified present in `git log`.
