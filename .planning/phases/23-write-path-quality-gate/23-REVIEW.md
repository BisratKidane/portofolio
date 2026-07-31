---
phase: 23-write-path-quality-gate
reviewed: 2026-07-31T12:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - frontend/src/components/manage/AddRelativeDialog.jsx
  - frontend/src/components/manage/AddRelativeDialog.test.jsx
  - frontend/src/components/manage/EditMemberDialog.jsx
  - frontend/src/components/manage/EditMemberDialog.test.jsx
  - frontend/src/components/manage/MemberFields.jsx
  - frontend/src/components/manage/MemberFields.test.jsx
  - frontend/src/pages/LinkAccountsPage.test.jsx
  - frontend/src/pages/ManagePage.jsx
  - frontend/src/pages/ManagePage.test.jsx
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-07-31T12:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 23 adds three Ge'ez name inputs (`geezFirstname`, `geezLastname`, `geezMothersname`)
to the shared `MemberFields` form and wires them through `AddRelativeDialog`,
`EditMemberDialog`, and a Ge'ez-aware Autocomplete `filterOptions`. The core wiring
is correct and well tested: the create/edit dialogs carry the three keys in their
`EMPTY_FORM`, submit them on the mutation, hydrate them on edit, and the
`createFilterOptions` stringify is null-guarded for members without a `geezFullname`.

However, two consumers of the shared form were not brought fully in line with the new
field set, and one of them causes silent data loss:

1. **BLOCKER** — In the non-admin `MemberBranch`, uncle/aunt cards are editable, but
   `MY_EDITABLE_MEMBERS_QUERY` fetches those nested relatives with a card-only field
   projection. Opening Edit on an uncle/aunt loads a mostly-blank form, and saving
   overwrites their real `email`/`phone`/`address`/`mothersname`/Ge'ez names and flips
   `isAlive` to `true`. The admin path already fetches the full field set; the non-admin
   path was not updated to match, contradicting the invariant its own comment claims.
2. **WARNING** — `LinkAccountsPage`'s `EMPTY_LINK_FORM` was never extended with the three
   Ge'ez keys, so the shared `MemberFields` renders three uncontrolled inputs there
   (React "uncontrolled → controlled" warning) and the create-and-link flow silently
   lacks first-class Ge'ez support.

Neither defective path has test coverage — the green suite passes over both.

## Critical Issues

### CR-01: Editing an uncle/aunt in the non-admin branch silently wipes their stored fields (data loss)

**File:** `frontend/src/pages/ManagePage.jsx:35-36` (query), consumed via `:84-94`, `:108`, `:216`, `:234-239`

**Issue:**
`MY_EDITABLE_MEMBERS_QUERY` fetches parents' siblings (the source of uncles/aunts) with a
card-only projection:

```graphql
mother { id siblings { id fullname geezFullname gender birthdate photoUrl } }
father { id siblings { id fullname geezFullname gender birthdate photoUrl } }
```

`collectUnclesAunts` (`:84`) builds the uncle/aunt list straight from those objects, and
`RelationshipGroupedPanel` → `MemberCard` renders an **Edit** button for each of them.
The card is not locked (`MemberCard.jsx:26` — `member.linkedUser` isn't even selected here,
so `locked` is falsy), so `onEdit(uncle)` → `setEditTarget(uncle)` (`ManagePage.jsx:216`)
opens `EditMemberDialog` with an object missing `firstname`, `lastname`, `mothersname`,
`email`, `phone`, `address`, `isAlive`, `geezFirstname`, `geezLastname`, `geezMothersname`.

`formFromMember` (`EditMemberDialog.jsx:27-43`) coerces every missing key to `''`
(and `isAlive` to `true`). The form now shows blank names for an existing person; the
required-name guard (`disableSubmit`) forces the editor to retype first/last name, and on
Save `EditMemberDialog` submits the **entire** `form` (`EditMemberDialog.jsx:68`), so the
backend receives `email: ''`, `phone: ''`, `address: ''`, `mothersname: ''`, all three
Ge'ez names as `''`, and `isAlive: true`. The Phase 23 D-05 test
(`EditMemberDialog.test.jsx:123-139`) proves an empty string is persisted as "clear",
so this overwrites the uncle/aunt's real data — including resurrecting a deceased relative.

This directly violates the invariant the neighbouring comment asserts
(`ManagePage.jsx:59-62`: "Every relative is fetched with the full editable field set ...
Parents' siblings (uncles & aunts) get the same treatment"). That treatment was applied
only to the **admin** `FAMILY_MEMBER_FOCUS_QUERY` (`:67-68`, full `EDITABLE_MEMBER_FIELDS`),
not to this non-admin query. No test exercises the uncle/aunt edit path.

**Fix:** Fetch the full editable field set for the nested siblings in the non-admin query,
mirroring the admin focus query:

```graphql
const MY_EDITABLE_MEMBERS_QUERY = `
  query MyEditableMembers {
    myEditableMembers {
      ${EDITABLE_MEMBER_FIELDS}
      mother { id siblings { ${EDITABLE_MEMBER_FIELDS} } }
      father { id siblings { ${EDITABLE_MEMBER_FIELDS} } }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id }
    }
  }
`;
```

(`EDITABLE_MEMBER_FIELDS` already includes `linkedUser`? It does not — it stops at
`photoUrl`. If uncle/aunt lock state should be honoured in the non-admin view, also add
`linkedUser { id }` to the nested selection so `MemberCard`'s `locked` check behaves.)
Add a regression test that opens Edit on an uncle/aunt and asserts the form is pre-filled
with their stored `email`/`phone`/`isAlive`, not blank.

## Warnings

### WR-01: LinkAccountsPage create-and-link renders the shared form's Ge'ez inputs as uncontrolled

**File:** `frontend/src/pages/LinkAccountsPage.jsx:47-57` (form seed) → `:232-239` (shared `MemberFields`)

**Issue:**
`MemberFields` now unconditionally renders three Ge'ez `TextField`s bound to
`form.geezFirstname` / `form.geezLastname` / `form.geezMothersname`
(`MemberFields.jsx:110-123, 148-153`). `LinkAccountsPage`'s `EMPTY_LINK_FORM` still omits
those keys, so each of those inputs receives `value={undefined}` and mounts as an
**uncontrolled** input. Typing into one calls `handleFieldChange` and adds the key, flipping
it to controlled — triggering React's "A component is changing an uncontrolled input to be
controlled" warning. It also means the create-and-link flow has no clean, intentional Ge'ez
support (the `LinkAccountsPage.test.jsx:243-254` assertion expects `newMember` *without* any
Ge'ez keys, which is only true because the test never types into those fields — it silently
encodes the gap). This is a real regression introduced by making `MemberFields` render Ge'ez
inputs while leaving one of its three consumers behind.

**Fix:** Extend `EMPTY_LINK_FORM` to include the three keys so the inputs are controlled and
the flow persists Ge'ez names consistently:

```js
const EMPTY_LINK_FORM = {
  firstname: '',
  lastname: '',
  geezFirstname: '', geezLastname: '', geezMothersname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  isAlive: true,
  phone: '',
  address: ''
};
```

Then update the `LinkAccountsPage.test.jsx` create-and-link expectation to include the three
empty Ge'ez keys. (If Ge'ez is intentionally out of scope for account-linking, instead pass a
prop to `MemberFields` to hide the Ge'ez block — but do not leave the inputs uncontrolled.)

### WR-02: Divergent `EMPTY_FORM` copies invite exactly this class of drift

**File:** `frontend/src/components/manage/AddRelativeDialog.jsx:42-53`, `frontend/src/components/manage/EditMemberDialog.jsx:14-25`, `frontend/src/pages/LinkAccountsPage.jsx:47-57`

**Issue:**
The "empty member form" shape is hand-copied into three files. `AddRelativeDialog` and
`EditMemberDialog` were updated with the three Ge'ez keys; `LinkAccountsPage` was not (see
WR-01). `MemberFields` is the single component that defines which fields exist, yet no single
source of truth defines the form seed those fields expect, so every new field must be added in
lockstep across N call sites — the exact failure that produced WR-01 and contributed to CR-01.

**Fix:** Export a canonical `EMPTY_MEMBER_FORM` (and ideally a `formFromMember` helper) next to
`MemberFields.jsx` and import it in all three consumers, so the field set is defined once
alongside the component that renders it.

## Info

### IN-01: `EDIT_MEMBER_MUTATION` return selection omits the Ge'ez fields it just wrote

**File:** `frontend/src/components/manage/EditMemberDialog.jsx:6-12`

**Issue:** The mutation selects back `id firstname lastname fullname gender mothersname email
birthdate isAlive phone address` but not `geezFirstname`/`geezLastname`/`geezMothersname`/
`geezFullname`, even though those are now editable and submitted. It happens to be harmless
because callers ignore the response and `ManagePage` refetches, but the response is a stale
view of the record it mutated — a foot-gun if a future caller consumes it optimistically.

**Fix:** Add the four Ge'ez fields to the mutation's return selection so the returned object
reflects what was written.

### IN-02: Ge'ez-aware `filterOptions` guards `geezFullname` but not `fullname`

**File:** `frontend/src/components/manage/AddRelativeDialog.jsx:58-60`

**Issue:** `stringify: (member) => \`${member.fullname} ${member.geezFullname ?? ''}\`` null-guards
`geezFullname` (correct, and tested) but assumes `fullname` is always present; a member row
lacking `fullname` would stringify to the literal `"undefined ..."` and match on the substring
"undefined". In practice `fullname` is always populated by the queries, so this is defensive
only.

**Fix:** For symmetry with the `geezFullname` guard, coalesce `fullname` too:
`\`${member.fullname ?? ''} ${member.geezFullname ?? ''}\``.

---

_Reviewed: 2026-07-31T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
