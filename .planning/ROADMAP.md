# Roadmap: Portfolio Auth App — Testing Foundation, Collaborative Family Tree, Ge'ez Native-Script Names, Family Detail Navigation & Open Registration

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- ✅ **v1.1 Security Remediation** — Phases 7–11 (shipped 2026-07-21)
- ✅ **v2.0 Collaborative Family Tree** — Phases 12–17 (shipped 2026-07-25)
- ✅ **v3.0 Ge'ez Native-Script Names** — Phases 18–23 (shipped 2026-07-31)
- ✅ **v4.0 Family Detail & Descendant Navigation** — Phases 24–29 (shipped 2026-08-05)
- 🔨 **v4.1 Open Registration with Approval** — Phases 30–34 (in progress)

## Phases

<details>
<summary>✅ v1.0 Full-Stack Testing Safety Net (Phases 1–6) — SHIPPED 2026-07-12</summary>

- [x] Phase 1: Backend Test Tooling & Test Database (2/2 plans) — completed 2026-07-11
- [x] Phase 2: Backend Unit Tests (2/2 plans) — completed 2026-07-11
- [x] Phase 3: Backend Integration Tests (3/3 plans) — completed 2026-07-11
- [x] Phase 4: Frontend Test Tooling (1/1 plan) — completed 2026-07-12
- [x] Phase 5: Frontend Component Tests (3/3 plans) — completed 2026-07-12
- [x] Phase 6: Root Orchestration & CI Pipeline (2/2 plans) — completed 2026-07-12

Full detail archived in [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

</details>

<details>
<summary>✅ v1.1 Security Remediation (Phases 7–11) — SHIPPED 2026-07-21</summary>

**Milestone Goal:** Remediate the security bugs deferred from v1.0 — closing the account-takeover and brute-force vectors — while keeping the CI-enforced test suite green. Every fix TDD'd red-green-refactor.

- [x] Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength (2/2 plans) — completed 2026-07-12
- [x] Phase 8: Mailer Abstraction & Reset-Token Remediation (3/3 plans) — completed 2026-07-13
- [x] Phase 9: Session Revocation via passwordChangedAt (3/3 plans) — completed 2026-07-20
- [x] Phase 10: Rate Limiting on Auth Mutations (3/3 plans) — completed 2026-07-20
- [x] Phase 11: Email Verification & ADMIN Race Fix (8/8 plans, incl. gap-closure 11-08) — completed 2026-07-21

Full detail archived in [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md).

</details>

<details>
<summary>✅ v2.0 Collaborative Family Tree (Phases 12–17) — SHIPPED 2026-07-25</summary>

**Milestone Goal:** Add a family-tree domain where app access is gated on being an admin-linked member; members collaboratively add/edit their immediate relatives on `/manage`, and any linked member views a deep, pan/zoom tree on `/family` — built test-first (TDD) with CI staying green.

- [x] Phase 12: Family Data Model Foundation (4/4 plans) — completed 2026-07-22
- [x] Phase 13: Membership Gating & Account Linking (4/4 plans) — completed 2026-07-22
- [x] Phase 14: Relationship Resolvers, Permission Scoping & Query Safety (6/6 plans) — completed 2026-07-23
- [x] Phase 15: Sibling Dedup Guard & /manage Self-Service UI (6/6 plans) — completed 2026-07-23
- [x] Phase 16: Photo Upload (7/7 plans) — completed 2026-07-24
- [x] Phase 17: /family Deep Tree Visualization (4/4 plans) — completed 2026-07-25

Full detail archived in [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md).

_Post-milestone note: the `/family` tree edge model was later changed from the union-node "spouses-paired" rendering to a pure parent→child hierarchy (with a dashed spouse connector) at the user's request. See PROJECT.md Key Decisions._

</details>

<details>
<summary>✅ v3.0 Ge'ez Native-Script Names (Phases 18–23) — SHIPPED 2026-07-31</summary>

**Milestone Goal:** Family members can carry their name in Ge'ez script (ግዕዝ) alongside the existing Latin name, rendered with a self-hosted Ge'ez-capable webfont so it displays correctly on every device.

- [x] Phase 18: Data Model & Migration (2/2 plans) — completed 2026-07-30
- [x] Phase 19: GraphQL Layer (1/1 plan) — completed 2026-07-30
- [x] Phase 20: Self-Hosted Font & Theme (1/1 plan) — completed 2026-07-30
- [x] Phase 21: Shared Display Helper (1/1 plan) — completed 2026-07-30
- [x] Phase 22: Render Surfaces / Read Path (3/3 plans) — completed 2026-07-31
- [x] Phase 23: Write Path & Quality Gate (3/3 plans) — completed 2026-07-31

Full detail archived in [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md).

</details>

<details>
<summary>✅ v4.0 Family Detail & Descendant Navigation (Phases 24–29) — SHIPPED 2026-08-05</summary>

**Milestone Goal:** A new `/detail` page (all authenticated users) that opens on the family head in a reusable person card, supports Latin + Ge'ez name search to reset the main person, and lets users expand children → grandchildren on demand — capped at three generations with forward-shift navigation — showing each displayed person's spouse(s) alongside them, with admin-only add-child/add-spouse and edit (backend-enforced, reusing existing flows), loaded lazily.

- [x] Phase 24: Backend Read Layer for /detail (3/3 plans) — completed 2026-08-03
- [x] Phase 25: Reusable PersonCard (2/2 plans) — completed 2026-08-03
- [x] Phase 26: /detail Page, Search & Initial Load (2/2 plans) — completed 2026-08-03
- [x] Phase 27: Descendant Navigation & Performance (4/4 plans) — completed 2026-08-04
- [x] Phase 28: Admin Actions on /detail (5/5 plans) — completed 2026-08-04
- [x] Phase 29: Accessibility, Responsive & Quality Gate (4/4 plans) — completed 2026-08-05

Full detail archived in [milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md).

</details>

### 🔨 v4.1 Open Registration with Approval (Phases 30–34) — IN PROGRESS

**Milestone Goal:** A visitor can create an account without an invitation, but the account stays inert until they verify their email **and** an administrator approves them as family — while an invited person, vouched for by the admin who invited them, activates on email verification alone.

**Build order rationale:** approval moves onto the account *first*, while the invite flow is still its only producer, so that refactor is provably behaviour-preserving before anything new depends on it. The invite path is settled next (admin-only, no approval) so the queue has exactly one kind of occupant before the public door opens. Backend precedes UI throughout, per the project's TDD convention.

- [ ] **Phase 30: Approval Moves to the Account** — approve/reject act on `User.status`, not on an invitation row
  - Requirements: APPR-01, APPR-03, APPR-04, APPR-05, INVITE-04
  - Success criteria:
    1. An admin approves a pending account by account id and that person can sign in; rejecting blocks sign-in with the existing message.
    2. Approval and rejection emails still send, and both actions are written to the audit log with the acting admin and target account.
    3. A non-admin calling approve or reject is refused server-side.
    4. Existing invitation rows still render with their inviter, status, and timestamps — including ones sent by non-admin members.
    5. The backend suite passes with the invitation flow behaving exactly as it did before.

- [ ] **Phase 31: Invitations Become Admin-Only** — every invitation is admin-issued, so an invited person can safely skip approval
  - Requirements: INVITE-01, INVITE-02, INVITE-03
  - Success criteria:
    1. A linked non-admin member calling `createInvitation` is refused server-side, not merely hidden from.
    2. A non-admin no longer sees the invite form or a nav entry offering it; an admin sees it unchanged.
    3. Someone who registers through an admin invitation and verifies their email can sign in with no admin action in between.
    4. The approval queue no longer contains invited registrants — only accounts that still need a judgement.

- [ ] **Phase 32: Tokenless Registration** — `register` can create an account with no invitation, safely
  - Requirements: REG-02, REG-03, REG-05, REG-06, REG-07, SEC-01, SEC-02, SEC-03
  - Success criteria:
    1. `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note.
    2. An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address.
    3. An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators.
    4. Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path — no second, weaker implementation.
    5. The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side.

- [ ] **Phase 33: Public Signup Form & Approval Queue** — the two surfaces people actually touch
  - Requirements: REG-01, REG-04, APPR-02, APPR-06
  - Success criteria:
    1. `/register` with no token renders a signup form (name, email, password, required relationship note) instead of the invitation-only dead end.
    2. Submitting it tells the person plainly what happens next: verify your email, then an administrator reviews your request.
    3. The admin queue lists each waiting account with name, email, relationship note, and registration time, and approve/reject work from there.
    4. An approved self-registrant who is not yet linked to a family member lands on the existing `/pending` screen.
    5. Loading, empty, and failed states render through the app's existing components — never a broken or empty panel.

- [ ] **Phase 34: Open-Registration Switch & Quality Gate** — the door can be closed, and the boundaries are proven
  - Requirements: ADMIN-01, ADMIN-02, ADMIN-03, SEC-04, SEC-05
  - Success criteria:
    1. An admin turns public signup off from inside the app and a tokenless `register` call is refused server-side; `/register` returns to the invitation-only message.
    2. The current on/off state is visible to admins wherever they can change it.
    3. Adversarial tests prove a non-admin cannot invite, approve, or reject, and cannot register tokenless while the switch is off.
    4. A self-registered account cannot reach any authenticated resolver until both gates pass — proven against the resolvers, not just the client-side route guard.
    5. `npm test --workspaces` is green.

## Phase Details

### Phase 30: Approval Moves to the Account

**Goal**: Approve and reject act on the account itself — `User.status` — instead of on an invitation row, with approval/rejection emails, audit logging, and admin-only enforcement all preserved, and the existing invitation flow behaving exactly as it did before.
**Depends on**: Nothing new (first v4.1 phase; builds on the existing invitation/approval flow, `requireAdmin`, audit log, and mailer)
**Requirements**: APPR-01, APPR-03, APPR-04, APPR-05, INVITE-04
**Success Criteria** (what must be TRUE):

  1. An admin approves a pending account by account id and that person can sign in; rejecting blocks sign-in with the existing message.
  2. Approval and rejection emails still send, and both actions are written to the audit log with the acting admin and target account.
  3. A non-admin calling approve or reject is refused server-side.
  4. Existing invitation rows still render with their inviter, status, and timestamps — including ones sent by non-admin members.
  5. The backend suite passes with the invitation flow behaving exactly as it did before.

**Plans:** 4 plans

Plans:
**Wave 1**

- [ ] 30-01-PLAN.md — User model approval columns (D-04) + migration 019 (scratch-DB proof + human-verified apply to local dev DB)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 30-02-PLAN.md — Relocate approveInvitation/rejectInvitation into account-addressed approveUser/rejectUser (D-01..D-09), delete old mutations, wire barrels

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 30-03-PLAN.md — Backend test coverage: retarget existing approveReject.test.js + new D-07/D-08-D-09/no-invitation-path coverage, full suite green (SC-5)
- [ ] 30-04-PLAN.md — Rewire ApprovalsPage to approveUser/rejectUser (D-10) + D-11 disabled state for unverified rows

### Phase 31: Invitations Become Admin-Only

**Goal**: Every invitation is admin-issued — non-admin members can no longer create one server-side, nor see the UI offering it — so an invited person, vouched for by the admin who invited them, activates on email verification alone and never occupies the approval queue.
**Depends on**: Phase 30 (approval must already live on the account before invited registrants can be exempted from it)
**Requirements**: INVITE-01, INVITE-02, INVITE-03
**Success Criteria** (what must be TRUE):

  1. A linked non-admin member calling `createInvitation` is refused server-side, not merely hidden from.
  2. A non-admin no longer sees the invite form or a nav entry offering it; an admin sees it unchanged.
  3. Someone who registers through an admin invitation and verifies their email can sign in with no admin action in between.
  4. The approval queue no longer contains invited registrants — only accounts that still need a judgement.

**Plans**: TBD

**UI hint**: yes

### Phase 32: Tokenless Registration

**Goal**: `register` accepts a call with no invitation token and safely creates a `Pending`, unverified account — reusing the invited path's password rules, email normalisation, and verification-token handling, with enumeration-safe responses, admin notification on verification, and the existing per-IP rate limit applied.
**Depends on**: Phase 31 (the invite path is settled first, so the approval queue has exactly one kind of occupant before the public door opens)
**Requirements**: REG-02, REG-03, REG-05, REG-06, REG-07, SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):

  1. `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note.
  2. An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address.
  3. An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators.
  4. Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path — no second, weaker implementation.
  5. The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side.

**Plans**: TBD

### Phase 33: Public Signup Form & Approval Queue

**Goal**: The two surfaces people actually touch — `/register` with no token renders a public signup form that tells the person plainly what happens next, and admins get a queue listing each waiting account with the context needed to judge it, both built from the app's existing components.
**Depends on**: Phase 32 (the tokenless `register` mutation and the queue-visibility rules must exist before any UI can call them)
**Requirements**: REG-01, REG-04, APPR-02, APPR-06
**Success Criteria** (what must be TRUE):

  1. `/register` with no token renders a signup form (name, email, password, required relationship note) instead of the invitation-only dead end.
  2. Submitting it tells the person plainly what happens next: verify your email, then an administrator reviews your request.
  3. The admin queue lists each waiting account with name, email, relationship note, and registration time, and approve/reject work from there.
  4. An approved self-registrant who is not yet linked to a family member lands on the existing `/pending` screen.
  5. Loading, empty, and failed states render through the app's existing components — never a broken or empty panel.

**Plans**: TBD

**UI hint**: yes

### Phase 34: Open-Registration Switch & Quality Gate

**Goal**: The door can be closed — an admin turns public signup off from inside the app and the server refuses tokenless registration — and the security boundaries of the whole milestone are proven by adversarial tests against the resolvers, with the full workspace suite green.
**Depends on**: Phase 33 (the full open-registration path must be in place before it can be gated and adversarially tested)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):

  1. An admin turns public signup off from inside the app and a tokenless `register` call is refused server-side; `/register` returns to the invitation-only message.
  2. The current on/off state is visible to admins wherever they can change it.
  3. Adversarial tests prove a non-admin cannot invite, approve, or reject, and cannot register tokenless while the switch is off.
  4. A self-registered account cannot reach any authenticated resolver until both gates pass — proven against the resolvers, not just the client-side route guard.
  5. `npm test --workspaces` is green.

**Plans**: TBD

**UI hint**: yes

## Progress

**Execution Order (v4.1):**
Phases execute in numeric order: 30 → 31 → 32 → 33 → 34.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Backend Test Tooling & Test Database | v1.0 | 2/2 | Complete | 2026-07-11 |
| 2. Backend Unit Tests | v1.0 | 2/2 | Complete | 2026-07-11 |
| 3. Backend Integration Tests | v1.0 | 3/3 | Complete | 2026-07-11 |
| 4. Frontend Test Tooling | v1.0 | 1/1 | Complete | 2026-07-12 |
| 5. Frontend Component Tests | v1.0 | 3/3 | Complete | 2026-07-12 |
| 6. Root Orchestration & CI Pipeline | v1.0 | 2/2 | Complete | 2026-07-12 |
| 7. Foundation Hardening — CORS, JWT Fail-Fast & Password Strength | v1.1 | 2/2 | Complete | 2026-07-12 |
| 8. Mailer Abstraction & Reset-Token Remediation | v1.1 | 3/3 | Complete | 2026-07-13 |
| 9. Session Revocation via passwordChangedAt | v1.1 | 3/3 | Complete | 2026-07-20 |
| 10. Rate Limiting on Auth Mutations | v1.1 | 3/3 | Complete | 2026-07-20 |
| 11. Email Verification & ADMIN Race Fix | v1.1 | 8/8 | Complete | 2026-07-21 |
| 12. Family Data Model Foundation | v2.0 | 4/4 | Complete | 2026-07-22 |
| 13. Membership Gating & Account Linking | v2.0 | 4/4 | Complete | 2026-07-22 |
| 14. Relationship Resolvers, Permission Scoping & Query Safety | v2.0 | 6/6 | Complete | 2026-07-23 |
| 15. Sibling Dedup Guard & /manage Self-Service UI | v2.0 | 6/6 | Complete | 2026-07-23 |
| 16. Photo Upload | v2.0 | 7/7 | Complete | 2026-07-24 |
| 17. /family Deep Tree Visualization | v2.0 | 4/4 | Complete | 2026-07-25 |
| 18. Data Model & Migration | v3.0 | 2/2 | Complete    | 2026-07-30 |
| 19. GraphQL Layer | v3.0 | 1/1 | Complete   | 2026-07-30 |
| 20. Self-Hosted Font & Theme | v3.0 | 1/1 | Complete    | 2026-07-30 |
| 21. Shared Display Helper | v3.0 | 1/1 | Complete    | 2026-07-30 |
| 22. Render Surfaces (Read Path) | v3.0 | 3/3 | Complete    | 2026-07-31 |
| 23. Write Path & Quality Gate | v3.0 | 3/3 | Complete    | 2026-07-31 |
| 24. Backend Read Layer for /detail | v4.0 | 3/3 | Complete    | 2026-08-03 |
| 25. Reusable PersonCard | v4.0 | 2/2 | Complete    | 2026-08-03 |
| 26. /detail Page, Search & Initial Load | v4.0 | 2/2 | Complete    | 2026-08-03 |
| 27. Descendant Navigation & Performance | v4.0 | 4/4 | Complete    | 2026-08-04 |
| 28. Admin Actions on /detail | v4.0 | 5/5 | Complete    | 2026-08-04 |
| 29. Accessibility, Responsive & Quality Gate | v4.0 | 4/4 | Complete    | 2026-08-05 |
| 30. Approval Moves to the Account | v4.1 | 0/4 | Not started | — |
| 31. Invitations Become Admin-Only | v4.1 | 0/– | Not started | — |
| 32. Tokenless Registration | v4.1 | 0/– | Not started | — |
| 33. Public Signup Form & Approval Queue | v4.1 | 0/– | Not started | — |
| 34. Open-Registration Switch & Quality Gate | v4.1 | 0/– | Not started | — |
