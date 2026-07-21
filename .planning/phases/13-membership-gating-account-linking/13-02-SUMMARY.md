---
phase: 13-membership-gating-account-linking
plan: 02
subsystem: auth
tags: [graphql, apollo, sequelize, guard-function, tdd]

# Dependency graph
requires:
  - phase: 13-01
    provides: "requireFamilyAccess(user) guard, requireAdmin(user) guard, users.familyMemberId link column + User<->FamilyMember association"
provides:
  - "First real family-domain GraphQL surface: familyMember(id)/familyMembers guarded queries proving requireFamilyAccess/requireAdmin against a live resolver (SC5 locked adversarial test)"
  - "linkUserToMember admin mutation: pick-existing OR create-and-link a bare FamilyMember (D-04/D-05), admin self-link (ACC-03), friendly duplicate-link error (D-07)"
  - "unlinkedUsers admin query returning all familyMemberId: null accounts"
affects: [13-03, 13-04, 14-permission-scoping-relationship-resolvers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireFamilyAccess/requireAdmin called synchronously at the top of a resolver body, matching the existing thrown-guard convention"
    - "UniqueConstraintError translation: catch the Sequelize DB-level UNIQUE violation and re-throw a plain, friendly Error, mirroring the codebase's plain-Error convention"
    - "Exactly-one-of-N-inputs validation via `(a == null) === (b == null)` boolean XNOR check"

key-files:
  created:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/familyMember.resolver.js
    - backend/src/resolvers/familyMember.resolver.test.js
    - backend/src/resolvers/linkUserToMember.test.js
  modified:
    - backend/src/schemas/index.js
    - backend/src/resolvers/index.js
    - backend/src/schemas/user.schema.js
    - backend/src/resolvers/user.resolver.js

key-decisions:
  - "familyMember/familyMembers resolvers return raw Sequelize instances (not .get({ plain: true })) so GraphQL's default field resolution can read the fullname VIRTUAL getter via property access."
  - "linkUserToMember validates memberId/newMember mutual exclusivity via `(memberId == null) === (newMember == null)` — covers both-missing and both-provided in one check."
  - "Create-and-link path calls models.FamilyMember.create(newMember) directly — no linkParent/addChild/setSpouse from familyMember.service.js — keeping the bare-member scope boundary (D-05) enforced by a zero-match grep."
  - "Duplicate-link race is caught at the DB UniqueConstraintError layer (not a pre-emptive findOne check), translated to a friendly Error, matching the codebase's DB-enforced-invariant + translate-on-catch style already used for register's email uniqueness."

patterns-established:
  - "First guarded family-domain GraphQL query pair (familyMember/familyMembers) establishing the template for all Phase 14 relationship resolvers to follow (requireFamilyAccess at top of body, raw model instance return)."

requirements-completed: [ACC-02, ACC-03, ACC-04]

# Metrics
duration: ~10min
completed: 2026-07-21
---

# Phase 13 Plan 02: familyMember Query Guard + linkUserToMember Mutation Summary

**First guarded family-domain GraphQL surface (`familyMember`/`familyMembers`) proving the SC5 locked adversarial rejection test against a real resolver, plus the `linkUserToMember` admin mutation that links existing-or-newly-created bare members to any user account, including admin self-link.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-21T21:27:13Z
- **Tasks:** 2 completed
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- `familyMember(id)`/`familyMembers` guarded queries shipped as the first real family-domain GraphQL operations, TDD'd red-green (5 tests), proving `requireFamilyAccess`/`requireAdmin` against a live resolver — including the LOCKED adversarial test (SC5): a verified-but-unlinked USER calling `familyMember` directly is rejected with the exact guard message
- `linkUserToMember(userId, memberId, newMember)` admin mutation shipped, TDD'd red-green (9 tests): links an existing member, creates-and-links a bare member in one step (D-04/D-05, no relationship wiring), validates exactly-one-of `memberId`/`newMember`, rejects missing user/member with friendly 404-style errors, translates the DB `UniqueConstraintError` into a friendly duplicate-link message (D-07), and supports admin self-link (ACC-03)
- `unlinkedUsers` admin query added, returning all `familyMemberId: null` accounts
- Full backend suite green: 192/192 (183 prior + 9 new), including the D-10 first-user-ADMIN regression

## Task Commits

Each task was committed atomically (TDD tasks split into test/feat commits):

1. **Task 1: Guarded familyMember query + LOCKED adversarial test (SC5)** - `1a2b9ab` (test: RED — 5 failing cases), `1b1e4a7` (feat: GREEN — familyMember/familyMembers resolvers + schema + barrel registration, all 5 pass)
2. **Task 2: linkUserToMember mutation + unlinkedUsers query** - `2728704` (test: RED — 9 failing cases), `7b79991` (feat: GREEN — linkUserToMember + unlinkedUsers implemented, all 9 pass, full suite 192/192)

## Files Created/Modified
- `backend/src/schemas/familyMember.schema.js` - `FamilyMember` type, `Gender` enum, `NewFamilyMemberInput`, `familyMembers`/`familyMember(id)` Query extensions
- `backend/src/resolvers/familyMember.resolver.js` - `familyMembers` (requireAdmin-guarded list, ordered lastname/firstname) + `familyMember` (requireFamilyAccess-guarded lookup)
- `backend/src/resolvers/familyMember.resolver.test.js` - 5 tests: SC5 adversarial rejection, linked-user success, ADMIN carve-out, list non-admin rejection, list success+ordering
- `backend/src/resolvers/linkUserToMember.test.js` - 9 tests: admin guard, existing-member link, create-and-link, exactly-one-of validation (both-missing/both-provided), not-found errors, duplicate-link rejection, admin self-link
- `backend/src/schemas/index.js` - registered `familyMemberTypeDefs` in the `typeDefs` barrel
- `backend/src/resolvers/index.js` - registered `familyMemberResolvers` in the `resolvers` barrel
- `backend/src/schemas/user.schema.js` - added `familyMemberId: ID` to `User`, `unlinkedUsers` Query, `linkUserToMember` Mutation
- `backend/src/resolvers/user.resolver.js` - added `unlinkedUsers` resolver + `linkUserToMember` resolver (imports `UniqueConstraintError` from `sequelize`)

## Decisions Made
- `familyMember`/`familyMembers` return raw Sequelize model instances (not serialized plain objects) so the `fullname` VIRTUAL getter resolves correctly via GraphQL's default property-access field resolution.
- `linkUserToMember`'s mutual-exclusivity check `(memberId == null) === (newMember == null)` covers both invalid states (neither supplied, both supplied) with a single boolean expression, avoiding duplicated `if` branches.
- Duplicate-link protection relies on the DB's `UniqueConstraintError` (from Plan 13-01's `users_familyMemberId_unique` constraint) rather than a pre-emptive `findOne` check — closes the race condition at the DB layer (T-13-06) and matches the codebase's established DB-enforced-invariant pattern.
- The GraphQL `familyMember(id: ID!): FamilyMember` field is nullable (per plan spec), so a thrown guard error nulls only that field (`data.familyMember === null`), not the whole `data` object — the adversarial test asserts on `data.familyMember`, not `data` itself, correctly reflecting GraphQL null-propagation semantics for a nullable field.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

One test-authoring correction caught before commit (not a deviation, no committed code was fixed): the initial adversarial test asserted `expect(data).toBeNull()`, but since `familyMember` is a nullable field, GraphQL only nulls that specific field on error, not the whole `data` object (unlike `dashboard: Dashboard!`, a non-null field, where an error nulls the whole response). Corrected to `expect(data.familyMember).toBeNull()` before the RED commit was made — the committed test file is the correct, final version and still validly failed pre-implementation (unknown-field validation error) and passed post-implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `familyMember`/`familyMembers` and `linkUserToMember`/`unlinkedUsers` are the concrete backend surfaces Plan 13-03 (frontend `/pending` gate + admin linking UI) will call.
- The `me` query already returns `familyMemberId` via the `User` type extension, ready for `AuthContext` to derive `hasMember`/pending state.
- No blockers for the next plan in this phase.

---
*Phase: 13-membership-gating-account-linking*
*Completed: 2026-07-21*
