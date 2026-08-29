---
phase: 31-invitations-become-admin-only
plan: 04
subsystem: auth
tags: [graphql, sequelize, transaction, invitations, apollo, vitest, authorization]

# Dependency graph
requires:
  - phase: 31-invitations-become-admin-only (plan 02)
    provides: "verifyAndPromote's existing Pending->Active auto-activation transaction (Invitation.findOne keyed on registeredUserId, conditional User.update), which this plan re-verifies the inviter inside before promoting"
provides:
  - "verifyAndPromote re-verifies the inviter's CURRENT role and status (models.User.findByPk(invitation.inviterId) + vouchedByAdmin gate) at redemption time, inside the existing transaction, before promoting Pending -> Active"
  - "Closes both the pre-Phase-31 non-admin-issued legacy-row exploit and the demoted/disabled-admin TOCTOU exploit with a single runtime check -- no migration, no schema change (D-05 preserved)"
  - "3 new regression tests pinning the inviter-vouching guard (CR-01 x2) and the no-invitation-row boundary (CR-02), plus a recorded mutation-test-the-guard RED/GREEN result proving the guard has real teeth"
affects: [32-tokenless-registration, 33-account-shaped-approval-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redemption-time re-verification: a value trusted at creation time (an invitation's inviterId) is re-read and re-validated against its CURRENT row inside the same transaction at the moment it is relied upon, rather than trusted from the row's existence alone -- closes a TOCTOU window without a migration or provenance column"
    - "Mutation-test-the-guard: before landing a new authorization check, deliberately neuter it to prove the new tests are load-bearing (fail without the check, pass with it), not merely incidentally satisfied -- reused convention from Phases 14/15/30, now applied to this phase's own gap"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/verifyEmail.test.js

key-decisions:
  - "No migration added, per D-05 (preserved, not violated): a runtime re-check at redemption time subsumes both the legacy-row exploit AND the demoted-admin-after-invite exploit, whereas a 020-*.sql migration expiring pre-Phase-31 rows would only close the legacy-row half and does nothing for an admin demoted after the migration runs"
  - "The inviter lookup and vouchedByAdmin gate run inside verifyAndPromote's existing sequelize.transaction callback (D-07), passing { transaction: t } -- no new transaction, no change to the commit boundary before the outer user.reload()/return (F-03)"
  - "Invitation.status is never written by the promotion path (D-08, unchanged) -- the new check only reads models.User rows (inviter), never touches the Invitation row itself"
  - "vouchedByAdmin requires all three of Boolean(inviter) && inviter.role === 'ADMIN' && inviter.status === 'Active' -- the Boolean(inviter) null-guard is defensive-only per T-31-13 (inviterId is allowNull:false with ON DELETE CASCADE, so a null lookup should be unreachable in normal operation, but the guard fails safe if it ever isn't)"

requirements-completed: [INVITE-03]

# Metrics
duration: 6min
completed: 2026-08-29
---

# Phase 31 Plan 04: Close SC-3/INVITE-03 Inviter-Vouching Gap Summary

**`verifyAndPromote` now re-verifies the inviter's CURRENT role (`ADMIN`) and status (`Active`) at redemption time before promoting a Pending registrant to Active, closing both the pre-Phase-31 non-admin-issued legacy-row exploit and the demoted/disabled-admin TOCTOU exploit with a single runtime check and no migration.**

## Performance

- **Duration:** ~6 min (commit-to-commit; base commit 16:51:48 -> final task commit 16:57:21)
- **Started:** 2026-08-29T14:51:48Z
- **Completed:** 2026-08-29T14:57:21Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Closed the one open gap from `31-VERIFICATION.md` (Roadmap SC-3 / INVITE-03): `verifyEmail`'s auto-activation no longer promotes a Pending registrant to Active based solely on the EXISTENCE of an `Invitation` row -- it now re-reads the vouching admin's live row and requires `role === 'ADMIN' && status === 'Active'` at the exact moment of promotion.
- Both confirmed-exploitable paths are closed by the same fix: (1) pre-Phase-31 invitations issued by a linked, Active, non-admin family member under the old `requireFamilyAccess` guard (still live, no migration touches them), and (2) an invitation whose inviter is later demoted to `USER`, disabled, or rejected before the invitee verifies (TOCTOU).
- No migration or schema change introduced (D-05 preserved) -- the runtime re-check subsumes both exploit paths, including the forward-looking one a migration alone could never close.
- The happy path is provably unchanged: an invitation whose inviter is CURRENTLY `ADMIN`+`Active` still promotes straight to `Active` with zero admin action in between (SC-3's original test still passes).
- The new guard's test coverage was proven non-cosmetic via the mandatory mutation-test-the-guard step: neutering `vouchedByAdmin` to `Boolean(inviter)` alone (dropping the role/status conditions) turned exactly the 2 new inviter-vouching tests RED and nothing else; restoring the full check returned the suite to fully GREEN.

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: RED -- add the two inviter-vouching negative tests and the no-invitation regression test** - `90db793` (test)
2. **Task 2: GREEN -- re-verify the inviter at redemption time, then mutation-test the new guard** - `5203419` (feat)

**Plan metadata:** SUMMARY.md commit follows this document (STATE/ROADMAP handled by the orchestrator after merge, per worktree isolation)

_Note: the mutation-test-the-guard step (neuter -> confirm 2 failures -> restore -> confirm 13/13) was performed entirely between Task 2's edits and its final commit; the neutered intermediate version was never committed -- confirmed via `git status` showing a clean tree and `git diff backend/src/resolvers/user.resolver.js` showing only the final three-condition check._

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` -- `verifyAndPromote`'s `if (invitation) { ... }` block gains an inviter lookup (`models.User.findByPk(invitation.inviterId, { transaction: t })`) and a `vouchedByAdmin` gate (`Boolean(inviter) && inviter.role === 'ADMIN' && inviter.status === 'Active'`) wrapping the existing conditional `User.update` promotion call. No other resolver logic touched.
- `backend/src/resolvers/verifyEmail.test.js` -- 3 new tests added after the existing D-06 Disabled non-resurrection test: `'does not activate a Pending account whose invitation was issued by a non-admin (CR-01, legacy row)'`, `'does not activate a Pending account whose inviter is an admin who is now Disabled (CR-01, demoted/disabled admin)'`, `'does not activate a Pending account with no invitation row at all (CR-02, regression guard)'`. File now has 13 declared `it(` blocks (was 10).

## Decisions Made

- **No migration (D-05 caveat, explicitly documented in the plan's objective):** of the two candidate closures for the verifier's legacy-window item -- (a) a `020-*.sql` migration expiring pre-Phase-31 non-admin-issued Pending rows, or (b) a runtime re-check at redemption -- this plan took (b), because (b) fully subsumes (a) while (a) cannot cover the demoted-admin-after-invite path at all. `31-CONTEXT.md`'s original D-05 declined a migration/provenance column as a scoping decision that never considered or accepted this specific exploit; this plan's interpretation (reading the FK's CURRENT target rather than trusting its existence) is a strictly tighter reading of D-05's own "keyed on the FK alone" premise, not a violation of it.
- **Insertion point inside the existing transaction, not a new one:** the inviter lookup and `vouchedByAdmin` gate run with `{ transaction: t }` inside `verifyAndPromote`'s existing `sequelize.transaction(async (t) => {...})` callback, preserving D-07 (single atomic commit for token consumption + ADMIN-slot decision + inviter-vouching promotion) and F-03 (the whole thing commits before the outer `user.reload()`/`return`, so the response never describes a stale status).
- **Boolean(inviter) null-guard is defensive-only, not load-bearing today:** `Invitation.belongsTo(User, { as: 'inviter', foreignKey: { allowNull: false }, onDelete: 'CASCADE' })` means an orphaned `inviterId` is structurally unreachable through normal application code (T-31-13, disposition: accept). The guard fails safe anyway in case of an out-of-band data change.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` specifications precisely: Task 1 added exactly the 3 named tests in the exact insertion point with the exact assertions, observed the exact RED failure mode (assertion mismatch on `user.status`, not an exception) before touching production code; Task 2 inserted exactly the two specified statements at the specified insertion point, ran the mandatory mutation-test-the-guard step exactly as specified, and confirmed all three named adjacent regression suites stayed green. No architectural changes, no missing critical functionality beyond what the plan already specified, and no blocking issues required a fix outside the plan's scope.

## Issues Encountered

None. All test runs (`verifyEmail.test.js` RED, GREEN, and mutated states; `createInvitation.test.js`; `register.test.js`; `approveReject.test.js`) completed cleanly on the first attempt with no `resetTables` isolation flakes observed in this session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Roadmap SC-3 / INVITE-03 is now true without qualification: an invited registrant is promoted to Active on email verification if and only if the invitation's CURRENT inviter is an Active `ADMIN` -- never merely because a row with that `registeredUserId` exists. This closes the phase's last open gap; `31-VERIFICATION.md`'s `gaps_found` status for this item should re-verify to `verified` on the next verification pass.
- D-04, D-06, D-07, D-08, and F-03 all remain true and are re-confirmed by all 10 pre-existing `verifyEmail.test.js` tests staying green throughout (happy path, single-use token, deadlock-retry, ADMIN-slot races, D-06 Rejected/Disabled non-resurrection).
- W-1 (`InvitationsPage.jsx` component-level ADMIN gate), W-2 (no admin escape hatch / `revokeInvitation`), and W-3 (`Set.has` numeric coercion) were explicitly NOT touched by this plan and remain recorded as open warnings in `31-REVIEW.md` / `STATE.md`'s deferred items -- this run closed SC-3 only, per the plan's stated success criteria.
- Phase 32 (tokenless self-registration) and Phase 33 (account-shaped approval queue) both inherit a `verifyAndPromote` whose auto-activation is now semantically correct (admin-vouched, not merely row-exists), which is the exact premise both downstream phases depend on per this plan's `provides`.

---
*Phase: 31-invitations-become-admin-only*
*Completed: 2026-08-29*
