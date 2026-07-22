---
phase: 14-relationship-resolvers-permission-scoping-query-safety
plan: 04
subsystem: api
tags: [graphql, sequelize, permissions, mutations, backend]

# Dependency graph
requires:
  - phase: 14-02
    provides: computeEditableScope(memberId, { transaction }) — single source of truth for editable scope
  - phase: 14-03
    provides: FamilyMember relationship field resolvers (mother/father/spouses/children/siblings), used to assert post-mutation state
provides:
  - "addParent(memberId, role, newMember) — always creates a NEW parent node and links it via the extended linkParent, scope-checked (PERM-01/PERM-02), D-05 add-only enforced for non-admins"
  - "addSpouse(memberId, newMember) — always creates a NEW spouse node and links it via the extended setSpouse, scope-checked (PERM-01/PERM-02)"
  - "linkParent/wouldCreateCycle/setSpouse extended with an optional { transaction } parameter, backward-compatible with all existing 2-arg callers"
  - "sanitizeNewMember/OPTIONAL_FAMILY_MEMBER_FIELDS exported from user.resolver.js for reuse by every Phase 14 mutation accepting NewFamilyMemberInput"
affects: [14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "addParent/addSpouse guard-then-scope-check-then-transactional-write template: requireFamilyAccess -> (non-admin) computeEditableScope scope check -> models.User.sequelize.transaction(create new node + link via service helper)"
    - "setSpouse's transaction-conditional branch: run directly against a caller-supplied transaction (no nested sequelize.transaction), fall back to its own wrap only when no transaction is supplied — preserves the 3 existing 2-arg callers unchanged"

key-files:
  created:
    - backend/src/resolvers/familyMember.addParent.test.js
    - backend/src/resolvers/familyMember.addSpouse.test.js
  modified:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js
    - backend/src/services/familyMember.service.js
    - backend/src/resolvers/user.resolver.js

key-decisions:
  - "sanitizeNewMember/OPTIONAL_FAMILY_MEMBER_FIELDS exported (not duplicated) from user.resolver.js and imported into familyMember.resolver.js, per the plan's explicit reuse directive"
  - "wouldCreateCycle/linkParent/setSpouse transaction extension uses a default-undefined optional third parameter, so all existing 2-arg test callers (FamilyMember.cycle.test.js, Spouse.test.js, FamilyMember.delete.test.js) are unaffected"
  - "setSpouse's internal create-or-find logic factored into a private createOrFindSpouseRow(memberAId, memberBId, transaction) helper, called either directly (caller-supplied transaction) or wrapped in a fresh sequelize.transaction(...) (no transaction supplied) — avoids ever nesting a transaction inside a transaction"

requirements-completed: [PERM-01, PERM-02]

# Metrics
duration: 18min
completed: 2026-07-22
---

# Phase 14 Plan 04: addParent/addSpouse Relationship Mutations Summary

**First two member-facing relationship mutations — `addParent` and `addSpouse` — each always creating a brand-new `FamilyMember` node and linking it via the extended, reused Phase 12 service helpers (`linkParent`, `setSpouse`), gated by `requireFamilyAccess` and the `computeEditableScope` scope check from 14-02.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-22T21:36:00+02:00 (approx, first test run)
- **Completed:** 2026-07-22T21:54:00+02:00 (full suite green)
- **Tasks:** 2 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `addParent(memberId, role, newMember)` mutation: always creates a new `FamilyMember` row for the parent and links it via the transaction-extended `linkParent`, never accepting an existing-node id for the parent being added (D-01, structurally enforced)
- Non-admin callers are rejected with `'This member is outside your editable scope.'` when `memberId` falls outside `computeEditableScope(user.familyMemberId).ids`; admins bypass this check entirely
- D-05 add-only enforced for non-admins: a member-user cannot overwrite an already-filled `motherId`/`fatherId` slot (`'This member already has a {role} on record.'`); an admin can
- `addSpouse(memberId, newMember)` mutation: always creates a new `FamilyMember` row for the spouse and links it via the transaction-extended `setSpouse`, same scope-check/admin-bypass shape as `addParent`
- `linkParent`/`wouldCreateCycle`/`setSpouse` extended with an optional trailing `{ transaction }` parameter — the create-new-node-then-link sequence in both mutations runs inside a single `models.User.sequelize.transaction(...)`, mirroring the WR-01-fixed `linkUserToMember` precedent; a rollback test proves no orphaned `FamilyMember` row survives a mid-transaction failure
- `sanitizeNewMember`/`OPTIONAL_FAMILY_MEMBER_FIELDS` exported from `user.resolver.js` and reused (not duplicated) in `familyMember.resolver.js`

## Task Commits

Both tasks followed TDD red-green (no refactor step needed):

1. **Task 1: addParent mutation (D-01/D-02/D-05, PERM-01/PERM-02)**
   - `99a5b67` (test) — add failing test for addParent mutation, confirmed RED (6/6 failing: `"Cannot return null for non-nullable field Mutation.addParent."`)
   - `da787bc` (feat) — implement addParent mutation, confirmed GREEN (6/6 passing); `FamilyMember.cycle.test.js` regression 9/9 passing
2. **Task 2: addSpouse mutation (D-01/D-02, PERM-01/PERM-02)**
   - `ad34c58` (test) — add failing test for addSpouse mutation, confirmed RED (5/5 failing: `"Cannot return null for non-nullable field Mutation.addSpouse."`)
   - `d13d773` (feat) — implement addSpouse mutation, confirmed GREEN (5/5 passing); `Spouse.test.js` + `FamilyMember.delete.test.js` regression 11/11 passing

_TDD: both tasks followed test -> feat, no refactor step needed._

## Files Created/Modified

- `backend/src/schemas/familyMember.schema.js` — added `enum ParentRole { MOTHER FATHER }` and a new `extend type Mutation` block with `addParent`/`addSpouse`
- `backend/src/resolvers/familyMember.resolver.js` — added `Mutation.addParent`/`Mutation.addSpouse`, importing `sanitizeNewMember` from `user.resolver.js` and `computeEditableScope`/`linkParent`/`setSpouse` from `familyMember.service.js`
- `backend/src/services/familyMember.service.js` — `wouldCreateCycle`/`linkParent` extended with an optional `{ transaction }` parameter; `setSpouse` extended with an optional `{ transaction }` parameter via a private `createOrFindSpouseRow` helper (conditional branch, no nested transaction)
- `backend/src/resolvers/user.resolver.js` — `sanitizeNewMember`/`OPTIONAL_FAMILY_MEMBER_FIELDS` given `export`
- `backend/src/resolvers/familyMember.addParent.test.js` — 6 tests: MOTHER/FATHER self-add, in-scope-relative add, out-of-scope rejection, D-05 add-only rejection, admin bypass/overwrite
- `backend/src/resolvers/familyMember.addSpouse.test.js` — 5 tests: self-add, in-scope-relative add, out-of-scope rejection, admin bypass, transaction-rollback on Spouse-join failure

## Decisions Made

- Both mutations share the identical guard-then-scope-check-then-transactional-write template established by `linkUserToMember`: `requireFamilyAccess(user)` first, then (for non-admins only) `computeEditableScope(user.familyMemberId)` and a `scope.ids.has(targetId)` check, then `models.User.sequelize.transaction(async (t) => { ... })` wrapping the create-new-node-then-link sequence.
- `setSpouse`'s transaction extension deliberately avoids ever nesting a `sequelize.transaction(...)` call: when the caller supplies a transaction, the create-or-find logic runs directly against it; only when no transaction is supplied does `setSpouse` wrap itself in a fresh one. This keeps the 3 existing 2-arg test callers (`Spouse.test.js`, `FamilyMember.delete.test.js`) working unmodified.
- The addSpouse transaction-rollback test spies on `models.Spouse.create` (mocked to reject once) rather than a User-model method, since the failure being proven here is specifically "the Spouse join row fails to commit after the new FamilyMember spouse row was created" — the precise scenario named in the plan's behavior spec.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>`/`<behavior>` specifications were followed directly; no Rule 1-4 auto-fixes were needed.

## Verification

- `npm test --workspace backend -- src/resolvers/familyMember.addParent.test.js` — 6/6 passing
- `npm test --workspace backend -- src/resolvers/familyMember.addSpouse.test.js` — 5/5 passing
- `npm test --workspace backend -- src/models/FamilyMember.cycle.test.js` — 9/9 passing (unmodified regression)
- `npm test --workspace backend -- src/models/Spouse.test.js src/models/FamilyMember.delete.test.js` — 11/11 passing (unmodified regression)
- `npm test --workspace backend` (full suite) — 234/234 passing (223 baseline + 6 addParent + 5 addSpouse), single-executor run, no cross-worktree contention observed
- Grep gates (all confirmed):
  - `grep -n "export async function linkParent" backend/src/services/familyMember.service.js` — shows the 3-arg signature
  - `grep -n "enum ParentRole\|addParent(memberId" backend/src/schemas/familyMember.schema.js` — matches
  - `grep -B2 -A10 "addParent:" backend/src/resolvers/familyMember.resolver.js | grep "computeEditableScope"` — matches
  - `grep -A20 "export async function setSpouse" backend/src/services/familyMember.service.js` — shows the conditional branch, not an unconditional wrap
  - `grep -n "addSpouse(memberId" backend/src/schemas/familyMember.schema.js` — matches

## TDD Gate Compliance

Both tasks followed RED -> GREEN as separate commits:
- Task 1: `99a5b67` (test, RED: 6/6 failing on missing resolver, schema field present but resolver undefined) -> `da787bc` (feat, GREEN: 6/6 passing)
- Task 2: `ad34c58` (test, RED: 5/5 failing on missing resolver) -> `d13d773` (feat, GREEN: 5/5 passing)

## Known Stubs

None.

## Threat Flags

None — both new mutations are fully covered by the plan's own `<threat_model>` (T-14-01, T-14-02, T-14-SC); no additional network surface, auth path, or trust boundary was introduced beyond what the plan already modeled.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

`addParent`/`addSpouse` are live, scope-checked, and transactionally atomic — the exact template every remaining Phase 14 mutation (`addChild`/`addSibling` in 14-05, carrying the primary SC-4 adversarial test target `otherParentId`) should reuse: `requireFamilyAccess` -> non-admin `computeEditableScope` scope check -> `models.User.sequelize.transaction(...)` wrapping a create-new-node-then-link sequence via the appropriate extended service helper. No blockers for subsequent plans in this phase.

---
*Phase: 14-relationship-resolvers-permission-scoping-query-safety*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: backend/src/resolvers/familyMember.addParent.test.js
- FOUND: backend/src/resolvers/familyMember.addSpouse.test.js
- FOUND: .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-04-SUMMARY.md
- FOUND commit: 99a5b67 (test: addParent failing test, RED)
- FOUND commit: da787bc (feat: addParent implementation, GREEN)
- FOUND commit: ad34c58 (test: addSpouse failing test, RED)
- FOUND commit: d13d773 (feat: addSpouse implementation, GREEN)
