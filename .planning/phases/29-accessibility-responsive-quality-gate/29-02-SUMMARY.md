---
phase: 29-accessibility-responsive-quality-gate
plan: 02
subsystem: ui
tags: [accessibility, wcag, contrast, jest-axe, wcag-contrast, mui, react]

# Dependency graph
requires:
  - phase: 25-reusable-person-card
    provides: "PersonCard.jsx (member card, gender tint via genderTheme.js)"
provides:
  - "jest-axe + wcag-contrast installed as frontend devDependencies, toHaveNoViolations() registered globally in frontend/test/setup.js"
  - "frontend/src/theme.contrast.test.js — deterministic WCAG AA contrast gate for /detail's PersonCard text-on-card pairs (pure data, no DOM)"
  - "PersonCard.jsx text-color fix (TEXT_TINT/CHIP_TEXT_ALIVE named exports) closing 3 real WCAG AA contrast failures without touching the shared MALE_TINT/FEMALE_TINT/colors.slate tokens"
  - "Dead unreachable &:focus-visible CSS removed from PersonCard's root Paper"
affects: [29-03, 29-04, a11y, /detail, /family (shared genderTheme.js token discipline)]

# Tech tracking
tech-stack:
  added: ["jest-axe@11.0.0", "wcag-contrast@3.0.0"]
  patterns:
    - "Global jest-axe matcher registration in frontend/test/setup.js (no per-file expect.extend boilerplate)"
    - "Pure-data contrast test (no component render) importing PersonCard's fix constants as named exports, so the test validates what actually renders, not a re-derived value"
    - "Local, component-scoped color constants (TEXT_TINT/CHIP_TEXT_ALIVE) used to fix a contrast defect without mutating shared design tokens consumed by other surfaces"

key-files:
  created:
    - frontend/src/theme.contrast.test.js
  modified:
    - frontend/package.json
    - frontend/test/setup.js
    - frontend/src/components/person/PersonCard.jsx

key-decisions:
  - "Fixed contrast via new local TEXT_TINT/CHIP_TEXT_ALIVE constants in PersonCard.jsx rather than darkening the shared MALE_TINT/FEMALE_TINT/colors.slate tokens, per RESEARCH.md Open Question 3 — avoids an unplanned /family-wide visual regression"
  - "Removed the dead &:focus-visible CSS on PersonCard's root Paper (RESEARCH.md Pitfall 1, option (a)) rather than making the whole card focusable — the card's real interactive elements (Edit/Add/Expand buttons) already have native focus-visible styling"

patterns-established:
  - "theme.contrast.test.js: first pure-data (no-DOM) test file in this codebase — establishes the pattern for future deterministic non-visual assertions"

requirements-completed: [A11Y-01]  # PARTIAL — see note below; this plan closes only the WCAG-contrast + jest-axe-tooling slice of A11Y-01

# Metrics
duration: 25min
completed: 2026-08-05
---

# Phase 29 Plan 02: jest-axe tooling + WCAG AA contrast fix Summary

**Installed jest-axe/wcag-contrast, added a deterministic contrast unit test, and fixed 3 real WCAG AA contrast failures on PersonCard's Ge'ez name/role-label/Living-chip text via local component-scoped color constants — no shared gender token touched.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-05T09:58:48Z (worktree base commit 5c81a83)
- **Completed:** 2026-08-05T10:07:37Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `jest-axe`/`wcag-contrast` installed as **devDependencies** in the frontend workspace; `toHaveNoViolations()` registered globally in `frontend/test/setup.js` so every frontend test file gets it with zero per-file boilerplate.
- `frontend/src/theme.contrast.test.js` — a new pure-data (no DOM) test asserting `>=4.5:1` WCAG AA contrast for 4 text/background pairs × 3 gender variants, written RED-first against the real, pre-fix `PersonCard.jsx` (3/4 tests failed as expected — Ge'ez name, role label, "Living" chip all under 4.5:1), then GREEN after the fix.
- `PersonCard.jsx`: Ge'ez name text, role label text, and the "Living" chip text now render with contrast-safe local colors (`TEXT_TINT`, `CHIP_TEXT_ALIVE`) — confirmed via `git diff` that the shared `MALE_TINT`/`FEMALE_TINT`/`colors.slate` tokens (`genderTheme.js`/`theme.js`) were not touched, so `/family`'s rendering is provably unaffected.
- Dead, unreachable `&:focus-visible` CSS removed from the card's root `Paper` (it had no `tabIndex`/interactive role and could never receive that outline via keyboard nav).

## Task Commits

1. **Task 1: Install jest-axe + wcag-contrast, register the global matcher** - `07d0365` (feat)
2. **Task 2: Write the deterministic WCAG contrast test (RED)** - `13a9e07` (test)
3. **Task 3: Fix PersonCard.jsx contrast + remove dead focus-visible CSS (GREEN)** - `f22f959` (feat)

_TDD shape: test (RED) → feat (GREEN), per plan's `tdd="true"` tasks 2/3._

## Files Created/Modified

- `frontend/package.json` - `jest-axe`/`wcag-contrast` added to `devDependencies`
- `frontend/test/setup.js` - `expect.extend(toHaveNoViolations)` registered globally
- `frontend/src/theme.contrast.test.js` - new deterministic WCAG AA contrast test (pure data, no component render)
- `frontend/src/components/person/PersonCard.jsx` - `TEXT_TINT`/`CHIP_TEXT_ALIVE` named exports + their use on the Ge'ez name/role-label Typography and the "Living" Chip; dead `&:focus-visible` CSS removed

## Decisions Made

- Fixed contrast locally in `PersonCard.jsx` (new `TEXT_TINT`/`CHIP_TEXT_ALIVE` constants) instead of darkening the shared `MALE_TINT`/`FEMALE_TINT`/`colors.slate` tokens — avoids an unplanned `/family`-wide visual change, per RESEARCH.md's own recommendation and the plan's D-06 audit-boundary discipline. Verified via `git diff frontend/src/theme.js frontend/src/utils/genderTheme.js` (empty).
- Removed the dead `&:focus-visible` CSS rather than wiring up `tabIndex`/role on the whole card (RESEARCH.md Pitfall 1, option (a) — the safer, non-scope-creeping choice; the card's buttons already have native focus-visible indication).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `frontend/test/setup.js`'s `expect.extend(toHaveNoViolations)` referenced an undefined global `expect`**
- **Found during:** Task 2 (writing `theme.contrast.test.js` — the first test run against the new setup.js code failed with `ReferenceError: expect is not defined` at setup-file load time, before any test executed)
- **Issue:** `frontend/vitest.config.js` does not set `test.globals: true`, so `expect` is not injected as a global — the setup file needs to import it explicitly from `vitest`
- **Fix:** Added `import { afterEach, expect } from 'vitest';` (extending the existing import) instead of relying on a global `expect`
- **Files modified:** `frontend/test/setup.js`
- **Verification:** `npm test --workspace frontend -- --run theme.contrast.test.js` ran (RED as expected) instead of failing at setup-file load
- **Committed in:** `13a9e07` (Task 2 commit, alongside the new test file — the bug was introduced and fixed within the same execution session before Task 1's commit was the only prior touch to that file)

**2. [Worktree hygiene — not a plan deviation] Accidental install into the shared main-repo checkout, reverted**
- **Found during:** Task 1 — an early `npm install` command was mistakenly run with `cd /Users/bisrat/Projects/portofolio &&` (the shared main checkout) instead of the isolated worktree, due to using an absolute path that pre-dated worktree-path-safety awareness in this session
- **Issue:** `jest-axe`/`wcag-contrast` were transiently added to the **shared main repo's** `frontend/package.json`/`package-lock.json` (landing in `dependencies`, not `devDependencies`)
- **Fix:** Ran `npm uninstall --workspace frontend jest-axe wcag-contrast` from the shared checkout to fully revert it (confirmed via grep: zero remaining references in the main repo's `frontend/package.json`/`package-lock.json`), then correctly re-ran the install inside the worktree using `npm install --workspace frontend --save-dev jest-axe wcag-contrast` (this time landing in `devDependencies` as required)
- **Files affected:** none in the final worktree diff — the shared checkout was fully restored to its pre-existing state before any worktree commit was made
- **Verification:** `grep -c "jest-axe\|wcag-contrast"` on the shared checkout's `frontend/package.json`/`package-lock.json` returned 0 after the revert; the worktree's own install was independently verified via `npm ls --workspace frontend jest-axe wcag-contrast`

---

**Total deviations:** 2 (1 Rule-1 bug fix, 1 worktree-isolation self-correction — no scope creep, no plan-file changes beyond what Task 1/2/3 specified)
**Impact on plan:** Both were caught and fully corrected before any worktree commit; the final worktree diff matches the plan's declared `files_modified` exactly (`frontend/package.json`, `frontend/test/setup.js`, `frontend/src/theme.contrast.test.js`, `frontend/src/components/person/PersonCard.jsx`).

## Issues Encountered

None beyond the two items documented above under Deviations.

## Requirement Status Note

This plan's `requirements: [A11Y-01]` frontmatter reflects that this plan touches part of A11Y-01 ("text/background contrast meets WCAG AA" + the jest-axe tooling foundation), but **A11Y-01 as a whole is not yet fully satisfied** — the same requirement ID is shared across all 4 plans in this phase (`29-01` closes the SC-4 MariaDB-skip gate; `29-03`/`29-04`, per the phase's own RESEARCH.md/PATTERNS.md, are expected to add the actual axe-core DOM scans + `userEvent.tab()` focus-order tests to `PersonCard.test.jsx`/`GenerationGrid.test.jsx`/`PersonSearch.test.jsx`/`DetailPage.test.jsx`, the responsive breakpoint-CSS assertion, and the mobile HUMAN-UAT closure). **REQUIREMENTS.md's A11Y-01 checkbox was deliberately left unchecked by this plan** — marking it complete here would be premature since the keyboard/label/focus (D-02) and mobile-readability (D-04) legs of A11Y-01 are not yet built. The phase-closing step (once all 4 plans merge) should verify and check it off.

## Next Phase Readiness

- `jest-axe` is installed and globally wired — `29-03`/`29-04` (or whichever plan adds the axe-core DOM scans) can `import { axe } from 'jest-axe'` immediately with no further setup.
- `theme.contrast.test.js` is a real, permanent regression guard — any future change to `PersonCard.jsx`'s text colors that reintroduces a WCAG AA failure will fail this test.
- The Ge'ez-name/role-label/Living-chip contrast fix and the dead-CSS removal are both real, shipped runtime changes (not test-only) — full frontend suite re-run confirmed 427/427 passing, zero regressions in `PersonCard.test.jsx` or elsewhere.

---
*Phase: 29-accessibility-responsive-quality-gate*
*Plan: 02*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 5 claimed files verified present on disk (`frontend/package.json`, `frontend/test/setup.js`, `frontend/src/theme.contrast.test.js`, `frontend/src/components/person/PersonCard.jsx`, this SUMMARY.md). All 3 task commits verified present in `git log` (`07d0365`, `13a9e07`, `f22f959`).
