---
phase: quick-260801-hfw
plan: 01
subsystem: ui
tags: [dagre, family-tree, layout, react-flow, vitest]

# Dependency graph
requires: []
provides:
  - "familyTree.layout.js reserves a COUPLE_W (PERSON_W*2 + SPOUSE_GAP) dagre node footprint for each spouse-pairing anchor, so dagre's own nodesep spacing prevents a spouse rect from ever overlapping a sibling or any other node"
affects: [family-tree]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-layout pairing computation: derive anchor/mover spouse pairs before building dagre nodes, so the reserved node width can influence dagre's own spacing instead of only correcting positions after the fact"

key-files:
  created: []
  modified:
    - frontend/src/components/family/familyTree.layout.js
    - frontend/src/components/family/familyTree.layout.test.js

key-decisions:
  - "Reserved the couple's combined footprint (COUPLE_W = PERSON_W*2 + SPOUSE_GAP) as the anchor's dagre node width before calling dagre.layout, rather than post-hoc-correcting overlaps after layout — lets dagre's existing nodesep spacing do the collision avoidance for free"
  - "Added an explicit anchor/mover role guard (usedInPair Set) so a node can never be double-counted across multiple spouse pairs, preventing conflicting width reservations in multi-spouse data"

patterns-established: []

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-08-01
---

# Phase quick-260801-hfw: Fix family tree spouse node overlap Summary

**Reserved a COUPLE_W (PERSON_W*2 + SPOUSE_GAP) dagre node footprint for spouse-pairing anchors so dagre's own spacing prevents a married-in spouse from ever landing on top of a sibling node.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-01T10:26:00Z (approx, pre-worktree-check)
- **Completed:** 2026-08-01T10:38:26Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Root-caused and fixed the `/family` tree overlap bug: dagre previously only reserved one `PERSON_W` slot per person and the spouse was snapped in after layout with no space actually reserved, so a spouse could land on top of the anchor's sibling.
- `layoutWithDagre` now precomputes spouse anchor/mover pairings before building dagre nodes, giving each anchor a `COUPLE_W` node width so dagre's nodesep spacing reserves the couple's combined space up front.
- Added a guard preventing a node from holding both anchor and mover roles across multiple spouse pairs.
- Added a relative-invariant test (`mover.x === anchor.x + PERSON_W + SPOUSE_GAP`, `mover.y === anchor.y`) and a new pairwise AABB overlap regression test covering a bloodline-anchor-with-sibling + married-in-spouse fixture.

## Task Commits

1. **Task 1: Reserve couple footprint in dagre so spouse never overlaps a sibling** - `86e1b25` (fix)

_No separate plan-metadata commit — this is a quick task; SUMMARY.md commit below serves that role._

## Files Created/Modified
- `frontend/src/components/family/familyTree.layout.js` - `layoutWithDagre` now computes spouse anchor/mover pairs up front, reserves `COUPLE_W` dagre node width for each anchor, and converts dagre's returned center to top-left using each node's actual width (COUPLE_W for anchors, PERSON_W otherwise); mover-snap formula unchanged
- `frontend/src/components/family/familyTree.layout.test.js` - Added a relative-invariant spouse-position test and a new `layoutWithDagre — spouse/sibling overlap regression` describe block asserting zero pairwise AABB rect overlap across all nodes in a sibling+spouse fixture

## Decisions Made
- Reserved the couple's combined footprint as the anchor's dagre node width before layout (rather than correcting positions after layout), so dagre's own nodesep spacing does the collision avoidance — this keeps the fix minimal and doesn't require any new post-layout overlap-resolution pass.
- Used a `usedInPair` Set to guard against double role assignment across multiple spouse pairs sharing a node, matching the plan's Step 1 instruction exactly.

## Deviations from Plan

None - plan executed exactly as written. Audited all 7 pre-existing tests per the plan's instruction; confirmed none asserted an exact spouse-anchor/mover x/y value, so no rewrite of existing assertions was needed (only additive tests, as anticipated by the plan).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Next Phase Readiness
- Fix is self-contained to `familyTree.layout.js`/`familyTree.layout.test.js`; no follow-on work required.
- Full frontend suite green: 305/305 tests passing (303 pre-existing + 2 new).

---
*Phase: quick-260801-hfw*
*Completed: 2026-08-01*
