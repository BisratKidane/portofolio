---
phase: 29-accessibility-responsive-quality-gate
plan: 01
subsystem: testing
tags: [vitest, mysql2, sequelize, mariadb, ctx.skip, test-infrastructure]

# Dependency graph
requires:
  - phase: 23-write-path-quality-gate
    provides: "The two pre-existing MariaDB-only concurrency failures (VERIFY-04, REL-06) that D-08 flagged and this plan closes honestly"
provides:
  - "backend/test/dbEngine.js — shared async isMariaDB() engine-detection helper (SELECT VERSION())"
  - "VERIFY-04 (verifyEmail.test.js) and REL-06 (familyMember.dedup.test.js) guarded with a visible, reason-documented ctx.skip on MariaDB, unconditionally run on CI (MySQL 8.4)"
  - "KNOWN-ISSUES.md entry documenting the MariaDB-vs-MySQL caveat"
affects: [29-02, 29-03, 29-04, quality-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async engine-detection guard: `ctx.skip(await isMariaDB(), reason)` as the first statement of a Vitest test body — required over `it.skipIf`/`describe.skipIf` because the skip condition is an async DB round-trip and skipIf needs a synchronous boolean at collection time"

key-files:
  created:
    - backend/test/dbEngine.js
  modified:
    - backend/src/resolvers/verifyEmail.test.js
    - backend/src/services/familyMember.dedup.test.js
    - KNOWN-ISSUES.md

key-decisions:
  - "Guard exactly two named tests (VERIFY-04, REL-06), per CONTEXT.md D-01 — no other test in either file touched, preserving CI's full concurrency coverage on MySQL 8.4"

patterns-established:
  - "Shared test-infra engine detection lives in backend/test/dbEngine.js, sibling to guard.js/helpers.js — future engine-conditional tests should import isMariaDB() from here rather than re-deriving detection"

requirements-completed: [A11Y-01]

# Metrics
duration: 20min
completed: 2026-08-05
---

# Phase 29 Plan 01: MariaDB-vs-MySQL Concurrency-Test Skip Gate Summary

**Two pre-existing MariaDB-incompatible concurrency tests (VERIFY-04, REL-06) now visibly self-skip via a shared `isMariaDB()` engine-detection helper, so `npm test --workspace backend` exits 0 on a developer's local MariaDB dev DB without weakening CI's MySQL 8.4 coverage.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-05
- **Tasks:** 3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Created `backend/test/dbEngine.js`, a new async `isMariaDB()` helper that opens a raw `mysql2/promise` connection (mirroring `verifyEmail.test.js`'s existing `rawConnection()` shape) and matches `SELECT VERSION()` against `/mariadb/i`.
- Guarded VERIFY-04 (`verifyEmail.test.js`) and REL-06 (`familyMember.dedup.test.js`) — and only those two named tests — with `ctx.skip(await isMariaDB(), reason)` as the first statement, leaving every other test in both files untouched.
- Documented the caveat in `KNOWN-ISSUES.md` in the established 5-field format, appended without touching the existing "Reset-token exposure" entry.
- Verified on the developer's actual local engine (MariaDB): both guarded tests report `↓ ... [reason text]` in the Vitest reporter, `npm test --workspace backend -- --run verifyEmail.test.js familyMember.dedup.test.js` exits 0 (12 passed, 2 skipped).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the shared `isMariaDB()` engine-detection helper** - `a69cbdf` (feat)
2. **Task 2: Apply the documented `ctx.skip` guard to VERIFY-04 and REL-06 only** - `a5a7175` (test)
3. **Task 3: Document the MariaDB-vs-MySQL caveat in KNOWN-ISSUES.md** - `d13ac2c` (docs)

_Note: no TDD tasks in this plan — all three tasks are test-infrastructure/docs, not product-behavior changes._

## Files Created/Modified
- `backend/test/dbEngine.js` - New: exports async `isMariaDB()` via a raw `mysql2/promise` `SELECT VERSION()` query
- `backend/src/resolvers/verifyEmail.test.js` - Added `isMariaDB` import + `ctx.skip(...)` guard on the VERIFY-04 test only
- `backend/src/services/familyMember.dedup.test.js` - Added `isMariaDB` import + `ctx.skip(...)` guard on the REL-06 test only
- `KNOWN-ISSUES.md` - Appended a "MariaDB-only skip on two concurrency-locking tests" entry

## Decisions Made
None beyond the plan — the scope (exactly VERIFY-04 and REL-06, `ctx.skip` not `skipIf`) was locked by CONTEXT.md D-01 and RESEARCH.md Pitfall 3.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' acceptance criteria were verified directly (grep counts, `it(` count parity, `node --check`, reporter output inspection).

## Issues Encountered

**Unrelated pre-existing flaky test surfaced during full-suite verification.** Running the full `npm test --workspace backend` suite (not just the two target files) showed 1 failure in `src/resolvers/approveReject.test.js` (`activates the user, stamps the decision, emails them, and audits it` — an `AuditLog.findAll` count assertion), alongside the expected 412 passed / 2 skipped. This file was never touched by this plan (only `dbEngine.js`, `verifyEmail.test.js`, `familyMember.dedup.test.js`, `KNOWN-ISSUES.md` were modified). Re-running `approveReject.test.js` in isolation immediately after showed all 7 tests passing, confirming a pre-existing timing/async flake unrelated to this plan's changes, not a regression. Per the executor's scope-boundary rule (fix only issues directly caused by the current task), this was **not fixed** and is logged in `.planning/phases/29-accessibility-responsive-quality-gate/deferred-items.md` rather than `KNOWN-ISSUES.md` (which documents deliberate, understood behavior, not unconfirmed flakes). The two intentionally-guarded tests (VERIFY-04, REL-06) behaved exactly as designed in both the full-suite and isolated runs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The v4.0 milestone-close full-suite gate (SC-4/QUAL-01-style) is now honest on both engines: a developer running `npm test --workspaces` locally against MariaDB gets a clean, explained exit 0, while CI (MySQL 8.4) retains full, unweakened concurrency coverage on both previously-failing tests.
- Plans 29-02/29-03/29-04 (accessibility, contrast, mobile/responsive) can proceed without this MariaDB caveat blocking their own full-suite verification runs.
- The unrelated `approveReject.test.js` full-suite-only flake (see Issues Encountered) is not blocking but should be watched — if it recurs during 29-04's milestone-closing gate run, it may warrant a `/gsd:debug` pass before that gate's own KNOWN-ISSUES-style write-up.

---
*Phase: 29-accessibility-responsive-quality-gate*
*Completed: 2026-08-05*

## Self-Check: PASSED

- FOUND: backend/test/dbEngine.js
- FOUND: backend/src/resolvers/verifyEmail.test.js
- FOUND: backend/src/services/familyMember.dedup.test.js
- FOUND: KNOWN-ISSUES.md
- FOUND commit: a69cbdf (Task 1)
- FOUND commit: a5a7175 (Task 2)
- FOUND commit: d13ac2c (Task 3)
