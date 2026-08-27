---
phase: 30
slug: approval-moves-to-the-account
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-27
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `30-RESEARCH.md` §"Validation Architecture". Task IDs filled in by the planner.

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
columns to `backend/src/models/User.js` (Plan 30-01) is therefore sufficient for the suite to go
green — the manual `019-*.sql` migration is **never executed by the tests**. That gap is covered
under Manual-Only Verifications below and must not be mistaken for automated proof.

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
| 30-03-T1 | 30-03 | 3 | APPR-01 / SC-1 | — | `approveUser(userId)` sets `User.status = 'Active'`; that account can then `login` | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js -t approveUser` | ❌ rewrite of `approveInvitation` block | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | APPR-05 / SC-1 | — | `rejectUser(userId, reason)` sets `status = 'Rejected'`; `login` throws the existing `'Your registration was not approved.'` | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js -t rejectUser` | ❌ rewrite (assertion string reused verbatim from `accountStatus.test.js:32`) | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | APPR-03 / SC-2 | — | `sendAccountApprovedEmail` / `sendAccountRejectedEmail` called with `{to, name[, reason]}`; failures stay fire-and-forget and do not fail the mutation | integration (mocked mailer) | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ❌ rewrite (reuse existing `vi.waitFor` pattern) | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | APPR-04 / SC-2 | T-30-AUDIT | `AuditLog` row written with `action: 'user.approved'` / `'user.rejected'`, `actorUserId` = acting admin, `targetUserId` = the account | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ❌ rewrite (reuse `models.AuditLog.findAll({where:{action}})`) | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | APPR-04 / SC-3 | T-30-AUTHZ | A non-admin caller is refused server-side by `requireAdmin` — `'Admin access is required.'` — for **both** mutations | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js -t admin` | ❌ rewrite (assertion at `approveReject.test.js:65` reused verbatim) | ⬜ pending |
| 30-03-T2 | 30-03 | 3 | D-07 | T-30-REPLAY | Approving/rejecting a non-`Pending` account (`Active`/`Rejected`/`Disabled`) throws `'This account is not awaiting a decision.'` — a repeat click fails loudly, no double email | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ❌ **NEW** — no existing coverage | ⬜ pending |
| 30-03-T2 | 30-03 | 3 | D-08 / D-09 / F-01 | T-30-IDENTITY | Approving **or** rejecting a `Pending` account whose `emailVerified` is false throws; test is explicitly named to record this as intended new behaviour, not a regression | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ❌ **NEW** — critical gap; no fixture today creates this combination | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | D-05 / INVITE-04 | — | When the account has an invitation, that row is still stamped in the **same transaction** (`status`, `approvedAt`/`approvedBy` or `rejectedAt`/`rejectionReason`), sharing the identical `now`/`cleanReason` values as the `User` row's own stamp (D-04) | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ⚠️ rewrite of existing `invitation.reload()` assertions | ⬜ pending |
| 30-03-T2 | 30-03 | 3 | D-04 | T-30-AUDIT | The **`User` row itself** is unconditionally stamped with `approvedAt`/`approvedBy` (approve) or `rejectedAt`/`rejectionReason` (reject) — proven via `reload()` on BOTH the with-invitation path (values identical to the `Invitation` row's stamp) and the no-invitation path (the `User` row alone carries the decision) | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ❌ **NEW** — this is the row a prior version of this plan set left unasserted; the checker-flagged gap | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | D-06 | — | Audit row for an invited registrant still carries `invitationId` (not null) — the link is not lost | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ⚠️ rewrite | ⬜ pending |
| 30-03-T2 | 30-03 | 3 | APPR-01 (Phase 32 precursor) | — | Approving/rejecting a `Pending` + verified account with **no** invitation row succeeds, writes `invitationId: null`, AND stamps the `User` row's own `approvedAt`/`approvedBy` or `rejectedAt`/`rejectionReason` (D-04) | integration | `npm test --workspace backend -- src/resolvers/approveReject.test.js` | ❌ **NEW** — zero existing coverage; regression-proofs the phase's whole point | ⬜ pending |
| 30-03-T1 | 30-03 | 3 | INVITE-04 / SC-4 | — | `myInvitations` / `invitations` / `Invitation.inviter` still resolve for rows created by non-admin members — untouched code path stays green with zero edits | integration | `npm test --workspace backend -- src/resolvers/createInvitation.test.js` | ✅ already exists | ⬜ pending |
| 30-04-T1 | 30-04 | 3 | D-10 | — | Approve/reject call `graphqlRequest` with the **account** id (`row.registeredUser.id`), not `row.id` | component | `npm test --workspace frontend -- src/pages/ApprovalsPage.test.jsx` | ⚠️ rewrite (fixture already has distinct ids, making the assertion meaningful) | ⬜ pending |
| 30-04-T2 | 30-04 | 3 | D-11 | — | A row whose `registeredUser.emailVerified` is false renders a "waiting for email verification" state and both action buttons are disabled | component | `npm test --workspace frontend -- src/pages/ApprovalsPage.test.jsx` | ❌ **NEW** — page has no disabling logic today | ⬜ pending |
| 30-03-T2 / 30-04-T2 | 30-03 / 30-04 | final (3) | SC-5 | — | Whole-repo suite green; invitation happy path unchanged | full suite | `npm test --workspaces` | ✅ gate, not a file | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Non-test rows (Wave 1/2 prerequisites, not in the map above since they produce no test assertion of their own):**

| Task ID | Plan | Wave | Item |
|---------|------|------|------|
| 30-01-T1 | 30-01 | 1 | `backend/src/models/User.js` gains `approvedAt`/`approvedBy`/`rejectedAt`/`rejectionReason` (D-04) — this is what makes the Task IDs above's test DB self-provision the new columns; the fields are storage-only until Plan 30-02 writes them |
| 30-01-T2 | 30-01 | 1 | `backend/migrations/manual/019-add-users-approval-columns.sql` written + proven via isolated scratch-DB dry run |
| 30-01-T3 | 30-01 | 1 | Human checkpoint: migration applied to the real local dev database (see Manual-Only Verifications) |
| 30-02-T1 | 30-02 | 2 | `approval.resolver.js`/`approval.schema.js` created (implements D-01..D-09, and D-04's unconditional User-row decision-field stamp — this is what the 30-03-T2 D-04 row above proves) |
| 30-02-T2 | 30-02 | 2 | Old mutations deleted, new module wired into both barrels (D-01, D-03) |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — **no new test files and no framework
install are needed.** `backend/src/resolvers/approveReject.test.js` and
`frontend/src/pages/ApprovalsPage.test.jsx` already exist and are the designated homes; the
gaps are new `it()` blocks inside them (marked **NEW** above), added by Plan 30-03 (Task 2) and
Plan 30-04 (Task 2) respectively.

One non-test Wave 0 prerequisite, now planned as Plan 30-01:

- [x] `backend/migrations/manual/019-add-users-approval-columns.sql` — Plan 30-01, Task 2. Needed before the resolver runs against any already-provisioned dev/prod DB (the test DB self-provisions from the models and does not read it).
- [x] Matching field declarations added to `backend/src/models/User.js` — Plan 30-01, Task 1. **This** is what makes the test DB grow the columns.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Plan |
|----------|-------------|------------|--------------------|------|
| `019-add-users-approval-columns.sql` applies cleanly to a real database | D-04 / F-03 | The suite provisions schema via `sequelize.sync({force:true})` from model definitions and **never executes the manual SQL file**. Byte-correctness of the SQL against a real MariaDB/MySQL can only be proven by running it. This is the same posture `018-`'s header claims. | 1. Point at a local dev MariaDB/MySQL that already has the `users` table. 2. Run the file (`mysql <db> < backend/migrations/manual/019-add-users-approval-columns.sql`). 3. `DESCRIBE users;` — confirm `approvedAt`, `approvedBy`, `rejectedAt`, `rejectionReason` exist with the intended types and nullability. 4. Re-run the file if it claims idempotency, and confirm it does not error. | 30-01, Task 3 (`checkpoint:human-verify`) |
| Production apply of `019-` | F-03 | Explicitly a separate, explicit step outside this phase — the phase must not silently assume it. | Deferred to the deployment step; not a phase gate. | Not planned in this phase (by design) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the one checkpoint task, 30-01 Task 3, has `<human-check>` verify per its type, matching the project's established checkpoint format)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 30-01 supplies both the model fields and the migration file)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`) — all commands route through `npm test --workspace <name> -- <pattern>`, which invokes each workspace's `"test": "vitest run"` script
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — Plans 30-01 through 30-04 (`.planning/phases/30-approval-moves-to-the-account/`) cover every row in this map, including the D-04 account-stamp row added by the post-checker revision.
