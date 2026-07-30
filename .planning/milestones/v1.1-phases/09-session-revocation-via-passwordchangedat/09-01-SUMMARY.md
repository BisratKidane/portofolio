---
phase: 09-session-revocation-via-passwordchangedat
plan: 01
subsystem: auth
tags: [sequelize, mysql, jwt-session-revocation, tdd, migration]

# Dependency graph
requires:
  - phase: 08-reset-token-remediation
    provides: "resetPassword resolver's existing user.save() call, which this plan's beforeUpdate hook now piggybacks on to stamp passwordChangedAt with zero resolver-level changes"
provides:
  - "User model passwordChangedAt column (DATE(3), nullable, no default, no backfill)"
  - "beforeUpdate hook stamp scoped strictly inside the changed('passwordHash') guard"
  - "Checked-in manual migration SQL (backend/migrations/manual/009-add-password-changed-at.sql)"
  - "README Manual Database Migrations section + boot-and-verify procedure"
  - "Human-confirmed proof the migration and column are safe against a real pre-existing dev database (SC-4)"
affects: [09-03-getUserFromRequest-revocation-check, 11-email-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual, hand-written SQL migration files under backend/migrations/manual/ for schema changes to already-provisioned databases, since sequelize.sync() never alters existing tables"
    - "Model-hook-guarded timestamp stamping (passwordChangedAt stamped only inside the existing changed('passwordHash') beforeUpdate branch) so no resolver-level code path can accidentally skip or duplicate the stamp"

key-files:
  created:
    - backend/migrations/manual/009-add-password-changed-at.sql
  modified:
    - backend/src/models/User.js
    - backend/src/models/User.test.js
    - README.md

key-decisions:
  - "passwordChangedAt uses DATE(3)/DATETIME(3) millisecond precision, not plain DATETIME, to avoid MySQL rounding a fractional-second write up into the next whole second"
  - "Column is nullable with no default and no backfill — pre-existing users keep NULL until their first password change, so no session is force-evicted at deploy time"
  - "Test 2's setup required an explicit user.changed('passwordHash', false) reset after build() to correctly simulate an already-persisted record — Sequelize marks every attribute passed to build() as dirty for a brand-new instance, so the plan's literal build()-then-set(name) sequence could never produce changed('passwordHash') === false"

patterns-established:
  - "Hand-written SQL migration + README boot-and-verify procedure + blocking human-action checkpoint is the repo's standard pattern for any schema change touching an already-provisioned database (mirrors decision already logged in STATE.md for Phase 9/11)"

requirements-completed: [SESS-01, SESS-02]

# Metrics
duration: 3min active (plus a human-verification pause for Task 3)
completed: 2026-07-20
---

# Phase 9 Plan 1: passwordChangedAt Column + Manual Migration Summary

**User model gains a DATE(3) `passwordChangedAt` column stamped only inside the existing password-hash-guarded hook, backed by a checked-in manual `ALTER TABLE` migration that a human confirmed against a real pre-existing dev database.**

## Performance

- **Duration:** ~3 min active execution (Tasks 1-2) + a human-verification pause for the Task 3 checkpoint
- **Started:** 2026-07-20T10:20:00Z (approx.)
- **Completed:** 2026-07-20T11:57:00Z (approx., after human confirmation)
- **Tasks:** 3 (2 automated + 1 blocking human-action checkpoint)
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- `User` model has a nullable `DATE(3)` `passwordChangedAt` column, stamped only inside the pre-existing `changed('passwordHash')`-guarded `beforeUpdate` branch — proven by two regression tests (stamps on real password change, stays untouched on unrelated field updates)
- `resetPassword`'s existing `user.save()` call now automatically stamps `passwordChangedAt` via the model hook, with zero resolver-level changes required (SESS-02)
- A documented, checked-in manual migration (`backend/migrations/manual/009-add-password-changed-at.sql`) plus a matching README "Manual Database Migrations" section give any developer an exact, repeatable apply-and-verify procedure
- A human ran all 6 verification steps against their own real, pre-existing, non-force-synced local dev database: migration applied cleanly, backend booted with zero `Unknown column` errors, `/health` returned OK, a pre-migration user's existing token still authenticated, and a reset + immediate relogin succeeded (SC-4, ROADMAP Phase 9 Success Criterion #4)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing test for passwordChangedAt stamping hook** - `c7b6b40` (test)
2. **Task 1 (GREEN): passwordChangedAt column + hook stamp** - `ea9172a` (feat)
3. **Task 2: manual migration SQL + README boot-and-verify docs** - `b5351c0` (docs)
4. **Task 3: human-confirmed boot-and-verify against a real pre-existing dev database** - no code commit (manual verification only); reported "confirmed" with all 6 steps passing

**Plan metadata:** (this commit, see below)

_Note: Task 1 followed the plan's mandatory RED→GREEN TDD sequence — the RED commit precedes the GREEN commit in git log, and Test 1 (`stamps passwordChangedAt with the current time when passwordHash changes`) was confirmed FAILING against the unmodified model (`AssertionError: expected undefined to be an instance of Date`) before any implementation edit was made._

## Files Created/Modified
- `backend/src/models/User.js` - Added nullable `passwordChangedAt: { type: DataTypes.DATE(3), allowNull: true, defaultValue: null }` column; extended the `beforeUpdate` hook's `changed('passwordHash')` branch to also set `user.passwordChangedAt = new Date()`
- `backend/src/models/User.test.js` - Added `describe('beforeUpdate passwordChangedAt stamping hook (SESS-01)', ...)` with two regression tests (stamps on real password change; does not stamp on unrelated field change)
- `backend/migrations/manual/009-add-password-changed-at.sql` - New checked-in manual migration: `ALTER TABLE users ADD COLUMN passwordChangedAt DATETIME(3) NULL DEFAULT NULL;` with rationale comments (D-03/D-04/D-05, Pitfall 1)
- `README.md` - New `## Manual Database Migrations` section (after `## Continuous Integration`, before `## Project structure`) documenting why this project has no migration framework and the exact apply/boot/verify procedure for this migration

## Decisions Made
- `DATE(3)`/`DATETIME(3)` millisecond precision chosen over plain `DATETIME` to avoid MySQL rounding fractional-second writes up into the next whole second at write time (RESEARCH Pitfall 1) — this matters for the same-second reset-then-relogin boundary case that Phase 9 Plan 3's revocation check will need to get right.
- Column is nullable with no default and no backfill (D-05) — an explicit, locked scope boundary: no existing session is evicted at deploy time; a user's `passwordChangedAt` is only ever set by their own next real password change.
- `passwordChangedAt` is stamped exclusively inside the existing `changed('passwordHash')`-guarded `beforeUpdate` hook branch, not a new hook and not a resolver-level assignment, so no future password-changing code path can silently skip it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Test 2's setup to correctly simulate an already-persisted record**
- **Found during:** Task 1, RED gate
- **Issue:** The plan's `<behavior>` spec for Test 2 called for `User.build({...})` followed by `user.set('name', 'Updated Name')`, then asserting `user.changed('passwordHash')` is `false`. Sequelize marks every attribute passed to `build()` as dirty for a brand-new instance (verified directly: `user.changed('passwordHash')` returns `true` immediately after `build()`, with no `.set()` call at all). As literally written, this assertion could never pass, before or after the GREEN implementation — it wasn't testing the intended "unrelated field update on an already-saved record" scenario.
- **Fix:** Added `user.changed('passwordHash', false)` immediately after `build()` (Sequelize's supported dirty-flag reset API) to simulate an already-persisted, clean record before setting `name`, so the test actually exercises the intended scenario: an unrelated field update on a record whose password hash isn't dirty.
- **Files modified:** `backend/src/models/User.test.js`
- **Verification:** Confirmed via a standalone node probe that `user.changed('passwordHash', false)` correctly clears the dirty flag and that subsequent `user.set('name', ...)` does not re-mark `passwordHash` as changed; both new tests pass post-implementation, and the full backend suite (69 tests) stays green.
- **Committed in:** `c7b6b40` (Task 1 RED commit, since the fix was made before the RED gate was confirmed)

---

**Total deviations:** 1 auto-fixed (1 bug fix in test setup)
**Impact on plan:** Necessary correction to make Test 2 actually test the behavior it was meant to test (SESS-01 SC-1: unrelated field updates never stamp a revocation point). No scope creep — the assertions and intent are unchanged, only the setup mechanics were corrected.

## Issues Encountered
None beyond the Test 2 setup deviation documented above.

## User Setup Required

None - the manual migration and its boot-and-verify procedure were completed and confirmed live during this plan's execution (Task 3), not deferred to a separate setup step.

## Next Phase Readiness
- `passwordChangedAt` column exists, is stamped correctly, and is confirmed safe against a real pre-existing database — Phase 9 Plan 3 (`getUserFromRequest` revocation check + mandatory same-second boundary test, SESS-03) can now read this column with confidence.
- No blockers identified.

---
*Phase: 09-session-revocation-via-passwordchangedat*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three task commit hashes (`c7b6b40`, `ea9172a`, `b5351c0`) confirmed present in `git log`.
