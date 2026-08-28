---
phase: 30-approval-moves-to-the-account
plan: 03
subsystem: testing
tags: [vitest, graphql, sequelize, approval, integration-test]

# Dependency graph
requires:
  - phase: 30-02
    provides: "approveUser(userId)/rejectUser(userId, reason) account-addressed mutations, D-04's unconditional User-row decision-field stamp"
provides:
  - "backend/src/resolvers/approveReject.test.js fully rewritten and extended: every test retargeted to account-id addressing (D-01), plus D-07/D-08-D-09/F-01/no-invitation-path coverage and D-04 dual-stamp assertions"
  - "npm test --workspace backend green (63 files, 418 passed, 2 skipped) -- the phase's SC-5 backend gate"
affects: [30-04-ApprovalsPage-rewire, 32-self-registration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.waitFor() polling the audit-row query itself (not just the mocked mailer call count) before asserting on a fire-and-forget writeAuditLog write -- the mailer's mock resolves instantly while the audit write is a real DB round trip, so waiting only on the mailer mock is not a reliable proxy for the audit row's existence"

key-files:
  created: []
  modified:
    - backend/src/resolvers/approveReject.test.js

key-decisions:
  - "pendingRegistration() helper extended with an options object ({ emailVerified = true } = {}) rather than a second near-duplicate helper, keeping every existing call site's default behavior unchanged"
  - "REJECT mutation's selection set drops rejectionReason (the User GraphQL type has no such field); the reason is asserted via registrant.reload() on the Sequelize instance instead of the mutation's return value"
  - "D-04's no-invitation-path tests poll for the AuditLog row via vi.waitFor() directly, rather than relying on the mocked-mailer wait as an indirect proxy for the audit write's completion -- the two fire-and-forget calls are not guaranteed to resolve in lockstep"

requirements-completed: [APPR-01, APPR-03, APPR-04, APPR-05, INVITE-04]

# Metrics
duration: ~25min
completed: 2026-08-28
---

# Phase 30 Plan 03: Approval Moves to the Account (Test Coverage) Summary

**Rewrote approveReject.test.js in place to prove the account-id cutover (D-01) and added the four NEW coverage rows from 30-VALIDATION.md's Per-Task Verification Map -- D-07 repeat-disposition, D-08/D-09/F-01 unverified-email, and the no-invitation approve/reject path -- plus reload()-based D-04 assertions proving the User row is always stamped, both with and without a matching Invitation row.**

## Performance

- **Duration:** ~25 min (including a ~5 min full-suite run as the SC-5 verification gate)
- **Started:** 2026-08-28T09:10:00Z (approx, after worktree base correction)
- **Completed:** 2026-08-28T09:28:20Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 1 (`backend/src/resolvers/approveReject.test.js`)

## Accomplishments

- Every existing test retargeted from `invitation.id` to `registrant.id` addressing (`approveUser(userId: $id)`/`rejectUser(userId: $id, reason: $reason)`), proving D-01's account-id cutover is real -- the fixture's `invitation.id` and `registrant.id` are distinct values, so this is a meaningful assertion, not a coincidence.
- `describe('approveInvitation'/'rejectInvitation')` renamed to `describe('approveUser'/'rejectUser')`; `AuditLog` action filters retargeted to `'user.approved'`/`'user.rejected'` (D-06); the old invitation-status-based "not awaiting approval" test deleted (its premise no longer exists) and replaced by Task 2's User-status-based D-07 tests.
- **D-07 (repeat-disposition):** two new tests -- approving an already-`Active` account and rejecting an already-`Rejected` account both throw `'This account is not awaiting a decision.'` with zero side effects (`reload()` confirms `status` unchanged).
- **D-08/D-09/F-01 (unverified email):** two new tests, explicitly named/commented `(F-01: intentional new behavior, not a regression)`, build a `Pending` + `emailVerified: false` fixture (via the extended `pendingRegistration()` helper) and confirm both `approveUser`/`rejectUser` throw the verification-required message, leaving the account `Pending`.
- **No-invitation path (D-04, Phase 32 precursor):** two new tests create a `Pending`, verified `User` with zero `Invitation` rows; both mutations succeed, the resulting `AuditLog` row has `invitationId: null`, and -- after `reload()` -- the `User` row itself carries `approvedAt`/`approvedBy` (approve) or `rejectedAt`/`rejectionReason` (reject). This is the assertion a prior version of this plan set left unasserted and the entire reason this phase exists.
- **With-invitation dual-stamp (D-04 + D-05):** the existing happy-path tests extended so that, after `reload()`, `registrant.approvedAt.getTime() === invitation.approvedAt.getTime()` and `registrant.approvedBy === invitation.approvedBy` (approve), or the equivalent for `rejectedAt`/`rejectionReason` (reject) -- proving the account row is stamped identically to the invitation row, not merely alongside it.
- `pendingRegistrations query` describe block left byte-for-byte untouched (D-10, confirmed via the acceptance-criteria greps and a clean git diff on that section).
- Full backend suite green: `npm test --workspace backend` -> 63 test files passed, 418 tests passed, 2 skipped, 0 failed -- the phase's SC-5 gate.
- `createInvitation.test.js` re-verified green in isolation (INVITE-04/SC-4), confirming the untouched invitation-creation code path is unaffected.

## Task Commits

Each task was committed atomically:

1. **Task 1: Retarget existing coverage to the account-based mutations** - `45462d1` (test)
2. **Task 2: Add the NEW coverage rows, including D-04's account-stamp assertions** - `1e594f4` (test)

**Plan metadata:** _(this commit -- SUMMARY.md)_

## Files Created/Modified

- `backend/src/resolvers/approveReject.test.js` - Fully rewritten in place: account-id addressing throughout, D-07/D-08-D-09/F-01/no-invitation coverage added, D-04 dual-stamp `reload()` assertions on both the with-invitation and no-invitation paths, `pendingRegistration()` helper extended with an `emailVerified` override, `pendingRegistrations query` block untouched.

## Decisions Made

- `pendingRegistration(email, { emailVerified = true } = {})` -- extended the existing helper's signature with an options object rather than adding a second near-duplicate helper, so every existing call site keeps working unmodified while the new D-08/D-09 tests can opt into `emailVerified: false`.
- The rewritten `REJECT` mutation's selection set (`{ id status }`) drops `rejectionReason` since the `User` GraphQL type has no such field (only `Invitation` does); the reason is asserted via `registrant.reload(); expect(registrant.rejectionReason)` on the Sequelize instance instead.
- The two new no-invitation-path tests poll for the `AuditLog` row via `vi.waitFor()` directly (not indirectly through the mocked mailer's call count) -- discovered during verification that the mailer mock resolves faster than the real audit-log DB write, making the mailer wait an unreliable proxy for the audit write's completion. See Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Flaky no-invitation-path audit assertions -- fixed the wait strategy, not the resolver**
- **Found during:** Task 2 verification (targeted test-file run)
- **Issue:** The first draft of the two no-invitation-path tests (`approves`/`rejects a Pending, verified account with no invitation row`) waited on the mocked mailer's call count (`vi.waitFor(() => expect(sendAccountApprovedEmail).toHaveBeenCalledTimes(1))`) before querying `AuditLog.findAll(...)`, mirroring the pre-existing happy-path pattern. This intermittently failed with `expected [] to have a length of 1 but got +0` -- the mocked mailer promise resolves on the next microtask, but `writeAuditLog`'s real DB insert is a separate, slower fire-and-forget call, so waiting on the mailer's resolution does not reliably guarantee the audit row already exists.
- **Fix:** Changed both tests to `await vi.waitFor(async () => { audits = await models.AuditLog.findAll(...); expect(audits).toHaveLength(1); })` -- polling the actual condition being asserted, rather than an indirect proxy for it. This is a test-only fix; no resolver behavior was touched, and the existing happy-path tests (which already had the email-wait immediately followed by the audit query, and were observed to pass reliably across repeated runs) were left as-is per Rule 1's scope boundary (only fix what the current task's changes touch).
- **Files modified:** `backend/src/resolvers/approveReject.test.js`
- **Verification:** Re-ran `npm test --workspace backend -- src/resolvers/approveReject.test.js` three times after the fix (12/12 passing each run, including a `-t "no invitation row"` isolated re-run) and the full backend suite once more (63 files, 418 passed, 2 skipped, 0 failed).
- **Committed in:** `1e594f4` (Task 2 commit -- the fix landed before the task's single commit, not as a separate follow-up)

**2. [Environment] Worktree base was stale at spawn; corrected per the `<worktree_branch_check>` protocol**
- **Found during:** Startup, before any file reads
- **Issue:** The worktree's `HEAD` was on `52d044e` (a `main`-line commit predating all of Phase 30's work), not the expected base `9266e283bc6dc5ee98a18e07abfcbf7ea4901ca2` (the tip of Plan 30-02). `git merge-base` confirmed `52d044e` was an ancestor of the expected base, not a divergent commit.
- **Fix:** Ran the prescribed `git reset --hard 9266e283bc6dc5ee98a18e07abfcbf7ea4901ca2` exactly as the `<worktree_branch_check>` setup step specifies, then verified `HEAD` matched.
- **Files modified:** None (branch pointer only, no working-tree file changes were present or lost -- `git status --short` was clean immediately before and after).
- **Verification:** `git rev-parse HEAD` equals `9266e283bc6dc5ee98a18e07abfcbf7ea4901ca2` immediately after; `git log --oneline -5` confirmed Plan 30-01/30-02's commits were present.
- **Committed in:** N/A (branch-pointer correction, no commit)

---

**Total deviations:** 2 (1 test-only wait-strategy fix, 1 environment/worktree-base correction). Neither changed scope, resolver behavior, or files outside `backend/src/resolvers/approveReject.test.js`.
**Impact on plan:** None on scope or behavior. The wait-strategy fix strengthens the no-invitation-path tests' reliability without touching `approval.resolver.js`; the worktree-base correction was a required, protocol-mandated setup step, not a plan deviation in the substantive sense.

## Issues Encountered

None beyond the flaky-wait issue documented above, which was caught and fixed during Task 2's own verification pass before committing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `backend/src/resolvers/approveReject.test.js` now exercises the real `approveUser`/`rejectUser` mutations against account ids, with full coverage of D-01, D-04 (both with- and without-invitation), D-05, D-06, D-07, D-08/D-09/F-01, and the login-gate regression (APPR-05) -- the phase's backend Nyquist gate is closed.
- `npm test --workspace backend` is green (63 files, 418 passed, 2 skipped, 0 failed), confirming the invitation happy path (`createInvitation`, `myInvitations`, `invitations`, `pendingRegistrations`, `Invitation.inviter` for non-admin inviters) is unaffected (INVITE-04, SC-4).
- Plan 30-04 (parallel wave, frontend `ApprovalsPage.jsx`/`ApprovalsPage.test.jsx` rewire) is unaffected by and independent of this plan's changes -- no shared files.
- The whole-repo SC-5 gate (`npm test --workspaces`) still needs the frontend half (Plan 30-04) to close before it can be claimed; this plan closes only the backend half.

---
*Phase: 30-approval-moves-to-the-account*
*Completed: 2026-08-28*

## Self-Check: PASSED

- FOUND: `backend/src/resolvers/approveReject.test.js`
- FOUND: `.planning/phases/30-approval-moves-to-the-account/30-03-SUMMARY.md`
- FOUND: commit `45462d1`
- FOUND: commit `1e594f4`
