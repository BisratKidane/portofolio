---
quick_id: 260726-rwp
slug: family-tree-root-ancestor
description: "Always root the /family tree at the top ancestor (member id 1, Agne) instead of the logged-in viewer"
status: complete
created: 2026-07-26
completed: 2026-07-26
---

# Quick Task 260726-rwp: Root the family tree at the top ancestor — Summary

The `/family` deep-tree view now always opens from the top ancestor (member id
`"1"`, Agne) with the full tree expanded downward and fit to the window, instead
of centering the initial expand + camera on the logged-in viewer. Frontend-only;
no backend, GraphQL, DB, Docker, or runtime-behavior change beyond the initial
`/family` view.

## What changed, per file

### `frontend/src/components/family/familyTree.assembly.js`
- Removed the dead viewer-spine helpers: `walkAncestralSpine`, `directLineIds`,
  and `computeInitialExpandSet`.
- Added three exported helpers:
  - `collectDescendantIds(rootId, membersById, { includeSpouses = true } = {})`
    — cycle-guarded BFS down the `children` graph; adds the root and every
    reachable descendant, plus (when `includeSpouses`) each visited member's
    `spouses` **without** traversing into them; ignores refs not in
    `membersById`; returns `Set<string>`.
  - `resolveRootAncestorId(flatMembers, membersById)` — returns `"1"` when
    present; else the apex (`mother == null && father == null`) with the largest
    spouse-excluded descendant subtree; else the first member id; else `null`.
  - `computeRootExpandSet(flatMembers)` — resolves the root and returns its
    descendants + their spouses; empty `Set` for empty input / no root.
- `buildForest` signature changed from `buildForest(flatMembers, viewerId)` to
  `buildForest(flatMembers)`; it now sets `initialExpandedIds` from the resolved
  root and returns a new `rootAncestorId` field (`null` for empty input).
- Kept `deriveSiblings` exported (still imported by `MemberDetailPanel.jsx`).
- Updated the file-header comment ("D-04 initial expand set" → "root-based
  initial expand set").

### `frontend/src/components/family/familyTree.assembly.test.js`
- Updated imports to the new exports; dropped `computeInitialExpandSet`.
- Empty-forest test now asserts `rootAncestorId: null`.
- Reframed the spouse-connector "visible on first paint" test as root-based.
- Replaced the viewer-spine describe blocks (`multi-apex-path spine`,
  `D-03 disconnected apex exclusion`, `standalone export`) with new coverage:
  root defaults to id 1 with all descendants + their spouses; fallback picks the
  apex with the most descendants; spouse of an expanded member is included but
  the spouse's own ancestors/out-of-line children are not; `includeSpouses:false`
  path; children-cycle guard; empty input → empty set / `rootAncestorId: null`;
  first-member fallback when no apex exists.
- Kept the existing `deriveSiblings` describe block unchanged (passing).

### `frontend/src/pages/FamilyTreePage.jsx`
- Updated the call site `buildForest(members, user.familyMemberId)` →
  `buildForest(members)` and simplified the `useMemo` dependency array to
  `[members]`. `viewerId={user.familyMemberId}` is still passed to
  `FamilyTreeCanvas` (drives the "Find me" button and the viewer ring/"You"
  chip, unchanged).

### `frontend/src/components/family/FamilyTreeCanvas.jsx`
- Replaced the `didAutoFindMe` viewer-pan-on-load effect with a one-time
  initial-fit effect that frames the **whole** tree once after the first layout
  (`fitView({ padding: 0.1, duration: 400 })`), guarded by a `didInitialFit`
  ref so it runs once.
- Made `findMe` self-contained: it now reframes the viewer via
  `requestAnimationFrame` (mirroring `handleSearchSubmit`) instead of relying on
  the removed auto-pan effect to reframe after revealing a collapsed viewer.
- Left the `isViewer` ring + "You" chip, expand/collapse handlers, edge
  rendering, and search untouched.

### `frontend/src/components/family/FamilyTreeCanvas.test.jsx`
- Added a "Find me" smoke test (clicking the button leaves the viewer node
  visible with its viewer ring). No prior test asserted auto-framing on load, so
  nothing needed to be dropped. Suite still mounts under `ReactFlowProvider`
  with the colocated `ResizeObserver` polyfill.

### `frontend/src/components/family/MemberDetailPanel.jsx`
- Unchanged (confirmed it still imports and uses `deriveSiblings`).

## Test results

`npm test --workspace frontend -- --run`: **PASS** — 24 test files, 187 tests
passed (0 failed). Targeted runs: `familyTree.assembly` 27/27 pass;
`FamilyTreeCanvas` 11/11 pass.

`grep -rn "computeInitialExpandSet\|walkAncestralSpine\|directLineIds"
frontend/src` returns nothing (removed helpers fully dead-code-eliminated).

## Commits

- `4e23a83` refactor(family): root initial-expand at top ancestor, not viewer
  (Task 1 — assembly module + tests + page call site)
- `2655112` feat(family): frame whole tree from the top on load, not the viewer
  (Task 2 — canvas + tests)

## Deviations from Plan

**1. [Rule 3 — Blocking issue] Made `findMe` self-contained.**
- **Found during:** Task 2.
- **Issue:** The plan removes the `didAutoFindMe` on-load effect, but the
  existing `findMe` callback depended on that effect to reframe the viewer after
  revealing a collapsed viewer's ancestor chain (its comment read "the
  auto-find-me effect below reframes it"). Removing the effect without touching
  `findMe` would silently break the button's reveal-then-frame path.
- **Fix:** `findMe` now frames the viewer itself via `requestAnimationFrame`
  after the reveal, mirroring the existing `handleSearchSubmit` pattern. The
  button's observable behavior (reveal + frame the viewer) is preserved, per the
  plan's constraint to keep "Find me" working.
- **Files modified:** `frontend/src/components/family/FamilyTreeCanvas.jsx`.
- **Commit:** `2655112`.

## Known Stubs

None.

## Self-Check: PASSED

- `frontend/src/components/family/familyTree.assembly.js` — FOUND (modified)
- `frontend/src/components/family/familyTree.assembly.test.js` — FOUND (modified)
- `frontend/src/pages/FamilyTreePage.jsx` — FOUND (modified)
- `frontend/src/components/family/FamilyTreeCanvas.jsx` — FOUND (modified)
- `frontend/src/components/family/FamilyTreeCanvas.test.jsx` — FOUND (modified)
- Commit `4e23a83` — FOUND
- Commit `2655112` — FOUND
