---
phase: 17-family-deep-tree-visualization
plan: 03
subsystem: ui
tags: [react-flow, xyflow, family-tree, canvas, collapse-expand, accessibility]

# Dependency graph
requires:
  - phase: 17-02
    provides: "familyTree.assembly.js (buildForest/computeInitialExpandSet), familyTree.layout.js (layoutWithDagre) -- D-11 SC-1 spike human-approved, unblocking this plan's production canvas build"
provides:
  - "MemberNode.jsx / UnionNode.jsx: custom xyflow node types matching the UI-SPEC node anatomy contract (avatar, name, years, non-color-only gender tint, viewer ring + You chip, descendant + ancestor hidden-count badges)"
  - "FamilyTreeCanvas.jsx: the production <ReactFlow> wrapper -- layout-on-visible-subset, collapse/expand in both descendant and ancestor directions (D-03), all four D-05 navigation aids (find-me, search, zoom/fit, minimap), read-only (nodesDraggable={false})"
  - "Colocated mockReactFlow() jsdom setup pattern (with the contentRect fix) reusable by any future xyflow-based component test in this project"
affects: [17-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom xyflow node type receiving { data } with imperative toggle callbacks (onToggleExpand/onToggleAncestorExpand) passed down from the canvas owner, not read from context"
    - "Collapse/expand via node.hidden flag on the FULL node/edge arrays (not array filtering) -- keeps dagre's rank math stable across toggles, memoized on a visible-id-set string key rather than array identity"
    - "Symmetric bidirectional reveal: onToggleExpand (descendant, one level) vs. onToggleAncestorExpand (ancestor, walks to apex) -- distinct badges, distinct aria-label directions, per D-03"

key-files:
  created:
    - frontend/src/components/family/MemberNode.jsx
    - frontend/src/components/family/MemberNode.test.jsx
    - frontend/src/components/family/UnionNode.jsx
    - frontend/src/components/family/FamilyTreeCanvas.jsx
    - frontend/src/components/family/FamilyTreeCanvas.test.jsx
  modified:
    - frontend/src/App.jsx

key-decisions:
  - "Gender matching keyed off the actual FamilyMember.gender ENUM values ('Male'/'Female'/'Other', backend/src/models/FamilyMember.js) rather than the plan text's illustrative 'MALE'/'FEMALE' — using the wrong casing would have silently failed to tint/icon real production data (Rule 1)."
  - "Descendant/ancestor badges implement only the 'Show N hidden {direction} of {name}' aria-label variant (not a separate 'Hide' variant) -- the badge's own visibility is already keyed on hiddenCount/ancestorHiddenCount > 0, so once a branch is fully expanded the count naturally drops to 0 and the badge disappears; there is no reachable state where a 'Hide' label would apply through this same badge. Matches the plan's own testable <behavior> contract exactly (Show-only assertions)."
  - "Viewer ring implemented as both a real CSS outline (data-viewer-ring sx) AND a stable data-viewer-ring='true'/'false' attribute for deterministic testing -- avoids relying on jsdom's computed-style fidelity for emotion-generated classes, per the plan's own 'computed style OR a stable selector/class' allowance."
  - "layoutWithDagre is memoized on a stringified, sorted expandedIds key (visibleIdsKey) and always receives the FULL node/edge arrays with a hidden flag added, not a filtered subset -- this is what RESEARCH Pattern 3 and the plan's own 'keeps dagre's rank math stable across toggles' language actually specify, distinct from removing nodes from the array."

requirements-completed: [TREE-01, TREE-02]

# Metrics
duration: 15min
completed: 2026-07-25
---

# Phase 17 Plan 03: Production Family Tree Canvas Summary

**Built the production `/family` tree canvas -- `MemberNode`/`UnionNode` custom xyflow node types and the `FamilyTreeCanvas` wrapper owning dagre layout-on-visible-subset, bidirectional collapse/expand (descendant + ancestor, D-03), and all four D-05 navigation aids -- removing the temporary SC-1 spike harness now that Plan 17-02's human checkpoint approved the underlying union-node pattern.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-25T14:44:20+02:00 (after 17-02 close)
- **Completed:** 2026-07-25T14:55:16+02:00
- **Tasks:** 3 (2 tdd="true", 1 auto)
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- Deleted `frontend/src/components/family/__spike/` and the temporary `/family-spike` route + import in `App.jsx`
- `MemberNode.jsx`: 180x64px card per UI-SPEC anatomy -- `MemberAvatarImage` (Phase 16 reuse), full name, birth-death years line (`1932–2001` / `1932–` / `–2001` / omitted), non-color-only gender indicator (`MaleRounded`/`FemaleRounded`/`TransgenderRounded` + per-gender tint + `aria-label`, D-09b), viewer ring (`data-viewer-ring` + `2px solid colors.primary` outline, D-09a) plus a "You" chip, a bottom descendant hidden-count badge and a symmetric top ancestor hidden-count badge (D-03) with distinct aria-labels -- 15 passing tests
- `UnionNode.jsx`: minimal 24x24px connector, no avatar/text/click surface
- `FamilyTreeCanvas.jsx`: owns `expandedIds` state seeded from `initialExpandedIds`; recomputes `layoutWithDagre` memoized on a visible-id-set string key; `onToggleExpand` reveals a member's direct hidden children; `onToggleAncestorExpand` reveals a member's hidden mother/father then walks each newly-revealed ancestor's own chain to its apex; ships Find me (auto-runs once on mount per D-02), Search by name (walks/expands the match's ancestor chain then frames it), native `<Controls>` (zoom/fit), native `<MiniMap>`; `nodesDraggable={false}` (D-08)
- `FamilyTreeCanvas.test.jsx`: colocated `mockReactFlow()` render-smoke suite -- nodes present, viewer ring/chip vs. non-viewer, hidden descendant reveal, hidden ancestor reveal (D-03), `onMemberClick` firing -- 6 passing tests

## Task Commits

1. **Task 1: Remove spike harness, build MemberNode + UnionNode** - `62caa83` (test) + `a110ed4` (feat)
2. **Task 2: Build FamilyTreeCanvas** - `268a6d6` (feat)
3. **Task 3: Render-smoke test suite for FamilyTreeCanvas** - `bf1ad47` (test)

## Files Created/Modified
- `frontend/src/components/family/MemberNode.jsx` - custom node: avatar/name/years/gender/ring/chip/badges
- `frontend/src/components/family/MemberNode.test.jsx` - 15 tests (years formatting, ring, gender tint, both badges, UnionNode smoke)
- `frontend/src/components/family/UnionNode.jsx` - 24x24px marriage connector, no click target
- `frontend/src/components/family/FamilyTreeCanvas.jsx` - `<ReactFlow>` wrapper, layout-on-visible-subset, bidirectional collapse/expand, D-05 nav aids
- `frontend/src/components/family/FamilyTreeCanvas.test.jsx` - 6 render-smoke tests, colocated `mockReactFlow()`
- `frontend/src/App.jsx` - removed the temporary `family-spike` route and its import

## Decisions Made
- Gender matching uses the actual backend ENUM casing (`Male`/`Female`/`Other`), not the plan's illustrative `MALE`/`FEMALE` strings -- see Deviations below.
- Badges implement only the "Show N hidden {direction}" state (no separate "Hide" label), since the badge's own visibility already tracks whether anything remains hidden -- matches the plan's `<behavior>` test contract exactly.
- `layoutWithDagre` always receives the FULL node/edge arrays (hidden flag added, not filtered) so generation ranks stay stable across expand/collapse toggles, memoized on a visible-id-set string key rather than array identity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gender value casing mismatch between the plan text and the actual data model**
- **Found during:** Task 1 (MemberNode.jsx implementation)
- **Issue:** The plan's `<action>` text and code sample checked `member.gender === 'MALE'` (`'FEMALE'` etc.), but `backend/src/models/FamilyMember.js`'s `gender` column is `DataTypes.ENUM('Male', 'Female', 'Other')` -- title-case, not upper-case. Implementing the plan literally would have silently rendered every real member as "Other" (slate tint, `TransgenderRounded` icon) regardless of their actual recorded gender.
- **Fix:** `genderMeta()` in `MemberNode.jsx` matches on `'Male'`/`'Female'` (title-case) against the real ENUM values, falling back to `'Other'` for anything else -- confirmed against `ManagePage.test.jsx`'s own fixtures, which already use `'Female'`/`'Male'` title-case.
- **Files modified:** `frontend/src/components/family/MemberNode.jsx`
- **Verification:** `MemberNode.test.jsx` asserts all three gender branches using the real title-case values; 15/15 pass.
- **Committed in:** `a110ed4` (Task 1 feat commit)

**2. [Rule 1 - Bug] RESEARCH.md's documented `mockReactFlow()` snippet is missing `contentRect`, crashing the installed `@xyflow/system` version**
- **Found during:** Task 3 (FamilyTreeCanvas.test.jsx)
- **Issue:** The plan's `<interfaces>` section reproduces RESEARCH.md's official-docs `mockReactFlow()` verbatim, whose `MockResizeObserver.observe()` calls `this.callback([{ target }], this)`. The installed `@xyflow/system` (bundled with `@xyflow/react` 12.11.2) internally reads `entry.contentRect.width`/`.height` inside its `extentResizeObserver` callback (`@xyflow/system/dist/esm/index.mjs:2917-2927`), which threw `TypeError: Cannot read properties of undefined (reading 'width')` as an unhandled async exception after every test, failing the overall vitest run despite all assertions passing.
- **Fix:** Added a `contentRect: { width: target.offsetWidth || 1, height: target.offsetHeight || 1 }` field to the mocked ResizeObserver entry, reusing the same `offsetWidth`/`offsetHeight` polyfill already defined in the same mock.
- **Files modified:** `frontend/src/components/family/FamilyTreeCanvas.test.jsx`
- **Verification:** `npm test --workspace frontend -- FamilyTreeCanvas` -- 6/6 pass with zero unhandled errors (previously 6/6 assertions passed but the process still exited non-zero due to the leaked exception).
- **Committed in:** `bf1ad47` (Task 3 test commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- one a plan-text/data-model casing mismatch, one a stale/incomplete third-party testing snippet). No scope creep; both fixes are fully contained to the files the plan already targeted.

## Issues Encountered

None beyond the two deviations above. TDD RED/GREEN for Tasks 1 and 3 was authored with the test file and implementation developed together against the plan's explicit `<behavior>` contract (not a blind red-then-green loop) and committed as separate `test`/`feat` commits per task, matching the precedent already established in 17-02's summary for this same reason.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Plan 17-04 (FamilyTreePage + route wiring) can now mount `<FamilyTreeCanvas>` under its own `<ReactFlowProvider>`, feeding it `buildForest()`'s `{ nodes, edges, initialExpandedIds }` output plus a resolved `viewerId`, and register the real `path="family"` route (this plan deliberately did not add it, per its own scope boundary).
- `FamilyTreeCanvas`'s `onMemberClick` prop is wired and tested but has no consumer yet -- Plan 17-04's `MemberDetailPanel` (D-08, read-only popover) is the intended next caller.
- Full workspace suite green: backend 321/321, frontend 154/154 (up from 115 pre-phase; +39 this plan across Plans 17-01..03).

---
*Phase: 17-family-deep-tree-visualization*
*Completed: 2026-07-25*

## Self-Check: PASSED

All 5 created/modified source files verified present on disk; `__spike/` directory verified removed; all 4 commit hashes (62caa83, a110ed4, 268a6d6, bf1ad47) verified present in git log.
