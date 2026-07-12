---
phase: 04-frontend-test-tooling
plan: 01
subsystem: testing
tags: [vitest, jsdom, react-testing-library, jest-dom, user-event, vite-plugin-react]

# Dependency graph
requires:
  - phase: 01-backend-test-tooling-test-database
    provides: Standalone vitest.config.js shape, co-located *.test.* spec convention, dedicated test/ infra dir convention, explicit vitest imports (no globals)
provides:
  - Working `npm test --workspace frontend` command running Vitest in jsdom
  - Standalone frontend/vitest.config.js (react plugin + jsdom + setupFiles, vite.config.js untouched)
  - Shared frontend/test/setup.js: jest-dom matcher registration, window.matchMedia stub, RTL afterEach(cleanup)
  - Full RTL kit installed as frontend devDependencies for Phase 5 component tests
  - Throwaway proof spec (frontend/src/harness.test.jsx) demonstrating the full render/query/matcher chain
affects: [05-frontend-component-tests, 06-ci-pipeline]

# Tech tracking
tech-stack:
  added: [vitest@4.1.10, jsdom@26.1.0, "@testing-library/react@16.3.2", "@testing-library/jest-dom@6.9.1", "@testing-library/user-event@14.6.1"]
  patterns:
    - "Standalone frontend/vitest.config.js re-declaring @vitejs/plugin-react, independent of frontend/vite.config.js"
    - "test.setupFiles (per-test) used instead of test.globalSetup (per-run) for jsdom global stubs and matcher registration"
    - "Explicit vitest imports everywhere (describe/it/expect/afterEach) — globals: true intentionally never set"
    - "Dedicated frontend/test/ dir for shared infra, co-located frontend/src/**/*.test.jsx for specs"

key-files:
  created:
    - frontend/vitest.config.js
    - frontend/test/setup.js
    - frontend/src/harness.test.jsx
  modified:
    - frontend/package.json
    - package-lock.json

key-decisions:
  - "D-01: Standalone frontend/vitest.config.js re-declares @vitejs/plugin-react; frontend/vite.config.js left completely unmodified"
  - "D-02: Full RTL kit (react, jest-dom, user-event) installed now so Phase 5 only writes tests, not tooling"
  - "D-03: Single shared setup.js handles jest-dom registration + matchMedia stub + RTL cleanup, wired via test.setupFiles with globals off"
  - "D-04: Proof spec uses a throwaway inline component defined in the spec file itself — no coupling to real app components"
  - "jsdom pinned to ^26.0.0 (resolved 26.1.0) rather than the newer 27-29 lines available on the registry, per plan's explicit version-line guidance"

patterns-established:
  - "Pattern: jsdom-environment Vitest config for React workspaces — plugins:[react()] + test.environment:'jsdom' + test.setupFiles, no globals"
  - "Pattern: shared setup.js stubs only the browser globals actually needed (matchMedia) rather than preemptively stubbing others (e.g. ResizeObserver)"

requirements-completed: [SETUP-02]

# Metrics
duration: 3min
completed: 2026-07-12
---

# Phase 4 Plan 1: Frontend Test Tooling Summary

**Standalone Vitest+jsdom harness for the frontend workspace, with the full React Testing Library kit installed and a passing proof spec proving render/query/matcher/cleanup all wire together.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-12T02:39:13+02:00
- **Completed:** 2026-07-12T02:40:06+02:00
- **Tasks:** 3
- **Files modified:** 5 (frontend/package.json, package-lock.json, frontend/vitest.config.js, frontend/test/setup.js, frontend/src/harness.test.jsx)

## Accomplishments
- `npm test --workspace frontend` now runs Vitest in a jsdom environment and exits 0
- Full RTL kit (`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`) plus `vitest` and `jsdom` installed as frontend devDependencies, ready for Phase 5's real auth-surface component tests
- Shared `frontend/test/setup.js` registers jest-dom matchers, stubs `window.matchMedia` for MUI, and wires RTL `afterEach(cleanup)` — the single place Phase 5 depends on
- Throwaway inline proof spec (`frontend/src/harness.test.jsx`) proves the full chain: JSX transform → jsdom env → RTL render/query → jest-dom matcher → setup-file wiring
- `frontend/vite.config.js` left completely untouched (D-01 honored)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add test script and RTL/jsdom/vitest devDependencies to frontend/package.json** - `b77f62e` (feat)
2. **Task 2: Create standalone frontend/vitest.config.js and the shared frontend/test/setup.js** - `8cd8a34` (feat)
3. **Task 3: Add throwaway proof spec and prove the suite runs green in jsdom** - `7d08b26` (test)

**Plan metadata:** (recorded after this summary is committed)

## Resolved Version Pins

Exact versions resolved by npm during `npm install --workspace frontend` (recorded per plan's `<output>` requirement):

| Package | Declared range | Resolved version |
|---|---|---|
| vitest | ^4.1.10 | 4.1.10 |
| jsdom | ^26.0.0 | 26.1.0 |
| @testing-library/react | ^16.3.2 | 16.3.2 |
| @testing-library/jest-dom | ^6.9.1 | 6.9.1 |
| @testing-library/user-event | ^14.6.1 | 14.6.1 |

Note: `jsdom` latest-tagged on the npm registry at execution time was 29.1.1 (with 27.x and 28.x lines also published), but the plan explicitly called for pinning to the `^26.x` line to match the researched-compatible baseline; `^26.0.0` resolved cleanly to `26.1.0` with no peer conflicts against React 18.3 / Vite 6 / `@vitejs/plugin-react` 4.3, so no `--legacy-peer-deps`/`--force` was needed and no discretionary version bump was required.

## Files Created/Modified
- `frontend/package.json` - Added `"test": "vitest run"` script and five devDependencies (vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event)
- `package-lock.json` - Updated by `npm install --workspace frontend`
- `frontend/vitest.config.js` - New standalone config: `react()` plugin, `environment: 'jsdom'`, `setupFiles: ['./test/setup.js']`, no `globals: true`
- `frontend/test/setup.js` - New shared setup: jest-dom matcher registration, `window.matchMedia` stub, RTL `afterEach(cleanup)` with explicit `afterEach` import from `vitest`
- `frontend/src/harness.test.jsx` - New throwaway proof spec: inline `HarnessProbe` component rendered and queried via `getByRole`, plus a second assertion confirming jsdom + matchMedia are active

## Decisions Made
- Pinned `jsdom` to `^26.0.0` rather than the latest-tagged `29.x` line, per the plan's explicit instruction to stay on the researched `^26` compatibility line — verified `26.x` versions exist on the registry (26.0.0, 26.1.0) and resolve cleanly.
- All other four devDependency pins matched the plan's guidance exactly and resolved to their latest patch within the specified major/minor line with zero peer-resolution conflicts.
- Classified the harness proof spec commit as `test(...)` (not `feat(...)`) since it adds test-only code, matching the precedent set by the backend's `smoke.test.js` commit in Phase 1 (`a969bc0 test(01-01): add backend smoke spec proving vitest runner works end-to-end`).

## Deviations from Plan

None - plan executed exactly as written. `npm install --workspace frontend` completed cleanly on the first attempt with no peer-conflict resolution needed, and the proof spec passed on the first run without requiring any fixes to the config/setup files.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 (frontend component tests) can now write real auth-surface tests (AuthContext, ProtectedRoute, Login, Register) directly against this harness:
- `frontend/vitest.config.js` and `frontend/test/setup.js` are stable and require no further tooling changes.
- The full RTL kit including `user-event` is already installed, so Phase 5 can test form interactions (typing, clicks) without additional installs.
- The throwaway `frontend/src/harness.test.jsx` proof spec should be deleted/replaced by Phase 5's first real component test, per its throwaway nature (D-04).
- No blockers identified.

---
*Phase: 04-frontend-test-tooling*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created files verified present on disk; all three task commit hashes (`b77f62e`, `8cd8a34`, `7d08b26`) verified present in git log.
