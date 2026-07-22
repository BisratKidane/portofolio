---
phase: 14-relationship-resolvers-permission-scoping-query-safety
plan: 06
subsystem: api
tags: [graphql, sequelize, permissions, mutations, backend, security, phase-closing]

# Dependency graph
requires:
  - phase: 14-02
    provides: computeEditableScope(memberId, { transaction }) — single source of truth for editable scope
  - phase: 14-04
    provides: guard-then-scope-check-then-write mutation template
  - phase: 14-05
    provides: addChild/addSibling template continuity, sanitizeNewMember reuse
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "editMember's D-06 field-lock: target.linkedUser.id compared against the ACTING user's user.id (never user.familyMemberId) — this is the exact identity match that keeps self-edit allowed while blocking edits to a relative who manages their own linked profile"
    - "deleteMember's admin-only-by-construction pattern: requireAdmin(user) is the resolver's ONLY guard, with zero computeEditableScope calls anywhere in the function body — proving members have no delete capability structurally, not via a scope check that happens to always fail"
    - "myEditableMembers as a zero-argument, fully server-derived convenience query — flattens computeEditableScope's five categories (self/parents/spouses/children/siblings) into one de-duplicated Map-keyed-by-id list"

key-files:
  created:
    - backend/src/resolvers/familyMember.editMember.test.js
    - backend/src/resolvers/familyMember.deleteMember.test.js
    - backend/src/resolvers/familyMember.myEditableMembers.test.js
  modified:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js

key-decisions:
  - "EditFamilyMemberInput deliberately excludes every id/edge field (no motherId, fatherId, or spouse reference) — D-05 is a schema-level structural guarantee, confirmed by a regex assertion against the raw SDL, not merely a behavioral one"
  - "deleteMember imports the Phase 12 service function under a deleteFamilyMember alias to avoid the resolver-map/import name collision, per the plan's explicit instruction"
  - "myEditableMembers returns [] (not an error) for an ADMIN with familyMemberId: null — there is no self-scope to compute for an unlinked admin, and requireFamilyAccess already permits ADMIN through regardless of linkage"

requirements-completed: [MEM-04, PERM-02, PERM-03, PERM-04]

# Metrics
duration: 20min
completed: 2026-07-22
---

# Phase 14 Plan 06: editMember/deleteMember/myEditableMembers Summary

**Phase-closing plan: `editMember` (plain-field edits gated by scope + the D-06 field-lock identity check), `deleteMember` (admin-only by construction — zero `computeEditableScope` calls anywhere in the resolver, proving members have no delete capability structurally), and `myEditableMembers` (a zero-argument, fully server-derived read-only convenience query de-risking the Phase 15 `/manage` UI).**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-22T22:15:35+02:00 (baseline suite run)
- **Completed:** 2026-07-22T22:34:48+02:00 (full suite green)
- **Tasks:** 3 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `editMember(id, fields)` mutation: non-admin scope check via `computeEditableScope`, then the D-06 field-lock check — rejects an edit to an in-scope relative who has their own linked user account (`target.linkedUser.id !== user.id`), while explicitly allowing that relative to edit their own record (the self-edit exception, proven by a dedicated test where the actor IS the linked user). Admins bypass both checks.
- `EditFamilyMemberInput` structurally excludes any edge-mutating field — no `motherId`, `fatherId`, or spouse reference exists in the schema at all (D-05), confirmed via a direct regex match against the raw SDL string, not just behavioral testing.
- `deleteMember(id)` mutation: `requireAdmin(user)` is the resolver's first and only guard, with a confirmed zero-count grep for `computeEditableScope` anywhere in the function body — members have zero delete capability by construction (PERM-03), while admins can delete anywhere in the tree (PERM-04). Reuses the Phase 12 `deleteMember` service function verbatim (D-10), imported under the `deleteFamilyMember` alias to avoid shadowing the resolver map's own key.
- `myEditableMembers` query: zero-argument, entirely server-derived from `user.familyMemberId` — flattens `computeEditableScope`'s five categories into one de-duplicated list. Returns `[]` (not an error) for an ADMIN with `familyMemberId: null` (the Phase 13 carve-out case).
- Full backend suite: 260/260 passing (246 baseline + 7 editMember + 4 deleteMember + 3 myEditableMembers) — Phase 14's entire mutation/query surface is now complete and green.

## Task Commits

All three tasks followed TDD red-green (no refactor step needed):

1. **Task 1: editMember mutation (MEM-04, PERM-02, D-05/D-06)**
   - `930fa86` (test) — add failing test for editMember mutation, confirmed RED (7/7 failing: schema had no `EditFamilyMemberInput`/`editMember` yet)
   - `f0a2865` (feat) — implement editMember mutation, confirmed GREEN (7/7 passing); addParent/addSpouse/addChild/addSibling regression 28/28 passing
2. **Task 2: deleteMember mutation (PERM-03/PERM-04)**
   - `5fcb154` (test) — add failing test for deleteMember mutation, confirmed RED (4/4 failing: `"Cannot query field \"deleteMember\" on type \"Mutation\""`)
   - `dc2eb32` (feat) — implement deleteMember mutation, confirmed GREEN (4/4 passing); `FamilyMember.delete.test.js` regression 3/3 passing (Phase 12 married-in semantics unaffected)
3. **Task 3: myEditableMembers query (PERM-05 convenience)**
   - `a6a8e68` (test) — add failing test for myEditableMembers query, confirmed RED (3/3 failing: `"Cannot query field \"myEditableMembers\" on type \"Query\""`)
   - `f00e1cf` (feat) — implement myEditableMembers query, confirmed GREEN (3/3 passing); full backend suite 260/260 passing

_TDD: all three tasks followed test → feat, no refactor step needed._

## Files Created/Modified

- `backend/src/schemas/familyMember.schema.js` — added `input EditFamilyMemberInput` (no id/edge fields), `editMember(id: ID!, fields: EditFamilyMemberInput!): FamilyMember!`, `deleteMember(id: ID!): Boolean!` to `extend type Mutation`, and `myEditableMembers: [FamilyMember!]!` to the existing `extend type Query` block
- `backend/src/resolvers/familyMember.resolver.js` — added `Mutation.editMember`, `Mutation.deleteMember`, `Query.myEditableMembers`; imports the Phase 12 `deleteMember` service function under the `deleteFamilyMember` alias alongside the already-imported `computeEditableScope`/`linkParent`/`setSpouse`/`addChild`
- `backend/src/resolvers/familyMember.editMember.test.js` — 7 tests: self-edit, in-scope-relative edit, D-06 field-lock rejection, D-06 self-exception, out-of-scope rejection, D-05 SDL-structural assertion, admin bypass
- `backend/src/resolvers/familyMember.deleteMember.test.js` — 4 tests: non-admin rejection (including self-delete), admin success on a leaf member, admin success on a mid-tree member preserving Phase 12 married-in semantics, not-found rejection
- `backend/src/resolvers/familyMember.myEditableMembers.test.js` — 3 tests: full-scope-match de-duplicated return set (all five categories, excluding an out-of-scope grandparent), empty-list-for-unlinked-admin carve-out, unlinked-USER rejection

## Decisions Made

- The D-06 field-lock check compares `target.linkedUser.id` against the acting `user.id`, never `user.familyMemberId` — this is the precise identity match that keeps self-edit allowed (the relative editing their own record) while blocking edits from anyone else, including other in-scope relatives.
- `EditFamilyMemberInput`'s exclusion of edge-mutating fields is a schema-level (not just resolver-level) guarantee, asserted via a regex match against the raw `familyMemberTypeDefs` SDL string in the D-05 test — matching the same assertion style already established for `addChild`'s D-01 guarantee in 14-05.
- `deleteMember`'s zero-`computeEditableScope`-calls property was verified via the exact grep gate specified in the plan (`grep -A8 "deleteMember: async" ... | grep -c "computeEditableScope"` → `0`), confirming the admin-only-by-construction design intent rather than relying on behavioral testing alone.
- `myEditableMembers` reuses `computeEditableScope`'s already-computed `self`/`parents`/`spouses`/`children`/`siblings` arrays directly rather than re-deriving anything — a `Map` keyed by `id` handles de-duplication (a member could theoretically appear in more than one category in edge cases, though the one-hop scope model makes this rare in practice).

## Deviations from Plan

None - plan executed exactly as written. All three tasks' `<action>`/`<behavior>` specifications were followed directly; no Rule 1-4 auto-fixes were needed.

## Verification

- `npm test --workspace backend -- src/resolvers/familyMember.editMember.test.js` — 7/7 passing, including the D-06 field-lock rejection AND the D-06 self-edit-allowed case
- `npm test --workspace backend -- src/resolvers/familyMember.deleteMember.test.js` — 4/4 passing, including the non-admin-rejection case
- `npm test --workspace backend -- src/models/FamilyMember.delete.test.js` — 3/3 passing, unmodified regression (Phase 12 married-in deletion semantics untouched)
- `npm test --workspace backend -- src/resolvers/familyMember.myEditableMembers.test.js` — 3/3 passing, including the empty-list-for-unlinked-admin case and the unlinked-USER-rejection case
- `npm test --workspace backend` (full suite) — 260/260 passing (246 baseline + 7 editMember + 4 deleteMember + 3 myEditableMembers), single-executor run, no cross-worktree contention observed
- Grep gates (all confirmed):
  - `grep -A12 "input EditFamilyMemberInput" backend/src/schemas/familyMember.schema.js | grep -iE "motherId|fatherId|spouse"` — zero matches
  - `grep -A8 "deleteMember: async" backend/src/resolvers/familyMember.resolver.js | grep -c "computeEditableScope"` — equals `0`
  - `grep -n "deleteMember as deleteFamilyMember" backend/src/resolvers/familyMember.resolver.js` — matches

## TDD Gate Compliance

All three tasks followed RED → GREEN as separate commits:
- Task 1: `930fa86` (test, RED: 7/7 failing on missing schema field) → `f0a2865` (feat, GREEN: 7/7 passing)
- Task 2: `5fcb154` (test, RED: 4/4 failing on missing schema field) → `dc2eb32` (feat, GREEN: 4/4 passing)
- Task 3: `a6a8e68` (test, RED: 3/3 failing on missing schema field) → `f00e1cf` (feat, GREEN: 3/3 passing)

## Known Stubs

None.

## Threat Flags

None — all three new resolvers are fully covered by the plan's own `<threat_model>` (T-14-01, T-14-03, T-14-04, T-14-10); no additional network surface, auth path, or trust boundary was introduced beyond what the plan already modeled.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

Phase 14's entire relationship-resolver, permission-scoping, and query-safety mutation surface is complete: `addParent`/`addSpouse`/`addChild`/`addSibling` (14-04/14-05) create relationships, `editMember` allows scoped plain-field edits with the D-06 field-lock, `deleteMember` is admin-only by construction, and `myEditableMembers` gives Phase 15's `/manage` UI a ready-made, fully server-derived scope query. Full backend suite green at 260/260. No blockers for Phase 15 (dedup + `/manage` UI).

---
*Phase: 14-relationship-resolvers-permission-scoping-query-safety*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: backend/src/resolvers/familyMember.editMember.test.js
- FOUND: backend/src/resolvers/familyMember.deleteMember.test.js
- FOUND: backend/src/resolvers/familyMember.myEditableMembers.test.js
- FOUND: .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-06-SUMMARY.md
- FOUND commit: 930fa86 (test: editMember failing test, RED)
- FOUND commit: f0a2865 (feat: editMember implementation, GREEN)
- FOUND commit: 5fcb154 (test: deleteMember failing test, RED)
- FOUND commit: dc2eb32 (feat: deleteMember implementation, GREEN)
- FOUND commit: a6a8e68 (test: myEditableMembers failing test, RED)
- FOUND commit: f00e1cf (feat: myEditableMembers implementation, GREEN)
