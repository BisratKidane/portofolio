---
phase: 28-admin-actions-on-detail
plan: 02
subsystem: ui
tags: [react, mui, personcard, admin-controls, tdd]

# Dependency graph
requires:
  - phase: 25-reusable-personcard
    provides: "PersonCard presentational component with canEdit-gated Edit IconButton + spouse-pairing composition"
  - phase: 27-descendant-navigation-performance
    provides: "GenerationGrid rendering PersonCard per generation with onEdit pass-through"
provides:
  - "PersonCard onAddRelative(relationType, member) callback prop + anchored MUI Menu ('Add child' / 'Add spouse'), rendered only on non-spouse PersonCardSingle instances"
  - "GenerationGrid onAddRelative pass-through to every PersonCard it renders"
affects: [28-05-detailpage-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Anchored MUI Menu triggered by an always-visible IconButton, mirroring Dashboard.jsx's row-actions Menu"]

key-files:
  created: []
  modified:
    - frontend/src/components/person/PersonCard.jsx
    - frontend/src/components/person/PersonCard.test.jsx
    - frontend/src/components/person/GenerationGrid.jsx
    - frontend/src/components/person/GenerationGrid.test.jsx

key-decisions:
  - "Add IconButton placed at top:8, right:56 (56px clears the existing Edit button's right:8 + 44px width + 8px gap), following D-02's 'beside the existing edit button' placement"
  - "Add control gated on !isSpouse && member.canEdit === true && typeof onAddRelative === 'function' — degrades gracefully to no-render when onAddRelative is not yet wired (Plan 28-05's job)"
  - "onAddRelative threaded to PersonCard's outer signature and forwarded only to the non-spouse PersonCardSingle invocation — never to the spouse-leaf call site (D-07), verified by grep in acceptance criteria"

patterns-established:
  - "Admin-only action controls on PersonCard: gate on member.canEdit === true + typeof callback === 'function', absolute-positioned top-right family, mirrors the existing Edit button exactly"

requirements-completed: [PERM-02]

# Metrics
duration: 8min
completed: 2026-08-04
---

# Phase 28 Plan 02: Add-Menu Control on PersonCard Summary

**Admin-only Add-relative icon button + 2-item MUI Menu ("Add child"/"Add spouse") added to PersonCard's non-spouse anchor instance, threaded through GenerationGrid, TDD RED-GREEN.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-04T13:17:00Z (approx, worktree base reset)
- **Completed:** 2026-08-04T13:25:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `PersonCardSingle` renders an always-visible `Add relative to {fullname}` IconButton beside the existing Edit button, opening an anchored `Menu` with exactly two `MenuItem`s ("Add child" / "Add spouse")
- Control is gated identically to the existing Edit button (`member.canEdit === true`) plus a defensive `typeof onAddRelative === 'function'` check so it degrades gracefully before Plan 28-05 wires a real handler
- `onAddRelative` is structurally omitted from the spouse-leaf `PersonCardSingle` call site (D-07) — not a runtime conditional, so a spouse card can never render the control regardless of its own `canEdit` value
- `GenerationGrid` forwards `onAddRelative` straight through to every `PersonCard` it renders, mirroring the existing `onEdit` pass-through
- Full frontend suite (402/402) green with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for the Add-menu control (RED)** - `165d90f` (test)
2. **Task 2: Implement the Add-menu control (GREEN)** - `c7d852e` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `frontend/src/components/person/PersonCard.jsx` - added `useState`, `Menu`/`MenuItem`/`AddRoundedIcon` imports; `onAddRelative` prop on `PersonCard` and `PersonCardSingle`; Add IconButton + anchored Menu rendered gated on `!isSpouse && member.canEdit === true && typeof onAddRelative === 'function'`
- `frontend/src/components/person/PersonCard.test.jsx` - new `describe('Add-menu control', ...)` block: 8 new tests covering the gate, spouse exclusion, menu contents, click callbacks, menu-close-after-click, and no-crash-without-prop
- `frontend/src/components/person/GenerationGrid.jsx` - `onAddRelative` added to the function signature and forwarded into the `<PersonCard>` invocation
- `frontend/src/components/person/GenerationGrid.test.jsx` - new forwarding test asserting the same mock receives `('child', person)`

## Decisions Made
- None beyond what the plan specified — the plan's interface contract (exact prop names, gating expression, positioning math) was followed as written.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The worktree branch had drifted from the expected phase-28 planning base (its HEAD pointed at a stale pre-phase-28 commit with no `.planning/phases/28-admin-actions-on-detail/` directory); corrected via `git reset --hard` to the documented base commit (`351fd1a3f9ab019729d3158584790edabc9fb261`) per the worktree_branch_check protocol before any file edits were made — no work was lost since no commits existed yet on the drifted branch beyond the shared history.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`PersonCard`'s `onAddRelative(relationType, member)` contract and `GenerationGrid`'s pass-through are now stable and ready for Plan 28-05 to wire real `AddRelativeDialog` handlers at all three DetailPage render sites (head, gen1, gen2). No blockers.

---
*Phase: 28-admin-actions-on-detail*
*Completed: 2026-08-04*
