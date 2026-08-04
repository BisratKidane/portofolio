---
phase: 28-admin-actions-on-detail
plan: 01
subsystem: testing
tags: [vitest, graphql, apollo, authorization, adversarial-test]

# Dependency graph
requires:
  - phase: 14-relationship-mutations-permissions
    provides: requireFamilyAccess + computeEditableScope scope-check guards on editMember/addChild/addSpouse
provides:
  - Adversarial integration proof (SC-3, PERM-03) that editMember/addChild/addSpouse reject a non-admin actor outside their editable scope, from the specific surface Phase 28's /detail admin actions will call
affects: [28-02, 28-03, 28-04, 28-05]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: [backend/src/resolvers/familyMember.detailAdminActions.test.js]
  modified: []

key-decisions:
  - "No new guard code written -- this plan proves existing requireFamilyAccess + computeEditableScope enforcement holds from the /detail admin-action angle, per D-09"

patterns-established: []

requirements-completed: [PERM-03]

# Metrics
duration: 8min
completed: 2026-08-04
---

# Phase 28 Plan 01: SC-3 Adversarial Rejection Proof Summary

**New adversarial integration test proving editMember/addChild/addSpouse are rejected server-side for a non-admin acting outside their editable scope, independent of /detail's client-side canEdit hiding.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-04T13:20:02Z
- **Completed:** 2026-08-04T13:27:38Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `backend/src/resolvers/familyMember.detailAdminActions.test.js` with 3 adversarial `it` blocks (editMember, addChild, addSpouse), each proving a non-admin actor targeting an unrelated, out-of-scope person is rejected with `'This member is outside your editable scope.'`, `data === null`, and no side-effect row creation/mutation.
- Confirms the existing Phase 14 `requireFamilyAccess` + `computeEditableScope` guards (unchanged, no new code) cover the exact three mutations Phase 28's `/detail` admin actions will wire up.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write and verify the SC-3 adversarial rejection test** - `00a12f2` (test)

## Files Created/Modified
- `backend/src/resolvers/familyMember.detailAdminActions.test.js` - 3 adversarial integration tests proving editMember/addChild/addSpouse reject a non-admin actor outside their editable scope

## Decisions Made
None - plan executed exactly as written. No production code changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All 3 new tests pass. Full backend suite run (394/396 passing) shows only the two pre-existing, documented failures (`verifyEmail.test.js` VERIFY-04 admin-verify race, `familyMember.dedup.test.js` REL-06 dedup TOCTOU) per PROJECT.md's D-08 — both flagged, untouched by this plan, no regressions introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
SC-3/PERM-03 proof is in place before `/detail`'s admin-action UI (editMember/addChild/addSpouse wiring, remaining Phase 28 plans) is built, confirming the backend enforcement these UI actions will rely on already rejects out-of-scope non-admin calls. No blockers for subsequent Phase 28 plans.

---
*Phase: 28-admin-actions-on-detail*
*Completed: 2026-08-04*
