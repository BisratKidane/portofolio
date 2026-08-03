---
phase: 24-backend-read-layer-for-detail
plan: 03
subsystem: api
tags: [graphql, apollo-server, sequelize, authorization]

requires:
  - phase: 24-backend-read-layer-for-detail (24-01)
    provides: familyHead/searchFamilyMembers queries and the existing familyMember(id) query this plan verifies, not rebuilds
provides:
  - "canEdit: Boolean! field on FamilyMember GraphQL type -- true only for an ADMIN viewer, false for non-admin/anonymous (SC-5, D-07/D-08)"
  - "Confirmed, via a passing integration test, that familyMember(id) already returns every field the /detail person card needs (SC-2, D-09) -- no query rebuilt"
affects: [25-person-card, 26-detail-page, 28-admin-actions]

tech-stack:
  added: []
  patterns:
    - "Per-person Boolean! authorization-signal field resolved as a pure synchronous derivation from context.user.role -- no loader, no I/O, mirrors the createdBy/updatedBy admin-check shape exactly"

key-files:
  created:
    - backend/src/resolvers/familyMember.canEdit.test.js
    - backend/src/resolvers/familyMember.cardFieldCoverage.test.js
  modified:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js

key-decisions:
  - "canEdit reuses the existing admin check verbatim (Boolean(user?.role === 'ADMIN')) -- no new computeEditableScope call, per D-07"
  - "SC-2's person-by-id field coverage was proven with a new additive test file, not a new/rebuilt query -- confirms D-09's no-duplicate-query constraint"

patterns-established:
  - "Per-person authorization-signal fields (canEdit) follow the exact createdBy/updatedBy admin-check shape: pure, synchronous, context.user-derived, zero I/O"

requirements-completed: [API-01]

duration: ~20min
completed: 2026-08-03
---

# Phase 24 Plan 03: canEdit Field + SC-2 Field-Coverage Verification Summary

**Added a one-line `canEdit: Boolean!` GraphQL field mirroring the existing createdBy/updatedBy admin-check shape, and proved (without rebuilding) that `familyMember(id)` already returns every field the `/detail` person card needs.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-03T13:06:00+02:00 (approx, worktree setup + context read)
- **Completed:** 2026-08-03T13:15:00+02:00 (approx, full-suite verification)
- **Tasks:** 2 completed
- **Files modified:** 4 (2 production files, 2 new test files)

## Accomplishments
- `canEdit: Boolean!` added to `type FamilyMember`, resolved as `Boolean(user?.role === 'ADMIN')` -- an exact mirror of the existing `createdBy`/`updatedBy` admin-check shape (D-07: no new `computeEditableScope` call; D-08: per-person Boolean shape)
- SC-2 confirmed by a new, additive `familyMember.cardFieldCoverage.test.js`: a single `familyMember(id)` operation selecting `id, firstname, lastname, fullname, gender, geezFirstname, geezLastname, geezFullname, birthdate, isAlive, photoUrl, canEdit` round-trips every value correctly on the first run -- proving D-09's "no rebuild needed" claim without writing any new production query
- 4 new integration tests across two new test files, all green on first run; full backend suite green except the two named pre-existing, documented, out-of-scope failures (VERIFY-04, REL-06 dedup TOCTOU)

## Task Commits

Each task was committed atomically:

1. **Task 1: canEdit field (SC-5, D-07/D-08)** - `203de26` (feat) -- TDD RED (3 failing assertions against the missing schema field) confirmed before GREEN, folded into a single commit per this phase's established file-per-task granularity
2. **Task 2: SC-2 person-by-id field-coverage verification (D-09 -- no rebuild)** - `337586a` (test) -- verification-only, no production code touched

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `backend/src/schemas/familyMember.schema.js` - added `canEdit: Boolean!` to `type FamilyMember`, placed after the provenance fields with a comment following the same convention as `createdBy`/`updatedBy`
- `backend/src/resolvers/familyMember.resolver.js` - added `FamilyMember.canEdit` field resolver (`Boolean(user?.role === 'ADMIN')`), placed immediately after `updatedBy`
- `backend/src/resolvers/familyMember.canEdit.test.js` (new) - 3 tests: ADMIN true, linked non-admin USER false, anonymous caller rejected upstream by `requireFamilyAccess` (asserted via `data.familyMember === null` + error message, matching `familyMember.head.test.js`'s nullable-field anonymous-rejection assertion shape)
- `backend/src/resolvers/familyMember.cardFieldCoverage.test.js` (new) - 1 test: single `familyMember(id)` query selecting every SC-2 card field against a fully-populated fixture (incl. `profilePicture` so `photoUrl` resolves non-null), asserting each field's exact value

## Decisions Made
- The anonymous-rejection test in Task 1 asserts `data.familyMember` (the nullable field) is `null`, not the whole `data` root -- because `familyMember(id: ID!): FamilyMember` is nullable, a `requireFamilyAccess` throw nulls only that field. This matches the established pattern in `familyMember.head.test.js` (nullable `familyHead` field), distinct from `familyMember.search.test.js`'s whole-root-null pattern (that query's `[FamilyMember!]!` return type is non-null).
- Task 2's coverage test intentionally reuses only fields already present in the schema -- no gap was found, confirming RESEARCH.md's prior finding that no rebuild is needed.

## Deviations from Plan

None -- plan executed exactly as written. Both tasks match the plan's `<action>`/`<acceptance_criteria>` verbatim; `git diff` against the phase base commit confirms `familyMember.schema.js` and `familyMember.resolver.js` changes are purely additive (`canEdit` only -- no existing field, query, or mutation body touched).

## Issues Encountered

None. Both test files passed on the first implementation attempt (Task 1's tests were confirmed RED before the GREEN implementation; Task 2's test passed immediately, as expected for a verification-only task against already-correct existing code).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`canEdit` is live, tested, and gated identically to `createdBy`/`updatedBy`. SC-2 is confirmed closed without any query duplication. Combined with 24-01's `familyHead`/`searchFamilyMembers` and 24-02's bounded children+spouses read shape, Phase 24's full backend read layer for `/detail` is now complete: `familyHead` (open the page), `searchFamilyMembers` (inline search), `familyMember(id)` (person-by-id, every card field, D-09), bounded children/spouses reads (PERF-02), and `canEdit` (edit-permission signal, SC-5). Phase 25 (Reusable PersonCard) can consume all of these. No blockers.

**Full backend suite:** 410/412 passing (2 test files failed: `verifyEmail.test.js` VERIFY-04 and `familyMember.dedup.test.js` REL-06 dedup TOCTOU) -- both are the two documented, pre-existing, out-of-scope failures per D-08, unrelated to this plan's changes (confirmed by `git diff` scoping and by the failures occurring in files this plan never touched).

---
*Phase: 24-backend-read-layer-for-detail*
*Completed: 2026-08-03*

## Self-Check: PASSED

- FOUND: backend/src/resolvers/familyMember.canEdit.test.js
- FOUND: backend/src/resolvers/familyMember.cardFieldCoverage.test.js
- FOUND: commit 203de26
- FOUND: commit 337586a
