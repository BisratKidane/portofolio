---
phase: 12-family-data-model-foundation
plan: 01
subsystem: database
tags: [sequelize, mysql, tdd, family-tree]

# Dependency graph
requires:
  - phase: 07-11 (v1.1)
    provides: Existing User.js/index.js barrel conventions this plan mirrors
provides:
  - "FamilyMember Sequelize model with required identity fields, optional fields, derived fullname VIRTUAL, and cross-field date validation"
  - "FamilyMember registered in the models barrel (backend/src/models/index.js) alongside User"
affects: [12-02, 12-03, 12-04, 13, 14, 15, 16, 17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model-level `validate` block for cross-field rules (deathAfterBirth, noFutureDates), mirroring Sequelize's per-attribute validate but scoped to the whole instance"
    - "Explicit `isIn` validator alongside DataTypes.ENUM so invalid enum values reject on `.validate()` without a DB round trip (ENUM type alone only enforces at DB insert time)"

key-files:
  created: [backend/src/models/FamilyMember.js, backend/src/models/FamilyMember.test.js]
  modified: [backend/src/models/index.js]

key-decisions:
  - "Added an explicit `validate: { isIn: [...] }` on the gender field in addition to DataTypes.ENUM — Sequelize does not auto-validate ENUM membership at the JS validate() layer (only at DB insert), and the plan's test spec required build()+validate() (no DB round trip) to reject invalid gender values"

patterns-established:
  - "Cross-field date validation (deathdate >= birthdate, no future dates) implemented as named model-level validate functions, throwing plain Error with a message describing the specific violation"

requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-05]

# Metrics
duration: 5min
completed: 2026-07-21
---

# Phase 12 Plan 01: Family Data Model Foundation Summary

**FamilyMember Sequelize model — required identity fields, gender ENUM, derived fullname VIRTUAL, and full cross-field date validation — built test-first and registered in the models barrel.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-21T20:30:00+02:00
- **Completed:** 2026-07-21T20:32:00+02:00
- **Tasks:** 2 (RED, GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `FamilyMember.test.js` written first against the not-yet-existing model, confirmed RED (20/20 failing because `models.FamilyMember` was `undefined`)
- `FamilyMember.js` implemented mirroring `User.js`'s exact init-function shape: required `firstname`/`lastname`/`gender` (MEM-01), optional `mothersname`/`email`/`birthdate`/`deathdate`/`phone`/`address` (MEM-02), derived `fullname` VIRTUAL getter (MEM-03), and full date cross-validation (deathdate >= birthdate, no future dates, no artificial lower bound)
- Registered in `backend/src/models/index.js` alongside `User`, `initializeDatabase()` left untouched (plain `sequelize.sync()`, no args)
- Full backend suite green: 141/141 (20 new + 121 pre-existing, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write FamilyMember.test.js against the not-yet-existing model** - `55e3cd7` (test)
2. **Task 2 (GREEN): Implement FamilyMember.js and register it in the models barrel** - `219b29d` (feat)

_Note: this is a `type: tdd` plan; RED and GREEN gate commits both present, no REFACTOR commit needed (implementation was already minimal and clean)._

## Files Created/Modified
- `backend/src/models/FamilyMember.js` - FamilyMember Sequelize model: fields, ENUM gender, VIRTUAL fullname, model-level date-validation
- `backend/src/models/FamilyMember.test.js` - MEM-01/MEM-02/MEM-03/D-07/D-08/D-09/D-10 unit test coverage (20 cases)
- `backend/src/models/index.js` - `initFamilyMember(sequelize)` wired into the `models` barrel alongside `User`

## Decisions Made
- Added an explicit `isIn` validator on `gender` in addition to the `DataTypes.ENUM` type declaration. Verified via a standalone Sequelize instance (mysql dialect, no live connection) that `DataTypes.ENUM` alone does NOT reject an out-of-range value at `instance.validate()` — it is only enforced by MySQL's native ENUM type at insert time. Since Task 1's behavior spec required `build({gender: 'Alien'}); validate()` to reject without any DB round trip, the ENUM type alone was insufficient to satisfy MEM-01/D-07 as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] gender ENUM did not reject invalid values at `.validate()`**
- **Found during:** Task 2 (GREEN implementation, first test run)
- **Issue:** The plan's field spec used only `DataTypes.ENUM('Male', 'Female', 'Other')` for `gender`. Sequelize's ENUM data type only constrains values at the database layer (via MySQL's native ENUM column type on INSERT/UPDATE) — it does NOT add an automatic validator that runs during `instance.validate()` on a built-but-unsaved instance. Task 1's own test (`build({ gender: 'Alien' }); validate()` must reject) failed with the value passing through unvalidated.
- **Fix:** Added `validate: { isIn: [['Male', 'Female', 'Other']] }` to the `gender` field definition alongside the existing `DataTypes.ENUM(...)` type, so an explicit JS-layer validator runs on `.validate()`/`.save()` regardless of DB round trip.
- **Files modified:** `backend/src/models/FamilyMember.js`
- **Verification:** Confirmed the failure with a standalone Sequelize (mysql dialect, no live connection) reproduction before fixing; re-ran `npx vitest run src/models/FamilyMember.test.js` after the fix — all 20 tests pass.
- **Committed in:** `219b29d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for correctness — without this fix, the plan's own MEM-01/D-07 gender-ENUM requirement (a documented `must_haves` truth) would not actually be enforced pre-save. No scope creep; no other fields or files touched.

## Issues Encountered
None beyond the gender-ENUM deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `FamilyMember` model is ready for Plan 12-02 (parent/spouse association wiring: `motherId`/`fatherId`/spouse join table) — this plan deliberately did not touch associations per the plan's stated boundary.
- Full backend suite (141/141) stays green; no regressions against `User` model or existing resolver/util tests.
- No blockers for downstream plans in this phase.

---
*Phase: 12-family-data-model-foundation*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: backend/src/models/FamilyMember.js
- FOUND: backend/src/models/FamilyMember.test.js
- FOUND: .planning/phases/12-family-data-model-foundation/12-01-SUMMARY.md
- FOUND: commit 55e3cd7 (test)
- FOUND: commit 219b29d (feat)
