# Phase 26: /detail Page, Search & Initial Load - Pattern Map

**Mapped:** 2026-08-03
**Files analyzed:** 6 (2 new source, 1 new test, 2 modified, plus shared-consume assets)
**Analogs found:** 6 / 6 (every new/modified file has an in-repo analog — no RESEARCH.md fallback needed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/src/pages/DetailPage.jsx` (NEW) | page (route component) | request-response (read-only, page-owns-fetch) | `frontend/src/pages/FamilyTreePage.jsx` | exact (protected page, `graphqlRequest` + loading/error/empty state idiom) |
| inline search component (NEW — inside `DetailPage.jsx` or `frontend/src/components/person/PersonSearch.jsx`) | component | event-driven (live debounced async options) | `frontend/src/components/manage/AddRelativeDialog.jsx` (Autocomplete + `createFilterOptions`) + `frontend/src/pages/LinkAccountsPage.jsx` (async options + `renderOption` avatar rows) | role-match (adapt from local-array to async-fetch options) |
| `frontend/src/App.jsx` (MODIFY) | route table | request-response | existing `/family` route line (self-analog, line 30) | exact |
| `frontend/src/components/AppLayout.jsx` (MODIFY) | layout / nav | request-response | existing `Family tree` nav Button (self-analog, lines 52-58) | exact |
| `frontend/src/pages/DetailPage.test.jsx` (NEW) | test | — | `frontend/src/pages/FamilyTreePage.test.jsx` (page mock+state) + `AddRelativeDialog.test.jsx` (Autocomplete/Ge'ez) + `PersonCard.test.jsx` | exact composite |

**Consumed verbatim (no new code, do NOT modify):** `frontend/src/api/graphqlClient.js` (`graphqlRequest`), `frontend/src/components/person/PersonCard.jsx`, `frontend/src/utils/displayName.js` (`getGeezDisplay`), `frontend/src/components/manage/MemberAvatarImage.jsx`, `frontend/src/components/MemberFallbackAvatar.jsx`.

---

## Pattern Assignments

### `frontend/src/pages/DetailPage.jsx` (page, request-response)

**Analog:** `frontend/src/pages/FamilyTreePage.jsx`

**Imports pattern** (`FamilyTreePage.jsx` lines 6-14) — hooks + MUI state components + `graphqlRequest`, relative paths with `.js`/`.jsx` extensions:
```jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';
```
For Phase 26 also import `PersonCard from '../components/person/PersonCard.jsx'` and `Autocomplete, TextField` (search) — see search component below.

**Query-string-constant + fetch pattern** (`FamilyTreePage.jsx` lines 20-27, 46-57) — module-scope query constant, `refetch` in `useCallback`, `.then/.catch/.finally` setting three state slices, `useEffect(() => { refetch(); }, [refetch])`:
```jsx
const FAMILY_TREE_QUERY = `
  query FamilyTree {
    familyMembers { id firstname lastname fullname geezFullname gender birthdate isAlive photoUrl ... }
  }
`;
// ...
const refetch = useCallback(() => {
  setPageLoading(true);
  setPageError('');
  return graphqlRequest(FAMILY_TREE_QUERY)
    .then((data) => setMembers(data.familyMembers))
    .catch((err) => setPageError(err.message))
    .finally(() => setPageLoading(false));
}, []);
useEffect(() => { refetch(); }, [refetch]);
```

**Phase 26 query shapes to define** (grounded in `backend/src/schemas/familyMember.schema.js` lines 80-86 — `familyHead: FamilyMember`, `familyMember(id: ID!): FamilyMember`, `searchFamilyMembers(term: String!, limit: Int): [FamilyMember!]!`). Select the exact `PersonCard`-needed fields (see PersonCard contract below) for the person-by-id path:
```jsx
// D-04: head id only, then person-by-id for the card fields
const FAMILY_HEAD_QUERY = `query FamilyHead { familyHead { id } }`;
const FAMILY_MEMBER_QUERY = `
  query FamilyMember($id: ID!) {
    familyMember(id: $id) {
      id fullname geezFullname gender isAlive photoUrl canEdit
      spouses { id fullname geezFullname gender isAlive photoUrl }
      children { id }
    }
  }
`;
// D-01/D-02: raw term straight through; richer fields for the suggestion row (D-03)
const SEARCH_MEMBERS_QUERY = `
  query SearchFamilyMembers($term: String!) {
    searchFamilyMembers(term: $term) {
      id fullname geezFullname gender birthdate photoUrl mothersname
    }
  }
`;
```
Note: `searchFamilyMembers`/`familyHead`/`familyMember` all resolve the full `FamilyMember` type (resolver returns the Sequelize row, `backend/src/resolvers/familyMember.resolver.js` lines 45-73), so any `FamilyMember` field is selectable — `birthdate` + `mothersname` are the "family context" disambiguators for D-03 with no new backend field.

**D-04/D-05 one-uniform-person-by-id path** — both first-load (after `familyHead` → id) and suggestion-select call the same `familyMember(id)` fetch, then set the resolved person as `mainPerson` in page state (no URL param, D-05). Mirror the chained-then structure of `LinkAccountsPage.jsx` lines 324-333 for the paired fetch, or chain `familyHead().then(id => familyMember(id))`.

**Loading state** (`FamilyTreePage.jsx` lines 83-90) → `CircularProgress` in a centered `Box` (D-08 loading):
```jsx
if (pageLoading) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 10 }}>
      <CircularProgress />
      <Typography color="text.secondary">Loading…</Typography>
    </Box>
  );
}
```

**Error state + optional Retry** (`FamilyTreePage.jsx` lines 92-108) → `Alert severity="error"` + a `Button onClick={refetch}` (D-08 failed-request; the "Try again" affordance is optional per Claude's Discretion):
```jsx
if (pageError) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
      <Alert severity="error">We couldn't load this person.</Alert>
      <Button variant="contained" onClick={refetch}>Retry</Button>
    </Box>
  );
}
```

**Empty/missing state** (`FamilyTreePage.jsx` lines 110-119) → mirror this for D-08 `missing-family-head` but with `Alert severity="info"` ("No family head found") per D-08, and a graceful message for `missing-person-info`. Never an empty/broken card.

**PersonCard contract to satisfy** (`frontend/src/components/person/PersonCard.jsx` lines 46, 75-81, 104-108, 150-153) — props `{ member, role, spouse, isSpouse, expanded, onExpand, onEdit }`:
- Pass `role="Head"` on first load (D-07); pass the single `spouse` (D-05 lateral spouse) from `member.spouses[0]` if present.
- Card reads `member.children?.length` to gate the expand control (line 80-81) and `member.canEdit === true` to gate the edit button (line 104) — so the person-by-id selection MUST include `children { id }` and `canEdit`.
- **Guard callbacks (advisory from Phase 25 code review):** `onEdit`/`onExpand` are invoked unguarded (`onEdit(member)` line 107, `onExpand(member)` line 153). Phase 26 leaves expand/edit inert — pass no-op functions (`() => {}`) rather than `undefined` to avoid a crash.

---

### Inline search component (component, event-driven async options)

**Analogs:** `frontend/src/pages/LinkAccountsPage.jsx` lines 183-207 (async-list Autocomplete with avatar `renderOption`) + `frontend/src/components/manage/AddRelativeDialog.jsx` lines 58-60, 271-278 (`createFilterOptions` Latin-OR-Ge'ez precedent).

**D-01/D-02 note:** the backend already does the Latin+Ge'ez matching server-side (resolver lines 61-72). So unlike the two analogs — which filter a **local array** client-side via `createFilterOptions` — Phase 26 drives options from a **debounced async `searchFamilyMembers(term)` fetch** and should set `filterOptions={(x) => x}` (identity, do NOT re-filter) so the server result set is shown as-is. The `createFilterOptions` `stringify` idiom below is the reference for *why* Ge'ez "just works," not code to copy verbatim here.

**createFilterOptions Latin-OR-Ge'ez reference** (`AddRelativeDialog.jsx` lines 58-60) — kept only if any client-side filtering is added:
```jsx
const filterOptions = createFilterOptions({
  stringify: (member) => `${member.fullname} ${member.geezFullname ?? ''}`
});
```

**Async-driven Autocomplete shape** — adapt `AddRelativeDialog.jsx` lines 271-278 (controlled value + `onChange`) with `LinkAccountsPage.jsx` `inputValue`/`onInputChange` for live typing. Debounce (~250 ms) + min-char (~2) are Claude's discretion (D-01):
```jsx
<Autocomplete
  options={options}                       // from debounced searchFamilyMembers fetch
  filterOptions={(x) => x}                // server already filtered — no client re-filter
  getOptionLabel={(member) => member.fullname}
  isOptionEqualToValue={(o, v) => o.id === v.id}   // LinkAccountsPage.jsx:186
  onInputChange={(_e, value) => { /* debounce -> setTerm(value) */ }}
  onChange={(_e, value) => value && loadPersonById(value.id)}  // D-05 select
  noOptionsText="No matches"              // D-08 no-search-results
  renderInput={(params) => <TextField {...params} label="Search by name" />}
/>
```

**Rich suggestion-row `renderOption`** (copy the avatar+two-line structure from `LinkAccountsPage.jsx` lines 189-205, then enrich per D-03 with Ge'ez + birth year + family context):
```jsx
renderOption={(props, member) => {
  const { key, ...optionProps } = props;
  const geez = getGeezDisplay(member);                        // utils/displayName.js
  const year = member.birthdate ? String(member.birthdate).slice(0, 4) : null; // LinkAccountsPage.jsx:63
  return (
    <Box component="li" key={key} {...optionProps} sx={{ gap: 1.5 }}>
      <MemberAvatarImage member={member} size={32} />         {/* row avatar */}
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap>{member.fullname}</Typography>
        {geez && <Typography variant="body2" color="text.secondary" lang={geez.lang} noWrap>{geez.text}</Typography>}
        {/* D-03: birth year + family context (mothersname), graceful when absent */}
        <Typography variant="body2" color="text.secondary" noWrap>
          {[year && `b. ${year}`, member.mothersname].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
    </Box>
  );
}}
```

**Avatar in rows:** `MemberAvatarImage` (`frontend/src/components/manage/MemberAvatarImage.jsx` line 12) takes `{ member, size }` and needs only `member.photoUrl` + `member.gender` + `member.fullname`; it falls back to `MemberFallbackAvatar` (gender illustration) silently on missing/broken photo — no extra handling needed.

**Ge'ez helper** (`frontend/src/utils/displayName.js` lines 10-14) — use verbatim, returns `{ text, lang: 'ti' } | null`:
```jsx
const geez = getGeezDisplay(member); // null when geezFullname absent -> omit the line
```

---

### `frontend/src/App.jsx` (route table) — MODIFY

**Analog:** the sibling `/family` route (self, line 30). Add `/detail` inside the SAME `<ProtectedRoute />` group (lines 27-35, D-06 — any authenticated user, no role gate):
```jsx
<Route element={<ProtectedRoute />}>
  <Route path="dashboard" element={<Dashboard />} />
  <Route path="manage" element={<ManagePage />} />
  <Route path="family" element={<FamilyTreePage />} />
  <Route path="detail" element={<DetailPage />} />   {/* NEW — Phase 26 */}
  ...
</Route>
```
Add the import next to the other page imports (lines 4-14):
```jsx
import DetailPage from './pages/DetailPage.jsx';
```

---

### `frontend/src/components/AppLayout.jsx` (nav) — MODIFY

**Analog:** the `Family tree` nav Button (self, lines 52-58). Add a `/detail` `Button` inside the authenticated `Stack` (lines 44-97), alongside Dashboard/Family/Manage (D-07):
```jsx
<Button
  component={RouterLink}
  to="/detail"
  sx={{ color: colors.slate, fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
>
  Detail
</Button>
```
No role guard (unlike the `user.role === 'ADMIN'` gate on Link accounts, lines 73-81). If `/detail` should use the centered `lg` container (head card centered, D-07), no `isFullBleed`/`isWide` change is needed — the default `Container maxWidth="lg"` branch (lines 112-115) already centers content. Only add a `pathname === '/detail'` layout flag if a full-bleed/wide variant is wanted.

---

### `frontend/src/pages/DetailPage.test.jsx` (test) — NEW

**Analogs (composite):** `FamilyTreePage.test.jsx` (page harness) + `AddRelativeDialog.test.jsx` (Autocomplete + Ge'ez typing) + `PersonCard.test.jsx` (card assertions).

**Mock + render harness** (`FamilyTreePage.test.jsx` lines 5-24, 88-99) — Vitest + RTL + `MemoryRouter`, mock `graphqlRequest` and `photoClient`, `beforeEach(vi.clearAllMocks)`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DetailPage from './DetailPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
vi.mock('../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));
import { graphqlRequest } from '../api/graphqlClient.js';

function renderPage() {
  return render(<MemoryRouter initialEntries={['/detail']}><DetailPage /></MemoryRouter>);
}
```
If `DetailPage` calls `useAuth`, also mock `../context/AuthContext.jsx` exactly as `FamilyTreePage.test.jsx` lines 10-14.

**State-branch tests** — copy the loading/error/Retry/data pattern (`FamilyTreePage.test.jsx` lines 101-121): `graphqlRequest.mockReturnValue(new Promise(() => {}))` for loading; `mockRejectedValueOnce` then assert `Alert`; `mockResolvedValueOnce({ familyHead: { id: '1' } })` then `mockResolvedValueOnce({ familyMember: {...} })` for the two-round-trip happy path (D-04). Assert `graphqlRequest.mock.calls[0][0]` contains `familyHead` and `calls[1]` passes `{ id: '1' }`.

**Search-select tests** — adapt `AddRelativeDialog.test.jsx` lines 449-511: type into the search box (`userEvent.type`), await a debounced `searchFamilyMembers` mock resolve, `findByText` the suggestion, click it, assert `familyMember(id)` is re-fetched and the new main card renders. Include a Ge'ez-typed-term case (lines 498-511) asserting the raw term is passed straight through to `searchFamilyMembers` (D-02).

**Card assertions** — reuse `PersonCard.test.jsx` selectors: `getByTestId('person-card-<id>')`, `getByText(fullname)`, the `Living/Deceased` chip, and (for D-03) assert the suggestion row shows birth year even though the card omits it.

---

## Shared Patterns

### GraphQL data access
**Source:** `frontend/src/api/graphqlClient.js` lines 23-36
**Apply to:** DetailPage (all three reads) + search component
`graphqlRequest(query, variables)` returns `response.data.data` (unwrapped) and throws an `Error` (message = joined GraphQL error strings, or a network-specific message). Callers use `.then((data) => data.<queryName>)` and `.catch((err) => setError(err.message))`. Attaches `Authorization: Bearer <localStorage authToken>` automatically (lines 17-21) — no auth wiring needed in the page.

### Protected-route mounting
**Source:** `frontend/src/App.jsx` lines 27-35 + `frontend/src/components/ProtectedRoute.jsx`
**Apply to:** the `/detail` route
Wrap in the no-args `<ProtectedRoute />` group (redirects unauthenticated → login); do NOT use `allowedRoles={['ADMIN']}` (D-06, not admin-only).

### Loading / error / empty state trio
**Source:** `frontend/src/pages/FamilyTreePage.jsx` lines 83-119
**Apply to:** DetailPage's six named states (D-08)
`CircularProgress` (loading) · `Alert severity="error"` + optional Retry `Button` (failed-request) · `Alert severity="info"` (missing-family-head) · inline `Typography`/`noOptionsText` (no-search-results) · graceful `Typography` message (missing-person-info) · no expand control = no-children (PersonCard gates this itself, line 80-81).

### Ge'ez name display
**Source:** `frontend/src/utils/displayName.js` lines 10-14
**Apply to:** suggestion rows (PersonCard already calls it internally, line 78)
`getGeezDisplay(member)` → `{ text, lang: 'ti' } | null`; render inside `<Typography lang={geez.lang}>` and omit the element entirely when `null`.

### Module-scope query constants
**Source:** `FamilyTreePage.jsx` lines 20-33, `AddRelativeDialog.jsx` lines 18-40, `LinkAccountsPage.jsx` lines 26-45
**Apply to:** all Phase 26 queries
Declare GraphQL query strings as SCREAMING_SNAKE_CASE `const` template literals at module top (naming convention per CLAUDE.md), passed as the first arg to `graphqlRequest`.

## No Analog Found

None. Every new/modified file maps to an existing in-repo analog. The only genuinely new shape — an Autocomplete whose options come from a debounced **async** fetch rather than a local array — is a small adaptation of the two existing local-array Autocompletes (`AddRelativeDialog.jsx`, `LinkAccountsPage.jsx`); the server-side Latin+Ge'ez matching (resolver lines 61-72) removes the need for client-side `createFilterOptions` here.

## Metadata

**Analog search scope:** `frontend/src/pages/`, `frontend/src/components/{person,manage}/`, `frontend/src/{api,utils}/`, `frontend/src/{App,components/AppLayout}.jsx`, `backend/src/{schemas,resolvers}/familyMember.*`
**Files scanned:** 12 read + 2 grep
**Pattern extraction date:** 2026-08-03
