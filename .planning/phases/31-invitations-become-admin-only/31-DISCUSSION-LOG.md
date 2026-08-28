# Phase 31: Invitations Become Admin-Only - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 31-Invitations Become Admin-Only
**Areas discussed:** Activation point for invited accounts, Invitation row's terminal status + the queue, What a non-admin sees at /invitations, Emails and copy that assumed approval

---

## Activation point for invited accounts

**Q1 — INVITE-03 says an invited person activates on email verification alone. Where should that activation actually happen?**

| Option | Description | Selected |
|--------|-------------|----------|
| register creates it Active | `register(token)` sets `status:'Active'` instead of `'Pending'`; `verifyEmail` untouched. Branch lives where the difference exists (token or not) — the same branch Phase 32 must write. Cost: a row reads Active but unverified between register and verify. | |
| verifyEmail promotes Pending→Active | `register` still creates `'Pending'`; `verifyEmail` looks up whether the account has an invitation row and flips it to Active. Keeps the invariant "Active means verified AND vouched". Cost: a lookup and branch inside verifyEmail's FOR UPDATE transaction. | ✓ |
| You decide | Let the planner pick based on what the tests and Phase 32's shape favour. | |

**User's choice:** verifyEmail promotes Pending→Active
**Notes:** Chosen for the invariant, not convenience — no account should read `Active` before its address is proven, even though `login` and `getUserFromRequest` each check `emailVerified` separately anyway.

**Q2 — How should verifyEmail know the account was invited (and therefore should be promoted) rather than left Pending?**

| Option | Description | Selected |
|--------|-------------|----------|
| Look up the Invitation row | Inside the existing transaction, find the Invitation where `registeredUserId = user.id`. No migration; the FK already exists and `register` already sets it. Promote only from `'Pending'`. | ✓ |
| Stamp the account at register time | Migration 020 adds `registrationSource ENUM('Invited','Self')` or `invitedBy` to `users`; verifyEmail reads one field. Phase 33's queue could filter on it. Cost: a second manual migration this milestone. | |
| You decide | Let research weigh whether Phase 33's queue wants an account-side provenance field. | |

**User's choice:** Look up the Invitation row
**Notes:** No migration this phase; the fact is already derivable from `fk_invitations_registered_user`.

---

## Invitation row's terminal status + the queue

**Q1 — How should the approval queue stop holding invited registrants (SC-4)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow the queue filter | `Invitation.status` stays `'Registered'`; `pendingRegistrations` becomes "Registered invitations whose account is still Pending AND emailVerified". Empty by construction; no migration; the filter gains the meaning Phase 33 needs. | ✓ |
| New 'Accepted' invitation status | Migration 020 alters the `invitations.status` ENUM; `verifyEmail` stamps it. Most explicit terminal state, queue query untouched. Cost: second migration plus GraphQL enum and frontend STATUS_COLOR map. | |
| Stamp it 'Approved' | Reuse the existing status, treating the inviter as the approver. No migration, no query change. Cost: records an approval that never happened. | |

**User's choice:** Narrow the queue filter
**Notes:** Keeps the invitation row honest — `'Registered'` is what actually happened — and avoids a second migration in a milestone that just landed 019.

**Q2 — With the queue provably empty until Phase 32, what happens to the ApprovalsPage section admins see under the invite form?**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it, drop the dead D-11 code | ApprovalsPage stays mounted with its existing empty state; the now-unreachable "waiting for email verification" disabled-row rendering is removed. approveUser/rejectUser stay wired and tested. | ✓ |
| Keep everything, change nothing | Leave Phase 30's page untouched, D-11 rendering included. Least churn; ships code that cannot execute. | |
| Hide it until Phase 33 | Drop the section for now. Cost: an admin loses a surface that is about to return, and approve/reject go untested end-to-end for two phases. | |

**User's choice:** Keep it, drop the dead D-11 code

---

## What a non-admin sees at /invitations

**Q1 — How should a non-admin be kept away from the invite surface (INVITE-02)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-only route + hidden nav | `/invitations` moves under `<ProtectedRoute allowedRoles={['ADMIN']}>`; the nav button gets the same ADMIN check `/link-accounts` uses. Existing guard redirects to `/dashboard`. Cost: past inviters lose their record in the UI. | ✓ |
| Read-only history, no form | Nav stays for everyone; the form renders for admins only and non-admins see a read-only list of what they sent. Cost: a nav entry to invitations still exists for people who cannot invite. | |
| Admin-only, but say why | Same lockout with an explanatory message instead of a silent bounce. Cost: a route shape no other admin-only route in the app uses. | |

**User's choice:** Admin-only route + hidden nav

**Q2 — createInvitation clearly moves to requireAdmin. What about the myInvitations query beside it, which still runs on requireFamilyAccess?**

| Option | Description | Selected |
|--------|-------------|----------|
| Tighten it to requireAdmin too | Every invitation is admin-issued after this phase, so a non-admin's list can only hold legacy rows. Locks the capability server-side rather than relying on hidden nav. | ✓ |
| Leave it on requireFamilyAccess | INVITE-01 covers only creation; reading your own past invitations leaks nothing new. Smaller diff. Cost: a server-side capability with no UI. | |
| You decide | Let the planner settle it against SC-1's adversarial tests. | |

**User's choice:** Tighten it to requireAdmin too
**Notes:** Explicitly defence in depth, given authorization gaps that passed their tests in Phases 14, 15 and 30.

---

## Emails and copy that assumed approval

**Q1 — What should be emailed on the invited path now that no admin decision is coming?**

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing beyond verification | Drop `notifyAdminsOfPendingRegistration` from the invited path; leave the helper and template intact for Phase 32's self-registrants. No approved-account email either. | ✓ |
| Tell the inviting admin their invitee joined | Replace the all-admins blast with an FYI to the inviter. Cost: a new mailer function and template for information nobody must act on. | |
| Keep the notification, reword it | Still mail every admin, as an activity notice. Cost: reworks a template Phase 32 wants back in its original form. | |

**User's choice:** Nothing beyond verification

**Q2 — What should register tell an invited person once approval is no longer part of their path?**

| Option | Description | Selected |
|--------|-------------|----------|
| Verification is the only step left | "Registration received. Verify your email and you can sign in." Drops a promise of admin review that will never happen; Phase 32 adds the tokenless variant to the same branch. | ✓ |
| Verification, then mention linking | Also warn that an admin must link them to a family member. Cost: touches the `/pending` story the milestone put out of scope. | |
| You decide | Leave the wording to the planner. | |

**User's choice:** Verification is the only step left

---

## Claude's Discretion

- Exact wording of the new `register` success message and of any refusal message beyond `requireAdmin`'s existing "Admin access is required."
- Whether the auto-activation writes its own audit action (e.g. `invitation.activated`) or nothing at all.
- Whether `InvitePage.jsx` and `InvitationsPage.jsx` stay separate or collapse now that only admins see them; test-file placement.
- How the narrowed `pendingRegistrations` filter is expressed in Sequelize (`include` with `where`, or a two-step query).

## Deferred Ideas

- "Your invitee joined" notice to the inviting admin — considered as a replacement for the dropped admin notification, set aside as a new template for non-actionable information.
- Read-only invitation history for non-admins — members who invited people before this phase lose that record in the UI.
- Pruning unverified registrations — Phase 30's F-02, narrowed by the new queue filter but not closed.
- Un-reject — still no path back from `Rejected`, carried forward from Phase 30.
