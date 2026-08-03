---
phase: 24-backend-read-layer-for-detail
plan: 02
subsystem: testing
tags: [graphql, sequelize, dataloader, n+1, vitest, apollo-server]

# Dependency graph
requires:
  - phase: 24-backend-read-layer-for-detail (plan 24-01/earlier work)
    provides: childrenByParentId/spousesByMemberId DataLoaders, the deep-tree bounded-SQL test file/countQueries() recipe
provides:
  - A new, isolated proof that the /detail direct-children-with-spouses read shape (`children { id children { id } spouses { id } } }`) resolves in a flat/bounded SQL-statement count regardless of child/grandchild count
  - A reusable small-fixture builder (buildChildrenWithSpousesFixture) for tests needing children + grandchildren + at least one married-in spouse, where buildGenerationFixture cannot help (no spouse support)
affects: [25-person-card, 26-detail-page, 27-descendant-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounded-SQL-count proof: build two fixture sizes (small/large), run the same query through countQueries(), assert the count does not increase between them -- the concrete proof that batching is flat, not proportional to entity count"

key-files:
  created: []
  modified:
    - backend/src/services/familyMember.queryCount.test.js

key-decisions:
  - "Built the spouse-bearing fixture directly via models.FamilyMember.create()/models.Spouse.create() rather than extending buildGenerationFixture, since that factory deliberately produces a single-lineage tree with zero spouse rows (per plan interfaces)"
  - "Used gender: 'Other' throughout the fixture (mirroring buildGenerationFixture's own convention) since motherId/fatherId FKs are not gender-validated at the model level"

patterns-established:
  - "Scaling-fixture bounded-query proof: assert queryCount does not grow between a ~3x smaller and larger fixture of the same shape, not just an absolute upper bound -- catches N+1 regressions an absolute bound alone could miss if both counts happen to fit under the ceiling"

requirements-completed: [PERF-02, API-01]

# Metrics
duration: 20min
completed: 2026-08-03
---

# Phase 24 Plan 02: SC-4/PERF-02 Bounded-SQL N+1 Proof (Children + Spouses) Summary

**Added a scaling bounded-SQL-statement-count test proving `familyMember(id) { children { id children { id } spouses { id } } }` stays flat from 3 to 10 direct children, reusing the existing unmodified DataLoaders -- zero production code changes.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-03T09:47:00Z (approx, per STATE.md session)
- **Completed:** 2026-08-03T10:00:28Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `CHILDREN_SPOUSES_QUERY` (the exact D-06 shape) and `buildChildrenWithSpousesFixture(childCount)` to `familyMember.queryCount.test.js`, building a root + N direct children + 2 grandchildren per child + one married-in spouse, entirely via `models.FamilyMember.create`/`models.Spouse.create`.
- New test builds a 3-child fixture and a 10-child fixture, runs the identical query through the existing `countQueries()` recipe for each, and asserts: `errors` undefined, correct child/grandchild/spouse counts in the returned data, and that the large-fixture query count does not exceed the small-fixture query count (both bounded below 10) -- the concrete flat/bounded proof required by SC-4/PERF-02.
- Zero production code touched -- `git diff` for this plan touches only the test file.

## Task Commits

Each task was committed atomically:

1. **Task 1: SC-4/PERF-02 bounded-SQL N+1 proof for direct-children + spouses (D-06)** - `ec11608` (test)

_No plan-metadata commit is created here — worktree mode; the orchestrator handles STATE.md/ROADMAP.md after merge._

## Files Created/Modified
- `backend/src/services/familyMember.queryCount.test.js` - Added `CHILDREN_SPOUSES_QUERY`, `buildChildrenWithSpousesFixture()`, and one new scaling bounded-SQL-count test to the existing `describe('SC-5: FamilyMember relationship query safety', ...)` block

## Decisions Made
- Built the spouse-bearing fixture directly via `models.FamilyMember.create()`/`models.Spouse.create()` rather than extending `buildGenerationFixture` (that factory deliberately has no spouse support, per the plan's own interfaces note).
- Used `gender: 'Other'` throughout (matching `buildGenerationFixture`'s own convention) since `motherId`/`fatherId` FKs carry no gender validation at the model level -- kept the fixture simple.
- Asserted the large-fixture (10 children) query count is `<= ` the small-fixture (3 children) count, not just independently below a ceiling -- this is the concrete "does not grow with entity count" proof the plan calls for, not merely "stays under N".

## Deviations from Plan

None - plan executed exactly as written. No production code changes; the single new test file section matches the plan's `files_modified` frontmatter exactly.

## Issues Encountered

- **Full backend suite (`npm test --workspace backend`, non-scoped run) exhibited lock contention and hangs.** This is a parallel-execution/shared-test-DB artifact: multiple sibling worktree agents from the same wave (plan 24-01, 24-03, etc.) were concurrently running their own `npm test` invocations against the same physical MySQL test database (visible via `ps aux` showing concurrent `vitest run src/resolvers/familyMember.head.test.js` / `familyMember.search.test.js` processes from other worktrees, and a subsequent full-suite run hanging at 0% CPU on FK/lock waits until manually terminated). One completed partial run surfaced only the already-documented pre-existing flake `VERIFY-04` (admin-race, per STATE.md D-08) -- no new failures attributable to this plan's change. This plan's own scoped verification command, `npm test --workspace backend -- familyMember.queryCount.test.js`, ran in isolation and passed cleanly (4/4, including the 3 pre-existing tests in this file). This is an orchestration-level concern (shared test DB across concurrent worktree agents), not a defect in this plan's test file or a regression it introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The D-06 read shape (`children { id children { id } spouses { id } } }`) is now proven bounded/flat for the exact nesting the `/detail` direct-children-with-counts requirement (SC-4) needs, using only the already-existing, unmodified `childrenByParentId`/`spousesByMemberId` DataLoaders.
- No blockers for Phase 25 (PersonCard) or later phases that consume this read shape -- the underlying resolvers/loaders are unchanged, just newly proven correct under this specific nesting/spouse combination.
- Recommend the orchestrator re-run the full backend suite once all Phase 24 wave worktree agents have merged (serialized, not concurrent) to get a clean, contention-free full-suite signal before closing the phase.

---
*Phase: 24-backend-read-layer-for-detail*
*Completed: 2026-08-03*
