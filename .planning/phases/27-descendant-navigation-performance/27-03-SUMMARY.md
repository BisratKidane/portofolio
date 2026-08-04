---
phase: 27-descendant-navigation-performance
plan: 03
subsystem: ui
tags: [react, custom-hook, useRef-cache, useReducer, tdd, vitest, graphql]

# Dependency graph
requires:
  - phase: 27-descendant-navigation-performance (Plan 27-01)
    provides: "navReducer(state, action) + initial(topId) — the pure view-frame state machine this hook drives unchanged"
provides:
  - "useDescendantNav(mainPerson) — the render-ready hook Plan 27-04 (DetailPage wiring) will consume directly: topPerson/topExpanded/gen1/expandedChildId/gen2/loadingId + onExpandTop/onExpandChild/onExpandGrandchild"
  - "The expand-only EXPAND_CHILDREN_QUERY GraphQL contract, deliberately separate from DetailPage's initial-load query (PERF-01)"
  - "The { self, children } cache-entry shape resolving the promoted-parent-after-shift lookup without a second Map"
affects: [27-04-DetailPage-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First custom hook in this codebase (frontend/src/hooks/useDescendantNav.js) — useRef(Map) session cache decoupled from useReducer view-frame state, so a cache write alone never triggers a re-render (PERF-03)"
    - "ensureEntry(person).then(() => dispatch({...})) — one shared cache-then-dispatch shape behind all three expand handlers, letting the already-tested reducer alone own toggle/collapse/shift semantics"

key-files:
  created:
    - frontend/src/hooks/useDescendantNav.js
    - frontend/src/hooks/useDescendantNav.test.js
  modified: []

key-decisions:
  - "Restructured the RED-phase test suite during GREEN: RTL's global cleanup() (frontend/test/setup.js) unmounts renderHook's host component after every it(), so the original design (one shared hook instance mutated across multiple it() blocks) silently no-op'd dispatches on an unmounted component after the first it(). Each it() now renders its own fresh instance and replays only the prior steps it needs via a small renderExpandedToChild() helper for the two tests that need post-onExpandChild state. No change to the behavior contract — same 7 assertions, same fixture chain."
  - "Handlers' act() calls now `await` the promise onExpandTop/onExpandChild/onExpandGrandchild return, not just the outer async arrow — the cache-hit path resolves via a microtask (Promise.resolve().then(dispatch)) that needs to be awaited explicitly for React to flush the dispatch before the next assertion."

patterns-established:
  - "useRef(Map) + useReducer split as the reference custom-hook shape for this codebase — any future nav/cache-adjacent hook should follow the same 'ref never drives render directly, reducer state is the only render trigger' rule"

requirements-completed: [PERF-01, PERF-03]

# Metrics
duration: 15min
completed: 2026-08-04
---

# Phase 27 Plan 03: useDescendantNav Hook Summary

**`useDescendantNav(mainPerson)` — the first custom hook in this codebase, combining Plan 27-01's pure `navReducer` with a `useRef(Map)` session cache and an expand-only `EXPAND_CHILDREN_QUERY`, proving PERF-01 (lazy per-generation fetch) and PERF-03 (zero duplicate requests, cache lives outside React state) entirely via `renderHook` before any page wiring exists.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-04
- **Tasks:** 2 completed (RED + GREEN, TDD)
- **Files modified:** 2 (both new)

## Accomplishments

- `frontend/src/hooks/useDescendantNav.js` exports `useDescendantNav(mainPerson)`: a `useRef(new Map())` cache keyed by person id (`{ self, children }` entries) decoupled from a `useReducer(navReducer, ...)` view frame, plus a `useState` `loadingId`. One internal `ensureEntry(person)` backs all three expand handlers — cache hit returns `Promise.resolve()` immediately (zero network call); cache miss fires the narrow `EXPAND_CHILDREN_QUERY` (id-scoped, full card fields + spouses + count-only grandchild peek) and writes into the ref before any dispatch.
- Proved, via `renderHook` (no page mount needed): opening the hook fetches nothing (`graphqlRequest` uncalled on mount); a first expand fires exactly one call; repeat collapse/re-expand of the same id fires zero additional calls; a `RESET` (main-person swap, simulating search) clears only the view frame — the original id's cache entry survives and a later re-expand of it still fires zero new calls; and a grandchild shift (`EXPAND_GRANDCHILD`) fires exactly one new call — for the grandchild alone — while the promoted parent's own children (already cached from the earlier `onExpandChild`) resolve `topPerson`/`gen1` straight from the cache with no second fetch.
- Full frontend suite re-run clean: 387/387 tests, zero regressions.

## Task Commits

Each task was committed atomically (TDD RED→GREEN):

1. **Task 1: Write the failing hook test suite (RED)** - `bde357c` (test)
2. **Task 2: Implement useDescendantNav (GREEN)** - `6f34996` (feat)

## Files Created/Modified

- `frontend/src/hooks/useDescendantNav.js` - `useDescendantNav(mainPerson)` hook: cache + reducer + expand-only fetch orchestration (97 lines)
- `frontend/src/hooks/useDescendantNav.test.js` - 7 `it(...)` blocks via `renderHook`/`act`/`waitFor`, one per behavior bullet (mount-zero-fetch, first-expand-fetch, repeat-expand-cache-hit, child-expand-populates-gen2, grandchild-shift-single-fetch, RESET-preserves-cache, loadingId-lifecycle)

## Decisions Made

- Test-suite restructuring (see `key-decisions` above): the plan's own `<interfaces>` and `<action>` contract for the hook implementation was followed exactly as written with no deviation; the adjustment was confined to the Task 1 test file's mechanics (instance-sharing across `it()` blocks vs. RTL's `cleanup()`), not the behavior it specifies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test suite's shared-hook-instance-across-`it()` design silently broke under RTL's global `cleanup()`**
- **Found during:** Task 2 (GREEN) — running the Task 1 RED suite's later assertions failed even after implementing the hook correctly.
- **Issue:** `frontend/test/setup.js` runs `cleanup()` in a global `afterEach`, which unmounts every `renderHook` host component after each `it()`. The original Task 1 test nested a `describe('sequential expand / cache / shift flow')` block that assigned `renderHook(...)` to a `let hook` in the first `it()` and reused/mutated it across four subsequent `it()`s — each of those later `it()`s was calling handlers on an already-unmounted instance, so `dispatch` calls silently no-op'd and `hook.result.current` never advanced.
- **Fix:** Restructured so each `it()` renders its own fresh `useDescendantNav` instance; the two tests needing post-`onExpandChild` state use a small `renderExpandedToChild()` helper that replays the necessary prior steps (mount → expand top → expand child) before asserting. Also switched every `act(async () => { result.current.onExpandX(...) })` to `act(async () => { await result.current.onExpandX(...) })`, since the cache-hit path resolves via a microtask (`Promise.resolve().then(dispatch)`) that must be explicitly awaited for React to flush the state update before the next assertion.
- **Files modified:** `frontend/src/hooks/useDescendantNav.test.js`
- **Verification:** All 7 tests pass; behavior contract (fixture chain, mocked responses, assertions) is unchanged from the original RED-phase spec — only the mechanics of instance lifecycle/await sequencing changed.
- **Committed in:** `6f34996` (part of the Task 2 GREEN commit, documented in the commit body)

## Issues Encountered

None beyond the auto-fixed test-mechanics issue above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`useDescendantNav(mainPerson)` is ready for Plan 27-04's `DetailPage` wiring to consume directly (`const nav = useDescendantNav(mainPerson)`), returning `{ topPerson, topExpanded, gen1, expandedChildId, gen2, loadingId, onExpandTop, onExpandChild, onExpandGrandchild }` — the exact shape Plan 27-04 will pass into `PersonCard`/`GenerationGrid` (Plan 27-02). No blockers. Full frontend suite (387/387) stayed green — this plan added new files only and touched nothing existing.

---
*Phase: 27-descendant-navigation-performance*
*Completed: 2026-08-04*
