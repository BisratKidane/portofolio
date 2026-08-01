---
phase: quick
plan: 01
subsystem: ui
tags: [react, mui, forms, geez, manage]

# Dependency graph
requires:
  - phase: 23-write-path-quality-gate
    provides: shared MemberFields component with geezFirstname/geezLastname/geezMothersname fields already wired to mutations
provides:
  - AddRelativeDialog prefills child.lastname + child.geezLastname from a male anchor's own firstname/geezFirstname
  - AddRelativeDialog prefills child.mothersname + child.geezMothersname from a female anchor's own firstname+lastname / geezFirstname+geezLastname
affects: [manage-page, add-relative-dialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single prefill useEffect branches on targetGender, builds a sparse `update` object (only including keys with truthy/non-empty source data), and spreads it over `prev` so untouched keys keep the EMPTY_FORM default -- never writes 'undefined' or a stray-whitespace string."

key-files:
  created: []
  modified:
    - frontend/src/components/manage/AddRelativeDialog.jsx
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/components/manage/AddRelativeDialog.test.jsx

key-decisions:
  - "Extended the existing male-anchor prefill effect into one effect covering both genders, rather than adding a second effect, to keep the sparse-update-object pattern (and its 'omit key when source missing' guarantee) in one place."

patterns-established:
  - "Sparse-update prefill: build `update = {}`, conditionally add keys only when source data is truthy/non-empty, then `setForm(prev => ({...prev, ...update}))` -- guarantees no field is ever explicitly set to undefined or an artifact of a partial join."

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-08-01
---

# Quick Task 260801-l9e: Auto-fill child father/mother name (Latin + Ge'ez) Summary

**AddRelativeDialog now prefills a new child's father/mother-name fields in both Latin and Ge'ez from the anchor parent's own names, closing the gap where only the Latin father-name case worked.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-01T15:20:19+02:00
- **Completed:** 2026-08-01T15:24:18+02:00
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Male anchor: child's `lastname` (existing) and `geezLastname` (new) both prefill from the anchor's own firstname/geezFirstname.
- Female anchor: child's `mothersname` (new) and `geezMothersname` (new) prefill as `"First Last"` / `"GeezFirst GeezLast"` joins of the anchor's own names.
- Missing Ge'ez source data leaves the corresponding Ge'ez field blank (no `'undefined'`, no stray whitespace) while the Latin field still fills.
- All prefilled fields remain plain editable `TextField`s -- no new read-only state.
- `ManagePage.jsx`'s `EMPTY_DIALOG_STATE`, both `onAddRelative` handlers (`MemberBranch` from `scope.self`, `AdminBranch` from `focusedScope.self`), and both `<AddRelativeDialog>` usages now thread `targetLastname`/`targetGeezFirstname`/`targetGeezLastname` -- no GraphQL query or mutation changes, since `EDITABLE_MEMBER_FIELDS` already selected `lastname`, `geezFirstname`, `geezLastname`.

## Task Commits

TDD task, two commits (test -> feat):

1. **Task 1 (RED): failing tests for Ge'ez/mother-name prefill** - `d68b1ce` (test)
2. **Task 1 (GREEN): prefill implementation** - `cb2f9c1` (feat)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified
- `frontend/src/components/manage/AddRelativeDialog.jsx` - three new props (`targetLastname`, `targetGeezFirstname`, `targetGeezLastname`); single prefill `useEffect` branching on `targetGender` for `relationType === 'child'`.
- `frontend/src/pages/ManagePage.jsx` - `EMPTY_DIALOG_STATE` + both `onAddRelative` handlers + both `<AddRelativeDialog>` usages pass the three new anchor props.
- `frontend/src/components/manage/AddRelativeDialog.test.jsx` - 4 new tests: male-anchor Ge'ez lastname prefill, male-anchor blank-Ge'ez-source edge case, female-anchor mothersname+geezMothersname prefill, female-anchor blank-Ge'ez-source edge case.

## Decisions Made
None beyond the pattern noted above (single sparse-update effect covering both genders) -- plan executed exactly as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. One test-design adjustment during implementation (not a plan deviation): the plan suggested matching the mother's-name field via `/mother.*name/i`, but `MemberFields.jsx` renders both `"Mother's name"` and `"Ge'ez mother's name (ስም ኣደ)"` labels, both of which contain that substring -- using the suggested regex would have made `getByLabelText` ambiguous (2 matches). Used anchored regexes (`/^Mother/i` and `/^Ge'ez mother/i`) instead, which uniquely match each field.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- No blockers. `/manage` child-add flow now round-trips both Latin and Ge'ez father/mother-name data end to end for both `MemberBranch` (self-service) and `AdminBranch` (admin-search) entry points.
- Full frontend suite green: 309/309 (305 pre-existing + 4 new).

---
*Phase: quick*
*Completed: 2026-08-01*

## Self-Check: PASSED

- FOUND: .planning/quick/260801-l9e-auto-fill-child-father-mother-name-in-la/260801-l9e-SUMMARY.md
- FOUND: commit d68b1ce (test)
- FOUND: commit cb2f9c1 (feat)
- FOUND: frontend/src/components/manage/AddRelativeDialog.jsx
- FOUND: frontend/src/pages/ManagePage.jsx
