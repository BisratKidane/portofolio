---
phase: 17-family-deep-tree-visualization
plan: 01
subsystem: api
tags: [graphql, authorization, apollo, sequelize, vitest, tdd]

# Dependency graph
requires:
  - phase: 14-permission-scoping-relationship-resolvers
    provides: "requireFamilyAccess guard (linked-member-or-admin) and the FamilyMember.linkedUser field-level gate"
provides:
  - "familyMembers GraphQL query callable by any linked member or admin (D-13), not admin-only"
  - "Adversarial test coverage proving unlinked-non-admin is still rejected, linked-non-admin succeeds, and the linkedUser field-level gate (Phase 14 CR-01) is unaffected"
affects: [17-02, 17-03, 17-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard relaxation via existing requireFamilyAccess helper (no new auth primitive), TDD red-green proven with an adversarial test suite update rather than a silent patch"

key-files:
  created: []
  modified:
    - backend/src/resolvers/familyMember.resolver.js
    - backend/src/resolvers/familyMember.resolver.test.js

key-decisions:
  - "D-13 implemented as a one-line guard swap (requireAdmin -> requireFamilyAccess) on familyMembers; no schema, loader, or field-resolver changes needed"
  - "Kept the FamilyMember.linkedUser field resolver untouched and added a dedicated D-14 regression test (two independently-linked users, cross-view assertion) rather than relying on implicit coverage from other tests"

patterns-established: []

requirements-completed: [TREE-03]

# Metrics
duration: 5min
completed: 2026-07-25
---

# Phase 17 Plan 01: Relax familyMembers Guard to requireFamilyAccess Summary

**The `familyMembers` GraphQL query moved from admin-only to linked-member-or-admin (D-13) via a one-line guard swap, proven safe by a TDD red-green cycle and a new regression test showing the per-field `linkedUser` gate (Phase 14 CR-01) is untouched.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-25T13:56:00+02:00 (approx, first test run)
- **Completed:** 2026-07-25T13:58:50+02:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `familyMembers` query guard relaxed from `requireAdmin` to `requireFamilyAccess`, unblocking the `/family` deep-tree page (later plans) to reuse the same query `ManagePage.jsx`'s admin branch already uses
- Adversarial test suite updated test-first (RED before the guard changed, GREEN after): unlinked-non-admin still rejected (new message), linked-non-admin now succeeds, admin behavior unchanged
- New D-14 regression test proves the `FamilyMember.linkedUser` field resolver still gates a linked non-admin from seeing another member's `linkedUser.email` — the guard relaxation did not create a new information-disclosure path
- Full backend suite green: 321/321 (baseline 319 + 2 net-new tests)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Update familyMembers adversarial test suite** - `f0743ab` (test)
2. **Task 2 (GREEN): Flip guard to requireFamilyAccess** - `cbc74ea` (feat)

**Plan metadata:** pending (docs: complete plan)

_Note: TDD task 1/2 pair is the standard red/green cycle; no refactor step was needed (one-line change)._

## Files Created/Modified
- `backend/src/resolvers/familyMember.resolver.js` - `familyMembers` query guard changed from `requireAdmin(user)` to `requireFamilyAccess(user)` (1-line diff, no import change)
- `backend/src/resolvers/familyMember.resolver.test.js` - Renamed/updated the rejects-non-admin test to assert the "not yet linked" message; added a linked-USER success test; added a D-14 linkedUser field-gate regression test; added a `FAMILY_MEMBERS_WITH_LINKED_USER_QUERY` constant

## Decisions Made
- Followed the plan exactly: single guard swap, no schema/loader/field-resolver edits. The `linkedUser`, `photoUrl`, and other field resolvers were verified untouched via the D-14 regression test rather than by inspection alone.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: backend/src/resolvers/familyMember.resolver.js (requireFamilyAccess guard present)
- FOUND: backend/src/resolvers/familyMember.resolver.test.js (7 tests, all passing)
- FOUND commit f0743ab (test: update familyMembers adversarial suite)
- FOUND commit cbc74ea (feat: relax familyMembers guard)
- Full backend suite: 321/321 passing, confirmed via `npm test --workspace backend`

## TDD Gate Compliance

- RED gate: `f0743ab` (`test(17-01): ...`) — 3 tests failing against the old `requireAdmin` guard, confirmed by reading failure output (message mismatch + "Admin access is required." errors).
- GREEN gate: `cbc74ea` (`feat(17-01): ...`) — all 7 tests passing, full backend suite 321/321.
- No REFACTOR commit needed (one-line guard change, nothing to clean up).
