---
phase: 25-reusable-personcard
reviewed: 2026-08-03T17:53:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - frontend/src/utils/genderTheme.js
  - frontend/src/components/person/PersonCard.jsx
  - frontend/src/components/person/PersonCard.test.jsx
  - frontend/src/components/family/MemberNode.jsx
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-08-03T17:53:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 25 extracts the gender -> color/label mapping into a shared `genderTheme.js`
module and introduces the reusable `PersonCard` component (plus its test suite),
while refactoring `MemberNode.jsx` to consume the shared module instead of
re-hardcoding the tint hex values.

The refactor is clean and behavior-preserving: `MemberNode.jsx` now imports
`genderMeta` with no runtime change, `genderTheme.js` is a straightforward pure
module with correct import paths, and there are no security concerns (no
injection sinks, secrets, `eval`, or `dangerouslySetInnerHTML`; all rendered
values flow into React text/attributes which auto-escape).

Two robustness/quality defects were found. First, `PersonCard` invokes the
`onEdit` / `onExpand` callbacks without the defensive guard that the sibling
`MemberNode` component uses, so a Phase 26/27 consumer that renders an editable
or child-bearing card without wiring the corresponding handler will crash on
click. Second, one spouse test asserts against `textContent` with a pattern that
can never match the actual button text, so it silently fails to guard the
behavior it claims to protect.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `onEdit` / `onExpand` invoked without a guard — latent crash for consumers

**File:** `frontend/src/components/person/PersonCard.jsx:107,153`
**Issue:** The Edit button renders whenever `member.canEdit === true`
(line 104) and calls `onEdit(member)` unconditionally (line 107); the expand
control renders whenever `!isSpouse && childCount >= 1` (line 81) and calls
`onExpand(member)` unconditionally (line 153). Neither `onEdit` nor `onExpand`
has a default value in the `PersonCardSingle` signature (line 75), and whether a
button renders is driven by *data* (`member.canEdit`, `member.children`), not by
whether the caller supplied a handler. The established pattern in the sibling
`MemberNode.jsx` guards every handler call — `if (onToggleExpand) onToggleExpand(member.id)`
(line 233) and `if (onToggleAncestorExpand) ...` (line 158). `PersonCard`
deviates from that convention, so a Phase 26/27 consumer that passes member data
with `canEdit: true` (a server-provided field) or non-empty `children` but forgets
to wire the corresponding callback will throw `TypeError: onEdit is not a function`
on click, taking down the render tree. The test suite never exercises this path
because `renderCard` always supplies both handlers (test lines 29-30).
**Fix:** Guard the invocations to match the `MemberNode` convention, e.g.:
```jsx
onClick={() => onEdit?.(member)}
// ...
onClick={() => onExpand?.(member)}
```
Optionally, only render the controls when the handler exists (e.g.
`member.canEdit === true && typeof onEdit === 'function'`) so a non-actionable
button is never shown.

### WR-02: Spouse "no expand control" test can never fail — false-passing assertion

**File:** `frontend/src/components/person/PersonCard.test.jsx:191-193`
**Issue:** The test "never shows an expand control on the spouse card, even when
the spouse has children" locates spouse-card buttons and asserts none has
`textContent` matching `/children of/i`:
```jsx
Array.from(spouseCard.querySelectorAll('button')).find((btn) => /children of/i.test(btn.textContent || ''))
```
But the expand control's *visible text* is produced by `childCountLabel` (e.g.
`"2 children"`), and the string `"children of"` only appears in the button's
`aria-label`, never in its `textContent`. So even if a regression caused the
spouse card to render an expand control, its `textContent` (`"2 children"`) would
not match `/children of/i`, `.find()` would return `undefined`, and the test would
still pass. The assertion therefore does not guard the behavior it claims to
protect. (The sibling collapsed/expanded tests at lines 111 and 126 correctly
query by accessible name via `{ name: /children of/i }`, which does match the
aria-label.)
**Fix:** Assert on the accessible name (aria-label) or use a `/children/i`
pattern that actually matches the rendered text, e.g.:
```jsx
expect(within(spouseCard).queryByRole('button', { name: /children of/i })).toBeNull();
```

## Info

### IN-01: Spouse test fixture retains anchor gender, weakening spouse-card coverage

**File:** `frontend/src/components/person/PersonCard.test.jsx:22`
**Issue:** `const SPOUSE = { ...BASE_MEMBER, id: '2', fullname: 'Bob Lovelace' }`
inherits `gender: 'Female'` from `BASE_MEMBER`. The spouse-pairing tests never
vary the spouse's gender, so the spouse card's independent `genderMeta` /
ring-style resolution (PersonCard.jsx:76-77 running a second time for the spouse)
is exercised only for `Female`. A regression that mis-resolved the spouse's tint
or ring for a differing gender would go uncaught.
**Fix:** Give the spouse fixture a distinct gender (e.g. `gender: 'Male'`) so the
pair test also covers divergent gender resolution across the two composed cards.

---

_Reviewed: 2026-08-03T17:53:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
