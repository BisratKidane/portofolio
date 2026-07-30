---
phase: 12-family-data-model-foundation
plan: 03
subsystem: database
tags: [sequelize, graph-algorithm, cycle-prevention, service-layer, tdd, family-tree]

# Dependency graph
requires:
  - phase: 12-01
    provides: FamilyMember Sequelize model (required identity fields, optional fields, fullname VIRTUAL, cross-field date validation)
  - phase: 12-02
    provides: motherId/fatherId self-referencing associations, resetTables() test helper extended for FK-constrained tables
provides:
  - "wouldCreateCycle(childId, candidateParentId) — batched-per-depth-level ancestor-chain BFS walk, MAX_DEPTH=100 bounded, rejects direct self-parenting and multi-generation cycles"
  - "linkParent(childId, { motherId, fatherId }) — cycle-guarded parent reassignment; rejects before any DB write, letting the real FK constraint surface nonexistent-parent errors"
  - "addChild(attrs) — thin FamilyMember.create() entry point for REL-03 (create-under-existing-parent)"
  - "backend/src/services/ directory established as the codebase's first service-layer module"
affects: [12-04, 14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone-named-function service module (no class, no default export), mirroring backend/src/utils/auth.js's shape — first instance of this pattern applied outside utils/"
    - "Batched-per-depth-level ancestor-chain walk: one models.FamilyMember.findAll({ where: { id: frontier } }) call per BFS depth level (not per node), bounding query count by tree depth rather than subtree width"
    - "Cycle-check-before-mutation choke point: linkParent runs wouldCreateCycle and throws before calling models.FamilyMember.update(), so a rejected cycle never partially applies to the target row"

key-files:
  created: [backend/src/services/familyMember.service.js, backend/src/models/FamilyMember.cycle.test.js]
  modified: []

key-decisions: []

patterns-established:
  - "Service-layer helpers as the mandatory choke point for parent-edge mutations: any future caller (Phase 14 resolvers) must route through linkParent/addChild rather than raw FamilyMember.update()/create(), to preserve cycle-safety (documented in the plan's threat model as an accepted risk until Phase 14 enforces it)"

requirements-completed: [REL-01, REL-03, REL-05]

# Metrics
duration: 6min
completed: 2026-07-21
---

# Phase 12 Plan 03: Family Data Model Cycle Prevention Summary

**Batched-per-depth ancestor-chain BFS walk (`wouldCreateCycle`, MAX_DEPTH=100) guarding `linkParent`/backing `addChild` — the codebase's first hand-rolled graph algorithm, built test-first, full backend suite 166/166 green.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-21T20:55:00+02:00
- **Completed:** 2026-07-21T21:01:00+02:00
- **Tasks:** 2 (RED, GREEN)
- **Files modified:** 2 (both created)

## Accomplishments
- `FamilyMember.cycle.test.js` written first against the not-yet-existing `backend/src/services/familyMember.service.js`, confirmed RED (module-not-found import error)
- `familyMember.service.js` implemented exactly per RESEARCH.md's Pattern 4 (verbatim algorithm): `wouldCreateCycle` short-circuits on direct self-assignment, then walks the candidate parent's ancestor chain frontier-by-frontier with a single batched `findAll` per depth level (bounded by `MAX_DEPTH = 100`, i.e. by tree *depth* not *width*); `linkParent` runs the cycle check before any DB write and only mutates the keys actually passed; `addChild` is a thin, named `FamilyMember.create()` entry point
- All 9 test cases green: self-assignment, multi-generation cycle, unrelated-member non-cycle, cyclic-rejection-leaves-row-unmodified, valid mother/father reassignment, FK error surfaced (not a cycle error) for a nonexistent parent id, addChild with and without a parent
- Full backend suite green: 166/166 (9 new + 157 pre-existing, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write FamilyMember.cycle.test.js against the not-yet-existing service module** - `1900a1e` (test)
2. **Task 2 (GREEN): Implement familyMember.service.js — wouldCreateCycle, linkParent, addChild** - `c8e5574` (feat)

_Note: this is a `type: tdd` plan; RED and GREEN gate commits both present, no REFACTOR commit needed (implementation matched RESEARCH.md's Pattern 4 exactly, no cleanup required)._

## Files Created/Modified
- `backend/src/services/familyMember.service.js` - `wouldCreateCycle`/`linkParent`/`addChild` standalone async functions, no class, single `findAll` call site per BFS depth level
- `backend/src/models/FamilyMember.cycle.test.js` - REL-05 cycle-rejection coverage plus `linkParent`/`addChild` behavior tests (9 cases)

## Decisions Made
None beyond what RESEARCH.md's Pattern 4 already specified — the implementation followed the cited algorithm verbatim (batched per-depth query, explicit self-assignment short-circuit, `visited` set to bound the walk).

## Deviations from Plan

None - plan executed exactly as written. The implementation matched RESEARCH.md's Pattern 4 code example verbatim; no bugs, blocking issues, or missing functionality were discovered during execution.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Threat Model Verification

- **T-12-08 (Tampering, mitigate):** Verified — the "rejects a cyclic reassignment and leaves the row unmodified" test asserts `wouldCreateCycle` runs and `linkParent` throws before `models.FamilyMember.update()` is ever called; reloading the target row afterward confirms `motherId` is still `null` (no partial application).
- **T-12-09 (Denial of Service, mitigate):** Verified — `MAX_DEPTH = 100` bounds the walk (`grep -c "MAX_DEPTH = 100"` = 1); exactly one `models.FamilyMember.findAll` call site exists in the function body (`grep -c "FamilyMember.findAll"` = 1), confirming the batched-per-depth-level query shape (bounded by tree depth, not subtree width).
- **T-12-10 (Tampering, accept):** No resolver layer exists yet in this phase — explicitly deferred to Phase 14 per the plan's threat model; Phase 14 must call `linkParent`/`addChild`, not raw `FamilyMember.update()`/`create()`, to preserve cycle-safety. No action taken this plan (correctly, per disposition).

## Next Phase Readiness
- `wouldCreateCycle`/`linkParent`/`addChild` are ready for Plan 12-04 (married-in-delete / `setSpouse`/`deleteMember` helpers) to sit alongside in the same `backend/src/services/` directory.
- Full backend suite (166/166) stays green; no regressions against `User`/`FamilyMember`/`Spouse` models or existing resolver/util tests.
- Phase 14 (permission-scoping + relationship resolvers) must route all parent-edge mutations through `linkParent`/`addChild` rather than raw model calls, per T-12-10's accepted-risk disposition — flagged for that phase's planner.
- No blockers for downstream plans in this phase.

---
*Phase: 12-family-data-model-foundation*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: backend/src/services/familyMember.service.js
- FOUND: backend/src/models/FamilyMember.cycle.test.js
- FOUND: commit 1900a1e (test)
- FOUND: commit c8e5574 (feat)
