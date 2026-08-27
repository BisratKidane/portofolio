# Phase 30: Approval Moves to the Account - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-27
**Phase:** 30-Approval Moves to the Account
**Areas discussed:** Old mutations & UI cutover, Where the decision is recorded, Approve/reject preconditions, Queue query shape

---

## Preflight: roadmap repair

`.planning/ROADMAP.md` carried the v4.1 checklist entries for Phases 30–34 but no `## Phase Details` block, so `gsd-sdk query roadmap.get-phase 30` returned `malformed_roadmap` and `init phase-op` reported `phase_found: false` — blocking this command and every later phase command.

| Option | Description | Selected |
|--------|-------------|----------|
| Fix all 5, then discuss | Add `### Phase 30:`–`### Phase 34:` detail sections built from the goal taglines, requirements, and success criteria already in the checklist | ✓ |
| Fix Phase 30 only | Unblock this discussion, leave 31–34 malformed | |
| Run /gsd-health first | Route the repair through the health workflow | |
| Stop here | User repairs the roadmap themselves | |

**User's choice:** Fix all 5, then discuss
**Notes:** Success criteria and requirement lists were copied verbatim from the existing checklist and verified programmatically as byte-identical. Goal and Depends-on lines were derived from each phase's tagline and the milestone's build-order rationale. Committed as `2c6f31e`.

---

## Old mutations & UI cutover

**Q1 — What happens to `approveInvitation` / `rejectInvitation`?**

| Option | Description | Selected |
|--------|-------------|----------|
| Replace outright | Delete both, add `approveUser`/`rejectUser`, rewire ApprovalsPage + tests this phase | ✓ |
| Keep as deprecated wrappers | Old mutations delegate to the new path; UI untouched until Phase 33 | |
| You decide | Claude picks and records the reasoning | |

**Q2 — What should the new mutations return?**

| Option | Description | Selected |
|--------|-------------|----------|
| The updated `User!` | Matches `linkUserToMember`/`updateUser`; the page refetches anyway | ✓ |
| A payload type | `ApprovalResult { user, invitation }` — both halves in one round trip | |
| Boolean | Smallest schema; loses the updated status in the response | |

**Q3 — Where should the account-based approval code live?**

| Option | Description | Selected |
|--------|-------------|----------|
| New `approval` module | `approval.resolver.js` + `approval.schema.js` in the existing barrels | ✓ |
| Into `user.resolver.js` | Beside the rest of the account lifecycle; pushes that file past 500 lines | |
| Leave in `invitation.resolver.js` | Smallest diff; leaves account approval in a file named for invitations | |

**User's choice:** Replace outright / `User!` / new `approval` module
**Notes:** Chosen for one API shape and a single frontend cutover, accepting that a backend-leaning phase now touches the frontend and that SC-5 is proven by tests rather than by untouched code.

---

## Where the decision is recorded

**Q1 — Where do `approvedAt` / `approvedBy` / `rejectedAt` / `rejectionReason` live for an account with no invitation?**

| Option | Description | Selected |
|--------|-------------|----------|
| New `users` columns | Migration `019`, mirroring the four fields `invitations` already stores | ✓ |
| Audit log only | No migration; `audit_logs` already records actor, target, and reason | |
| Only `rejectionReason` on users | One column; timestamps stay in the audit log | |

**Q2 — Still stamp the invitation row when one exists?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, mirror in the same transaction | Keeps today's dual update, triggered from the account side | ✓ |
| No, derive the invitation's status from the account | Single source of truth immediately; needs a derived field | |
| Mirror now, delete in Phase 31 | Same, but recorded as explicitly temporary | |

**Q3 — Audit action naming?**

| Option | Description | Selected |
|--------|-------------|----------|
| `user.approved` / `user.rejected` | The action targets an account; `invitationId` still populated when present | ✓ |
| Keep `invitation.approved` / `invitation.rejected` | One action name across all history; becomes a lie from Phase 32 | |
| You decide | Claude picks and records the reasoning | |

**User's choice:** New `users` columns / mirror in the same transaction / `user.approved`–`user.rejected`
**Notes:** Mirroring also keeps `pendingRegistrations` correct without further change this phase, since it filters on `Invitation.status === 'Registered'`.

---

## Approve/reject preconditions

**Q1 — Which account statuses may be approved or rejected?**

| Option | Description | Selected |
|--------|-------------|----------|
| `Pending` only | Mirrors today's single-shot semantics; repeat click errors clearly | ✓ |
| `Pending` or `Rejected` | Allows un-reject after a mis-click; no UI reaches those accounts yet | |
| Anything except `Disabled` | Most permissive; turns approve/reject into general status editing | |

**Q2 — Should `approveUser` refuse an unverified account?**

| Option | Description | Selected |
|--------|-------------|----------|
| No, keep it as-is | Behaviour-preserving; login already requires verified + Active | |
| Yes, require `emailVerified` | Approval asserts identity, so require the address be proven | ✓ |
| You decide | Claude picks and records the reasoning | |

**Q3 — Does that requirement apply to `rejectUser` too?**

| Option | Description | Selected |
|--------|-------------|----------|
| No — reject any Pending account | Keeps a path to clear junk out of the system | |
| Yes — both require verification | One symmetric rule to state and test | ✓ |
| You decide | Claude picks and records the reasoning | |

**User's choice:** `Pending` only / require `emailVerified` on both
**Notes:** Q2 was flagged at the time as a deliberate narrow change to invitation-flow behaviour against SC-5's "exactly as before", and chosen anyway — recorded as F-01 in CONTEXT.md. Q3's cost was stated plainly (an unverified junk registration can never be dispositioned) and accepted — recorded as F-02 and as a deferred pruning idea.

---

## Queue query shape

**Q1 — Account-shaped queue query now, or stay invitation-shaped?**

| Option | Description | Selected |
|--------|-------------|----------|
| Stay invitation-shaped | ApprovalsPage passes the `registeredUser.id` it already fetches | ✓ |
| Add `pendingAccounts: [User!]!` now | Final shape early; loses the relationship note and inviter until Phase 32 | |
| Account-shaped, exposing the invitation | Preserves context via a `User.invitation` field; most new API surface | |

**Q2 — What should the queue do with unverified rows, now that they cannot be actioned?**

| Option | Description | Selected |
|--------|-------------|----------|
| Show them, disable the buttons | Visible "waiting for email verification" state; no server-side query change | ✓ |
| Filter them out server-side | Every listed row actionable; loses the stuck-before-verifying signal | |
| Leave it — let the click error | Smallest diff; ships a button known to fail | |

**User's choice:** Stay invitation-shaped / show unverified rows with disabled actions
**Notes:** The deciding factor on Q1 was that the admin's judging context — `invitedName`, `relationshipToFamily`, `invitationNote`, `inviter` — exists only on the Invitation row until Phase 32 adds the REG-03 relationship note.

---

## Claude's Discretion

- Error message wording beyond the "This account is not awaiting a decision." example, and the copy of the "waiting for email verification" state.
- Whether `approvedBy` carries a real FK to `users.id` or is a plain unsigned int.
- Test file placement — whether `approveReject.test.js` is rewritten in place or moved.

## Deferred Ideas

- **Un-reject** — no path back from `Rejected`, and no admin surface reaches such an account.
- **Pruning unverified registrations** — accounts that can never be dispositioned under the verified-only rule.
- **Account-shaped approval queue** — deliberately Phase 33's job (APPR-02).
