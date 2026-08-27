---
phase: 27-descendant-navigation-performance
plan: 02
subsystem: ui
tags: [react, mui, grid, testing-library, vitest]

# Dependency graph
requires:
  - phase: 25-reusable-personcard
    provides: "PersonCard({ member, role, spouse, isSpouse, expanded, onExpand, onEdit }) — the leaf card this plan wraps unmodified"
provides:
  - "GenerationGrid({ people, role, expandedId, onExpand, onEdit, loadingId }) — presentational responsive grid + single group-level apex cue for one generation's people"
  - "ApexCue — local, unexported inverted-V connector component (colors.line), reused per GenerationGrid instance"
affects: [27-04-detail-page-descendant-nav]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MUI v6 Grid size prop (size={{ xs: 12, sm: 6, md: 4 }}) for responsive card layout, not the legacy item/breakpoint-prop API"
    - "Group-level connector as a plain aria-hidden Box (two rotated line segments), mirroring PersonCard's dashed spouse-connector technique — no SVG"

key-files:
  created:
    - frontend/src/components/person/GenerationGrid.jsx
    - frontend/src/components/person/GenerationGrid.test.jsx
  modified: []

key-decisions:
  - "colors.line (#e6e8f0) used for the apex cue, per D-06 — lighter/more restrained than colors.slate (/family tree edges) and colors.primary (spouse dashed connector)"
  - "Breakpoints size={{ xs: 12, sm: 6, md: 4 }} (1/row mobile, 2/row tablet, 3/row desktop) per RESEARCH.md Open Question 1 resolution"
  - "Per-card loading badge is a 16px CircularProgress absolutely positioned top-right, gated on loadingId === person.id, per RESEARCH.md Open Question 2 resolution"

patterns-established:
  - "Pattern 4 (GenerationGrid + ApexCue): one MUI Grid container per generation with a single group-level connector above it, reused for both gen1 (Child) and gen2 (Grandchild) rows"

requirements-completed: [NAV-01]

# Metrics
duration: 2min
completed: 2026-08-04
---

# Phase 27 Plan 02: GenerationGrid Summary

**New presentational `GenerationGrid` wraps one generation's people in a responsive MUI v6 `Grid` (`size` prop) with a single group-level inverted-V apex cue, reusing `PersonCard` unmodified.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-08-04T04:48:18Z
- **Completed:** 2026-08-04T04:50:20Z
- **Tasks:** 2 (TDD RED → GREEN)
- **Files modified:** 2 (both new)

## Accomplishments
- `GenerationGrid.jsx`: renders any generation's `people` array in a responsive `Grid` (`xs:12/sm:6/md:4`), forwarding `spouse`, `expanded` (as `person.id === expandedId`), `onExpand`, `onEdit` verbatim to each `PersonCard`
- Local `ApexCue` component: exactly one group-level, `aria-hidden`, `data-testid="generation-apex"` inverted-V per generation instance — never one per card (D-06)
- Per-card `generation-loading-{id}` badge (16px `CircularProgress`) shown only for the person matching `loadingId`
- `PersonCard.jsx` confirmed untouched (`git diff --stat` empty) — this plan is pure composition

## Task Commits

Each task was committed atomically:

1. **Task 1: Write GenerationGrid's failing behavior tests (RED)** - `00360c5` (test)
2. **Task 2: Implement GenerationGrid + ApexCue (GREEN)** - `b32c782` (feat)

**Plan metadata:** (this commit) `docs: complete 27-02 plan`

## Files Created/Modified
- `frontend/src/components/person/GenerationGrid.jsx` - Responsive children-grid wrapper + `ApexCue`, exported default `GenerationGrid`
- `frontend/src/components/person/GenerationGrid.test.jsx` - 12 RTL tests: card count (1/2/3), single apex, apex aria-hidden, expanded-as-pure-function-of-expandedId, spouse passthrough, onExpand/onEdit forwarding, loadingId passthrough (match/null/no-match)

## Decisions Made
- Used `colors.line` for the apex (per plan interface spec, D-06) rather than `colors.slate`/`colors.primary`, keeping it visually distinct from `/family`'s tree edges and the spouse dashed connector.
- No pixel/breakpoint assertions in the test suite (Pitfall 3) — trusted MUI Grid's CSS, verified only the declarative `size` prop usage via `grep -c` in the acceptance criteria.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`GenerationGrid` is a fully-tested, presentational, drop-in component ready for Plan 27-04 (`DetailPage`) to render twice — once for gen1 (`role="Child"`) and once for gen2 (`role="Grandchild"`) — with `people`/`expandedId`/`onExpand`/`onEdit`/`loadingId` supplied by the `useDescendantNav` hook built in Plan 27-01. No blockers. Full frontend suite green (380/380) after this plan.

---
*Phase: 27-descendant-navigation-performance*
*Completed: 2026-08-04*

## Self-Check: PASSED

- FOUND: frontend/src/components/person/GenerationGrid.jsx
- FOUND: frontend/src/components/person/GenerationGrid.test.jsx
- FOUND: 00360c5 (test commit)
- FOUND: b32c782 (feat commit)
