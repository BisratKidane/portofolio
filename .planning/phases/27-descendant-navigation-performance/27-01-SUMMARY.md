---
phase: 27-descendant-navigation-performance
plan: 01
subsystem: ui
tags: [react, reducer, state-machine, tdd, vitest]

# Dependency graph
requires:
  - phase: 25-reusable-personcard
    provides: "PersonCard's expanded/onExpand contract and children-length expand gating that this reducer's action semantics assume"
  - phase: 26-detail-page-search-initial-load
    provides: "DetailPage's mainPerson state and inert onExpand this reducer will eventually drive"
provides:
  - "navReducer(state, action) — pure 4-case state machine (RESET, EXPAND_TOP, EXPAND_CHILD, EXPAND_GRANDCHILD)"
  - "initial(topId) — base view-frame factory"
  - "The view-frame contract Plan 27-03's useDescendantNav hook imports unchanged: { topId, topExpanded, expandedChildId, history }"
affects: [27-03-useDescendantNav, 27-04-DetailPage-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First pure (zero-import) reducer module in this codebase, mirroring familyTree.layout.js's no-framework-dependency convention"
    - "Push/pop history stack for exact-inverse forward-shift/undo, restoring the popped frame verbatim rather than reconstructing it"

key-files:
  created:
    - frontend/src/hooks/descendantNav.reducer.js
    - frontend/src/hooks/descendantNav.reducer.test.js
  modified: []

key-decisions:
  - "Followed the RESEARCH.md Pattern 1 reference implementation verbatim — no deviations in reducer logic"
  - "EXPAND_GRANDCHILD pushes the current state object by reference (not a clone) into history, per the plan's explicit allowance"

patterns-established:
  - "Pure reducer + initial() factory pair, unit-tested with plain toEqual assertions and no RTL/render — the pattern Plan 27-03's useDescendantNav hook and any future nav-adjacent state machine should follow"

requirements-completed: [NAV-02, NAV-03, NAV-04]

# Metrics
duration: 10min
completed: 2026-08-04
---

# Phase 27 Plan 01: Descendant Nav Reducer Summary

**Pure, exhaustively-unit-tested `navReducer`/`initial` view-frame state machine modeling expand/collapse, D-01 single-branch auto-collapse, and D-03/D-04 forward-shift with exact push/pop undo — zero React/DOM dependency.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-08-04T04:42:17Z
- **Tasks:** 2 completed (RED + GREEN, TDD)
- **Files modified:** 2 (both new)

## Accomplishments
- `frontend/src/hooks/descendantNav.reducer.js` — pure `navReducer(state, action)` + `initial(topId)`, zero imports, exactly matching the RESEARCH.md Pattern 1 contract (function names, action-type strings, frame field names) that Plan 27-03's `useDescendantNav` hook will import unchanged
- 11-case exhaustive test suite proving: initial state shape, RESET wipes any prior frame, EXPAND_TOP toggle/ordinary-collapse/walk-back-up-pop, EXPAND_CHILD set/replace(D-01)/toggle-off(D-02), EXPAND_GRANDCHILD forward-shift with verbatim history push (D-03/NAV-04), byte-for-byte symmetric undo after a shift (D-04), the NAV-03 structural invariant (exactly 4 fields, history grows by exactly 1 per shift, across two consecutive shifts) and default no-op reference equality
- Full frontend suite re-run clean: 368/368 tests, zero regressions

## Task Commits

Each task was committed atomically (TDD RED→GREEN):

1. **Task 1: Write the failing reducer test suite (RED)** - `cf8b8b1` (test)
2. **Task 2: Implement the pure navReducer (GREEN)** - `fad401c` (feat)

## Files Created/Modified
- `frontend/src/hooks/descendantNav.reducer.js` - Pure `navReducer`/`initial` state machine (42 lines, 0 imports)
- `frontend/src/hooks/descendantNav.reducer.test.js` - 11 `it(...)` blocks, plain describe/it, no render/RTL/mocks (mirrors `familyTree.layout.test.js`'s pure-function style)

## Decisions Made
None — plan executed exactly as written; RESEARCH.md's Pattern 1 reference implementation was followed verbatim (reducer logic, action-type strings, field names all unchanged from the `<interfaces>` contract).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`navReducer`/`initial` are ready for Plan 27-03's `useDescendantNav` hook to import unchanged (`import { navReducer, initial } from './descendantNav.reducer.js'`). No blockers. Full frontend suite (368/368) stayed green — this plan added new files only and touched nothing existing, matching the plan's own verification claim.

---
*Phase: 27-descendant-navigation-performance*
*Completed: 2026-08-04*

## Self-Check: PASSED

- FOUND: frontend/src/hooks/descendantNav.reducer.js
- FOUND: frontend/src/hooks/descendantNav.reducer.test.js
- FOUND: .planning/phases/27-descendant-navigation-performance/27-01-SUMMARY.md
- FOUND: cf8b8b1 (test commit)
- FOUND: fad401c (feat commit)
