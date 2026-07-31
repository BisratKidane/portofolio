---
phase: 23-write-path-quality-gate
plan: 02
subsystem: frontend / manage forms — add-relative picker search
tags: [geez, autocomplete, filterOptions, tdd, manage]
dependency-graph:
  requires:
    - Phase 23 Plan 01 (Ge'ez name entry UI in MemberFields, geezFullname already fetched by ManagePage's EDITABLE_MEMBER_FIELDS/FAMILY_MEMBERS_QUERY)
    - Phase 22 AdminMemberTable.jsx FIND-01 (the one prior Ge'ez-aware null-guarded dual-field match pattern in the codebase)
  provides:
    - Ge'ez-searchable "Other parent (optional)" Autocomplete picker in AddRelativeDialog (FIND-02)
    - geezFullname-carrying inScopeMembers projection in both ManagePage branches
  affects:
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/components/manage/AddRelativeDialog.jsx
tech-stack:
  added: []
  patterns:
    - "MUI createFilterOptions with a custom stringify callback decouples Autocomplete match text from getOptionLabel, letting the visible label stay Latin-only while search matches Ge'ez text too"
key-files:
  created: []
  modified:
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/components/manage/AddRelativeDialog.jsx
    - frontend/src/components/manage/AddRelativeDialog.test.jsx
decisions:
  - "filterOptions defined at module scope (const filterOptions = createFilterOptions({...})) since it depends on no props/state — avoids re-creating the filter function on every render"
metrics:
  duration: ~15 min
  completed: 2026-07-31
---

# Phase 23 Plan 02: Ge'ez-Aware Add-Relative Picker Search (FIND-02) Summary

Makes the add-relative "Other parent (optional)" Autocomplete findable by typed Ge'ez text, without changing its visible Latin-only option label, by widening `ManagePage.jsx`'s `inScopeMembers` projection to carry `geezFullname` and replacing `AddRelativeDialog.jsx`'s default Autocomplete filter with a custom `filterOptions` (MUI `createFilterOptions`) that matches `fullname` OR `geezFullname` (null-guarded).

## What Was Built

**Task 1 — ManagePage.jsx (data prerequisite):** Both `inScopeMembers` projections — `MemberBranch`'s (built from `rows`, sourced from `MY_EDITABLE_MEMBERS_QUERY`) and `AdminBranch`'s (built from `members`, sourced from `FAMILY_MEMBERS_QUERY`) — were widened from `.map(({ id, fullname }) => ({ id, fullname }))` to `.map(({ id, fullname, geezFullname }) => ({ id, fullname, geezFullname }))`. Both source queries already fetched `geezFullname` at the top level (Phase 22), so no GraphQL query change was needed — only the two projection `.map()` calls.

**Task 2 — AddRelativeDialog.jsx (D-06):** Added `createFilterOptions` to the `@mui/material` named import list. Defined a module-scope `filterOptions = createFilterOptions({ stringify: (member) => \`${member.fullname} ${member.geezFullname ?? ''}\` })`, mirroring `AdminMemberTable.jsx`'s existing FIND-01 Latin-OR-Ge'ez null-guarded match logic. Added `filterOptions={filterOptions}` to the existing `<Autocomplete>` block, leaving `getOptionLabel={(member) => member.fullname}` completely untouched — the visible option label stays Latin-only per D-06/FIND-02, while the match logic (decoupled via `stringify`) now also checks `geezFullname`.

## Deviations from Plan

None — plan executed exactly as written. No architectural changes (Rule 4), no blocking issues, no auth gates.

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed RED → GREEN:
- RED `5491891 test(23-02): add failing tests for Ge'ez-aware AddRelativeDialog picker filter` — added a `geezFullname` field to the `IN_SCOPE_MEMBERS` fixture and 3 new FIND-02 behavior tests (Ge'ez substring match, null-guard, no-match regression). Confirmed genuinely RED: 1 failed (the Ge'ez substring match test, which cannot pass against the pre-existing `getOptionLabel`-only filter) / 27 passed (the other 2 new tests passed trivially against the old code since they don't require Ge'ez matching to prove their point — the null-guard test matches via Latin fullname, and the no-match test types text that matches nothing either way).
- GREEN `d83ad4a feat(23-02): Ge'ez-aware filterOptions for AddRelativeDialog picker (FIND-02, D-06)` — added the `createFilterOptions`-based `filterOptions`; all 28/28 AddRelativeDialog tests pass.

Task 1 (data prerequisite, not `tdd="true"`) had no pre-existing failing-test requirement — verified via `npm test -- ManagePage` (16/16, no regression) both before and after.

## Verification

- `cd frontend && npm test -- ManagePage` — 16/16 passed
- `cd frontend && npm test -- AddRelativeDialog` — 28/28 passed (25 pre-existing + 3 new FIND-02 tests)
- `cd frontend && npm test` (full suite) — **301/301 passed**, 35/35 test files, zero regressions
- `grep -c ".map(({ id, fullname }) => ({ id, fullname }))" frontend/src/pages/ManagePage.jsx` — 0 (old narrow projection gone)
- `grep -c ".map(({ id, fullname, geezFullname }) => ({ id, fullname, geezFullname }))" frontend/src/pages/ManagePage.jsx` — 2 (both branches widened)
- `grep -c "createFilterOptions" frontend/src/components/manage/AddRelativeDialog.jsx` — 2 (import + module-scope usage)
- `grep -c "filterOptions={filterOptions}" frontend/src/components/manage/AddRelativeDialog.jsx` — 1
- `grep -c "getOptionLabel={(member) => member.fullname}" frontend/src/components/manage/AddRelativeDialog.jsx` — 1 (unchanged, Latin-only label confirmed)

## Known Stubs

None. No hardcoded empty/placeholder data introduced; the picker's search now genuinely matches live `geezFullname` data flowing from the widened `inScopeMembers` projection.

## Threat Flags

None. This plan is a pure client-side filter change over an already-fetched, already-scoped `inScopeMembers` array (Phase 14 permission scoping unchanged) — no new endpoints, no new queries, no regex-based matching (MUI's internal string matcher + a plain-string `stringify` callback, no ReDoS surface), matching the plan's own threat model disposition (both T-23-04 and T-23-05: accept, no mitigation required).

## Self-Check: PASSED

- FOUND: frontend/src/pages/ManagePage.jsx
- FOUND: frontend/src/components/manage/AddRelativeDialog.jsx
- FOUND: frontend/src/components/manage/AddRelativeDialog.test.jsx
- FOUND commit 0d6757f
- FOUND commit 5491891
- FOUND commit d83ad4a

## Self-Check: PASSED
