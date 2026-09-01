---
phase: 32-tokenless-registration
plan: 09
subsystem: auth
tags: [graphql, sequelize, vitest, tdd, jwt]

# Dependency graph
requires:
  - phase: 32-tokenless-registration (plan 07)
    provides: "The zero-admin ADMIN_EMAIL bootstrap conditional (CR-01 fix) that this plan closes a follow-on blocker in"
provides:
  - "verifyAndPromote's ADMIN_EMAIL bootstrap write now also grants status: 'Active' + approvedAt, in the same write that grants role: 'ADMIN' -- the account is immediately usable via login/getUserFromRequest, not just role-tagged"
  - "A full-round-trip regression test (status assertion + live getUserFromRequest(token) resolution + a direct assertion that the D-12 notifier never fires) replacing the prior role-only assertion"
  - "An in-code explanation of why the unconditional status write is safe against the invitation-auto-activation block (structural no-op once already Active) and cannot resurrect a Rejected/Disabled account (token-consumption + resendVerificationEmail's verified-account refusal make the path unreachable)"
affects: [32-tokenless-registration, deployment/bootstrap-runbook]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Mutation-testing a single-line security/correctness fix by reverting-rerunning-restoring before committing, to prove the test actually exercises the fix (not just that it exists)"]

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/verifyEmail.test.js

key-decisions:
  - "status: 'Active' + approvedAt: new Date() added to the same models.User.update call as role: 'ADMIN' (three fields, one write) -- no separate write, no new transaction step"
  - "approvedBy left unset/null: this is a self-bootstrap, nobody made an approval decision; migration 019 already allows a nullable, FK-less approvedBy"
  - "README.md required no wording change -- both the Features bullet and Authentication-workflow step 1 already described a working bootstrap (written by 32-07 anticipating this exact fix) and contain no claim that is false against the fixed code"

patterns-established: []

requirements-completed: [REG-02]

# Metrics
duration: ~15min
completed: 2026-09-01
---

# Phase 32 Plan 09: ADMIN_EMAIL Bootstrap Usability Fix Summary

**The zero-admin ADMIN_EMAIL bootstrap now grants `status: 'Active'` in the same write as `role: 'ADMIN'`, closing a permanent-lockout bug proven by a full auth-round-trip regression test (not just a `role` field check).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-01T13:33:16Z
- **Tasks:** 2 (Task 2 required no additional file changes)
- **Files modified:** 2 (`backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/verifyEmail.test.js`)

## Accomplishments

- Closed 32-VERIFICATION.md's Truth 6 blocker: the one documented "safe" first-admin path (register the `ADMIN_EMAIL` account, verify it) no longer produces a permanently locked-out account.
- Extended the existing bootstrap regression test to assert the FULL round trip: `status === 'Active'`, a live `getUserFromRequest(token)` call resolving to a truthy ADMIN user, and a direct `expect(sendPendingRegistrationEmail).not.toHaveBeenCalled()` proving the D-12 notifier is unaffected — closing exactly the gap ("checked `role` only") that let the original CR-01 fix ship broken and green.
- Proved the fix is load-bearing via mutation testing: reverting the `status`/`approvedAt` fields turns exactly 1 named test red; restoring produces a byte-identical `git diff --quiet` clean state before committing.
- Documented in-code why the unconditional `status: 'Active'` write is safe against both the invitation-auto-activation block (structural no-op once already Active — no double-processing, no duplicate audit entry) and Rejected/Disabled-account resurrection (unreachable: token is consumed on first verification, and `resendVerificationEmail` refuses to reissue one for an already-verified account).
- Confirmed README.md's Features bullet and Authentication-workflow step 1 required no wording change — both already described the (until now, broken) bootstrap as working.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): extend bootstrap test to assert full auth round trip** - `779e328` (test)
2. **Task 1 (GREEN): grant status Active in the ADMIN_EMAIL bootstrap write** - `be100d7` (fix)

_Task 2 ("Self-check side effects, confirm/correct README, run the phase regression gate") produced no additional file changes: the required explanatory code comment was already written as part of the Task 1 GREEN commit (`be100d7`), and README.md was confirmed accurate against the fixed behavior with no wording change needed. No separate commit was created since there was no diff to commit._

**Plan metadata:** (this commit) `docs(32-09): complete ADMIN_EMAIL bootstrap usability plan`

_Mutation-test revert/restore cycle (Task 1's third action step) was performed in-place between the GREEN and its commit and is not itself a separate commit — the working tree was confirmed byte-identical to the intended fix (`diff` against a pre-mutation backup) before `be100d7` was created._

## Files Created/Modified

- `backend/src/resolvers/verifyEmail.test.js` - Extended the ADMIN_EMAIL bootstrap test with `status`, `getUserFromRequest`, and `sendPendingRegistrationEmail` assertions; imported `getUserFromRequest` alongside the existing `hashVerificationToken` import.
- `backend/src/resolvers/user.resolver.js` - `verifyAndPromote`'s zero-admin bootstrap conditional's `models.User.update` call now writes `{ role: 'ADMIN', status: 'Active', approvedAt: new Date() }` instead of `{ role: 'ADMIN' }`, with an explanatory comment covering the invitation-interaction and Rejected/Disabled-resurrection reasoning.

## Decisions Made

- `status: 'Active'` and `approvedAt: new Date()` added to the SAME write as `role: 'ADMIN'` (three fields, one `models.User.update` call, no new transaction step) — matches the plan's "same single write" constraint exactly.
- `approvedBy` deliberately left unset: nobody made an approval decision in a self-bootstrap; migration 019 already allows this column to be nullable with no FK, matching the precedent the plan pointed to.
- README.md required no edit: both the Features ADMIN_EMAIL bullet and Authentication-workflow step 1 already described the bootstrap as producing a working account (written by 32-07 in anticipation of this exact fix) — verified line-by-line against the post-fix behavior and found to contain no false claim.

## Deviations from Plan

None — plan executed exactly as written. The one minor sequencing note: the explanatory code comment that Task 2's `<action>` describes was written directly during Task 1's GREEN step (attached to the same conditional block being edited) rather than as a separate follow-up edit in Task 2. This produces the identical end-state Task 2 specifies; Task 2's own action step was then a read-only verification (comment already present, README already accurate, regression gate green) with nothing left to commit.

## Issues Encountered

None. RED failed exactly as predicted (`status` read `'Pending'`); GREEN passed on the first attempt; mutation-test reverted/restored cleanly with `diff` confirming byte-identical restoration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `ADMIN_EMAIL` zero-admin bootstrap documented in README.md's Authentication workflow step 1 is now genuinely functional end-to-end: register → verify → immediately authenticated as a usable ADMIN, with no manual database intervention.
- 32-VERIFICATION.md's Truth 6 is closed; only Truth 7 (updateUser TOCTOU guard, addressed in the sibling gap-closure plan 32-10) remains open for phase 32's re-verification pass.
- Regression gate confirmed at the exact pre-plan baseline (66 passed / 2 skipped across the 4 mandated files) plus a clean `pendingApprovals.test.js` pass — zero regressions to the invited-registrant auto-activation path, the D-12 notifier, or the D-11 pending-approvals queue.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-09-01*
