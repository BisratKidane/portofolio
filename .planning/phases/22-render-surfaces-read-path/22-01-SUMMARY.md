---
phase: 22-render-surfaces-read-path
plan: 01
subsystem: frontend-graphql-read-path
tags: [graphql, geez, read-path, family-tree, manage]
requires:
  - "geezFullname exposed on type FamilyMember over GraphQL (Phase 19, DATA-03)"
provides:
  - "FAMILY_TREE_QUERY selection set fetches geezFullname (feeds /family tree card)"
  - "EDITABLE_MEMBER_FIELDS fetches geezFullname (propagates to myEditableMembers + focus queries)"
  - "FAMILY_MEMBERS_QUERY fetches geezFullname (feeds admin member table)"
affects:
  - frontend/src/pages/FamilyTreePage.jsx
  - frontend/src/pages/ManagePage.jsx
tech-stack:
  added: []
  patterns:
    - "Widen an existing authorized read query by one scalar field only — no new query, resolver, or endpoint"
    - "Edit one shared interpolated field-list constant (EDITABLE_MEMBER_FIELDS) to propagate to every query that interpolates it"
key-files:
  created: []
  modified:
    - frontend/src/pages/FamilyTreePage.jsx
    - frontend/src/pages/ManagePage.jsx
decisions:
  - "geezFullname added in the same visibility class as the existing fullname field; D-14/Pitfall 6 comment and guarantee left untouched (no admin-only field newly exposed)"
  - "Raw geezFirstname/geezLastname/geezMothersname deliberately NOT added — no render surface this phase needs the raw parts (D-05)"
metrics:
  duration: ~3 min
  completed: 2026-07-30
---

# Phase 22 Plan 01: Render Surfaces Read Path — GraphQL Selection Sets Summary

Added the `geezFullname` scalar to the three GraphQL selection-set constants that feed this phase's render surfaces (`FAMILY_TREE_QUERY`, `EDITABLE_MEMBER_FIELDS`, `FAMILY_MEMBERS_QUERY`) so Plan 22-02's render/search wiring has the data to display — a pure data-prerequisite change with zero behavioral impact.

## What Was Built

- **Task 1 (commit 493bdcd):** `FAMILY_TREE_QUERY` in `FamilyTreePage.jsx` — inserted `geezFullname` immediately after `fullname` in the `familyMembers` scalar selection. The D-14/Pitfall 6 comment and nested relation selections (`mother`/`father`/`spouses`/`children`) are unchanged. Feeds the `/family` tree card (VIEW-01).
- **Task 2 (commit e362ac5):** `ManagePage.jsx` — two independent edits:
  - `EDITABLE_MEMBER_FIELDS` gained `geezFullname` after `fullname`; this single-constant edit propagates automatically to `MY_EDITABLE_MEMBERS_QUERY`, `FAMILY_MEMBER_FOCUS_QUERY`, and every nested relative selection that interpolates `${EDITABLE_MEMBER_FIELDS}` (VIEW-02).
  - `FAMILY_MEMBERS_QUERY` (the separate, non-interpolated admin-table constant) independently gained `geezFullname` after `fullname` (FIND-01).

## Verification

- `grep -c "geezFullname"` shows the field in all three targeted constants: `FamilyTreePage.jsx` → 1, `ManagePage.jsx` → 2.
- No raw `geezFirstname`/`geezLastname`/`geezMothersname` added anywhere (grep → 0 in both files).
- `D-14/Pitfall 6` comment intact (grep → 1).
- `npm test -- FamilyTreePage` → 6/6 passed; `npm test -- ManagePage` → 14/14 passed.
- Full frontend suite → 35 files / 275 tests passed (no regression). Existing tests use loose `stringContaining` assertions, so the field addition did not break them.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None. This plan widens three already-authorized read queries by one plain-name scalar (same visibility class as the existing `fullname`); no new endpoint, resolver, mutation, persistence, or dependency. T-22-01 (accepted) verified: no admin-only field added, D-14 guarantee untouched.

## Known Stubs

None. This is a data-prerequisite plan; the render/search consumption of the fetched field is Plan 22-02's scope.

## Self-Check: PASSED

- FOUND: `.planning/phases/22-render-surfaces-read-path/22-01-SUMMARY.md`
- FOUND commit 493bdcd (Task 1), e362ac5 (Task 2)
