# Phase 26: /detail Page, Search & Initial Load - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **`/detail` page** itself: a protected route that, on first load,
shows only the family head in a single Phase-25 `PersonCard`, plus an inline
name-search that resets the "main person," backed entirely by existing
loading/error/empty-state components and the Phase-24 read queries.

**In scope:** the `/detail` route + a nav entry point; initial-load-on-head;
the inline search bar with live suggestions (Latin + Ge'ez); selecting a
suggestion to make that person the new main person (shown alone, descendants
collapsed); and the six named states (loading, no-search-results, no-children,
failed-request, missing-family-head, missing-person-info).

**Out of scope (later phases):** descendant expand/collapse, the responsive
per-generation grid, and the 3-generation forward-shift navigation (Phase 27);
lazy per-generation loading + session caching (Phase 27); admin add-child /
add-spouse / edit wiring (Phase 28). The `PersonCard` component and the backend
read queries already exist (Phases 25 and 24) — this phase composes them.

Requirements covered: **DETAIL-01, DETAIL-02, DETAIL-03, SEARCH-01, SEARCH-02,
SEARCH-03**.

</domain>

<decisions>
## Implementation Decisions

### Search interaction (SEARCH-01, SEARCH-02)
- **D-01:** The search uses **live, debounced suggestions** — suggestions render
  inline below the bar *as the user types* (no separate results page, no
  submit-to-search step), each keystroke driving the Phase-24
  `searchFamilyMembers(term:)` query. Mirror the MUI **`Autocomplete`** idiom
  already used in `AddRelativeDialog.jsx` / `LinkAccountsPage.jsx` (async options,
  `createFilterOptions` precedent), NOT the type-then-Enter pattern in
  `FamilyTreeCanvas.jsx`. Debounce (~250 ms) and a small min-char threshold
  (~2 chars) are **Claude's discretion** — pick sensible values, avoid a
  request per single character.
- **D-02:** The search input accepts **both Latin and Ge'ez** typed text and
  passes the raw term straight to `searchFamilyMembers` — the backend already
  matches partial, case-insensitive Latin **and** Ge'ez first/last names
  (Phase 24 D-03; mother's-name excluded). No client-side language detection or
  transliteration.
- **D-03:** Suggestion rows show, per SEARCH-02: **avatar, full Latin name, full
  Ge'ez name (when present via `getGeezDisplay`), birth year, and family
  context** to disambiguate similar names. The **exact family-context content is
  Claude's discretion** — use the most disambiguating parent/family fields the
  search / person payload already carries (e.g. `mothersname` or a parent name),
  falling back gracefully when absent, and **without requiring any new backend
  field**. Note: birth year **is shown in the suggestion row** even though the
  `PersonCard` itself omits it (Phase 25 D-06) — the row is intentionally richer
  than the card.

### Initial load & main-person data flow (DETAIL-02, SEARCH-03)
- **D-04:** First load uses the **head-id → person-by-id** flow: call
  `familyHead` to get the head's **id**, then call `familyMember(id)` to fetch
  the fully-populated card fields (matches the Phase-24 D-01/SC-2 split — the
  head query returns an id, person-by-id returns every card field). Two
  round-trips on open is accepted in exchange for a **single uniform
  "load person by id" code path** shared with suggestion-select.
- **D-05:** Selecting a suggestion runs that **same** `familyMember(id)` fetch,
  **clears the current view**, sets that person as the new **main person**, and
  shows only their `PersonCard` with descendants collapsed (SEARCH-03). The
  "main person" is held in **page state only** — no URL param / deep link
  (`/detail/:id` is a deferred v4.0 Future Requirement).

### Entry point & page layout (DETAIL-01)
- **D-06:** `/detail` is a **protected route** mounted like `/family` — inside
  the existing `<ProtectedRoute />` group in `App.jsx` (any authenticated user;
  unauthenticated → login redirect). No role gate (not admin-only).
- **D-07:** Add a **`/detail` link to the `AppLayout` top nav** (alongside
  Dashboard / Family / Manage) as the entry point. The page opens with a
  **persistent search bar at the top** and the head's **single `PersonCard`
  centered** below it (the "nav link + centered card" layout — search stays
  visible, head card is the initial main person). Exact visual polish may be
  refined by an optional `/gsd:ui-phase 26` design contract.

### Edge & empty states (DETAIL-03)
- **D-08:** All six states render via the app's **existing components/patterns,
  no new components** (Claude's discretion on the exact mapping), consistent with
  `FamilyTreePage.jsx`:
  - **loading** → `CircularProgress`
  - **no-search-results** → an inline "No matches" line under the search bar
  - **no-children** → the card simply renders with **no expand control** (Phase 25
    CARD-04 already gates this — not an error state)
  - **failed-request** → `Alert severity="error"`
  - **missing-family-head** → `Alert severity="info"` ("No family head found")
  - **missing-person-info** → a graceful message rather than an empty/broken card
  Never render an empty card or broken placeholder.

### Claude's Discretion
- Debounce interval and min-char threshold for live search (D-01).
- Exact "family context" fields shown in a suggestion row and their layout,
  using only already-available payload fields (D-03).
- Precise component/copy choice for each of the six states (D-08), and whether
  errors get an inline "Try again" affordance (mirroring `FamilyTreePage`'s error
  branch) — allowed but not required.
- Whether the search input clears or retains its text after a suggestion is
  selected (view clears regardless per D-05).
- Whether first-load head fetch and person-by-id are chained or the id is
  threaded through a single hook — keep it one uniform person-by-id path (D-04).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 26: /detail Page, Search & Initial Load" —
  goal + the 5 success criteria (authoritative for what must be TRUE).
- `.planning/REQUIREMENTS.md` — **DETAIL-01/02/03** and **SEARCH-01/02/03**
  (this phase) plus the v4.0 milestone goal.
- `.planning/PROJECT.md` § "Current Milestone: v4.0" — the `/detail route`,
  `Inline search`, and `States & accessibility` target-feature bullets.

### Backend contract this page consumes (Phase 24)
- `.planning/phases/24-backend-read-layer-for-detail/24-CONTEXT.md` — the
  `familyHead` query (D-01/D-02: returns head **id**, bounded), the
  `searchFamilyMembers(term:)` query (D-03/D-04: partial/case-insensitive
  Latin + Ge'ez first/last, mother's-name excluded, capped ~20, name-sorted),
  and `familyMember(id)` person-by-id returning all card fields (SC-2).
- `backend/src/schemas/familyMember.schema.js` — the exact query names/args and
  the `FamilyMember` fields available (`fullname`, `geezFullname`, `gender`,
  `isAlive`, `birthdate`, `mothersname`, `photoUrl`, `spouses`, `children`,
  `canEdit`).
- `backend/src/resolvers/familyMember.resolver.js` — resolver behavior for those
  queries.

### The card this page composes (Phase 25)
- `.planning/phases/25-reusable-personcard/25-CONTEXT.md` — PersonCard's props
  and contracts: `member` + role label (D-05 there) + spouse input + `expanded`
  + `onExpand`/`onEdit`; **card omits birth year (D-06 there)**; spouse is
  lateral/single (D-12–D-14 there).
- `frontend/src/components/person/PersonCard.jsx` +
  `frontend/src/components/person/PersonCard.test.jsx` — the actual component API
  and test patterns. **NOTE (from Phase 25 code review, advisory):** `onEdit`/
  `onExpand` are currently invoked unguarded — if this page wires only some
  callbacks, guard against undefined handlers or pass no-ops.

### Reusable frontend assets to mirror
- `frontend/src/App.jsx` — the `<ProtectedRoute />` route group where `/detail`
  mounts (D-06); `/family` is the closest sibling route.
- `frontend/src/components/AppLayout.jsx` — top-nav buttons (Dashboard/Family/
  Manage) where the `/detail` link is added (D-07).
- `frontend/src/pages/FamilyTreePage.jsx` — the page-level fetch/loading/error
  idiom (`graphqlRequest`, `useState` loading/error, `CircularProgress`, `Alert`)
  to reuse for D-04/D-08.
- `frontend/src/components/manage/AddRelativeDialog.jsx` &
  `frontend/src/pages/LinkAccountsPage.jsx` — the MUI `Autocomplete` +
  `createFilterOptions` (Latin OR Ge'ez match) idiom for the live search (D-01/D-02).
- `frontend/src/api/graphqlClient.js` — `graphqlRequest` helper for the queries.
- `frontend/src/utils/displayName.js` — `getGeezDisplay(member)` for Ge'ez names
  in suggestion rows (D-03) — use verbatim.
- `frontend/src/components/manage/MemberAvatarImage.jsx` /
  `frontend/src/components/MemberFallbackAvatar.jsx` — avatar for suggestion rows.

### Testing conventions
- `.planning/codebase/TESTING.md` — frontend Vitest + RTL + jsdom setup.
- Sibling page tests (e.g. `FamilyTreePage.test.jsx`, `ManagePage.test.jsx`) and
  `AddRelativeDialog.test.jsx` — page/Autocomplete test patterns to follow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`PersonCard`** (`components/person/PersonCard.jsx`): the main-person renderer
  — page passes `member`, a role label (`Head` on first load), the single spouse,
  and (for this phase) leaves `onExpand`/`onEdit` as no-ops / unwired (expand is
  Phase 27, edit is Phase 28).
- **`graphqlRequest`** (`api/graphqlClient.js`): all three reads
  (`familyHead`, `searchFamilyMembers`, `familyMember(id)`) go through it.
- **MUI `Autocomplete` + `createFilterOptions`** (`AddRelativeDialog.jsx`,
  `LinkAccountsPage.jsx`): the live-suggestion pattern (async options, Latin OR
  Ge'ez matching, custom option rendering) to adapt for the search bar.
- **`getGeezDisplay`** (`utils/displayName.js`): Ge'ez name line in suggestion rows.
- **`CircularProgress` / `Alert`** (as used in `FamilyTreePage.jsx`): loading and
  error/empty states (D-08).

### Established Patterns
- **Protected page route:** `/detail` mounts in the same `<ProtectedRoute />`
  group as `/family` in `App.jsx` (D-06); nav button added in `AppLayout` (D-07).
- **Page-owns-fetch, card-is-presentational:** the page does the data-fetching
  and holds the main-person state; `PersonCard` stays props-only (Phase 25).
- **One uniform person-by-id fetch:** both first-load (after resolving the head
  id) and suggestion-select call `familyMember(id)` (D-04/D-05).
- **Latin-OR-Ge'ez search match:** already established server-side (Phase 24) and
  in the `createFilterOptions` client idiom (Phase 22/23 FIND-01/FIND-02).

### Integration Points
- **`familyHead`** (Phase 24) → head id on first load; **`familyMember(id)`** →
  full card fields; **`searchFamilyMembers(term:)`** → suggestion list.
- **`AppLayout` nav** gains a `/detail` entry (D-07).
- **PersonCard** callbacks: `onExpand` is inert here (Phase 27 wires expansion);
  `onEdit` is inert here (Phase 28 wires `EditMemberDialog`) — but the affordances
  still render per the card's own `canEdit`/child-count gating.

</code_context>

<specifics>
## Specific Ideas

- Keep `/detail` reachable and styled like the other authenticated pages —
  top-nav link, persistent search bar, head card centered on open.
- Search should feel instant (live debounced suggestions), reusing the same
  Autocomplete language the add/link flows already use, so Ge'ez search "just
  works" without special handling.
- Suggestion rows are intentionally richer than the card (they include birth
  year + family context) purely to disambiguate — the card stays lean (Phase 25).
- Every non-happy path shows an existing component with a clear message; never a
  blank or broken card.

</specifics>

<deferred>
## Deferred Ideas

- **Descendant expand/collapse, the generation grid, and 3-generation
  forward-shift** — Phase 27 (the card exposes `onExpand`/`expanded`; this page
  leaves them inert).
- **Lazy per-generation loading + session cache** — Phase 27.
- **Admin add-child / add-spouse / edit wiring** — Phase 28.
- **`/detail/:id` deep-linkable / shareable URL** — deferred v4.0 Future
  Requirement (main person stays in page state only, D-05).
- **Ancestor (upward) navigation on `/detail`** — deferred v4.0 Future Requirement.

None of these are in-scope for Phase 26.

</deferred>

---

*Phase: 26-detail-page-search-initial-load*
*Context gathered: 2026-08-03*
