---
phase: 32-tokenless-registration
plan: 10
subsystem: auth
tags: [sequelize, mysql, transactions, race-condition, updateUser]

# Dependency graph
requires:
  - phase: 32-09
    provides: "verifyEmail's transaction + SELECT ... FOR UPDATE + module-scope-ready deadlock-retry-once pattern, and the ADMIN_EMAIL bootstrap write shape this plan's guard mirrors"
provides:
  - "updateUser's role-change and email-change last-administrator guards run inside one sequelize.transaction with a locking FOR UPDATE admin count, closing the CR-02 TOCTOU"
  - "Shared module-scope isDeadlock helper reused by both verifyEmail and updateUser"
  - "Two Promise.all concurrency regression tests proving the last-administrator invariant holds under real concurrency"
  - "WR-01's vacuous test repaired to genuinely exercise the target.emailVerified === true guard clause"
affects: [phase-32-verification, phase-32-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-locking transaction guard: findByPk(..., { lock: t.LOCK.UPDATE }) + SELECT ... FOR UPDATE admin count inside one sequelize.transaction, wrapped in a deadlock-detect-and-retry-once wrapper -- now used identically by both verifyEmail and updateUser"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/updateUser.test.js

key-decisions:
  - "Hoisted isDeadlock from a local const inside verifyEmail to module scope so both verifyEmail and updateUser share one implementation, per the phase's reuse-not-reinvent constraint"
  - "isAdmin is computed once from the actor's user object before runUpdate is defined, not recomputed inside the transaction callback on retry, since it depends only on the caller's own role, not on target's row state"
  - "otherVerifiedAdminCount is a single local async helper defined once inside the transaction callback and called at both guard sites (role-change, email-change), replacing the two separate non-transactional models.User.count calls"

requirements-completed: [REG-02]

# Metrics
duration: 18min
completed: 2026-09-01
---

# Phase 32 Plan 10: Transaction-Safe updateUser Last-Administrator Guards Summary

**updateUser's role-change and email-change last-administrator guards now run inside one sequelize.transaction with a locking `SELECT ... FOR UPDATE` admin count and a shared deadlock-retry-once wrapper, closing the CR-02 TOCTOU where two concurrent updateUser calls could each observe the other admin as the survivor and together drive verified admins to zero.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-01T13:47:00Z
- **Completed:** 2026-09-01T14:04:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Closed 32-VERIFICATION.md's Truth 7 blocker: `updateUser`'s role-change guard and email-change guard are now atomic with the row state they depend on, using the exact `sequelize.transaction` + `SELECT ... FOR UPDATE` + deadlock-retry-once pattern `verifyEmail` already uses in this same phase (module-scope `isDeadlock`, shared).
- Two new `Promise.all`-based concurrency regression tests prove the last-administrator invariant (`>= 1` verified admin) holds under real concurrent `updateUser` calls -- both confirmed RED against the unfixed non-transactional code (observed admin count dropped to `0`, reproducing 32-REVIEW.md's CR-02 proof) and GREEN after the fix.
- Repaired the previously vacuous WR-01 test: removed the confounding verified `backupAdmin` so the test now genuinely exercises the `target.emailVerified === true` guard clause on the only (unverified) administrator changing their own email.
- Both the concurrency guard and the WR-01 clause are mutation-tested falsifiable (see Task Commits/evidence below).
- Return shape (`serializeUser(target)`), the `UniqueConstraintError` → `'A user with this email already exists.'` translation, and the fire-and-forget `sendVerificationEmail` call's post-commit timing are all confirmed unaffected by the transaction restructuring.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- concurrent-race regression tests, and repair the vacuous WR-01 test** - `cff4b07` (test)
2. **Task 2: GREEN -- wrap both last-administrator guards in one locking transaction, with deadlock retry** - `b1bd175` (feat)
3. **Task 3: Self-check error semantics/return shape, full regression gate, record deferred items** - no code changes; verification-only, documented in this SUMMARY

**Plan metadata:** (this commit)

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` - Hoisted `isDeadlock` to module scope (shared by `verifyEmail` and `updateUser`); restructured `updateUser` to run both last-administrator guards, the name-set block, and the row write inside one `sequelize.transaction`, with a locking `findByPk(..., { lock: t.LOCK.UPDATE })` read of the target row and a shared `otherVerifiedAdminCount()` helper using `SELECT ... FOR UPDATE`; wrapped the whole transaction in a deadlock-detect-and-retry-once wrapper matching `verifyEmail`'s shape; removed the now-unused `Op` import.
- `backend/src/resolvers/updateUser.test.js` - Added `models` import; repaired the vacuous "does not block an already-unverified administrator..." test (removed the confounding verified `backupAdmin`, renamed to "...(WR-01 fix)"); added a new `describe('updateUser — concurrent last-administrator guard (CR-02, gap-closure)', ...)` block with two `Promise.all` regression tests.

## Decisions Made

- Reused `verifyEmail`'s exact transaction + locking-read + deadlock-retry-once shape rather than inventing a second pattern, per the phase's `<critical_planning_constraints>` #7.
- `isAdmin` stays a single pre-transaction computation (depends only on the caller, not on `target`), so it is not recomputed on a deadlock retry.
- The two admin-count call sites (role-change guard, email-change guard) share one `otherVerifiedAdminCount()` closure defined once per transaction attempt, avoiding duplicated raw-SQL strings.

## Deviations from Plan

None - plan executed exactly as written. No new engine-divergence skip was needed: both new CR-02 concurrency tests passed against MySQL 8.4 (the local test database engine) on the first GREEN run, so no `ctx.skip(await isMariaDB(), ...)` gate was added.

## Mutation-Test Evidence

- **Mutation-test A (concurrency guard):** Temporarily reverted `updateUser` to the original non-transactional `models.User.count` + `Op.ne` shape (working-tree edit only, restored before commit). Re-running `src/resolvers/updateUser.test.js` produced exactly 2 failures -- both new CR-02 concurrency tests, each failing with `AssertionError: expected 0 to be greater than or equal to 1` -- while all other 17 tests stayed green. Restored the fix; `diff` against the saved fixed-state copy confirmed byte-identical restoration; re-ran the file and confirmed all 19 tests pass again.
- **Mutation-test B (WR-01 clause):** Temporarily deleted `&& target.emailVerified === true` from the email-change guard's condition (working-tree edit only, restored before commit). Re-running the file produced exactly 1 failure -- `does not block the only (unverified) administrator from changing their own email (WR-01 fix)`, now blocked with `"Promote another administrator before changing the last administrator's email."` -- while all other 18 tests stayed green. Restored the clause; re-ran and confirmed all 19 tests pass again.

## Regression Gate Results

- `npm test -w backend -- src/resolvers/updateUser.test.js` (post-Task-2/3): **19/19 passed** -- 17 pre-existing test slots (1 of which, WR-01, was corrected in place) + 2 new CR-02 concurrency tests.
- `npm test -w backend -- src/resolvers/register.test.js src/resolvers/verifyEmail.test.js src/resolvers/updateUser.test.js src/config/assertRequiredColumns.test.js`: **68 passed / 2 skipped (70 total), 4 test files** -- matches the plan's predicted count exactly (66 pre-plan baseline + 19 - 17 = 68 passed; the 2 skips are the pre-existing, documented MariaDB-engine-gated skips, unaffected by this plan).
- `npm test -w backend` (full suite): **511 passed / 3 skipped (514 total), 68 test files, 0 failures** -- against the Plan 32-08 baseline of 509 passed / 3 skipped, this plan's net +2 concurrency tests account for the entire delta (509 + 2 = 511). The 3 skips are the same pre-existing, documented MariaDB-engine-gated skips from KNOWN-ISSUES.md, unchanged by this plan.

## Return Shape / Error Semantics Self-Check (Task 3)

Confirmed by reading the diff, not new code:

- `serializeUser(target)`'s return shape is unchanged -- `target` is reassigned inside the transaction callback and holds the final, committed row state once `runUpdate()` resolves (or, on a deadlock, once the retried `runUpdate()` resolves).
- The `UniqueConstraintError` → `'A user with this email already exists.'` translation still fires from inside the transaction callback (now wrapping `target.save({ transaction: t })`) and still propagates as a plain `Error` to the caller -- confirmed by the existing "rejects an email already used by another account" test passing unmodified.
- `sendVerificationEmail(...).catch(...)` remains textually and behaviorally AFTER the closing of the `try { await runUpdate(); } catch { ... }` retry block, firing only once the transaction has committed -- confirmed by the existing "flips emailVerified to false and emails a verification link on email change" test passing via its `vi.waitFor` assertion.
- `grep -n "lock: t.LOCK.UPDATE"` returns 3 matches: 1 inside a `verifyEmail` comment (pre-existing text, unmodified), 1 inside `verifyEmail`'s actual inviter-lock code (pre-existing), 1 inside `updateUser`'s new target-lock code (new) -- matching the plan's expected "verifyEmail's 2 pre-existing + updateUser's 1 new" count.
- `Op` import removed (`grep -n "Op\."` returns zero matches after the fix); confirmed no remaining usage before removing the import.

## Out-of-Scope Findings (Recorded, Not Silently Dropped)

Per Task 3's action, the following 32-REVIEW.md findings are explicitly OUT OF SCOPE for this gap-closure round:

| ID | One-line pointer |
|----|-------------------|
| WR-02 | `register.test.js`'s over-floor timing test's broken-filter vacuousness -- not touched, this round does not modify `register.test.js` |
| WR-03 | `register.test.js`'s real-clock timing test, flaky-by-construction on loaded CI |
| WR-04 | Stale/incorrect comment in `models/index.js` about `assertRequiredColumns` test coverage |
| WR-05 | `assertRequiredColumns` hardcodes one column instead of deriving from the model |
| WR-06 | `ADMIN_EMAIL` has no boot-time format validation |
| WR-07 | `register`'s catch-block log drops the stack/cause |
| WR-08 | `register` has no email-format validation before the guarded region |
| IN-01 | Duplicate import in `register.test.js` |
| IN-02 | `assertRequiredColumns.js`'s file placement under `config/` instead of `models/` |

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both `verifyEmail` and `updateUser` now share one proven transaction + locking-read + deadlock-retry-once pattern for last-administrator-invariant enforcement; any future resolver needing the same guard shape (e.g. a future bulk-role-change mutation) should reuse this pattern rather than reinventing a third variant.
- Full backend suite is green (511/514, 3 pre-existing documented MariaDB skips) -- ready for `/gsd:verify-work 32` to close out the phase.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-09-01*
