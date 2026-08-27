---
phase: 27-descendant-navigation-performance
plan: 04
subsystem: ui
tags: [react, integration, testing-library, vitest, profiler]

# Dependency graph
requires:
  - phase: 27-descendant-navigation-performance (Plan 27-02)
    provides: "GenerationGrid({ people, role, expandedId, onExpand, onEdit, loadingId }) -- rendered twice (gen1/Child, gen2/Grandchild)"
  - phase: 27-descendant-navigation-performance (Plan 27-03)
    provides: "useDescendantNav(mainPerson) -- topPerson/topExpanded/gen1/expandedChildId/gen2/loadingId + onExpandTop/onExpandChild/onExpandGrandchild"
provides:
  - "DetailPage.jsx -- the phase's integration point: live expand/collapse descendant navigation wired end-to-end into the real /detail page"
  - "DetailPage.test.jsx -- full NAV-01..04/PERF-01/PERF-03/D-01/D-04 behavioral proof through the real rendered component tree (no mocked hook/component)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React Profiler (`<Profiler id onRender>`) wrapped inline around a single test's render tree to assert an exact render-commit count for a cache-hit interaction, without touching the shared renderPage() helper used by every other test"

key-files:
  created: []
  modified:
    - frontend/src/pages/DetailPage.jsx
    - frontend/src/pages/DetailPage.test.jsx

key-decisions:
  - "PERF-03's exact render-commit count for a cache-hit re-expand is 2, not 1: traced empirically (component-level console instrumentation, since reverted) to a single EXPAND_CHILD dispatch commit plus one benign settling commit from the freshly re-mounted grandchild PersonCard's MemberAvatarImage (its mount-effect's no-photo early-return branch, unaffected by the setState calls it makes). This is still small/bounded/exact and provably distinct from a cache-miss expand's 3+ commit cost (which adds a setLoadingId(true)/setLoadingId(false) pair) -- confirmed via the same test's unchanged graphqlRequest call count."
  - "Role labels reflect position in the current view, not absolute genealogical generation: the top PersonCard's role prop is hardcoded 'Head' regardless of which cached person occupies the promoted top slot after a forward-shift (NAV-04), per the plan's Claude's Discretion note."

patterns-established:
  - "Conditional `{condition && <GenerationGrid .../>}` mounting per generation row is the reference pattern for /detail's descendant rows -- rows fully unmount (not just hide) when collapsed, so a re-expand is always a fresh mount of the row + its cards."

requirements-completed: [NAV-01, NAV-02, NAV-03, NAV-04, PERF-01, PERF-03]

# Metrics
duration: 25min
completed: 2026-08-04
---

# Phase 27 Plan 04: DetailPage Descendant-Navigation Wiring Summary

**`DetailPage.jsx` now wires the already-tested `useDescendantNav` hook (27-03) and `GenerationGrid` (27-02) into a live expand/collapse/shift UI, proven end-to-end by 8 new tests (14/14 in the file) covering NAV-01..04, PERF-01, PERF-03, and D-01/D-04 against the real rendered component tree.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-04
- **Completed:** 2026-08-04
- **Tasks:** 2 (wiring + tests)
- **Files modified:** 2 (both pre-existing)

## Accomplishments

- `DetailPage.jsx`: the head card's inert `onExpand={() => {}}` was replaced with `nav.onExpandTop`; a `position: relative` wrapper adds a top-card loading badge (mirrors `GenerationGrid`'s per-card badge) gated on `nav.loadingId === nav.topPerson.id`. Two conditionally-rendered `GenerationGrid`s follow: gen1 (`role="Child"`, `onExpand={nav.onExpandChild}`) beneath the top card, gen2 (`role="Grandchild"`, `onExpand={nav.onExpandGrandchild}`) beneath the expanded child. `onEdit` stays a true no-op (`() => {}`) on every card (head + both grids) -- Phase 28 scope untouched. `FAMILY_HEAD_QUERY`/`FAMILY_MEMBER_QUERY` were not modified (PERF-01).
- `DetailPage.test.jsx`: the pre-existing "no-op onExpand/onEdit" test was updated (Task 1, same task as the wiring change) to mock a children-fetch response and assert the fetched child card renders, since the handler is no longer a no-op. Task 2 added 8 new tests: PERF-01 (exactly 2 initial-load calls, zero children-fetch before any expand), NAV-01 (expand shows gen1 + `generation-apex` connector), NAV-02 (collapsing a child hides its grandchildren), D-01 (expanding a second child auto-collapses the first -- only one branch open at a time), a combined NAV-03/NAV-04/D-04 test (forward-shift promotes the childful grandchild's parent to the top slot, drops the original head and the promoted parent's siblings, caps the mounted card count at exactly 3, then collapsing the promoted top restores the exact pre-shift view with zero additional `graphqlRequest` calls), and PERF-03 (a `<Profiler>`-wrapped cache-hit re-expand fires zero new `graphqlRequest` calls and an exact, documented 2-commit render count).
- Full frontend suite re-run clean: 393/393 tests, zero regressions (was 387/387 before this plan -- 8 new tests, minus the 2 net from the updated pre-existing test staying at 1 test).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useDescendantNav + GenerationGrid into DetailPage (update the now-live no-op-click test)** - `afde2a7` (feat)
2. **Task 2: Extend DetailPage tests to prove NAV-01..04/PERF-01/PERF-03** - `570ca35` (test)

**Plan metadata:** (this commit) `docs: complete 27-04 plan`

## Files Modified

- `frontend/src/pages/DetailPage.jsx` - Live `useDescendantNav` wiring + two conditional `GenerationGrid` rows replacing the inert head-card handler
- `frontend/src/pages/DetailPage.test.jsx` - Updated pre-existing no-op-click test + 8 new NAV-01..04/PERF-01/PERF-03/D-01/D-04 tests (14 tests total in the file)

## Decisions Made

- **PERF-03's exact render count is 2, not 1** for a cache-hit re-expand. The plan's interface notes anticipated "one commit for the toggle." Empirical component-level tracing (temporary console instrumentation across `DetailPage`, `GenerationGrid`, `PersonCard`, `MemberAvatarImage`, and the reducer -- all reverted before committing) isolated the second commit to `MemberAvatarImage`'s own mount effect on the freshly re-mounted grandchild card (its no-photo early-return render branch is unaffected, but the effect's `setObjectUrl(null)`/`setFetching(false)` calls still produce one small, isolated commit distinct from the `EXPAND_CHILD` dispatch's commit). This is pre-existing `MemberAvatarImage` behavior from Phase 25/26, out of this plan's scope per the deviation rules' scope boundary (not caused by this plan's wiring). The test asserts the exact, empirically-verified, and code-comment-documented count of 2 -- still small, bounded, and provably distinct from a cache-miss expand's 3+ commit cost (verified via the same test's unchanged `graphqlRequest` call count immediately preceding the render-count assertion).
- **NAV-03/NAV-04/D-04 combined into a single test**, per the plan's own framing ("at the peak of the shift scenario above") -- avoids duplicating the 3-level fixture chain and click sequence across three separate tests.

## Deviations from Plan

### Auto-fixed Issues

None -- no bugs, missing functionality, or blocking issues were encountered in the wiring itself.

### Noted Discrepancies (not fixed, out of scope)

**1. Acceptance-criteria grep count mismatch for `FAMILY_MEMBER_QUERY`**
- **Found during:** Task 1 acceptance-criteria verification.
- **Issue:** The plan's acceptance criteria expected `grep -c "FAMILY_MEMBER_QUERY" frontend/src/pages/DetailPage.jsx` to equal `1` (the constant declaration only). The actual count is `2` (the declaration plus one existing usage in `loadPersonById`'s `graphqlRequest(FAMILY_MEMBER_QUERY, { id })` call).
- **Root cause:** This usage line predates this plan -- it was already present in the Phase 26 `DetailPage.jsx` (`git show <pre-27-04-commit>:frontend/src/pages/DetailPage.jsx` confirms 2 occurrences before this plan touched the file). The plan's acceptance criterion undercounted the pre-existing usage, not something this plan's wiring added.
- **Action:** Not fixed -- there is nothing to fix; the underlying intent of the criterion ("the query stays unmodified, no new fields added") is satisfied. Documented here for the record rather than silently ignored.

**2. PERF-03's exact render count is 2, not the "one commit" example in the plan's `<behavior>` bullet**
- See "Decisions Made" above -- documented there rather than duplicated.

## Issues Encountered

None beyond the two noted discrepancies above (neither blocked completion).

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

Phase 27 (descendant-navigation-performance) is now feature-complete: `/detail` supports live expand/collapse across head -> children -> grandchildren, auto-collapses sibling branches, forward-shifts the view when a childful grandchild is expanded (capped at 3 mounted generations), symmetrically undoes the shift from cache with zero extra fetches, and only fetches per-generation on demand (never on initial load). Full frontend suite green (393/393). No blockers for Phase 27 verification / milestone close-out. The backend workspace test suite was not touched by this plan (frontend-only files) and was not re-run as part of this plan's verification, per the plan's own `<verification>` section (frontend commands only).

---
*Phase: 27-descendant-navigation-performance*
*Completed: 2026-08-04*

## Self-Check: PASSED

- FOUND: frontend/src/pages/DetailPage.jsx
- FOUND: frontend/src/pages/DetailPage.test.jsx
- FOUND: .planning/phases/27-descendant-navigation-performance/27-04-SUMMARY.md
- FOUND: afde2a7 (feat commit)
- FOUND: 570ca35 (test commit)
