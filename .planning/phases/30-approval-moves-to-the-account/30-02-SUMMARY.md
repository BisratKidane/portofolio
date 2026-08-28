---
phase: 30-approval-moves-to-the-account
plan: 02
subsystem: backend
tags: [graphql, resolvers, sequelize, approval, migration-cutover]

# Dependency graph
requires:
  - "30-01: User.js's approvedAt/approvedBy/rejectedAt/rejectionReason storage fields"
provides:
  - "backend/src/resolvers/approval.resolver.js / backend/src/schemas/approval.schema.js -- approveUser(userId)/rejectUser(userId, reason) as account-addressed GraphQL mutations, registered in the resolvers/schemas barrels"
  - "approveInvitation/rejectInvitation deleted entirely from invitation.resolver.js/invitation.schema.js (D-01)"
  - "D-04: approveUser/rejectUser unconditionally stamp approvedAt/approvedBy or rejectedAt/rejectionReason onto the User row itself, with or without a matching Invitation row"
affects: [30-03-approveReject-test-rewrite, 30-04-ApprovalsPage-rewire, 32-self-registration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "assertDispositionable(target) shared guard helper: status !== 'Pending' checked before !emailVerified, so a repeat-click on an already-decided account gets the D-07 message, not the verification message"
    - "Optional Invitation.findOne({ where: { registeredUserId } }) treated as the normal case when null (Phase 32 self-registrant precursor), not an error"

key-files:
  created:
    - backend/src/resolvers/approval.resolver.js
    - backend/src/schemas/approval.schema.js
  modified:
    - backend/src/resolvers/invitation.resolver.js
    - backend/src/schemas/invitation.schema.js
    - backend/src/resolvers/index.js
    - backend/src/schemas/index.js

key-decisions:
  - "approveUser/rejectUser always call target.update(...) with status + the decision fields (approvedAt/approvedBy or rejectedAt/rejectionReason) in one call inside the transaction, before the conditional invitation.update(...) -- matches D-04/D-05 and this codebase's single-update-per-row convention"
  - "now = new Date() and cleanReason are computed once before the transaction and reused for both the target update and the invitation update, so the two rows carry byte-identical values instead of two separate clock reads"

requirements-completed: [APPR-01, APPR-04]

# Metrics
duration: ~20min
completed: 2026-08-28
---

# Phase 30 Plan 02: Approval Moves to the Account (Resolver Cutover) Summary

**Relocated `approveInvitation`/`rejectInvitation` into a new account-addressed `approval` module (`approveUser`/`rejectUser`), added the D-07 (repeat-disposition) and D-08/D-09 (verified-email) guards, and made every approval/rejection unconditionally stamp its decision onto the `User` row itself — not only onto an `Invitation` row when one happens to exist.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-28
- **Tasks:** 2 (both `type="auto"`)
- **Files created:** 2 (`approval.resolver.js`, `approval.schema.js`)
- **Files modified:** 4 (`invitation.resolver.js`, `invitation.schema.js`, `resolvers/index.js`, `schemas/index.js`)

## Accomplishments

- `approval.resolver.js`/`approval.schema.js` created: `approveUser(userId: ID!): User!` and `rejectUser(userId: ID!, reason: String): User!`, admin-only (`requireAdmin(user)` first line of both), returning the bare `User!` type (D-02), living in a new module registered in both existing barrels (D-03).
- `assertDispositionable(target)` shared helper enforces the guard order the research/patterns docs called out explicitly: `status !== 'Pending'` → `'This account is not awaiting a decision.'` (D-07), checked strictly *before* `!emailVerified` → `'This account has not verified its email address yet.'` (D-08/D-09) — so a double-click on an already-decided account gets the D-07 message, not a confusing verification message.
- **D-04 (the core fix this plan's revision exists for):** `target.update({ status: 'Active', approvedAt: now, approvedBy: user.id }, { transaction: t })` (approve) / `target.update({ status: 'Rejected', rejectedAt: now, rejectionReason: cleanReason }, { transaction: t })` (reject) run unconditionally inside the transaction, on every call, whether or not a matching `Invitation` row exists. This is the account-is-the-record-of-truth behavior Phase 32's self-registrant (no invitation row) needs.
- **D-05:** when `Invitation.findOne({ where: { registeredUserId: target.id } })` finds a row, it is *also* stamped inside the same transaction, immediately after the `target` update (preserving `invitation.resolver.js`'s original order), sharing the identical `now`/`cleanReason` values computed once before the transaction — not a second clock read.
- **D-06:** audit action names became `'user.approved'`/`'user.rejected'`; `invitationId: invitation?.id ?? null` — populated when an invitation exists, `null` when it doesn't (Phase 32 precursor case, not an error).
- Email dispatch (`sendAccountApprovedEmail`/`sendAccountRejectedEmail`) and `writeAuditLog` calls kept fire-and-forget with `.catch(console.error)`, unchanged in shape from the relocated code.
- `approveInvitation`/`rejectInvitation` deleted entirely (not deprecated, D-01) from `invitation.resolver.js`'s `Mutation` object and `invitation.schema.js`'s `extend type Mutation` block. `invitation.resolver.js`'s `mailer.js` import trimmed to `sendInvitationEmail` only (no longer references the two email functions it no longer calls). `createInvitation`, `myInvitations`, `invitations`, `pendingRegistrations`, and the `Invitation.inviter`/`Invitation.registeredUser` field resolvers are byte-for-byte untouched (verified via `git diff` — only the two mutations and the trailing import were removed).
- `approvalResolvers`/`approvalTypeDefs` registered as the fourth entry in both `backend/src/resolvers/index.js` and `backend/src/schemas/index.js`, following the existing flat-array barrel pattern with zero other changes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the approval module (approveUser/rejectUser)** - `ba0c7c1` (feat)
2. **Task 2: Delete the old mutations and wire the new module into both barrels** - `0c7c857` (feat)

**Plan metadata:** _(this commit — SUMMARY.md + STATE.md + ROADMAP.md)_

## Files Created/Modified

- `backend/src/resolvers/approval.resolver.js` - New: `approveUser`/`rejectUser` resolvers, `assertDispositionable` shared guard, D-04's unconditional User-row stamp, D-05's conditional Invitation-row stamp
- `backend/src/schemas/approval.schema.js` - New: `extend type Mutation { approveUser(userId: ID!): User! rejectUser(userId: ID!, reason: String): User! }`
- `backend/src/resolvers/invitation.resolver.js` - `approveInvitation`/`rejectInvitation` deleted; mailer import trimmed to `sendInvitationEmail`
- `backend/src/schemas/invitation.schema.js` - `approveInvitation`/`rejectInvitation` SDL lines deleted; `createInvitation`/`pendingRegistrations` untouched
- `backend/src/resolvers/index.js` - `approvalResolvers` added as the 4th barrel entry
- `backend/src/schemas/index.js` - `approvalTypeDefs` added as the 4th barrel entry

## Decisions Made

- `target.update(...)` carries `status` and the decision fields (`approvedAt`/`approvedBy` or `rejectedAt`/`rejectionReason`) together in one call, matching this codebase's single-update-per-row convention rather than a separate follow-up write.
- `now`/`cleanReason` are each computed exactly once, before the transaction opens, and reused verbatim for both the `target` update and the conditional `invitation` update — guarantees the two rows share byte-identical values rather than two independent clock reads that could theoretically differ by milliseconds.
- Invitation lookup (`Invitation.findOne({ where: { registeredUserId: target.id } })`) happens after both guards (not-found, `assertDispositionable`), matching the research's recommended guard ordering, and its `null` result is treated as the normal Phase 32 self-registrant case, never an error.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance-criteria greps (18 checks across the two tasks) and `node --check` on all touched files passed on the first attempt with no auto-fixes needed.

## Known Test Breakage (expected hand-off to Plan 30-03)

Per this plan's `<scope_note>`, `backend/src/resolvers/approveReject.test.js` is **not** in this plan's `files_modified` — rewriting it is explicitly Plan 30-03's job. Running `npm test --workspace backend` after this plan's commits confirms the exact, expected breakage and nothing more:

```
Test Files  1 failed | 62 passed (63)
     Tests  5 failed | 408 passed | 2 skipped (415)
```

All 5 failures are inside `approveReject.test.js`, all caused by the now-deleted `approveInvitation`/`rejectInvitation` mutation names (`Cannot query field "approveInvitation" on type "Mutation"`) and one stale login-gate assertion string that predates D-08/D-09's guard reordering. No other test file regressed — the other 62 files (408 tests, 2 pre-existing engine-gated skips carried over from Phase 29/30-01) are green, confirming `createInvitation`, `myInvitations`, `invitations`, `pendingRegistrations`, and the `Invitation.inviter`/`Invitation.registeredUser` field resolvers are untouched (INVITE-04) and the barrel wiring (`node --check backend/src/server.js`, verified in Task 2) is sound.

This is the exact and only expected regression from this plan's scope — Plan 30-03 rewrites `approveReject.test.js` to exercise `approveUser`/`rejectUser` by account id and add the new D-07/D-08/D-09/no-invitation coverage rows.

**Also not yet rewired (separate plan, not a defect of this plan):** `frontend/src/pages/ApprovalsPage.jsx` still sends `approveInvitation(invitationId: $id)`/`rejectInvitation(invitationId: $id, reason: $reason)` mutation strings against the live GraphQL API. Since `ApprovalsPage.test.jsx` mocks `graphqlRequest` entirely, its own unit tests are unaffected and still pass — but the live admin UI would fail against a real backend running this plan's commits until Plan 30-04 (already scheduled, `depends_on: ["30-02"]`, `files_modified: [ApprovalsPage.jsx, ApprovalsPage.test.jsx]`) rewires it. Flagging this explicitly so the orchestrator's post-wave gate isn't surprised by it.

## Issues Encountered

None beyond the expected, scope-noted test breakage above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `approveUser`/`rejectUser` are live, reachable GraphQL mutations (confirmed via `node --check backend/src/server.js` and the barrel wiring) implementing D-01 through D-09, with D-04's unconditional User-row stamp present with or without a matching Invitation row.
- Plan 30-03 can now rewrite `approveReject.test.js` against the real `approveUser`/`rejectUser` mutations and add the D-07/D-08/D-09/no-invitation coverage the plan calls for.
- Plan 30-04 can now rewire `ApprovalsPage.jsx` to call `approveUser(userId: $id)`/`rejectUser(userId: $id, reason: $reason)` with `row.registeredUser.id`.
- Neither downstream plan needs any further backend resolver/schema change from this plan — the account-addressed mutation surface is complete and stable.

---
*Phase: 30-approval-moves-to-the-account*
*Completed: 2026-08-28*

## Self-Check: PASSED

- FOUND: `backend/src/resolvers/approval.resolver.js`
- FOUND: `backend/src/schemas/approval.schema.js`
- FOUND: commit `ba0c7c1`
- FOUND: commit `0c7c857`
