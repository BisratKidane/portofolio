# Phase 23: Write Path & Quality Gate - Pattern Map

**Mapped:** 2026-07-31
**Files analyzed:** 6 (3 modified components, 1 modified query-owner page, 2 test files to extend/add)
**Analogs found:** 6 / 6 (all analogs are in-file siblings or a sibling component — this phase mostly EXTENDS existing patterns rather than importing from a different domain)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/components/manage/MemberFields.jsx` | component (form) | request-response (controlled form state) | itself — existing `mothersname` TextField + `Stack direction={{xs:'column',sm:'row'}}` rows | exact (extend in place) |
| `frontend/src/components/manage/AddRelativeDialog.jsx` | component (dialog) | request-response (CRUD create) | itself — existing `Autocomplete` block (~line 243) + `EMPTY_FORM`/mutation variable assembly | exact (extend in place) |
| `frontend/src/components/manage/EditMemberDialog.jsx` | component (dialog) | request-response (CRUD update) | itself — `formFromMember()` hydration + `EDIT_MEMBER_MUTATION` field list | exact (extend in place) |
| `frontend/src/pages/ManagePage.jsx` (`EDITABLE_MEMBER_FIELDS` const) | query-owner / data-fetch | CRUD (read for hydration) | itself — `EDITABLE_MEMBER_FIELDS` string (line 28-29) | exact (extend in place) |
| `frontend/src/components/manage/MemberFields.test.jsx` | test | request-response | itself (extend with 3 new field assertions) — also mirror `AdminMemberTable.test.jsx` null-guard style | exact |
| `frontend/src/components/manage/AddRelativeDialog.test.jsx` | test | request-response | itself (extend) — mirror `AdminMemberTable.test.jsx` FIND-01 filter tests for the FIND-02 `filterOptions` behavior | role-match (test structure) + `AdminMemberTable.test.jsx` (filter-test pattern) |
| `frontend/src/components/manage/EditMemberDialog.test.jsx` | test | request-response | itself (extend) — round-trip/hydration assertions | exact |

No genuinely "no analog" files exist in this phase: every target file already has the exact structural precedent needed, either in itself (this is additive work on existing forms) or in `AdminMemberTable.jsx`/`.test.jsx` (the one place in the codebase that already does Ge'ez-aware filtering/rendering, added in Phase 22 for FIND-01).

## Pattern Assignments

### `frontend/src/components/manage/MemberFields.jsx` (component, request-response)

**Analog:** itself — the existing optional `mothersname` field and the 2-column row structure.

**Imports** (lines 1-6, unchanged — no new imports needed for plain TextFields):
```javascript
import { useRef } from 'react';
import { Avatar, Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import MemberFallbackAvatar from '../MemberFallbackAvatar.jsx';
```

**Text-field wiring pattern to copy verbatim** (line 33, already generalized — no changes needed, just call it with the 3 new field names):
```javascript
const handleTextChange = (field) => (event) => onChange(field, event.target.value);
```

**Optional-field pattern to copy exactly** — `mothersname` (lines 123-128) has NO `required` prop, matching D-03's "optional, nullable" requirement for the 3 Ge'ez fields:
```javascript
<TextField
  label="Mother's name"
  value={form.mothersname}
  onChange={handleTextChange('mothersname')}
  fullWidth
/>
```

**Row/column structure to slot the new rows into (D-01/D-02).** Current structure is a flat sequence of `Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}` blocks (lines 93-108 name row, 110-129 gender/mothersname row). Per the CONTEXT's locked arrangement, the plan must insert TWO new rows between the existing name row and the existing gender/mothersname row:

```
Row 1 (existing, lines 93-108): First name | Last name
Row 2 (NEW): Ge'ez first name (ስም) | Ge'ez last name (ስም ኣቦ)
Row 3 (existing, lines 110-129): Gender | Mother's name
Row 4 (NEW): (empty Box, flex:1) | Ge'ez mother's name (ስም ኣደ)
Row 5 (existing, lines 131-148): Birthdate | Living toggle
```

The existing row shape to copy for both new rows:
```javascript
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
  <TextField
    label="First name"
    required
    value={form.firstname}
    onChange={handleTextChange('firstname')}
    fullWidth
  />
  <TextField
    label="Last name"
    required
    value={form.lastname}
    onChange={handleTextChange('lastname')}
    fullWidth
  />
</Stack>
```
becomes (new row 2, optional, no `required`):
```javascript
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
  <TextField
    label="Ge'ez first name (ስም)"
    value={form.geezFirstname}
    onChange={handleTextChange('geezFirstname')}
    fullWidth
  />
  <TextField
    label="Ge'ez last name (ስም ኣቦ)"
    value={form.geezLastname}
    onChange={handleTextChange('geezLastname')}
    fullWidth
  />
</Stack>
```

For the row-4 empty left slot (Gender has no Ge'ez twin, D-02), there is no existing analog for an intentionally-empty flex cell in this file — the closest structural precedent is the `Box` wrapping the standalone `Address` field (lines 155-157), which shows the codebase's convention for a single-slot flex cell:
```javascript
<Box>
  <TextField label="Address" value={form.address} onChange={handleTextChange('address')} fullWidth />
</Box>
```
Use an empty `<Box sx={{ flex: 1 }} />` (or `fullWidth={false}` equivalent spacer) as the left slot in row 4, matching the `Stack` row's `flex`-based two-column sizing (rows use plain children with `fullWidth` on the `TextField`, which fills its `flex: 1` allocation by default inside `Stack direction="row"`).

**`EMPTY_FORM`/initial-state pattern (this key touches THREE files that each declare their own literal `EMPTY_FORM`/`formFromMember` object — all three must add the 3 keys, they are NOT DRY across files today):**
- `AddRelativeDialog.jsx` lines 41-51 (`EMPTY_FORM`)
- `EditMemberDialog.jsx` lines 14-24 (`EMPTY_FORM`) and lines 26-39 (`formFromMember`)

---

### `frontend/src/components/manage/AddRelativeDialog.jsx` (component, request-response / CRUD create)

**Analog:** itself — `EMPTY_FORM` object, `handleFieldChange`/`form` spread into mutation `newMember` variable, and the existing Autocomplete block.

**Imports to add** (current imports, lines 1-15 — add `createFilterOptions` from `@mui/material`):
```javascript
import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from '@mui/material';
```
becomes (add `createFilterOptions` to the named import list):
```javascript
import {
  Alert,
  Autocomplete,
  Button,
  createFilterOptions,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from '@mui/material';
```

**`EMPTY_FORM` to extend** (lines 41-51):
```javascript
const EMPTY_FORM = {
  firstname: '',
  lastname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  isAlive: true,
  phone: '',
  address: ''
};
```
Add `geezFirstname: '', geezLastname: '', geezMothersname: ''` — placement should mirror the D-01 layout order (directly after `lastname`/`gender` respectively, though `EMPTY_FORM` key order is cosmetic since `form` is spread wholesale into `newMember`).

**Mutation variable assembly (no changes needed to this part) — form is already spread wholesale** (e.g. line 149 `newMember: form`), confirming the 3 new keys ride along automatically once added to `EMPTY_FORM`/`handleFieldChange`:
```javascript
const data = await graphqlRequest(ADD_PARENT_MUTATION, {
  memberId: targetId,
  role: parentRoleFromGender(form.gender),
  newMember: form
});
```
Backend accepts these via `OPTIONAL_FAMILY_MEMBER_FIELDS` spread-passthrough (see Shared Patterns below) — **no GraphQL schema/resolver change needed**, confirmed at `backend/src/schemas/familyMember.schema.js:48-50` (`NewFamilyMemberInput` already declares `geezFirstname`/`geezLastname`/`geezMothersname`).

**Autocomplete block to modify (current, lines 243-249):**
```javascript
<Autocomplete
  options={inScopeMembers}
  getOptionLabel={(member) => member.fullname}
  value={otherParent}
  onChange={(_event, value) => setOtherParent(value)}
  renderInput={(params) => <TextField {...params} label="Other parent (optional)" />}
/>
```

**D-06 custom `filterOptions` to add** — no existing `createFilterOptions` usage in the codebase to copy verbatim from, but `AdminMemberTable.jsx:57-62` is the codebase's one existing Ge'ez-aware, null-guarded dual-field match and should be mirrored for the matching logic inside a custom `filterOptions` function:
```javascript
// AdminMemberTable.jsx:57-62 — pattern to port into filterOptions' stringify:
const term = search.trim().toLowerCase();
const filtered = members.filter(
  (member) =>
    member.fullname.toLowerCase().includes(term) ||
    member.geezFullname?.toLowerCase().includes(term)
);
```
Applied via MUI's `createFilterOptions` `stringify` option (decoupling match-text from `getOptionLabel`, per D-06):
```javascript
const filterOptions = createFilterOptions({
  stringify: (member) => `${member.fullname} ${member.geezFullname ?? ''}`
});
```
```javascript
<Autocomplete
  options={inScopeMembers}
  filterOptions={filterOptions}
  getOptionLabel={(member) => member.fullname}
  value={otherParent}
  onChange={(_event, value) => setOtherParent(value)}
  renderInput={(params) => <TextField {...params} label="Other parent (optional)" />}
/>
```
Note: `inScopeMembers` is currently built in `ManagePage.jsx` as a trimmed `{ id, fullname }` projection (lines 191, 370: `.map(({ id, fullname }) => ({ id, fullname }))`). **This projection must be widened to also carry `geezFullname`**, otherwise `filterOptions`'s stringify will always see `undefined` for the Ge'ez half — see Shared Patterns.

---

### `frontend/src/components/manage/EditMemberDialog.jsx` (component, request-response / CRUD update)

**Analog:** itself — `EMPTY_FORM`, `formFromMember()` hydration, `EDIT_MEMBER_MUTATION` selection set.

**`EMPTY_FORM` (lines 14-24) and `formFromMember` (lines 26-39) — both need the 3 new keys:**
```javascript
const EMPTY_FORM = {
  firstname: '',
  lastname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  isAlive: true,
  phone: '',
  address: ''
};

function formFromMember(member) {
  if (!member) return EMPTY_FORM;
  return {
    firstname: member.firstname ?? '',
    lastname: member.lastname ?? '',
    gender: member.gender ?? '',
    mothersname: member.mothersname ?? '',
    email: member.email ?? '',
    birthdate: member.birthdate ?? '',
    isAlive: member.isAlive ?? true,
    phone: member.phone ?? '',
    address: member.address ?? ''
  };
}
```
Add `geezFirstname: '', geezLastname: '', geezMothersname: ''` to `EMPTY_FORM`, and `geezFirstname: member.geezFirstname ?? ''`, etc. to `formFromMember` — exact same `?? ''` null-coalescing convention as `mothersname`.

**CRITICAL confirmed gap (per code_context integration point #4): `EDIT_MEMBER_MUTATION`'s own selection set (lines 6-12) also omits the 3 raw fields and even `geezFullname`:**
```javascript
const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id firstname lastname fullname gender mothersname email birthdate isAlive phone address
    }
  }
`;
```
The `fields: form` variable assembly (line 64: `graphqlRequest(EDIT_MEMBER_MUTATION, { id: member.id, fields: form })`) auto-includes the 3 new keys once `form` carries them (same spread-wholesale pattern as `AddRelativeDialog`), so **the mutation variables need no code change** — only the `EMPTY_FORM`/`formFromMember` extension above. But the mutation's **return-selection set** should add `geezFirstname geezLastname geezMothersname` (and ideally `geezFullname`) if the dialog's caller (`ManagePage.jsx`) relies on the mutation response to refresh in-memory state rather than always refetching — confirm against `ManagePage.jsx`'s `onSaved` handler before deciding whether this is required or cosmetic.

**Confirmed upstream gap — `EDITABLE_MEMBER_FIELDS` in `frontend/src/pages/ManagePage.jsx:28-29` is the actual source of the `member` prop's shape and does NOT fetch the raw Ge'ez parts:**
```javascript
const EDITABLE_MEMBER_FIELDS =
  'id firstname lastname fullname geezFullname gender mothersname email birthdate isAlive phone address photoUrl';
```
This must become:
```javascript
const EDITABLE_MEMBER_FIELDS =
  'id firstname lastname fullname geezFirstname geezLastname geezMothersname geezFullname gender mothersname email birthdate isAlive phone address photoUrl';
```
This is used to build BOTH `MY_EDITABLE_MEMBERS_QUERY` (line 31-41) and `FAMILY_MEMBER_FOCUS_QUERY` (lines 63-73) via string interpolation — a single string constant is the fan-out point, exactly the "aggregator" DRY pattern this codebase favors elsewhere (schemas/resolvers barrels). One string edit propagates to both queries. Backend schema already exposes these fields on `FamilyMember` type (`backend/src/schemas/familyMember.schema.js:20-23`), so no backend change needed.

---

## Shared Patterns

### Optional/nullable TextField (no `required` prop)
**Source:** `frontend/src/components/manage/MemberFields.jsx:123-128` (`mothersname`)
**Apply to:** all 3 new Ge'ez TextFields in `MemberFields.jsx`
```javascript
<TextField
  label="Mother's name"
  value={form.mothersname}
  onChange={handleTextChange('mothersname')}
  fullWidth
/>
```

### Form-object spread into GraphQL mutation variables (no manual field enumeration)
**Source:** `AddRelativeDialog.jsx:149` (`newMember: form`), `EditMemberDialog.jsx:64` (`fields: form`)
**Apply to:** both dialogs — confirms zero mutation-variable code changes are needed once `EMPTY_FORM`/`formFromMember` carry the 3 keys; the backend's `OPTIONAL_FAMILY_MEMBER_FIELDS` passthrough (below) does the rest.

### Backend `'' → null` optional-field passthrough (no backend change expected, verify only)
**Source:** `backend/src/resolvers/user.resolver.js:41-45` (list) and the loop starting at line 64
```javascript
export const OPTIONAL_FAMILY_MEMBER_FIELDS = [
  'mothersname',
  ... ,
  'geezFirstname',
  'geezLastname',
  'geezMothersname',
  ...
];
```
This confirms DATA-03 (clearing a Ge'ez field sends `''`, backend maps to `null`) needs no resolver work — only a frontend test asserting the round-trip.

### Ge'ez-aware null-guarded dual-field matching (Latin OR Ge'ez substring)
**Source:** `frontend/src/components/manage/AdminMemberTable.jsx:57-62` (FIND-01, prior phase)
```javascript
const term = search.trim().toLowerCase();
const filtered = members.filter(
  (member) =>
    member.fullname.toLowerCase().includes(term) ||
    member.geezFullname?.toLowerCase().includes(term)
);
```
**Apply to:** the new `AddRelativeDialog.jsx` `filterOptions` (FIND-02) — same null-guard (`?.`) discipline, same "Latin OR Ge'ez" logic, just re-expressed as a MUI `createFilterOptions({ stringify })` instead of an array `.filter()`.

### `getGeezDisplay` — Ge'ez display derivation (read-side, do not recompute)
**Source:** `frontend/src/utils/displayName.js:10-14`
```javascript
export function getGeezDisplay(member) {
  const text = member?.geezFullname?.trim();
  if (!text) return null;
  return { text, lang: GEEZ_LANG };
}
```
**Apply to:** QUAL-01's re-confirmation tests only (`frontend/src/utils/displayName.test.js` already exercises this — re-run, don't rewrite, unless the planner opts to add a secondary-line render in `AddRelativeDialog`'s `renderOption`, the Claude's Discretion item in CONTEXT D-06 note).

### Test file structure: component test with `LocalizationProvider` wrapper + `vi.mock('../../api/graphqlClient.js')`
**Source:** `frontend/src/components/manage/EditMemberDialog.test.jsx:1-48`, `frontend/src/components/manage/AddRelativeDialog.test.jsx:1-91`
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));
import { graphqlRequest } from '../../api/graphqlClient.js';

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn(); // or onCreated for AddRelativeDialog
  const utils = render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <EditMemberDialog open member={MEMBER} onClose={onClose} onSaved={onSaved} {...props} />
    </LocalizationProvider>
  );
  return { ...utils, onClose, onSaved };
}
```
**Apply to:** new round-trip tests in `MemberFields.test.jsx`, `AddRelativeDialog.test.jsx`, `EditMemberDialog.test.jsx`.

### Test pattern: null-guarded Ge'ez substring filter test (mirror for FIND-02 picker test)
**Source:** `frontend/src/components/manage/AdminMemberTable.test.jsx:182-197, 216-224`
```javascript
it("filters rows by a typed Ge'ez substring matched against geezFullname (FIND-01)", async () => {
  render(
    <AdminMemberTable
      members={[
        { ...MEMBERS[0], geezFullname: 'ጃነ ዶ' },
        { ...MEMBERS[1] }
      ]}
      onSelect={vi.fn()}
    />
  );
  await userEvent.type(screen.getByLabelText('Search members'), 'ጃነ');
  expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
});

it('does not throw when searching and a member has a null/undefined geezFullname (null-guard)', async () => {
  render(
    <AdminMemberTable
      members={[
        { ...MEMBERS[0], geezFullname: null },
        { ...MEMBERS[1] }
      ]}
      onSelect={vi.fn()}
    />
  );
  // ... types a search term, asserts no throw / correct filtering
});
```
**Apply to:** the new `AddRelativeDialog.test.jsx` FIND-02 tests — reuse the existing `IN_SCOPE_MEMBERS` picker-interaction sequence (lines 390-424: click "or pick someone already in your family" → click the picker → `userEvent.type` → assert option text) but type a Ge'ez substring and assert the Latin-labelled option still surfaces; add one null-guard case (`geezFullname: null` or absent) mirroring `AdminMemberTable.test.jsx:216`.

### Test pattern: exact mutation variable assertion (round-trip / clear-to-null proof)
**Source:** `frontend/src/components/manage/EditMemberDialog.test.jsx:67-98`
```javascript
await waitFor(() => {
  expect(graphqlRequest).toHaveBeenCalledWith(EDIT_MEMBER_MUTATION, {
    id: '1',
    fields: {
      firstname: 'Augusta',
      lastname: 'Lovelace',
      gender: 'Female',
      mothersname: 'Jane Doe',
      email: 'ada@example.com',
      birthdate: '1815-12-10',
      isAlive: true,
      phone: '555-1234',
      address: '1 Main St'
    }
  });
});
```
**Apply to:** new EditMemberDialog test proving SC1/D-05 (clearing a Ge'ez field sends `''` in the mutation payload — the backend, not the frontend, maps `'' → null`, so the frontend-side assertion is "empty string is sent, not omitted/undefined").

## No Analog Found

None — every file in scope already has either an in-file precedent (this phase is purely additive/extend-in-place on 3 existing form/dialog files) or a strong cross-file analog (`AdminMemberTable.jsx`/`.test.jsx` for the Ge'ez-aware filter logic and its test shape).

## Metadata

**Analog search scope:** `frontend/src/components/manage/`, `frontend/src/pages/ManagePage.jsx`, `frontend/src/utils/displayName.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/schemas/familyMember.schema.js`, `backend/src/models/FamilyMember.js`
**Files scanned:** `MemberFields.jsx`, `MemberFields.test.jsx`, `AddRelativeDialog.jsx`, `AddRelativeDialog.test.jsx`, `EditMemberDialog.jsx`, `EditMemberDialog.test.jsx`, `AdminMemberTable.jsx`, `AdminMemberTable.test.jsx`, `ManagePage.jsx` (lines 1-70), `displayName.js`, `user.resolver.js` (grep only), `familyMember.schema.js` (grep only), `FamilyMember.js` (grep only)
**Pattern extraction date:** 2026-07-31
