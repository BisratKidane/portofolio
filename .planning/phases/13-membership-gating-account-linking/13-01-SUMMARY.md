---
phase: 13-membership-gating-account-linking
plan: 01
subsystem: auth
tags: [sequelize, mysql, jwt, guard-function, manual-migration]

# Dependency graph
requires:
  - phase: 12-family-data-model-foundation
    provides: FamilyMember model, Spouse join model, self-referencing motherId/fatherId associations
provides:
  - "requireFamilyAccess(user) guard in backend/src/utils/auth.js — linked-member OR ADMIN (D-06)"
  - "users.familyMemberId nullable/UNIQUE/ON DELETE SET NULL FK column via manual migration 012 + User<->FamilyMember association"
affects: [13-02, 13-03, 13-04, 14-permission-scoping-relationship-resolvers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thrown-error auth guard (requireFamilyAccess) extending requireAuth/requireAdmin convention"
    - "Manual numbered ALTER migration (backend/migrations/manual/012-*.sql) for existing-table schema changes, mirroring v1.1 Phase 9/11 pattern"
    - "Association-owns-the-column: cross-table FK fields declared only via belongsTo foreignKey option, never redeclared on the model (User.js comment mirrors Spouse.js)"

key-files:
  created:
    - backend/migrations/manual/012-add-users-family-member-id.sql
  modified:
    - backend/src/utils/auth.js
    - backend/src/utils/auth.test.js
    - backend/src/models/User.js
    - backend/src/models/index.js
    - backend/src/models/database.test.js

key-decisions:
  - "requireFamilyAccess delegates to requireAuth first (no duplicated null-check logic), then returns immediately for ADMIN, otherwise throws when familyMemberId is falsy — exactly D-06's linked-OR-ADMIN rule."
  - "familyMemberId is declared solely via the User.belongsTo(FamilyMember) association in models/index.js, not as a field in User.init() — avoids double-declaring the column against the association's own foreignKey definition."
  - "FamilyMember.hasOne(User) (not hasMany) — the UNIQUE constraint on familyMemberId makes this a true one-to-one, unlike the one-to-many mother/childrenAsMother pair."

patterns-established:
  - "requireFamilyAccess: thrown-guard pattern, called synchronously at the top of resolver bodies, not middleware"

requirements-completed: [ACC-04, ACC-05]

# Metrics
duration: ~15min
completed: 2026-07-21
---

# Phase 13 Plan 01: Backend Foundation (requireFamilyAccess guard + familyMemberId link column) Summary

**`requireFamilyAccess` guard (linked-member OR ADMIN) and `users.familyMemberId` link column (nullable, UNIQUE, `ON DELETE SET NULL`) added via a tracked manual migration + `User<->FamilyMember` association, both TDD'd and proven against the sync'd test schema.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-21T23:19:45+02:00
- **Tasks:** 2 completed
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `requireFamilyAccess(user)` exported from `backend/src/utils/auth.js`, TDD'd red-green, covering linked-user, ADMIN carve-out (D-06), unlinked-user, and null cases (4 passing tests)
- `backend/migrations/manual/012-add-users-family-member-id.sql` created — nullable `familyMemberId` column, UNIQUE constraint, and FK with `ON DELETE SET NULL ON UPDATE CASCADE`, documented for manual application against pre-existing databases
- `User.belongsTo(FamilyMember, { unique: true, onDelete: 'SET NULL' })` / `FamilyMember.hasOne(User)` wired in `backend/src/models/index.js` — the first association touching the pre-existing `users` table
- 3 new `database.test.js` assertions prove the link persists, the UNIQUE constraint rejects a duplicate link, and `ON DELETE SET NULL` re-pends a user when their linked member is destroyed
- Full backend suite green: 178/178 (171 prior + 7 new)

## Task Commits

Each task was committed atomically (TDD tasks split into test/feat commits):

1. **Task 1: TDD requireFamilyAccess guard** - `5376bf3` (test: RED — 4 failing cases), `4690336` (feat: GREEN — guard implemented, all 29 auth.test.js tests pass)
2. **Task 2: users.familyMemberId migration + association + boot-verify** - `67cd1a4` (feat: migration file, User.js comment, models/index.js association, 3 new database.test.js assertions)

## Files Created/Modified
- `backend/migrations/manual/012-add-users-family-member-id.sql` - Manual ALTER migration: nullable `familyMemberId` column + UNIQUE constraint + FK with `ON DELETE SET NULL`
- `backend/src/utils/auth.js` - Added `requireFamilyAccess(user)` guard
- `backend/src/utils/auth.test.js` - Added `describe('requireFamilyAccess', ...)` block (4 tests)
- `backend/src/models/User.js` - Added explanatory comment (no field redeclaration) for `familyMemberId`
- `backend/src/models/index.js` - Added `User.belongsTo(FamilyMember)` / `FamilyMember.hasOne(User)` association
- `backend/src/models/database.test.js` - Added `describe('familyMemberId link column (ACC-05)', ...)` block (3 tests: persist/reload, UNIQUE rejection, ON DELETE SET NULL)

## Decisions Made
- `requireFamilyAccess`'s first statement is `requireAuth(user)` — no duplicated null-check logic, matching the `requireAdmin` template exactly.
- `familyMemberId` is declared only via the association's `foreignKey` option (not in `User.init()`), following the existing `Spouse.js` "association owns the column" convention rather than the `passwordChangedAt`-style explicit-field convention — avoids a double-declaration conflict.
- `FamilyMember.hasOne(User)` used instead of `hasMany`, reflecting the UNIQUE-constrained one-to-one relationship.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. One incidental fix while writing new `database.test.js` fixtures: the `FamilyMember.gender` enum accepts `'Male'`/`'Female'`/`'Other'` (not `'MALE'`/`'FEMALE'` as initially drafted) — corrected before running tests, no behavior or scope change, not logged as a deviation since it was caught before any test run (not a fix to already-committed code).

## User Setup Required

None - no external service configuration required. Note: `backend/migrations/manual/012-add-users-family-member-id.sql` must be run by hand against any already-provisioned database (local dev/staging/prod) before deploying Phase 13 code — this is a deployment step, not a dev-environment setup step, and is documented in the migration file's header comment.

## Next Phase Readiness

- `requireFamilyAccess` is ready for Plan 13-02+ to wire into the first guarded family query/mutation.
- `user.familyMemberId` is queryable on any `User` model instance (via the association) for Plan 13-02's `linkUserToMember` mutation and the frontend `/pending` gate's `me` query extension.
- No blockers for the next plan in this phase.

---
*Phase: 13-membership-gating-account-linking*
*Completed: 2026-07-21*

## Self-Check: PASSED

All created files and commit hashes verified present (migration file, SUMMARY.md, and commits 5376bf3, 4690336, 67cd1a4, c0febda).
