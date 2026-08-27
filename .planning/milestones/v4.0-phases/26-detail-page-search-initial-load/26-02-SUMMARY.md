---
phase: 26-detail-page-search-initial-load
plan: 02
subsystem: frontend-detail-page
tags: [react, mui, autocomplete, graphql, geez, tdd]

requires:
  - phase: 26-01
    provides: "DetailPage.jsx route component + loadPersonById(id) uniform person-by-id fetch"
provides:
  - "frontend/src/components/person/PersonSearch.jsx (debounced async Autocomplete driving searchFamilyMembers)"
  - "PersonSearch mounted in DetailPage's persistent top region, onSelect wired to loadPersonById"
affects:
  - "frontend/src/pages/DetailPage.jsx"

tech-stack:
  added: []
  patterns:
    - "Debounced async MUI Autocomplete: local setTimeout ref debounce + min-char threshold, filterOptions identity (server already filtered), controlled inputValue only"
    - "Suggestion row richer than the persistent card (birth year + family context) purely for disambiguation, per Phase 25 D-06/Phase 26 D-03"

key-files:
  created:
    - frontend/src/components/person/PersonSearch.jsx
    - frontend/src/components/person/PersonSearch.test.jsx
  modified:
    - frontend/src/pages/DetailPage.jsx
    - frontend/src/pages/DetailPage.test.jsx

key-decisions:
  - "Debounce 250ms + 2-char min threshold (D-01, Claude's discretion) via a setTimeout ref cleared on every input change and on unmount"
  - "Autocomplete controls only inputValue (not value) — selection state is not tracked internally; onChange reports the selected id straight to the onSelect prop, and DetailPage's loadPersonById immediately replaces mainPerson (view clears regardless of what the search box shows, per D-05)"

patterns-established:
  - "Async-fetch Autocomplete: filterOptions={(x) => x} identity when the server already did the matching — do not re-filter client-side"

requirements-completed: [SEARCH-01, SEARCH-02, SEARCH-03]

duration: ~10min
completed: 2026-08-03
---

# Phase 26 Plan 02: Search Bar & Selection Summary

Added a debounced, Latin+Ge'ez-aware live-search `Autocomplete` (`PersonSearch`) driven by the existing `searchFamilyMembers(term)` query, mounted persistently above the `/detail` card, wired so selecting a suggestion reuses the Phase 26-01 `loadPersonById(id)` path to swap in a new main person.

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-03T18:58:13Z (RED commit)
- **Completed:** 2026-08-03T19:00:36Z (wiring commit)
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `PersonSearch.jsx`: a debounced (~250ms) async `Autocomplete` with a 2-char min-char threshold, firing `searchFamilyMembers(term)` with the raw typed term (Latin or Ge'ez, no client-side language detection/transliteration — D-02), and `filterOptions={(x) => x}` so the server-side Latin+Ge'ez match is never re-filtered client-side.
- Rich `renderOption` suggestion rows: avatar (`MemberAvatarImage`), full Latin name, Ge'ez name via `getGeezDisplay` (omitted when absent), and a "b. `<year>` · `<mothersname>`" disambiguating context line (D-03) — richer than `PersonCard` itself, which omits birth year (Phase 25 D-06).
- `noOptionsText="No matches"` for the no-search-results state (D-08); `onChange` reports the selected member's id via the `onSelect(id)` prop (D-05).
- `DetailPage.jsx` mounts `<PersonSearch onSelect={(id) => loadPersonById(id)} />` in a persistent top-region `Box` above the centered `PersonCard` (D-07) — since `loadPersonById` clears `mainPerson` and sets `loading` while fetching, selecting a suggestion clears the current view and re-renders with only the new person's card, descendants collapsed (`expanded={false}` from 26-01) — SEARCH-03.

## Task Commits

Each task was committed atomically (Task 1 followed the TDD RED→GREEN gate; Task 2 was plain `auto`):

1. **Task 1 RED: add failing PersonSearch test** - `40118a7` (test)
2. **Task 1 GREEN: implement PersonSearch** - `13e05f0` (feat)
3. **Task 2: wire PersonSearch into DetailPage** - `d47dfd9` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified
- `frontend/src/components/person/PersonSearch.jsx` - debounced async Autocomplete component (new)
- `frontend/src/components/person/PersonSearch.test.jsx` - 6 tests: min-char threshold, single debounced fetch, rich row content, Ge'ez raw pass-through, no-matches, select→onSelect
- `frontend/src/pages/DetailPage.jsx` - imports and mounts `PersonSearch`, wires `onSelect` to `loadPersonById`
- `frontend/src/pages/DetailPage.test.jsx` - 2 new tests: suggestion-select swaps the rendered card + re-fetches `familyMember(id)`; Ge'ez-typed search term reaches `searchFamilyMembers` unmodified

## Decisions Made
- Debounce interval (250ms) and min-char threshold (2 chars) chosen per D-01's "Claude's discretion" — avoids a request-per-keystroke storm while feeling instant for typical short names.
- `Autocomplete` controls only `inputValue`; `value` (the selected option) is left uncontrolled since the component holds no "currently selected" concept — the parent page owns the resulting main-person state entirely via `onSelect`.
- Followed CLAUDE.md's `#` GraphQL/query-constant naming convention (`SCREAMING_SNAKE_CASE` + `_QUERY` suffix) for `SEARCH_MEMBERS_QUERY`, matching `FAMILY_HEAD_QUERY`/`FAMILY_MEMBER_QUERY` from 26-01.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Task 1 (`tdd="true"`): RED gate: commit `40118a7` (`test(26-02): add failing test for debounced PersonSearch component`) — verified failing (Vite module-resolution error, `PersonSearch.jsx` did not yet exist) before any implementation. GREEN gate: commit `13e05f0` (`feat(26-02): implement PersonSearch debounced Autocomplete`) — all 6 tests passed immediately after. No REFACTOR commit was needed.

Task 2 (`type="auto"`, no `tdd` flag): implemented + tested together in one commit (`d47dfd9`) per plan instructions.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`/detail` now has a fully working search-driven main-person swap (SEARCH-01/02/03), completing this phase's scope. Descendant expand/collapse, the per-generation grid, and 3-generation forward-shift navigation remain deferred to Phase 27 per `26-CONTEXT.md`; `PersonCard`'s `onExpand`/`onEdit` stay inert no-ops here as established in 26-01. No blockers for Phase 27.

---
*Phase: 26-detail-page-search-initial-load*
*Completed: 2026-08-03*

## Self-Check: PASSED

- FOUND: frontend/src/components/person/PersonSearch.jsx
- FOUND: frontend/src/components/person/PersonSearch.test.jsx
- FOUND: frontend/src/pages/DetailPage.jsx
- FOUND: frontend/src/pages/DetailPage.test.jsx
- FOUND: commit 40118a7 (test(26-02): add failing test for debounced PersonSearch component)
- FOUND: commit 13e05f0 (feat(26-02): implement PersonSearch debounced Autocomplete)
- FOUND: commit d47dfd9 (feat(26-02): wire PersonSearch into DetailPage)
