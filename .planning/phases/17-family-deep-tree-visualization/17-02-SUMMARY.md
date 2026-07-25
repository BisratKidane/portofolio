---
phase: 17-family-deep-tree-visualization
plan: 02
subsystem: ui
tags: [react-flow, xyflow, dagre, family-tree, visualization, spike]

# Dependency graph
requires:
  - phase: 17-01
    provides: familyMembers query guard relaxed to requireFamilyAccess (D-13), giving any linked member/admin read access to the whole tree
provides:
  - "familyTree.assembly.js: buildForest, computeInitialExpandSet, deriveSiblings — pure, DOM-free forest assembly (apex detection, generation ranking, union-node synthesis, D-04 initial-expand-set)"
  - "familyTree.layout.js: layoutWithDagre — dagre TB layout wrapper with a working (non-minlen:0) union-node same-rank mechanism"
  - "SC-1 spike proof: the synthetic-union-node spouse-pairing pattern renders cleanly at ~18-generation depth, human-approved, unblocking Plan 17-03"
affects: [17-03, 17-04]

# Tech tracking
tech-stack:
  added: ["@xyflow/react@12.11.2", "@dagrejs/dagre@3.0.0"]
  patterns:
    - "Pure client-side forest-assembly module (no React/DOM) shared by spike and production canvas"
    - "Union-node midpoint positioning: union nodes excluded from dagre's ranking graph, positioned as the post-layout midpoint of their two partners, instead of dagre's own minlen:0 ranking (which crashes)"

key-files:
  created:
    - frontend/src/components/family/familyTree.assembly.js
    - frontend/src/components/family/familyTree.assembly.test.js
    - frontend/src/components/family/familyTree.layout.js
    - frontend/src/components/family/familyTree.layout.test.js
    - frontend/src/components/family/__spike/buildSpikeFixture.js
    - frontend/src/components/family/__spike/TreeSpikeHarness.jsx
  modified:
    - frontend/package.json
    - frontend/src/App.jsx

key-decisions:
  - "D-11 SC-1 gate PASSED (human-approved 2026-07-25): couples render adjacent with no gap row, children one rank below their union node, no card overlap / responsive pan-zoom at ~18-generation depth (53 synthetic members, 71 rendered nodes) — Plan 17-03 (production canvas) is unblocked."
  - "D-12 locked with an amendment: the union-node midpoint mechanism (not RESEARCH.md's minlen:0) is the production spouse-pairing implementation, since it produces the identical spike-approved visual result."
  - "RESEARCH.md Pattern 2's minlen:0 marriage-edge technique is unusable with @dagrejs/dagre — confirmed broken across v1.1.4/v2.0.4/v3.0.0, corroborated by open upstream issue dagrejs/dagre#280 ('cannot set edge minlen=0')."

requirements-completed: [TREE-01]

# Metrics
duration: 16min
completed: 2026-07-25
---

# Phase 17 Plan 02: Deep Tree Assembly, Layout & SC-1 Spike Gate Summary

**Pure forest-assembly (`buildForest`/`computeInitialExpandSet`/`deriveSiblings`) and a dagre TB layout wrapper for the `/family` tree, with the D-11 SC-1 spike human-approved at ~18-generation synthetic depth — using a working union-node midpoint mechanism in place of RESEARCH.md's dagre-crashing `minlen: 0` approach.**

## Performance

- **Duration:** 16 min (Tasks 1-2 auto execution + Task 3 build; excludes human checkpoint wait time)
- **Started:** 2026-07-25T14:21:15+02:00
- **Completed:** 2026-07-25T14:32:39+02:00 (Tasks 1-3 build); checkpoint approved same day
- **Tasks:** 3 (2 auto, 1 human-verify checkpoint)
- **Files modified:** 9

## Accomplishments
- `familyTree.assembly.js`: apex detection, BFS/Kahn-style generation ranking, symmetric spouse-pair union-node synthesis, D-04 initial-expand-set (ancestral spine + viewer's direct line), D-03's deliberate spouse-parent-chain exclusion — all DOM-free, 13 passing Vitest tests
- `familyTree.layout.js`: dagre TB layout wrapper achieving the documented "union node same rank as partners, children one rank below" contract via a mechanism that actually works with `@dagrejs/dagre` (RESEARCH.md's literal `minlen: 0` sample crashes the library) — 5 passing Vitest tests including the Pitfall-4 same-rank regression guard
- SC-1 spike (`__spike/buildSpikeFixture.js` + `TreeSpikeHarness.jsx`, temporary `/family-spike` route): human-verified at ~18-generation depth (53 synthetic members, 71 nodes) — **D-11 hard gate PASSED**, unblocking Plan 17-03's production canvas build

## Task Commits

1. **Task 1: Install xyflow/dagre and build the pure forest-assembly module** - `c43ad2c` (test)
2. **Task 2: Build the dagre layout wrapper (familyTree.layout.js)** - `d18e122` (test)
3. **Task 3: SC-1 spike — visually verify the union-node pattern at realistic depth (D-11 hard gate)** - `0b73b9a` (feat, build) + human "approved" via checkpoint continuation

**Plan metadata:** (this commit)

_Note: Tasks 1-2 carry tdd="true"; RED/GREEN work for Task 1 had already landed staged-but-uncommitted from a prior interrupted session and was verified + committed as a single unit (13/13 tests passing) rather than re-split into separate RED/GREEN commits. Task 2 followed strict RED→GREEN (failing import first, then implementation) within this session._

## Files Created/Modified
- `frontend/src/components/family/familyTree.assembly.js` - `buildForest`, `computeInitialExpandSet`, `deriveSiblings` (pure, DOM-free)
- `frontend/src/components/family/familyTree.assembly.test.js` - 13 tests: apex generation-0, union synthesis, D-04 spine/direct-line, D-03 exclusion, empty-array edge case
- `frontend/src/components/family/familyTree.layout.js` - `layoutWithDagre(nodes, edges, options)` — dagre TB wrapper with union-midpoint positioning
- `frontend/src/components/family/familyTree.layout.test.js` - 5 tests: same-rank center-y invariant, child one-rank-below, field preservation, non-mutation, option overrides
- `frontend/src/components/family/__spike/buildSpikeFixture.js` - synthetic ~18-generation flat member generator (spine + married-in spouses + side-branch leaves)
- `frontend/src/components/family/__spike/TreeSpikeHarness.jsx` - buildForest → layoutWithDagre → ReactFlow render, temporary
- `frontend/package.json` - `@xyflow/react` + `@dagrejs/dagre` dependencies
- `frontend/src/App.jsx` - temporary `family-spike` route inside the existing `ProtectedRoute` block

## Decisions Made
- **D-11 SC-1 gate PASSED** (human-approved 2026-07-25): all three visual checks confirmed — couples adjacent with no gap row, children cleanly one rank below their union node, no overlap and responsive pan/zoom at ~18-generation depth. Plan 17-03 (production canvas) is now unblocked.
- **D-12 locked with an implementation amendment**: the production spouse-pairing mechanism is the union-node midpoint approach built here (`familyTree.layout.js`), not RESEARCH.md's literal `minlen: 0` dagre edge — the midpoint approach was spike-tested and human-approved, satisfying D-12's "spike-driven, locked once the spike proves what renders cleanly at depth" criterion.
- Deferred the `__spike/` directory and temporary `family-spike` route's removal to a later plan per this plan's own text (Plan 17-03 Task 1 is documented as the removal point, and Plan 17-03 depends on the shared `familyTree.assembly.js`/`familyTree.layout.js` modules built here) — not removed in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `@dagrejs/dagre`'s `minlen: 0` marriage-edge technique (RESEARCH.md Pattern 2) crashes at runtime**
- **Found during:** Task 2 (familyTree.layout.js implementation)
- **Issue:** The plan's `<interfaces>` section specifies feeding marriage edges into dagre with `minlen: 0` so the union node lands on the same rank as its two partners. Implementing this verbatim throws `TypeError: Cannot read properties of undefined (reading 'forEach')` inside dagre's internal layout pipeline. Reproduced with a minimal 2-node graph (no custom shapes, no ReactFlow involved) across `@dagrejs/dagre` v1.1.4, v2.0.4, and v3.0.0 (the installed version) — not a version-specific regression, broken in every version tested. Corroborated by an open, unresolved upstream issue: `dagrejs/dagre#280` ("cannot set edge minlen=0").
- **Fix:** Implemented `layoutWithDagre` to achieve the identical documented visual contract via a working mechanism: union nodes are excluded from dagre's ranking graph entirely; each union's two partners get direct `minlen: 1` ranking edges straight to their shared children (dagre's longest-path ranking naturally assigns both partners the same rank when they share a child — proven in `familyTree.layout.test.js`); after dagre lays out the member nodes, each union node's position is computed as the midpoint of its two already-positioned partners. Documented extensively in-file (`familyTree.layout.js` header comment) and flagged explicitly to the human before the SC-1 checkpoint judgment.
- **Files modified:** `frontend/src/components/family/familyTree.layout.js`, `familyTree.layout.test.js`
- **Verification:** 5/5 Vitest tests pass, including a same-rank (center-y) regression guard; the SC-1 spike was rendered and human-approved using this exact mechanism, so the fix is validated end-to-end at ~18-generation depth, not just unit-level.
- **Committed in:** `d18e122` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — third-party library limitation, not our code)
**Impact on plan:** Necessary for correctness — the plan's literal prescribed technique is unusable with the installed library version. The external behavioral contract (union node same-rank as partners, D-11/D-12 visual requirements) is unchanged and was itself the thing the human checkpoint verified and approved. No scope creep — fix is fully contained to `familyTree.layout.js`'s internal implementation.

## Issues Encountered
- Task 1's implementation files (`familyTree.assembly.js`, `familyTree.assembly.test.js`) and the `@xyflow/react`/`@dagrejs/dagre` package.json changes were found already staged (not yet committed) at the start of this execution session — apparently completed but not committed in a prior interrupted session. Verified all Task 1 acceptance criteria (grep checks, 13/13 passing tests, D-03 exclusion test present) before committing as-is.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 17-03 (production `/family` canvas) is unblocked: `familyTree.assembly.js` and `familyTree.layout.js` are production-grade, fully unit-tested, and already proven at depth via the SC-1 spike.
- Plan 17-03 Task 1 must delete `frontend/src/components/family/__spike/` and remove the temporary `family-spike` route from `frontend/src/App.jsx` (left in place deliberately by this plan, per T-17-05's accepted-and-tracked disposition).
- Plan 17-03 should implement production spouse-pairing using the union-midpoint mechanism proven here, not RESEARCH.md's literal `minlen: 0` sample.

---
*Phase: 17-family-deep-tree-visualization*
*Completed: 2026-07-25*
