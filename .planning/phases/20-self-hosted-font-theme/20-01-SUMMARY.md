---
phase: 20-self-hosted-font-theme
plan: 01
subsystem: ui
tags: [fontsource, mui, theme, vite, vitest, self-hosted-fonts, ethiopic]

# Dependency graph
requires:
  - phase: 18-19 (data model + GraphQL layer)
    provides: Ge'ez name fields, but no data dependency for this phase (font/theme work is independent)
provides:
  - "@fontsource/noto-sans-ethiopic self-hosted (no CDN) in the frontend workspace"
  - "Ethiopic-subset CSS side-effect imports (400 + 700 weight) wired into main.jsx"
  - "FONT_SANS/FONT_DISPLAY theme.js constants updated with Noto Sans Ethiopic in locked position"
  - "theme.test.js proving font-stack ordering automatically (FONT-01/FONT-02)"
affects: [22-read-path-render-surfaces, 23-write-path-forms]

# Tech tracking
tech-stack:
  added: ["@fontsource/noto-sans-ethiopic@^5.3.0"]
  patterns: ["Ethiopic-subset CSS side-effect import (never unqualified 400.css/700.css)", "font-stack ordering proven indirectly via theme.typography.* rather than exporting private constants"]

key-files:
  created: [frontend/src/theme.test.js]
  modified: [frontend/package.json, package-lock.json, frontend/src/main.jsx, frontend/src/theme.js]

key-decisions:
  - "D-01: Ge'ez-font-ONLY scope -- added @fontsource/noto-sans-ethiopic only; index.html and root package.json untouched"
  - "D-03: Imported both ethiopic-400.css and ethiopic-700.css now (700 needed for Phase 22 headings, lazily fetched)"
  - "D-04: Noto Sans Ethiopic ordering locked -- after existing Latin font(s), before OS-fallback, in both FONT_SANS and FONT_DISPLAY"
  - "D-05: Automated (jsdom) covers ordering only; glyph rendering/network trace/FOUT are manual-only sign-offs, recorded as pending below"
  - "D-06: Real npm install --workspace frontend used (not slopcheck install, not hand-edited lockfile)"
  - "Option A used for theme.test.js: asserted indirectly via theme.typography.fontFamily / theme.typography.h1.fontFamily -- no new export added to theme.js"

patterns-established:
  - "Self-hosted webfont via @fontsource subset CSS side-effect import, added to main.jsx bootstrap alongside other third-party imports"

requirements-completed: [FONT-01, FONT-02]

# Metrics
duration: 2min (task execution only; excludes environment setup/reads)
completed: 2026-07-30
---

# Phase 20 Plan 01: Self-Hosted Font & Theme Summary

**Self-hosted `@fontsource/noto-sans-ethiopic` (Ethiopic-subset, 400+700 weights) wired into `main.jsx`, with `FONT_SANS`/`FONT_DISPLAY` theme stacks updated and ordering proven by a new `theme.test.js` (2/2 passing, full suite 268/268 green).**

## Performance

- **Duration:** ~2 min of task execution (install + edits + TDD cycle)
- **Started:** 2026-07-30T21:47:53+02:00 (first task commit)
- **Completed:** 2026-07-30T21:49:10+02:00 (last task commit)
- **Tasks:** 3 completed (Task 3 executed as TDD RED -> GREEN, 2 commits)
- **Files modified:** 5 (frontend/package.json, package-lock.json, frontend/src/main.jsx, frontend/src/theme.js, frontend/src/theme.test.js created)

## Accomplishments
- `@fontsource/noto-sans-ethiopic@5.3.0` installed via a real `npm install --workspace frontend` (not hand-edited, not `slopcheck install`) -- lands only in `frontend/package.json` + shared `package-lock.json`; repo-root `package.json` confirmed byte-for-byte unchanged.
- `main.jsx` now imports the Ethiopic-SUBSET CSS files only (`ethiopic-400.css`, `ethiopic-700.css`) -- never the unqualified `400.css`/`700.css` which would duplicate Inter's Latin coverage. Production build (`npm run build`) succeeds and emits both weight's woff2/woff assets.
- `theme.js`'s `FONT_SANS`/`FONT_DISPLAY` constants updated in the exact locked position (`D-04`): `"Inter", "Noto Sans Ethiopic", system-ui, ...` and `"Sora", "Noto Sans Ethiopic", "Inter", system-ui, ...`.
- New `theme.test.js` (TDD RED then GREEN) proves ordering automatically via `theme.typography.fontFamily` / `theme.typography.h1.fontFamily`, with no new export added to `theme.js`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @fontsource/noto-sans-ethiopic into the frontend workspace** - `b9e765f` (feat)
2. **Task 2: Wire the Ethiopic-subset CSS imports into main.jsx** - `0231ed4` (feat)
3. **Task 3: TDD the font-stack ordering** - `72a734a` (test, RED) then `e902941` (feat, GREEN)

_TDD task produced 2 commits (test -> feat); no refactor commit needed._

## Files Created/Modified
- `frontend/package.json` - added `"@fontsource/noto-sans-ethiopic": "^5.3.0"` to dependencies, alphabetically sorted between `@emotion/styled` and `@mui/icons-material`
- `package-lock.json` (repo root, shared lockfile) - updated with the new package's resolved tree
- `frontend/src/main.jsx` - added two side-effect CSS imports (`ethiopic-400.css`, `ethiopic-700.css`) after the third-party import block, before local imports
- `frontend/src/theme.js` - `FONT_SANS`/`FONT_DISPLAY` constants updated with `"Noto Sans Ethiopic"` in the locked position (lines 32-33 only; no other lines touched)
- `frontend/src/theme.test.js` (new) - two `it` blocks asserting font-stack ordering via the default-exported `theme` object

## Decisions Made
None beyond the pre-locked decisions (D-01 through D-06) cited in the plan frontmatter and reproduced in this summary's `key-decisions`. No new architectural decisions were required during execution -- the plan's exact interfaces/patterns (from `20-PATTERNS.md`) matched the current codebase state precisely, so all three tasks executed as specified with zero deviation.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria for all three tasks passed on the first attempt with no auto-fixes needed.

## Issues Encountered

None. One environment note (not a deviation): the worktree's HEAD was found attached to an unrelated, stale branch tip (`732df4e`, containing commits from an unrelated `link-accounts`/`family` feature line) at agent start instead of the expected phase-20 base (`ff46145`). Per the mandatory `worktree_branch_check` protocol, the working tree was confirmed clean and then hard-reset to the correct base commit `ff46145eff74e9f93d0ef732d22703ef1156931e` before any task work began. No uncommitted work existed at that point, so nothing was lost.

## User Setup Required

None - no external service configuration required. This phase only adds a self-hosted static font asset; no environment variables, API keys, or dashboard configuration involved.

## Manual-Only Sign-Off Items (pending -- per D-05, jsdom cannot assert these)

These are explicitly out of scope for this plan's own automated completion (per `20-VALIDATION.md`'s sampling contract) but are recorded here so `/gsd:verify-work 20` has a clear checklist:

| Item | Status | Notes |
|------|--------|-------|
| DevTools Network trace confirming Noto Sans Ethiopic woff2 requests are same-origin (zero external request for this font specifically) | **pending** | Requires `npm run build && npm run preview --workspace frontend` + manual browser DevTools inspection. Inter/Sora's pre-existing Google Fonts CDN requests are expected and out of scope (D-02). |
| Real Tigrinya name fixture (labialized consonants, e.g. `ቨርጂኒያ ቐለታ`) renders with correct glyphs (no tofu boxes) across >= 2 browser/OS combinations | **pending** | Requires pasting the fixture into an existing `Typography` on a running dev/preview build and visually inspecting in 2+ browsers. |
| No visible FOUT-driven reflow/jump on hard-reload under throttled network | **pending (this phase's font-resolution scope only)** | `font-display: swap` is already baked into the shipped Fontsource CSS; full tree-card-specific truncation-jump check against real Ge'ez data is deferred to Phase 22 per `STATE.md`'s "Phase 20 scope note". |

## Next Phase Readiness
- Font stack is self-hosted and ordering-safe for both Latin and Ge'ez text; Phase 22 (read-path render surfaces) can now render real Ge'ez name data with a guaranteed correct-glyph fallback.
- No blockers. The three manual sign-off items above should be completed before `/gsd:verify-work 20` closes the phase, but do not block this plan's own execution completion (per plan's own scope and `20-VALIDATION.md`).

---
*Phase: 20-self-hosted-font-theme*
*Completed: 2026-07-30*

## Self-Check: PASSED

All created/modified files verified present: `frontend/package.json`, `package-lock.json`, `frontend/src/main.jsx`, `frontend/src/theme.js`, `frontend/src/theme.test.js`, `.planning/phases/20-self-hosted-font-theme/20-01-SUMMARY.md`. All 5 task/summary commits verified present in `git log`: `b9e765f`, `0231ed4`, `72a734a`, `e902941`, `c3243e3`.
