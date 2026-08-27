# Phase 28: Admin Actions on /detail - Pattern Map

**Mapped:** 2026-08-04
**Files analyzed:** 4 modified (DetailPage.jsx, PersonCard.jsx, useDescendantNav.js, new backend adversarial test) + 2 reused-unchanged (EditMemberDialog.jsx, AddRelativeDialog.jsx)
**Analogs found:** 4 / 4 (one partial — see `useDescendantNav` invalidate method)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `frontend/src/pages/DetailPage.jsx` | route/controller (owns page-level dialog + edit-target state) | request-response | `frontend/src/pages/ManagePage.jsx` `AdminBranch` (`:281-525`) | exact (same dialog-state-at-page-level pattern) |
| `frontend/src/components/person/PersonCard.jsx` (`PersonCardSingle`) | component (presentational, prop-driven) | request-response (callback-out, no fetch inside) | (a) itself — existing `canEdit`-gated Edit `IconButton` at `PersonCard.jsx:104-112`; (b) `frontend/src/pages/Dashboard.jsx` row-actions `Menu` (`:309-317`, `:324-349`) | exact for gating; exact for the anchored-Menu mechanics |
| `frontend/src/hooks/useDescendantNav.js` (new invalidate/refetch method) | hook (owns fetch + per-id cache) | event-driven cache invalidation | (a) itself — `ensureEntry` (`:50-67`); (b) `ManagePage.jsx` `refetchFocused`/`handleFocus` targeted-refetch-by-id (`:324-336`) | partial — no prior per-id cache-eviction method exists anywhere in the codebase; `ensureEntry`'s force-fetch branch is the nearest mechanical shape |
| Backend adversarial test (new, in `familyMember.editMember.test.js`, `familyMember.addChild.test.js`, or `familyMember.addSpouse.test.js`) | test (integration, non-admin rejection) | request-response | `familyMember.editMember.test.js` `'rejects an id outside the actor editable scope'` (`:110-134`); same-shaped tests in `familyMember.addChild.test.js:130-160` and `familyMember.addSpouse.test.js:65-85` | exact |
| `frontend/src/components/manage/EditMemberDialog.jsx` | dialog/form component | CRUD (single mutation) | N/A — reused unchanged | n/a (reference only) |
| `frontend/src/components/manage/AddRelativeDialog.jsx` | dialog/form component | CRUD (single mutation, relation-typed) | N/A — reused unchanged | n/a (reference only) |

## Pattern Assignments

### `frontend/src/pages/DetailPage.jsx` (route/controller, request-response)

**Analog:** `frontend/src/pages/ManagePage.jsx` `AdminBranch` (`:281-525`)

**Dialog state shape at page level** (`ManagePage.jsx:126-137, 286-290`):
```javascript
const EMPTY_DIALOG_STATE = {
  open: false,
  relationType: '',
  targetId: null,
  targetName: '',
  targetGender: '',
  targetFirstname: '',
  targetLastname: '',
  targetGeezFirstname: '',
  targetGeezLastname: ''
};
// ...
const [dialogState, setDialogState] = useState(EMPTY_DIALOG_STATE);
const [editTarget, setEditTarget] = useState(null);
```
DetailPage should hold the equivalent pair — `dialogState` (for `AddRelativeDialog`) and `editTarget` (for `EditMemberDialog`) — as page-level state, exactly mirroring this shape. Note `/detail` has no `targetFirstname`/`targetLastname`/Ge'ez-prefill fields readily available from its query today (see Integration Points in CONTEXT.md); the planner decides whether to extend `FAMILY_MEMBER_QUERY`/`EXPAND_CHILDREN_QUERY` or accept a thinner prefill.

**`onAddRelative`/`onEdit` trigger wiring** (`ManagePage.jsx:409-426`):
```javascript
onAddRelative={(relationType) =>
  setDialogState({
    open: true,
    relationType,
    targetId: focusedScope.self.id,
    targetName: focusedScope.self.fullname,
    targetGender: focusedScope.self.gender,
    targetFirstname: focusedScope.self.firstname,
    targetLastname: focusedScope.self.lastname,
    targetGeezFirstname: focusedScope.self.geezFirstname,
    targetGeezLastname: focusedScope.self.geezLastname
  })
}
onEdit={(member) => setEditTarget(member)}
```
DetailPage's three `onEdit={() => {}}` stubs (`DetailPage.jsx:134, 151, 160`) become `onEdit={(member) => setEditTarget(member)}` — same signature `PersonCard` already calls with (`onEdit(member)` at `PersonCard.jsx:107`). A new `onAddRelative`/`onAddMenu` handler is passed alongside, at the same three call sites plus wherever the spouse/couple anchor renders.

**Dialogs mounted once at the bottom of the tree, fed from state** (`ManagePage.jsx:445-471`):
```javascript
<AddRelativeDialog
  open={dialogState.open}
  relationType={dialogState.relationType}
  targetId={dialogState.targetId}
  targetName={dialogState.targetName}
  targetGender={dialogState.targetGender}
  targetFirstname={dialogState.targetFirstname}
  targetLastname={dialogState.targetLastname}
  targetGeezFirstname={dialogState.targetGeezFirstname}
  targetGeezLastname={dialogState.targetGeezLastname}
  inScopeMembers={inScopeMembers}
  onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
  onCreated={() => {
    refetchMembers();
    refetchFocused();
  }}
/>

<EditMemberDialog
  open={Boolean(editTarget)}
  member={editTarget}
  onClose={() => setEditTarget(null)}
  onSaved={() => {
    refetchMembers();
    refetchFocused();
  }}
/>
```
**D-03 explicitly says do NOT reuse these `onCreated`/`onSaved` bodies** (`refetchMembers`/`refetchFocused` are `/manage`-specific queries). DetailPage mounts both dialogs identically (same `open`/`onClose` shape), but `onCreated`/`onSaved` must instead call the new targeted-refresh path (D-04): `loadPersonById(mainPerson.id)` for the head (already defined at `DetailPage.jsx:47-54`), or the new `useDescendantNav` invalidate method for a descendant, plus the D-05 auto-expand-on-add-child follow-up.

**Existing `loadPersonById` refresh primitive to reuse for the head** (`DetailPage.jsx:47-54`):
```javascript
const loadPersonById = useCallback((id) => {
  setLoading(true);
  setError('');
  return graphqlRequest(FAMILY_MEMBER_QUERY, { id })
    .then((data) => setMainPerson(data.familyMember))
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));
}, []);
```

---

### `frontend/src/components/person/PersonCard.jsx` (`PersonCardSingle`) (component, request-response)

**Analog A — existing `canEdit`-gated absolute-positioned control** (`PersonCard.jsx:104-112`):
```javascript
{member.canEdit === true && (
  <IconButton
    aria-label={`Edit ${member.fullname}`}
    onClick={() => onEdit(member)}
    sx={{ position: 'absolute', top: 8, right: 8, minWidth: 44, minHeight: 44 }}
  >
    <EditRoundedIcon />
  </IconButton>
)}
```
The new Add menu control follows the identical gating (`member.canEdit === true`) and identical `sx` positioning family (D-02: "beside the existing edit button" — e.g. `right: 56` or similar, still `top: 8`, still `minWidth/minHeight: 44` for the a11y tap target). Per D-07, this control is added to `PersonCardSingle` only when NOT `isSpouse` (mirror the `showExpand = !isSpouse && ...` guard pattern at `PersonCard.jsx:81`).

**Analog B — anchored `Menu` open/close/item pattern** (`frontend/src/pages/Dashboard.jsx:1-30` imports, `:93-95` state, `:309-317` trigger, `:324-349` menu):
```javascript
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
// ...
const [rowMenu, setRowMenu] = useState({ anchorEl: null, user: null });
const closeRowMenu = () => setRowMenu({ anchorEl: null, user: null });
// ...
<IconButton
  size="small"
  aria-label={`Actions for ${u.name}`}
  onClick={(e) => setRowMenu({ anchorEl: e.currentTarget, user: u })}
>
  <MoreVertRoundedIcon fontSize="small" />
</IconButton>
// ...
<Menu anchorEl={rowMenu.anchorEl} open={Boolean(rowMenu.anchorEl)} onClose={closeRowMenu}>
  <MenuItem onClick={() => { /* action */ closeRowMenu(); }}>Edit account</MenuItem>
  <MenuItem onClick={() => { /* action */ closeRowMenu(); }}>Change password</MenuItem>
</Menu>
```
`PersonCardSingle` needs its own local `anchorEl` state (component-local UI state is fine here — it's ephemeral menu-open/closed, not fetched data, consistent with "card is presentational"). On `MenuItem` click, call the new prop (e.g. `onAddRelative(relationType, member)` — exact name is planner/Claude's discretion per CONTEXT.md) then close the menu, mirroring `closeRowMenu()`'s always-close-after-action shape. `Tooltip` wrapping (`Dashboard.jsx:309`) is optional polish, not required for the pattern match.

**Prop-threading convention to follow** (`PersonCard.jsx:46, 75`):
```javascript
export default function PersonCard({ member, role, spouse, isSpouse = false, expanded, onExpand, onEdit }) {
  const card = (
    <PersonCardSingle member={member} role={role} isSpouse={isSpouse} expanded={expanded} onExpand={onExpand} onEdit={onEdit} />
  );
  // spouse leaf: <PersonCardSingle member={spouse} isSpouse onEdit={onEdit} />
```
The new add-menu callback prop threads through `PersonCard` -> `PersonCardSingle` the same way `onEdit` does, but per D-07 is **only ever passed to the non-spouse `PersonCardSingle` call** (never to the `isSpouse` leaf at line 70) — do not add it to the spouse-leaf invocation.

---

### `frontend/src/hooks/useDescendantNav.js` (hook, event-driven cache invalidation)

**Analog — the existing cache-fetch primitive to extend** (`useDescendantNav.js:50-67`):
```javascript
const ensureEntry = useCallback((person) => {
  const existing = cache.current.get(person.id);
  if (existing?.children !== undefined) {
    // Cache hit — zero network call.
    return Promise.resolve();
  }
  cache.current.set(person.id, { self: person, children: existing?.children });
  setLoadingId(person.id);
  return graphqlRequest(EXPAND_CHILDREN_QUERY, { id: person.id })
    .then((data) => {
      cache.current.set(person.id, { self: person, children: data.familyMember?.children ?? [] });
    })
    .finally(() => {
      setLoadingId((current) => (current === person.id ? null : current));
    });
}, []);
```
No prior "invalidate/evict a cache entry" method exists anywhere in this codebase (ref-cache is new as of Phase 27) — this is the **closest mechanical shape** to copy from, not a true existing analog. The new invalidate method (name is Claude's discretion — e.g. `refreshEntry`/`invalidate(id)`) should: (1) `cache.current.delete(id)` (or set `children: undefined` to force a miss), then (2) re-run the same `graphqlRequest(EXPAND_CHILDREN_QUERY, { id })` fetch `ensureEntry` already performs — same query, same cache-write shape `{ self, children }` — then (3) trigger a re-render (the reducer `dispatch` calls already do this after `ensureEntry` resolves, e.g. `onExpandChild` at `:74-77`), since a ref write alone (per the file's own PERF-03 comment at `:32-35`) never triggers React to re-render.

**Reducer dispatch-after-fetch wiring convention** (`useDescendantNav.js:69-82`):
```javascript
const onExpandChild = useCallback(
  (person) => ensureEntry(person).then(() => dispatch({ type: 'EXPAND_CHILD', id: person.id })),
  [ensureEntry]
);
```
The new invalidate method should return a Promise the same way, so DetailPage's `onSaved`/`onCreated` callbacks can `await` it before doing the D-05 auto-expand follow-up.

**Secondary reference — targeted refetch-by-id at the page level** (`ManagePage.jsx:324-336`):
```javascript
const refetchFocused = useCallback(() => {
  if (focusedScope) return handleFocus(focusedScope.self);
  return Promise.resolve();
}, [focusedScope, handleFocus]);
```
Conceptually the same "refresh just the one thing currently in view" shape DetailPage/`useDescendantNav` should follow for D-04, even though the underlying cache mechanism (ref `Map` vs React state) differs.

---

### Backend adversarial test (SC-3, PERM-03) — new test in an existing resolver test file

**Analog — non-admin outside-scope rejection shape** (`backend/src/resolvers/familyMember.editMember.test.js:110-134`):
```javascript
it('rejects an id outside the actor editable scope', async () => {
  const grandparent = await models.FamilyMember.create({ firstname: 'Great', lastname: 'Grand', gender: 'Female' });
  const mother = await models.FamilyMember.create({
    firstname: 'Mother', lastname: 'Lovelace', gender: 'Female', motherId: grandparent.id
  });
  const self = await models.FamilyMember.create({
    firstname: 'Ada', lastname: 'Lovelace', gender: 'Female', motherId: mother.id
  });
  const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

  const { data, errors } = await graphql(
    EDIT_MEMBER_MUTATION,
    { id: String(grandparent.id), fields: { phone: '555-5000' } },
    actor
  );

  expect(errors[0].message).toBe('This member is outside your editable scope.');
  expect(data).toBeNull();
});
```
Same-shaped tests already exist for the other two mutations this phase touches — `addChild` (`familyMember.addChild.test.js:130-160`, `'rejects a memberId (primary target) outside the actor editable scope'`) and `addSpouse` (`familyMember.addSpouse.test.js:65-85`, `'rejects a memberId outside the actor editable scope'`). Any of the three is a valid target for the new SC-3 adversarial test; pick whichever mutation the planner wires first end-to-end from `/detail` (likely `editMember`, since Edit is wired to all three render sites). Reuse the exact `describe`/`it`/`graphql`/`createTestUser`/`resetTables` harness (`import { graphql, resetTables, createTestUser } from '../../test/helpers.js'`, `beforeEach(resetTables)`), and assert both `errors[0].message` (the guard's exact string, already defined in the resolver — no new guard copy needed per D-09) and `data === null`.

**Guard call sites already enforcing this, cited but NOT modified** (`backend/src/resolvers/familyMember.resolver.js:245-256`):
```javascript
editMember: async (_parent, { id, fields }, { models, user }) => {
  requireFamilyAccess(user);
  const targetId = Number(id);
  const isAdmin = user.role === 'ADMIN';
  if (!isAdmin) {
    const scope = await computeEditableScope(user.familyMemberId);
    if (!scope.ids.has(targetId)) {
      throw new Error('This member is outside your editable scope.');
    }
  }
  // ...
```

---

## Shared Patterns

### `canEdit`-gated action controls
**Source:** `frontend/src/components/person/PersonCard.jsx:104-112` (existing Edit button)
**Apply to:** The new Add menu control on `PersonCardSingle` — identical `member.canEdit === true` gate, no separate client-side role check.

### Page-owns-dialog-state, dialogs-mounted-once
**Source:** `frontend/src/pages/ManagePage.jsx` `AdminBranch` (`:286-290` state, `:445-471` mount)
**Apply to:** `DetailPage.jsx` — `dialogState` + `editTarget` state, `AddRelativeDialog`/`EditMemberDialog` each mounted exactly once at the bottom of the returned JSX, fed from state, never per-card.

### Anchored MUI `Menu` for a multi-item action control
**Source:** `frontend/src/pages/Dashboard.jsx:93-95, 309-317, 324-349`
**Apply to:** `PersonCard.jsx`'s new Add-child/Add-spouse menu — `IconButton` sets `{ anchorEl: e.currentTarget }`, `Menu` reads `open={Boolean(anchorEl)}`, each `MenuItem` fires its action then closes the menu.

### Guarded mutations (no new guard code — reuse only)
**Source:** `backend/src/resolvers/familyMember.resolver.js:117, 150, 246` (`requireFamilyAccess` + admin scope-bypass on `addSpouse`/`addChild`/`editMember`)
**Apply to:** Nothing changes here; the new adversarial test exercises these existing guards from the `/detail`-relevant angle (D-09 — explicitly no new guard logic).

### Targeted (not whole-view) refetch-on-mutation-success
**Source:** `frontend/src/pages/ManagePage.jsx:333-336` (`refetchFocused`) conceptually; `frontend/src/pages/DetailPage.jsx:47-54` (`loadPersonById`) mechanically for the head case.
**Apply to:** `onSaved`/`onCreated` callbacks passed to `EditMemberDialog`/`AddRelativeDialog` from `DetailPage.jsx` — head refreshes via `loadPersonById(mainPerson.id)`; descendants refresh via the new `useDescendantNav` invalidate method (D-04).

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|--------------|------|-----------|--------|
| `useDescendantNav` invalidate/evict method | hook | event-driven cache invalidation | No prior per-id cache-eviction method exists in this codebase (the ref-cache pattern itself is new as of Phase 27); `ensureEntry`'s fetch body is the closest mechanical shape to copy, not a true precedent for eviction. |
| D-05 auto-expand-on-add-child-if-collapsed | UI behavior | event-driven | No existing "mutation success triggers a navigation-state change" precedent; must compose the new invalidate call with `useDescendantNav`'s existing `dispatch({ type: 'EXPAND_CHILD', ... })`/`onExpandChild`-style calls (`useDescendantNav.js:74-77`), respecting the Phase-27 one-branch/forward-shift/3-gen-cap rules already encoded in `navReducer` (`frontend/src/hooks/descendantNav.reducer.js`, not separately read here — planner should consult it directly for the exact action types available). |

## Metadata

**Analog search scope:** `frontend/src/pages/`, `frontend/src/components/person/`, `frontend/src/components/manage/`, `frontend/src/hooks/`, `backend/src/resolvers/`, `backend/src/utils/auth.js`
**Files read:** `frontend/src/pages/DetailPage.jsx`, `frontend/src/pages/DetailPage.test.jsx`, `frontend/src/components/person/PersonCard.jsx`, `frontend/src/components/person/PersonCard.test.jsx`, `frontend/src/components/person/GenerationGrid.jsx`, `frontend/src/hooks/useDescendantNav.js`, `frontend/src/pages/ManagePage.jsx` (lines 1-60, 120-160, 270-530), `frontend/src/components/manage/EditMemberDialog.jsx`, `frontend/src/components/manage/AddRelativeDialog.jsx`, `frontend/src/pages/Dashboard.jsx` (lines 1-30, 300-355), `backend/src/resolvers/familyMember.resolver.js` (lines 100-300), `backend/src/resolvers/familyMember.editMember.test.js`, `backend/src/resolvers/familyMember.canEdit.test.js`, `backend/src/utils/auth.js` (grep only), `backend/src/resolvers/familyMember.addChild.test.js` / `familyMember.addSpouse.test.js` (test names only, via grep)
**Pattern extraction date:** 2026-08-04
