# Phase 15: Sibling Dedup Guard & /manage Self-Service UI - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 13 (5 backend, 8 frontend)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/services/familyMember.service.js` (MODIFY `addChild`) | service | CRUD + transactional lock | `backend/src/resolvers/user.resolver.js` (`verifyEmail`'s `FOR UPDATE` lock) + same file's own `setSpouse`/`computeEditableScope` | exact (transaction convention) / role-match (row-lock pattern) |
| `backend/src/services/familyMember.dedup.test.js` (NEW) | test | integration, transactional race | `backend/src/services/familyMember.scope.test.js` | exact |
| `backend/src/resolvers/familyMember.addChild.test.js` (EXTEND) | test | integration (resolver) | itself (existing file, extend in place) | exact |
| `backend/src/resolvers/familyMember.addSibling.test.js` (EXTEND) | test | integration (resolver) | itself (existing file, extend in place) | exact |
| `frontend/src/pages/ManagePage.jsx` (NEW) | component (page) | request-response (GraphQL fetch + role branch) | `frontend/src/pages/AdminLinkMembers.jsx` (fetch/loading/error scaffold) + `frontend/src/pages/Dashboard.jsx` (role branch, hero/card visuals) | role-match (strong) |
| `frontend/src/pages/ManagePage.test.jsx` (NEW) | test | component (RTL) | `frontend/src/pages/AdminLinkMembers.test.jsx` | exact |
| `frontend/src/components/manage/RelationshipGroupedPanel.jsx` (NEW) | component | transform (group rows → sections) | `frontend/src/pages/Dashboard.jsx` (`StatCard`/Paper section pattern) + `familyMember.service.js`'s `computeEditableScope` (shape to mirror) | role-match |
| `frontend/src/components/manage/RelationshipGroupedPanel.test.jsx` (NEW) | test | component (RTL) | `frontend/src/pages/AdminLinkMembers.test.jsx` | role-match |
| `frontend/src/components/manage/AddRelativeDialog.jsx` (NEW) | component | request-response (mutation dispatch) | `frontend/src/pages/AdminLinkMembers.jsx` (`UnlinkedUserRow`'s Autocomplete/TextField/mode-toggle pattern) | exact |
| `frontend/src/components/manage/AddRelativeDialog.test.jsx` (NEW) | test | component (RTL) | `frontend/src/pages/AdminLinkMembers.test.jsx` | exact |
| `frontend/src/components/manage/MemberCard.jsx` (NEW) | component | presentational | `frontend/src/pages/Dashboard.jsx` (user-row `Avatar`+`Chip`+`Typography` block) | role-match |
| `frontend/src/components/manage/MemberCard.test.jsx` (NEW) | test | component (RTL) | `frontend/src/pages/AdminLinkMembers.test.jsx` | role-match |
| `frontend/src/components/manage/AdminMemberTable.jsx` (NEW) | component | request-response (query + client pagination) | `frontend/src/pages/AdminLinkMembers.jsx` (fetch-list pattern) + `frontend/src/pages/Dashboard.jsx` (admin users list row) | role-match |
| `frontend/src/components/manage/AdminMemberTable.test.jsx` (NEW) | test | component (RTL) | `frontend/src/pages/AdminLinkMembers.test.jsx` | role-match |
| `frontend/src/App.jsx` (MODIFY) | route | request-response (client routing) | itself (existing route table) | exact |
| `frontend/src/pages/AdminLinkMembers.jsx` (MODIFY → redirect) | route | request-response | none needed — trivial `<Navigate>` swap, see Pattern below | n/a |

## Pattern Assignments

### `backend/src/services/familyMember.service.js` — `addChild` REL-06 guard (service, CRUD + transactional lock)

**Analogs:** `backend/src/resolvers/user.resolver.js` (`verifyEmail`'s `FOR UPDATE` lock, lines 160-198) and the same service file's own `setSpouse` (lines 71-80) and `computeEditableScope` (lines 108-160).

**Current `addChild` to modify** (`backend/src/services/familyMember.service.js:48-50`):
```javascript
export async function addChild(attrs, { transaction } = {}) {
  return models.FamilyMember.create(attrs, { transaction });
}
```

**Imports already present at top of file** (lines 1-2 — reuse, do not duplicate):
```javascript
import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../models/index.js';
```

**Caller-supplied-or-fresh-transaction convention to copy** (`setSpouse`, lines 71-80 — this is the exact pattern Pitfall 2/A3 says `addChild` must adopt):
```javascript
export async function setSpouse(memberAId, memberBId, { transaction } = {}) {
  // When a transaction is supplied by the caller, run directly against it --
  // never nest a second sequelize.transaction(...) inside an existing one.
  // Only wrap in a fresh transaction when no caller-supplied transaction
  // exists, preserving the pre-existing 2-arg-caller behavior unchanged.
  if (transaction) {
    return createOrFindSpouseRow(memberAId, memberBId, transaction);
  }
  return sequelize.transaction((t) => createOrFindSpouseRow(memberAId, memberBId, t));
}
```

**Row-lock pattern to copy** (`backend/src/resolvers/user.resolver.js:160-181`, `verifyEmail`'s single-ADMIN-slot lock — the only existing `FOR UPDATE` precedent in the codebase):
```javascript
// Verify-and-promote run inside a single transaction so token consumption and the single
// ADMIN-slot decision commit (or roll back) as one atomic unit. The admin-count read takes
// a locking FOR UPDATE read, so concurrent verifiers serialize on it — structurally
// guaranteeing at most one ADMIN rather than relying on statement-level autocommit timing.
const verifyAndPromote = () =>
  sequelize.transaction(async (t) => {
    const [affectedCount] = await models.User.update(
      { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null },
      { where: { id: user.id, emailVerificationToken: hashed }, individualHooks: true, transaction: t }
    );
    if (affectedCount === 0) throw new Error('The email verification token is invalid or has expired.');

    const [{ adminCount }] = await sequelize.query(
      "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE",
      { transaction: t, type: sequelize.QueryTypes.SELECT }
    );
    if (Number(adminCount) === 0) {
      await models.User.update({ role: 'ADMIN' }, { where: { id: user.id }, transaction: t });
    }
  });
```
Note: this raw-SQL `FOR UPDATE` locks a computed row, not an FK row — for REL-06, lock the actual parent `FamilyMember` row(s) via Sequelize's `lock` option instead (`models.FamilyMember.findAll({ where: { id: parentIds }, lock: t.LOCK.UPDATE, transaction: t })`), which is the ORM-level equivalent RESEARCH.md's Pattern 1 specifies — copy the *concurrency reasoning/comment style* from this block, not the raw-SQL mechanism.

**Either-parent scope-matching pattern to copy** (`computeEditableScope`, `familyMember.service.js:136-146` — same "shares EITHER motherId OR fatherId" `Op.or`/`flatMap` shape REL-06's dedup query needs, D-09):
```javascript
parentIds.length > 0
  ? models.FamilyMember.findAll({
      where: {
        [Op.and]: [
          { id: { [Op.ne]: memberId } },
          { [Op.or]: parentIds.flatMap((pid) => [{ motherId: pid }, { fatherId: pid }]) }
        ]
      },
      transaction
    })
  : Promise.resolve([])
```

**Resolver call sites that already route through `addChild` (no resolver change needed, D-11 satisfied by construction)** — `backend/src/resolvers/familyMember.resolver.js`:
- `addChild` mutation, line 144: `return addChild(attrs, { transaction: t });`
- `addSibling` mutation, line 191: `return addChild(attrs, { transaction: t });`
Both already pass `{ transaction: t }` from `models.User.sequelize.transaction(async (t) => { ... })` — confirms D-10 needs no resolver edits, only the service function.

**Error-throwing convention** (plain `Error` with actionable, user-facing text — matches every other resolver/service error in the codebase, e.g. `familyMember.resolver.js:170`):
```javascript
throw new Error('Add a parent first — siblings are derived from a shared parent.');
```
Apply the same style for REL-06's exact required copy (from 15-UI-SPEC.md / CONTEXT.md specifics):
```javascript
throw new Error(
  `A child named '${conflict.firstname}' already exists under ${sharedParent.fullname}. ` +
  'Pick a different name, or edit the existing member.'
);
```

**Full target implementation** — already fully worked out in `15-RESEARCH.md` §"Code Examples > REL-06 dedup guard — GREEN-state target implementation" (lines 549-604 of that file). Use it verbatim as the starting point; it already composes the three analogs above (transaction-or-fresh convention, row lock, either-parent `Op.or`).

---

### `backend/src/services/familyMember.dedup.test.js` (NEW test) and resolver test extensions

**Analog:** `backend/src/services/familyMember.scope.test.js` (service-level test, lines 1-20 shown below) for the file-level harness; `backend/src/resolvers/familyMember.addChild.test.js` (full file read) for the resolver-level integration test conventions.

**Service-test harness pattern to copy** (`familyMember.scope.test.js:1-20`):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { resetTables } from '../../test/helpers.js';
import { computeEditableScope } from './familyMember.service.js';

beforeEach(resetTables);

describe('computeEditableScope (PERM-05, REL-04)', () => {
  it('always includes self, even with no parents/spouse/children recorded', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Self', lastname: 'Doe', gender: 'Other' });
    const scope = await computeEditableScope(self.id);
    expect(scope.ids.has(self.id)).toBe(true);
    ...
  });
```
For `familyMember.dedup.test.js`, import `addChild` (not `computeEditableScope`) and call it directly with/without an explicit `{ transaction }`, per Pitfall 2's required test case.

**Resolver-test harness pattern to copy** (`familyMember.addChild.test.js:1-41`):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { setSpouse } from '../services/familyMember.service.js';
import { familyMemberTypeDefs } from '../schemas/familyMember.schema.js';

const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) {
      id firstname lastname
    }
  }
`;

beforeEach(resetTables);

describe('addChild (SC-4 primary target, D-01/D-02, PERM-01/PERM-02, REL-04)', () => {
  it('adds a new child to the acting member-user themselves with no otherParentId', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(ADD_CHILD_MUTATION, { memberId: String(self.id), role: 'MOTHER',
      newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' }, otherParentId: null }, actor);

    expect(errors).toBeUndefined();
    expect(data.addChild.firstname).toBe('Byron');
  });
```
Rejection-assertion pattern to copy for the new duplicate-name case (`familyMember.addChild.test.js:67-93`):
```javascript
const { data, errors } = await graphql(ADD_CHILD_MUTATION, { ... }, actor);
expect(errors[0].message).toBe('You may only reference relatives already within your editable scope.');
expect(data).toBeNull();
expect(await models.FamilyMember.count()).toBe(beforeCount); // no partial insert
```
Use the same `beforeCount`/`.toBe(beforeCount)` no-partial-insert assertion style for REL-06's rejection tests, and swap in the exact D-08/D-09 error copy.

**Concurrent-race test (D-10 proof) — no existing analog for `Promise.all` in this codebase; construct from the sequential pattern above:**
```javascript
const [resultA, resultB] = await Promise.allSettled([
  addChild({ firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id }),
  addChild({ firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id })
]);
// exactly one settles fulfilled, the other rejected with the REL-06 message
```
(RESEARCH.md Pitfall 1 explicitly flags that a *sequential* two-call test does not prove the race is closed — the new test must launch both calls concurrently via `Promise.all`/`Promise.allSettled`.)

**Test-harness helpers available (`backend/test/helpers.js`, full file read):**
```javascript
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') { ... }
export async function resetTables() { ... }
export async function createTestUser(overrides = {}) {
  return models.User.create({ name: 'Test User', email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!', role: 'USER', emailVerified: true, ...overrides });
}
```

---

### `frontend/src/pages/ManagePage.jsx` (NEW) — page, request-response + role branch

**Analogs:** `frontend/src/pages/AdminLinkMembers.jsx` (fetch/loading/error scaffold, full file read above) and `frontend/src/pages/Dashboard.jsx` (role branch + visual conventions, full file read above).

**Imports pattern to copy** (`AdminLinkMembers.jsx:1-16`):
```javascript
import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Avatar, Box, Button, MenuItem, Paper, Stack, TextField, Typography, CircularProgress,
} from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors, getInitials } from '../theme.js';
```
Add `useAuth` from `AuthContext.jsx` for the role branch (`Dashboard.jsx` does not use `useAuth` — it reads `dashboard.user` from its own query instead; `ManagePage` should follow whichever the planner picks, but `myEditableMembers`/`familyMember` queries need `user.role`/`user.familyMemberId`, available via `useAuth()` per `AuthContext.jsx:82-86`).

**Fetch-on-mount + loading/error scaffold to copy** (`AdminLinkMembers.jsx:198-227`, identical shape in `Dashboard.jsx:74-92`):
```javascript
const [pageLoading, setPageLoading] = useState(true);
const [pageError, setPageError] = useState('');

useEffect(() => {
  Promise.all([graphqlRequest(UNLINKED_USERS_QUERY), graphqlRequest(FAMILY_MEMBERS_QUERY)])
    .then(([unlinkedUsersData, familyMembersData]) => {
      setUnlinkedUsers(unlinkedUsersData.unlinkedUsers);
      setFamilyMembers(familyMembersData.familyMembers);
    })
    .catch((err) => setPageError(err.message))
    .finally(() => setPageLoading(false));
}, []);

if (pageLoading) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  );
}
if (pageError) return <Alert severity="error">{pageError}</Alert>;
```

**Role branch pattern to copy** (`Dashboard.jsx:94-96`):
```javascript
const { user, users, message } = dashboard;
const isAdmin = user.role === 'ADMIN';
```

**GraphQL query strings to define at module scope** (mirrors `AdminLinkMembers.jsx:18-34`'s tagged-template convention — one const per query/mutation, named `SCREAMING_SNAKE_CASE` with `_QUERY`/`_MUTATION` suffix):
```javascript
const MY_EDITABLE_MEMBERS_QUERY = `
  query MyEditableMembers {
    myEditableMembers {
      id firstname lastname fullname gender birthdate deathdate phone email address
      mother { id } father { id }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id }
    }
  }
`;
```
(Full field list and rationale: `15-RESEARCH.md` §"Code Examples > `myEditableMembers` query shape", lines 606-633.)

**Section heading/panel visual convention to copy** (`Dashboard.jsx:196-213`, `AdminLinkMembers.jsx:228-236` — `Paper` with `borderRadius:5`/`colors.line` border, `Typography variant="h5"` title + `body2` secondary subtitle):
```javascript
<Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
  <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
    <Typography variant="h5">Manage family</Typography>
    <Typography color="text.secondary" variant="body2">
      Add and edit the relatives you're connected to.
    </Typography>
  </Box>
  ...
</Paper>
```

---

### `frontend/src/App.jsx` (MODIFY) — route, request-response

**Analog:** itself — extend the existing route table in place, following its own established structure.

**Current file (full contents, 33 lines) to modify:**
```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLinkMembers from './pages/AdminLinkMembers.jsx';
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
...
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        ...
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<Dashboard />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="admin/link-members" element={<AdminLinkMembers />} />
        </Route>
      </Route>
    </Routes>
  );
}
```
**Target shape:** add `import ManagePage from './pages/ManagePage.jsx';`, add `<Route path="manage" element={<ManagePage />} />` inside the existing plain `<Route element={<ProtectedRoute />}>` block (D-12 — no new `allowedRoles`, since `/manage` is reachable by both linked members and admins, exactly like `dashboard`'s gate), and replace the `admin/link-members` route's element with `<Navigate to="/manage" replace />` (per RESEARCH.md's "Recommended Project Structure": `AdminLinkMembers.jsx` becomes a thin redirect, not a deletion — do not remove the file if `AdminLinkMembers.test.jsx`'s remaining assertions are re-homed into `ManagePage.test.jsx` first).

---

### `frontend/src/components/ProtectedRoute.jsx` — UNCHANGED (reused verbatim, D-12)

**Full file (21 lines) — no modification needed:**
```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ allowedRoles }) {
  const { loading, user } = useAuth();
  if (loading) { return (<Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>); }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.familyMemberId && user.role !== 'ADMIN') return <Navigate to="/pending" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
```
This already satisfies MNG-04 exactly (linked member OR admin → pass; else → `/pending`). Just wrap `/manage` in this component with no `allowedRoles` prop.

---

### `frontend/src/components/manage/AddRelativeDialog.jsx` (NEW) — component, request-response

**Analog:** `frontend/src/pages/AdminLinkMembers.jsx`'s `UnlinkedUserRow` inner component (lines 48-196 of that file) — this is the exact "mode toggle between Autocomplete-pick and TextField-create, submit via `graphqlRequest`, catch into local `error` state" pattern D-04/D-05 need, parameterized instead by relationship type.

**Mode-toggle + form-state pattern to copy** (`AdminLinkMembers.jsx:48-57`):
```javascript
function UnlinkedUserRow({ user, familyMembers, onLinked }) {
  const [mode, setMode] = useState('pick');
  const [selectedMember, setSelectedMember] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };
```

**Submit handler pattern to copy** (`AdminLinkMembers.jsx:76-91`):
```javascript
const handleCreateAndLink = async () => {
  setError('');
  setSubmitting(true);
  try {
    await graphqlRequest(LINK_USER_TO_MEMBER_MUTATION, { userId: user.id, memberId: undefined, newMember: form });
    onLinked(user.id);
  } catch (err) {
    setError(err.message);
  } finally {
    setSubmitting(false);
  }
};
```
For `AddRelativeDialog`, swap the mutation per relationship type (`ADD_PARENT_MUTATION`/`ADD_SPOUSE_MUTATION`/`ADD_CHILD_MUTATION`/`ADD_SIBLING_MUTATION` — exact SDL in `15-RESEARCH.md` lines 665-689) and close the dialog / refresh the panel on success instead of filtering a row out of a list.

**`EMPTY_FORM` shape to copy verbatim** (`AdminLinkMembers.jsx:36-46` — matches `NewFamilyMemberInput` exactly):
```javascript
const EMPTY_FORM = {
  firstname: '', lastname: '', gender: '', mothersname: '',
  email: '', birthdate: '', deathdate: '', phone: '', address: '',
};
```

**Create-form field layout to copy verbatim** (`AdminLinkMembers.jsx:129-172` — three `TextField` rows: name+gender, contact, dates+mothersname):
```jsx
<Stack spacing={2}>
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
    <TextField label="First name" required value={form.firstname} onChange={handleFormChange('firstname')} fullWidth />
    <TextField label="Last name" required value={form.lastname} onChange={handleFormChange('lastname')} fullWidth />
    <TextField select label="Gender" required value={form.gender} onChange={handleFormChange('gender')} fullWidth>
      <MenuItem value="Male">Male</MenuItem>
      <MenuItem value="Female">Female</MenuItem>
      <MenuItem value="Other">Other</MenuItem>
    </TextField>
  </Stack>
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
    <TextField label="Email" value={form.email} onChange={handleFormChange('email')} fullWidth />
    <TextField label="Phone" value={form.phone} onChange={handleFormChange('phone')} fullWidth />
    <TextField label="Address" value={form.address} onChange={handleFormChange('address')} fullWidth />
  </Stack>
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
    <TextField label="Birthdate" value={form.birthdate} onChange={handleFormChange('birthdate')} fullWidth />
    <TextField label="Deathdate" value={form.deathdate} onChange={handleFormChange('deathdate')} fullWidth />
    <TextField label="Mother's name" value={form.mothersname} onChange={handleFormChange('mothersname')} fullWidth />
  </Stack>
</Stack>
```
For **Add parent**, add a mother/father role `<TextField select>` (same `MenuItem` shape, values `MOTHER`/`FATHER`) — no picker. For **Add child**, add the secondary in-scope Autocomplete below (see next pattern) for `otherParentId`. For **Add sibling**, no extra field — parents are derived server-side.

**In-scope Autocomplete picker to copy verbatim** (`AdminLinkMembers.jsx:113-120`, already cited correctly in RESEARCH.md Pattern 3):
```jsx
<Autocomplete
  options={inScopeMembers}                 // filtered to scope.ids, not all members (Phase 14 D-02)
  getOptionLabel={(member) => member.fullname}
  value={selectedOtherParent}
  onChange={(_event, value) => setSelectedOtherParent(value)}
  sx={{ minWidth: 260, flexGrow: 1 }}
  renderInput={(params) => <TextField {...params} label="Other parent (optional)" />}
/>
```

**Submit-button disabled/loading-label pattern to copy** (`AdminLinkMembers.jsx:174-180`):
```jsx
<Button variant="contained" disabled={!form.firstname || !form.lastname || !form.gender || submitting} onClick={handleCreateAndLink}>
  {submitting ? 'Creating…' : 'Create & link'}
</Button>
```
Copy label text is UI-SPEC-mandated: **"Add member"** for the create-new path (not "Create & link" — that wording is reserved for the admin account-link path per the Copywriting Contract).

---

### `frontend/src/components/manage/AddRelativeDialog.test.jsx`, `RelationshipGroupedPanel.test.jsx`, `MemberCard.test.jsx`, `AdminMemberTable.test.jsx` (NEW) and `ManagePage.test.jsx` (NEW)

**Analog:** `frontend/src/pages/AdminLinkMembers.test.jsx` (full file read above, 156 lines) — the complete RTL/`vi.mock`/`userEvent` template for every one of these new component tests.

**Mock + render scaffold to copy verbatim** (lines 1-43):
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminLinkMembers from './AdminLinkMembers.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));
import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><AdminLinkMembers /></MemoryRouter>);
}
```
For `ManagePage.test.jsx`, additionally mock `useAuth`/`AuthContext` (or wrap in a real `AuthProvider` with a pre-seeded `localStorage` token + mocked `graphqlRequest` for `ME_QUERY`) to control `user.role`/`user.familyMemberId` per test case (member vs. admin branch).

**Sequential mock-resolution + assertion pattern to copy** (lines 56-82):
```javascript
graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS });
graphqlRequest.mockResolvedValueOnce({ linkUserToMember: { id: '1', familyMemberId: '10' } });

renderPage();
await screen.findByText('Ada Lovelace');

const autocomplete = screen.getByLabelText('Family member', { exact: false });
await userEvent.click(autocomplete);
await userEvent.type(autocomplete, 'John');
const option = await screen.findByText('John Doe');
await userEvent.click(option);
await userEvent.click(screen.getByRole('button', { name: 'Link' }));

await waitFor(() => {
  expect(graphqlRequest).toHaveBeenCalledWith(LINK_USER_TO_MEMBER_MUTATION, { userId: '1', memberId: '10', newMember: undefined });
});
```

**Error-alert assertion pattern to copy** (lines 124-145):
```javascript
graphqlRequest.mockRejectedValueOnce(new Error('This family member is already linked to an account.'));
...
expect(await screen.findByRole('alert')).toHaveTextContent('This family member is already linked to an account.');
```
Reuse directly for the REL-06 dedup error surfacing in `AddRelativeDialog.test.jsx` (assert the exact D-08/D-09 copy renders in an `Alert`).

**Empty-state assertion pattern to copy** (lines 147-154):
```javascript
graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
...
expect(await screen.findByText('No accounts are waiting to be linked.')).toBeInTheDocument();
```
Reuse for `RelationshipGroupedPanel.test.jsx`'s "Just you so far." and "No siblings yet…" empty states, and `AdminMemberTable.test.jsx`'s "No members match your search."

---

### `frontend/src/components/manage/MemberCard.jsx` (NEW) — presentational, D-06 read-only branch

**Analog:** `frontend/src/pages/Dashboard.jsx`'s per-user row block (lines 216-256) and `AdminLinkMembers.jsx`'s row header (lines 93-107) — both show the `Avatar`+name+meta+`Chip` card shape this component needs.

**Avatar/name/meta row to copy** (`AdminLinkMembers.jsx:93-107`):
```jsx
<Stack direction="row" alignItems="center" spacing={2}>
  <Avatar sx={{ width: 42, height: 42, bgcolor: '#eef1f8', color: colors.slate }}>
    {getInitials(user.name)}
  </Avatar>
  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
    <Typography sx={{ fontWeight: 600 }} noWrap>{user.name}</Typography>
    <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>
  </Box>
</Stack>
```
(Use `member.fullname` in place of `user.name`; the 42×42 Avatar size is the UI-SPEC's locked "row Avatar" standard.)

**Role/status `Chip` styling to copy** (`Dashboard.jsx:248-254`):
```jsx
<Chip label={u.role} size="small" variant={u.role === 'ADMIN' ? 'filled' : 'outlined'} color={u.role === 'ADMIN' ? 'secondary' : 'default'} sx={{ minWidth: 64 }} />
```
Use the same `Chip` primitive for the D-02 "Derived" sibling affordance and the D-06 lock indicator — both are informational, non-interactive chips per the UI-SPEC Color section ("Small informational Chips ... using `colors.gradientSoft` bg + `colors.primaryDark` text").

**D-06 read-only branch — no existing precedent for conditional-button-omission in this codebase; construct directly from the resolver's own gating logic** (`familyMember.resolver.js:220`, `editMember`'s server-side check the UI must mirror structurally):
```javascript
if (!isAdmin && target.linkedUser && target.linkedUser.id !== user.id) {
  throw new Error('This member manages their own profile and cannot be edited by others.');
}
```
UI equivalent (component-side branch, no server call attempted):
```jsx
const isLocked = !isAdmin && member.linkedUser && member.linkedUser.id !== self.id;
{!isLocked && <Button variant="text" onClick={...}>Edit</Button>}
{isLocked && <Typography variant="body2" color="text.secondary">Manages their own profile.</Typography>}
```

---

### `frontend/src/components/manage/AdminMemberTable.jsx` (NEW) — component, request-response + client pagination

**Analog:** `frontend/src/pages/AdminLinkMembers.jsx`'s fetch-list pattern (lines 24-28, 204-212) for the `familyMembers` query shape and loading scaffold; no existing `Table`/`TablePagination` precedent in the codebase — this is genuinely new MUI composition, per RESEARCH.md Open Question 2 ("client-side `TablePagination` over the full unpaginated result" is the recommended default).

**Query string convention to copy** (`AdminLinkMembers.jsx:24-28`):
```javascript
const FAMILY_MEMBERS_QUERY = `
  query FamilyMembers {
    familyMembers { id firstname lastname fullname }
  }
`;
```
Extend field selection per RESEARCH.md's "Admin table + focus query shape" (lines 637-663 of `15-RESEARCH.md`) to include `gender` and `linkedUser { id name email }` for the admin table's columns.

---

## Shared Patterns

### Authed GraphQL call + error surfacing
**Source:** `frontend/src/api/graphqlClient.js:23-36`
**Apply to:** Every new frontend component that calls `graphqlRequest` (`ManagePage`, `RelationshipGroupedPanel`, `AddRelativeDialog`, `AdminMemberTable`).
```javascript
export async function graphqlRequest(query, variables = {}) {
  try {
    const response = await graphqlClient.post('', { query, variables });
    if (response.data.errors?.length) {
      throw new Error(response.data.errors.map((error) => error.message).join('\n'));
    }
    return response.data.data;
  } catch (error) {
    if (error.message === 'Network Error') {
      throw new Error('Network Error: the frontend could not reach the GraphQL API. Check that the backend is running and that VITE_API_URL or VITE_PROXY_TARGET points to it.');
    }
    throw error;
  }
}
```
Every mutation call site should wrap in `try { await graphqlRequest(...) } catch (err) { setError(err.message); } finally { setSubmitting(false); }` — the established pattern in `AdminLinkMembers.jsx:59-74`.

### Route gating (MNG-04)
**Source:** `frontend/src/components/ProtectedRoute.jsx` (full file, unchanged)
**Apply to:** `/manage` route registration in `App.jsx` — wrap in the plain (no `allowedRoles`) `<ProtectedRoute />`, identical to how `dashboard` is wrapped today (`App.jsx:24-26`).

### Server-side authorization (defense in depth, never trust the client gate)
**Source:** `backend/src/utils/auth.js` (`requireFamilyAccess`, `requireAdmin` — imported and called at the top of every resolver in `familyMember.resolver.js`, e.g. line 1, 18, 25, 45)
**Apply to:** No new resolvers this phase, but every new UI component must call only the existing, already-guarded mutations/queries — never assume the client-side `ProtectedRoute` redirect is sufficient (RESEARCH.md's Architectural Responsibility Map: "the client gate is cosmetic, not the security boundary").

### `sanitizeNewMember` — blank-optional-field normalization
**Source:** `backend/src/resolvers/user.resolver.js:28-38`
**Apply to:** No new call sites needed — every existing `addParent`/`addSpouse`/`addChild`/`addSibling`/`editMember` resolver already calls it on `newMember`/`fields` before writing (`familyMember.resolver.js:67,93,141,187,224`). The REL-06 guard must do its OWN `.trim().toLowerCase()` normalization on `firstname` inside `addChild` rather than assume the caller already did it (Pitfall 3) — belt-and-suspenders, not a replacement for `sanitizeNewMember`.

### Design tokens (colors/spacing/typography)
**Source:** `frontend/src/theme.js:7-30` (the `colors` export) — `colors.line` (`#e6e8f0`, borders), `colors.slate` (`#64748b`, muted text/avatars), `colors.gradient`/`colors.gradientSoft`/`colors.primaryDark` (accent CTA + informational chips), `colors.error` (`#ef4444`, destructive-only).
**Apply to:** Every new `/manage` component — `borderRadius: 5` for panels/cards (`Paper` in `AdminLinkMembers.jsx:237`, `Dashboard.jsx:198`), `border: `1px solid ${colors.line}``, 42×42 `Avatar` for member-card rows, `Chip` with `colors.gradientSoft` bg for informational badges (Dashboard pattern, line 207-210). Full token table already locked in `15-UI-SPEC.md`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/src/components/manage/AdminMemberTable.jsx` (MUI `Table`/`TablePagination` specifically) | component | request-response + client pagination | No existing page in the codebase uses MUI `Table`/`TablePagination` — every existing list (`Dashboard`'s user list, `AdminLinkMembers`'s unlinked-user list) uses a `Stack` of rows with no pagination. The fetch/loading/query-string conventions are still reused from `AdminLinkMembers.jsx`; only the `Table`/`TablePagination` primitive itself is net-new MUI composition (RESEARCH.md Open Question 2 confirms this is expected — client-side pagination, no backend change). |
| REL-06 `SELECT ... FOR UPDATE` on the shared-parent `FamilyMember` row (Sequelize `lock` option specifically, not raw SQL) | service | transactional lock | The one existing `FOR UPDATE` precedent (`user.resolver.js:179`) uses a raw `sequelize.query(...)` string against a computed aggregate row, not Sequelize's `lock: transaction.LOCK.UPDATE` option against an actual model row by id. The concurrency *reasoning* and *comment style* transfer directly; the exact `lock` option mechanics are new to this codebase (fully specified in `15-RESEARCH.md`'s Pattern 1 and Code Examples sections). |

## Metadata

**Analog search scope:** `backend/src/services/`, `backend/src/resolvers/`, `backend/src/schemas/`, `backend/src/models/`, `backend/test/`, `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/context/`, `frontend/src/api/`, `frontend/src/theme.js`
**Files scanned:** 13 target files against 11 read analog source files (`AdminLinkMembers.jsx`+`.test.jsx`, `familyMember.service.js`, `familyMember.resolver.js`, `familyMember.schema.js`, `user.resolver.js`, `familyMember.addChild.test.js`, `familyMember.scope.test.js`, `test/helpers.js`, `models/index.js`, `App.jsx`, `ProtectedRoute.jsx`, `Dashboard.jsx`, `AuthContext.jsx`, `graphqlClient.js`, `theme.js`)
**Pattern extraction date:** 2026-07-23
