# Phase 30: Approval Moves to the Account - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Approve and reject stop addressing an `Invitation` row and address the account itself — `User.status`, by account id — because the self-registrant arriving in Phase 32 has no invitation to act on. Approval/rejection emails, audit logging, admin-only server-side enforcement, and the login gate all keep working. The invitation flow's happy path is unchanged.

**In scope:** the account-based `approveUser`/`rejectUser` mutations and the schema they need, the migration that gives an account somewhere to record the decision, rewiring the existing admin approvals UI to call them, and the tests that pin all of it.

**Not in scope:** the admin queue's shape and content (Phase 33), invitations becoming admin-only (Phase 31), tokenless registration (Phase 32), the open-registration switch (Phase 34).

</domain>

<decisions>
## Implementation Decisions

### Mutation cutover
- **D-01:** `approveInvitation` and `rejectInvitation` are deleted, not deprecated. `approveUser(userId: ID!)` and `rejectUser(userId: ID!, reason: String)` replace them, and `ApprovalsPage` plus its tests are rewired in this phase. One API shape, one frontend cutover, no wrappers carried into Phases 31–34.
- **D-02:** Both mutations return the updated `User!`, matching `linkUserToMember` and `updateUser` (`backend/src/schemas/user.schema.js:66-67`). Not a payload type, not a Boolean.
- **D-03:** The code lives in a new `approval` module — `backend/src/resolvers/approval.resolver.js` and `backend/src/schemas/approval.schema.js` — registered in the existing barrels (`backend/src/resolvers/index.js`, `backend/src/schemas/index.js`). Approval grows in Phases 33 and 34 and needs one home; `user.resolver.js` is already 464 lines and `invitation.resolver.js` should stay about invitations.

### Where the decision is recorded
- **D-04:** Migration `backend/migrations/manual/019-add-users-approval-columns.sql` adds `approvedAt`, `approvedBy`, `rejectedAt`, `rejectionReason` to `users` — the same four facts `invitations` already stores. A self-registrant has no invitation row, so the account needs its own record.
- **D-05:** When the account **does** have an invitation, that row is still stamped (`status: 'Approved'`/`'Rejected'`, `approvedAt`/`approvedBy`/`rejectedAt`/`rejectionReason`) inside the same transaction as the `User.status` update — preserving today's behaviour at `backend/src/resolvers/invitation.resolver.js:110-114`. Historical and in-flight invitation rows keep reading exactly as they do now (SC-4), and `pendingRegistrations` stays correct without further change.
- **D-06:** Audit actions become `user.approved` and `user.rejected`. `invitationId` is still populated when an invitation exists, so the link is not lost. The audit log is append-only, so existing `invitation.approved`/`invitation.rejected` rows keep their names — that is accurate history, not drift.

### Approve/reject preconditions
- **D-07:** Only `status === 'Pending'` accounts may be approved or rejected. Anything else throws a clear error ("This account is not awaiting a decision."), so a repeat click fails loudly instead of silently re-approving or re-sending email. There is no un-reject.
- **D-08:** `approveUser` refuses an account whose email is not verified. Approval asserts "this person is family"; an unproven address has not been shown to belong to them.
- **D-09:** `rejectUser` requires a verified email too — one symmetric rule for both actions.

### Queue and UI in this phase
- **D-10:** `pendingRegistrations` stays invitation-shaped. `ApprovalsPage` keeps its current query and passes the `registeredUser.id` it already fetches to the new mutations. The admin keeps the context they judge on — `invitedName`, `relationshipToFamily`, `invitationNote`, `inviter` all live on the Invitation row and have no account-side equivalent until Phase 32 adds the REG-03 relationship note. Phase 33 builds the real queue once that data exists.
- **D-11:** Queue rows whose registrant has not verified stay visible, with a "waiting for email verification" state and approve/reject disabled. `ApprovalsPage` already fetches `registeredUser { emailVerified }` (`frontend/src/pages/ApprovalsPage.jsx:32`), so no query change is needed and no button ships that is known to fail.

### Flags for the planner
- **F-01 (SC-5 reading):** D-08 and D-09 are a deliberate, narrow change to invitation-flow behaviour — an admin who today approves a registrant before they verify will now get an error. SC-5's "the invitation flow behaving exactly as it did before" is therefore read as *the happy path is unchanged*, and the new refusal must be pinned by its own test rather than treated as a regression.
- **F-02 (dead-end registrations):** Under D-09, an unverified registration can never be dispositioned — it sits at `Pending` indefinitely. Acceptable for this phase; it wants a pruning or expiry story once anyone can register (Phase 32 onward). Recorded as a deferred idea below.
- **F-03 (migration application):** The project's convention is portable manual SQL proven against a real local MariaDB before production apply (see the v3.0 `018-` precedent, D-04 of that milestone). Production apply is a separate, explicit step — not something the phase silently assumes.

### Claude's Discretion
- Error message wording beyond the D-07 example, and the exact copy of the D-11 "waiting for email verification" state.
- Whether `approvedBy` carries a real FK constraint to `users.id` or is a plain unsigned int, matching how `audit_logs` already references actors.
- Test file placement and naming — the existing `backend/src/resolvers/approveReject.test.js` is the natural home to move/rewrite rather than a new parallel file.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` §"Phase Details" → "### Phase 30: Approval Moves to the Account" — goal, dependencies, and the five success criteria this phase is judged on.
- `.planning/REQUIREMENTS.md` — APPR-01, APPR-03, APPR-04, APPR-05 and INVITE-04 are this phase's requirements; the "The two paths" table at the top defines what approval means after v4.1.
- `.planning/PROJECT.md` §"Current Milestone: v4.1 Open Registration with Approval" — the "Approve the User, not an invitation" rationale, and the explicit out-of-scope list (no mid-invite migration; login gate, `/pending`, and `/link-accounts` untouched).

### Code the phase changes
- `backend/src/resolvers/invitation.resolver.js` — `approveInvitation`/`rejectInvitation` (lines 96–171) are the behaviour being moved; the transaction shape, email dispatch, and audit call are the reference implementation.
- `backend/src/schemas/invitation.schema.js` — the mutations being removed and the `pendingRegistrations` query that stays.
- `backend/src/models/User.js:52-58` — the `status` ENUM that is now the subject of approval.
- `backend/src/models/Invitation.js` — the four decision fields the new `users` columns mirror.
- `backend/src/utils/audit.js` — `writeAuditLog`'s signature (`action`, `actorUserId`, `invitationId`, `targetUserId`, `metadata`).
- `backend/src/services/mailer.js` — `sendAccountApprovedEmail` / `sendAccountRejectedEmail`, reused unchanged.
- `frontend/src/pages/ApprovalsPage.jsx` — the admin surface being rewired.

### Codebase conventions
- `.planning/codebase/CONVENTIONS.md` — naming, error-handling, and module conventions the new `approval` module must match.
- `.planning/codebase/TESTING.md` — how backend resolver tests and frontend component tests are structured.
- `backend/migrations/manual/` — the `NNN-description.sql` migration convention; `018-add-family-members-geez-names.sql` is the most recent precedent.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sendAccountApprovedEmail` / `sendAccountRejectedEmail` (`backend/src/services/mailer.js`): already take `{ to, name, reason }` — the account has all three, so the email calls move across unchanged.
- `writeAuditLog` (`backend/src/utils/audit.js`): already accepts `targetUserId` and `invitationId` independently, so D-06's account-targeted entries need no helper change.
- `requireAdmin` (`backend/src/utils/auth.js`): the existing server-side guard, reused verbatim for APPR-04 and SC-3.
- `ApprovalsPage` already fetches `registeredUser { id name email emailVerified }` (`frontend/src/pages/ApprovalsPage.jsx:32`) — every field D-10 and D-11 need is already in the response.

### Established Patterns
- Approve/reject already flip `User.status` inside a `sequelize.transaction` alongside the invitation update (`backend/src/resolvers/invitation.resolver.js:110-114`). D-05 keeps that transaction; only the entry point and the lookup direction change.
- Email and audit calls are fire-and-forget with `.catch(console.error)` so they never break the primary operation — keep this.
- Resolvers throw plain `Error`s with user-facing messages; Apollo surfaces them. Guard clauses run at the top of the resolver body.
- Schema and resolver modules are aggregated through barrel `index.js` files, which is exactly what D-03's new module plugs into.
- Migrations are hand-written portable SQL under `backend/migrations/manual/`, numbered sequentially — `019-` is next.

### Integration Points
- `backend/src/resolvers/index.js` and `backend/src/schemas/index.js` — register the new `approval` module.
- `backend/src/resolvers/approveReject.test.js` — the existing coverage of the behaviour being moved; it is the natural place to pin D-07, D-08, D-09 and SC-3.
- `frontend/src/pages/ApprovalsPage.test.jsx` and `frontend/src/pages/InvitationsPage.test.jsx` — both reference the removed mutations and must move with D-01.
- `backend/src/models/User.js` — where the new `users` columns get declared on the model alongside migration `019` (field definitions live here, not in the `models/index.js` barrel, which only wires associations).

</code_context>

<specifics>
## Specific Ideas

- Approval is to mean exactly one thing after v4.1 — *is this stranger actually family?* — which is why the decision belongs on the account and not on a row that only exists for invited people.
- The asymmetry between approve and reject was considered and deliberately rejected: one rule ("a decision requires a verified address") is preferred over two, even though it means an unverified junk registration cannot be closed out.
- The admin must not lose the context they judge on. That, more than anything, is why the queue stays invitation-shaped this phase (D-10) — the relationship note that replaces it does not exist until Phase 32.

</specifics>

<deferred>
## Deferred Ideas

- **Un-reject** — under D-07 a `Rejected` account has no path back, and no admin surface reaches one (`/approvals` redirects to `/invitations`). A future phase could allow `Rejected → Active` alongside a surface that lists non-pending accounts.
- **Pruning unverified registrations** — F-02's dead-end accounts. Worth an expiry or admin-purge story once public signup is open (Phase 32 onward), not before.
- **Account-shaped approval queue** — deliberately Phase 33's job (APPR-02), once the REG-03 relationship note gives an account-side equivalent of the invitation's context.

</deferred>

---

*Phase: 30-Approval Moves to the Account*
*Context gathered: 2026-08-27*
