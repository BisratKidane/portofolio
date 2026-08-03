---
phase: 25-reusable-personcard
plan: 02
subsystem: ui
tags: [react, mui, vitest, react-testing-library, personcard, spouse-composition]

# Dependency graph
requires:
  - phase: 25-reusable-personcard
    plan: 01
    provides: "PersonCard core component (avatar/name/gender/status/child-count/edit) with spouse/isSpouse already accepted in the prop signature as a no-op"
provides:
  - "frontend/src/components/person/PersonCard.jsx — spouse pairing composition: anchor + dashed connector + spouse card (SPOUSE-01, D-12), rendered only for non-spouse anchors with a spouse prop"
  - "PersonCard.test.jsx — 6 new SPOUSE-01 tests (pairing render, dashed connector, no expand on spouse card, no spouse-of-spouse recursion, isSpouse defense-in-depth guard) — 33 total tests"
affects: [26-detail-page, 27-descendant-navigation, 28-admin-dialog-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "data-connector-style deterministic test hook (mirrors 25-01's data-ring-style) for the dashed spouse connector, since jsdom cannot reliably assert Emotion-generated border shorthand via toHaveStyle or the style attribute"
    - "PersonCard split into an exported composing wrapper (handles spouse pairing) + an internal PersonCardSingle (the actual card markup), so the spouse-of-spouse recursion guard is structural (isSpouse===true branch never reads spouse/member.spouses) rather than a runtime check"

key-files:
  created: []
  modified:
    - frontend/src/components/person/PersonCard.jsx
    - frontend/src/components/person/PersonCard.test.jsx

key-decisions:
  - "PersonCard.jsx refactored into PersonCard (composing wrapper) + PersonCardSingle (leaf card) rather than a single component with conditional recursion — makes the D-14 'isSpouse cards never recurse' guarantee structural: PersonCardSingle has no spouse/isSpouse-recursion path at all, only PersonCard's wrapper ever renders a second card, and only when isSpouse is falsy"
  - "Dashed connector visual assertion uses a new data-connector-style='dashed' attribute rather than toHaveStyle/style-attribute inspection, following the exact precedent 25-01 set with data-ring-style for the same jsdom/Emotion limitation"

requirements-completed: [SPOUSE-01]

# Metrics
duration: 8min
completed: 2026-08-03
---

# Phase 25 Plan 02: PersonCard Spouse Pairing Composition Summary

**PersonCard now composes a lateral spouse card via a dashed connector (matching /family's convention) whenever `spouse` is passed to a non-spouse anchor, with a structural recursion guard ensuring a spouse card is always a rendering leaf.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-08-03
- **Tasks:** 2 (Task 1 TDD RED/GREEN, Task 2 verification-only gate)
- **Files modified:** 2

## Accomplishments

- Refactored `PersonCard.jsx` into an exported composing wrapper (`PersonCard`) and an internal leaf component (`PersonCardSingle`) so the spouse-of-spouse recursion guard (D-14) is structural: `PersonCardSingle` has no spouse-lookup code path whatsoever, and the wrapper only ever composes a second card when `spouse` is truthy AND `isSpouse` is falsy.
- Spouse composition renders: anchor card → `aria-hidden` dashed connector (`data-connector-style="dashed"` test hook, `borderTop: 2px dashed ${colors.primary}`, 32px wide) → spouse card (`isSpouse` set, no `spouse`/`role`/`expanded`/`onExpand` props passed down — a spouse card is a leaf per D-13).
- Confirmed via regression test that mutually-referencing `spouses[]` arrays (`member.spouses=[{id:'2'}]`, `spouse.spouses=[{id:'1'}]`) still produce exactly 2 `person-card` DOM roots — never 3+.
- Confirmed `isSpouse: true` cards ignore their own `spouse` prop entirely (defense in depth per RESEARCH.md Pitfall 4) — passing `spouse` to an `isSpouse` card produces only 1 DOM root.
- Task 2's phase-close regression gate confirmed everything with zero additional code changes needed: full frontend suite 343/343 green, `MemberNode.test.jsx` byte-for-byte unmodified across the whole phase (`git diff --stat` empty), 2 `minWidth: 44` touch targets present (edit + expand controls), 1 `data-testid={\`person-card-` present.

## Task Commits

TDD RED→GREEN for Task 1; Task 2 was a verification-only gate requiring no code changes.

1. **Task 1: Add spouse pairing composition + dashed connector (SPOUSE-01)**
   - RED: `0e73942` (test) — 6 new spouse-pairing tests added, 4 of 6 failing as expected (spouse was a no-op prop before this plan)
   - GREEN: `be986f5` (feat) — spouse composition implemented; all 33 `PersonCard.test.jsx` tests pass; full frontend suite 343/343
2. **Task 2: Phase-close regression gate + touch-target/testid audit** — no commit (verification-only; all acceptance criteria already satisfied by Task 1's implementation, confirmed via `npx vitest run`, `git diff --stat`, and 2 `grep -c` checks — no fix required).

_No REFACTOR commit — the GREEN implementation required no post-hoc cleanup beyond what was already structured correctly in the initial pass._

## TDD Gate Compliance

- RED gate: `0e73942` (test commit) — confirmed 4/6 new spouse tests failed before implementation (the other 2 passed trivially since `spouse` was already a documented no-op).
- GREEN gate: `be986f5` (feat commit) — confirmed all 33 `PersonCard.test.jsx` assertions pass, plus the full 343-test frontend suite (including unmodified `MemberNode.test.jsx`) remains green.
- No REFACTOR commit was necessary.

## Files Created/Modified

- `frontend/src/components/person/PersonCard.jsx` — spouse pairing composition (SPOUSE-01): exported wrapper composes anchor + dashed connector + spouse leaf card; internal `PersonCardSingle` holds the unchanged single-card markup from 25-01.
- `frontend/src/components/person/PersonCard.test.jsx` — 6 new tests under a `describe('spouse pairing', ...)` block: no-spouse baseline (1 card), pairing renders both names, dashed connector present, no expand control on spouse card even with children, exactly-2-cards regression pin for mutually-referencing `spouses[]`, `isSpouse` ignores its own `spouse` prop.

## Decisions Made

None beyond what CONTEXT.md/PLAN.md already locked (D-12/D-13/D-14) — followed the plan and PATTERNS.md's exact JSX shape. One test-implementation-level choice made during execution: the dashed connector's visual assertion needed a deterministic `data-connector-style` attribute (mirroring 25-01's `data-ring-style` precedent) instead of `toHaveStyle`/raw style-attribute inspection, because MUI/Emotion's `sx` prop generates a CSS class rather than an inline `style` attribute in jsdom, making shorthand `borderTop` unassertable directly — this matches the exact limitation PATTERNS.md already flagged for `data-ring-style` and was resolved the same way.

## Deviations from Plan

**1. [Rule 1 - Bug/Test-authoring] Dashed connector test needed a deterministic data attribute instead of asserting Emotion CSS directly**
- **Found during:** Task 1 (writing the connector-presence test)
- **Issue:** The acceptance criteria describes asserting "an `aria-hidden` element with `borderTop` containing `dashed`" via style inspection; both `toHaveStyle({borderTopStyle: 'dashed'})` and raw `style` attribute string matching failed in jsdom because MUI's `sx` prop compiles to an Emotion-generated CSS class, not an inline `style` attribute — the same jsdom/Emotion limitation 25-01 already documented for `data-ring-style`.
- **Fix:** Added `data-connector-style="dashed"` to the connector `Box` (implementation) and asserted on that attribute plus `aria-hidden="true"` in the test — same deterministic-test-hook pattern as 25-01's `data-ring-style`, no new pattern introduced.
- **Files modified:** `frontend/src/components/person/PersonCard.jsx`, `frontend/src/components/person/PersonCard.test.jsx`
- **Commit:** `be986f5`

## Issues Encountered

None beyond the connector-test authoring deviation above. All acceptance criteria passed on the corrected first implementation attempt; the full frontend suite (343/343) confirmed zero regressions across the whole workspace, and `MemberNode.test.jsx` remains byte-for-byte unmodified across both 25-01 and this plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `PersonCard`'s full prop contract (`member`, `role`, `spouse`, `isSpouse`, `expanded`, `onExpand`, `onEdit`) is now fully implemented and stable for Phase 26 (`/detail` page) and Phase 27 (descendant navigation) to compose against.
- **Forward-note (D-14, not this phase's scope):** `selectDisplayedSpouse()` (picking the last `spouses[]` entry to decide *which* spouse gets passed into `PersonCard`'s `spouse` prop) is documented in `25-02-PLAN.md`'s `<interfaces>` section but has no owner yet — it is explicitly the responsibility of whichever phase (26 or 27) builds the page/nav layer that constructs the `spouse` prop. This is carried forward, not silently dropped.
- Phase 25 (reusable-personcard) is now feature-complete: CARD-01..04 (25-01) + SPOUSE-01 (25-02) all validated, full frontend suite green (343/343), `MemberNode.test.jsx` confirmed unmodified across the whole phase.
- No blockers.

---
*Phase: 25-reusable-personcard*
*Completed: 2026-08-03*

## Self-Check: PASSED

- FOUND: frontend/src/components/person/PersonCard.jsx (spouse composition present, grep confirms 2x `minWidth: 44` + 1x `data-testid={\`person-card-`)
- FOUND: frontend/src/components/person/PersonCard.test.jsx (33 tests, all passing)
- FOUND: .planning/phases/25-reusable-personcard/25-02-SUMMARY.md
- FOUND commit: 0e73942 (test - Task 1 RED)
- FOUND commit: be986f5 (feat - Task 1 GREEN)
- CONFIRMED: `git diff --stat frontend/src/components/family/MemberNode.test.jsx` is empty (unmodified across whole phase)
- CONFIRMED: full frontend suite 343/343 passing (`npx vitest run` from `frontend/`)
