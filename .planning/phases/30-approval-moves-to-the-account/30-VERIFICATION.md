---
phase: 30-approval-moves-to-the-account
verified: 2026-08-28T08:25:38Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 30: Approval Moves to the Account Verification Report

**Phase Goal:** Approve and reject act on the account itself — `User.status` — instead of on an invitation row, with approval/rejection emails, audit logging, and admin-only enforcement all preserved, and the existing invitation flow behaving exactly as it did before.
**Verified:** 2026-08-28T08:25:38Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | An admin approves a pending account by account id and that person can sign in; rejecting blocks sign-in with the existing message. | VERIFIED | `backend/src/resolvers/approval.resolver.js` — `approveUser(userId)`/`rejectUser(userId, reason)` operate on `models.User.findByPk(userId)` and write `status: 'Active'`/`'Rejected'` directly onto the `User` row (no `Invitation` involvement required). `backend/src/resolvers/approveReject.test.js:165-173` proves a rejected user's subsequent `login` throws the pre-existing `'Your registration was not approved.'` message. Confirmed by independently re-running the full backend suite (421 passed/2 skipped) myself, not by trusting SUMMARY.md. |
| 2 | Approval and rejection emails still send, and both actions are written to the audit log with the acting admin and target account. | VERIFIED | `approval.resolver.js:50-58,92-101` fires `sendAccountApprovedEmail`/`sendAccountRejectedEmail` and `writeAuditLog(models, { action: 'user.approved'/'user.rejected', actorUserId: user.id, targetUserId: target.id, invitationId })` unconditionally. Proven by passing tests asserting `sendAccount*Email` call counts and `AuditLog.findAll` row counts/fields (`approveReject.test.js:40-70,133-163`). Independently re-ran these exact test files myself (21/21 passed). |
| 3 | A non-admin calling approve or reject is refused server-side. | VERIFIED | `requireAdmin(user)` is the first line of both `approveUser` and `rejectUser` (`approval.resolver.js:21,67`), throwing `'Admin access is required.'` before any DB read. `approveUser` has a checked-in regression test (`approveReject.test.js:72-77`); **`rejectUser` does not** (see Anti-Patterns/Warnings — WR-03). I closed this verification gap myself: wrote and ran a temporary probe test directly against the live resolver (not a mock) asserting a `USER`-role caller and an unauthenticated caller are both refused by `rejectUser` with the exact expected messages; both passed, then the probe file was deleted (working tree confirmed clean afterward). The underlying behavior is proven true; the checked-in test suite does not yet prove it for the reject path — flagged as an open regression-test gap, not a functional failure. |
| 4 | Existing invitation rows still render with their inviter, status, and timestamps — including ones sent by non-admin members. | VERIFIED | `git diff <pre-phase-30-baseline> -- backend/src/resolvers/invitation.resolver.js backend/src/schemas/invitation.schema.js` shows the *only* changes are deletion of `approveInvitation`/`rejectInvitation` and trimming an unused mailer import — `createInvitation`, `myInvitations`, `invitations`, `pendingRegistrations`, and the `Invitation.inviter`/`Invitation.registeredUser` field resolvers are byte-for-byte untouched. `createInvitation.test.js:108-120` (`'invitations (all) requires admin and resolves the inviter'`) exercises exactly the non-admin-inviter case end-to-end. Frontend `InvitePage.jsx` (unmodified) still renders `status`/`createdAt` for a caller's own sent invitations. |
| 5 | The backend suite passes with the invitation flow behaving exactly as it did before. | VERIFIED | Independently ran `npm test --workspace backend` myself: **63 files, 421 passed, 2 skipped, 0 failed** — matches SUMMARY's claimed numbers exactly (not taken on faith). Also ran `npm test --workspace frontend` myself: **42 files, 440 passed, 0 failed** — matches SUMMARY's claimed numbers exactly. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `backend/src/models/User.js` | `approvedAt`/`approvedBy`/`rejectedAt`/`rejectionReason` nullable fields | VERIFIED | Read directly — all four fields present, matching `Invitation.js`'s shape, `approvedBy` correctly unassociated `INTEGER.UNSIGNED`. |
| `backend/migrations/manual/019-add-users-approval-columns.sql` | Portable `ALTER TABLE` adding the four columns, no FK | VERIFIED | Read directly — exact DDL as specified, no `FOREIGN KEY`. Independently ran `DESCRIBE users;` against the real local dev DB (`portofolio`) myself and confirmed all four columns exist with the correct types/nullability — not taken on the human-approval message alone. |
| `backend/src/resolvers/approval.resolver.js` | `approveUser`/`rejectUser` resolvers, `requireAdmin` first line, D-04 unconditional account stamp | VERIFIED | Read directly. Also confirms a fix beyond the original plan text: read+guard now happens **inside** the transaction under `lock: t.LOCK.UPDATE` (CR-01 fix, commit `35306b9`), closing a TOCTOU race the code review found and reproduced. |
| `backend/src/schemas/approval.schema.js` | `approveUser(userId: ID!): User!` / `rejectUser(userId: ID!, reason: String): User!` | VERIFIED | Read directly, exact SDL. |
| `backend/src/resolvers/index.js` / `backend/src/schemas/index.js` | `approvalResolvers`/`approvalTypeDefs` registered | VERIFIED | Read directly — both barrels include the new module as the 4th entry. |
| `frontend/src/pages/ApprovalsPage.jsx` | Calls `approveUser`/`rejectUser` by `row.registeredUser.id`; D-11 disabled state | VERIFIED | Read directly. Also confirms the WR-01 fix (orphaned/null `registeredUser` rows now correctly disable both buttons via a `blocked = unverified || orphaned` guard, commit `090ffe6`) — the plan-specified `unverified`-only guard would have left this case exploitable. |
| `backend/src/resolvers/approveReject.test.js` | Full coverage of D-01/D-04/D-05/D-06/D-07/D-08/D-09 | PARTIAL (functional pass, coverage gap) | All specified new coverage rows present and passing, **except** no `rejectUser` non-admin/unauthenticated test exists (WR-03, confirmed by direct read of the file — `describe('rejectUser')` has 5 `it()`s, none asserting authorization). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `resolvers/index.js` | `approval.resolver.js` | `approvalResolvers` array entry | WIRED | Confirmed by direct read. |
| `schemas/index.js` | `approval.schema.js` | `approvalTypeDefs` array entry | WIRED | Confirmed by direct read. |
| `approval.resolver.js` | `models.Invitation` | `findOne({ where: { registeredUserId } })` | WIRED | Confirmed by direct read; correctly treats `null` as the normal no-invitation case. |
| `approval.resolver.js target.update(...)` | `User.js` decision fields | `target.update({ status, approvedAt/approvedBy or rejectedAt/rejectionReason }, { transaction: t })` | WIRED | Confirmed by direct read and by test assertions (`reload()` on the `User` row) in `approveReject.test.js`. |
| `ApprovalsPage.jsx` | `approveUser`/`rejectUser` mutations | `graphqlRequest(APPROVE/REJECT, { id: row.registeredUser.id })` | WIRED | Confirmed by direct read and by `ApprovalsPage.test.jsx`'s fixture-distinct-id assertions (`'9'` vs `'5'`), independently re-run (green). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Real dev DB has the four approval columns | `mysql portofolio -e "DESCRIBE users;"` | `approvedAt`, `approvedBy`, `rejectedAt`, `rejectionReason` all present with correct types/nullability | PASS |
| Targeted approval + invitation-creation tests pass live | `npm test --workspace backend -- src/resolvers/approveReject.test.js src/resolvers/createInvitation.test.js` | 2 files, 21 tests passed | PASS |
| Full backend suite green | `npm test --workspace backend` | 63 files, 421 passed, 2 skipped | PASS |
| Full frontend suite green | `npm test --workspace frontend` | 42 files, 440 passed | PASS |
| `rejectUser` refuses non-admin/unauthenticated callers (no checked-in test exists for this) | Temporary probe test executed directly against the live resolver via `graphql()`, then deleted | Both assertions passed (`'Admin access is required.'`, `'You must be logged in to perform this action.'`); target account status unchanged | PASS (evidence gathered by verifier directly, since no permanent regression test exists) |
| `git diff` confirms invitation resolver/schema untouched beyond the intended deletion | `git diff 035912b -- backend/src/resolvers/invitation.resolver.js backend/src/schemas/invitation.schema.js` | Only the two mutation deletions + one import trim; zero other changes | PASS |
| `git diff` confirms login-gate messages untouched | `git diff 035912b -- backend/src/resolvers/user.resolver.js` | Only one unrelated hunk (Ge'ez fields from an earlier phase); login/`Pending`/`Rejected`/`Disabled` messages untouched | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| APPR-01 | 30-01, 30-02, 30-03, 30-04 | Admin approves/rejects the account directly, not an invitation | SATISFIED | `approveUser`/`rejectUser` operate on `User.findByPk(userId)`; verified end-to-end. |
| APPR-03 | 30-02, 30-03 | Approving activates + emails; rejecting blocks sign-in + emails (with reason) | SATISFIED | Email dispatch + login-gate tests pass; verified by direct code read and test run. |
| APPR-04 | 30-02, 30-03 | Admin-only, enforced server-side, audit-logged with actor + target | SATISFIED | `requireAdmin` first line of both mutations (confirmed functionally for both, including a gap in checked-in test coverage for `rejectUser` — see WR-03). Audit rows confirmed via tests. |
| APPR-05 | 30-03 | Login gate unchanged (verified email + Active status, distinct pending/rejected/disabled messages) | SATISFIED | `git diff` shows zero changes to `login`'s gate logic since the pre-phase-30 baseline. **Note:** `.planning/REQUIREMENTS.md` still shows this requirement's checkbox unchecked (`- [ ] **APPR-05**`) even though `30-03-SUMMARY.md`'s frontmatter lists `requirements-completed: [..., APPR-05, ...]` and no commit after 30-02 touched `REQUIREMENTS.md`. This is a documentation-tracking lag, not a functional gap — flagged for correction before milestone completion. |
| INVITE-04 | 30-02, 30-03, 30-04 | Pre-existing invitation rows (incl. non-admin senders) remain readable/rendered, unbroken | SATISFIED | `git diff` confirms byte-for-byte preservation of the query/field-resolver surface; `createInvitation.test.js` and `InvitePage.jsx` both exercise/render the non-admin-inviter case. |

No orphaned requirements: all 5 IDs traced to Phase 30 in `REQUIREMENTS.md` are claimed by at least one of the four plans' frontmatter, and vice versa.

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) in any file this phase modified — scanned directly, zero matches.

Findings below are carried from `30-REVIEW.md` (the phase's own code review), independently re-confirmed by me against the current code state (not taken on the review document's word alone):

| File | Finding | Severity | Status | Impact |
|---|---|---|---|---|
| `approval.resolver.js` | CR-01: D-07 guard was TOCTOU-bypassable (read+check outside the transaction, no row lock) | was Critical | FIXED (`35306b9`) — confirmed by direct read: guard now runs under `lock: t.LOCK.UPDATE` inside the transaction, and by the 3 concurrency regression tests in `approveReject.test.js` (`describe('concurrent disposition (CR-01)')`), which I re-ran and confirmed passing. | None remaining — closed. |
| `ApprovalsPage.jsx` | WR-01: orphaned (`registeredUser: null`) rows rendered Approve/Reject enabled, then threw on click | was Warning | FIXED (`090ffe6`) — confirmed by direct read: `orphaned`/`blocked` guard now covers this case, and `ApprovalsPage.test.jsx`'s dedicated test (`'disables Approve and Reject for a row with no registered user (WR-01)'`) passes. | None remaining — closed. |
| `approveReject.test.js` | WR-05: two `AuditLog` assertions raced the fire-and-forget write instead of polling | was Warning | FIXED (`ce48cc8`) — confirmed by direct read: all `AuditLog` assertions now use `vi.waitFor`. | None remaining — closed. |
| `approveReject.test.js` | **WR-03: `rejectUser` has no authorization test** (open) | Warning | OPEN | Functionally verified true by me via a live probe (see Behavioral Spot-Checks), but the checked-in suite does not regression-guard it. This is the same class of gap flagged in this project's own history (Phase 14: "green tests missed 4 authz blockers; non-admin paths were untested"). Recommend adding the mirror test before closing out this phase's test-debt. |
| `approveReject.test.js` | WR-04: no test discriminates D-07-before-D-08 guard ordering (open) | Warning | OPEN | Swapping the two guard lines in `assertDispositionable` would keep the suite green. Confirmed by direct read of the test file — no fixture combines `status !== 'Pending'` AND `emailVerified: false`. |
| `approval.resolver.js` / `invitation.resolver.js` | WR-02: an invitation with `registeredUserId: NULL` (reachable via `ON DELETE SET NULL`) can no longer be dispositioned by any mutation — permanent zombie queue row | Warning | OPEN, latent | No user-deletion path exists anywhere in the current API, so this is not reachable today — tracked debt, not a live regression. |
| `backend/migrations/manual/019-*.sql` / `models/index.js` | WR-06: if migration 019 is skipped on an already-provisioned DB, the app boots successfully then fails every authenticated request with no clear error | Warning | OPEN | Real dev DB already has the columns (independently confirmed by me via `DESCRIBE`); this is a deployment-hygiene risk for other environments, not a functional defect in this phase's delivered code. |
| `approval.resolver.js` / `mailer.js` | WR-07: admin-supplied rejection `reason` is interpolated unescaped into the applicant's HTML email | Warning | OPEN | Does not break SC-2's literal claim ("emails still send... written to audit log") but is a real content-injection risk worth closing given `reason` is new, admin-authored, free-text input flowing into outbound HTML. |
| `ApprovalsPage.jsx` | WR-10: `submitReject` dereferences `rejectTarget` before the `try` block — a double-click during the dialog's exit transition throws unhandled | Warning | OPEN | Minor frontend robustness gap; not part of any of this phase's 5 success criteria. |
| Various | IN-01 through IN-06 | Info | OPEN | Non-blocking notes (audit-action rename continuity, unbounded `reason` length, etc.) — see `30-REVIEW.md` for full text. |

### Human Verification Required

None. All 5 success criteria were verified via direct code inspection, git diff against the pre-phase baseline, independently-executed automated test suites, and one verifier-authored, executed-and-deleted probe test (for the WR-03 gap). The one `checkpoint:human-verify` task in this phase (Plan 30-01, Task 3 — real-DB migration apply) was already resolved during execution and I independently re-confirmed its result via `DESCRIBE users;` against the real database myself, rather than trusting the "approved" response alone.

### Gaps Summary

No gaps block the phase goal. All 5 roadmap success criteria are independently verified true in the codebase, not merely claimed in SUMMARY.md. The core cutover (account-addressed `approveUser`/`rejectUser`, admin-only enforcement, email + audit preservation, and byte-for-byte invitation-flow preservation) is real, tested, and — per the phase's own code review — was further hardened post-review to close a critical concurrency bug (CR-01) and a frontend null-dereference bug (WR-01), both confirmed fixed by direct inspection.

Two items are worth carrying forward as tracked debt rather than phase-blocking gaps:

1. **WR-03** — `rejectUser` has no checked-in non-admin/unauthenticated regression test, even though the behavior itself is correct (verified live by this verifier). Given this project's specific prior incident (Phase 14: authz gaps hidden by green tests), this is worth closing promptly — it is a one-test addition, not a design change.
2. **APPR-05's `REQUIREMENTS.md` checkbox** is unchecked despite the requirement being functionally satisfied and claimed complete in `30-03-SUMMARY.md`'s frontmatter — a documentation bookkeeping gap to fix before milestone completion, not a functional one.

Neither item required a status of `gaps_found`: both are either (a) functionally verified true by independent means despite a test-coverage or documentation shortfall, or (b) explicitly tracked, latent, out-of-reach-today debt already documented in `30-REVIEW.md`.

---

_Verified: 2026-08-28T08:25:38Z_
_Verifier: Claude (gsd-verifier)_
