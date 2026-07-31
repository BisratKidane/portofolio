---
phase: 22-render-surfaces-read-path
reviewed: 2026-07-31T06:17:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - frontend/src/components/family/MemberNode.jsx
  - frontend/src/components/manage/AdminMemberTable.jsx
  - frontend/src/components/manage/MemberCard.jsx
  - frontend/src/pages/FamilyTreePage.jsx
  - frontend/src/pages/ManagePage.jsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: resolved
resolution:
  WR-01: fixed (1917ff3) — geezFullname added to nested mother/father siblings; RED test e3261ff
  WR-02: fixed (1917ff3) — body column clips overflow (overflow:hidden + minHeight:0); RED test e3261ff
  IN-01: deferred — lang hardcoded to 'ti' lives in out-of-scope displayName.js; revisit for Amharic support
  IN-02: deferred — search/display trim inconsistency; low-impact, revisit in Phase 23 write-path work
---

# Phase 22: Code Review Report

**Reviewed:** 2026-07-31T06:17:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 22 wires the server-derived `geezFullname` VIRTUAL field into three render
surfaces (family-tree `MemberNode`, admin `AdminMemberTable`, manage `MemberCard`)
via the shared `getGeezDisplay(member)` helper, makes the admin table search
Ge'ez-aware, and adds `geezFullname` to the `FamilyTree`, `FamilyMembersTable`,
`MyEditableMembers`/`FamilyMemberFocus` (`EDITABLE_MEMBER_FIELDS`) selection sets.

The core wiring is sound and well-covered by the co-located tests: the helper
null-handling (`null`/absent/empty-string/whitespace all collapse to no-render),
the `lang` attribute, DOM ordering, and the search filter's Ge'ez + Latin +
null-guard paths are all pinned. `geezFullname` is confirmed present in the
backend schema (`backend/src/schemas/familyMember.schema.js:23`) so the query
additions resolve.

Two real defects remain: an **incomplete read-path wiring** that silently drops
the Ge'ez name for uncles/aunts on the non-admin Manage page, and a **fixed-height
layout overflow** on the family-tree card in its worst-case (focus-root) state.
Both are quality/robustness issues, not crashes or security problems — no
BLOCKER-tier findings.

## Warnings

### WR-01: Uncles/aunts on the non-admin Manage page never show their Ge'ez name

**File:** `frontend/src/pages/ManagePage.jsx:35-36`
**Issue:** The phase added `geezFullname` to `EDITABLE_MEMBER_FIELDS` (used for the
top-level `myEditableMembers` rows and the admin focus query), but the *nested*
`mother.siblings` / `father.siblings` selection set inside `MY_EDITABLE_MEMBERS_QUERY`
was left as its own inline field list that does **not** include `geezFullname`:

```graphql
mother { id siblings { id fullname gender birthdate photoUrl } }
father { id siblings { id fullname gender birthdate photoUrl } }
```

In the non-admin (`MemberBranch`) path, uncles & aunts are derived from exactly
these nested siblings via `collectUnclesAunts(self)` (`ManagePage.jsx:84-94`,
reading `self.mother.siblings` / `self.father.siblings`), then rendered through
`RelationshipGroupedPanel` → `UnclesAuntsContent` → `MemberCard`
(`RelationshipGroupedPanel.jsx:52-66,142`). `MemberCard` calls
`getGeezDisplay(member)`, but `member.geezFullname` is `undefined` for these
objects, so the Ge'ez line is silently omitted for every uncle/aunt — even when a
Ge'ez name exists. The admin path does not have this gap because
`FAMILY_MEMBER_FOCUS_QUERY` uses `siblings { ${EDITABLE_MEMBER_FIELDS} }`
(`ManagePage.jsx:67-68`), which now carries `geezFullname`. That asymmetry
confirms this is an oversight, not an intentional exclusion.

**Fix:** Add `geezFullname` to the nested sibling selections so the non-admin
uncles/aunts path matches the rest of the read wiring:

```graphql
mother { id siblings { id fullname geezFullname gender birthdate photoUrl } }
father { id siblings { id fullname geezFullname gender birthdate photoUrl } }
```

### WR-02: Family-tree card can overflow its fixed height when focus-root + Ge'ez + all detail rows coexist

**File:** `frontend/src/components/family/MemberNode.jsx:66,169,195-199`
**Issue:** `MemberNode` is a fixed-size card (`height: 120`, no overflow handling
on the `Paper` or the right-hand column `Box`). To make room for the new Ge'ez
row, the phase changed the reserved top row from a constant `height: 18` to
`height: isFocusRoot ? 18 : 0` (line 169). That reclaims space only in the
**non**-focus-root case. When `isFocusRoot` is true, the card keeps the 18px
"Head" row *and* gains the Ge'ez row, producing up to six stacked `noWrap` rows
(Head + fullname + Ge'ez + birthday + mother + address) plus inter-row gaps inside
the fixed ~108px content area — which exceeds it and spills past the card border,
since nothing clips it. The co-located test
(`MemberNode.test.jsx:248-254`, "renders both the 'Head' tag and the Ge'ez line")
asserts presence only and would not catch the overflow. The whole-tree data query
selects `birthdate`, `mothersname`, and `address`, so a real focus-root member
with all fields populated hits this.

**Fix:** Either allow the card to grow (`minHeight` instead of `height`), or
constrain/clip the detail rows so the worst case fits — e.g. cap the address/detail
rows or add `overflow: 'hidden'` to the right-hand `Box` and drop a lower-priority
row when `isFocusRoot`. Verify the focus-root + full-detail + Ge'ez combination
renders within 120px.

## Info

### IN-01: `lang` hardcoded to `ti` (Tigrinya) for all Ge'ez-script names

**File:** `frontend/src/components/family/MemberNode.jsx:196`, `frontend/src/components/manage/AdminMemberTable.jsx:122`, `frontend/src/components/manage/MemberCard.jsx:118`
**Issue:** All three surfaces render `lang={geez.lang}`, which the helper fixes to
`GEEZ_LANG = 'ti'` (`frontend/src/utils/displayName.js:1`). Ge'ez script is shared
by Tigrinya (`ti`), Amharic (`am`), and others; tagging every native-script name
as `ti` can mislead screen-reader pronunciation and language-specific font
selection for non-Tigrinya names. The root constant lives in the (out-of-scope)
`displayName.js` helper, but it surfaces through these three files.
**Fix:** If names may be Amharic or mixed, drive `lang` from a per-member language
hint rather than a single hardcoded constant, or drop to the script-level tag if
per-language accuracy isn't feasible.

### IN-02: Search matches untrimmed `geezFullname` while display trims it

**File:** `frontend/src/components/manage/AdminMemberTable.jsx:61`
**Issue:** The display path routes through `getGeezDisplay`, which trims
`geezFullname` and treats whitespace-only values as absent. The search filter
instead tests the raw field: `member.geezFullname?.toLowerCase().includes(term)`.
A padded or whitespace-only `geezFullname` is therefore matchable by leading/
trailing-space queries yet renders no visible Ge'ez line — a minor display/search
inconsistency. (No crash: the `?.` guard plus `Array.filter`'s boolean coercion
handle `null`/`undefined` correctly.)
**Fix:** Search against the same normalized value the UI shows, e.g.
`getGeezDisplay(member)?.text.toLowerCase().includes(term)`, so search and display
agree on what a member's Ge'ez name is.

---

_Reviewed: 2026-07-31T06:17:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
