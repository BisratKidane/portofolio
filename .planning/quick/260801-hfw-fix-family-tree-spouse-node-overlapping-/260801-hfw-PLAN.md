---
phase: quick-260801-hfw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/family/familyTree.layout.js
  - frontend/src/components/family/familyTree.layout.test.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "A spouse rendered on the /family tree never overlaps another node's rect, even when the bloodline anchor has a sibling to its immediate right"
    - "Spouse pairing still uses the existing anchor/mover bloodline logic (anchor = partner with a parent in the tree; ties fall back to edge.source), with the mover snapped immediately right of the anchor's reserved slot"
    - "Dagre ranking/rows are unaffected by spouse edges — only parent-type edges are fed to dagre, exactly as before"
  artifacts:
    - path: "frontend/src/components/family/familyTree.layout.js"
      provides: "layoutWithDagre reserving a COUPLE_W (PERSON_W*2 + SPOUSE_GAP) dagre node footprint for each spouse-pair anchor before layout, so dagre itself reserves the couple's combined space"
    - path: "frontend/src/components/family/familyTree.layout.test.js"
      provides: "Relative-position assertions (mover.x === anchor.x + PERSON_W + SPOUSE_GAP) replacing any exact-x assertions, plus a new regression test asserting no axis-aligned rect overlap across all node pairs in a sibling+spouse fixture"
  key_links:
    - from: "frontend/src/components/family/familyTree.layout.js"
      to: "dagre g.setNode width"
      via: "anchorsWithSpouse.has(n.id) ? COUPLE_W : PERSON_W passed as node width before dagre.layout(g)"
      pattern: "COUPLE_W"
    - from: "frontend/src/components/family/familyTree.layout.js"
      to: "positions Map (center-to-top-left conversion)"
      via: "per-node actual width (COUPLE_W for anchors, PERSON_W for everyone else) subtracted from dagre's returned center x"
      pattern: "center\\.x - w ?/ ?2"
---

<objective>
Fix a `/family` tree layout bug where a spouse node overlaps a sibling node. Root cause: dagre only ranks parent->child edges and reserves one `PERSON_W` slot per person; the spouse is snapped to `anchor.x + PERSON_W + SPOUSE_GAP` after layout, but dagre never reserved that extra space, so the spouse can land on top of the anchor's right-hand sibling.

Fix: reserve the couple's combined footprint (`COUPLE_W = PERSON_W*2 + SPOUSE_GAP`) as the anchor's dagre node width *before* calling `dagre.layout`, so dagre's own nodesep spacing accounts for the couple slot. Convert dagre's returned center back to top-left using each node's *actual* width (COUPLE_W for anchors, PERSON_W for everyone else), then snap the mover into the right half of the anchor's reserved slot exactly as today.

Purpose: eliminate a visual node-overlap bug on the `/family` tree without changing the pure-hierarchical dagre model, the spouse-connector rendering, or any other module.
Output: one atomic commit to `familyTree.layout.js` + `familyTree.layout.test.js`, full frontend suite green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@frontend/src/components/family/familyTree.layout.js
@frontend/src/components/family/familyTree.layout.test.js

<interfaces>
<!-- Current full contents of familyTree.layout.js (67 lines) — the entire file to rewrite. No further exploration needed. -->

```js
import dagre from '@dagrejs/dagre';

const PERSON_W = 252;
const PERSON_H = 120;
const SPOUSE_GAP = 40;

export function layoutWithDagre(nodes, edges, options = {}) {
  const { rankdir = 'TB', nodesep = 60, ranksep = 90, edgesep = 10 } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep, edgesep });

  nodes.forEach((n) => {
    g.setNode(n.id, { width: PERSON_W, height: PERSON_H });
  });

  // Only rank direct parent->child edges in dagre. ...
  edges.forEach((e) => {
    if (e.type !== 'parent') return;
    g.setEdge(e.source, e.target, { minlen: 1, weight: 2 });
  });

  dagre.layout(g);

  const positions = new Map();
  nodes.forEach((n) => {
    const { x, y } = g.node(n.id);
    positions.set(n.id, { x: x - PERSON_W / 2, y: y - PERSON_H / 2 });
  });

  // Place spouses side by side: ...
  const memberById = new Map(nodes.map((n) => [n.id, n.data?.member]));
  const hasParent = (m) => Boolean(m && (m.mother || m.father));
  edges.forEach((e) => {
    if (e.type !== 'spouse') return;
    if (!positions.has(e.source) || !positions.has(e.target)) return;
    const sourceBlood = hasParent(memberById.get(e.source));
    const targetBlood = hasParent(memberById.get(e.target));
    const anchor = targetBlood && !sourceBlood ? e.target : e.source;
    const mover = anchor === e.source ? e.target : e.source;
    const anchorPos = positions.get(anchor);
    positions.set(mover, { x: anchorPos.x + PERSON_W + SPOUSE_GAP, y: anchorPos.y });
  });

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) || { x: 0, y: 0 } }));
}
```

Node/edge shapes consumed here (from `familyTree.assembly.js`'s `buildForest()`, unchanged by this plan): `nodes` are `{ id, type: 'member', data: { member } }`; `edges` are `{ id, source, target, type: 'parent' | 'spouse' }`. `member` has `mother`/`father` (nullable refs) used by `hasParent`.

Existing test file `familyTree.layout.test.js` (70 lines, 7 tests across 2 `describe` blocks) — see full contents already loaded in this session's file read. None of the current 7 tests assert an exact spouse x position, so no test literal needs correcting for the shift; the new work is purely additive (relative-invariant coverage was already implicit, this plan makes it explicit) plus the new overlap regression test.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reserve couple footprint in dagre so spouse never overlaps a sibling</name>
  <files>frontend/src/components/family/familyTree.layout.js, frontend/src/components/family/familyTree.layout.test.js</files>
  <behavior>
    - Existing 7 tests in familyTree.layout.test.js must keep passing unchanged in intent: ranking/rows by parent edges, spouse edges excluded from dagre ranking, field preservation, non-mutation, options pass-through.
    - New/updated invariant: for every spouse pair, mover.x === anchor.x + PERSON_W + SPOUSE_GAP and mover.y === anchor.y (relative invariant, robust to the anchor's slot widening).
    - New regression test: build a small forest where a bloodline anchor has (a) a sibling to its right and (b) a married-in spouse with no parents of their own. Run layoutWithDagre and assert that no two nodes' {x, y, PERSON_W, PERSON_H} axis-aligned rects intersect, checked pairwise across all returned nodes.
  </behavior>
  <action>
Rewrite `layoutWithDagre` in familyTree.layout.js per the diagnosed fix, keeping the module pure/DOM-free and preserving the exported `layoutWithDagre(nodes, edges, options)` signature and all existing exports/constants (`PERSON_W`, `PERSON_H`, `SPOUSE_GAP` values must not change).

Step 1 — compute spouse pairings before building dagre nodes: build `memberById` and `hasParent` exactly as they exist today (move this logic earlier in the function, before the `g.setNode` loop). Iterate `edges` for `type === 'spouse'`, applying the existing anchor/mover rule (anchor = bloodline partner via `hasParent`; ties fall back to `e.source`; mover = the other side). Build a `Set` named `anchorsWithSpouse` containing each pair's anchor id, and an array of `{ anchor, mover }` pairs for later use. Guard against a node holding both roles across multiple pairs: before adding a node as an anchor, skip it if it already appears as a mover in an earlier pair (and vice versa) — do not add it to `anchorsWithSpouse` or the pairs array in that case, leaving it to whatever position dagre/the later snap loop assigns it as an ordinary single node.

Step 2 — declare `const COUPLE_W = PERSON_W * 2 + SPOUSE_GAP;` near the other module constants. In the `nodes.forEach` that calls `g.setNode`, set `width: anchorsWithSpouse.has(n.id) ? COUPLE_W : PERSON_W` (height stays `PERSON_H` for every node, including anchors — only width changes). Movers and all other nodes keep `PERSON_W`.

Step 3 — leave the edges-to-dagre loop untouched: only `type === 'parent'` edges are fed to `g.setEdge`; spouse edges must continue to have zero influence on dagre ranking.

Step 4 — after `dagre.layout(g)`, when converting each node's returned center to top-left, use that node's actual width: for each node, compute `const w = anchorsWithSpouse.has(n.id) ? COUPLE_W : PERSON_W;` and set `positions.set(n.id, { x: x - w / 2, y: y - PERSON_H / 2 })` (using dagre's returned `x`/`y` center as today, just parameterizing the width term instead of hardcoding `PERSON_W / 2`).

Step 5 — the spouse-snap loop keeps its existing anchor/mover derivation logic and its existing snap formula unchanged: `positions.set(mover, { x: anchorPos.x + PERSON_W + SPOUSE_GAP, y: anchorPos.y })`. Because `anchorPos` is now the couple slot's left edge (from Step 4's wider-node conversion), the mover lands in the reserved right half of the couple slot, with the dagre-reserved `COUPLE_W` footprint preventing any neighboring node (sibling or otherwise) from being placed inside that span. You may reuse the `{ anchor, mover }` pairs array from Step 1 to drive this loop instead of re-deriving anchor/mover from `edges` a second time, as long as the resulting anchor/mover assignment and snap formula are identical to today's behavior.

Update the module's explanatory comments (currently lines 1-11 and the two inline comments above the dagre-node loop and the spouse-placement loop) to describe the couple-footprint reservation instead of the old "one PERSON_W slot per person" description — comments must stay accurate to the new code, not just survive verbatim.

In familyTree.layout.test.js: audit all 7 existing tests for any assertion on an exact spouse-anchor or spouse-mover x/y value; none currently assert exact spousal x per the interfaces note above, so no rewrite should be needed there — confirm this by inspection rather than assuming. If any exact-position assertion is found, replace it with the relative invariant `mover.x === anchor.x + PERSON_W + SPOUSE_GAP` and `mover.y === anchor.y`. Add ONE new test (in the existing "spouse edges excluded from dagre ranking" describe block, or a new describe block titled something like `layoutWithDagre — spouse/sibling overlap regression`) using a fixture with at least 3 members: a bloodline apex/parent with two children (one of whom is the spouse-pairing anchor, so it has a sibling on the same rank) and a spouse for that anchor with no parents/children of her own (e.g. reuse the shape of the existing `twoParentFixture`/flat fixtures — build via `buildForest()` from `familyTree.assembly.js`, same pattern every other test in the file already uses). After calling `layoutWithDagre`, iterate every pair of returned nodes and assert their `{x, y}` + fixed `252x120` rects do not intersect (standard AABB test: rects overlap only if `a.x < b.x + 252 && a.x + 252 > b.x && a.y < b.y + 120 && a.y + 120 > b.y`; assert this is false for every pair). This encodes "must never overlap in any condition," not just the specific bug scenario.
  </action>
  <verify>
    <automated>npm test --workspace frontend</automated>
  </verify>
  <done>familyTree.layout.js reserves COUPLE_W width for each spouse-pairing anchor's dagre node before layout, converts dagre centers to top-left using each node's actual width, and the mover-snap formula/anchor-mover derivation is otherwise unchanged; the spouse-edge-excluded-from-ranking behavior is untouched (only parent edges reach g.setEdge); familyTree.layout.test.js has a new regression test asserting zero pairwise rect overlap in a sibling+spouse fixture, and any pre-existing exact-position assertions (if found) are now relative invariants; `npm test --workspace frontend` passes in full (303+ tests, including familyTree.layout.test.js and FamilyTreeCanvas.test.jsx) with no failures.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

None — this is a pure client-side layout-math fix with no new input parsing, no new dependency, no change to data flow, auth, or API surface. `familyTree.layout.js` remains DOM-free and takes only already-validated `nodes`/`edges` produced by `familyTree.assembly.js`.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick260801hfw-01 | Denial of Service (degenerate layout) | `layoutWithDagre` multi-spouse guard | accept | The anchor/mover role guard (Step 1) prevents a node from being double-counted as both anchor and mover, which could otherwise produce conflicting/overlapping width reservations in rare multi-spouse data; guarded in code, covered by the new overlap regression test, no user input reaches this path directly (data is admin-curated family records). |
</threat_model>

<verification>
- `npm test --workspace frontend` passes in full after the change (no regressions in the 303 pre-existing tests, plus the new overlap regression test passes).
- `grep -n "COUPLE_W" frontend/src/components/family/familyTree.layout.js` shows the new constant is defined and used both in `g.setNode` width assignment and in the center-to-top-left conversion.
- Scope check: `git diff --stat` after the commit shows only `frontend/src/components/family/familyTree.layout.js` and `frontend/src/components/family/familyTree.layout.test.js` changed — no assembly, canvas, or component files touched, and `PERSON_W`/`PERSON_H`/`SPOUSE_GAP` values are unchanged (`grep -n "const PERSON_W\|const PERSON_H\|const SPOUSE_GAP"` still shows `252`, `120`, `40`).
</verification>

<success_criteria>
- One atomic commit containing only the layout.js fix and its test file update.
- `npm test --workspace frontend` is green (full suite, 303+ tests).
- A spouse node's 252x120 rect never overlaps any other node's rect in the new regression fixture (bloodline anchor with a right-hand sibling plus a married-in spouse), proven by an automated pairwise AABB assertion.
- Dagre ranking/rows are provably unaffected by spouse edges (existing "spouse edges excluded from dagre ranking" tests still pass unmodified in behavior).
</success_criteria>

<output>
Create `.planning/quick/260801-hfw-fix-family-tree-spouse-node-overlapping-/260801-hfw-SUMMARY.md` when done.
</output>
