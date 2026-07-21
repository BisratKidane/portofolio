---
phase: 11-email-verification-admin-race-fix
plan: 08
subsystem: auth
tags: [graphql, sequelize, mysql, transactions, concurrency, innodb, vitest, tdd]

# Dependency graph
requires:
  - phase: 11-05
    provides: verifyEmail resolver + resendVerificationEmail (the race-unsafe two-statement ADMIN promotion this plan replaces)
  - phase: 11-01
    provides: emailVerified/emailVerificationToken columns + verification token helpers
provides:
  - Race-safe verifyEmail — token consumption + admin-count check + ADMIN promotion in one Sequelize transaction with a locking FOR UPDATE admin-count read
  - Retry-once-on-ER_LOCK_DEADLOCK recovery so a losing racer keeps a usable session instead of a burned token
  - Deterministic two-connection (FOR UPDATE + SLEEP + anchor-lock) concurrency test that actually fails if the atomicity guarantee regresses
affects: [email-verification, admin-bootstrap, auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Locking SELECT ... FOR UPDATE inside a managed sequelize.transaction to serialize a single-slot invariant across concurrent requests"
    - "Retry-once-on-deadlock wrapper (idempotent because nothing commits until the whole transaction succeeds)"
    - "Deterministic DB-concurrency test via a second raw mysql2 connection holding an exclusive lock on a shared anchor row to force interleaving"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/verifyEmail.test.js

key-decisions:
  - "CR-01 Option B: single transaction + locking FOR UPDATE admin-count read (not the generated-column UNIQUE-key Option A) — no schema/migration change required"
  - "Retry the transaction exactly once on ER_LOCK_DEADLOCK; any other error or a second deadlock propagates unchanged"
  - "Promotion is models.User.update({ role: 'ADMIN' }) inside the transaction when adminCount === 0 — never a separate raw autocommit JOIN statement"
  - "Rewrote the ADMIN-race test (WR-03) into a deterministic anchor-lock two-connection harness because a bare Promise.all passes regardless of fix status through the serialized in-process harness"

patterns-established:
  - "Single-slot invariant enforcement: lock the count with FOR UPDATE inside the same transaction as the mutation that fills the slot"
  - "DB-concurrency regression test: pin real resolvers at a lock with a raw connection, release simultaneously to force the race"

requirements-completed: [VERIFY-04]

# Metrics
duration: 40min
completed: 2026-07-21
---

# Phase 11 Plan 08: verifyEmail ADMIN-Race Fix Summary

**verifyEmail now consumes its token and assigns the single ADMIN slot inside one Sequelize transaction with a locking `SELECT COUNT(*) ... FOR UPDATE` read and a retry-once-on-deadlock wrapper, closing the VERIFY-04 land-grab race that empirically deadlocked 28/30 times under real MySQL 8.4 concurrency.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-21T10:40:00Z
- **Completed:** 2026-07-21T11:00:00Z
- **Tasks:** 2 (TDD RED → GREEN)
- **Files modified:** 2

## Accomplishments
- Replaced the two-statement autocommit ADMIN promotion (a conditional `UPDATE ... JOIN` derived-table count that was not a locking read) with a single `sequelize.transaction` wrapping token consumption + a `FOR UPDATE` admin-count read + conditional promotion — concurrent verifiers now serialize on the single ADMIN slot structurally.
- Added retry-once-on-`ER_LOCK_DEADLOCK`: because nothing commits until the whole transaction succeeds, a deadlocked racer rolls back with its single-use token intact and re-runs once, receiving a valid `AuthPayload` instead of a burned token and a raw unhandled SQL error.
- Rewrote the inadequate `Promise.all` ADMIN-race test into a deterministic two-connection harness (raw `mysql2` connection holds `FOR UPDATE` behind a `SLEEP` window, plus an anchor-row lock that pins two real verifiers and releases them simultaneously) — it now fails against the pre-fix resolver and is stable 5/5 against the fix.
- Replaced the misleading "functionally identical" in-code comment with an accurate description of the transaction-based atomicity guarantee.

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1: Deterministic FOR UPDATE/SLEEP concurrency harness (RED)** - `9cbca8b` (test)
2. **Task 2: Atomic transaction + locking read + deadlock retry (GREEN)** - `7bb006a` (feat)

**Plan metadata:** see final `docs(11-08)` commit.

## Files Created/Modified
- `backend/src/resolvers/user.resolver.js` - `verifyEmail` rewritten: token lookup/expiry check stays outside the transaction; token-consumption UPDATE + `SELECT COUNT(*) ... FOR UPDATE` + conditional `role: 'ADMIN'` update run inside one `sequelize.transaction`; wrapped in a retry-once-on-`ER_LOCK_DEADLOCK` helper; misleading comment replaced. Return shape (`await user.reload(); return { token: signToken(user), user }`) unchanged.
- `backend/src/resolvers/verifyEmail.test.js` - Old bare `Promise.all` race test replaced by Test A (raw connection holds the exact `FOR UPDATE` admin-count read behind a `SLEEP(0.3)`, proving a concurrent verifier serializes on it) and Test B (two real verifiers pinned by an exclusive lock on a shared non-admin anchor row, released simultaneously — asserts neither racer surfaces a raw SQL error, both keep a usable session token, and exactly one becomes ADMIN). The 4 pre-existing happy-path/rejection tests and the D-04/D-06 "does not reopen the ADMIN slot" test are unchanged.

## Decisions Made
- Adopted CR-01 **Option B** (transaction + locking read) per the user's locked decision — avoids the schema/migration change Option A (generated-column UNIQUE key) would require, and mirrors the atomic-conditional-update pattern already used by `resetPassword`.
- Promotion runs as a Sequelize `update` inside the transaction (not a raw autocommit JOIN), keeping the single ADMIN-slot decision inside the same locked unit as token consumption.
- Used `Number(adminCount) === 0` (rather than strict `adminCount === 0`) to be robust to driver-dependent COUNT return typing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rewrote the RED harness to actually reproduce the pre-fix failure**
- **Found during:** Task 1 (RED design)
- **Issue:** The plan's Test A design (raw `FOR UPDATE` + `SLEEP` + one real verifier, asserting the mutation resolves after the raw commit) does not fail against the pre-fix resolver: with no index on `role`, the raw `SELECT ... FOR UPDATE` full-scans and locks every row, so the pre-fix promotion (a data-modifying UPDATE whose derived-table subquery also acquires shared locks) *also* blocks and resolves after the raw commit. Likewise a plain two-racer `Promise.all` (plan's Test B) passes regardless of fix status because the in-process harness serializes on one connection (as 11-VERIFICATION.md documented, 6/6 clean via the app path). Empirically probed 5 candidate harness designs against the real test DB before finding a deterministic one.
- **Fix:** Kept Test A as a `FOR UPDATE`/`SLEEP` contention proof (passes both pre- and post-fix, satisfies the literal grep acceptance and documents serialization), and made **Test B** the deterministic RED: a raw connection holds an exclusive lock on a shared non-admin *anchor* row that both promotion admin-count scans must read but neither primary-key token UPDATE touches, pinning two real verifiers at their admin-count read; releasing the lock fires both promotions simultaneously and forces the symmetric lock-order deadlock. Proven 6/6 to fail pre-fix (one racer gets `ER_LOCK_DEADLOCK`) and 5/5 to pass post-fix.
- **Files modified:** backend/src/resolvers/verifyEmail.test.js
- **Verification:** `ENV_FILE=../env/test.env npx vitest run src/resolvers/verifyEmail.test.js` exits 1 pre-fix (failure in Test B's `errors` assertion) and exits 0 post-fix, 5 consecutive runs.
- **Committed in:** 9cbca8b (Task 1 RED commit)

**2. [Rule 3 - Blocking] Dropped the invalid `--reporter=basic` flag from the flake-check command**
- **Found during:** Task 2 (GREEN flake check)
- **Issue:** The plan's verify command `npx vitest run ... --reporter=basic` fails in Vitest 4 — `basic` is not a built-in reporter and Vitest tries to load it as a custom module, throwing `ERR_LOAD_URL` (non-zero exit unrelated to test results).
- **Fix:** Ran the 5-consecutive-run flake check with the default reporter (`npx vitest run src/resolvers/verifyEmail.test.js`).
- **Files modified:** none (command-only)
- **Verification:** 5/5 consecutive runs green.
- **Committed in:** n/a (tooling command, no file change)

---

**Total deviations:** 2 (1 bug-fix to the RED harness for honest TDD, 1 blocking tooling fix)
**Impact on plan:** Both necessary to satisfy the plan's own acceptance intent (a meaningful RED and a real-DB flake check). The fix, the atomicity guarantee, the FOR UPDATE read, the deadlock retry, and the comment replacement all match the plan and CR-01 Option B exactly. No scope creep.

## Issues Encountered
- Determining a deterministic RED required understanding InnoDB locking on this schema (no index on `role` → full-table locks; derived-table counts inside an UPDATE take shared locks; the pre-fix autocommit statements never sustain locks across an interleaving window, so a single real resolver cannot be deadlocked by a passive holder). Resolved by discovering that two *symmetric* transactional promoters are required, and synchronizing two real resolvers with a raw-connection anchor lock.

## Verification Evidence
- Full backend suite: **121/121 passing** (22 files) via `ENV_FILE=../env/test.env npm test`.
- `verifyEmail.test.js`: **7/7 passing**, stable across **5 consecutive** real-DB runs.
- Greps: `sequelize.transaction`=1, `FOR UPDATE` (resolver)=2 (1 comment + 1 query), `functionally identical`=0, `ER_LOCK_DEADLOCK`=1, `FOR UPDATE` (test)=2, `SLEEP` (test)=2.

## User Setup Required
None - no external service configuration required. (Phase-level manual migration boot-and-verify remains the pending 11-07 Task 3 human checkpoint, unaffected by this plan.)

## Next Phase Readiness
- VERIFY-04 is now met with a DB-enforced atomicity guarantee and a regression-catching test — the phase's headline deliverable is achieved and re-verifiable.
- Phase 11 close still gated on the 11-07 Task 3 human checkpoint (apply `backend/migrations/manual/011-add-email-verification-columns.sql` to a pre-existing dev DB + manual 8-step register→verify→dashboard flow, ROADMAP SC-5). Recommend re-running the phase verifier after that checkpoint.

## Self-Check: PASSED

- Files verified on disk: `backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/verifyEmail.test.js`, `.planning/phases/11-email-verification-admin-race-fix/11-08-SUMMARY.md`
- Commits verified in git log: `9cbca8b` (RED), `7bb006a` (GREEN)

---
*Phase: 11-email-verification-admin-race-fix*
*Completed: 2026-07-21*
