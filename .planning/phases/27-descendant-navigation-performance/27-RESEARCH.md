# Phase 27: Descendant Navigation & Performance - Research

**Researched:** 2026-08-03
**Domain:** React client-side state machine (expand/collapse + forward-shift navigation) + session cache + GraphQL read shaping + MUI responsive grid layout
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

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
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| NAV-01 | Expanding a person loads/shows direct children in a responsive grid grouped by generation (≤3/row desktop, fewer tablet, 1 mobile) with a visible parent→child connector | Pattern 3 (expand-triggered `EXPAND_CHILDREN_QUERY`) + Pattern 4 (`GenerationGrid` + `ApexCue`) |
| NAV-02 | Re-clicking expand collapses that person's children and hides all descendants beneath; control visibly reflects state | Pattern 1 (`navReducer`'s `EXPAND_CHILD`/`EXPAND_TOP` toggle cases); Pitfall 5 (deriving `expanded` purely from reducer state) |
| NAV-03 | At most 3 generations shown at once, never a 4th alongside the first 3 | Pattern 1 (reducer's 3-field frame shape structurally caps depth at head/gen1/gen2); Anti-Pattern "keep dropped generations mounted-but-hidden" (recommends unmounting instead); Validation Architecture's explicit NAV-03 invariant test |
| NAV-04 | Expanding a childful grandchild shifts the view forward one generation, no full reload | Pattern 1 (`EXPAND_GRANDCHILD` case + history push); Pitfall 2 (shift-eligibility already gated by `PersonCard`'s existing expand-control rendering) |
| PERF-01 | Opening `/detail` loads only the main person; a person's children load only on expand | Pattern 3 (why the initial query must NOT be extended — kept as a separate narrower query) |
| PERF-03 | Descendants already loaded this session are not re-fetched; no duplicate requests, no unnecessary re-renders | Pattern 2 (`useRef` cache decoupled from `useReducer` state); Pitfall 4 (separating the "no duplicate request" assertion from the "no extra re-render" assertion); Validation Architecture's `<Profiler>`-based commit-count technique |
</phase_requirements>

## Summary

This phase introduces no new libraries, no schema changes, and no new backend resolvers — it is 100% frontend composition work wiring already-built pieces (`PersonCard`, `DetailPage`, the Phase-24 `familyMember(id)` read, DataLoader batching) together. The genuinely novel work is: (1) a small, provably-correct view-frame reducer that models "who is the current top person, is their child row open, which child is drilled into" plus a history stack for the forward-shift's symmetric undo; (2) a `useRef`-backed session cache that must NOT itself be React state (to avoid extra re-renders) but must coexist cleanly with the reducer that DOES trigger renders; (3) a second, narrower GraphQL query fired only on expand (never on initial `/detail` load) that fetches one person's children with full card fields, their own spouses, and a count-only grandchild peek — reusing the existing DataLoader-batched resolver as-is, no backend changes; and (4) a lightweight MUI `Grid` (v6 stabilized `size` prop API) wrapper plus a CSS-only inverted-V apex (no SVG, matching the codebase's existing "Box + border" connector style) grouping the children row under the parent(+spouse) pair.

The trickiest correctness risk is NOT the fetch/cache layer (which is a straightforward read-through pattern) but the state machine: NAV-04's forward-shift and D-04's symmetric undo are exactly invertible only if the shift pushes the *pre-shift frame* onto a stack and collapse pops it verbatim — get the push/pop pairing right and the "back to exactly where I was" guarantee falls out for free; get it wrong (e.g., reconstructing the previous frame from scratch instead of restoring the pushed one) and subtle drift bugs appear only after 2+ nested shifts.

**Primary recommendation:** Model navigation state as `{ topId, topExpanded, expandedChildId }` plus a `history: []` stack of prior frames, driven by a pure reducer function importable and unit-testable outside React; own it in a new `useDescendantNav(mainPerson)` hook (first custom hook in this codebase, lives at `frontend/src/hooks/useDescendantNav.js`) that also owns a `useRef(Map())` session cache keyed by person id; fetch via a new, narrower `EXPAND_CHILDREN_QUERY` fired only on expand and only on a cache miss; render generations with MUI's stabilized `Grid` `size={{ xs: 12, sm: 6, md: 4 }}` prop and a CSS-only chevron in `colors.line`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| View-frame state machine (expand/collapse/shift/undo) | Frontend Client (React hook) | — | Pure UI navigation state; no server concept of "current view" exists or should exist |
| Session cache of fetched descendants | Frontend Client (in-memory, per-hook-instance) | — | PERF-03 is explicitly a client-behavior requirement; no server-side cache needed (DB reads are already cheap/batched, PERF-02 solved) |
| Per-generation lazy fetch (`familyMember(id) { children {...} }`) | API / Backend (existing resolver, unchanged) | Frontend Client (triggers the call) | Read already exists (Phase 24); frontend only decides *when* to call it |
| Children-grid layout + inverted-V group cue | Frontend Client (MUI Grid + CSS) | — | Pure presentation; matches the "page/nav layer owns layout, PersonCard stays presentational" pattern from Phase 25/26 |
| Spouse lateral pairing inside each generation row | Frontend Client (PersonCard, reused as-is) | — | Already built (Phase 25 D-12/D-13/D-14); nav layer only supplies the `spouse` prop |
| N+1-free batched reads for nested children/spouses | API / Backend (DataLoader, unchanged) | Database (Sequelize/MySQL) | Already proven bounded (PERF-02, Phase 24); this phase's 2-level-deep selection set stays within the same batching guarantee |

## Standard Stack

No new packages. This phase is pure composition of already-installed dependencies.

### Core (already installed, verified against `frontend/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3.1 | `useReducer`/`useRef`/custom hook | Already the app's UI runtime |
| @mui/material | ^6.3.1 | `Grid` (stabilized `size` prop API) for the responsive generation grid | Already the app's component library; v6 ships the stabilized Grid v2 API as the default `Grid` export — no need to reach for the old `item xs={}` API or a separate `Grid2` import [CITED: mui.com/material-ui/react-grid/] |
| vitest | ^4.1.10 | Test runner | Already configured (`frontend/vitest.config.js`, `frontend/test/setup.js`) |
| @testing-library/react | ^16.3.2 | Component/interaction tests | Already the established pattern (`DetailPage.test.jsx`, `PersonCard.test.jsx`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react (`Profiler`) | built-in (React 18) | Counting commits/renders in a test to prove "no unnecessary re-render" (PERF-03) | Wrap the rendered subtree in `<Profiler id="nav" onRender={spy}>` inside the TEST file only, never in production code — see Validation Architecture |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain MUI `Grid` (`size` prop) | CSS Grid via `sx={{ display: 'grid', gridTemplateColumns: {...} }}` on a `Box` | Either works; `Grid` is recommended only because it is the more idiomatic/discoverable MUI primitive and needs no manual breakpoint-to-`gridTemplateColumns` translation. No functional difference — Claude's Discretion per CONTEXT. |
| `useRef(Map())` cache | A module-level singleton `Map` outside the hook | Rejected: a module-level Map would leak entries across `DetailPage` unmount/remount and, more importantly, across Vitest test cases (this suite's `afterEach` only runs RTL `cleanup()` + `localStorage.clear()` — it does NOT reset a module-level Map), causing cross-test pollution. `useRef` scoped inside the hook is recreated fresh on every component mount, matching the test isolation the suite already relies on. |
| `useReducer` for nav state | Several `useState` calls (`topId`, `topExpanded`, `expandedChildId`, `history`) | Either works; `useReducer` is recommended because the 4 transition cases (expand-top, expand/collapse-mid, forward-shift, walk-back-up) are cleanly expressible as one pure, exhaustively-unit-testable function with no React rendering involved — directly serves the Validation Architecture's "prove the state machine is correct" goal. Plain `useState` would scatter the same invariants across multiple `set` calls with more chances to update one piece of state and forget another. |

**Installation:** none required.

**Version verification:**
```bash
npm view @mui/material version   # confirm current major still 6.x-compatible with installed ^6.3.1
```
The installed `^6.3.1` already satisfies the `size`-prop Grid API; no upgrade needed. [VERIFIED: package.json read directly]

## Package Legitimacy Audit

Not applicable — this phase installs no new packages. All work reuses `react`, `@mui/material`, `vitest`, and `@testing-library/react`, already present in `frontend/package.json` and verified by direct file read.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ DetailPage (unchanged head-load logic: FAMILY_HEAD_QUERY,           │
│ FAMILY_MEMBER_QUERY, loading/error/missing states, PersonSearch)    │
│                                                                       │
│   mainPerson (state) ──────────────► useDescendantNav(mainPerson)   │
│                                              │                        │
│                                              ▼                        │
│                              ┌───────────────────────────────┐        │
│                              │ useDescendantNav hook          │        │
│                              │                                 │        │
│                              │ useReducer(navReducer, initial)│        │
│                              │  state = { topId, topExpanded, │        │
│                              │    expandedChildId, history[] }│        │
│                              │                                 │        │
│                              │ useRef(cache: Map<id, children>)        │
│                              │                                 │        │
│                              │ onExpand(member) ──────────────┼──┐     │
│                              │   ├─ cache HIT  → dispatch only │  │     │
│                              │   └─ cache MISS → graphqlRequest│  │     │
│                              │        (EXPAND_CHILDREN_QUERY)  │  │     │
│                              │        .then(cache.set + dispatch)│ │     │
│                              └───────────────┬─────────────────┘  │     │
│                                              │                     │     │
│                                              ▼                     │     │
│                         { topPerson, gen1[], gen2[], topExpanded,  │     │
│                           expandedChildId, loading }                │     │
│                                              │                     │     │
│                                              ▼                     │     │
│              renders: PersonCard(top) → GenerationGrid(gen1)       │     │
│                        → GenerationGrid(gen2, only if expandedChildId)   │
└──────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼ (graphqlRequest, on cache miss only)
                              ┌───────────────────────────────┐
                              │ Apollo Server: familyMember(id)│
                              │ → children (childrenByParentId │
                              │   DataLoader, batched)         │
                              │   → each child's spouses        │
                              │     (spousesByMemberId, batched)│
                              │   → each child's children{id}   │
                              │     (childrenByParentId, batched│
                              │      — same loader, 2nd batch)  │
                              └───────────────────────────────┘
                              (unchanged resolvers/schema — Phase 24)
```

A reader can trace the primary use case (expand a card → see children) top to bottom: `onExpand` fires from a `PersonCard` → the hook checks the cache → on miss, one bounded GraphQL call resolves through existing DataLoader-batched resolvers → the hook caches the result and dispatches a state transition → the reducer's new frame drives what `DetailPage` renders next.

### Recommended Project Structure
```
frontend/src/
├── hooks/                          # NEW directory — first custom hook in this codebase
│   ├── useDescendantNav.js          # the hook: reducer + cache + fetch orchestration
│   ├── useDescendantNav.test.js     # reducer unit tests (no RTL needed) + hook integration tests
│   └── descendantNav.reducer.js     # pure reducer, exported separately for isolated unit tests
├── components/
│   └── person/
│       ├── PersonCard.jsx                    # unchanged (Phase 25)
│       ├── GenerationGrid.jsx        # NEW — responsive grid + inverted-V apex wrapper
│       └── GenerationGrid.test.jsx   # NEW
└── pages/
    └── DetailPage.jsx                # extended: wires useDescendantNav, renders GenerationGrid rows
```

### Pattern 1: Pure, exhaustively-testable navigation reducer
**What:** A plain function `(state, action) => newState` with no React/DOM dependency, handling exactly 4 transitions.
**When to use:** Any UI state machine with invariants that must hold across many transition sequences (here: never show >3 generations, shift/undo must be exact inverses).
**Example:**
```javascript
// Source: derived from CONTEXT.md D-01..D-04 + NAV-01..NAV-04 (project-specific design, not from an external library)
const initial = (topId) => ({ topId, topExpanded: false, expandedChildId: null, history: [] });

function navReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      // SEARCH-03/D-09: new main person — reset the frame, but the CALLER
      // (the hook) must NOT clear the cache Map here; cache persists.
      return initial(action.id);

    case 'EXPAND_TOP':
      if (state.topExpanded) {
        // Collapsing the top card. D-04: if this frame was reached via a
        // forward-shift, walk back up by popping history instead of
        // collapsing to nothing. If history is empty, ordinary collapse.
        if (state.history.length > 0) {
          const prev = state.history[state.history.length - 1];
          return { ...prev, history: state.history.slice(0, -1) };
        }
        return { ...state, topExpanded: false, expandedChildId: null };
      }
      return { ...state, topExpanded: true };

    case 'EXPAND_CHILD': {
      // A gen-1 (child) card's expand control was clicked.
      const { id } = action;
      if (state.expandedChildId === id) {
        // Re-click same child → collapse (D-02: hides gen-2 beneath).
        return { ...state, expandedChildId: null };
      }
      // Expanding a DIFFERENT sibling auto-collapses the previous one
      // (D-01) — trivially true because expandedChildId is a single
      // scalar, not a set.
      return { ...state, expandedChildId: id };
    }

    case 'EXPAND_GRANDCHILD': {
      // A gen-2 (grandchild) card WITH CHILDREN was clicked — NAV-04
      // forward-shift. (PersonCard already gates: no expand control
      // renders for a childless grandchild, so this action only ever
      // fires when a shift is valid.)
      const { id } = action;
      return {
        topId: state.expandedChildId,   // parent promotes to new top
        topExpanded: true,
        expandedChildId: id,             // grandchild remains its child
        history: [...state.history, state] // push the PRE-shift frame verbatim
      };
    }

    default:
      return state;
  }
}
```
This reducer is unit-testable with zero RTL/DOM: assert `navReducer(navReducer(initial('1'), {type:'EXPAND_TOP'}), {type:'EXPAND_CHILD', id:'2'})` produces the right shape, then feed the result through `EXPAND_GRANDCHILD` and back through `EXPAND_TOP` (collapse) and assert the ORIGINAL pre-shift frame is restored byte-for-byte (`toEqual`, not just spot-checking `topId`).

### Pattern 2: Read-through cache colocated with, but decoupled from, reactive state
**What:** `useRef(new Map())` for cached children arrays; `useReducer` for the navigation frame. The ref mutation always happens synchronously before the accompanying `dispatch` call inside the same `.then()`, so by the time React re-renders, `cache.current.get(id)` is already fresh — no separate "children data" state is needed, and no extra re-render is triggered by the cache write itself.
**When to use:** Whenever cached data doesn't itself need to be reactive (nothing reads the cache Map directly in JSX — only derived, already-reactive frame state decides WHICH cached entry to read).
**Example:**
```javascript
// Source: project-specific pattern combining React's documented ref/state
// split (react.dev "Referencing values with refs" — refs don't trigger
// re-renders and are appropriate for values not used in rendering) with
// this phase's cache requirement (PERF-03).
function useDescendantNav(mainPerson) {
  const cache = useRef(new Map()); // id -> children[] (with card fields + spouses + counts)
  const [state, dispatch] = useReducer(navReducer, mainPerson?.id, initial);
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    dispatch({ type: 'RESET', id: mainPerson?.id });
    // Deliberately NOT clearing cache.current here — D-09: already-loaded
    // descendants survive a search-driven main-person reset.
  }, [mainPerson?.id]);

  const ensureChildren = useCallback((id) => {
    if (cache.current.has(id)) return Promise.resolve(cache.current.get(id));
    setLoadingId(id);
    return graphqlRequest(EXPAND_CHILDREN_QUERY, { id })
      .then((data) => {
        const children = data.familyMember?.children ?? [];
        cache.current.set(id, children); // mutate ref BEFORE any dispatch
        return children;
      })
      .finally(() => setLoadingId((current) => (current === id ? null : current)));
  }, []);

  // onExpand handlers call ensureChildren(id).then(() => dispatch({...}))
  // — the fetch (if any) always resolves before the frame transitions, so
  // gen1/gen2 arrays are never derived from an empty cache entry.
  // ...
}
```

### Pattern 3: Narrow, expand-only GraphQL read (do NOT extend the initial-load query)
**What:** A second query string, distinct from `DetailPage`'s existing `FAMILY_MEMBER_QUERY`, fired only from `ensureChildren`.
**When to use:** Whenever an initial/light read and a deeper/on-demand read share the same root type but must NOT be conflated (conflating them would make the initial `/detail` load itself fetch a full extra generation, violating PERF-01).
**Example:**
```graphql
# Source: extends the field set already used for FAMILY_MEMBER_QUERY's head
# fields and its `spouses {...}` sub-selection (frontend/src/pages/DetailPage.jsx),
# verified against backend/src/schemas/familyMember.schema.js's FamilyMember type.
query ExpandChildren($id: ID!) {
  familyMember(id: $id) {
    children {
      id
      fullname
      geezFullname
      gender
      isAlive
      photoUrl
      canEdit
      spouses { id fullname geezFullname gender isAlive photoUrl }
      children { id }
    }
  }
}
```
Fired with `{ id: topId }` to populate gen1, and again with `{ id: expandedChildId }` to populate gen2 (and again with the new `topId`/`expandedChildId` after a forward-shift — always the SAME query, just a different `id` variable). The `children { id }` on each returned child is intentionally count-only (Phase 24 D-05 convention: no `childCount` field, derive `.length`) — it exists so each gen1/gen2 `PersonCard` can gate its OWN expand control (CARD-04) without an extra round trip, and so the nav layer can decide, in `EXPAND_GRANDCHILD`, whether a grandchild click should even be treated as shift-eligible (PersonCard already refuses to render the control at all when `children.length === 0`, so this is a belt-and-suspenders read, not new logic).

**Why not extend `FAMILY_MEMBER_QUERY` instead:** that query is also used for the very first render of `/detail` (PERF-01: "loads only the main person plus the data the card needs"). If it always requested `children { ...fullCardFields }` two levels deep, every `/detail` page load would eagerly fetch grandchild-level data before any expand ever happens — a direct regression against PERF-01's "a person's children load only when that person is expanded."

### Pattern 4: Responsive generation grid + group-level inverted-V apex (D-05/D-06/D-07)
**What:** A `GenerationGrid` wrapper rendering one MUI `Grid container` per generation, with a single CSS-drawn chevron above it, positioned under the parent(+spouse) pair.
**When to use:** Rendering any expanded generation's children row.
**Example:**
```jsx
// Source: MUI Grid `size` prop confirmed via mui.com/material-ui/react-grid/
// [CITED]; apex technique is a project-specific CSS-border construction
// mirroring the existing dashed spouse-connector's plain-Box style
// (frontend/src/components/person/PersonCard.jsx's `data-connector-style="dashed"` Box).
import { Box, Grid } from '@mui/material';
import { colors } from '../../theme.js';
import PersonCard from './PersonCard.jsx';

function ApexCue() {
  return (
    <Box aria-hidden="true" data-testid="generation-apex" sx={{ position: 'relative', height: 14, width: 40, mx: 'auto' }}>
      <Box sx={{
        position: 'absolute', left: 0, top: 8, width: '50%', height: 2,
        bgcolor: colors.line, transform: 'rotate(20deg)', transformOrigin: 'right center'
      }} />
      <Box sx={{
        position: 'absolute', right: 0, top: 8, width: '50%', height: 2,
        bgcolor: colors.line, transform: 'rotate(-20deg)', transformOrigin: 'left center'
      }} />
    </Box>
  );
}

export default function GenerationGrid({ people, role, loading, onExpand, onEdit }) {
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <ApexCue />
      <Grid container spacing={2} sx={{ width: '100%' }}>
        {people.map((person) => (
          <Grid key={person.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <PersonCard
              member={person}
              role={role}
              spouse={person.spouses?.[0]}
              expanded={/* wired by caller: is this the currently expandedChildId? */ false}
              onExpand={onExpand}
              onEdit={onEdit}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
```
One `ApexCue` per generation container (D-06: group-level, never per-child) — the apex sits above the WHOLE grid, not repeated per grid item. Spouse pairing (D-07) is free: `PersonCard` already composes `member + spouse` into one visual couple when `spouse` is passed, so each grid cell is naturally "the couple," and the children grid rendered one level down (when that gen1 person is expanded) reads as hanging beneath the pair.

### Anti-Patterns to Avoid
- **Keeping dropped generations mounted-but-hidden:** `/family`'s `FamilyTreeCanvas` deliberately keeps out-of-view nodes mounted with `hidden: true` because dagre's layout math needs a stable node set across toggles. `/detail`'s plain MUI grid has no such dependency — conditionally rendering (unmounting) dropped generations is simpler, cheaper, and makes "no more than 3 generations shown at once" trivially assertable in tests (`queryByTestId` returns `null`, not a hidden element). Do not port the `/family` pattern here; it would be over-engineering for a component with no layout-library constraint.
- **A per-child inverted-V line:** D-06 is explicit that this is a group-level cue on the whole children container, not a per-card edge. Do not draw one apex per `PersonCard`.
- **Storing the cache in `useState`:** would trigger a re-render on every cache write, including cache-miss fetches for generations the user hasn't navigated to yet if any prefetching is ever added later — defeats PERF-03's "no unnecessary re-renders." Keep the cache in a ref.
- **Reconstructing the pre-shift frame from `mainPerson` + ids instead of restoring the pushed frame verbatim:** would silently drop information (e.g., if the grandparent's OWN topExpanded state or any future per-frame UI state existed) and is strictly more failure-prone than push/pop. Always push the entire prior state object and restore it exactly.
- **Extending the initial `FAMILY_MEMBER_QUERY` to eagerly include 2-levels-deep children:** regresses PERF-01. Keep the initial load and the expand-triggered read as two distinct query strings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Responsive breakpoint grid (≤3/row desktop → 1/row mobile) | Custom `flex-wrap` + manual media-query CSS | MUI `Grid` with the `size={{ xs, sm, md }}` prop | Already the app's component library; the stabilized v6 Grid API does exactly this with no hand-rolled breakpoint math [CITED: mui.com/material-ui/react-grid/] |
| GraphQL response caching / dedup | A generic client-side cache library (SWR, React Query, Apollo Client's normalized cache) | A plain `useRef(Map)` scoped to this one hook | The app deliberately has NO GraphQL client library (`frontend/src/api/graphqlClient.js` is a thin axios wrapper, by established convention) and the caching need here is narrow (one id → one children array, session-scoped, no background revalidation, no cross-component sharing needed since only `/detail` consumes it). Pulling in a general-purpose data-fetching library for this single use case would be a disproportionate dependency for what a ~15-line `Map` solves. |
| A state machine library (XState, etc.) | A hand-rolled `switch` | The plain reducer above | Only 4 transitions with straightforward, fully-enumerable invariants (verified by the unit tests in Validation Architecture below) — a state-machine library would add a dependency and a learning curve for a problem this small. Revisit only if a future phase adds materially more states/transitions. |

**Key insight:** every "don't hand-roll" temptation in this phase points toward NOT adding a new dependency, not toward adding one — the existing stack (MUI Grid, a plain `Map`, a plain reducer) is already sufficient and matches the codebase's consistently lean, no-extra-library convention (no Redux, no Apollo Client, no state-machine library anywhere else in the app).

## Common Pitfalls

### Pitfall 1: Auto-collapse "for free" only works if `expandedChildId` stays a scalar
**What goes wrong:** If a future edit generalizes `expandedChildId` to a `Set` (e.g., to someday allow multiple open siblings), D-01's "only one branch open at a time" stops being structurally guaranteed and must be enforced imperatively instead — a common source of drift bugs.
**Why it happens:** Sets feel like a natural generalization once someone wants "just one more" feature.
**How to avoid:** Keep `expandedChildId` a single nullable scalar for this phase (matches CONTEXT's D-01 rejection of "multiple sibling broods open simultaneously" explicitly). If Phase 28+ ever needs multi-branch, that's a deliberate, separately-researched decision — not a refactor to sneak in here.
**Warning signs:** Any code path that pushes into an array of "expanded ids" instead of overwriting a single field.

### Pitfall 2: Forgetting the shift-eligibility guard doubles as the "is this even clickable" guard
**What goes wrong:** Assuming `EXPAND_GRANDCHILD` needs its own "does this grandchild have children" check inside the reducer.
**Why it happens:** NAV-04 is worded as "expanding a grandchild who has children shifts the view," which reads like a conditional inside the shift logic.
**How to avoid:** `PersonCard`'s existing `showExpand = !isSpouse && childCount >= 1` gate (Phase 25, unchanged) already means the expand control is never rendered on a childless grandchild card — so `onExpand` for a gen-2 card is NEVER called unless the grandchild has children. The reducer's `EXPAND_GRANDCHILD` case does not need its own guard; adding one would be redundant defensive code that a test would need to cover with an unreachable branch.
**Warning signs:** A reducer test trying to fire `EXPAND_GRANDCHILD` for a childless grandchild and asserting a no-op — that scenario cannot occur through the UI at all, so don't design around it; it's Phase 25's card that owns this gate.

### Pitfall 3: jsdom does not evaluate CSS breakpoints — don't try to assert "3 per row" visually
**What goes wrong:** Writing an RTL test that tries to measure rendered pixel widths or `getComputedStyle` media-query results to prove "3 cards per row on desktop."
**Why it happens:** jsdom has no real layout engine; `window.innerWidth`/media queries are not meaningfully wired unless heavily mocked, and MUI's breakpoint CSS is applied via generated class names that jsdom won't resolve to actual widths.
**How to avoid:** Test the DECLARATIVE contract instead — assert each rendered `Grid` item received `size={{ xs: 12, sm: 6, md: 4 }}` (or whatever the chosen breakpoints are) via a shallow prop/DOM query, OR simply assert the correct number of `PersonCard`s are rendered for a given generation and trust MUI's Grid CSS (a well-tested library) to lay them out correctly — do not attempt to re-verify MUI's own responsive CSS behavior in this test suite.
**Warning signs:** A test asserting on `getBoundingClientRect()` widths or `window.matchMedia` results for a responsive layout claim.

### Pitfall 4: Counting `graphqlRequest` calls is the ONLY reliable proxy for "cache prevented a refetch" — don't conflate it with "prevented a re-render"
**What goes wrong:** Treating "the mock wasn't called again" and "the component didn't re-render" as the same assertion.
**Why it happens:** They're related (PERF-03 groups them together) but are TWO separate claims: a cache hit still triggers exactly one re-render (the frame-transition dispatch), it just skips the network call.
**How to avoid:** Test them separately — assert `graphqlRequest` call COUNT is unchanged across a repeat expand/collapse (proves no duplicate request), and separately use a `<Profiler>` (see Validation Architecture) to assert commit count is exactly 1 per user action (proves no EXTRA re-render beyond the expected one), not zero.
**Warning signs:** A test that only checks `graphqlRequest` call count and calls that sufficient proof of "no unnecessary re-renders."

### Pitfall 5: Restoring a stale card's `expanded` prop after a shift/undo sequence
**What goes wrong:** After `EXPAND_GRANDCHILD` then `EXPAND_TOP` (undo), the newly-restored gen1 row must show the SAME child as expanded (`expandedChildId` from the popped frame) — if `DetailPage`/`GenerationGrid` derives each card's `expanded` prop from anything other than `state.expandedChildId === person.id`, a stale local `expanded` flag per card (e.g., accidentally kept in `PersonCard`'s own state, or a separately-tracked id that wasn't part of the popped frame) will desync.
**Why it happens:** `PersonCard` is fully controlled (`expanded` is a prop, no internal state) — but a nav-layer bug computing `expanded` from the WRONG piece of state (e.g., "is this the last-clicked id" instead of "is this `state.expandedChildId`") would only surface after a shift+undo, not on a simple first expand, making it easy to miss in ad hoc manual testing.
**How to avoid:** Derive every card's `expanded` prop as a pure function of the CURRENT reducer state on every render (`person.id === state.expandedChildId`), never from a separately-tracked "last clicked" ref/variable.
**Warning signs:** Any `expanded={someLocalVariable}` that isn't a direct equality check against the reducer's current `expandedChildId`/`topId`.

## Code Examples

Verified patterns from the actual codebase (not external docs — this phase mirrors existing conventions):

### Spouse-pairing prop convention (already established, Phase 25/26)
```jsx
// Source: frontend/src/pages/DetailPage.jsx:120-129 (existing head render)
<PersonCard
  member={mainPerson}
  role="Head"
  spouse={mainPerson.spouses?.[0]}
  expanded={false}
  onExpand={() => {}}
  onEdit={() => {}}
/>
```
The nav layer reuses this exact prop shape for gen1 (`role="Child"`) and gen2 (`role="Grandchild"`) cards, swapping in the real `onExpand`/computed `expanded` values.

### DataLoader batching already covers the 2-level-deep read (no backend change needed)
```javascript
// Source: backend/src/loaders/familyMember.loaders.js:26-43 (unchanged)
childrenByParentId: new DataLoader(async (parentIds) => { /* ... single batched query ... */ })
```
Calling `familyMember(id) { children { spouses{...} children{id} } }` triggers: (1) one `childrenByParentId.load(topId)` call, (2) one BATCHED `spousesByMemberId` query across all returned children (not one per child), (3) one BATCHED `childrenByParentId` query across all returned children for their own counts — three bounded queries total regardless of how many children/grandchildren exist, matching the already-proven PERF-02 guarantee. [VERIFIED: read directly from `backend/src/loaders/familyMember.loaders.js` and `backend/src/resolvers/familyMember.resolver.js`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| MUI `Grid` with `item`/`xs`/`sm`/`md` props directly on `<Grid item xs={12} sm={6} md={4}>` | MUI `Grid` (stabilized v2 API) with a single `size={{ xs, sm, md }}` object prop, no `item` prop needed | MUI v6 (this app is on ^6.3.1) | Using the OLD `item xs={}` API still works via a compat layer in some v6 minor versions but the `size` prop is the documented current API — prefer it for anything newly written in this phase [CITED: mui.com/material-ui/react-grid/, MEDIUM confidence — exact deprecation-cutover version not independently confirmed, recommend a quick smoke check during planning/implementation] |

**Deprecated/outdated:** None else identified as directly relevant to this phase's scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MUI v6.3.1's `Grid` default export is the stabilized `size`-prop API (not the legacy `item`/breakpoint-prop API requiring a different import) | Standard Stack, Architecture Patterns (Pattern 4) | Low — if wrong, the planner/implementer would need to fall back to `<Grid item xs={12} sm={6} md={4}>` syntax instead, a one-line-per-usage change with no architectural impact. Recommend a 2-minute smoke check (render one `Grid` with `size` prop and confirm no console warning) at the start of implementation. |
| A2 | `colors.line` (`#e6e8f0`) is the intended "theme line color" referenced by D-06, rather than `colors.slate` (used for `/family`'s parent→child edges) or `colors.primary` (used for the spouse dashed connector) | Architecture Patterns (Pattern 4) | Low-Medium — this is an interpretive reading of D-06's "light... restrained... not a heavy tree edge" language against the three candidate tokens in `theme.js`; if the intended color is actually `colors.slate` (matching `/family`'s edges, just thinner), the visual is a one-line hex swap, no structural change. Worth confirming with the user during `/gsd:discuss-phase` follow-up or noting as a planner discretion point. |

## Open Questions

1. **Exact grid breakpoint values (which pixel-width maps to "tablet")**
   - What we know: NAV-01/D-05 specify ≤3/row desktop, "fewer" on tablet, 1/row mobile.
   - What's unclear: MUI's default breakpoints (`xs<600px, sm<900px, md<1200px...`) don't have a single canonical "tablet" cutoff — CONTEXT leaves exact px values unspecified.
   - Recommendation: `size={{ xs: 12, sm: 6, md: 4 }}` (1/row mobile, 2/row tablet ~600-900px, 3/row desktop ≥900px) is a reasonable, idiomatic default matching MUI's own breakpoint semantics; treat as Claude's Discretion per CONTEXT, no further research needed.

2. **Loading-state UI during an expand (spinner-on-card vs. skeleton-row) — explicitly Claude's Discretion per CONTEXT**
   - What we know: CONTEXT defers this choice explicitly, pointing at `DetailPage`/`FamilyTreePage` idioms.
   - What's unclear: `DetailPage` currently only has a full-page `CircularProgress` (initial load); there's no existing "inline small loading" idiom in this specific page to mirror yet.
   - Recommendation: A small `CircularProgress` (MUI default `size` ~20-24px) replacing the expand chevron temporarily, OR disabling the expand button with an `aria-busy` attribute during `loadingId === person.id`, is consistent with the app's existing sparse use of `CircularProgress` elsewhere (e.g., `DetailPage`'s own full-page spinner) and needs no new component. Planner should pick one; either satisfies the phase's requirements.

## Environment Availability

Skipped — this phase introduces no new external tool, service, or runtime dependency. All required libraries (`react`, `@mui/material`, `vitest`, `@testing-library/react`) are already installed and verified present via direct `package.json` read.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (`frontend/vitest.config.js`) |
| Config file | `frontend/vitest.config.js` (jsdom environment, `frontend/test/setup.js` for RTL/jest-dom setup) |
| Quick run command | `npm test --workspace frontend -- run useDescendantNav` (or `GenerationGrid`/`DetailPage`) |
| Full suite command | `npm test --workspace frontend` (runs `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Expanding a person loads/shows direct children in a responsive grid grouped by generation with a visible connector | component | `npm test --workspace frontend -- run GenerationGrid` | ❌ Wave 0 |
| NAV-02 | Re-clicking expand collapses children + hides all descendants; control reflects state | component | `npm test --workspace frontend -- run DetailPage` | ❌ Wave 0 (extends existing `DetailPage.test.jsx`) |
| NAV-03 | At most 3 generations shown at once, ever | unit (reducer) + component | `npm test --workspace frontend -- run descendantNav.reducer` | ❌ Wave 0 |
| NAV-04 | Expanding a childful grandchild forward-shifts the view; no full reload | unit (reducer) + component | `npm test --workspace frontend -- run descendantNav.reducer` | ❌ Wave 0 |
| PERF-01 | Opening `/detail` loads only the main person; children load only on expand | component (mock `graphqlRequest`, assert call count/args at each step) | `npm test --workspace frontend -- run DetailPage` | ❌ Wave 0 (extends existing) |
| PERF-03 | Cached descendants served with no refetch, no duplicate requests, no unnecessary re-renders | component (call-count assertions) + `<Profiler>`-based commit-count assertion | `npm test --workspace frontend -- run useDescendantNav` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npm test --workspace frontend -- run <file>` for the file(s) touched
- **Per wave merge:** `npm test --workspace frontend` (full frontend suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/hooks/descendantNav.reducer.js` + `descendantNav.reducer.test.js` — pure reducer covering: initial state, expand-top, expand-child (toggle + sibling-swap), forward-shift (push), walk-back-up (pop, exact restoration), and the specific NAV-03 invariant test below.
- [ ] `frontend/src/hooks/useDescendantNav.js` + `useDescendantNav.test.js` — cache-hit-skips-fetch, cache-miss-fetches-and-caches, RESET-on-mainPerson-change preserves cache.
- [ ] `frontend/src/components/person/GenerationGrid.jsx` + `.test.jsx` — renders N `PersonCard`s with correct `size` props, exactly one `ApexCue` per generation container (not per card), spouse prop pass-through.
- [ ] Extend `frontend/src/pages/DetailPage.test.jsx` — wire real `onExpand`, assert NAV-01..04/PERF-01/PERF-03 end-to-end through mocked `graphqlRequest`.
- [ ] A `<Profiler>`-based render-count test helper (small local test utility, not a new dependency — `Profiler` is built into `react`) for the PERF-03 "no unnecessary re-render" assertion, e.g.:
  ```jsx
  // In the test file only:
  import { Profiler } from 'react';
  const onRender = vi.fn();
  render(<Profiler id="nav" onRender={onRender}>{/* ...DetailPage tree... */}</Profiler>);
  // ...expand, then re-expand from cache...
  const commitsAfterCacheHit = onRender.mock.calls.length;
  expect(commitsAfterCacheHit).toBe(expectedExactCount); // not "at most" — prove the exact number
  ```
- [ ] **NAV-03 invariant test (recommended as an explicit named test, not just incidental coverage):** starting from head, expand top → expand a gen1 child → expand a gen2 grandchild-with-children (shift) → assert exactly 2 `PersonCard`s exist for the OLD grandparent/topId's siblings (i.e., they are unmounted, `queryByTestId` returns null) and exactly 3 distinct roles (Head/Child/Grandchild — post-shift, using the NEW frame's terms) are present in the DOM at once, never 4.

## Security Domain

No new authentication, authorization, or input-handling surface is introduced by this phase — all reads go through the existing `familyMember(id)` resolver, which already calls `requireFamilyAccess(user)` (unchanged) before returning any data, and the `id`/`term` arguments are already parameterized (Sequelize `findByPk`/`Op.substring`, no raw interpolation). This phase adds zero new mutations and zero new resolvers.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unchanged — `/detail` route already redirects unauthenticated users (DETAIL-01, Phase 26) |
| V3 Session Management | No | No new session concept; JWT flow unchanged |
| V4 Access Control | Yes (reused, not new) | `requireFamilyAccess(user)` already gates `familyMember(id)` (Phase 24); this phase's new `EXPAND_CHILDREN_QUERY` calls the SAME resolver, inheriting the same gate — no new authorization logic needed or should be written |
| V5 Input Validation | Yes (reused, not new) | `id: ID!` is GraphQL-typed and passed straight to Sequelize's parameterized `findByPk` (via DataLoader) — no client-controlled string ever reaches a raw query |
| V6 Cryptography | No | Not touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A non-family-scoped user probing `familyMember(id)` with arbitrary ids to enumerate the tree via the new expand-triggered query | Information Disclosure | Already mitigated upstream by `requireFamilyAccess(user)` (unchanged, Phase 12/24) — this phase's new query is not a new attack surface since it hits the identical resolver/gate as the existing `FAMILY_MEMBER_QUERY`. No new test needed beyond confirming (or reusing an existing) adversarial test that an unauthenticated/non-family request to `familyMember` is already rejected. |

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `frontend/src/pages/DetailPage.jsx`, `DetailPage.test.jsx` — current query shape, inert `onExpand`, test patterns
- `frontend/src/components/person/PersonCard.jsx`, `PersonCard.test.jsx` — component contract, expand gating, spouse pairing
- `backend/src/schemas/familyMember.schema.js`, `backend/src/resolvers/familyMember.resolver.js`, `backend/src/loaders/familyMember.loaders.js` — available fields, resolver behavior, DataLoader batching proof
- `frontend/src/api/graphqlClient.js` — `graphqlRequest` shape
- `frontend/src/theme.js` — `colors` tokens (`line`, `slate`, `primary`)
- `frontend/src/components/family/FamilyTreeCanvas.jsx`, `familyTree.layout.js` — `/family`'s connector/spouse visual language (referenced for contrast, not reuse)
- `frontend/package.json`, `frontend/vitest.config.js`, `frontend/test/setup.js` — confirmed Vitest ^4.1.10 / RTL ^16.3.2 / jsdom ^26 already installed and configured
- `.planning/phases/27-descendant-navigation-performance/27-CONTEXT.md` — locked decisions D-01..D-09
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — requirement text, phase goal/success criteria, cross-phase decisions

### Secondary (MEDIUM confidence)
- MUI Grid `size` prop API — [WebFetch of mui.com/material-ui/react-grid/, cross-checked against WebSearch results referencing the same page]

### Tertiary (LOW confidence)
- None — no unverified claims remain outside the Assumptions Log above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all versions read directly from `package.json`
- Architecture (state machine, cache): HIGH — derived directly from CONTEXT.md's locked decisions with no external-library ambiguity; the reducer/cache pattern is a standard React idiom, not a novel technique
- Architecture (grid/apex visuals): MEDIUM — MUI Grid API confirmed via web docs (not Context7, unavailable this session), apex technique is an original CSS construction with no external source to verify against
- Pitfalls: HIGH — derived from direct reading of the actual reducer requirements and the existing test suite's `afterEach` behavior (`test/setup.js`)

**Research date:** 2026-08-03
**Valid until:** 30 days (stable, no fast-moving external dependencies; re-verify MUI Grid API note if `@mui/material` is upgraded past 6.x before this phase executes)
