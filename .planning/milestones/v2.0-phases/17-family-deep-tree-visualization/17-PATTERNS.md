# Phase 17: /family Deep Tree Visualization - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 12 (create/modify)
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `frontend/src/pages/FamilyTreePage.jsx` | page/route component | request-response (single flat fetch, in-memory assembly) | `frontend/src/pages/ManagePage.jsx` | role-match (same fetch-on-mount/loading/error shape; no dialogs/mutations) |
| `frontend/src/components/family/familyTree.assembly.js` | utility (pure transform) | transform | *(none — genuinely new capability)* | no analog |
| `frontend/src/components/family/familyTree.assembly.test.js` | test (unit, DOM-free) | transform | `backend/test/familyTreeFactory.js` (fixture-shape precedent) + Vitest `describe/it` conventions across the repo | partial — process precedent only, no client-side pure-fn test precedent exists |
| `frontend/src/components/family/FamilyTreeCanvas.jsx` | component (canvas/container) | render + event-driven (pan/zoom/collapse) | `frontend/src/components/manage/RelationshipGroupedPanel.jsx` (grouped-render/composition shape) | partial — no existing canvas/graph component; composition/props pattern only |
| `frontend/src/components/family/FamilyTreeCanvas.test.jsx` | test (render-smoke) | render-smoke | `frontend/src/pages/ManagePage.test.jsx` (render + mocked-fetch pattern) | role-match (RTL render/assert shape); canvas-specific `mockReactFlow()` setup is net-new per RESEARCH Pitfall 2 |
| `frontend/src/components/family/MemberNode.jsx` | component (presentational, custom xyflow node) | render | `frontend/src/components/manage/MemberCard.jsx` + `frontend/src/components/manage/MemberAvatarImage.jsx` | role-match (avatar + name + secondary line composition) |
| `frontend/src/components/family/UnionNode.jsx` | component (presentational, synthetic node) | render | *(none — genuinely new capability)* | no analog |
| `frontend/src/components/family/MemberDetailPanel.jsx` | component (read-only popover/panel) | render (in-memory data, no fetch) | `frontend/src/components/manage/RelationshipGroupedPanel.jsx` (relationship-grouped display) | role-match (grouped Parents/Spouse/Children/Siblings rendering, minus edit affordances) |
| `frontend/src/App.jsx` (modify) | route registration | request-response (client routing) | itself — existing `dashboard`/`manage` route block | exact (insertion point already proven) |
| `frontend/src/components/AppLayout.jsx` (modify) | nav | render | itself — existing `Dashboard` nav `Button` | exact |
| `backend/src/resolvers/familyMember.resolver.js` (modify) | resolver (guard change) | request-response | itself — the `familyMember` (singular) query on the same file, already on `requireFamilyAccess` | exact (one-line diff, existing pattern in the same file) |
| `backend/src/resolvers/familyMember.resolver.test.js` (modify) | test (integration, adversarial) | request-response | itself — the `familyMember` singular-query adversarial/success test block above `familyMembers (list)` | exact (mirror the 3-case shape: unlinked-rejected / linked-succeeds / admin-carve-out) |

## Pattern Assignments

### `frontend/src/pages/FamilyTreePage.jsx` (page, request-response)

**Analog:** `frontend/src/pages/ManagePage.jsx`

**Imports pattern** (`ManagePage.jsx` lines 1-26):
```javascript
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
```
`FamilyTreePage.jsx` follows this exact relative-import convention (no aliases anywhere in the repo) and additionally imports `ReactFlowProvider` from `@xyflow/react` per RESEARCH's recommended structure, plus its own `FamilyTreeCanvas.jsx`.

**Query pattern — single flat query, thin `{id}` refs** (`ManagePage.jsx` lines 28-43, adapted per RESEARCH Pattern 1):
```javascript
const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersTable {
    familyMembers { id firstname lastname fullname gender photoUrl linkedUser { id name email } }
  }
`;
```
Copy this SCREAMING_SNAKE_CASE `_QUERY` constant convention verbatim for the new `FAMILY_TREE_QUERY`, but select `mother { id } father { id } spouses { id } children { id }` and the display fields (`birthdate deathdate photoUrl gender`) — **do not** request `linkedUser` (RESEARCH Pitfall 6 — the tree UI has no use for it and requesting it invites a later leak).

**Fetch-on-mount + loading/error state (core pattern)** (`ManagePage.jsx` `MemberBranch`, lines 124-176):
```javascript
const [pageLoading, setPageLoading] = useState(true);
const [pageError, setPageError] = useState('');

const refetch = useCallback(() => {
  setPageLoading(true);
  return graphqlRequest(MY_EDITABLE_MEMBERS_QUERY)
    .then((data) => { /* set state */ })
    .catch((err) => setPageError(err.message))
    .finally(() => setPageLoading(false));
}, [user.familyMemberId]);

useEffect(() => { refetch(); }, [refetch]);

if (pageLoading) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  );
}
if (pageError) return <Alert severity="error">{pageError}</Alert>;
```
Copy this shape verbatim for `FamilyTreePage.jsx`'s fetch; per UI-SPEC, swap the loading text region to include **"Building your family tree…"** copy and the error region to the UI-SPEC's exact **"We couldn't load your family tree." / "Check your connection and try again." / "Retry"** contract (the `Alert` + a retry `Button` calling `refetch` again — no existing page has a retry button, so compose one from `Button onClick={refetch}` next to the `Alert`).

**Auth/user access pattern** (`ManagePage.jsx` line 622, `useAuth()`):
```javascript
const { user } = useAuth();
```
`FamilyTreePage.jsx` needs `user.familyMemberId` (the "viewer" node id for jump-to-me/D-02) exactly as `ManagePage.jsx` uses `user.familyMemberId` to find `self` in `MemberBranch` (line 141): `const self = fetchedRows.find((row) => row.id === user.familyMemberId);`

**Empty-state pattern** — no existing page has a true "empty" branch (ManagePage always has ≥1 row = the caller). Compose from UI-SPEC copy directly (`Typography` heading + body + a `RouterLink` to `/manage`, styled like `Pending.jsx`'s `AuthShell`-wrapped body text, though `FamilyTreePage` does not use `AuthShell` since it's a full canvas page, not an auth-flow page).

---

### `frontend/src/components/family/familyTree.assembly.js` (utility, transform — NO analog)

No existing pure-JS graph-assembly module exists in this codebase; this is genuinely new capability (RESEARCH explicitly calls this out as "the only genuinely novel code this phase needs to write"). Build directly from RESEARCH's Architecture Patterns 1-3 code examples (apex detection, generation ranking via BFS/Kahn, union-node synthesis with `minlen:0`/`minlen:1` edges, initial-expand-set computation). Follow the project's **named-export** convention (`export function buildForest(...)`, `export function rankGenerations(...)`, etc. — matching `backend/src/utils/auth.js`'s `export function` style, not a default export, since this is a utility module not a component).

**Style conventions to match** (`backend/src/utils/auth.js` lines 34-47, representative of the whole codebase's function style):
```javascript
export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
2-space indent, single quotes, semicolons, guard-clause early returns — apply identically to `familyTree.assembly.js`'s pure functions.

---

### `frontend/src/components/family/familyTree.assembly.test.js` (unit test, DOM-free)

**Analog:** RESEARCH.md's own Code Examples section already supplies the exact shape (validated against this project's Vitest conventions); no existing frontend `*.js` pure-logic test exists to copy from directly (all existing frontend tests are `*.test.jsx` component tests), but the **describe/it/expect structure** matches every backend unit test, e.g. `backend/src/utils/auth.test.js` conventions and RESEARCH's own worked example:
```javascript
import { describe, it, expect } from 'vitest';
import { buildForest } from './familyTree.assembly.js';

describe('buildForest', () => {
  it('assigns generation 0 to apex ancestors (no mother, no father)', () => {
    const flat = [{ id: '1', mother: null, father: null, spouses: [], children: [] }];
    const { generations } = buildForest(flat);
    expect(generations.get('1')).toBe(0);
  });
});
```
**Fixture-generation precedent** (reuse the *shape*, not the file — this is backend-only, cannot be imported into frontend): `backend/test/familyTreeFactory.js`'s `buildGenerationFixture({ depth, childrenPerNode })` demonstrates the project's convention for a parameterized depth/breadth fixture generator; write an equivalent plain-JS (no Sequelize) generator colocated in the test file or a sibling `familyTree.fixtures.js` for the ~10-23 generation realistic depth case QUAL-02/SC-1 need.

---

### `frontend/src/components/family/FamilyTreeCanvas.jsx` (component, canvas/container)

No existing xyflow/canvas component exists — this is the net-new library-integration surface (SC-1 spike subject). Follow RESEARCH's Pattern 2-4 code examples verbatim for the dagre layout call, `node.hidden` collapse toggling, and `useReactFlow()` jump-to-me/search. For **composition/props shape**, follow the established "parent passes scope + callback props down, child renders + calls back" convention seen in:

**Composition pattern** (`RelationshipGroupedPanel.jsx` lines 49-58):
```javascript
export default function RelationshipGroupedPanel({
  scope,
  isAdmin,
  actingUserId,
  onAddRelative,
  onEdit,
  onDelete,
  onPickPhoto,
  onRemovePhoto
}) {
```
`FamilyTreeCanvas.jsx` should take `{ nodes, edges, viewerId, onNodeClick }`-shaped props from `FamilyTreePage.jsx`, mirroring this destructured-props-object convention (project-wide: no prop-types, no TypeScript, just descriptive prop names).

**Mandatory stylesheet import (RESEARCH Pitfall 5, load-bearing):**
```javascript
import '@xyflow/react/dist/style.css';
```
Must be imported at the top of this file or it will not be caught by any existing lint/test — nodes will render at `(0,0)` silently.

---

### `frontend/src/components/family/FamilyTreeCanvas.test.jsx` (render-smoke test)

**Analog:** `frontend/src/pages/ManagePage.test.jsx` for the RTL render + mocked-`graphqlRequest` shape (lines 1-26 mock setup, `beforeEach` pattern), plus RESEARCH's own `mockReactFlow()` helper for the jsdom/xyflow-specific gap this codebase has never needed before.

**Mock setup pattern** (`ManagePage.test.jsx` lines 8-25):
```javascript
const useAuthMock = vi.fn();
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER', familyMemberId: '1' }, loading: false });
});
```
Copy this exact `vi.mock` + `beforeEach` reset shape for `FamilyTreeCanvas.test.jsx` / `FamilyTreePage.test.jsx`.

**xyflow-specific jsdom setup (net new, RESEARCH Pitfall 2 — colocated, NOT global per its own warning):**
```javascript
class MockResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe(target) { setTimeout(() => this.callback([{ target }], this), 0); }
  unobserve() {}
  disconnect() {}
}
export function mockReactFlow() {
  global.ResizeObserver = MockResizeObserver;
  global.DOMMatrixReadOnly = class {
    constructor(transform) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
      this.m22 = scale !== undefined ? +scale : 1;
    }
  };
  Object.defineProperties(global.HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat(this.style.height) || 1; } },
    offsetWidth: { get() { return parseFloat(this.style.width) || 1; } }
  });
  global.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
}
```
Call once at module scope (or `beforeEach`) in this test file only — do NOT add to `frontend/test/setup.js` (that file is global to every test in the suite; polluting `HTMLElement.prototype` globally is explicitly warned against).

**What NOT to test (RESEARCH Pitfall 3):** drag-to-pan/gesture simulation — `/family` ships `nodesDraggable={false}` by product requirement (D-08), so test `onNodeClick` and programmatic `fitView`/`setCenter` calls (plain function calls) instead of simulated pointer drags.

---

### `frontend/src/components/family/MemberNode.jsx` (component, presentational)

**Analog:** `frontend/src/components/manage/MemberAvatarImage.jsx` (avatar reuse, D-07) + `frontend/src/components/manage/MemberCard.jsx` (name/label layout convention).

**Avatar reuse pattern** (`MemberAvatarImage.jsx` lines 61-81 — the fallback branch is the load-bearing part for tree nodes, most of which won't have photos loaded eagerly):
```javascript
if (!member.photoUrl) {
  return (
    <Avatar alt={member.fullname} sx={{ width: 42, height: 42, bgcolor: '#eef1f8', color: colors.slate }}>
      <PersonRoundedIcon aria-hidden="true" />
    </Avatar>
  );
}
```
Import `MemberAvatarImage` directly (`import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';`) — do not reimplement the blob-fetch/object-URL lifecycle; D-07 explicitly mandates reuse.

**Name + secondary-line layout pattern** (`MemberCard.jsx` lines 106-120):
```javascript
<Box sx={{ flexGrow: 1, minWidth: 0 }}>
  <Stack direction="row" alignItems="center" spacing={1}>
    <Typography sx={{ fontWeight: 600 }} noWrap>
      {member.fullname}
    </Typography>
  </Stack>
</Box>
```
Adapt for the node card: name (14px/600 per UI-SPEC) + a second `Typography` line for birth–death years (12px/400, muted `colors.slate`) + the gender icon (net-new — `MaleRounded`/`FemaleRounded`/`TransgenderRounded` from `@mui/icons-material`, each with `aria-label` per D-09b, UI-SPEC Color section). The **viewer's-own-node highlight ring + "You" chip** (D-09a) has a direct precedent in `MemberCard.jsx`'s `Chip` usage (line 112): `<Chip label="Derived" size="small" sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }} />` — reuse this `Chip` pattern with `label="You"` instead.

---

### `frontend/src/components/family/UnionNode.jsx` (component, presentational — NO analog)

No synthetic/non-person node exists anywhere in the codebase. Build as a minimal `24×24px` xyflow custom node type per RESEARCH Pattern 2's `UNION_W`/`UNION_H` constants — no MUI component composition needed beyond a small styled `<div>`/`<Box>`; exact visual (dot, small connector shape) is spike-driven per D-12.

---

### `frontend/src/components/family/MemberDetailPanel.jsx` (component, read-only popover)

**Analog:** `frontend/src/components/manage/RelationshipGroupedPanel.jsx` (relationship-grouped display structure), reading from already-in-memory data (RESEARCH anti-pattern: no new fetch on click).

**Grouped-relationship rendering pattern** (`RelationshipGroupedPanel.jsx` lines 49-80, the `self` + `parents`/`spouses`/`children`/`siblings` destructure and per-section `Typography variant="h6"` headings):
```javascript
export default function RelationshipGroupedPanel({ scope, isAdmin, actingUserId, ... }) {
  const { self, parents, spouses, children, siblings } = scope;
  return (
    <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${colors.line}` }} />}>
        <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
          <Typography variant="h6">You</Typography>
          ...
```
`MemberDetailPanel.jsx` reuses this exact section/heading/divider shape for its Parents/Spouse/Children/Siblings groups (per UI-SPEC's Detail panel contract), but strips every edit affordance (`onEdit`, `onDelete`, `onPickPhoto`, `onRemovePhoto` props do not exist here — D-08, read-only). Render inside a MUI `Popover` or `Drawer` (project has no existing side-panel/popover component to copy — compose from stock MUI `Popover`/`Drawer` + `IconButton` close button, matching the `Dialog`/`DialogTitle`/`DialogContent` compositional style already used for confirm dialogs in `ManagePage.jsx` lines 227-245).

**Missing-dates / empty-relationship copy (UI-SPEC-driven, no code analog needed — literal strings):** `"Dates unknown"`, `"No recorded {parents/spouse/children/siblings}"` — render conditionally per UI-SPEC's Copywriting Contract.

---

### `frontend/src/App.jsx` (route registration, modify)

**Analog:** itself — the existing `dashboard`/`manage` route block (lines 24-27, exact insertion point per CONTEXT D-15 and RESEARCH Code Examples):
```jsx
<Route element={<ProtectedRoute />}>
  <Route path="dashboard" element={<Dashboard />} />
  <Route path="manage" element={<ManagePage />} />
</Route>
```
Add `<Route path="family" element={<FamilyTreePage />} />` inside this same block (no `allowedRoles` — D-15 reuses `<ProtectedRoute>` verbatim), plus the corresponding `import FamilyTreePage from './pages/FamilyTreePage.jsx';` alongside the other page imports (lines 4-11), maintaining alphabetical-by-import-path-ish grouping already visible in the file.

---

### `frontend/src/components/AppLayout.jsx` (nav, modify)

**Analog:** itself — the existing `Dashboard` nav `Button` (lines 37-43):
```jsx
<Button
  component={RouterLink}
  to="/dashboard"
  sx={{ color: colors.slate, fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
>
  Dashboard
</Button>
```
Add a sibling `Button` with `to="/family"` and label `"Family tree"` (or similar) in the same `Stack direction="row"` (lines 36-59), matching the `sx` styling exactly. Placement is CONTEXT's own noted open integration point ("planning to confirm placement") — put it adjacent to Dashboard since both are always-visible authenticated nav items.

---

### `backend/src/resolvers/familyMember.resolver.js` (resolver, modify — D-13)

**Analog:** itself — the `familyMember` (singular) query in the **same file**, already on `requireFamilyAccess` (lines 17-19):
```javascript
familyMember: async (_parent, { id }, { models, user }) => {
  requireFamilyAccess(user);
  return models.FamilyMember.findByPk(id);
},
```
Change `familyMembers` (lines 13-16) from:
```javascript
familyMembers: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
},
```
to:
```javascript
familyMembers: async (_parent, _args, { models, user }) => {
  requireFamilyAccess(user);
  return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
},
```
`requireFamilyAccess` is already imported at line 1 (`import { requireAdmin, requireFamilyAccess } from '../utils/auth.js';`) — no import change needed. **Do not touch** the `FamilyMember.linkedUser` field resolver (lines 289-294) — it already self-gates independently (RESEARCH Pitfall 6) and needs no change, only a regression test confirming it still gates post-D-13.

---

### `backend/src/resolvers/familyMember.resolver.test.js` (test, modify — Pitfall 1)

**Analog:** itself — the `familyMember` (singular) adversarial/success/admin-carve-out 3-test block directly above `familyMembers (list)` (lines 25-56), which already exercises exactly the three cases the updated `familyMembers (list)` describe-block needs:
```javascript
describe('familyMember', () => {
  it('rejects a verified-but-unlinked USER calling directly (LOCKED adversarial test, SC5)', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const user = await createTestUser({ role: 'USER', familyMemberId: null });
    const { data, errors } = await graphql(FAMILY_MEMBER_QUERY, { id: member.id }, user);
    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
    expect(data.familyMember).toBeNull();
  });

  it('succeeds for a linked USER', async () => { /* ... */ });
  it('succeeds for an ADMIN with familyMemberId: null (carve-out, ACC-03)', async () => { /* ... */ });
});
```
**Required change to `familyMembers (list)`** (currently lines 58-79): the existing `'rejects a non-admin caller'` test (line 59-66) asserts the OLD message `'Admin access is required.'` for a `USER, familyMemberId: null` caller — per RESEARCH Pitfall 1, this must be updated (red-green-refactor, not "fixed back"):
1. Rename/update the existing test to assert the NEW message for the still-rejected case: an **unlinked** `USER` (`familyMemberId: null`) still gets rejected, but now with `'Your account is not yet linked to a family member.'` (mirroring `familyMember` singular's own test above).
2. Add a new case: a **linked** `USER` (`familyMemberId: <some id>`) now **succeeds** (mirroring `familyMember` singular's `'succeeds for a linked USER'` test).
3. Keep the existing `'returns all FamilyMember rows...'` admin-success test (lines 68-78) unchanged.
4. Add a regression test per D-14/Pitfall 6: a linked non-admin querying `familyMembers { ... linkedUser { email } }` for a member that is NOT themselves gets `linkedUser: null` (proves the field-level gate in `FamilyMember.linkedUser` is unaffected by the guard relaxation).

**Query-count/N+1 regression precedent** (`backend/src/services/familyMember.queryCount.test.js` lines 12-24, `countQueries` helper) — if the plan adds a flat-query N+1 regression test for the tree's actual `mother/father/spouses/children` selection shape, reuse this exact `countQueries(fn)` swap-`sequelize.options.logging` recipe verbatim; it is already the project's proven pattern for this exact assertion (SC-5).

---

## Shared Patterns

### GraphQL request via plain-axios (no Apollo Client)
**Source:** `frontend/src/api/graphqlClient.js` (whole file, 39 lines)
**Apply to:** `FamilyTreePage.jsx` exclusively (the only new file that talks to the network this phase — canvas/node/panel components consume already-fetched data)
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
      throw new Error('Network Error: the frontend could not reach the GraphQL API. ...');
    }
    throw error;
  }
}
```
No new transport, no new client library — every GraphQL call in this project, including the tree's flat query, goes through this exact function.

### Route gating via `<ProtectedRoute>`
**Source:** `frontend/src/components/ProtectedRoute.jsx` (whole file, 21 lines)
**Apply to:** `/family` route registration in `App.jsx` (D-15 — reused verbatim, no `allowedRoles`)
```javascript
if (!user) return <Navigate to="/login" replace />;
if (!user.familyMemberId && user.role !== 'ADMIN') return <Navigate to="/pending" replace />;
if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
return <Outlet />;
```
This is the ONLY client-side gate; the real enforcement is server-side (`requireFamilyAccess` on `familyMembers`, D-13).

### Auth guard: `requireFamilyAccess` (linked-member-OR-admin)
**Source:** `backend/src/utils/auth.js` lines 43-47
```javascript
export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
**Apply to:** `familyMembers` resolver (D-13 — the one-line guard-swap this phase's whole backend change consists of). Already applied to `familyMember` (singular), `myEditableMembers`, and every mutation in the same file — `familyMembers` was the sole remaining `requireAdmin` holdout among read queries.

### 2-space/single-quote/semicolons code style
**Source:** repo-wide (no ESLint/Prettier config; observed convention documented in CLAUDE.md's Conventions section)
**Apply to:** all new files — match `familyMember.resolver.js` / `ManagePage.jsx` verbatim (2-space indent, single quotes, semicolons, object-shorthand, no trailing commas in single-line objects, named exports for utilities/config, default exports for React components/pages).

### MUI theme tokens, never hard-coded hex
**Source:** `frontend/src/theme.js` — the `colors` export (lines 7-30)
**Apply to:** every new component under `frontend/src/components/family/` — import `{ colors }` from `../../theme.js` exactly as `MemberAvatarImage.jsx`/`MemberCard.jsx` do; UI-SPEC explicitly names `colors.primary` (`#6366f1`), `colors.line` (`#e6e8f0`), `colors.slate`, `colors.paper`, `colors.gradientSoft`/`colors.primaryDark` (for the "You" chip, matching the existing `Chip` in `MemberCard.jsx` line 112) as the tokens to reuse.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/src/components/family/familyTree.assembly.js` | utility | transform | Genuinely new capability — no client-side pure graph/tree-assembly logic exists anywhere in the codebase; build directly from RESEARCH.md's Architecture Patterns 1-3 code examples (apex detection, generation ranking, union-node synthesis, initial-expand-set), following only the project's generic code-style conventions (named exports, 2-space/single-quote style from `backend/src/utils/auth.js`). |
| `frontend/src/components/family/UnionNode.jsx` | component | render | No synthetic/non-person node type exists in the codebase (every existing "card" component represents a real `FamilyMember`); build per RESEARCH Pattern 2's `UNION_W`/`UNION_H` constants, exact visual spike-driven per D-12. |
| `frontend/src/setup for xyflow jsdom mocking` (colocated in `FamilyTreeCanvas.test.jsx`, not a separate file) | test helper | render-smoke | No prior test in this codebase has needed a canvas/SVG-measurement jsdom polyfill (`ResizeObserver`, `DOMMatrixReadOnly`, `getBBox`) — `frontend/test/setup.js` only polyfills `window.matchMedia`. Use RESEARCH's officially-documented `mockReactFlow()` snippet verbatim, colocated per its own non-global warning. |

## Metadata

**Analog search scope:** `frontend/src/{pages,components,api,context}`, `backend/src/{resolvers,utils,services}`, `backend/test/`, `frontend/test/`
**Files scanned:** ~45 frontend source/test files, ~50 backend source/test files (via `find` + targeted `Read`)
**Pattern extraction date:** 2026-07-25
