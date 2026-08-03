---
phase: 22-render-surfaces-read-path
plan: 02
subsystem: frontend-render-surfaces
tags: [geez, render-path, family-tree, manage, search, tdd]
requires:
  - "geezFullname fetched by FAMILY_TREE_QUERY / EDITABLE_MEMBER_FIELDS / FAMILY_MEMBERS_QUERY (Phase 22-01)"
  - "getGeezDisplay(member) helper (Phase 21, locked)"
provides:
  - "/family tree card (MemberNode) renders the Ge'ez name below the Latin fullname when present"
  - "/manage admin member table renders the Ge'ez name in the name cell AND matches it in search"
  - "/manage relationship-panel card (MemberCard) renders the Ge'ez name below the Latin fullname"
affects:
  - frontend/src/components/family/MemberNode.jsx
  - frontend/src/components/manage/AdminMemberTable.jsx
  - frontend/src/components/manage/MemberCard.jsx
tech-stack:
  added: []
  patterns:
    - "Consume the locked getGeezDisplay(member) helper via the {geez && <Typography lang={geez.lang}>} pattern — no per-surface re-derivation of the Latin/Ge'ez precedence rule"
    - "Extend an existing client-side .includes() filter with a null-guarded OR clause rather than adding a new query or column"
key-files:
  created: []
  modified:
    - frontend/src/components/family/MemberNode.jsx
    - frontend/src/components/family/MemberNode.test.jsx
    - frontend/src/components/manage/AdminMemberTable.jsx
    - frontend/src/components/manage/AdminMemberTable.test.jsx
    - frontend/src/components/manage/MemberCard.jsx
    - frontend/src/components/manage/MemberCard.test.jsx
decisions:
  - "MemberNode reuses its existing ROW_SX token verbatim for the Ge'ez line; the two /manage surfaces use an inline sx object with the identical three values (fontSize:12/fontWeight:400/color:colors.slate) for cross-surface consistency (D-02)"
  - "MemberNode's reserved top row height became conditional (isFocusRoot ? 18 : 0) so the new Ge'ez line absorbs into the existing vertical budget — the fixed 252x120 card size is unchanged (D-01)"
  - "Admin-table search matches fullname OR geezFullname only (null-guarded via ?.), never geezFirstname/geezLastname/geezMothersname (D-04)"
metrics:
  duration: ~12 min
  completed: 2026-07-30
---

# Phase 22 Plan 02: Render Surfaces Read Path — Ge'ez Line Wiring Summary

Wired the locked Phase 21 `getGeezDisplay(member)` helper into the three render surfaces this phase targets — the `/family` tree card, the `/manage` admin member table, and the `/manage` relationship-panel card — so each stacks the member's Ge'ez name below the Latin name when present and renders nothing extra when absent, and extended the admin table's search to match a typed Ge'ez substring. All three tasks followed TDD (RED test commit → GREEN implementation commit).

## What Was Built

- **Task 1 — MemberNode.jsx (RED cc0b128, GREEN bb3e8d0):** Imported `getGeezDisplay`, derived `const geez` alongside the existing `birthday`/`motherName` values, and inserted `{geez && <Typography sx={ROW_SX} lang={geez.lang} noWrap>{geez.text}</Typography>}` immediately after the Latin fullname. The reserved top-row `Box` height became `isFocusRoot ? 18 : 0`, reclaiming vertical budget for the Ge'ez line without touching the outer `Paper`'s fixed `height: 120`. Reused the file's existing `ROW_SX` token verbatim (VIEW-01, L-01, L-04, D-01, D-02).
- **Task 2 — AdminMemberTable.jsx (RED ae3dcd7, GREEN 60c4d9a):** Imported `getGeezDisplay`, hoisted `const term = search.trim().toLowerCase()` once, and extended the filter to `member.fullname...includes(term) || member.geezFullname?.toLowerCase().includes(term)` (the `?.` guards null/undefined). Converted the row-map body to a block that hoists `const geez` per row and rendered the Ge'ez line as a second `Typography` inside the same name `TableCell` — no new column (VIEW-02, FIND-01, D-03, D-04).
- **Task 3 — MemberCard.jsx (RED 97cab33, GREEN 7a32230):** Imported `getGeezDisplay`, derived `const geez` alongside `const locked`, and inserted the Ge'ez `Typography` (inline sx matching MemberNode's ROW_SX) as a sibling of the name `Stack`, inside the same outer `Box`, before the `{locked && ...}` caption (VIEW-02, D-02, D-03).

## Verification

- `npm test -- MemberNode` → 27/27 passed (22 pre-existing + 5 new render/absent/coexist cases).
- `npm test -- AdminMemberTable` → 19/19 passed (14 pre-existing + 5 new render/absent/Ge'ez-search/Latin-regression/null-guard cases).
- `npm test -- MemberCard` → 20/20 passed (16 pre-existing + 4 new render/absent/Derived-coexist/locked-coexist cases).
- Full frontend suite → 35 files / 289 tests passed (was 275; +14 new tests, zero regressions).
- `grep -c "getGeezDisplay"` → 2 in each of the three source files (import + usage).
- Acceptance greps confirmed: `height: isFocusRoot ? 18 : 0` present, `height: 120` still present (card unchanged), `member.geezFullname?.toLowerCase().includes(term)` present, and no `geezFirstname`/`geezLastname`/`geezMothersname` reference in the admin table (grep → 0).

## Deviations from Plan

None — plan executed exactly as written. (Setup note: this fresh worktree had no `node_modules`; ran `npm ci` to restore the declared, lockfile-pinned workspace dependencies before running the test suite. No packages added or changed.)

## Threat Flags

None. This plan is a pure render-path retrofit of already-fetched, already-authorized props. All three surfaces render `geez.text` as plain React `Typography` children (React auto-escapes; no `dangerouslySetInnerHTML`), matching the pre-existing `member.fullname` treatment. `lang` uses the helper's hardcoded `'ti'` constant, not user input. The admin search uses `String.prototype.includes()` (no `RegExp`, no ReDoS surface). T-22-02 and T-22-03 (both accepted in the threat register) hold as written.

## Known Stubs

None. The Ge'ez data is fetched (22-01) and now consumed on all three surfaces; nothing is placeholdered.

## Self-Check: PASSED

- FOUND: frontend/src/components/family/MemberNode.jsx (getGeezDisplay wired)
- FOUND: frontend/src/components/manage/AdminMemberTable.jsx (getGeezDisplay + geezFullname search)
- FOUND: frontend/src/components/manage/MemberCard.jsx (getGeezDisplay wired)
- FOUND commits: cc0b128, bb3e8d0 (Task 1); ae3dcd7, 60c4d9a (Task 2); 97cab33, 7a32230 (Task 3)
