---
phase: 29-accessibility-responsive-quality-gate
plan: 03
subsystem: ui
tags: [accessibility, wcag, jest-axe, tab-order, responsive, mui, react]

# Dependency graph
requires:
  - phase: 29-accessibility-responsive-quality-gate
    plan: 02
    provides: "jest-axe globally registered (toHaveNoViolations) in frontend/test/setup.js"
provides:
  - "Code-enforced axe-core zero-violations regression on all four /detail surfaces (PersonCard, GenerationGrid, PersonSearch, DetailPage)"
  - "userEvent.tab() focus-order proof: PersonCard's Edit -> Add -> Expand controls"
  - "userEvent.tab() reachability proof: PersonSearch's search input"
  - "GenerationGrid.jsx real, working @media (min-width:600px/900px) responsive breakpoints (fixed a latent bug where they never applied)"
affects: [29-04, a11y, /detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "axe(container | baseElement, { rules: { region: { enabled: false } } }) for isolated component/page mounts -- disables jest-axe's known 'region' false-positive that fires when a component/route is rendered without a surrounding app-shell <main> landmark"
    - "userEvent.setup() + user.tab() sequential focus-order assertions via toHaveFocus() (new to this codebase's test suite, existing tests use static userEvent.click)"

key-files:
  created: []
  modified:
    - frontend/src/components/person/PersonCard.test.jsx
    - frontend/src/components/person/GenerationGrid.test.jsx
    - frontend/src/components/person/GenerationGrid.jsx
    - frontend/src/components/person/PersonSearch.test.jsx
    - frontend/src/pages/DetailPage.test.jsx

key-decisions:
  - "Fixed GenerationGrid.jsx's Grid import (legacy deprecated Grid -> Grid2, aliased as Grid) rather than rewriting the breakpoint test to tolerate no @media rules -- the missing responsive CSS was a real production bug (SC-3's mobile per-generation grid never actually reflowed), not a test-authoring mistake, and this quality-gate phase exists precisely to catch this class of defect"
  - "Disabled axe's 'region' rule specifically on baseElement-scoped scans (PersonSearch, DetailPage) -- a documented jest-axe false positive for isolated component/route mounting, not a real accessibility gap; PersonCard/GenerationGrid's container-scoped scans did not need this since axe's landmark check only fires when scanning from a page-level root"

patterns-established:
  - "axe(el, { rules: { region: { enabled: false } } }) as the standard incantation for baseElement-scoped axe scans of isolated route/page components in this test suite -- future page-level axe tests should reuse it rather than rediscovering the false positive"

requirements-completed: [A11Y-01]  # completes the D-02 (keyboard/axe) + D-04 (automated breakpoint) legs; Plan 29-02 closed the WCAG-contrast leg

# Metrics
duration: 45min
completed: 2026-08-05
---

# Phase 29 Plan 03: axe-core zero-violations + tab-order + responsive breakpoint proof Summary

**Added code-enforced axe-core scans and userEvent.tab() focus-order/reachability tests to all four /detail surfaces, and fixed a real production bug where GenerationGrid's responsive per-generation grid never actually applied its 600px/900px breakpoints because it imported the wrong (deprecated) MUI Grid component.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-05T12:01:20Z
- **Tasks:** 3/3 completed
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- `PersonCard.test.jsx`: axe zero-violations scan (canEdit + expandable + Add-menu state, richest card configuration), `userEvent.tab()` proof of the exact Edit -> Add -> Expand focus order, and a regression guard confirming the root `Paper` carries no stray `tabindex` (Plan 29-02's dead-CSS removal didn't leave it accidentally focusable).
- `GenerationGrid.test.jsx`: axe zero-violations scan on a 3-card generation row, plus a new breakpoint-CSS-presence test that is the automated (jsdom-feasible) leg of SC-3's mobile-layout check — asserting the rendered `<style>` output actually contains `@media (min-width:600px)` and `@media (min-width:900px)` rules.
- `PersonSearch.test.jsx`: portal-aware axe scan (`axe(baseElement)`, not `container`, since the Autocomplete listbox popper is portaled to `document.body` while open) and a tab-reachability test proving the search input is a normal focusable field.
- `DetailPage.test.jsx`: page-level axe scan once the head card has loaded, scanning `baseElement` because `EditMemberDialog`/`AddRelativeDialog`/MUI `Menu` are all portaled and unconditionally mounted (Plan 28-04). No violations were found inside dialog internals, so the D-06 deferred-follow-up path was not needed.
- **Real bug fixed:** `GenerationGrid.jsx` imported the deprecated flexbox `Grid` from `@mui/material` (the one with `@deprecated Use the Grid2 component instead` in its own source), which silently ignores the `size={{ xs, sm, md }}` prop it was being passed — every generation card rendered at its flexbox item default width, and the "≤3 cards per row, responsive at 600px/900px" layout built in Phase 27 never actually took effect in any real browser. Discovered by this plan's own breakpoint-CSS-presence test (initial run found **zero** `@media` rules anywhere in the rendered output). Fixed by switching to `Grid2` (aliased `as Grid` to keep the diff minimal) — the unified MUI Grid that correctly implements the `size` API with real per-breakpoint `@media` rules.

## Task Commits

1. **Task 1: PersonCard.test.jsx — axe scan + Edit/Add/Expand tab order** - `633afb7` (test)
2. **Task 2: GenerationGrid.test.jsx (axe + breakpoint CSS) and PersonSearch.test.jsx (axe + tab)** - `1610669` (test, includes the GenerationGrid.jsx Grid2 bugfix)
3. **Task 3: DetailPage.test.jsx — page-level axe scan once the head card has loaded** - `304987c` (test)

## Files Created/Modified

- `frontend/src/components/person/PersonCard.test.jsx` - axe zero-violations test, tab-order test, no-stray-tabindex regression guard
- `frontend/src/components/person/GenerationGrid.test.jsx` - axe zero-violations test, `@media` breakpoint-presence test
- `frontend/src/components/person/GenerationGrid.jsx` - `Grid` import switched from the deprecated `@mui/material` `Grid` to `Grid2` (aliased `as Grid`) so the existing `size={{ xs: 12, sm: 6, md: 4 }}` prop actually generates responsive breakpoint CSS
- `frontend/src/components/person/PersonSearch.test.jsx` - portal-aware (`baseElement`) axe test, tab-reachability test
- `frontend/src/pages/DetailPage.test.jsx` - page-level (`baseElement`) axe test once the head card has loaded

## Decisions Made

- Fixed the `GenerationGrid.jsx` Grid-component bug rather than weakening the breakpoint test to pass against broken behavior — per this project's core value ("changes... fail loudly... before broken code ships"), and because this is exactly the class of defect Phase 29's quality gate exists to catch. The fix is a one-line import change (`Grid` -> `Grid2 as Grid`); `Grid2`'s API is otherwise identical to how `size` was already being used, so no other call-site changes were needed.
- Disabled axe's `region` rule only on the two `baseElement`-scoped scans (`PersonSearch`, `DetailPage`) — this is a well-documented jest-axe/axe-core false positive ("All page content should be contained by landmarks") that fires whenever a component/route is mounted in test isolation without a surrounding app-shell `<main>`/`<header>` landmark structure. `PersonCard`/`GenerationGrid`'s `container`-scoped scans didn't trigger this (the rule only evaluates from a page-level root), so no rule override was needed there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `GenerationGrid.jsx`'s responsive breakpoint prop was silently a no-op due to importing the deprecated `Grid`**
- **Found during:** Task 2, writing the `@media`-presence assertion — the first run of the new test found **zero** `@media` rules anywhere in the rendered `<style>` output
- **Issue:** `GenerationGrid.jsx` imported `Grid` from `@mui/material`, which resolves to the legacy flexbox `Grid` component (marked `@deprecated Use the Grid2 component instead` in its own source). That component only reads breakpoint values from top-level `xs`/`sm`/`md`/`lg`/`xl` props — it does not understand the newer `size={{ xs, sm, md }}` object prop that `GenerationGrid.jsx` was passing, so the prop was silently dropped and every card rendered at the flexbox item's default full width, with no responsive reflow at any viewport size
- **Fix:** Changed the import to `Grid2 as Grid` (`@mui/material`'s unified Grid, which implements the `size` prop with real per-breakpoint `@media` rules) — no other code changes needed since `GenerationGrid.jsx`'s JSX already used the `size` prop in the shape `Grid2` expects
- **Files modified:** `frontend/src/components/person/GenerationGrid.jsx`
- **Verification:** Re-ran the new breakpoint test — now finds real `@media (min-width:600px)` and `@media (min-width:900px)` rules; re-ran the full `GenerationGrid.test.jsx` suite (all 15 tests, including the 12 pre-existing ones, still pass) and the full frontend suite (435/435, zero regressions)
- **Committed in:** `1610669` (Task 2 commit, alongside the test file additions)

**2. [Rule 1 - Bug / test-infra] jest-axe's `region` rule false-positives on isolated `baseElement` scans**
- **Found during:** Task 2 (`PersonSearch.test.jsx`), confirmed again in Task 3 (`DetailPage.test.jsx`)
- **Issue:** `axe(baseElement)` reported "All page content should be contained by landmarks (region)" against both `PersonSearch` and `DetailPage` — a known axe-core/jest-axe limitation where scanning from `document.body` triggers a page-level landmark-structure check that doesn't apply when a single component/route is mounted in test isolation (no surrounding app-shell `<main>`), not a real accessibility defect in either component
- **Fix:** Passed `{ rules: { region: { enabled: false } } }` as the second argument to `axe()` on both `baseElement`-scoped scans, with an inline comment explaining the rationale
- **Files modified:** `frontend/src/components/person/PersonSearch.test.jsx`, `frontend/src/pages/DetailPage.test.jsx`
- **Verification:** Both axe scans pass with the rule disabled; no other axe rule was touched, so any genuine violation elsewhere in either component's DOM would still fail the test
- **Committed in:** `1610669` (PersonSearch), `304987c` (DetailPage)

---

**Total deviations:** 2 (both Rule 1 auto-fixes — one real production bug, one test-tooling false-positive)
**Impact on plan:** Both were caught and fixed within their respective tasks; the plan's declared `files_modified` (the 4 test files) matches exactly, plus one additional file (`GenerationGrid.jsx`) required to make Task 2's acceptance criteria achievable at all.

## Issues Encountered

None beyond the two items documented above under Deviations. `npm install` was required at the worktree root before any test could run (no `node_modules` existed in this fresh worktree) — this is expected worktree setup, not a deviation.

## Verification

- `npm test --workspace frontend -- --run PersonCard.test.jsx` — 44/44 passed
- `npm test --workspace frontend -- --run GenerationGrid.test.jsx PersonSearch.test.jsx` — 23/23 passed
- `npm test --workspace frontend -- --run DetailPage.test.jsx` — 28/28 passed
- `npm test --workspace frontend -- --run` (full suite) — 435/435 passed, zero regressions
- Manually re-read every new `axe(...)` call: `PersonCard`/`GenerationGrid` use `container` (no portal open in those scenarios); `PersonSearch`/`DetailPage` use `baseElement` (portal — Autocomplete popper / Menu / Dialogs)

## Requirement Status Note

This plan's `requirements: [A11Y-01]` frontmatter reflects that A11Y-01 is shared across Plans 29-02/29-03/29-04. Plan 29-02 closed the WCAG-contrast + jest-axe-tooling slice; **this plan (29-03) closes the D-02 (axe-core + keyboard tab-order) and D-04-automated (responsive breakpoint CSS presence) legs**. The mobile HUMAN-UAT closure (real-browser visual/touch-target verification at 360px/768px) remains for a later step per `29-PATTERNS.md`'s `29-HUMAN-UAT.md` template — not part of this plan's scope. A11Y-01's REQUIREMENTS.md checkbox should be finalized once the phase's human-UAT gate closes.

## Next Phase Readiness

- All four `/detail` surfaces now have a permanent, code-enforced axe-core regression guard — any future markup change that introduces an ARIA/label/role violation will fail CI, not just a one-time manual audit.
- `GenerationGrid`'s responsive breakpoints are now real and working (previously silently broken) — Phase 29's remaining human-UAT mobile visual check (360px/768px) will now actually be checking working behavior instead of a component that never reflowed.
- The `axe(el, { rules: { region: { enabled: false } } })` pattern is now established in this test suite for any future isolated route/page-level axe scan.

---
*Phase: 29-accessibility-responsive-quality-gate*
*Plan: 03*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 5 claimed files verified present on disk (`PersonCard.test.jsx`, `GenerationGrid.test.jsx`, `GenerationGrid.jsx`, `PersonSearch.test.jsx`, `DetailPage.test.jsx`), plus this SUMMARY.md. All 3 task commits verified present in `git log` (`633afb7`, `1610669`, `304987c`).
