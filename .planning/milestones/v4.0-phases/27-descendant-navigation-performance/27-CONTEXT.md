# Phase 27: Descendant Navigation & Performance - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the **actual descendant navigation** onto the existing `/detail` page: turn
`PersonCard`'s already-exposed `expanded`/`onExpand` affordance into a working
expand/collapse that reveals a person's direct children in a responsive
per-generation grid, capped at **three generations shown at once** with a
**forward-shift** when a grandchild is expanded, all **loaded lazily** (never the
whole tree) and **cached for the session**.

**In scope:** the expand/collapse behavior; the responsive children grid grouped
by generation (≤3 cards/row desktop → 1 on mobile); the group-level parent→children
relation cue; the 3-generation cap + forward-shift-on-grandchild-expand and its
symmetric undo; per-generation lazy fetch of direct children (via the Phase-24
`familyMember(id) { children … }` read); and a session-scoped in-memory cache that
serves repeat expand/collapse without refetch or needless re-renders.

**Out of scope (later phases):** admin add-child / add-spouse / edit wiring and any
cache invalidation those mutations require — Phase 28 (this phase only *provides* a
cache Phase 28 can later refresh); keyboard operability / WCAG AA contrast / final
mobile-layout polish as a graded gate — Phase 29 (build accessibly, but the audit
is Phase 29); a 4th simultaneous generation; ancestor (upward) navigation beyond
undoing a forward-shift; `/detail/:id` deep links. The `PersonCard` component
(Phase 25), the `/detail` page + search + states (Phase 26), and the backend read
queries (Phase 24) already exist — this phase composes them.

Requirements covered: **NAV-01, NAV-02, NAV-03, NAV-04, PERF-01, PERF-03**.
(PERF-02 — N+1-free reads — already delivered in Phase 24.)

</domain>

<decisions>
## Implementation Decisions

### Expand / collapse scope (NAV-01, NAV-02, NAV-03)
- **D-01 (one branch at a time):** When a generation holds several siblings that
  each have children and the user expands one, then expands a **second** sibling,
  the **first auto-collapses**. Only ever one parent's children are shown in the
  generation below, so the view follows a **single lineage** downward. This keeps
  the grid to ≤3 columns of grandchildren and makes the 3-generation cap
  unambiguous. Rejected: allowing multiple sibling broods open simultaneously
  (denser, requires grouping grandchildren by parent).
- **D-02 (collapse hides everything beneath):** Collapsing a person hides **all**
  descendants below them, and the expand control visibly reflects
  expanded-vs-collapsed state (PersonCard already rotates its chevron via
  `expanded` — drive it, don't rebuild it) — NAV-02.

### Forward-shift & going back up (NAV-03, NAV-04)
- **D-03 (forward-shift on grandchild expand):** As specified by NAV-04 — expanding
  a **grandchild who has children** shifts the view forward one generation: the
  grandparent and the selected grandchild's parent's siblings drop, the **parent
  becomes the new top person**, the grandchild remains that parent's child, and the
  grandchild's children become the third generation. No full page reload.
- **D-04 (collapse reverses the shift — symmetric undo):** The **collapse control
  is the only "back" mechanism** — collapsing the promoted top-person walks the
  view **back up one generation**, restoring the dropped grandparent as top with
  its full set of children (the pre-shift view). This requires the nav layer to
  keep a **view-history stack** of prior frames so a shift can be un-done exactly.
  Rejected: a breadcrumb trail (extra UI + its own a11y/responsive treatment) and
  reset-to-head-only (loses the user's place). Note: at the un-shifted top (head,
  no shift yet) collapsing the top card is just an ordinary collapse — the
  walk-back-up behavior only applies to frames pushed by a forward-shift.

### Grid layout & parent→children connector (NAV-01)
- **D-05 (responsive generation grid):** Children render in a **responsive grid
  grouped by generation** — ≤3 cards/row on desktop, fewer on tablet, **1 on
  mobile** (NAV-01). Cards are the existing fluid-width `PersonCard` (Phase 25 D-03)
  — they flex to fill the column; no fixed-pixel box.
- **D-06 (group-level inverted-V relation cue):** The parent→children relation is
  shown by a **single subtle inverted-V (∧) apex on the whole children container** —
  apex at the top pointing **up** toward the parent/couple, opening downward over
  the row of children. It is **one group-level cue, NOT a separate edge drawn to
  each child card**. Render it as a light line/chevron in the **theme line color**
  (restrained styling, consistent with the app) — not a heavy `/family`-style tree
  edge. This is the user's explicit design call; do not substitute per-child lines.
- **D-07 (spouse beside the parent, children beneath the couple):** A displayed
  person's **spouse stays laterally paired beside them** using PersonCard's existing
  dashed spouse-connector pairing (Phase 25 D-12/D-14 — single last spouse, lateral,
  never counts toward the generation cap), and the **children group hangs beneath the
  couple** — reading as "these two → their children," matching the family model where
  children belong to the couple.

### Performance: lazy load + session cache (PERF-01, PERF-03)
- **D-08 (lazy per-generation fetch):** Opening `/detail` loads only the main person
  (Phase 26 already does this); a person's **direct children are fetched only when
  that person is expanded** — never the whole tree (PERF-01). Reuse the Phase-24
  read: `familyMember(id) { children { <card fields>, children { id }, spouses { … } } }`
  so each fetched child arrives with its own child-count (array length, Phase 24 D-05)
  and spouse(s) in one bounded, N+1-free request (PERF-02, already proven).
- **D-09 (session-scoped in-memory cache):** Descendants already loaded this session
  are held in an **in-memory cache keyed by person id**; a repeat expand/collapse (or
  re-expanding after a forward-shift/undo) is served **from cache with no refetch**,
  no duplicate requests, and no needless re-renders (PERF-03). The cache persists for
  the page session and survives a search-driven main-person reset (already-loaded
  nodes stay cached).

### Claude's Discretion
- **Cache invalidation is deferred to Phase 28** (the unpicked gray area): this phase
  provides a read-through session cache but does NOT implement mutation-driven
  refresh. When Phase 28 adds admin add-child / add-spouse / edit, it is responsible
  for updating/invalidating the relevant cache entries. Build the cache with a shape
  that Phase 28 can invalidate per-id (don't paint it into a corner).
- Loading feel **during an expand** (spinner on the expanding card vs a skeleton row
  in the opening grid) — pick something consistent with `DetailPage`/`FamilyTreePage`
  idioms; not separately specified.
- Whether the forward-shift and grid changes animate or snap — either is fine; keep
  it lightweight and non-janky. No animation was requested.
- Exact rendering technique for the inverted-V apex (CSS pseudo-element / small SVG /
  bordered box) and its precise size/stroke — reuse the theme line color and the
  app's restrained visual language (D-06).
- Where the nav/view state lives (page state in `DetailPage` vs a dedicated
  `useDescendantNav` hook holding the view-frame stack + cache) — keep `PersonCard`
  presentational (Phase 25) and the page/hook owning fetch + state, per the existing
  "page-owns-fetch, card-is-presentational" pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 27: Descendant Navigation & Performance" — goal +
  the 4 success criteria (authoritative for what must be TRUE, incl. the exact
  forward-shift definition).
- `.planning/REQUIREMENTS.md` — **NAV-01, NAV-02, NAV-03, NAV-04, PERF-01, PERF-03**
  (this phase) plus the v4.0 milestone goal. (PERF-02 is done — Phase 24.)
- `.planning/PROJECT.md` § "Current Milestone: v4.0" — the "Expand / collapse +
  3-generation navigation", "Spouse visualization", and "Performance" target-feature
  bullets.

### The page this phase extends (Phase 26)
- `.planning/phases/26-detail-page-search-initial-load/26-CONTEXT.md` — the `/detail`
  page's uniform head-id → `familyMember(id)` load path (D-04/D-05 there), page-owns-
  fetch / card-is-presentational pattern, and the six edge/empty states already built.
- `frontend/src/pages/DetailPage.jsx` — the actual page: holds `mainPerson` state,
  `loadPersonById`, and currently renders the head `PersonCard` with `onExpand={() => {}}`
  **inert** — this phase makes it live. `FAMILY_MEMBER_QUERY` here fetches
  `children { id }` only (count); expansion must extend the read to fetch child card
  fields + grandchild counts + spouses.
- `frontend/src/pages/DetailPage.test.jsx` — page test patterns to extend.

### The card this phase drives (Phase 25)
- `.planning/phases/25-reusable-personcard/25-CONTEXT.md` — PersonCard contracts:
  `expanded`/`onExpand` (D-07 there), fluid width flexing to grid column (D-03 there),
  single-last lateral spouse that never counts toward the cap (D-12/D-13/D-14 there),
  role-label prop (D-05 there — supply `Child`/`Grandchild` from the nav layer).
- `frontend/src/components/person/PersonCard.jsx` + `PersonCard.test.jsx` — the actual
  component API: `{ member, role, spouse, isSpouse, expanded, onExpand, onEdit }`; the
  footer expand control renders only when `member.children.length >= 1`; spouse card is
  a non-expandable leaf. **Advisory (Phase 25 review):** `onExpand`/`onEdit` are invoked
  unguarded — this page must pass real handlers or no-ops.

### Backend reads this phase consumes (Phase 24)
- `.planning/phases/24-backend-read-layer-for-detail/24-CONTEXT.md` — direct-children
  read + "no `childCount` field, derive from `children { id }` length" (D-05 there);
  the bounded/N+1-free guarantee (PERF-02).
- `backend/src/schemas/familyMember.schema.js` — `familyMember(id)` query + the
  `FamilyMember` type fields available (`children`, `spouses`, `fullname`,
  `geezFullname`, `gender`, `isAlive`, `photoUrl`, `canEdit`, …).
- `backend/src/resolvers/familyMember.resolver.js` — resolver behavior + DataLoader
  batching that keeps nested `children`/`spouses` reads flat.

### Reusable frontend assets & conventions to mirror
- `frontend/src/api/graphqlClient.js` — `graphqlRequest` for the per-generation reads.
- `frontend/src/components/family/` (`FamilyTreeCanvas.jsx`, `familyTree.layout.js`,
  `MemberNode.jsx`) — `/family`'s spouse-pairing + connector visual language for
  reference only; **D-06 deliberately diverges** to a lighter group-level inverted-V,
  so mirror the *color/restraint*, not the full tree edges.
- `frontend/src/theme.js` — `colors` (line color for the D-06 apex, gender tints).
- `frontend/src/utils/genderTheme.js`, `frontend/src/utils/displayName.js` — already
  used inside `PersonCard`; no direct use expected here but referenced by the cards.

### Testing conventions
- `.planning/codebase/TESTING.md` — frontend Vitest + RTL + jsdom setup.
- `DetailPage.test.jsx`, `PersonCard.test.jsx`, and sibling page tests
  (`FamilyTreePage.test.jsx`) — page/interaction test patterns (mock `graphqlRequest`,
  assert lazy fetch fires only on expand, assert cache prevents a second request).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`DetailPage`** (`pages/DetailPage.jsx`): the host — already owns `mainPerson`
  fetch/state and renders the head `PersonCard` with an **inert** `onExpand`. This
  phase adds the descendant-nav state (view-frame stack + child cache) and makes
  `onExpand` live. Likely a dedicated `useDescendantNav` hook to keep the page lean.
- **`PersonCard`** (`components/person/PersonCard.jsx`): renders head/child/grandchild
  identically; already exposes `expanded`/`onExpand`/`role`/`spouse` and gates the
  expand control on `children.length` — the nav layer just supplies state + handlers
  and lays cards into the grid.
- **`graphqlRequest`** (`api/graphqlClient.js`): all per-generation child reads.
- **Phase-24 `familyMember(id)` read**: extend `DetailPage`'s existing query (or add a
  children-focused variant) to pull child card fields + grandchild counts + spouses in
  one bounded call when a person is expanded.

### Established Patterns
- **Page-owns-fetch, card-is-presentational** (Phase 25/26): keep all fetch, cache,
  and view-frame state in the page/hook; `PersonCard` stays props-only.
- **Uniform person-by-id read** (Phase 26 D-04): the same `familyMember(id)` shape
  loads the main person and (extended with `children { … }`) each expansion.
- **Child count = `children` array length** (Phase 24 D-05 / Phase 25 D-07): no
  `childCount` field — derive it; drives both the count copy and expand-control gating.
- **Single last lateral spouse** (Phase 25 D-14): spouses never count toward the cap.

### Integration Points
- **`onExpand`/`expanded` on `PersonCard`** ← the nav layer's expand/collapse + shift
  logic (D-01–D-04).
- **`role` prop on `PersonCard`** ← nav layer supplies `Head`/`Child`/`Grandchild`
  based on each card's generation in the current frame.
- **The children grid + inverted-V group cue (D-05/D-06)** is a **new layout wrapper**
  the nav layer renders around each expanded person's `PersonCard` children — it does
  not live inside `PersonCard`.
- **Session cache (D-09)** is read by every expand; **Phase 28** will hook mutation-
  driven invalidation into it.

</code_context>

<specifics>
## Specific Ideas

- Navigation should feel like **following one lineage**: expand walks down a single
  branch (D-01), collapse walks back up and un-does a forward-shift symmetrically
  (D-04) — no breadcrumbs, no separate "back" chrome.
- The parent→children relation is communicated by **one calm inverted-V (∧) apex over
  the whole children group** in the theme line color — explicitly lighter than
  `/family`'s tree edges, and explicitly *not* a line per child (user's design call).
- Couples read as a unit: **spouse beside the person, their shared children beneath the
  couple**, reusing the existing dashed spouse pairing.
- It must feel **instant on repeat**: already-loaded descendants come from the session
  cache with no second request and no flicker.

</specifics>

<deferred>
## Deferred Ideas

- **Cache invalidation / refresh after admin mutations** — Phase 28 (add-child /
  add-spouse / edit). This phase provides a per-id-invalidatable cache but does not
  wire mutation refresh.
- **Admin add-child / add-spouse / edit affordances** on `/detail` — Phase 28
  (`PersonCard` already renders the gated edit button; `onEdit` stays inert here).
- **Keyboard operability, WCAG AA contrast, final mobile polish as a graded gate** —
  Phase 29 (build accessibly now; the audit + fixes land there).
- **A 4th simultaneous generation / multiple sibling broods open at once** — rejected
  by the 3-gen cap (NAV-03) and D-01.
- **Breadcrumb / ancestor navigation and `/detail/:id` deep links** — deferred v4.0
  Future Requirements (undo-via-collapse is the only upward move this phase adds).

None of these are in-scope for Phase 27.

</deferred>

---

*Phase: 27-descendant-navigation-performance*
*Context gathered: 2026-08-03*
