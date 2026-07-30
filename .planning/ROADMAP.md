# Roadmap: Portfolio Auth App — Testing Foundation, Collaborative Family Tree & Ge'ez Native-Script Names

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- ✅ **v1.1 Security Remediation** — Phases 7–11 (shipped 2026-07-21)
- ✅ **v2.0 Collaborative Family Tree** — Phases 12–17 (shipped 2026-07-25)
- 🚧 **v3.0 Ge'ez Native-Script Names** — Phases 18–23 (in progress)

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

### 🚧 v3.0 Ge'ez Native-Script Names (Phases 18–23, in progress)

**Milestone Goal:** Family members can carry their name in Ge'ez script (ግዕዝ) alongside the existing Latin name, rendered with a self-hosted Ge'ez-capable webfont so it displays correctly on every device — deepening the app's fit for the Tigrinya/Eritrean family it serves.

- [x] **Phase 18: Data Model & Migration** - Ge'ez name columns exist on `family_members`, with a correctly-derived `geezFullname`, before anything above depends on them. (completed 2026-07-30)
- [ ] **Phase 19: GraphQL Layer** - Ge'ez name fields are readable and writable over the GraphQL API.
- [ ] **Phase 20: Self-Hosted Font & Theme** - Ge'ez script renders correctly and consistently via a self-hosted webfont, with zero CDN dependency and no Latin regression.
- [ ] **Phase 21: Shared Display Helper** - One helper drives Latin/Ge'ez precedence and empty-handling identically everywhere.
- [ ] **Phase 22: Render Surfaces (Read Path)** - A member's Ge'ez name is visible on `/family` tree cards and across `/manage`, and searchable in the admin table.
- [ ] **Phase 23: Write Path & Quality Gate** - Ge'ez names can be entered/edited via existing dialogs and found via the add-relative picker, with the full suite green and a manual glyph sign-off closing the milestone.

## Phase Details

### Phase 18: Data Model & Migration
**Goal**: Family members can store an optional Ge'ez name in the database, with a correctly-derived combined field, before any API or UI depends on it.
**Depends on**: Nothing (first phase of v3.0; builds on the existing v2.0 `FamilyMember` model)
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. A manual migration (`018-*.sql`) adds three nullable `utf8mb4` columns (`geezFirstname`, `geezLastname`, `geezMothersname`) to `family_members`, using bare `CHARACTER SET utf8mb4` with no `utf8mb4_0900_ai_ci` collation and no `ENCRYPTION` clause, and applies cleanly against both local MariaDB and (documented) MySQL 8.4.
  2. `FamilyMember.js` exposes the three new attributes plus a `geezFullname` VIRTUAL getter that joins only the present parts.
  3. `geezFullname` is unit-tested across none/first-only/last-only/mothersname-only/all-filled combinations: no stray leading/trailing space, no literal `"null"`/`"undefined"` strings, and `null` (not `""`) when no Ge'ez parts are set.
  4. Existing members with no Ge'ez data continue to boot, query, and serialize without error (backward-compatible column addition).
**Plans**: 2 plans

Plans:
- [x] 18-01-PLAN.md — FamilyMember model: Ge'ez STRING attrs + defensive geezFullname VIRTUAL getter, TDD red-green (DATA-01, DATA-02)
- [x] 18-02-PLAN.md — Portable 018 manual migration SQL + local MariaDB portability proof + README doc entry (DATA-01)

### Phase 19: GraphQL Layer
**Goal**: Ge'ez name fields are readable and writable through the GraphQL API using the existing spread-passthrough resolvers, with zero new resolver logic.
**Depends on**: Phase 18
**Requirements**: DATA-03
**Success Criteria** (what must be TRUE):
  1. `geezFirstname`, `geezLastname`, `geezMothersname`, and `geezFullname` are exposed on the `FamilyMember` GraphQL type and included in the relevant query selections.
  2. `NewFamilyMemberInput`/`EditFamilyMemberInput` accept the three Ge'ez fields, persisted via the existing create/update resolvers with no new resolver code.
  3. The three Ge'ez fields are added to `OPTIONAL_FAMILY_MEMBER_FIELDS`, so clearing a Ge'ez field via the API persists `null`, not an empty string — proven by an integration test.
  4. A GraphQL integration test creates and edits a member with Ge'ez fields and asserts a correct round-trip read-back.
**Plans**: TBD

### Phase 20: Self-Hosted Font & Theme
**Goal**: Ge'ez script renders correctly and consistently on every device via a self-hosted webfont, with zero CDN dependency and no regression to existing Latin rendering.
**Depends on**: Nothing (independent of Phases 18–19; can be built and visually verified in parallel using any existing `Typography` pasted with Ge'ez text)
**Requirements**: FONT-01, FONT-02
**Success Criteria** (what must be TRUE):
  1. `@fontsource/noto-sans-ethiopic` is installed and imported locally (no external CDN `<link>`), confirmed by a network trace showing zero external font requests.
  2. Ge'ez text — including real Tigrinya name fixtures covering labialized consonant forms (e.g. ቨ, ቐ) from the main Ethiopic Unicode block — renders with correct glyphs across at least two browser/OS combinations (manual visual sign-off; jsdom cannot assert glyph rendering).
  3. Both `theme.js` font-stack constants (`FONT_SANS` and `FONT_DISPLAY`) include the Ge'ez font ahead of any OS-fallback font.
  4. Latin text continues rendering in the existing Inter/Sora fonts via per-character fallback with `font-display: swap`, and a manual pass on the `/family` tree cards shows no FOUT-driven layout shift.
**Plans**: TBD
**UI hint**: yes

### Phase 21: Shared Display Helper
**Goal**: One shared helper drives the Latin/Ge'ez display precedence and empty-handling rule identically across every render surface, preventing per-component drift.
**Depends on**: Phase 18 (Ge'ez fields must exist on the member shape the helper reads from)
**Requirements**: VIEW-03
**Success Criteria** (what must be TRUE):
  1. `frontend/src/utils/displayName.js` exports a helper that derives the Ge'ez name (or an explicit "no Ge'ez name" signal) from a member object, unit-tested across none/partial/all-filled cases.
  2. The helper attaches a `lang="ti"` marker to every Ge'ez text run it produces, with no `dir`/bidi change (Ge'ez is LTR).
  3. The helper's "no Ge'ez name" signal is distinct from an empty string, so every consumer can conditionally render nothing (no empty row, dash, or separator) rather than re-deriving the check itself.
**Plans**: TBD

### Phase 22: Render Surfaces (Read Path)
**Goal**: A member's Ge'ez name is visible everywhere the Latin name already appears — tree cards and `/manage` — without breaking existing layouts, and is searchable in the admin table.
**Depends on**: Phase 19 (API), Phase 20 (font), Phase 21 (shared helper)
**Requirements**: VIEW-01, VIEW-02, FIND-01
**Success Criteria** (what must be TRUE):
  1. On `/family`, a member card with a Ge'ez name shows it stacked below the Latin name; a member without one shows no extra row, dash, or separator — verified against the fixed 252×120px card using the longest real Ge'ez name in the actual dataset.
  2. Across `/manage` — relationship panels and the admin member table — a member's Ge'ez name appears alongside the Latin name when present, with every surface calling the shared `displayName` helper rather than re-deriving the precedence rule.
  3. The `/manage` admin member-table search box matches typed Ge'ez text in addition to Latin (substring match).
  4. The render-path query/selection-set constants (`FAMILY_TREE_QUERY`, `EDITABLE_MEMBER_FIELDS`, `FAMILY_MEMBERS_QUERY`) all include the Ge'ez fields needed to render them.
**Plans**: TBD
**UI hint**: yes

### Phase 23: Write Path & Quality Gate
**Goal**: Family members can enter/edit Ge'ez names via the existing Manage dialogs and be found by Ge'ez name in the add-relative picker, and the milestone closes with the full test suite green and a manual glyph sign-off.
**Depends on**: Phase 21 (shared helper), Phase 22 (rendering proven correct before wiring end-user input, per this app's test-first convention)
**Requirements**: EDIT-01, FIND-02, QUAL-01
**Success Criteria** (what must be TRUE):
  1. In the Manage add-relative and edit-member dialogs, a user can enter and update the Ge'ez first name, last name, and mother's name using their own device keyboard/IME, and the values persist and round-trip correctly on reopen.
  2. The Manage add-relative Autocomplete picker matches typed Ge'ez text via a custom `filterOptions`, without changing the visible (Latin-only) option label.
  3. The `displayName` helper and `geezFullname` derivation unit tests (from Phases 18 and 21) remain green, and the full `npm test` suite (backend + frontend) passes in CI at milestone close.
  4. A manual glyph/visual sign-off gate — real Tigrinya name fixtures checked on `/family` and `/manage` — is completed and recorded before the milestone ships.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order (v3.0):**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23. (Phase 20 has no dependency on 18/19 and may be executed in parallel if desired.)

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
| 18. Data Model & Migration | v3.0 | 2/2 | Complete   | 2026-07-30 |
| 19. GraphQL Layer | v3.0 | 0/TBD | Not started | - |
| 20. Self-Hosted Font & Theme | v3.0 | 0/TBD | Not started | - |
| 21. Shared Display Helper | v3.0 | 0/TBD | Not started | - |
| 22. Render Surfaces (Read Path) | v3.0 | 0/TBD | Not started | - |
| 23. Write Path & Quality Gate | v3.0 | 0/TBD | Not started | - |
