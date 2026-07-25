---
phase: 17-family-deep-tree-visualization
reviewed: 2026-07-25T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - backend/src/resolvers/familyMember.resolver.js
  - backend/src/resolvers/familyMember.resolver.test.js
  - frontend/src/App.jsx
  - frontend/src/components/AppLayout.jsx
  - frontend/src/components/family/FamilyTreeCanvas.jsx
  - frontend/src/components/family/FamilyTreeCanvas.test.jsx
  - frontend/src/components/family/MemberDetailPanel.jsx
  - frontend/src/components/family/MemberDetailPanel.test.jsx
  - frontend/src/components/family/MemberNode.jsx
  - frontend/src/components/family/MemberNode.test.jsx
  - frontend/src/components/family/UnionNode.jsx
  - frontend/src/components/family/familyTree.assembly.js
  - frontend/src/components/family/familyTree.assembly.test.js
  - frontend/src/components/family/familyTree.layout.js
  - frontend/src/components/family/familyTree.layout.test.js
  - frontend/src/pages/FamilyTreePage.jsx
  - frontend/src/pages/FamilyTreePage.test.jsx
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-07-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 17 adds deep family-tree visualization: a relaxed `requireFamilyAccess`
authorization surface on the family-member queries, pure client-side
forest-assembly and dagre-layout modules, and a `<ReactFlow>` canvas with
collapse/expand in both descendant and ancestor directions.

**Authorization change (verified sound):** The guard relaxation from admin-only
to linked-member-or-admin on `familyMembers` / `familyMember(id)` does not
over-expose data. `requireFamilyAccess` correctly rejects unlinked non-admins,
and the sensitive `linkedUser` field remains gated in its own field resolver
(`user?.role === 'ADMIN' || linked.id === user?.id`, otherwise `null`). The
D-14 regression test confirms a linked non-admin sees `null` for another
member's `linkedUser`. The mutation resolvers consistently funnel non-admin
writes through `computeEditableScope`, including the `otherParentId` and
sibling-inherited-parent existing-node references. No authorization defect
found in the backend.

The main defect is in the interactive expand/collapse logic on the canvas: the
toggle handlers reveal member nodes but never reveal the synthetic **union**
nodes (or the marriage/descent edges) that connect a two-parent child to its
parents, so interactively-revealed relatives render visually disconnected. This
is the core defect below, plus layout-memoization and detail-panel data-gap
warnings.

## Critical Issues

### CR-01: Expand/collapse reveals member nodes but leaves union nodes and connecting edges hidden — interactively-revealed two-parent relatives render disconnected

**Status: RESOLVED** — fixed via TDD (RED `5b824b3`, GREEN `3cb133c`). Both
toggle handlers now derive union-node connections from the graph's own
marriage/descent edges (`buildUnionConnections`) and reveal a union whenever
its descent-child or both marriage partners are in the expanded set
(`revealConnectingUnions`), applied in `handleToggleExpand`,
`expandAncestorChainFrom` (also covering `findMe`/search), keeping
`familyTree.assembly.js` and the layout module untouched.

**File:** `frontend/src/components/family/FamilyTreeCanvas.jsx:108-122` (`handleToggleExpand`), `:53-85` (`expandAncestorChainFrom`), `:153-156` (`renderEdges`)

**Issue:**
The forest routes every two-parent child through a synthetic `union` node:
marriage edges (`partner -> union`) and a descent edge (`union -> child`) are
the *only* path connecting a child to its parents (`familyTree.assembly.js:250-265`).
An edge is shown only when **both** endpoints are in `expandedIds`
(`renderEdges`, line 154: `hidden: !(expandedIds.has(e.source) && expandedIds.has(e.target))`),
and a union node is shown only when its id is in `expandedIds`
(`positionedNodes`, line 103: `hidden: !expandedIds.has(n.id)`).

However, neither toggle handler ever adds a union id to `expandedIds`:

- `handleToggleExpand` (line 114-117) adds only child member ids:
  `for (const child of member.children || []) next.add(childId)`.
- `expandAncestorChainFrom` (line 53-85) adds only mother/father member ids.

`grep` confirms `union` appears nowhere in the toggle logic — union ids enter
`expandedIds` *only* via the initial expand set built in `familyTree.assembly.js`.
Consequently, when a user clicks a descendant "+N" badge to reveal a grandchild
(or an ancestor badge to reveal grandparents), the newly-shown two-parent node
appears with **no visible line to its parents**: the connecting union node stays
`hidden`, and both its marriage and descent edges stay `hidden`. This breaks the
primary purpose of the tree (showing lineage connections) for every
interactively-revealed relative beyond the initial direct line.

This path is untested — `FamilyTreeCanvas.test.jsx` uses `EDGES = []` and
single-parent fixtures (no unions), so the disconnection never surfaces in the
suite.

**Fix:** When adding a member to `expandedIds`, also add the union node(s) that
connect it. In `handleToggleExpand`, for each revealed child compute the union
key from the child's `mother`/`father` ids and add it; in
`expandAncestorChainFrom`, for each revealed parent add the union connecting the
parent couple. Because the canvas only receives `nodes`/`edges` (not the union
map), the cleanest fix is to reveal any union whose partner ids are both present
in `next`, e.g. after building `next`, sweep the union nodes:

```js
// after computing `next` in each handler:
for (const n of nodes) {
  if (n.type !== 'union') continue;
  const [a, b] = n.id.replace(/^union-/, '').split('-');
  if (next.has(a) && next.has(b)) next.add(n.id);
}
return next;
```

(or thread the union/partner metadata down from `buildForest` so the handlers
can resolve the exact union id for each revealed edge without string-parsing).

## Warnings

### WR-01: `positionedNodes` memo omits `nodes`/`edges` from its dependency array — stale layout if the forest changes without an expand-set change

**File:** `frontend/src/components/family/FamilyTreeCanvas.jsx:102-106`

**Issue:**
```js
const positionedNodes = useMemo(() => {
  const withHidden = nodes.map((n) => ({ ...n, hidden: !expandedIds.has(n.id) }));
  return layoutWithDagre(withHidden, edges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [visibleIdsKey]);
```
The memo reads `nodes`, `edges`, and `expandedIds` but depends only on
`visibleIdsKey` (the sorted expanded-id string). If the `nodes`/`edges` props
change while `expandedIds` is unchanged, dagre will not re-run and the canvas
will render a stale layout / stale member data. Today this is masked because
`FamilyTreePage` unmounts the canvas during `pageLoading` on every refetch, so
the component remounts with fresh props — but that coupling is implicit and
fragile. Any future change that keeps the canvas mounted across a data update
(e.g. optimistic edit, live refresh) will silently render stale positions.

**Fix:** Include the structural inputs in the key or deps. For example derive
the key from node/edge identity as well:
```js
const structureKey = useMemo(
  () => `${nodes.map((n) => n.id).join(',')}|${edges.map((e) => e.id).join(',')}`,
  [nodes, edges]
);
// ...
}, [visibleIdsKey, structureKey]);
```

### WR-02: MemberDetailPanel renders `phone`/`address` that the page query never fetches — contact info is permanently invisible (dead UI)

**File:** `frontend/src/components/family/MemberDetailPanel.jsx:94-103`; query at `frontend/src/pages/FamilyTreePage.jsx:20-27`

**Issue:**
The detail panel conditionally renders contact details:
```jsx
{member.phone && (<Typography ...>{member.phone}</Typography>)}
{member.address && (<Typography ...>{member.address}</Typography>)}
```
But `FAMILY_TREE_QUERY` selects only
`id firstname lastname fullname gender birthdate deathdate photoUrl` plus the
relationship id fields — it never selects `phone` or `address`. The member
objects passed into the panel therefore always have `phone === undefined` and
`address === undefined`, so these branches are dead: contact info never appears
for any member, regardless of stored data. Either the feature is broken (fields
intended to show but not fetched) or the panel code is misleading dead code.

**Fix:** If contact info should appear in the panel, add `phone address` to the
`FAMILY_TREE_QUERY` selection set. If it should not (privacy / D-13 minimization),
remove the `phone`/`address` blocks from `MemberDetailPanel` so the component
does not imply data it can never render. Confirm the intended behavior against
the UI-SPEC before choosing.

### WR-03: `handleSearchSubmit` fires `fitView` on a node id that may not yet be committed/laid out

**File:** `frontend/src/components/family/FamilyTreeCanvas.jsx:180-199`

**Issue:**
On a search hit, the handler updates `expandedIds` (which triggers a re-render
and a dagre re-layout via `visibleIdsKey`) and then, in a single
`requestAnimationFrame`, calls `fitView({ nodes: [{ id: match.id }] })`. If the
matched node was previously hidden, it may not be present/positioned in the
React Flow store by the time that rAF callback runs (state commit + layout are
not guaranteed complete within one frame), so the fit-to-node silently no-ops
and the user is not panned to their search result. The auto-find-me effect
(line 170-178) handles the analogous viewer case via an effect keyed on
`renderNodes`, but the search path relies on a bare rAF instead.

**Fix:** Reframe from an effect that observes the node becoming available, or
track a "pending focus id" in state and `fitView` from a `useEffect` keyed on
`[renderNodes, pendingFocusId]` once `getNode(pendingFocusId)` resolves — the
same pattern already used for auto-find-me.

## Info

### IN-01: Year formatting uses `getFullYear()` on UTC-parsed dates — off-by-one year near boundaries in negative-UTC-offset locales

**File:** `frontend/src/components/family/MemberNode.jsx:22-29` (`formatYears`); `frontend/src/components/family/MemberDetailPanel.jsx:19-26` (`formatDates`)

**Issue:** `new Date('YYYY-MM-DD')` parses as UTC midnight, but `.getFullYear()`
returns the year in local time. For a Jan-1 date viewed west of UTC (or a Dec-31
date viewed east), the displayed year can be off by one. Low impact and it
matches the existing codebase convention, but worth noting for a data-display
feature.

**Fix:** Parse/format in a fixed zone, e.g. read the year off the ISO string
directly (`member.birthdate.slice(0, 4)`) when the value is a plain `YYYY-MM-DD`.

### IN-02: `mockReactFlow()` jsdom polyfill duplicated verbatim across two test files

**File:** `frontend/src/components/family/FamilyTreeCanvas.test.jsx:14-59` and `frontend/src/pages/FamilyTreePage.test.jsx:26-67`

**Issue:** The `MockResizeObserver` class and `mockReactFlow()` setup are copy-
pasted between the two suites. The colocation rationale is documented, but the
duplication means a future @xyflow bump (like the `contentRect` fix already
noted in the comments) must be applied in two places or the suites drift.

**Fix:** Extract to a shared test helper (e.g.
`frontend/test/mockReactFlow.js`) imported by both suites; keep it out of the
global `setup.js` as the comments require.

### IN-03: `computeGenerations` cycle guard overwrites the memoized `0` it set during traversal, yielding order-dependent ranks on cyclic data

**File:** `frontend/src/components/family/familyTree.assembly.js:52-77`

**Issue:** `resolveGeneration` writes `generations.set(id, 0)` when it detects a
`visiting` cycle (line 57), but the outer call later overwrites that same id
with a non-zero longest-path value (line 75). On genuinely cyclic input the
computed generation therefore depends on which node the top-level loop started
from. The backend `wouldCreateCycle` guard makes such data unreachable in
practice (and `MAX_GENERATION_DEPTH` bounds the recursion), so this is
defensive-path-only, but the behavior is not deterministic if a cycle ever
slips through.

**Fix:** On cycle detection, return `0` without memoizing (`return 0;` before
`generations.set`), or memoize a sentinel and skip re-setting for ids already
resolved, so a cycle can't leave an inconsistent rank.

---

_Reviewed: 2026-07-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
