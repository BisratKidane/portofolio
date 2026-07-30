---
phase: 14-relationship-resolvers-permission-scoping-query-safety
plan: 03
subsystem: api
tags: [graphql, dataloader, sequelize, query-safety, backend]

# Dependency graph
requires:
  - phase: 14-01
    provides: createLoaders(models) (memberById, childrenByParentId, spousesByMemberId), shared serverConfig.js validationRules (maxDepthRule)
  - phase: 14-02
    provides: computeEditableScope (not consumed here directly, but establishes the PERM-05 pattern later mutation plans will follow)
provides:
  - "FamilyMember.mother/father/spouses/children/siblings/linkedUser GraphQL field resolvers, all DataLoader-backed except linkedUser"
  - "backend/test/familyTreeFactory.js buildGenerationFixture({ depth, childrenPerNode }) reusable N-generation test fixture builder"
  - "SC-5 proof: flat/bounded SQL query count on a 255-node/8-generation fixture, and a real recursive-field (children) depth-limit rejection test"
affects: [14-04, 14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "siblings field resolver reuses childrenByParentId (no new loader) -- derives sibling set from the union of each non-null parent's children, de-duplicated by id, excluding self (REL-04/D-03)"
    - "mother/father guard the FK for null before calling loaders.memberById.load, returning null directly rather than calling .load(null)"
    - "linkedUser deliberately bypasses the loader layer, using the Sequelize association mixin (member.getLinkedUser()) directly -- documented as a discretionary choice since it is not on the deep-fan-out recursive traversal path"
    - "buildGenerationFixture: single-lineage tree builder, alternates motherId/fatherId by level (not by parent gender) -- arbitrary, documented choice"

key-files:
  created:
    - backend/src/resolvers/familyMember.relationships.test.js
    - backend/test/familyTreeFactory.js
    - backend/src/services/familyMember.queryCount.test.js
  modified:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js

key-decisions:
  - "buildGenerationFixture loops (depth - 1) times starting from one root (generation 1), so depth: 8 / childrenPerNode: 2 produces exactly 255 nodes across 8 generations (2^depth - 1) -- matches the plan's literal 255-node/8-generation spec"
  - "The over-depth rejection test builds a hand-crafted query nesting the real `children` field env.maxQueryDepth + 10 levels deep against a tiny 2-node fixture -- validation rejection is purely syntactic (schema-shape-based), so it does not require the query to have real data at every level to prove the rejection"

patterns-established:
  - "Every DataLoader-backed relationship field resolver takes (member, _args, { loaders }) and returns loaders.<name>.load(Number(...)) directly, or a guarded null for optional FKs -- this is the template later Phase 14 mutation resolvers' companion queries should follow when exposing new relationship fields"

requirements-completed: [REL-04, PERM-05]

# Metrics
duration: 16min
completed: 2026-07-22
---

# Phase 14 Plan 03: Recursive FamilyMember Field Resolvers + SC-5 Query-Safety Proof Summary

**FamilyMember's mother/father/spouses/children/siblings/linkedUser fields now resolve over GraphQL through the Wave-1 DataLoader factory, with a 255-node/8-generation fixture proving both halves of SC-5: flat/bounded SQL query count and real recursive-field depth-limit rejection.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-22T21:18:00+02:00 (approx, first test run)
- **Completed:** 2026-07-22T21:23:52+02:00 (full suite green)
- **Tasks:** 2 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `FamilyMember` type extended with `mother`, `father`, `spouses`, `children`, `siblings`, `linkedUser` fields, all wired through `familyMemberResolvers.FamilyMember` field-resolver map
- `mother`/`father` guard null FKs before calling `loaders.memberById.load`, never calling `.load(null)`
- `spouses`/`children` call `loaders.spousesByMemberId`/`loaders.childrenByParentId` directly
- `siblings` derives from `loaders.childrenByParentId` only (no new loader) per D-03/REL-04 -- collects non-null parent ids, loads each parent's children, de-duplicates by id, excludes self
- `linkedUser` uses `member.getLinkedUser()` (Sequelize association mixin), a documented discretionary choice since this field is not on the deep-fan-out traversal path
- `backend/test/familyTreeFactory.js` exports `buildGenerationFixture({ depth, childrenPerNode })`, a reusable single-lineage N-generation fixture builder
- `familyMember.queryCount.test.js` proves: (1) a 255-node/8-generation tree resolves correctly through 7 nested `children` levels, (2) the resolved SQL query count for that same query is bounded (well under 20, not proportional to the 255-node fixture size), and (3) a real `children`-field query nested beyond `env.maxQueryDepth` is rejected with `GRAPHQL_VALIDATION_FAILED`

## Task Commits

Both tasks followed TDD red-green (no refactor step needed):

1. **Task 1: Recursive FamilyMember fields wired to DataLoaders**
   - `36e9a26` (test) -- add failing test for FamilyMember relationship field resolvers, confirmed RED (6/6 failing: "Cannot query field ... on type FamilyMember")
   - `0502346` (feat) -- add mother/father/spouses/children/siblings/linkedUser field resolvers, confirmed GREEN (6/6 passing)
2. **Task 2: SC-5 proof -- flat query count + real recursive-field depth-limit rejection**
   - `5070291` (test) -- add failing SC-5 test importing `buildGenerationFixture` (which did not exist yet), confirmed RED (module-not-found failure)
   - `759b85d` (feat) -- add `buildGenerationFixture`, confirmed GREEN (3/3 passing)

_TDD: both tasks followed test -> feat, no refactor step needed._

## Files Created/Modified

- `backend/src/schemas/familyMember.schema.js` -- added `mother`, `father`, `spouses`, `children`, `siblings`, `linkedUser` fields to the `FamilyMember` type
- `backend/src/resolvers/familyMember.resolver.js` -- added a `FamilyMember` field-resolver map alongside the existing `Query` map
- `backend/src/resolvers/familyMember.relationships.test.js` -- 6 tests covering null-FK guard, either-side spouse resolution, either-parent children, full/half-sibling derivation + self-exclusion, linkedUser presence/absence
- `backend/test/familyTreeFactory.js` -- `buildGenerationFixture({ depth, childrenPerNode })`
- `backend/src/services/familyMember.queryCount.test.js` -- 3 tests: deep-tree shape correctness, bounded SQL query count, over-depth real-field rejection

## Decisions Made

- `buildGenerationFixture` loops `depth - 1` times from one root (root = generation 1), so `{ depth: 8, childrenPerNode: 2 }` yields exactly 255 nodes across 8 generations (`2^depth - 1`), matching the plan's literal 255-node/8-generation spec precisely.
- The parent-FK alternation in the fixture (motherId on odd levels, fatherId on even levels) is by tree level, not by the parent's actual `gender` field -- documented as an arbitrary, deliberate choice since this fixture exercises the either-parent-FK query/loader shape, not gender-consistency rules.
- The over-depth rejection test uses a tiny 2-node fixture (not the full 255-node tree) since GraphQL validation-phase depth rejection is purely schema-shape-based and happens before any resolver executes -- no need for real data at every nested level to prove the rejection.
- Both SC-5 assertions (shape-correctness and query-count) run against the *same* nested query construction (`buildDeepChildrenQuery(7)`) applied to the *same* 255-node fixture, so the query-count bound is measured on the exact query proven to resolve the whole tree correctly, not a simplified stand-in.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<behavior>`/`<action>` specifications were followed directly; no Rule 1-4 auto-fixes were needed.

## Verification

- `npm test --workspace backend -- src/resolvers/familyMember.relationships.test.js` -- 6/6 passing
- `npm test --workspace backend -- src/services/familyMember.queryCount.test.js` -- 3/3 passing
- `npm test --workspace backend` (full suite) -- 223/223 passing (214 baseline + 6 + 3 new), single-executor run, no cross-worktree contention observed
- Grep gates (both confirmed): `grep -A15 "siblings:" backend/src/resolvers/familyMember.resolver.js | grep "childrenByParentId"` matches; `grep -n "export async function buildGenerationFixture" backend/test/familyTreeFactory.js` matches

## TDD Gate Compliance

Both tasks followed RED -> GREEN as separate commits, confirmed by temporarily removing/re-adding the not-yet-existing implementation file between the RED and GREEN steps:
- Task 1: `36e9a26` (test, RED: 6/6 failing on missing schema fields) -> `0502346` (feat, GREEN: 6/6 passing)
- Task 2: `5070291` (test, RED: confirmed by physically removing `familyTreeFactory.js` before running, producing a module-not-found failure) -> `759b85d` (feat, GREEN: 3/3 passing after restoring the factory)

## Known Stubs

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

The read-side relationship surface (`mother`/`father`/`spouses`/`children`/`siblings`/`linkedUser`) is now live and DataLoader-backed, ready for plans 14-04/14-05/14-06's mutation resolvers to query against when asserting relationship state after writes. SC-5's query-safety proof (flat query count + real-field depth-limit rejection) is in place as a regression gate. No blockers for subsequent plans in this phase.

---
*Phase: 14-relationship-resolvers-permission-scoping-query-safety*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: backend/src/resolvers/familyMember.relationships.test.js
- FOUND: backend/test/familyTreeFactory.js
- FOUND: backend/src/services/familyMember.queryCount.test.js
- FOUND commit: 36e9a26 (test: FamilyMember relationship field resolvers, RED)
- FOUND commit: 0502346 (feat: relationship field resolvers, GREEN)
- FOUND commit: 5070291 (test: SC-5 flat-query-count + depth-limit rejection, RED)
- FOUND commit: 759b85d (feat: buildGenerationFixture, GREEN)
