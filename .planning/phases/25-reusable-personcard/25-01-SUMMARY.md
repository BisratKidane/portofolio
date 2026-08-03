---
phase: 25-reusable-personcard
plan: 01
subsystem: ui
tags: [react, mui, vitest, react-testing-library, gender-theme, personcard]

# Dependency graph
requires:
  - phase: 24-backend-read-layer-for-detail
    provides: "FamilyMember GraphQL shape (fullname, geezFullname, gender, isAlive, photoUrl, spouses, children, canEdit) that PersonCard's member prop consumes"
provides:
  - "frontend/src/utils/genderTheme.js — shared MALE_TINT/FEMALE_TINT/genderMeta(), extracted from MemberNode.jsx as the single source of truth for gender color mapping"
  - "frontend/src/components/person/PersonCard.jsx — the reusable, role-agnostic person card satisfying CARD-01, CARD-02, CARD-03, CARD-04"
  - "PersonCard.test.jsx — 27 passing behavior-block tests covering field omission, role-agnostic rendering, gender cue (data-gender/aria-label/data-ring-style), and child-count/edit gating"
affects: [26-detail-page, 27-descendant-navigation, 28-admin-dialog-wiring, 25-02-spouse-composition]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "genderMeta(gender) always normalizes to { label, tint } — never throws, never returns undefined, even for unrecognized/undefined gender values"
    - "data-ring-style attribute as a deterministic test hook for Emotion-generated border-style, since asserting CSS border shorthand via toHaveStyle is unreliable in jsdom"
    - "childCountLabel(count) as a single named helper (not an inline ternary duplicated at multiple JSX sites)"

key-files:
  created:
    - frontend/src/utils/genderTheme.js
    - frontend/src/components/person/PersonCard.jsx
    - frontend/src/components/person/PersonCard.test.jsx
  modified:
    - frontend/src/components/family/MemberNode.jsx

key-decisions:
  - "PersonCard is a fresh vertical /detail card with its own roomier geometry, NOT a reuse of MemberNode's fixed 252x120 box or MemberCard's horizontal row (D-01/D-03)"
  - "spouse/isSpouse props accepted in PersonCard's signature this plan (matching the full contract from the start) but spouse is unused/no-op — SPOUSE-01 composition is 25-02"

patterns-established:
  - "Pattern: extract shared visual-theme mappings (gender->color) into frontend/src/utils/ once a second consumer needs them, rather than re-hardcoding hex values"
  - "Pattern: deterministic data-* attributes as jsdom-safe test hooks for CSS properties (border-style) that Emotion/MUI render as shorthand strings"

requirements-completed: [CARD-01, CARD-02, CARD-03, CARD-04]

# Metrics
duration: 3min
completed: 2026-08-03
---

# Phase 25 Plan 01: Shared Gender Theme + PersonCard Core Component Summary

**Reusable `PersonCard` component (avatar, Latin/Ge'ez name, role label, Living/Deceased chip, gated edit button, gated child-count/expand control) built on a newly-extracted shared `genderTheme.js`, with gender signaled via color+tint, a deterministic `data-ring-style` avatar-ring border-style, and `data-gender`/`aria-label` — never color alone.**

## Performance

- **Duration:** ~3 min (91a4cb9 to 1e1c558)
- **Started:** 2026-08-03T19:35:00+02:00 (approx.)
- **Completed:** 2026-08-03T19:38:13+02:00
- **Tasks:** 2 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Extracted `MALE_TINT`/`FEMALE_TINT`/`genderMeta()` from `MemberNode.jsx` into a new shared `frontend/src/utils/genderTheme.js`, with `MemberNode.jsx` now importing it — zero edits to `MemberNode.test.jsx`, all 30 tests green (behavior-preserving refactor).
- Built `PersonCard.jsx`: a fresh, role-agnostic, fluid-width vertical card rendering avatar (gender-ring wrapped `MemberAvatarImage`), Latin fullname, Ge'ez name (when present), role label (when supplied), and a Living/Deceased status chip, with an admin-gated edit `IconButton` and a child-count/expand `IconButton` gated on `children.length >= 1`.
- Shipped `PersonCard.test.jsx` with 27 tests covering every behavior block in the plan (field omission, CARD-02 role-agnosticism across Head/Child/Grandchild, CARD-03 gender cue for Male/Female/Other/undefined including the `data-ring-style` hook, CARD-04 singular/plural + gating, `isSpouse` footer suppression, `canEdit` gating).

## Task Commits

Each task was committed atomically (Task 2 followed TDD RED→GREEN):

1. **Task 1: Extract shared genderTheme.js from MemberNode.jsx** - `91a4cb9` (refactor)
2. **Task 2: Build PersonCard core component + colocated tests**
   - RED: `2349d75` (test) — failing test, PersonCard.jsx did not yet exist
   - GREEN: `1e1c558` (feat) — PersonCard.jsx implemented, all 27 tests pass

_No REFACTOR commit — the GREEN implementation required no post-hoc cleanup; PersonCard.jsx already imports from genderTheme.js (0 re-hardcoded MALE_TINT/FEMALE_TINT occurrences)._

## TDD Gate Compliance

- RED gate: `2349d75` (test commit) — confirmed failing (import error, PersonCard.jsx absent) before any implementation.
- GREEN gate: `1e1c558` (feat commit) — confirmed all 27 PersonCard.test.jsx assertions pass, plus the 30 pre-existing MemberNode.test.jsx assertions remain green.
- No REFACTOR commit was necessary.

## Files Created/Modified
- `frontend/src/utils/genderTheme.js` - Shared `MALE_TINT`/`FEMALE_TINT`/`genderMeta(gender)`, verbatim extraction from `MemberNode.jsx`
- `frontend/src/components/family/MemberNode.jsx` - Behavior-preserving import swap: now imports `genderMeta` from the shared module instead of defining it locally
- `frontend/src/components/person/PersonCard.jsx` - New reusable person card component (CARD-01..04)
- `frontend/src/components/person/PersonCard.test.jsx` - Colocated Vitest+RTL test suite (27 tests)

## Decisions Made
None beyond what CONTEXT.md/PLAN.md already locked (D-01 through D-14) - followed plan as specified. Two small implementation choices left to discretion per CONTEXT.md were made consistently with the PATTERNS.md excerpts: gender-ring thickness (3px), avatar size (96px), and card padding (MUI spacing token 2).

## Deviations from Plan

None - plan executed exactly as written. `genderTheme.js` was extracted verbatim per D-02; `PersonCard.jsx` was built following the exact prop contract, layout zones, and behavior blocks specified in the plan's `<behavior>`/`<action>` sections and 25-PATTERNS.md's excerpts.

## Issues Encountered

None. Both tasks' automated verification commands passed on the first implementation attempt; the full frontend suite (`npx vitest run`, 337/337) confirmed zero regressions across the whole workspace.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PersonCard` is ready to be composed with spouse pairing in 25-02 (`spouse`/`isSpouse` props already accepted in the signature; only the composition/dashed-connector wrapper remains).
- `genderTheme.js` is available as a shared import for any future component needing the gender→color/label mapping (no more re-hardcoding `#3b82f6`/`#ec4899`/`colors.slate`).
- No blockers. `PersonCard`'s full prop contract (`member`, `role`, `spouse`, `isSpouse`, `expanded`, `onExpand`, `onEdit`) is stable for Phases 26-28 to build against.

---
*Phase: 25-reusable-personcard*
*Completed: 2026-08-03*
