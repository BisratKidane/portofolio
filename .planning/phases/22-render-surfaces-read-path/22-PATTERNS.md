# Phase 22: Render Surfaces (Read Path) - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 5 (all MODIFY, no new files) + 1 read-only helper contract
**Analogs found:** 5 / 5 (all patterns are IN THE SAME FILE being modified — this phase retrofits existing surfaces rather than creating new ones, so the "analog" is each file's own current code plus the shared `getGeezDisplay` helper contract)

This phase creates zero new files. Every edit target already has a fully worked current implementation; the pattern to copy is each file's own existing Latin-name render block / query constant, extended with the Ge'ez line per the UI-SPEC. There is no cross-codebase analog search needed — the "closest analog" for each file IS the file itself (self-analog), and the one shared cross-cutting pattern is the `getGeezDisplay()` contract from Phase 21.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|----------------|------|-----------|-----------------|---------------|
| `frontend/src/components/family/MemberNode.jsx` | component | request-response (render props) | itself — existing `ROW_SX` secondary-line pattern (birthday/mother/address rows) | exact (self, reuse existing token) |
| `frontend/src/components/manage/AdminMemberTable.jsx` | component | CRUD (search/filter over in-memory list) | itself — existing `fullname` name cell + `.filter()` search | exact (self) |
| `frontend/src/components/manage/MemberCard.jsx` | component | request-response (render props) | itself — existing `fullname` `Typography` in the name/Chip `Stack` | exact (self) |
| `frontend/src/pages/FamilyTreePage.jsx` | route/page (GraphQL query owner) | CRUD (read query) | itself — `FAMILY_TREE_QUERY` string constant | exact (self, add one field) |
| `frontend/src/pages/ManagePage.jsx` | route/page (GraphQL query owner) | CRUD (read query) | itself — `EDITABLE_MEMBER_FIELDS` + `FAMILY_MEMBERS_QUERY` string constants | exact (self, add one field to two places) |
| (read-only) `frontend/src/utils/displayName.js` | utility (shared helper, Phase 21, LOCKED) | transform | n/a — this is the shared pattern source, not an edit target | n/a |

**No analog gap.** All 5 files are being modified in-place with a well-defined, narrow addition; there was no need to search elsewhere in the codebase for a pattern because each file already demonstrates the exact "secondary line below primary name" and "query constant + field string" patterns needed.

## Shared Pattern: `getGeezDisplay()` contract (Phase 21, LOCKED — do not modify)

**Source:** `frontend/src/utils/displayName.js:1-14`

```javascript
export const GEEZ_LANG = 'ti';

/**
 * Derives the Ge'ez display name for a family member, or null if absent.
 * Reads the server-derived geezFullname field (Phase 18/19 VIRTUAL) directly
 * — it does not recompute the join from the underlying raw name parts.
 * @param {{ geezFullname?: string | null }} member
 * @returns {{ text: string, lang: string } | null}
 */
export function getGeezDisplay(member) {
  const text = member?.geezFullname?.trim();
  if (!text) return null;
  return { text, lang: GEEZ_LANG };
}
```

**Apply to:** all three render surfaces (`MemberNode.jsx`, `AdminMemberTable.jsx`, `MemberCard.jsx`).

**Canonical consumer snippet** (from CONTEXT.md L-02 / UI-SPEC Typography section — the exact pattern every consumer must use, verbatim structure):

```jsx
import { getGeezDisplay } from '../../utils/displayName.js'; // adjust relative path per file

const geez = getGeezDisplay(member);

// ...

{geez && (
  <Typography sx={{ fontSize: 12, fontWeight: 400, color: colors.slate }} lang={geez.lang} noWrap>
    {geez.text}
  </Typography>
)}
```

No consumer exists yet in the codebase (`grep -rn "getGeezDisplay"` only matches the helper's own definition and its `displayName.test.js` unit tests) — this phase is the FIRST to wire the helper into a render surface. Do not derive `lang` from a hardcoded `'ti'` string in consumer files; always read `geez.lang` off the returned object (L-02, UI-SPEC line 61-62).

---

## Pattern Assignments

### `frontend/src/components/family/MemberNode.jsx` (component, request-response)

**Role:** xyflow custom node — fixed 252x120px card, two-column layout (avatar + rows column with `gap: 0.25`).

**Imports pattern** (lines 1-15, add one import):
```javascript
import { Handle, Position } from '@xyflow/react';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import { colors } from '../../theme.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';
// ADD: import { getGeezDisplay } from '../../utils/displayName.js';
```

**Existing `ROW_SX` token to reuse verbatim** (line 51):
```javascript
const ROW_SX = { fontSize: 12, fontWeight: 400, color: colors.slate };
```
This already matches the UI-SPEC's Ge'ez line spec exactly (`fontSize: 12, fontWeight: 400, color: colors.slate`) — no new token needed on this file (UI-SPEC line 66).

**Reserved top row — currently unconditional height 18** (lines 164-185):
```jsx
<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
  {/* Top row: shows a "Head" tag when this card is the re-rooted tree
      head; otherwise reserved (kept for a future edit action). */}
  <Box sx={{ height: 18, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
    {isFocusRoot && (
      <Typography
        component="span"
        sx={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          color: colors.primaryDark,
          bgcolor: colors.gradientSoft,
          px: 0.75,
          borderRadius: 0.5,
          lineHeight: 1.5
        }}
      >
        Head
      </Typography>
    )}
  </Box>
```
**Per UI-SPEC (line 100):** change `height: 18` to `height: isFocusRoot ? 18 : 0` — collapses the reserved row to 0 on every non-focus-root card, reclaiming vertical space for the new Ge'ez line WITHOUT changing the outer `Paper`'s fixed `height: 120` (line 80).

**Latin fullname line — insertion point for the Ge'ez line** (lines 187-191):
```jsx
{/* The viewer is identified by the card's double border (gender border +
    viewer outline ring), so no separate "You" chip is needed. */}
<Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
  {member.fullname}
</Typography>

{birthday && (
  <Typography sx={ROW_SX} noWrap>
    {birthday}
  </Typography>
)}
```
**Insert the Ge'ez `Typography` immediately after the `fullname` block, before `birthday`** (UI-SPEC line 101):
```jsx
<Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
  {member.fullname}
</Typography>

{geez && (
  <Typography sx={ROW_SX} lang={geez.lang} noWrap>
    {geez.text}
  </Typography>
)}

{birthday && (
  <Typography sx={ROW_SX} noWrap>
    {birthday}
  </Typography>
)}
```
Compute `const geez = getGeezDisplay(member);` alongside the existing derived values (`birthday`, `motherName`, `showAddress` at lines 64-67).

**Error handling / validation:** none — pure presentational derivation; `getGeezDisplay` itself is the only guard (returns `null` on absent/whitespace-only text), consumer does no additional validation (L-04: absent = nothing extra).

---

### `frontend/src/components/manage/AdminMemberTable.jsx` (component, CRUD — search/filter)

**Imports pattern** (lines 1-18, add one import):
```javascript
import { useState } from 'react';
import {
  Box, Switch, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import MemberAvatarImage from './MemberAvatarImage.jsx';
import { colors } from '../../theme.js';
// ADD: import { getGeezDisplay } from '../../utils/displayName.js';
```

**Current search filter (D-04 target)** (lines 56-58):
```javascript
const filtered = members.filter((member) =>
  member.fullname.toLowerCase().includes(search.trim().toLowerCase())
);
```
**Extend per D-04 / UI-SPEC line 108:**
```javascript
const filtered = members.filter((member) => {
  const term = search.trim().toLowerCase();
  return (
    member.fullname.toLowerCase().includes(term) ||
    member.geezFullname?.toLowerCase().includes(term)
  );
});
```
Note: `member.geezFullname?.toLowerCase()` — optional chaining guards `null`/`undefined` before `.includes()` per D-04's explicit discretion note. Do NOT match `geezFirstname`/`geezLastname`/`geezMothersname` (excluded per D-04).

**Current name cell** (lines 111-114, inside the row-map at line 101):
```jsx
<TableCell>
  <Typography sx={{ fontWeight: 600, color: nameColor(member.gender) }} noWrap>
    {member.fullname}
  </Typography>
</TableCell>
```
**Stack Ge'ez line below, same `TableCell`, no new column** (D-03 / UI-SPEC line 107):
```jsx
<TableCell>
  <Typography sx={{ fontWeight: 600, color: nameColor(member.gender) }} noWrap>
    {member.fullname}
  </Typography>
  {getGeezDisplay(member) && (
    <Typography sx={{ fontSize: 12, fontWeight: 400, color: colors.slate }} lang={getGeezDisplay(member).lang} noWrap>
      {getGeezDisplay(member).text}
    </Typography>
  )}
</TableCell>
```
(Planner should hoist `const geez = getGeezDisplay(member);` once per row rather than calling twice — same pattern as `Provenance` sub-component's local `date` variable at line 30.)

**Existing "secondary muted line under primary" precedent already in this file** — the `Provenance` sub-component (lines 29-41) is the file's OWN internal analog for "name over secondary line", useful as a structural reference even though it's a different sub-component:
```jsx
function Provenance({ who, when }) {
  const date = formatWhen(when);
  return (
    <Box>
      <Typography variant="body2" noWrap>{who?.name || '—'}</Typography>
      {date && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {date}
        </Typography>
      )}
    </Box>
  );
}
```
This confirms the codebase convention: no `<Box>` wrapper is strictly required for the name cell (a `TableCell` already stacks block-level `Typography` children top-to-bottom), matching the UI-SPEC's "same `TableCell`, no restructuring" instruction (D-03).

**Empty-state copy (unaffected, verify unchanged):** `AdminMemberTable.jsx:86` — `<Typography>No members match your search.</Typography>` — stays as-is; per UI-SPEC it now also covers Ge'ez-only-matching searches with no copy change required.

---

### `frontend/src/components/manage/MemberCard.jsx` (component, request-response)

**Imports pattern** (lines 1-5, add one import):
```javascript
import { useRef } from 'react';
import { Box, Button, ButtonBase, Chip, Stack, Typography } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { colors } from '../../theme.js';
import MemberAvatarImage from './MemberAvatarImage.jsx';
// ADD: import { getGeezDisplay } from '../../utils/displayName.js';
```

**Current name region** (lines 106-120):
```jsx
<Box sx={{ flexGrow: 1, minWidth: 0 }}>
  <Stack direction="row" alignItems="center" spacing={1}>
    <Typography sx={{ fontWeight: 600 }} noWrap>
      {member.fullname}
    </Typography>
    {isDerived && (
      <Chip label="Derived" size="small" sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }} />
    )}
  </Stack>
  {locked && (
    <Typography variant="body2" color="text.secondary">
      Manages their own profile.
    </Typography>
  )}
</Box>
```
**Stack Ge'ez line below the `fullname` row Stack, inside the same outer `Box`** (D-03 / UI-SPEC line 113) — insert as a sibling of the `direction="row"` Stack, before the `locked` conditional:
```jsx
<Box sx={{ flexGrow: 1, minWidth: 0 }}>
  <Stack direction="row" alignItems="center" spacing={1}>
    <Typography sx={{ fontWeight: 600 }} noWrap>
      {member.fullname}
    </Typography>
    {isDerived && (
      <Chip label="Derived" size="small" sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }} />
    )}
  </Stack>
  {geez && (
    <Typography sx={{ fontSize: 12, fontWeight: 400, color: colors.slate }} lang={geez.lang} noWrap>
      {geez.text}
    </Typography>
  )}
  {locked && (
    <Typography variant="body2" color="text.secondary">
      Manages their own profile.
    </Typography>
  )}
</Box>
```
Compute `const geez = getGeezDisplay(member);` near the top of the component body, alongside `const locked = ...` (line 25).

**No `ROW_SX` token exists in this file** (UI-SPEC line 66 confirms) — use the inline `sx` object with the three exact values (`fontSize: 12, fontWeight: 400, color: colors.slate`), matching `MemberNode.jsx`'s `ROW_SX` values verbatim for cross-surface consistency (D-02).

---

### `frontend/src/pages/FamilyTreePage.jsx` (route/page, CRUD read query)

**Current query constant** (lines 16-27):
```javascript
// D-14/Pitfall 6: this query is reachable by any linked member
// (requireFamilyAccess, Plan 17-01), so it must never expose the
// admin-only account-link field that myEditableMembers/familyMember(id)
// select on ManagePage.
const FAMILY_TREE_QUERY = `
  query FamilyTree {
    familyMembers {
      id firstname lastname fullname gender birthdate isAlive photoUrl mothersname address
      mother { id fullname } father { id } spouses { id } children { id }
    }
  }
`;
```
**Add `geezFullname` to the scalar field list** (SC4 / UI-SPEC line 118) — minimal one-line diff, same line the other scalars live on:
```javascript
const FAMILY_TREE_QUERY = `
  query FamilyTree {
    familyMembers {
      id firstname lastname fullname geezFullname gender birthdate isAlive photoUrl mothersname address
      mother { id fullname } father { id } spouses { id } children { id }
    }
  }
`;
```
No raw `geezFirstname`/`geezLastname`/`geezMothersname` needed here — tree card only renders `geezFullname` (UI-SPEC line 121). The existing `D-14/Pitfall 6` comment about NOT leaking admin-only fields is unaffected — `geezFullname` is not an admin-only field (same visibility class as `fullname`).

---

### `frontend/src/pages/ManagePage.jsx` (route/page, CRUD read query)

**Current `EDITABLE_MEMBER_FIELDS` constant** (lines 24-29, this fragment is interpolated into THREE queries: `MY_EDITABLE_MEMBERS_QUERY` at line 34/36/37, `FAMILY_MEMBER_FOCUS_QUERY` at lines 66-71):
```javascript
// The scalar fields both the avatar (gender, photoUrl) and the edit form
// (all editable fields incl. mothersname) need on any member card. Requested
// on nested relatives so a relative's Edit dialog opens fully populated, not
// just with an id + fullname.
const EDITABLE_MEMBER_FIELDS =
  'id firstname lastname fullname gender mothersname email birthdate isAlive phone address photoUrl';
```
**Add `geezFullname`** (SC4 / UI-SPEC line 119) — this single edit automatically propagates the field to `MY_EDITABLE_MEMBERS_QUERY`, `FAMILY_MEMBER_FOCUS_QUERY`, and all nested relative selections (`mother`, `father`, `spouses`, `children`, `siblings`) since they all interpolate this same string constant:
```javascript
const EDITABLE_MEMBER_FIELDS =
  'id firstname lastname fullname geezFullname gender mothersname email birthdate isAlive phone address photoUrl';
```

**Current `FAMILY_MEMBERS_QUERY` constant (separate from `EDITABLE_MEMBER_FIELDS`, feeds `AdminMemberTable`)** (lines 43-51):
```javascript
const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersTable {
    familyMembers {
      id firstname lastname fullname gender birthdate isAlive photoUrl
      linkedUser { id name email }
      createdBy { id name } updatedBy { id name } createdAt updatedAt
    }
  }
`;
```
**Add `geezFullname` here too** (this is a SEPARATE constant, not fed by `EDITABLE_MEMBER_FIELDS` — must be edited independently per UI-SPEC line 119):
```javascript
const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersTable {
    familyMembers {
      id firstname lastname fullname geezFullname gender birthdate isAlive photoUrl
      linkedUser { id name email }
      createdBy { id name } updatedBy { id name } createdAt updatedAt
    }
  }
`;
```
This is the field the admin-table search (`AdminMemberTable.jsx`'s `member.geezFullname`) and name-cell render both depend on — without this addition, D-04's search extension and D-03's admin-table Ge'ez line would silently render/match nothing (data not fetched).

**No raw Ge'ez parts needed** — neither `EDITABLE_MEMBER_FIELDS` nor `FAMILY_MEMBERS_QUERY` need `geezFirstname`/`geezLastname`/`geezMothersname` this phase (all three read surfaces render/search `geezFullname` only, per UI-SPEC line 121; raw parts are Phase 23's entry/edit concern).

---

## Testing Patterns (existing test files — same-name `.test.jsx` siblings already exist for all 3 components)

| Component | Test file | Existing fixture pattern to extend |
|-----------|-----------|-------------------------------------|
| `MemberNode.jsx` | `frontend/src/components/family/MemberNode.test.jsx` | `BASE_MEMBER` object (lines 26-35) + `renderNode(dataOverrides)` helper (lines 37-45) — add `geezFullname` to a member override, assert `screen.getByText`/`queryByText` for the Ge'ez string, and assert absence when `geezFullname` is `null`/omitted |
| `AdminMemberTable.jsx` | `frontend/src/components/manage/AdminMemberTable.test.jsx` | `MEMBERS` array fixture (lines 10-20) — add a member with `geezFullname: 'ጃነ ዶ'`, extend the existing "filters visible rows by ... substring match on fullname" test pattern (line 39) with a FIND-01 case searching a Ge'ez substring |
| `MemberCard.jsx` | `frontend/src/components/manage/MemberCard.test.jsx` | Same convention — add `geezFullname` to member props fixture, assert render/absence |

**Reusable Ethiopic test fixtures** (per CONTEXT.md `<specifics>`, reused from Phase 18/20/21): `firstname: 'ጃነ'`, `lastname: 'ዶ'`, `geezFullname: 'ጃነ ዶ'`. Also mirrors `displayName.test.js`'s own fixtures (`frontend/src/utils/displayName.test.js:24-34`).

**Unit-level contract already covered and LOCKED (do not re-test in this phase's component tests, just consume):** `frontend/src/utils/displayName.test.js` already asserts `getGeezDisplay` returns `null` for `null`/`undefined`/empty/whitespace-only `geezFullname`, and `{ text, lang: 'ti' }` for non-empty values. Component tests in this phase should test the WIRING (render calls the helper and reacts to its output correctly), not re-derive the helper's own null-handling logic.

## No Analog Found

None — every edit target has its pattern in-file (self-analog) or in the locked Phase 21 helper. No file in this phase requires reaching outside the 5 edit targets + `displayName.js` for a pattern.

## Metadata

**Analog search scope:** the 5 edit-target files themselves (self-analog) + `frontend/src/utils/displayName.js` (shared helper) + their existing `.test.jsx` siblings for testing conventions.
**Files scanned:** 8 (5 edit targets, 1 helper, 2 additional test files read for fixture conventions: `MemberNode.test.jsx`, `AdminMemberTable.test.jsx`) + `frontend/src/theme.js` (verified `colors.slate` = `#64748b`, matches `text.secondary`).
**Pattern extraction date:** 2026-07-30
