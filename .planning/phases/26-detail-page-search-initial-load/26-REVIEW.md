---
phase: 26-detail-page-search-initial-load
reviewed: 2026-08-03T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - frontend/src/App.jsx
  - frontend/src/components/AppLayout.jsx
  - frontend/src/components/person/PersonSearch.jsx
  - frontend/src/components/person/PersonSearch.test.jsx
  - frontend/src/pages/DetailPage.jsx
  - frontend/src/pages/DetailPage.test.jsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-08-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the Phase 26 detail page + live-search work: the new `/detail` route wiring (`App.jsx`), the nav button (`AppLayout.jsx`), the debounced `PersonSearch` Autocomplete, the `DetailPage` head-load/search-select orchestration, and their two Vitest suites.

No security vulnerabilities and no correctness-breaking blockers were found. The GraphQL term is passed as a parameterized variable (no injection surface), and the head → person-by-id load path and its edge/empty states are handled cleanly. The findings that follow are all async request-ordering robustness issues: neither `PersonSearch` nor `DetailPage` sequences or cancels in-flight requests, so late-arriving stale responses can win. The most reachable of these (`PersonSearch` stale-options repopulation) is trivially triggerable by typing then backspacing. The others are latent and currently masked by incidental unmount behavior, but the code as written does not defend against them.

## Warnings

### WR-01: PersonSearch renders stale results from an out-of-order / obsolete in-flight request

**File:** `frontend/src/components/person/PersonSearch.jsx:48-69`
**Issue:** `handleInputChange` only cancels the pending debounce *timer*. Once the timer fires and `graphqlRequest` is dispatched (line 64), that request is never cancelled or version-checked. Its `.then((data) => setOptions(data.searchFamilyMembers))` runs unconditionally when it resolves, regardless of what the input contains at that moment. Two concrete, easily-triggered failures:

1. Type `"Byron"` → request dispatched. Backspace to `"B"` (below `MIN_CHARS`) → line 58 runs `setOptions([])` and clears the (already-fired) timer, but the in-flight request still resolves and repopulates the dropdown with `"Byron"` results while the field shows `"B"`.
2. Type `"By"` (request A dispatched), then `"Byr"` (request B dispatched). If A resolves after B, the dropdown shows A's results for the `"Byr"` query — a classic last-resolved-wins race.

**Fix:** Tag each dispatch with a monotonically increasing request id and ignore stale resolutions:
```jsx
const requestIdRef = useRef(0);
// ...
debounceRef.current = setTimeout(() => {
  const requestId = ++requestIdRef.current;
  setLoading(true);
  graphqlRequest(SEARCH_MEMBERS_QUERY, { term })
    .then((data) => {
      if (requestId === requestIdRef.current) setOptions(data.searchFamilyMembers);
    })
    .catch(() => {
      if (requestId === requestIdRef.current) setOptions([]);
    })
    .finally(() => {
      if (requestId === requestIdRef.current) setLoading(false);
    });
}, DEBOUNCE_MS);
```
Also bump `requestIdRef.current` in the `term.length < MIN_CHARS` early-return branch so an obsolete in-flight request is invalidated. (An `AbortController` threaded through `graphqlRequest` would be a stronger fix but requires a client-layer change.)

### WR-02: DetailPage load path has no request sequencing (last-resolved wins, not last-requested)

**File:** `frontend/src/pages/DetailPage.jsx:45-52`
**Issue:** `loadPersonById` sets `mainPerson` from whichever request resolves last, with no ordering guard. Today this is mitigated because setting `loading=true` swaps the whole subtree (including the search bar and the Retry button) out for the spinner, which makes it hard to launch a second request while one is in flight. But the mitigation is incidental, not defensive: a fast double-click on the Retry button, or any future change that keeps `PersonSearch` mounted during load, immediately exposes the race — an earlier, slower `familyMember` response could overwrite the newer selection's card. Given the component is explicitly built to be reused by the head load and search-select (and Phase 27 descendant nav), the missing guard is a real robustness/maintainability gap.

**Fix:** Apply the same request-id staleness check used in WR-01 inside `loadPersonById` so only the latest request's result is committed to `mainPerson`/`error`:
```jsx
const requestIdRef = useRef(0);
const loadPersonById = useCallback((id) => {
  const requestId = ++requestIdRef.current;
  setLoading(true);
  setError('');
  return graphqlRequest(FAMILY_MEMBER_QUERY, { id })
    .then((data) => { if (requestId === requestIdRef.current) setMainPerson(data.familyMember); })
    .catch((err) => { if (requestId === requestIdRef.current) setError(err.message); })
    .finally(() => { if (requestId === requestIdRef.current) setLoading(false); });
}, []);
```
Note: `loadInitial` calls `loadPersonById`, so bumping the shared id there too keeps head-load and search-select consistently ordered.

## Info

### IN-01: Selecting a suggestion schedules a redundant search request for the selected name

**File:** `frontend/src/components/person/PersonSearch.jsx:48-69,79-80`
**Issue:** When an option is chosen, MUI fires `onInputChange` with `reason === 'reset'`, setting `inputValue` to the option label (e.g. `"Byron Lovelace"`). Because `handleInputChange` ignores the `reason` and the label length is `>= MIN_CHARS`, it schedules another debounced `searchFamilyMembers` request for the just-selected name. In `DetailPage` this is currently harmless: `onSelect` triggers `loadPersonById`, which flips to the loading view and unmounts `PersonSearch`, whose cleanup effect (lines 41-46) clears the 250ms timer before it fires. But the latent extra fetch / dropdown-repopulation would surface the moment `PersonSearch` is reused in a parent that stays mounted during selection.
**Fix:** Guard on the change reason:
```jsx
const handleInputChange = (_event, value, reason) => {
  setInputValue(value);
  if (reason === 'reset') return; // selection, not a user keystroke
  // ...existing debounce logic
};
```

### IN-02: Autocomplete `loading` prop set but no progress indicator surfaced

**File:** `frontend/src/components/person/PersonSearch.jsx:74,106`
**Issue:** `loading={loading}` is passed to `<Autocomplete>`, but `renderInput` does not thread a progress adornment into the `TextField` `InputProps.endAdornment`, so MUI shows only the default "Loading…" text inside the dropdown and no spinner in the field. During the debounce+fetch window the input gives no in-field feedback that a request is running. Minor UX polish, not a correctness issue.
**Fix:** Merge a `<CircularProgress size={18} />` into `params.InputProps.endAdornment` when `loading` is true, or drop the `loading` prop if the in-dropdown text is considered sufficient.

---

_Reviewed: 2026-08-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
