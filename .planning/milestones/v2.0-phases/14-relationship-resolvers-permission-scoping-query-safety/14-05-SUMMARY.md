---
phase: 14-relationship-resolvers-permission-scoping-query-safety
plan: 05
subsystem: api
tags: [graphql, sequelize, permissions, mutations, backend, security]

# Dependency graph
requires:
  - phase: 14-02
    provides: computeEditableScope(memberId, { transaction }) — single source of truth for editable scope
  - phase: 14-04
    provides: addParent/addSpouse guard-then-scope-check-then-transactional-write template to mirror
affects: [14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "addChild's otherParentId SC-4 boundary: checked against the SAME scope.ids object already computed for the primary memberId target (never recomputed a second time), and the check runs textually before the transaction opens"
    - "addSibling reuses the addChild service helper directly (a sibling IS structurally a child of the shared parent(s)) rather than introducing a separate service function"

key-files:
  created:
    - backend/src/resolvers/familyMember.addChild.test.js
    - backend/src/resolvers/familyMember.addSibling.test.js
  modified:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js
    - backend/src/services/familyMember.service.js

key-decisions:
  - "addChild's otherParentId scope check reuses the single computeEditableScope() call already made for the primary memberId target — no second scope computation, per PERM-05's single-source-of-truth requirement"
  - "addSibling's D-04 no-parent-recorded rejection applies unconditionally, even to ADMIN callers, since it is a data-integrity rule (never fabricate a placeholder parent) rather than a permission boundary"
  - "addSibling calls the same addChild(attrs, { transaction }) service helper addChild's own resolver uses, rather than a dedicated addSibling service function — a sibling is structurally just a new child of the shared parent(s)"

requirements-completed: [PERM-01, PERM-02, REL-04]

# Metrics
duration: 14min
completed: 2026-07-22
---

# Phase 14 Plan 05: addChild/addSibling Relationship Mutations Summary

**`addChild` and `addSibling` mutations — `addChild`'s optional `otherParentId` carries the phase's primary SC-4 adversarial security-boundary test (an existing-node reference checked against the actor's own `computeEditableScope`), and `addSibling` mirrors REL-04's read-side derivation on the write side, including the mandatory D-04 no-fabricated-parent rejection.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-22T21:49:00+02:00 (first RED test run)
- **Completed:** 2026-07-22T22:03:00+02:00 (full suite green)
- **Tasks:** 2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `addChild(memberId, role, newMember, otherParentId?)` mutation: always creates a new `FamilyMember` row for the child, never accepting an existing-node id for the child itself (D-01, structurally enforced — confirmed via an SDL-signature assertion, not just behavior)
- `otherParentId` — the ONE argument in this entire phase where a member-user references an EXISTING node id — is checked against the same `scope.ids` computed for the primary `memberId` target, BEFORE the transaction opens (SC-4). Proven against both adversarial cases: a stranger's linked member and the actor's own grandparent (in the tree but outside `scope.ids`), both rejected with `'You may only reference relatives already within your editable scope.'`
- Non-admin callers are rejected with `'This member is outside your editable scope.'` when the primary `memberId` target falls outside scope; admins bypass both scope checks entirely, able to reference any existing member as `otherParentId`
- `addSibling(memberId, newMember)` mutation: creates a new sibling row inheriting exactly the target's recorded parent FK(s) (both for a full sibling, only the recorded one for a half-sibling) — never fabricating the other slot (D-03)
- D-04 enforced: `addSibling` rejects with `'Add a parent first — siblings are derived from a shared parent.'` when the target has neither `motherId` nor `fatherId` recorded, no row created, no placeholder parent fabricated — and this rejection applies even to ADMIN callers, since it is a data-integrity rule, not a permission boundary
- `addChild`'s service helper extended to accept an optional `{ transaction }` parameter, backward-compatible with any existing 1-arg callers (none existed prior to this plan)

## Task Commits

Both tasks followed TDD red-green (no refactor step needed):

1. **Task 1: addChild mutation (D-01/D-02, PERM-01/PERM-02) — primary SC-4 adversarial target**
   - `a9aa81c` (test) — add failing test for addChild mutation, confirmed RED (7/7 failing: schema had no `addChild` field yet, `"Cannot query field \"addChild\" on type \"Mutation\""`)
   - `24ecec0` (feat) — implement addChild mutation, confirmed GREEN (7/7 passing)
2. **Task 2: addSibling mutation (D-03/D-04, REL-04, PERM-01/PERM-02)**
   - `85075b1` (test) — add failing test for addSibling mutation, confirmed RED (5/5 failing: `"Cannot query field \"addSibling\" on type \"Mutation\""`)
   - `9751940` (feat) — implement addSibling mutation, confirmed GREEN (5/5 passing)

_TDD: both tasks followed test -> feat, no refactor step needed._

## Files Created/Modified

- `backend/src/schemas/familyMember.schema.js` — added `addChild(memberId: ID!, role: ParentRole!, newMember: NewFamilyMemberInput!, otherParentId: ID): FamilyMember!` and `addSibling(memberId: ID!, newMember: NewFamilyMemberInput!): FamilyMember!` to the existing `extend type Mutation` block; `ParentRole` enum reused, not redeclared (confirmed `enum ParentRole` appears exactly once)
- `backend/src/resolvers/familyMember.resolver.js` — added `Mutation.addChild`/`Mutation.addSibling`, importing `addChild` from `familyMember.service.js` alongside the already-imported `computeEditableScope`/`linkParent`/`setSpouse`
- `backend/src/services/familyMember.service.js` — `addChild(attrs)` extended to `addChild(attrs, { transaction } = {})`, mirroring the `{ transaction }` extension pattern already established for `linkParent`/`setSpouse` in 14-04
- `backend/src/resolvers/familyMember.addChild.test.js` — 7 tests: self-add (no otherParentId), self-add with in-scope-spouse otherParentId, SC-4 stranger rejection, SC-4 grandparent rejection, primary-target scope rejection, admin bypass (any otherParentId), D-01 SDL-signature assertion
- `backend/src/resolvers/familyMember.addSibling.test.js` — 5 tests: full-sibling FK inheritance, half-sibling FK inheritance (never fabricating the missing slot), D-04 no-parent rejection, scope rejection, D-04 rejection applies to admins too

## Decisions Made

- `addChild`'s `otherId` scope check is performed using the exact same `scope` object already computed for the primary `targetId` check (no second `computeEditableScope` call) — both satisfies PERM-05's single-source-of-truth requirement and keeps the SC-4 boundary a single, auditable code path.
- `addSibling` calls `addChild(attrs, { transaction: t })` — the identical service helper `addChild`'s own resolver uses — rather than introducing a dedicated sibling-creation service function, since a sibling is structurally just a new child of the shared parent(s) (D-03's framing).
- The D-01 SDL guarantee for `addChild` is asserted via a direct regex match against the raw `familyMemberTypeDefs` SDL string (not just runtime behavior), confirming no `childId`-style argument exists in the generated mutation signature — a schema-level guarantee per the plan's explicit instruction.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>`/`<behavior>` specifications were followed directly; no Rule 1-4 auto-fixes were needed.

## Verification

- `npm test --workspace backend -- src/resolvers/familyMember.addChild.test.js` — 7/7 passing, including both SC-4 adversarial cases (stranger's linked member, grandparent) and the admin-bypass case
- `npm test --workspace backend -- src/resolvers/familyMember.addSibling.test.js` — 5/5 passing, including the half-sibling-inheritance case, the D-04 rejection case, and the admin-still-rejected-when-no-parent case
- `npm test --workspace backend -- src/resolvers/familyMember.addParent.test.js src/resolvers/familyMember.addSpouse.test.js` — 11/11 passing (unmodified regression from 14-04)
- `npm test --workspace backend` (full suite) — 246/246 passing (234 baseline + 7 addChild + 5 addSibling), single-executor run, no cross-worktree contention observed
- Grep gates (all confirmed):
  - `grep -n "export async function addChild" backend/src/services/familyMember.service.js` — shows the 2-arg signature
  - `grep -c "enum ParentRole" backend/src/schemas/familyMember.schema.js` — equals `1`
  - `grep -n "addChild(memberId" backend/src/schemas/familyMember.schema.js` — matches
  - `grep -n "addSibling(memberId" backend/src/schemas/familyMember.schema.js` — matches
  - `grep -n "scope.ids.has(otherId)"` appears textually before `models.User.sequelize.transaction(` in the `addChild` resolver body (confirmed by line number: check at line 101, transaction opens at line 109)
  - `grep -n "Add a parent first" backend/src/resolvers/familyMember.resolver.js` — matches

## TDD Gate Compliance

Both tasks followed RED -> GREEN as separate commits:
- Task 1: `a9aa81c` (test, RED: 7/7 failing on missing schema field) -> `24ecec0` (feat, GREEN: 7/7 passing)
- Task 2: `85075b1` (test, RED: 5/5 failing on missing schema field) -> `9751940` (feat, GREEN: 5/5 passing)

## Known Stubs

None.

## Threat Flags

None — both new mutations are fully covered by the plan's own `<threat_model>` (T-14-01, T-14-02, T-14-09); no additional network surface, auth path, or trust boundary was introduced beyond what the plan already modeled.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

`addChild`/`addSibling` are live, scope-checked, and transactionally atomic, following the exact `requireFamilyAccess` -> non-admin `computeEditableScope` scope check -> `models.User.sequelize.transaction(...)` template established in 14-04. The SC-4 adversarial-test pattern (existing-node reference checked against the actor's own `scope.ids`, before any transaction opens) is now proven end-to-end for the phase's one true existing-node-reference surface. No blockers for 14-06.

---
*Phase: 14-relationship-resolvers-permission-scoping-query-safety*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: backend/src/resolvers/familyMember.addChild.test.js
- FOUND: backend/src/resolvers/familyMember.addSibling.test.js
- FOUND: .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-05-SUMMARY.md
- FOUND commit: a9aa81c (test: addChild failing test, RED)
- FOUND commit: 24ecec0 (feat: addChild implementation, GREEN)
- FOUND commit: 85075b1 (test: addSibling failing test, RED)
- FOUND commit: 9751940 (feat: addSibling implementation, GREEN)
