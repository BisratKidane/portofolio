# Roadmap: Portfolio Auth App — Testing Foundation & Collaborative Family Tree

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- ✅ **v1.1 Security Remediation** — Phases 7–11 (shipped 2026-07-21)
- 🚧 **v2.0 Collaborative Family Tree** — Phases 12–17 (in progress)

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

### 🚧 v2.0 Collaborative Family Tree (In Progress)

**Milestone Goal:** Add a family-tree domain where app access is gated on being an admin-linked member; members collaboratively add/edit their immediate relatives on `/manage`, and any linked member views a deep, pan/zoom tree on `/family` — built test-first (TDD) with CI staying green.

- [ ] **Phase 12: Family Data Model Foundation** - Self-referencing parent/child FKs, symmetric spouse join table, cycle/cascade safety, and a fresh-DB sync smoke test.
- [ ] **Phase 13: Membership Gating & Account Linking** - Registered users are gated behind admin-linking to a family member node, with a carve-out so the first admin isn't locked out.
- [ ] **Phase 14: Relationship Resolvers, Permission Scoping & Query Safety** - Members can only add/edit their immediate relatives — enforced server-side, resistant to privilege escalation, safe against N+1/DoS.
- [ ] **Phase 15: Sibling Dedup Guard & /manage Self-Service UI** - `/manage` lets members edit their scope and admins manage the whole tree, with duplicate-child creation guarded.
- [ ] **Phase 16: Photo Upload** - Users upload a member's profile picture to a durable, security-hardened backend route.
- [ ] **Phase 17: /family Deep Tree Visualization** - Linked members explore the whole family as a pannable, zoomable tree.

## Phase Details

### Phase 12: Family Data Model Foundation

**Goal**: The family-tree data model exists and is provably correct — cycle-safe, cascade-safe, symmetric-spouse-safe — before any resolver, permission, or UI logic is built on top of it.
**Depends on**: Nothing new (builds on the shipped v1.1 `users` table/auth foundation)
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-05, REL-01, REL-02, REL-03, REL-05
**Success Criteria** (what must be TRUE):

  1. A family member can be created with required `firstname`/`lastname`/`gender` and optional `mothersname`/`email`/`birthdate`/`deathdate`/`phone`/`address`; `fullname` is derived, never entered as separate input, and the model is persisted via Sequelize following the existing barrel/model conventions.
  2. A member's mother and/or father can be linked (existing or newly created), a child can be added establishing the parent→child link, and a spouse link set from either member reads identically from both sides (symmetric write).
  3. Attempting a parent/child edit that would make a member their own ancestor is rejected with a clear error (cycle-prevention check), proven by a test that constructs and attempts the cycle.
  4. Deleting a member never cascade-deletes any blood relative (children/parents/blood spouse) — every self-referencing association explicitly sets dependents' references to null; a **married-in-only** spouse (no linked mother, no linked father, no children) is removed one hop alongside their deleted partner (revised per 12-CONTEXT.md D-03/D-04) — proven by tests that (a) delete a mid-tree blood member and assert descendants + blood spouse survive, and (b) delete a member whose spouse is married-in-only and assert that spouse is removed one hop deep, with no recursion.
  5. `sequelize.sync({ force: true })` boots cleanly against a genuinely fresh database with the new self-referencing models (CI smoke test), and the full backend suite is green, built test-first (TDD red-green).

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — FamilyMember core model: required/optional fields, gender ENUM, derived fullname, full date validation (MEM-01/02/03/05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — Self-referencing parent associations (motherId/fatherId, SET NULL) + Spouse join model with canonical ordering (REL-01/02/03)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 12-03-PLAN.md — Cycle-prevention ancestor-walk + linkParent/addChild service helpers (REL-01/03/05)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 12-04-PLAN.md — setSpouse/getSpouseRows + married-in one-hop deleteMember, full-suite phase gate (REL-02, D-03/D-04)

### Phase 13: Membership Gating & Account Linking

**Goal**: App access is gated on being an admin-linked family member — enforced at the resolver layer, not just the frontend route — with an explicit carve-out so the first bootstrapped admin isn't locked out of the tools needed to bootstrap the tree.
**Depends on**: Phase 12
**Requirements**: ACC-01, ACC-02, ACC-03, ACC-04, ACC-05
**Success Criteria** (what must be TRUE):

  1. A registered, email-verified user with no linked member is routed to a `/pending` page explaining that an admin must link their account, and cannot reach family data through the UI.
  2. An admin can link a user account to a family member node, and that user gains member access on their next request.
  3. The first-verified-user ADMIN keeps full access with zero linked members and can create a member node and self-link to it, without being blocked by the membership gate — and the existing v1.1 first-user-ADMIN regression test still passes.
  4. `User.familyMemberId` exists on the `users` table via a tracked, manual `ALTER TABLE` (not assumed to apply via `sync()`) and is boot-verified against a real, pre-existing dev database.
  5. Every family-domain resolver enforces a `requireFamilyAccess` guard server-side; an integration test proves a verified-but-unlinked JWT calling a family GraphQL operation directly (bypassing the SPA) is rejected.

**Plans**: TBD
**UI hint**: yes

### Phase 14: Relationship Resolvers, Permission Scoping & Query Safety

**Goal**: Members can add and edit only their immediate relatives — parents, spouse, children, and derived siblings — with the editable scope computed and enforced entirely server-side, resistant to relationship-edit privilege escalation, and safe against N+1 fan-out and unbounded query depth on the now-recursive schema.
**Depends on**: Phase 12, Phase 13
**Requirements**: MEM-04, REL-04, PERM-01, PERM-02, PERM-03, PERM-04, PERM-05
**Success Criteria** (what must be TRUE):

  1. A member-user can add and edit their parents, spouse, children, and derived siblings (siblings are computed from shared parents and presented as such, never stored as an edge) — and editing a field on a member outside that permitted scope (e.g. a grandparent or cousin) is rejected.
  2. A member-user cannot remove any member (an attempted delete is rejected); an admin can add, edit, and remove any member across the whole tree.
  3. The editable-relative set is computed by a single, reused server-side utility (no client-supplied scope is ever trusted), tested against explicit exclusions — grandparent, cousin, sibling-of-sibling — as well as the inclusions it must cover.
  4. A member cannot fabricate a relationship edge (spouse/parent/child) to an already-linked, unrelated member's subtree to expand their own editable scope without that member's consent or admin approval, proven by an adversarial test.
  5. A deep-tree fixture's resolved SQL query count stays flat as generation depth grows (request-scoped DataLoader/flat-fetch, no per-node N+1), and a hand-crafted over-depth query is rejected by a `graphql-depth-limit` rule.

**Plans**: TBD

### Phase 15: Sibling Dedup Guard & /manage Self-Service UI

**Goal**: Members have a working `/manage` page to view and edit their scope through real forms, duplicate-child creation is guarded against, and admins can manage the whole tree and link accounts from the same page.
**Depends on**: Phase 14
**Requirements**: REL-06, MNG-01, MNG-02, MNG-03, MNG-04
**Success Criteria** (what must be TRUE):

  1. Creating or linking a child whose `firstname` duplicates (trimmed, case-folded) an existing child sharing either parent is rejected with an actionable error identifying the conflicting member.
  2. A member-user sees a visible list of the family members within their editable scope on `/manage`, and can add/edit members and wire relationships (parents, spouse, children) through forms that pick existing members from dropdowns.
  3. An admin can manage the whole tree from `/manage`, including linking user accounts to member nodes.
  4. `/manage` is reachable only by linked members (scoped view) and admins (full view); unlinked users are gated out.

**Plans**: TBD
**UI hint**: yes

### Phase 16: Photo Upload

**Goal**: Users can upload a profile picture for a member within their scope, stored durably across container rebuilds and hardened against upload-based attacks.
**Depends on**: Phase 12 (member model); can proceed in parallel with Phase 14/15
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03, QUAL-01
**Success Criteria** (what must be TRUE):

  1. A user can upload a `profilePicture` for a member within their scope via an upload form/widget hitting a dedicated backend route, and the resulting photo displays on that member.
  2. Uploaded photos persist across a container rebuild, verified against a named Docker volume (not the container's writable layer).
  3. Adversarial uploads — a path-traversal filename, a mislabeled content-type, an oversized file — are rejected as the first red tests, before any happy-path upload test passes; stored filenames are server-generated, never derived from client input.
  4. All new backend models, resolvers, and the upload route have unit + integration test coverage, written test-first (TDD red-green), with the suite green in CI.

**Plans**: TBD
**UI hint**: yes

### Phase 17: /family Deep Tree Visualization

**Goal**: Any linked member can explore the whole family as a pannable, zoomable tree with spouses shown paired, navigable at real (~10–23 generation) depth — closing out the milestone with full frontend coverage and a green, enforced CI suite.
**Depends on**: Phase 12, Phase 13, Phase 14 (the flat `familyTree` query and gating it relies on)
**Requirements**: TREE-01, TREE-02, TREE-03, TREE-04, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):

  1. A spike proves the chosen library's synthetic-union-node spouse-pairing pattern renders correctly against a realistic-depth fixture before the full `/family` page is built.
  2. A linked member can view the family as a tree on `/family`, with spouses shown paired, populated by a single flat whole-graph query assembled client-side (no per-node N+1).
  3. The tree supports pan/zoom and collapsible/expandable branches, remaining navigable at a ~10–23 generation depth without browser jank (collapsed-by-default initial render).
  4. `/family` is reachable only by linked members and admins.
  5. New frontend pages/components (`/manage`, `/family`, the pending gate) have component test coverage, and the family-tree suite runs and is enforced on every push/PR with CI green across the milestone.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15 → 16 → 17 (16 may run in parallel with 14/15 per dependency notes above)

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
| 12. Family Data Model Foundation | v2.0 | 2/4 | In Progress|  |
| 13. Membership Gating & Account Linking | v2.0 | 0/TBD | Not started | - |
| 14. Relationship Resolvers, Permission Scoping & Query Safety | v2.0 | 0/TBD | Not started | - |
| 15. Sibling Dedup Guard & /manage Self-Service UI | v2.0 | 0/TBD | Not started | - |
| 16. Photo Upload | v2.0 | 0/TBD | Not started | - |
| 17. /family Deep Tree Visualization | v2.0 | 0/TBD | Not started | - |
