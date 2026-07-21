---
phase: 12-family-data-model-foundation
plan: 02
subsystem: database
tags: [sequelize, mysql, associations, foreign-keys, tdd, family-tree]

# Dependency graph
requires:
  - phase: 12-01
    provides: FamilyMember Sequelize model (required identity fields, optional fields, fullname VIRTUAL, cross-field date validation) registered in the models barrel
provides:
  - "Self-referencing motherId/fatherId belongsTo/hasMany association pairs on FamilyMember, with ON DELETE SET NULL cascade-safety"
  - "Spouse join model (memberAId/memberBId) with a canonical ordered-pair beforeValidate hook, a DB-level unique(memberAId, memberBId) index, and a notSelfMarriage validator"
  - "Spouse registered in the models barrel alongside User/FamilyMember"
  - "resetTables() test helper extended to safely truncate FK-constrained tables (Spouse, FamilyMember, User) via FOREIGN_KEY_CHECKS toggling"
affects: [12-03, 12-04, 13, 14, 15, 16, 17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-referencing Sequelize association pair: belongsTo (declares onDelete/onUpdate) + inverse hasMany (never declares onDelete/onUpdate) to avoid Sequelize's conflicting-option resolution bug (sequelize/sequelize#16526)"
    - "Canonical ordered-pair join table: beforeValidate hook normalizes (memberAId, memberBId) into ascending order, paired with a DB-level composite unique index, eliminating swapped-order duplicate inserts"
    - "FOREIGN_KEY_CHECKS = 0/1 toggling around a truncate sequence in test resets — required whenever any FK-constrained table (self-referencing or cross-referencing) needs TRUNCATE in MySQL, since TRUNCATE is rejected if any FK still references the table regardless of row emptiness"

key-files:
  created: [backend/src/models/Spouse.js, backend/src/models/Spouse.test.js, backend/src/models/FamilyMember.associations.test.js]
  modified: [backend/src/models/index.js, backend/src/models/database.test.js, backend/test/helpers.js]

key-decisions:
  - "Wrapped resetTables()'s truncate sequence in SET FOREIGN_KEY_CHECKS = 0/1 — MySQL rejects TRUNCATE on a table still referenced by any FK constraint (family_members references itself via motherId/fatherId; spouses references family_members), even after the referencing table is empty. This is a real MySQL DDL restriction, not addressable by truncation ordering alone."

patterns-established:
  - "onDelete/onUpdate declared exactly once, on the belongsTo side of a self-referencing association pair, never duplicated on the paired hasMany"
  - "Canonical-pair join tables normalize ordering in beforeValidate and rely on a DB-level unique index (not an application-level existence check) as the actual source of uniqueness truth"

requirements-completed: [REL-01, REL-02, REL-03]

# Metrics
duration: 7min
completed: 2026-07-21
---

# Phase 12 Plan 02: Family Data Model Foundation — Associations Summary

**Self-referencing motherId/fatherId associations with ON DELETE SET NULL cascade-safety, plus a canonical-pair Spouse join model enforcing one row per couple and symmetric reads — built test-first, full backend suite 157/157 green.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-21T20:37:00+02:00
- **Completed:** 2026-07-21T20:44:00+02:00
- **Tasks:** 3 (RED, RED, GREEN)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `FamilyMember.associations.test.js` written first against not-yet-existing associations, confirmed RED (8/8 failing because `models.Spouse` was `undefined`, a prerequisite of the extended `resetTables()`)
- `Spouse.test.js` written first against the not-yet-existing `Spouse` model, confirmed RED (6/6 failing)
- `Spouse.js` implemented: canonical ordered-pair `beforeValidate` hook, `notSelfMarriage` model-level validator, DB-level `unique(memberAId, memberBId)` index
- `models/index.js` wired: `mother`/`father` self-referencing `belongsTo`/`hasMany` pairs (onDelete: SET NULL declared only on the `belongsTo` side, per Sequelize issue #16526) plus `Spouse.memberA`/`memberB` associations; `Spouse` added to the models barrel
- `database.test.js` extended with FamilyMember/Spouse registration smoke checks
- All three target test files green (18/18); full backend suite green: 157/157 (16 new + 141 pre-existing, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write FamilyMember.associations.test.js and extend resetTables()** - `0cfecb8` (test)
2. **Task 2 (RED): Write Spouse.test.js against the not-yet-existing Spouse model** - `98b55ad` (test)
3. **Task 3 (GREEN): Implement Spouse.js, wire all associations in models/index.js, extend database.test.js** - `b947034` (feat)

_Note: this is a `type: tdd` plan; RED and GREEN gate commits both present, no REFACTOR commit needed (implementation matched RESEARCH.md's cited patterns exactly, no cleanup required)._

## Files Created/Modified
- `backend/src/models/Spouse.js` - Spouse join model: `beforeValidate` canonical-ordering hook, `notSelfMarriage` validator, unique composite index
- `backend/src/models/Spouse.test.js` - REL-02/D-01/D-02 unit + integration test coverage (6 cases)
- `backend/src/models/FamilyMember.associations.test.js` - REL-01/REL-03/D-05/D-06 integration test coverage (8 cases)
- `backend/src/models/index.js` - `mother`/`father`/`childrenAsMother`/`childrenAsFather` self-referencing associations + `Spouse.memberA`/`memberB` associations wired; `Spouse` registered in the `models` barrel
- `backend/src/models/database.test.js` - registration smoke checks for `models.FamilyMember` and `models.Spouse`
- `backend/test/helpers.js` - `resetTables()` extended to truncate `Spouse` → `FamilyMember` → `User` in FK-safe order, wrapped in `FOREIGN_KEY_CHECKS` toggling

## Decisions Made
- Wrapped the truncate sequence in `SET FOREIGN_KEY_CHECKS = 0/1` (see Deviations below) — this is now the standing pattern for any future test-table addition with FK constraints.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] resetTables() truncation order alone insufficient under MySQL FK constraints**
- **Found during:** Task 3 (GREEN, first full run of the three target test files together)
- **Issue:** The plan's Task 1 action specified `resetTables()` as a plain ordered sequence of `destroy({ where: {}, truncate: true })` calls (Spouse → FamilyMember → User). Once Task 3 wired real FK constraints (`family_members` self-referencing itself via `motherId`/`fatherId`, and `spouses` referencing `family_members`), running the truncate sequence failed with `SequelizeDatabaseError: Cannot truncate a table referenced in a foreign key constraint` on the `FamilyMember.destroy` truncate call — MySQL rejects `TRUNCATE` on any table still referenced by an FK, even after the referencing table has been truncated to empty, because the constraint metadata itself blocks the DDL-level `TRUNCATE` statement.
- **Fix:** Wrapped the three truncate calls in `SET FOREIGN_KEY_CHECKS = 0` / `SET FOREIGN_KEY_CHECKS = 1`, importing `sequelize` alongside `models` in `backend/test/helpers.js`. This is the standard, documented pattern for resetting FK-constrained tables via TRUNCATE in MySQL test harnesses.
- **Files modified:** `backend/test/helpers.js`
- **Verification:** Re-ran the three target test files (`FamilyMember.associations.test.js`, `Spouse.test.js`, `database.test.js`) — all 18 pass; then ran the full backend suite (`npm test`) — 157/157 green.
- **Committed in:** `b947034` (Task 3 commit)

**2. [Rule 1 - Bug] mothersname/motherId assertion against create() return value returned undefined instead of null**
- **Found during:** Task 3 (GREEN, first run of `FamilyMember.associations.test.js` after Task 1's blocking fix was applied)
- **Issue:** The "leaves both mothersname and motherId null when neither is set" test case (written in Task 1) asserted `member.mothersname` / `member.motherId` directly against the object returned by `models.FamilyMember.create(...)`. Sequelize returns `undefined` (not `null`) for attributes that were not included in the `create()` call and have no `defaultValue` — the in-memory instance only reflects what was explicitly passed plus any default values, not a round-trip read of the persisted row.
- **Fix:** Added `await member.reload()` before the assertions, matching the pattern already used elsewhere in the same test file (e.g. the parent-linking test's `child.reload()`).
- **Files modified:** `backend/src/models/FamilyMember.associations.test.js`
- **Verification:** Re-ran `FamilyMember.associations.test.js` — all 8 cases pass.
- **Committed in:** `b947034` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 test bug)
**Impact on plan:** Both fixes were necessary for correctness — without the FK-checks toggle, `resetTables()` (a shared test-suite prerequisite, not just this plan's own tests) would throw on every subsequent test run across the whole backend suite; without the `reload()` fix, one of this plan's own `must_haves` truths (mothersname independence, D-06) would not actually be verified. No scope creep — both fixes are scoped to files already in this plan's `files_modified` list.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `motherId`/`fatherId`/`memberAId`/`memberBId` columns now exist and are association-backed, ready for Plan 12-03 (cycle-prevention ancestor-chain walk) and Plan 12-04 (married-in-delete / `linkParent`/`setSpouse`/`deleteMember` helpers).
- `resetTables()`'s `FOREIGN_KEY_CHECKS` toggle pattern is now the standing convention for any future FK-constrained table added to the test harness — future plans adding new models with FKs referencing existing tables should extend this same pattern rather than re-deriving it.
- Full backend suite (157/157) stays green; no regressions against `User`/`FamilyMember` models or existing resolver/util tests.
- No blockers for downstream plans in this phase.

---
*Phase: 12-family-data-model-foundation*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: backend/src/models/Spouse.js
- FOUND: backend/src/models/Spouse.test.js
- FOUND: backend/src/models/FamilyMember.associations.test.js
- FOUND: backend/src/models/index.js
- FOUND: backend/src/models/database.test.js
- FOUND: backend/test/helpers.js
- FOUND: commit 0cfecb8 (test)
- FOUND: commit 98b55ad (test)
- FOUND: commit b947034 (feat)
