---
quick_id: 260726-rwp
slug: family-tree-root-ancestor
description: "Always root the /family tree at the top ancestor (member id 1, Agne) instead of the logged-in viewer"
status: planned
created: 2026-07-26
---

# Quick Task 260726-rwp: Root the family tree at the top ancestor

## Goal

On the `/family` deep-tree view, the initial render must always start from the
**top ancestor** — family member **id 1** ("Agne") — and unfold the full tree
downward, instead of centering on the logged-in viewer. The whole tree is
expanded and fit to the window on load, with the root at the top.

## Current behavior (to replace)

- `buildForest(flatMembers, viewerId)` sets `initialExpandedIds` to the viewer's
  ancestral spine + direct line via `computeInitialExpandSet` →
  `walkAncestralSpine` + `directLineIds`
  (`frontend/src/components/family/familyTree.assembly.js`).
- `FamilyTreeCanvas.jsx` auto-pans to the **viewer's** node on load
  (`didAutoFindMe` effect, ~lines 203-212), and `findMe()` frames the viewer.

## Desired behavior

1. On load, the initial expanded set is the **root ancestor + all descendants +
   the spouses of those expanded members** (so married-in partners/couples show).
2. Root selection: use member id `"1"` when present in the payload; otherwise the
   apex ancestor (no mother AND no father) with the **most descendants**.
3. Initial camera fits the **whole tree** (root at top). Remove the
   auto-pan-to-viewer-on-load.
4. Keep the **"Find me"** button and the `isViewer` ring/"You" chip unchanged.
5. Keep collapse/expand badges working (users can still collapse/expand).
6. Frontend-only. No backend/runtime/schema change.

## Tasks

### Task 1 — Root-based initial-expand in the assembly module
**Files:** `frontend/src/components/family/familyTree.assembly.js`,
`frontend/src/components/family/familyTree.assembly.test.js`

- Add exported helpers:
  - `collectDescendantIds(rootId, membersById, { includeSpouses = true } = {})`
    — BFS from `rootId` via `children` (guarded against cycles with a `visited`
    set); adds the root and every reachable descendant. When `includeSpouses`,
    also adds each visited member's `spouses` **without** traversing into them
    (a married-in spouse's out-of-line children stay out). Returns a `Set<string>`
    of ids. Ignores refs whose id is not in `membersById`.
  - `resolveRootAncestorId(flatMembers, membersById)` — returns `"1"` if
    `membersById.has("1")`; else the apex member (`mother == null && father == null`)
    with the largest `collectDescendantIds(apexId, …, { includeSpouses: false }).size`;
    else the first member id; else `null` for empty input.
  - `computeRootExpandSet(flatMembers)` — resolves the root, returns
    `collectDescendantIds(rootId, membersById, { includeSpouses: true })`; returns
    an empty `Set` for empty input or when no root resolves.
- Change `buildForest` to set
  `initialExpandedIds = computeRootExpandSet(flatMembers)` and add
  `rootAncestorId` (the resolved root id, or `null`) to its returned object.
  Drop the now-unused `viewerId` parameter — update the signature to
  `buildForest(flatMembers)`.
- Remove the now-dead viewer-spine code: `walkAncestralSpine`, `directLineIds`,
  and `computeInitialExpandSet`. **Keep `deriveSiblings`** (still imported by
  `MemberDetailPanel.jsx`).
- Update `FamilyTreePage.jsx` call site `buildForest(members, user.familyMemberId)`
  → `buildForest(members)`.
- Rewrite the assembly tests that assert the old viewer-spine behavior
  (`buildForest — spouse connector edges` viewer-expand assertion, the
  `computeInitialExpandSet …` describe blocks) into tests for the new behavior:
  - root defaults to id `"1"`; `initialExpandedIds` contains id 1 + all
    descendants + their spouses;
  - fallback picks the apex with the most descendants when id 1 is absent;
  - a spouse of an expanded member is included but the spouse's unrelated
    ancestors/children are **not**;
  - empty input → empty set / `rootAncestorId: null`.
  Keep the existing `deriveSiblings` describe block passing.

**Verify:** `npm test -w frontend -- familyTree.assembly` (or the repo's vitest
invocation) — all assembly tests green.
**Done:** initial-expand is root-based; no references to the removed helpers
remain (`grep -rn "computeInitialExpandSet\|walkAncestralSpine\|directLineIds" frontend/src`
returns nothing).

### Task 2 — Canvas frames the whole tree from the top on load
**Files:** `frontend/src/components/family/FamilyTreeCanvas.jsx`,
`frontend/src/components/family/FamilyTreeCanvas.test.jsx`

- Replace the `didAutoFindMe` viewer-pan effect with a one-time initial-fit
  effect that frames the **whole** tree once after the first layout
  (`fitView({ padding: 0.1, duration: 400 })` — fit all visible nodes; do not
  target the viewer node). Keep a ref guard so it runs once.
- Keep the `findMe` button behavior (still frames/reveals the viewer) and the
  `isViewer` ring + "You" chip unchanged.
- No change to expand/collapse handlers, edge rendering, or search.
- Update `FamilyTreeCanvas.test.jsx`: drop/replace any assertion that the viewer
  is auto-framed on load; keep/adjust tests for "Find me", search, and
  expand/collapse. Ensure the suite still mounts under `ReactFlowProvider` with
  the existing `ResizeObserver` polyfill.

**Verify:** `npm test -w frontend -- FamilyTreeCanvas` — green.
**Done:** no auto-pan-to-viewer on load; "Find me" still works.

## Out of scope / constraints

- No backend, GraphQL, DB, or Docker changes in this task.
- Do not touch `MemberNode.jsx` gender/handle logic or `familyTree.layout.js`.
- After this task the frontend image must be rebuilt + redeployed
  (`cd docker-deploy && ./deploy.sh`, full rebuild) for the change to appear on
  the server — handled by the orchestrator after execution, not part of this plan.

## Validation

- `npm test -w frontend` passes (full frontend suite).
- Manual reasoning: with a payload where id 1 is the apex, `initialExpandedIds`
  equals every connected member; dagre ranks id 1 at the top; canvas fits all.
