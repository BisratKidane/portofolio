# Roadmap: Portfolio Auth App — Testing Foundation, Collaborative Family Tree, Ge'ez Native-Script Names & Family Detail Navigation

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- ✅ **v1.1 Security Remediation** — Phases 7–11 (shipped 2026-07-21)
- ✅ **v2.0 Collaborative Family Tree** — Phases 12–17 (shipped 2026-07-25)
- ✅ **v3.0 Ge'ez Native-Script Names** — Phases 18–23 (shipped 2026-07-31)
- 🚧 **v4.0 Family Detail & Descendant Navigation** — Phases 24–29 (in progress)

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

### 🚧 v4.0 Family Detail & Descendant Navigation (In Progress)

**Milestone Goal:** A new `/detail` page (all authenticated users) that opens on the family head in a reusable person card, supports Latin + Ge'ez name search to reset the main person, and lets users expand children → grandchildren on demand — capped at three generations with forward-shift navigation — showing each displayed person's spouse(s) alongside them, with admin-only add-child/add-spouse and edit (backend-enforced, reusing existing flows), loaded lazily.

- [x] **Phase 24: Backend Read Layer for /detail** - GraphQL reads (head, person-by-id, name search, direct-children+counts, spouses, edit-permission) with no schema change and no N+1 (completed 2026-08-03)
- [x] **Phase 25: Reusable PersonCard** - one card component renders head/children/grandchildren with all supported fields, gender cues, child count, and spouse(s) (completed 2026-08-03)
- [x] **Phase 26: /detail Page, Search & Initial Load** - authenticated route opening on the family head, with Latin+Ge'ez inline search to reset the main person, and full state coverage (completed 2026-08-03)
- [ ] **Phase 27: Descendant Navigation & Performance** - expand/collapse grid grouped by generation, 3-generation cap with forward-shift, lazy loading + session cache
- [ ] **Phase 28: Admin Actions on /detail** - admin-only edit/add-child/add-spouse reusing existing dialogs, backend-enforced
- [ ] **Phase 29: Accessibility, Responsive & Quality Gate** - keyboard operability, WCAG AA contrast, mobile layout, full-suite green at close

## Phase Details

### Phase 24: Backend Read Layer for /detail

**Goal**: The GraphQL API exposes every read `/detail` needs — family head, person-by-id, Latin+Ge'ez name search, direct-children-with-counts, spouse data, and the caller's edit-permission signal — reusing existing models/relationships with no DB schema change, and without N+1 queries.
**Depends on**: Nothing new (foundation phase for v4.0; builds on the existing v2.0/v3.0 `FamilyMember` model, DataLoaders, and `requireAdmin`/`requireFamilyAccess` guards)
**Requirements**: API-01, PERF-02
**Success Criteria** (what must be TRUE):

  1. A GraphQL query returns the family head (the tree's top ancestor) as a `FamilyMember`.
  2. A GraphQL query returns a single person by id with every field the person card needs (Latin + Ge'ez name, gender, birth/death info, photo).
  3. A GraphQL query returns name-search matches against both Latin (partial, case-insensitive) and Ge'ez name fields.
  4. A GraphQL query returns a person's direct children only (not the full descendant tree), each annotated with its own child count and spouse(s), proven by an integration test that the query issues a bounded/flat set of SQL statements regardless of child count (no N+1).
  5. A GraphQL field/query exposes whether the current caller may edit/add relatives, reusing the existing admin check.

**Plans**: 3 plans (2 waves)

Plans:
**Wave 1**

- [x] 24-01-PLAN.md — Bounded `familyHead` query (SC-1) + `searchFamilyMembers` query (SC-3)
- [x] 24-02-PLAN.md — SC-4/PERF-02 bounded-SQL N+1 proof for direct-children + spouses

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 24-03-PLAN.md — `canEdit` field (SC-5) + SC-2 person-by-id field-coverage verification

### Phase 25: Reusable PersonCard

**Goal**: A single reusable `PersonCard` component renders any person (head, child, or grandchild) with all supported fields, correct gender + child-count/expand affordances, and their spouse(s) alongside them.
**Depends on**: Phase 24 (card fields mirror the person-by-id/spouse read shape)
**Requirements**: CARD-01, CARD-02, CARD-03, CARD-04, SPOUSE-01
**Success Criteria** (what must be TRUE):

  1. `PersonCard` renders avatar, Latin name, Ge'ez name (when present), gender, birth info, death info, and relationship info when relevant — omitting any field that has no value, with no empty labels.
  2. The exact same `PersonCard` component instance renders the head, every child, and every grandchild — no parallel/duplicate card component exists.
  3. Gender is shown with the app's existing color convention plus a non-color icon/label cue, and never breaks the layout when gender is unknown/undefined.
  4. Child count shows only when a person has ≥1 child (correct `1 child`/`N children` singular/plural) and the expand control appears only when a person has ≥1 child.
  5. Every displayed person's spouse(s) render alongside them using the existing partnered/dashed-connector convention from `/family`, without counting toward the generation cap.

**Plans**: 2 plans (2 waves)

Plans:
**Wave 1**

- [x] 25-01-PLAN.md — genderTheme extraction + PersonCard core (CARD-01, CARD-02, CARD-03, CARD-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 25-02-PLAN.md — Spouse pairing composition + phase-close regression gate (SPOUSE-01)

**UI hint**: yes

### Phase 26: /detail Page, Search & Initial Load

**Goal**: The `/detail` page is reachable by any authenticated user, opens on the family head, and lets users search by Latin or Ge'ez name to reset the main person — all backed by existing loading/error/empty-state components.
**Depends on**: Phase 24 (search + head + person-by-id reads), Phase 25 (PersonCard)
**Requirements**: DETAIL-01, DETAIL-02, DETAIL-03, SEARCH-01, SEARCH-02, SEARCH-03
**Success Criteria** (what must be TRUE):

  1. An authenticated user can navigate to `/detail`; an unauthenticated user is redirected to login like every other protected route.
  2. On first load `/detail` shows only the family head's `PersonCard`, with no descendants expanded.
  3. Loading, no-search-results, no-children, failed-request, missing-family-head, and missing-person-info states all render via the app's existing components — never an empty or broken card.
  4. Typing in the search bar surfaces inline suggestions (no separate page) matching partial/full Latin (case-insensitive) or Ge'ez first/last names, each showing avatar, full Latin name, full Ge'ez name (when present), birth year, and family context.
  5. Selecting a suggestion clears the current view and makes that person the new main person, shown alone with descendants collapsed.

**Plans**: 2 plans (2 waves)

Plans:
**Wave 1**

- [x] 26-01-PLAN.md — /detail protected route, initial-load-on-head, edge/empty states + nav wiring (DETAIL-01/02/03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 26-02-PLAN.md — Inline debounced Latin+Ge'ez search; select resets the main person (SEARCH-01/02/03)

**UI hint**: yes

### Phase 27: Descendant Navigation & Performance

**Goal**: Users can expand a person's card to reveal children grouped by generation, capped at three simultaneous generations with a forward-shift on deeper expansion, loaded lazily and cached for the session.
**Depends on**: Phase 24 (direct-children reads), Phase 26 (`/detail` page hosting the navigation)
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, PERF-01, PERF-03
**Success Criteria** (what must be TRUE):

  1. Expanding a person's card loads and displays their direct children in a responsive grid grouped by generation (≤3 cards/row desktop, fewer on tablet, 1 on mobile) with a visible connector showing parent→child grouping.
  2. Re-clicking the expand control collapses that person's children and hides all descendants beneath them, with the control visibly reflecting expanded vs. collapsed state.
  3. No more than three generations are ever shown at once; expanding a grandchild with children shifts the view forward one generation (the grandparent and the parent's siblings drop, the parent becomes the new top person, the grandchild remains their child, and the grandchild's children become the third generation) — all without a full page reload.
  4. Opening `/detail` or expanding a card fetches only the data needed for that step (never the whole tree), and descendants already loaded this session are served from cache — no duplicate requests or unnecessary re-renders on repeat expand/collapse.

**Plans**: 4 plans (3 waves)

Plans:
**Wave 1**

- [x] 27-01-PLAN.md — Descendant-nav reducer: expand/collapse, sibling auto-collapse, forward-shift + symmetric undo (NAV-02/03/04)
- [ ] 27-02-PLAN.md — GenerationGrid: responsive per-generation grid + group-level inverted-V connector (NAV-01)

**Wave 2** *(blocked on 27-01)*

- [ ] 27-03-PLAN.md — useDescendantNav hook: session cache + expand-only lazy fetch (PERF-01/PERF-03)

**Wave 3** *(blocked on 27-02, 27-03)*

- [ ] 27-04-PLAN.md — Wire useDescendantNav + GenerationGrid into DetailPage; end-to-end NAV/PERF proof

**UI hint**: yes

### Phase 28: Admin Actions on /detail

**Goal**: Admins can edit a displayed person or add a child/spouse to them, reusing the existing dialogs end to end, with every action enforced server-side.
**Depends on**: Phase 24 (edit-permission signal, existing mutations), Phase 25 (card hosting the controls), Phase 27 (children/spouse refresh after add)
**Requirements**: PERM-01, PERM-02, PERM-03
**Success Criteria** (what must be TRUE):

  1. An admin sees an edit button on every person card that opens the existing `EditMemberDialog`; a non-admin never sees it.
  2. An admin sees a control to add a child or spouse to a displayed person, opening the existing `AddRelativeDialog`; after a successful add, that person's children/spouses refresh in place. A non-admin never sees it.
  3. Sending an edit/add mutation as a non-admin (bypassing the UI) is rejected server-side by the existing guards, proven by an adversarial test exercised from this new surface.

**Plans**: TBD
**UI hint**: yes

### Phase 29: Accessibility, Responsive & Quality Gate

**Goal**: `/detail` is fully keyboard-operable and screen-legible on mobile, and the milestone closes with the whole automated suite green.
**Depends on**: Phase 25, Phase 26, Phase 27, Phase 28 (verifies the finished surface)
**Requirements**: A11Y-01
**Success Criteria** (what must be TRUE):

  1. Expand/collapse controls and search suggestions are operable via keyboard alone, with accessible labels and a visible focus state on every interactive element.
  2. Text/background contrast on `/detail`'s new surfaces meets WCAG AA.
  3. `/detail`'s layout stays readable and usable at mobile viewport widths.
  4. The full `npm test --workspaces` suite is green with no new regressions at milestone close, consistent with this project's TDD/CI convention.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order (v4.0):**
Phases execute in numeric order: 24 → 25 → 26 → 27 → 28 → 29.

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
| 27. Descendant Navigation & Performance | v4.0 | 1/4 | In Progress|  |
| 28. Admin Actions on /detail | v4.0 | 0/TBD | Not started | - |
| 29. Accessibility, Responsive & Quality Gate | v4.0 | 0/TBD | Not started | - |
