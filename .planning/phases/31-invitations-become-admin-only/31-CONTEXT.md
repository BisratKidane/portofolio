# Phase 31: Invitations Become Admin-Only - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Every invitation becomes admin-issued. `createInvitation` refuses a non-admin server-side, the `/invitations` route and its nav entry go admin-only, and — because the admin who sent the invitation has already vouched for the invitee — an invited registrant is promoted to `Active` when they verify their email, never entering the approval queue.

**In scope:** the `createInvitation` and `myInvitations` guards; the `/invitations` route and nav gating; the `Pending → Active` promotion inside `verifyEmail`; the narrowed `pendingRegistrations` filter and removal of the now-unreachable disabled-row rendering; the invited-path email and copy corrections; and the tests that pin all of it, including the adversarial non-admin refusal.

**Not in scope:** tokenless registration (Phase 32); the account-shaped approval queue and the relationship note that feeds it (Phase 33); the open-registration switch (Phase 34); the login gate, `/pending`, and `/link-accounts`, which stay untouched per PROJECT.md; and any migration for users stranded mid-invite — production was checked (3 Active, 0 Pending) and nobody is in that state.

</domain>

<decisions>
## Implementation Decisions

### Admin-only invitations (INVITE-01, INVITE-02)
- **D-01:** `createInvitation` swaps `requireFamilyAccess` for `requireAdmin` (`backend/src/resolvers/invitation.resolver.js:35`). The existing "Admin access is required." message stands. `requireFamilyAccess` already returned early for ADMIN accounts (`backend/src/utils/auth.js:49`), so admin behaviour is byte-identical — only the non-admin path changes.
- **D-02:** `myInvitations` moves to `requireAdmin` as well. After this phase every invitation is admin-issued, so a non-admin's list can only ever return legacy rows they cannot act on. Locking it server-side rather than leaning on the hidden nav is deliberate: this codebase has a track record of authorization gaps surviving green tests (Phases 14, 15, 30). `invitations` and `pendingRegistrations` are already `requireAdmin`.
- **D-03:** `/invitations` moves under `<ProtectedRoute allowedRoles={['ADMIN']}>` and the nav button is wrapped in the same `user.role === 'ADMIN'` check `/link-accounts` already uses (`frontend/src/App.jsx:38-41`, `frontend/src/components/AppLayout.jsx:80`). A non-admin who types the URL is redirected to `/dashboard` by the existing guard — no new component, no explanatory page, no new route shape. The `/invite` and `/approvals` redirect routes move with it.

### Activation of invited accounts (INVITE-03)
- **D-04:** `register` keeps creating the account as `status: 'Pending'`. `verifyEmail` promotes it to `Active`. The invariant "Active means verified **and** vouched" is preserved — no account is ever `Active` before its address is proven.
- **D-05:** The promotion condition is the existence of an `Invitation` row with `registeredUserId = user.id`, looked up inside `verifyEmail`'s existing transaction. No migration and no account-side provenance column: `register` already writes that FK (`backend/src/resolvers/user.resolver.js:152`) and `fk_invitations_registered_user` exists. The lookup keys on the FK alone, not on `Invitation.status`, so D-08 cannot break it.
- **D-06:** Promote **only** from `status === 'Pending'`. A `Rejected` or `Disabled` account that verifies is never resurrected.
- **D-07:** The promotion commits inside the same transaction as token consumption and the ADMIN-slot decision, so verification and activation are one atomic unit. The existing deadlock-retry path stays safe — nothing commits on rollback, so the retry remains idempotent.

### The approval queue (SC-4)
- **D-08:** `Invitation.status` stays `'Registered'` after registration. That is accurate history, and it means no ENUM change and no second migration this milestone.
- **D-09:** `pendingRegistrations` narrows from `status = 'Registered'` to `status = 'Registered'` **and** the registered account is still `Pending` **and** `emailVerified`. Empty by construction under D-04/D-05: an unverified invitee fails the verified test, and a verified one is already `Active`. The filter now carries exactly the meaning Phase 33's account-shaped queue will need.
- **D-10:** `ApprovalsPage` stays mounted and renders its existing empty state; `approveUser`/`rejectUser` stay wired and tested, ready for Phase 32. Phase 30's D-11 "waiting for email verification" disabled-row rendering becomes unreachable under D-09 and is removed rather than shipped as dead code.

### Emails and copy
- **D-11:** `notifyAdminsOfPendingRegistration` is no longer called on the invited path. The helper and `sendPendingRegistrationEmail` stay in place, untouched, for Phase 32 to reuse for self-registrants — the audience its copy already describes.
- **D-12:** No approved-account email on the invited path. Verification promotes the account and hands back a working token; there is nothing to announce. `sendAccountApprovedEmail` stays the approval path's email only.
- **D-13:** `register`'s success message stops promising admin review — it says verification is the only remaining step. Phase 32 adds the tokenless variant to the same return branch.

### Flags for the planner
- **F-01 (SC-1 test actor):** the adversarial test must call `createInvitation` as a **linked, Active, non-admin member** — the exact actor INVITE-01 names. An unlinked account would have been refused by the old `requireFamilyAccess` guard too and would prove nothing about the new one.
- **F-02 (post-verification routing):** `frontend/src/pages/VerifyEmail.jsx:25` routes to `/dashboard` when `status === 'Active'` and to `/pending` otherwise. Today an invited registrant always landed on `/pending`; after D-04 they hit `/dashboard` and are then redirected to `/pending` by `ProtectedRoute` unless an admin has already linked them. Same destination, different path — component tests asserting the old navigation need updating, and this is not a change to `/pending` itself.
- **F-03 (ordering inside verifyEmail):** the resolver ends with `await user.reload()` then `return { token: signToken(user), user }` (`backend/src/resolvers/user.resolver.js:289-290`). The promotion must be committed before that reload, or the returned user and token will describe a `Pending` account and SC-3 will fail at the last line.
- **F-04 (dead-end registrations narrow but persist):** Phase 30's F-02 still applies. Under D-09 an unverified invited account is invisible to the queue, and if it never verifies it sits at `Pending` indefinitely with no disposition path. Still wants a pruning or expiry story in a later phase.

### Claude's Discretion
- The exact wording of D-13's success message, and of any refusal message beyond `requireAdmin`'s existing "Admin access is required."
- Whether the auto-activation writes its own audit action (e.g. `invitation.activated`) alongside the existing `invitation.registered`, or writes nothing — the log is append-only and the registration is already recorded.
- Whether `InvitePage.jsx` and `InvitationsPage.jsx` stay two components or collapse into one now that only admins see them; and test-file placement for the new coverage.
- How D-09's narrowed filter is expressed in Sequelize — an `include` on the registered user with a `where`, or a two-step query.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` §"Phase Details" → "### Phase 31: Invitations Become Admin-Only" — goal, dependency on Phase 30, and the four success criteria this phase is judged on.
- `.planning/REQUIREMENTS.md` — INVITE-01, INVITE-02, INVITE-03 are this phase's requirements (INVITE-04 was delivered in Phase 30). The "The two paths" table defines what invited-vs-self means after v4.1.
- `.planning/PROJECT.md` §"Current Milestone: v4.1 Open Registration with Approval" — the invited/self-registered table, the "approval only for self-registrations" rationale, and the explicit out-of-scope list (no mid-invite migration; login gate, `/pending`, and `/link-accounts` untouched).
- `.planning/phases/30-approval-moves-to-the-account/30-CONTEXT.md` — the locked approval design this phase builds on: D-01/D-03 (`approveUser`/`rejectUser` in `backend/src/resolvers/approval.resolver.js`), D-07/D-08/D-09 (approve/reject preconditions), D-10 (queue stays invitation-shaped until Phase 33), and D-11 (the disabled-row rendering that D-10 here removes).

### Code the phase changes
- `backend/src/resolvers/invitation.resolver.js` — `myInvitations` (15-18), `pendingRegistrations` (25-28), and `createInvitation` (34-74): all three guards and the queue filter live here.
- `backend/src/resolvers/user.resolver.js` — `register` (113-178), `verifyEmail` (242-291), and the `notifyAdminsOfPendingRegistration` helper (22-39).
- `backend/src/utils/auth.js` — `requireAdmin` / `requireFamilyAccess` (42-51) and the `getUserFromRequest` gate (29-33) that already blocks unverified and non-`Active` accounts independently.
- `backend/src/models/User.js:56-60` — the `status` ENUM (`Pending`, `Active`, `Rejected`, `Disabled`) that D-04/D-06 operate on.
- `backend/src/models/Invitation.js` — `registeredUserId`, `registeredAt`, and the `status` ENUM D-08 leaves alone.
- `frontend/src/App.jsx:28-41` — the two route guard groups; `/invitations` moves from the first to the second.
- `frontend/src/components/AppLayout.jsx:72-88` — the unconditional `/invitations` nav button and the ADMIN-gated `/link-accounts` button that D-03 mirrors.
- `frontend/src/pages/InvitationsPage.jsx`, `frontend/src/pages/InvitePage.jsx`, `frontend/src/pages/ApprovalsPage.jsx` — the composed invite surface, the form plus `myInvitations` list, and the queue section D-10 keeps.
- `frontend/src/components/ProtectedRoute.jsx:16-18` — the guard order (`!user` → `/login`, unlinked non-admin → `/pending`, wrong role → `/dashboard`) that D-03 relies on.

### Existing test coverage to extend
- `backend/src/resolvers/createInvitation.test.js` — where SC-1's adversarial non-admin refusal belongs.
- `backend/src/resolvers/register.test.js` and `backend/src/resolvers/verifyEmail.test.js` — the invited registration and promotion path (SC-3).
- `backend/src/resolvers/approveReject.test.js` — Phase 30's approve/reject coverage; the queue-filter change (SC-4) is adjacent to it.
- `frontend/src/pages/InvitationsPage.test.jsx`, `frontend/src/pages/InvitePage.test.jsx`, `frontend/src/pages/ApprovalsPage.test.jsx`, `frontend/src/components/ProtectedRoute.test.jsx` — the surfaces SC-2 and D-10 change.

### Codebase conventions
- `.planning/codebase/CONVENTIONS.md` — naming, error handling, and module conventions.
- `.planning/codebase/TESTING.md` — how backend resolver tests and frontend component tests are structured.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin` (`backend/src/utils/auth.js:42-45`) — the guard D-01 and D-02 both reuse verbatim; no new helper needed.
- `<ProtectedRoute allowedRoles={['ADMIN']}>` (`frontend/src/App.jsx:38`) — already in use for `/link-accounts`; D-03 adds `/invitations` to the same group.
- The `user.role === 'ADMIN' &&` nav wrapper (`frontend/src/components/AppLayout.jsx:80`) — the exact pattern D-03 applies to the Invitations button.
- `sendPendingRegistrationEmail` and `notifyAdminsOfPendingRegistration` — left intact by D-11 precisely because Phase 32 needs them unchanged.
- `ApprovalsPage`'s existing empty state — D-10 relies on it rather than adding a new one.

### Established Patterns
- Guards are thrown-error functions called at the top of the resolver body, not middleware — `requireAdmin(user)` on line one.
- `verifyEmail` already runs verify-and-promote inside one `sequelize.transaction` with a `FOR UPDATE` read and a single deadlock retry (`backend/src/resolvers/user.resolver.js:259-288`). D-04's promotion joins that transaction; it does not open a second one.
- Email and audit calls are fire-and-forget with `.catch(console.error)` so they never fail the primary operation.
- Resolvers throw plain `Error`s with user-facing messages; Apollo surfaces them to the client.
- TDD red-green-refactor, backend before frontend — the project's convention for every security-relevant change.

### Integration Points
- `backend/src/resolvers/invitation.resolver.js` — all three guard/filter changes land in this one file.
- `backend/src/resolvers/user.resolver.js` — `register` (copy + dropped notification) and `verifyEmail` (promotion) are the two touch points.
- `frontend/src/App.jsx` and `frontend/src/components/AppLayout.jsx` — the route move and the nav gate.
- `frontend/src/pages/ApprovalsPage.jsx` — removal of the D-11 disabled-row branch.

</code_context>

<specifics>
## Specific Ideas

- The reason activation was placed in `verifyEmail` rather than at `register` time is the invariant, not convenience: an account should never read `Active` before its address is proven, even though `login` and `getUserFromRequest` each check `emailVerified` separately and would have blocked sign-in either way.
- Similarly, `Invitation.status` stays `'Registered'` because that is what actually happened. Stamping `'Approved'` for an activation nobody approved was considered and rejected on the same ground PROJECT.md uses for self-registrants — a row that records something that did not occur is a lie in the schema.
- Locking `myInvitations` is defence in depth, chosen with the codebase's own history in view: authorization gaps in Phases 14, 15 and 30 all passed their tests before someone went looking for them.

</specifics>

<deferred>
## Deferred Ideas

- **"Your invitee joined" notice to the inviting admin** — considered as a replacement for the dropped `notifyAdminsOfPendingRegistration` call (D-11) and set aside: it is a new mailer function and template for information nobody has to act on. Worth revisiting once the queue is account-shaped.
- **Read-only invitation history for non-admins** — a member who invited people before this phase loses the record of it in the UI under D-03. Could return later as a read-only list if anyone misses it.
- **Pruning unverified registrations** — Phase 30's F-02, narrowed by D-09 but not closed. An expiry or admin-purge story belongs after public signup opens (Phase 32 onward).
- **Un-reject** — still no path back from `Rejected`, carried forward from Phase 30.

</deferred>

---

*Phase: 31-Invitations Become Admin-Only*
*Context gathered: 2026-08-28*
