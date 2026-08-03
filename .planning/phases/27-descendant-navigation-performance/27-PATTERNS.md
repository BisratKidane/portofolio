# Phase 27: Descendant Navigation & Performance - Pattern Map

**Mapped:** 2026-08-03
**Files analyzed:** 8 (4 new source + 4 new/modified test, per RESEARCH.md's recommended structure)
**Analogs found:** 8 / 8 (all role-matched; one file — the reducer/hook — has no direct in-repo analog since it is the first custom hook, so it maps to the nearest stateful-module pattern instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/pages/DetailPage.jsx` (modify) | route/page (controller-equivalent) | request-response (GraphQL) | itself (existing file, pattern already established) + `frontend/src/pages/FamilyTreePage.jsx` | exact (same file) / role-match |
| `frontend/src/pages/DetailPage.test.jsx` (modify) | test | request-response | itself (existing tests) + `FamilyTreePage.test.jsx` | exact |
| `frontend/src/hooks/descendantNav.reducer.js` (new) | utility (pure state-transition function) | transform | no direct analog (first pure reducer in codebase) — nearest pattern: `frontend/src/components/family/familyTree.layout.js` (pure, no-React, unit-tested layout/transform module) | role-match (transform, no-React) |
| `frontend/src/hooks/descendantNav.reducer.test.js` (new) | test | transform | `frontend/src/components/family/familyTree.layout.test.js` (pure-function unit test, no RTL/render) | role-match |
| `frontend/src/hooks/useDescendantNav.js` (new) | hook (first custom hook in repo) | CRUD-ish (read-through cache) + event-driven (expand/collapse) | no direct hook analog — nearest pattern: `frontend/src/context/AuthContext.jsx` (stateful module owning fetch + derived state, consumed by other components) combined with `DetailPage.jsx`'s `loadPersonById`/`graphqlRequest` fetch idiom | role-match (fetch-owning stateful module) |
| `frontend/src/hooks/useDescendantNav.test.js` (new) | test | event-driven | `DetailPage.test.jsx` (mocks `graphqlRequest`, asserts call count/args, `waitFor`) | role-match |
| `frontend/src/components/person/GenerationGrid.jsx` (new) | component (presentational layout wrapper) | request-response (props in, JSX out) | `frontend/src/components/person/PersonCard.jsx` (presentational, MUI `Box`/`Paper`, `colors` import, spouse-connector `Box` construction) | role-match (sibling component in same directory, same visual-language conventions) |
| `frontend/src/components/person/GenerationGrid.test.jsx` (new) | test | request-response | `frontend/src/components/person/PersonCard.test.jsx` (RTL render, `data-testid`/`aria-hidden` assertions, `screen.getByTestId`) | role-match |

## Pattern Assignments

### `frontend/src/pages/DetailPage.jsx` (modify — make `onExpand` live, host the nav layer)

**Analog:** itself (current inert version) + `frontend/src/pages/FamilyTreePage.jsx` for the loading-idiom precedent.

**Current imports** (lines 9-13):
```javascript
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';
import PersonCard from '../components/person/PersonCard.jsx';
import PersonSearch from '../components/person/PersonSearch.jsx';
```
Extend with `useDescendantNav` and `GenerationGrid`:
```javascript
import { useDescendantNav } from '../hooks/useDescendantNav.js';
import GenerationGrid from '../components/person/GenerationGrid.jsx';
```

**Existing initial-load query, unchanged** (lines 21-35) — do NOT extend this query to two levels deep (PERF-01, Pattern 3 in RESEARCH.md):
```javascript
const FAMILY_MEMBER_QUERY = `
  query FamilyMember($id: ID!) {
    familyMember(id: $id) {
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
`;
```

**Uniform person-by-id fetch pattern to mirror for the new expand-only query** (lines 45-52):
```javascript
const loadPersonById = useCallback((id) => {
  setLoading(true);
  setError('');
  return graphqlRequest(FAMILY_MEMBER_QUERY, { id })
    .then((data) => setMainPerson(data.familyMember))
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));
}, []);
```
The new hook's `ensureChildren(id)` should follow the same `graphqlRequest(...).then(...).catch(...).finally(...)` shape, but writing into the `useRef` cache instead of `useState`.

**Inert head render to replace** (lines 120-129) — this is the exact spot the nav layer wires in:
```jsx
<Box sx={{ width: '100%', maxWidth: 420 }}>
  <PersonCard
    member={mainPerson}
    role="Head"
    spouse={mainPerson.spouses?.[0]}
    expanded={false}
    onExpand={() => {}}
    onEdit={() => {}}
  />
</Box>
```
Replace `expanded={false}` / `onExpand={() => {}}` with values derived from `useDescendantNav(mainPerson)`'s returned state (e.g. `expanded={nav.topExpanded}`, `onExpand={nav.onExpandTop}`), and render `<GenerationGrid people={nav.gen1} role="Child" ... />` beneath it, and conditionally `<GenerationGrid people={nav.gen2} role="Grandchild" ... />` beneath that when a child is expanded — mirroring the existing centered `Box` column layout (`sx={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}`, lines 114-119).

**Error/loading/empty-state patterns (unchanged, reuse verbatim)** — lines 78-112 (loading `CircularProgress` + "Loading…", error `Alert` + Retry `Button`, missing-head `Alert severity="info"`, missing-person `Typography`). These states are ALL about the initial fetch and are untouched by this phase; the nav layer's own expand-in-flight loading state (PERF-01/discretion) should be scoped to the individual card/grid being expanded, not this page-level loading gate — see `FamilyTreePage.jsx` lines 83-90 for the equivalent full-page pattern to explicitly NOT reuse for a per-card spinner (that page has no per-item loading state to mirror either — this is genuinely new, small-scale UI; a `CircularProgress size={20}` inline next to/instead of the expand chevron is the smallest deviation from established idiom).

---

### `frontend/src/pages/DetailPage.test.jsx` (modify — extend page/interaction tests)

**Analog:** itself (existing mock/render harness).

**Mock setup to reuse exactly** (lines 12-20):
```javascript
vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

import { graphqlRequest } from '../api/graphqlClient.js';
```

**Render helper to reuse exactly** (lines 22-28):
```javascript
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/detail']}>
      <DetailPage />
    </MemoryRouter>
  );
}
```

**Call-count/args assertion idiom to extend for PERF-01/PERF-03** (lines 76-88, 154-158): the existing tests already establish the exact idiom needed —
```javascript
expect(graphqlRequest).toHaveBeenCalledTimes(2);
expect(graphqlRequest.mock.calls[0][0]).toMatch(/familyHead/);
expect(graphqlRequest.mock.calls[1][1]).toEqual({ id: '1' });
```
New tests should follow this exact shape to prove: (a) no `children`-deep query fires until an expand click (PERF-01 — count stays at 2 after initial load), (b) a repeat expand serves from cache with the SAME total call count as the first expand (PERF-03), and (c) a fresh `id` fires exactly one more `graphqlRequest` call with the expand-only query matched via `/* expand query name */ /i` regex, same style as `expect(lastCall[0]).toMatch(/familyMember/)` (line 156).

**No-op-handler regression test to extend, now that handlers are real** (lines 122-134): this existing test asserts clicking never throws with inert handlers — after this phase, adapt it (or add a sibling test) asserting the SAME click now triggers a live `graphqlRequest` call and grid render, using `fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }))` then `await waitFor(...)`.

**`<Profiler>` render-count technique (PERF-03, new — not present anywhere in the repo yet)** — no existing analog; use verbatim from RESEARCH.md's Validation Architecture section:
```jsx
import { Profiler } from 'react';
const onRender = vi.fn();
render(<Profiler id="nav" onRender={onRender}>{/* ...DetailPage tree... */}</Profiler>);
// ...expand, then re-expand from cache...
expect(onRender.mock.calls.length).toBe(expectedExactCount);
```

---

### `frontend/src/hooks/descendantNav.reducer.js` (new — pure view-frame reducer)

**Analog:** no direct pure-reducer analog exists in the repo (first one). Nearest structural match: `frontend/src/components/family/familyTree.layout.js` — a pure, React-free, unit-tested transform module.

**Imports pattern to mirror** (module has none beyond its own types/constants — pure functions, no React/MUI imports):
```javascript
// No framework imports needed — this is a pure function module,
// following the same "no React import" convention as familyTree.layout.js.
```

**Core reducer pattern** — copy directly from RESEARCH.md Pattern 1 (already verified against CONTEXT D-01..D-04 and NAV-01..04):
```javascript
export const initial = (topId) => ({ topId, topExpanded: false, expandedChildId: null, history: [] });

export function navReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return initial(action.id);
    case 'EXPAND_TOP':
      if (state.topExpanded) {
        if (state.history.length > 0) {
          const prev = state.history[state.history.length - 1];
          return { ...prev, history: state.history.slice(0, -1) };
        }
        return { ...state, topExpanded: false, expandedChildId: null };
      }
      return { ...state, topExpanded: true };
    case 'EXPAND_CHILD': {
      const { id } = action;
      if (state.expandedChildId === id) return { ...state, expandedChildId: null };
      return { ...state, expandedChildId: id };
    }
    case 'EXPAND_GRANDCHILD': {
      const { id } = action;
      return {
        topId: state.expandedChildId,
        topExpanded: true,
        expandedChildId: id,
        history: [...state.history, state]
      };
    }
    default:
      return state;
  }
}
```

**Naming convention note:** the codebase's established camelCase-verb naming (`signToken`, `getUserFromRequest`, `requireAuth`) supports `navReducer`/`initial` as exported names; keep action `type` strings SCREAMING_SNAKE_CASE-free (plain `'RESET'`/`'EXPAND_TOP'` etc.) — no existing reducer/action-type convention exists elsewhere in the repo to contradict this, use React's own `useReducer` doc convention (uppercase-with-underscore type strings) as-is, matching RESEARCH.md's example verbatim.

---

### `frontend/src/hooks/descendantNav.reducer.test.js` (new)

**Analog:** `frontend/src/components/family/familyTree.layout.test.js` — pure-function unit tests with no RTL/render, direct `expect(fn(input)).toEqual(output)` assertions.

**Pattern:** plain `describe`/`it` blocks calling `navReducer` directly (no `render`, no mocks needed — the reducer has zero external dependencies). Per RESEARCH.md's explicit test-plan: cover initial state, expand-top toggle, expand-child (toggle + sibling auto-swap via D-01), forward-shift (`EXPAND_GRANDCHILD` push), walk-back-up (`EXPAND_TOP` pop, asserting `toEqual` byte-for-byte restoration of the pre-shift frame, not just spot-checking `topId`), and the explicit NAV-03 invariant test (never more than 3 generations' worth of ids present in the frame across an expand→expand→shift sequence).

---

### `frontend/src/hooks/useDescendantNav.js` (new — first custom hook)

**Analog:** no existing custom-hook analog (first one in the repo). Nearest pattern combines two things already in the codebase:
1. `frontend/src/context/AuthContext.jsx` — a stateful module owning async fetch + derived state, exposing a small imperative API to consumers, throwing when misused.
2. `frontend/src/pages/DetailPage.jsx`'s `loadPersonById` — the exact `graphqlRequest(...).then().catch().finally()` shape to reuse for `ensureChildren`.

**Fetch-idiom to mirror exactly** (from `DetailPage.jsx` lines 45-52, adapted for cache-write instead of `setState`):
```javascript
const ensureChildren = useCallback((id) => {
  if (cache.current.has(id)) return Promise.resolve(cache.current.get(id));
  setLoadingId(id);
  return graphqlRequest(EXPAND_CHILDREN_QUERY, { id })
    .then((data) => {
      const children = data.familyMember?.children ?? [];
      cache.current.set(id, children);
      return children;
    })
    .finally(() => setLoadingId((current) => (current === id ? null : current)));
}, []);
```

**New expand-only query** (do NOT merge into `FAMILY_MEMBER_QUERY` — separate constant, separate variable name convention `_QUERY` suffix matching the app's SCREAMING_SNAKE_CASE convention, e.g. `EXPAND_CHILDREN_QUERY`, mirroring `FAMILY_HEAD_QUERY`/`FAMILY_MEMBER_QUERY` naming in `DetailPage.jsx`):
```graphql
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
Confirmed against `backend/src/schemas/familyMember.schema.js` (lines 13-44): `FamilyMember` type has `fullname`, `geezFullname`, `spouses: [FamilyMember!]!`, `children: [FamilyMember!]!`, `canEdit: Boolean!` — all fields in the query above exist on the type as written.

**Ref-vs-state split** (RESEARCH.md Pattern 2, no in-repo precedent but directly actionable): `useRef(new Map())` for the cache (never triggers render on write), `useReducer(navReducer, ...)` for the view frame (drives render). Do not put cached children arrays into `useState`.

**RESET-on-mainPerson-change, preserving cache** — new `useEffect`:
```javascript
useEffect(() => {
  dispatch({ type: 'RESET', id: mainPerson?.id });
  // Deliberately NOT clearing cache.current — D-09: cache survives a
  // search-driven main-person reset.
}, [mainPerson?.id]);
```

---

### `frontend/src/hooks/useDescendantNav.test.js` (new)

**Analog:** `frontend/src/pages/DetailPage.test.jsx` — mock `graphqlRequest`, `waitFor`, call-count/args assertions (lines 12-20, 76-88). Since there's no RTL wrapper needed for a hook in isolation, use `@testing-library/react`'s `renderHook` (already available via the installed `@testing-library/react` ^16.3.2 — no new dependency) rather than mounting `DetailPage`.

**Assertions to cover per RESEARCH.md Wave 0 gaps:** cache-hit skips fetch (assert `graphqlRequest` call count unchanged on second `ensureChildren(sameId)`), cache-miss fetches-and-caches (assert exactly one call, and a second call for the SAME id after resolution doesn't re-fire), `RESET`-on-`mainPerson`-change preserves the cache (change `mainPerson.id`, then call `ensureChildren` for a PREVIOUSLY cached id and assert no new `graphqlRequest` call).

---

### `frontend/src/components/person/GenerationGrid.jsx` (new — children grid + inverted-V connector)

**Analog:** `frontend/src/components/person/PersonCard.jsx` — same directory, same presentational-component convention, same `colors` import, same `Box`-based connector construction technique (the dashed spouse connector is exactly the precedent for the new apex cue).

**Imports pattern to mirror** (from `PersonCard.jsx` lines 17-23):
```javascript
import { Box, Grid } from '@mui/material';
import { colors } from '../../theme.js';
import PersonCard from './PersonCard.jsx';
```

**Connector-as-plain-Box technique to mirror exactly** (`PersonCard.jsx` lines 62-72 — the existing dashed spouse connector is the direct precedent for the new inverted-V apex, both are `aria-hidden` `Box` elements styled via `sx`, not SVG):
```jsx
<Box
  aria-hidden="true"
  data-connector-style="dashed"
  sx={{ width: 32, alignSelf: 'center', borderTop: `2px dashed ${colors.primary}` }}
/>
```
Note: the spouse connector uses `colors.primary` (indigo); D-06 explicitly asks for a LIGHTER/more restrained cue than either `/family`'s tree edges (`colors.slate`, confirmed via `frontend/src/components/family/FamilyTreeCanvas.jsx` line 348: `style: { stroke: colors.slate, strokeWidth: 1.5 }`) or the spouse connector's `colors.primary`. Use `colors.line` (`#e6e8f0`, the borders/dividers token) for the apex — this is the RESEARCH.md A2 assumption, now corroborated: `/family` already reserves `slate` for parent→child edges and `primary` for spouse dashed lines, so `line` is the only remaining "restrained, not heavy" token consistent with D-06's explicit contrast against both.

**`data-testid` convention to mirror** (`PersonCard.jsx` line 86, `data-testid={`person-card-${member.id}`}`): give the apex a stable test hook, e.g. `data-testid="generation-apex"`, one per generation container (never per card) — matches D-06's "group-level, not per-child" requirement and makes it directly assertable via `getAllByTestId('generation-apex')` returning exactly one per rendered generation.

**Grid-cell pattern** (new — MUI v6 `size` prop, no in-repo precedent since `/family` uses `@xyflow/react` positioning, not `Grid`):
```jsx
<Grid container spacing={2} sx={{ width: '100%' }}>
  {people.map((person) => (
    <Grid key={person.id} size={{ xs: 12, sm: 6, md: 4 }}>
      <PersonCard
        member={person}
        role={role}
        spouse={person.spouses?.[0]}
        expanded={person.id === expandedChildId}
        onExpand={onExpand}
        onEdit={onEdit}
      />
    </Grid>
  ))}
</Grid>
```
The `spouse={person.spouses?.[0]}` prop-pass-through is copied verbatim from `DetailPage.jsx` line 124 (`spouse={mainPerson.spouses?.[0]}`) — same "first/only spouse" convention (D-12/D-14, single-last-spouse), reused unchanged for every gen1/gen2 card.

**Critical: derive `expanded` from current reducer state only** (Pitfall 5 in RESEARCH.md) — `expanded={person.id === expandedChildId}` (or `=== topId` for gen1-vs-gen2 distinction), never from a locally-tracked "last clicked" variable. This is the single highest-risk correctness detail this file must get right.

---

### `frontend/src/components/person/GenerationGrid.test.jsx` (new)

**Analog:** `frontend/src/components/person/PersonCard.test.jsx` — plain `render`/`screen` RTL pattern, no router/mocks needed (this is a leaf presentational component, same as `PersonCard` itself — no `graphqlRequest` mock needed here, unlike the page tests).

**Patterns to mirror:**
- `render(<GenerationGrid people={[...]} role="Child" ... />)` — same `renderCard`-style local helper convention as `PersonCard.test.jsx` lines 24-35 (`renderCard(overrides = {})`).
- Assert exactly one apex per generation, never per card — mirror the `container.querySelectorAll('[data-testid^="person-card-"]').length` counting idiom (`PersonCard.test.jsx` lines 68, 170, 202, 207) adapted to `container.querySelectorAll('[data-testid="generation-apex"]').length` and asserting it equals `1` regardless of `people.length`.
- Assert `aria-hidden="true"` on the apex, mirroring `PersonCard.test.jsx` lines 179-184 (`expect(connector).toHaveAttribute('aria-hidden', 'true')`).
- Spouse pass-through: assert a `person.spouses[0]` renders paired via the existing dashed connector, reusing `PersonCard.test.jsx`'s own spouse-pairing test technique (lines 167-208) rather than re-testing `PersonCard`'s internal spouse logic — `GenerationGrid`'s test only needs to confirm the `spouse` prop was correctly passed through, not re-verify `PersonCard`'s spouse rendering.
- jsdom breakpoint pitfall (RESEARCH.md Pitfall 3): do NOT assert on `getBoundingClientRect()` or computed pixel widths for "3 per row" — assert the declarative `size` prop contract only if MUI exposes it on a testable attribute, otherwise trust MUI's Grid CSS and just assert the correct COUNT of `PersonCard`s rendered per generation.

---

## Shared Patterns

### Page-owns-fetch, card-is-presentational (Phase 25/26 convention, applies to all 4 new files)
**Source:** `frontend/src/pages/DetailPage.jsx` (fetch/state) + `frontend/src/components/person/PersonCard.jsx` (pure props-in/JSX-out)
**Apply to:** `useDescendantNav.js` (owns fetch/cache/reducer), `DetailPage.jsx` (wires the hook), `GenerationGrid.jsx` (stays presentational — receives `people`/`role`/`expandedChildId`/handlers as props, does no fetching itself)
```javascript
// DetailPage.jsx already establishes: page owns graphqlRequest calls and
// state; PersonCard never calls graphqlRequest or holds fetch state.
// GenerationGrid must follow the same rule — it renders PersonCards and
// forwards handlers, it never calls ensureChildren/graphqlRequest itself.
```

### `graphqlRequest` error/response shape (applies to `useDescendantNav.js`)
**Source:** `frontend/src/api/graphqlClient.js` lines 23-36
```javascript
export async function graphqlRequest(query, variables = {}) {
  try {
    const response = await graphqlClient.post('', { query, variables });
    if (response.data.errors?.length) {
      throw new Error(response.data.errors.map((error) => error.message).join('\n'));
    }
    return response.data.data;
  } catch (error) {
    if (error.message === 'Network Error') {
      throw new Error('Network Error: the frontend could not reach the GraphQL API. ...');
    }
    throw error;
  }
}
```
`ensureChildren` in `useDescendantNav.js` should let this same error surface bubble up (no need to re-wrap); if the hook wants to surface a per-card error state, follow `DetailPage.jsx`'s `.catch((err) => setError(err.message))` idiom (line 50) scoped to the expanding card instead of the whole page.

### Theme color tokens (applies to `GenerationGrid.jsx`)
**Source:** `frontend/src/theme.js` lines 7-24
```javascript
export const colors = {
  primary: '#6366f1',  // used by PersonCard's spouse dashed connector
  slate: '#64748b',     // used by /family's parent-child tree edges
  line: '#e6e8f0',      // borders/dividers — USE THIS for the D-06 apex (restrained, distinct from both above)
  ink: '#0f172a',
  ...
};
```

### `data-testid`/`aria-hidden` connector convention (applies to `GenerationGrid.jsx`)
**Source:** `frontend/src/components/person/PersonCard.jsx` lines 65-69 (dashed spouse connector — the direct precedent for the new apex cue's markup style: plain `Box`, `aria-hidden="true"`, a `data-*` attribute naming the connector style, styled entirely via `sx` border properties, no SVG).

### Expand-control controlled-prop convention (applies to `GenerationGrid.jsx`, `useDescendantNav.js`)
**Source:** `frontend/src/components/person/PersonCard.jsx` lines 150-159 — `expanded` is always a prop (never internal state), `onExpand(member)` is called with the full member object (not just the id) on click. The nav layer must call `dispatch` with `member.id` extracted from this same object, matching the exact `onExpand={(member) => ...}` shape already proven by `DetailPage.test.jsx` line 130-133's no-op click test.

## No Analog Found

None — every file has at least a role-matched analog. The two furthest-from-existing-precedent files are:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `frontend/src/hooks/descendantNav.reducer.js` | utility (pure reducer) | transform | No prior `useReducer`/pure-reducer module exists in the repo; nearest is `familyTree.layout.js`'s pure-function-with-unit-tests shape, not a reducer per se. RESEARCH.md's Pattern 1 code example is the primary source of truth here, not an in-repo file. |
| `frontend/src/hooks/useDescendantNav.js` | hook | event-driven + CRUD (read-through cache) | First custom hook in the codebase (`frontend/src/hooks/` is a new directory). Composed from two existing idioms (`AuthContext.jsx`'s stateful-module pattern + `DetailPage.jsx`'s fetch idiom) rather than one direct analog. |

Both are still fully specified and low-risk per RESEARCH.md (HIGH confidence on the state-machine/cache architecture), just noted here because "closest analog" required combining two sources rather than pointing at one file.

## Metadata

**Analog search scope:** `frontend/src/pages/`, `frontend/src/components/person/`, `frontend/src/components/family/`, `frontend/src/context/`, `frontend/src/api/`, `frontend/src/theme.js`, `backend/src/schemas/familyMember.schema.js`
**Files scanned:** `DetailPage.jsx`, `DetailPage.test.jsx`, `FamilyTreePage.jsx`, `PersonCard.jsx`, `PersonCard.test.jsx`, `graphqlClient.js`, `theme.js`, `FamilyTreeCanvas.jsx` (grep only), `familyMember.schema.js` (grep only)
**Pattern extraction date:** 2026-08-03
