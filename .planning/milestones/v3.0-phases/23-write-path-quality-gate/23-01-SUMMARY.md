---
phase: 23-write-path-quality-gate
plan: 01
subsystem: frontend / manage forms
tags: [geez, forms, member-fields, edit-dialog, add-relative-dialog, tdd]
dependency-graph:
  requires:
    - Phase 18 FamilyMember model (geezFirstname/geezLastname/geezMothersname/geezFullname)
    - Phase 19 GraphQL layer (NewFamilyMemberInput/EditFamilyMemberInput accept the 3 fields; OPTIONAL_FAMILY_MEMBER_FIELDS clear-to-null passthrough)
  provides:
    - Ge'ez name entry UI in the shared MemberFields form
    - Edit-path hydration of real Ge'ez values (not just geezFullname)
    - Add-path entry reaching every create mutation (parent/spouse/child/sibling) and the admin create-and-link flow
  affects:
    - frontend/src/components/manage/MemberFields.jsx
    - frontend/src/components/manage/EditMemberDialog.jsx
    - frontend/src/components/manage/AddRelativeDialog.jsx
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/pages/LinkAccountsPage.jsx (test-only fix, no production code change)
tech-stack:
  added: []
  patterns:
    - "Bilingual TextField labels containing the Latin label as a substring (e.g. \"Ge'ez first name (ስም)\") require anchored getByLabelText queries (/^First name/i) instead of { exact: false } string matches, since RTL's exact:false does case-insensitive substring matching"
key-files:
  created: []
  modified:
    - frontend/src/components/manage/MemberFields.jsx
    - frontend/src/components/manage/MemberFields.test.jsx
    - frontend/src/components/manage/EditMemberDialog.jsx
    - frontend/src/components/manage/EditMemberDialog.test.jsx
    - frontend/src/components/manage/AddRelativeDialog.jsx
    - frontend/src/components/manage/AddRelativeDialog.test.jsx
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/pages/ManagePage.test.jsx
    - frontend/src/pages/LinkAccountsPage.test.jsx
decisions:
  - "Anchored regex queries (/^First name/i, /^Last name/i, /^Mother's name/i) replace { exact: false } string matches wherever a Ge'ez label's bilingual text would otherwise substring-collide with its Latin twin's label"
metrics:
  duration: ~35 min
  completed: 2026-07-31
---

# Phase 23 Plan 01: Ge'ez Write-Path Forms Summary

Wires the three Ge'ez name inputs (geezFirstname, geezLastname, geezMothersname) into the shared `MemberFields.jsx` form in the exact locked layout, and threads them through both the Add relative dialog and the Edit member dialog so values can be entered, saved, and reloaded correctly — closing the write-path half of v3.0 (read path shipped in Phase 22).

## What Was Built

**Task 1 — MemberFields.jsx (D-01/D-02/D-03/D-04):** Two new `Stack` rows added to the shared form component. The first sits directly below the First/Last name row and contains "Ge'ez first name (ስም)" and "Ge'ez last name (ስም ኣቦ)" TextFields. The second sits directly below the Gender/Mother's-name row: an empty `Box` in the left slot (Gender has no Ge'ez twin, per D-02) and "Ge'ez mother's name (ስም ኣደ)" in the right slot under Mother's name. None of the three carries a `required` flag. All three reuse the existing `handleTextChange` verbatim.

**Task 2 — EditMemberDialog.jsx + ManagePage.jsx (SC1, D-05):** `EMPTY_FORM` and `formFromMember` now carry the three Ge'ez keys using the same `member.<field> ?? ''` null-coalescing idiom as the existing `mothersname` field. `ManagePage.jsx`'s single `EDITABLE_MEMBER_FIELDS` fan-out constant was widened to fetch the raw Ge'ez parts (not just the derived `geezFullname`), which propagates automatically into both `MY_EDITABLE_MEMBERS_QUERY` and `FAMILY_MEMBER_FOCUS_QUERY` — so the edit dialog opens fully hydrated for both self and any relative.

**Task 3 — AddRelativeDialog.jsx (SC1, D-05):** `EMPTY_FORM` gained the three blank Ge'ez keys, which flow unchanged through the existing `newMember: form` wholesale-spread into every relation type's create mutation (addParent/addSpouse/addChild/addSibling) — zero other code change needed in this file.

**Rule 1 fix — LinkAccountsPage.test.jsx:** `LinkAccountsPage.jsx` (admin "create and link" flow, not in this plan's `files_modified`) also renders the shared `MemberFields` component, so it inherited the same test regression described below. Its test file's `getByLabelText('First name'/'Last name', { exact: false })` queries were anchored the same way. No production code in `LinkAccountsPage.jsx` needed changes — the component itself is unaffected; only its test's query specificity was insufficient once the new Ge'ez labels existed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getByLabelText(..., { exact: false })` label collisions across every MemberFields consumer's test suite**
- **Found during:** Task 1, immediately on first test run after adding the Ge'ez fields
- **Issue:** React Testing Library's `exact: false` option performs case-insensitive *substring* matching, not prefix matching. Because the plan's D-04 labels intentionally embed their Latin twin as a substring (e.g. "Ge'ez first name (ስም)" contains "first name"), every pre-existing `screen.getByLabelText('First name', { exact: false })` / `'Last name'` / `"Mother's name"` query in the codebase became ambiguous — RTL now finds 2 elements and throws instead of returning one.
- **Fix:** Replaced the ambiguous string+exact:false queries with anchored regexes (`/^First name/i`, `/^Last name/i`, `/^Mother's name/i`) in every test file that queries these three labels: `MemberFields.test.jsx`, `EditMemberDialog.test.jsx`, `AddRelativeDialog.test.jsx`, `ManagePage.test.jsx` (all four in this plan's `files_modified`), plus `LinkAccountsPage.test.jsx` (a MemberFields consumer outside this plan's file list, discovered via full-suite regression). Verified the LinkAccountsPage regression was genuinely caused by this plan (not pre-existing) via a scratch `git worktree add` at the plan's base commit (ef8126c), confirming 9/9 passing there vs. 4/9 failing after Task 1's change.
- **Files modified:** `frontend/src/components/manage/MemberFields.test.jsx`, `frontend/src/components/manage/EditMemberDialog.test.jsx`, `frontend/src/components/manage/AddRelativeDialog.test.jsx`, `frontend/src/pages/ManagePage.test.jsx`, `frontend/src/pages/LinkAccountsPage.test.jsx`
- **Commits:** 775f252 (MemberFields), e1d2f1a (EditMemberDialog/ManagePage — test fix bundled with task 2's GREEN commit), 7dab5d8 (AddRelativeDialog — test fix bundled with task 3's RED commit, 0a81113), 726d590 (LinkAccountsPage, standalone fix)

No architectural deviations (Rule 4). No blocking issues required a package install or checkpoint.

## TDD Gate Compliance

All three tasks (`tdd="true"`) followed RED → GREEN:
- Task 1: RED `9c1a044 test(23-01): add failing tests for Ge'ez name fields in MemberFields` → GREEN `775f252 feat(23-01): add Ge'ez name inputs to MemberFields`
- Task 2: RED `638c044 test(23-01): add failing tests for edit-path Ge'ez hydration` → GREEN `e1d2f1a feat(23-01): edit-path hydration for Ge'ez names`
- Task 3: RED `0a81113 test(23-01): add failing tests for add-path Ge'ez entry and round-trip` (verified against the pre-Task-3 implementation via a temporary `git checkout --` / `git apply` round-trip to confirm the 4 exact-object assertions genuinely failed before the fix) → GREEN `7dab5d8 feat(23-01): add-path Ge'ez entry via AddRelativeDialog EMPTY_FORM`

## Verification

- `cd frontend && npm test -- MemberFields` — 10/10 passed
- `cd frontend && npm test -- EditMemberDialog` — 9/9 passed
- `cd frontend && npm test -- ManagePage` — 16/16 passed
- `cd frontend && npm test -- AddRelativeDialog` — 25/25 passed
- `cd frontend && npm test -- LinkAccountsPage` — 9/9 passed (post-fix)
- `cd frontend && npm test` (full suite) — **298/298 passed**, 35/35 test files, zero regressions
- `grep -c "geezFirstname" MemberFields.jsx EditMemberDialog.jsx AddRelativeDialog.jsx ManagePage.jsx` — 2, 2, 1, 1 respectively, confirming all four files are wired

## Known Stubs

None. No hardcoded empty/placeholder data introduced; all three Ge'ez fields are live, wired inputs on both create and edit paths.

## Threat Flags

None. This plan is a pure frontend extension of the already-shipped, already-scoped Phase 19 write path (new form fields into existing mutations/inputs) — no new endpoints, no new resolvers, no new auth logic, matching the plan's own threat model disposition (all 3 threats: accept, no mitigation required).

## Self-Check: PASSED

- FOUND: frontend/src/components/manage/MemberFields.jsx
- FOUND: frontend/src/components/manage/MemberFields.test.jsx
- FOUND: frontend/src/components/manage/EditMemberDialog.jsx
- FOUND: frontend/src/components/manage/EditMemberDialog.test.jsx
- FOUND: frontend/src/components/manage/AddRelativeDialog.jsx
- FOUND: frontend/src/components/manage/AddRelativeDialog.test.jsx
- FOUND: frontend/src/pages/ManagePage.jsx
- FOUND: frontend/src/pages/ManagePage.test.jsx
- FOUND: frontend/src/pages/LinkAccountsPage.test.jsx
- FOUND commit 9c1a044
- FOUND commit 775f252
- FOUND commit 638c044
- FOUND commit e1d2f1a
- FOUND commit 0a81113
- FOUND commit 7dab5d8
- FOUND commit 726d590
