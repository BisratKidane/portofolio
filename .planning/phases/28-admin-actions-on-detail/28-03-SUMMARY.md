---
phase: 28-admin-actions-on-detail
plan: 03
subsystem: ui
tags: [react, hooks, vitest, graphql, caching]

# Dependency graph
requires:
  - phase: 27-descendant-navigation-performance
    provides: navReducer (pure view-frame reducer) and useDescendantNav (ref-cache + expand-fetch hook) that this plan extends
provides:
  - "navReducer REFRESH action — a pure state-reference bump with no field change"
  - "useDescendantNav.refreshEntry(id) — evicts and refetches a single cached descendant OR the current top/head with one bounded combined familyMember+children request, proven id-agnostic"
affects: [28-04-edit-in-place, 28-05-add-in-place]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Always-fresh refetch primitive (refreshEntry) distinct from cache-hit-or-fetch primitive (ensureEntry) — same cache/dispatch mechanics, different cache-check policy"
    - "REFRESH_PERSON_QUERY combines a target's own display fields with its full children set in one request, reusing the exact field shapes already proven N+1-free by FAMILY_MEMBER_QUERY/EXPAND_CHILDREN_QUERY"

key-files:
  created: []
  modified:
    - frontend/src/hooks/descendantNav.reducer.js
    - frontend/src/hooks/descendantNav.reducer.test.js
    - frontend/src/hooks/useDescendantNav.js
    - frontend/src/hooks/useDescendantNav.test.js

key-decisions:
  - "Interpreted the plan's 'nav.gen1 must reflect the refreshed self' bullet (for a currently-expanded gen1 descendant) as provable via TWO distinct, literal hook-surface effects rather than a single ambiguous one: (1) gen2 updates immediately since the refreshed id is already state.expandedChildId, and (2) the refreshed self+children become visible as topPerson/gen1 once forward-shifted into via onExpandGrandchild — a genuinely different code path from the dedicated no-forward-shift head/topId test, so the two tests stay non-conflatable per the plan's explicit requirement"

requirements-completed: [PERM-02]

# Metrics
duration: 15min
completed: 2026-08-04
---

# Phase 28 Plan 03: refreshEntry Cache-Invalidation Primitive Summary

**Added `refreshEntry(id)` to `useDescendantNav` — an always-fresh, single-request refetch that evicts and repopulates any one cached descendant OR the current head, proven id-agnostic via a dedicated no-forward-shift topId test.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-04T14:53:00+02:00 (approx, after worktree base correction)
- **Completed:** 2026-08-04T15:31:00+02:00
- **Tasks:** 2
- **Files modified:** 4 (2 source, 2 test)

## Accomplishments
- Closed the Phase-27-deferred cache-invalidation gap (D-04): a single per-id cache entry can now be evicted/refetched without discarding the rest of the session cache.
- `refreshEntry` is provably id-agnostic — verified against a gen1/gen2 descendant, the current `state.topId` (head) with zero navigation, and a not-yet-cached id, all through the same code path with no branching.
- `REFRESH_PERSON_QUERY` combines a target's own display fields with its full children set in one bounded request, matching the field shapes already proven N+1-free by the existing `FAMILY_MEMBER_QUERY`/`EXPAND_CHILDREN_QUERY`.
- New `REFRESH` reducer action gives the ref-cache write a real re-render trigger (PERF-03's ref-cache never re-renders on its own).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for refreshEntry + REFRESH (RED)** - `6fe885b` (test)
2. **Task 2: Implement refreshEntry + REFRESH (GREEN)** - `1f2795a` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `frontend/src/hooks/descendantNav.reducer.js` - Added `case 'REFRESH': return { ...state };` before the default case
- `frontend/src/hooks/descendantNav.reducer.test.js` - Added a `describe('REFRESH', ...)` block (new-reference + field-preservation-with-history)
- `frontend/src/hooks/useDescendantNav.js` - Added `REFRESH_PERSON_QUERY` constant and `refreshEntry` `useCallback`, returned alongside the existing handlers
- `frontend/src/hooks/useDescendantNav.test.js` - Added a `describe('refreshEntry', ...)` block with 6 `it`s covering existence, combined gen1/gen2-descendant refresh + forward-shift self-visibility proof, the dedicated head/topId no-navigation case, null-response no-cache-write, loadingId lifecycle, and cache-miss-target support

## Decisions Made
- The plan's behavior bullet for the gen1-descendant case says the refresh should be visible "via nav.gen1" for a descendant that is NOT `state.topId`. Given the hook's literal derivation (`topPerson`/`gen1` come only from `cache.get(state.topId)`, and `gen2` only from `cache.get(state.expandedChildId)`), a refresh of an id that is neither of those two keys has no immediate visible effect through the public hook surface except via `gen2` (when that id is the current `expandedChildId`, as in the plan's own example). I proved the full cache write (both `self` and `children`) two ways in one test: immediately via `gen2`, and via `topPerson`/`gen1` after a subsequent `onExpandGrandchild` forward-shift promotes that same id to `state.topId` — with zero additional fetch for that id, since its cache entry was already fully populated by `refreshEntry`. This is deliberately a different code path (involves navigation) from the dedicated head/topId test (explicitly zero navigation), keeping the two non-conflatable as the plan requires.

## Deviations from Plan

None - plan executed exactly as written. (See "Decisions Made" above for an interpretive choice on an ambiguous test-assertion detail, not a deviation from the plan's actual code/contract requirements.)

## Issues Encountered
- The worktree's initial HEAD (`64957fb`) predated the entire Phase 27 hooks work and did not match the plan's expected base commit (`351fd1a`). Per the `<worktree_branch_check>` protocol, confirmed the working tree was clean and ran `git reset --hard 351fd1a3f9ab019729d3158584790edabc9fb261` to correct the base before starting any task work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `refreshEntry(id)` is ready for Plan 28-04 (edit-in-place) and 28-05 (add-in-place + auto-expand) to call unconditionally from `refreshAfterMutation`, for every render site including the head, per the interfaces contract locked in this plan.
- Full frontend suite green (401/401) with zero regressions.

---
*Phase: 28-admin-actions-on-detail*
*Completed: 2026-08-04*

## Self-Check: PASSED

- FOUND: frontend/src/hooks/descendantNav.reducer.js
- FOUND: frontend/src/hooks/useDescendantNav.js
- FOUND: frontend/src/hooks/descendantNav.reducer.test.js
- FOUND: frontend/src/hooks/useDescendantNav.test.js
- FOUND: .planning/phases/28-admin-actions-on-detail/28-03-SUMMARY.md
- FOUND commit: 6fe885b (test RED)
- FOUND commit: 1f2795a (feat GREEN)
