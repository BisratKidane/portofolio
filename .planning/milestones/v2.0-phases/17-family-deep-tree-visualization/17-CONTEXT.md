# Phase 17: /family Deep Tree Visualization - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Any **linked member** (not just admins) can explore the whole family as a pannable, zoomable, collapsible tree on a new `/family` page. Spouses are shown paired, the tree is populated by a single flat whole-graph query assembled client-side (no per-node N+1), and it stays navigable at real ~10–23 generation depth via collapsed-by-default rendering. The phase closes the v2.0 milestone: `/family` (and the already-built `/manage` + pending gate) get component-test coverage, and the family-tree suite is enforced green in CI.

**In scope:** the `/family` route + tree component, the flat whole-graph read for linked members, pan/zoom/collapse/navigation, spouse-pairing render (proven by a spike first), read-only node interaction, and the QUAL-02/QUAL-03 test + CI closeout.

**Not in this phase (deferred to v2):** inline editing from tree nodes (CUR-01), duplicate-member merge tooling (CUR-02), multiple-marriage / half-sibling / adoption genealogy (GEN-01/02), and browser E2E tests. Editing stays on `/manage`.

</domain>

<decisions>
## Implementation Decisions

### Focal point & scope
- **D-01:** The tree is **one canonical top-down forest** — apex ancestors (members with no linked parents) at the top, generations descending. Every viewer sees the same structure; it is not re-rooted per user.
- **D-02:** On load, **auto-pan to and highlight the viewer's own node** ("jump-to-me"), plus a persistent "find me / recenter" control. Shared structure, personal landing point.
- **D-03:** **Primary lineage by default.** The lineage connected to the viewer renders on the initial canvas; other disconnected apex roots (e.g. an in-married spouse's separate parents) are collapsed/hidden behind an expander so the first paint stays focused.
- **D-04:** Initial expansion covers **both** (a) the ancestral spine — the single path from the apex ancestor down to the viewer — **and** (b) the viewer's own direct line: direct ancestors, direct descendants, spouse, and siblings. Collateral branches (cousins, aunts'/uncles' descendants) stay collapsed until clicked. Collapsed-by-default remains the rule for everything outside this expanded set (SC-3 performance).

### Navigation (all four aids)
- **D-05:** Ship all of: **find-me/recenter button**, **name search + pan-to**, **explicit zoom controls + fit-to-view/reset**, and a **minimap**.
- **D-06:** ⚠ **Minimap is native to `@xyflow/react`.** If the SC-1 spike forces the `family-chart` fallback, minimap availability is library-dependent — planning must treat minimap as conditional on the xyflow path, not a hard requirement of the fallback.

### Node content & interaction
- **D-07:** Each node shows **avatar + full name + birth–death years** (e.g. `1932–2001`). Avatar reuses the Phase 16 `MemberAvatarImage` (generic-person icon fallback).
- **D-08:** A node click opens a **read-only detail card** (popover/side-panel) with the member's full details (photo, dates, phone/address, relationships). `/family` stays a pure viewing surface — **no inline editing** (CUR-01 deferred).
- **D-09:** Node status markers: **(a) the viewer's own node is visually highlighted**, and **(b) a gender indicator** encodes `FamilyMember.gender` (Male/Female/Other). No deceased marker, no editable-scope marker. The gender cue must **not be color-only** (accessibility — pair color with an icon/shape/label).

### Layout & spouse pairing
- **D-10:** **Vertical top-down** orientation (apex ancestors up top, descendants below; dagre `rankdir TB`).
- **D-11:** **Spike xyflow first, fallback ready (SC-1).** Spike the synthetic-union-node spouse-pairing pattern on **`@xyflow/react` + `@dagrejs/dagre`** against a realistic-depth fixture. If it renders correctly, build on it; drop to **`family-chart`** only if the spike genuinely fails. The full `/family` build does not start until the spike passes.
- **D-12:** The exact spouse-pairing visual (research's candidate: adjacent couple joined by a short marriage connector, shared children descending from a synthetic union node) and edge styling (marriage vs descent) are **spike-driven** — locked once the spike proves what the chosen library renders cleanly at depth.

### Backend query & gating
- **D-13:** **Relax `familyMembers` from `requireAdmin` to `requireFamilyAccess`** so linked members and admins share one whole-tree read. This matches the app's established posture — **viewing is broad, writing stays scope-gated** (precedent: Phase 16 D-07/D-08). No mutation guards change; editable scope is unaffected.
- **D-14:** Consistency check for planning: relaxing the guard means a linked non-admin can now fetch the full member list via `familyMembers` (the query `ManagePage` already uses). This is intended per D-13. Verify no field on that payload leaks something that should stay admin-only; PII read-scope policy is flagged tech-debt (Phase 14 WR-10) — confirm it doesn't regress.
- **D-15:** `/family` route gating (TREE-04) **reuses the existing `<ProtectedRoute>`** (no `allowedRoles`), which already redirects unlinked non-admins to `/pending` (`frontend/src/components/ProtectedRoute.jsx:16`). Register `path="family"` alongside `dashboard`/`manage` under the same guard.

### Claude's Discretion
- **Flat payload shape (TREE-03):** whether edges travel as thin ID fields (`motherId`/`fatherId`/`spouseIds`) or as nested one-level `{id}` refs on the existing schema — planning picks once the resolver/DataLoader wiring is examined. Requirement: one query, no per-node N+1, client assembles the graph in memory.
- **Expand/collapse affordance:** how a node signals hidden branches (count badge vs plain toggle) — use whatever the chosen library renders cleanly at depth.
- **Spouse-pairing & edge styling (D-12):** spike-driven.
- **Component-test bar (QUAL-02):** default to **logic-heavy + render-smoke** — thoroughly unit-test the pure client-side graph assembly (flat nodes → tree, spouse pairing, collapse state, find-me/search targeting) and assert a render-smoke level for the canvas (nodes present, viewer highlighted, expand toggles state), mocking the layout lib where jsdom can't lay out SVG/absolute-positioned nodes. Adjust the exact split once the spike reveals the library's testability under jsdom.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TREE-01, TREE-02, TREE-03, TREE-04, QUAL-02, QUAL-03 (the 6 requirements this phase validates), plus the "Out of Scope" table (CUR-01/02, GEN-01/02, browser E2E).
- `.planning/ROADMAP.md` §"Phase 17: /family Deep Tree Visualization" — goal + 5 success criteria (spike-first, flat query + spouses paired, pan/zoom/collapse at depth, gating, component tests + CI green).
- `.planning/v2.0-MILESTONE-AUDIT.md` — confirms Phase 17 is the milestone-closeout binding for QUAL-02/QUAL-03 (CI currently green: backend 319, frontend 115).

### Prior-phase decisions to honor
- `.planning/phases/16-photo-upload/16-CONTEXT.md` — D-07/D-08 "viewing broad, writing scoped" posture (the basis for D-13); `MemberAvatarImage` + generic-icon placeholder reused by tree nodes (D-07).
- `.planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-CONTEXT.md` — `computeEditableScope`, request-scoped DataLoader factory, and depth-limit rule the flat query must stay compatible with (TREE-03 no-N+1).
- `.planning/phases/15-sibling-dedup-guard-manage-self-service-ui/15-CONTEXT.md` — `/manage` surfaces (the edit surface `/family` deep-links away from, if ever) and the `FamilyMembersTable` query shape already in use.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STACK.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md` — React 18 + MUI 6 + Vite, plain-axios GraphQL client (no Apollo Client), ESM/workspace conventions, Vitest + RTL + jsdom component-test patterns.

### Research carry-forward (from STATE.md blockers)
- Tree-library choice flagged MEDIUM confidence: `@xyflow/react` + `@dagrejs/dagre` primary vs `family-chart` fallback — **Phase 17 must spike the synthetic-union-node spouse-pairing pattern before committing** (SC-1 / D-11). No standalone ADR exists; this CONTEXT + ROADMAP are the source of truth.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/ProtectedRoute.jsx` — already gates linked-members-or-admin and redirects unlinked users to `/pending`; `/family` reuses it verbatim (D-15).
- `frontend/src/pages/ManagePage.jsx:39-41` — `FamilyMembersTable` query already selects `familyMembers { id firstname lastname fullname gender photoUrl linkedUser {...} }`; the tree's flat read extends this pattern (add relationship edges).
- `frontend/src/components/manage/MemberAvatarImage.jsx` — avatar with generic-icon fallback, reused for tree nodes (D-07).
- `frontend/src/api/graphqlClient.js` — plain-axios `graphqlRequest` helper (JWT attached); the tree fetches through it, no new transport needed.
- `backend/src/resolvers/familyMember.resolver.js:13-16` — the `familyMembers` resolver whose guard flips `requireAdmin` → `requireFamilyAccess` (D-13); `requireFamilyAccess` already imported/used at line 18.
- `backend/src/schemas/familyMember.schema.js` — `FamilyMember` type already exposes `mother`/`father`/`spouses`/`children`/`siblings` for client assembly; the flat payload selects from these (or thin ID fields per Claude's discretion).

### Established Patterns
- No tree/graph/viz library is installed yet (no d3/xyflow/dagre/family-chart in `frontend/package.json`) — the chosen lib is a net-new dependency added after the spike passes.
- Frontend uses **plain-axios GraphQL** (no Apollo Client / urql) — the flat whole-graph query is a single `graphqlRequest` call, assembled into a graph in component state/memory.
- Routes live in `frontend/src/App.jsx:15-32`; `/family` registers under the same `<ProtectedRoute>` block as `dashboard`/`manage`.
- Tests: Vitest + React Testing Library + jsdom (`*.test.jsx` colocated). `/manage` + pending already have green component tests (frontend suite = 115); `/family` adds to this, and QUAL-03 enforces the whole suite green on push/PR.

### Integration Points
- Backend `familyMembers` resolver guard (single-line change, D-13) + possible thin edge-ID fields on the schema (Claude's discretion) — must not trip the schema-drift/sync gate or the Phase 14 depth-limit rule.
- `AppLayout` nav — a `/family` link belongs alongside the existing member nav (planning to confirm placement).
- CI workflow (GitHub Actions) — QUAL-03 closeout: the family-tree suite runs and is enforced on every push/PR, green across the milestone.

</code_context>

<specifics>
## Specific Ideas

- The spike (SC-1 / D-11) is a hard gate: prove `@xyflow/react` + `@dagrejs/dagre` renders the synthetic-union-node spouse pairing correctly against a **realistic ~10–23 generation fixture** before any `/family` page work. `family-chart` is the documented fallback only if the spike fails.
- "Jump-to-me on a shared canonical tree" (D-01/D-02) is the guiding UX metaphor: one family, everyone lands on themselves.
- Viewing-broad / writing-scoped (D-13) is a conscious, already-established trust posture for this single-family app — not an oversight.
- Gender indicator (D-09) must be accessible (not color-only) — pair with icon/shape/label.

</specifics>

<deferred>
## Deferred Ideas

- **Inline editing from tree nodes (CUR-01)** — considered via the node-click question; explicitly kept out (D-08). `/family` is read-only; editing stays on `/manage`. v2.
- **Editable-scope node marker + "Edit in /manage" deep-link** — offered during node-marker/click discussion, not selected. Could be revisited if the read-only card ever needs a bridge to editing.
- **Duplicate-merge tooling (CUR-02), multiple-marriage/half-sibling/adoption genealogy (GEN-01/02)** — out of scope per REQUIREMENTS.md; the model supports one mother/father + spouse only.
- **Browser E2E (Playwright/Cypress)** — out of scope; component + integration tests meet the safety-net bar.

*None of the above are scope creep into this phase — all are pre-existing v2/out-of-scope items reaffirmed during discussion.*

</deferred>

---

*Phase: 17-family-deep-tree-visualization*
*Context gathered: 2026-07-24*
