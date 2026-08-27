---
phase: 30
slug: approval-moves-to-the-account
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-27
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `30-RESEARCH.md` §"Validation Architecture". Task IDs are filled in by the planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (both workspaces) |
| **Config file** | `backend/vitest.config.js` (`pool: forks`, `fileParallelism: false`, `globalSetup: ./test/globalSetup.js`) · frontend: RTL + `@testing-library/user-event` + jsdom |
| **Quick run command** | `npm test --workspace backend -- src/resolvers/approveReject.test.js` |
| **Full suite command** | `npm test --workspaces` |
| **Estimated runtime** | ~5s targeted file · ~60s full backend suite |

**Schema provisioning note:** the backend test DB is built by `sequelize.sync({ force: true })`
in `backend/test/globalSetup.js:11`, reading the *model* definitions. Adding the four approval
columns to `backend/src/models/User.js` is therefore sufficient for the suite to go green — the
manual `019-*.sql` migration is **never executed by the tests**. That gap is covered under
Manual-Only Verifications below and must not be mistaken for automated proof.

---

## Sampling Rate

- **After every task commit:** Run the targeted file — `npx vitest run src/resolvers/approveReject.test.js` (backend) or `npx vitest run src/pages/ApprovalsPage.test.jsx` (frontend)
- **After every plan wave:** Run `npm test --workspace backend` and `npm test --workspace frontend`
- **Before `/gsd:verify-work`:** `npm test --workspaces` fully green (this *is* SC-5)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | APPR-01 / SC-1 | — | `approveUser(userId)` sets `User.status = 'Active'`; that account can then `login` | integration | `npx vitest run src/resolvers/approveReject.test.js -t approveUser` | ❌ rewrite of `approveInvitation` block | ⬜ pending |
| TBD | TBD | 1 | APPR-05 / SC-1 | — | `rejectUser(userId, reason)` sets `status = 'Rejected'`; `login` throws the existing `'Your registration was not approved.'` | integration | `npx vitest run src/resolvers/approveReject.test.js -t rejectUser` | ❌ rewrite (assertion string reused verbatim from `accountStatus.test.js:32`) | ⬜ pending |
| TBD | TBD | 1 | APPR-03 / SC-2 | — | `sendAccountApprovedEmail` / `sendAccountRejectedEmail` called with `{to, name[, reason]}`; failures stay fire-and-forget and do not fail the mutation | integration (mocked mailer) | `npx vitest run src/resolvers/approveReject.test.js` | ❌ rewrite (reuse existing `vi.waitFor` pattern) | ⬜ pending |
| TBD | TBD | 1 | APPR-04 / SC-2 | T-30-AUDIT | `AuditLog` row written with `action: 'user.approved'` / `'user.rejected'`, `actorUserId` = acting admin, `targetUserId` = the account | integration | `npx vitest run src/resolvers/approveReject.test.js` | ❌ rewrite (reuse `models.AuditLog.findAll({where:{action}})`) | ⬜ pending |
| TBD | TBD | 1 | APPR-04 / SC-3 | T-30-AUTHZ | A non-admin caller is refused server-side by `requireAdmin` — `'Admin access is required.'` — for **both** mutations | integration | `npx vitest run src/resolvers/approveReject.test.js -t admin` | ❌ rewrite (assertion at `approveReject.test.js:65` reused verbatim) | ⬜ pending |
| TBD | TBD | 1 | D-07 | T-30-REPLAY | Approving/rejecting a non-`Pending` account (`Active`/`Rejected`/`Disabled`) throws `'This account is not awaiting a decision.'` — a repeat click fails loudly, no double email | integration | `npx vitest run src/resolvers/approveReject.test.js` | ❌ **NEW** — no existing coverage | ⬜ pending |
| TBD | TBD | 1 | D-08 / D-09 / F-01 | T-30-IDENTITY | Approving **or** rejecting a `Pending` account whose `emailVerified` is false throws; test is explicitly named to record this as intended new behaviour, not a regression | integration | `npx vitest run src/resolvers/approveReject.test.js` | ❌ **NEW** — critical gap; no fixture today creates this combination | ⬜ pending |
| TBD | TBD | 1 | D-05 / INVITE-04 | — | When the account has an invitation, that row is still stamped in the **same transaction** (`status`, `approvedAt`/`approvedBy` or `rejectedAt`/`rejectionReason`) | integration | `npx vitest run src/resolvers/approveReject.test.js` | ⚠️ rewrite of existing `invitation.reload()` assertions | ⬜ pending |
| TBD | TBD | 1 | D-06 | — | Audit row for an invited registrant still carries `invitationId` (not null) — the link is not lost | integration | `npx vitest run src/resolvers/approveReject.test.js` | ⚠️ rewrite | ⬜ pending |
| TBD | TBD | 1 | APPR-01 (Phase 32 precursor) | — | Approving/rejecting a `Pending` + verified account with **no** invitation row succeeds and writes `invitationId: null` | integration | `npx vitest run src/resolvers/approveReject.test.js` | ❌ **NEW** — zero existing coverage; regression-proofs the phase's whole point | ⬜ pending |
| TBD | TBD | 1 | INVITE-04 / SC-4 | — | `myInvitations` / `invitations` / `Invitation.inviter` still resolve for rows created by non-admin members — untouched code path stays green with zero edits | integration | `npx vitest run src/resolvers/createInvitation.test.js` | ✅ already exists | ⬜ pending |
| TBD | TBD | 2 | D-10 | — | Approve/reject call `graphqlRequest` with the **account** id (`row.registeredUser.id`), not `row.id` | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ⚠️ rewrite (fixture already has distinct ids, making the assertion meaningful) | ⬜ pending |
| TBD | TBD | 2 | D-11 | — | A row whose `registeredUser.emailVerified` is false renders a "waiting for email verification" state and both action buttons are disabled | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ❌ **NEW** — page has no disabling logic today | ⬜ pending |
| TBD | TBD | final | SC-5 | — | Whole-repo suite green; invitation happy path unchanged | full suite | `npm test --workspaces` | ✅ gate, not a file | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — **no new test files and no framework
install are needed.** `backend/src/resolvers/approveReject.test.js` and
`frontend/src/pages/ApprovalsPage.test.jsx` already exist and are the designated homes; the
gaps are new `it()` blocks inside them (marked **NEW** above).

One non-test Wave 0 prerequisite:

- [ ] `backend/migrations/manual/019-add-users-approval-columns.sql` — needed before the resolver runs against any already-provisioned dev/prod DB (the test DB self-provisions from the models and does not read it)
- [ ] Matching field declarations added to `backend/src/models/User.js` — **this** is what makes the test DB grow the columns

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `019-add-users-approval-columns.sql` applies cleanly to a real database | D-04 / F-03 | The suite provisions schema via `sequelize.sync({force:true})` from model definitions and **never executes the manual SQL file**. Byte-correctness of the SQL against a real MariaDB/MySQL can only be proven by running it. This is the same posture `018-`'s header claims. | 1. Point at a local dev MariaDB/MySQL that already has the `users` table. 2. Run the file (`mysql <db> < backend/migrations/manual/019-add-users-approval-columns.sql`). 3. `DESCRIBE users;` — confirm `approvedAt`, `approvedBy`, `rejectedAt`, `rejectionReason` exist with the intended types and nullability. 4. Re-run the file if it claims idempotency, and confirm it does not error. |
| Production apply of `019-` | F-03 | Explicitly a separate, explicit step outside this phase — the phase must not silently assume it. | Deferred to the deployment step; not a phase gate. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, never bare `vitest`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
