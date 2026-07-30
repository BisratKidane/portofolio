# Phase 17: /family Deep Tree Visualization - Research

**Researched:** 2026-07-24
**Domain:** Client-side graph/tree visualization (React + @xyflow/react + dagre), GraphQL flat-read guard relaxation, Vitest/jsdom testability of canvas libraries
**Confidence:** MEDIUM (the core rendering-library choice is spike-gated per D-11; everything else is HIGH)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Focal point & scope**
- **D-01:** The tree is **one canonical top-down forest** — apex ancestors (members with no linked parents) at the top, generations descending. Every viewer sees the same structure; it is not re-rooted per user.
- **D-02:** On load, **auto-pan to and highlight the viewer's own node** ("jump-to-me"), plus a persistent "find me / recenter" control. Shared structure, personal landing point.
- **D-03:** **Primary lineage by default.** The lineage connected to the viewer renders on the initial canvas; other disconnected apex roots (e.g. an in-married spouse's separate parents) are collapsed/hidden behind an expander so the first paint stays focused.
- **D-04:** Initial expansion covers **both** (a) the ancestral spine — the single path from the apex ancestor down to the viewer — **and** (b) the viewer's own direct line: direct ancestors, direct descendants, spouse, and siblings. Collateral branches (cousins, aunts'/uncles' descendants) stay collapsed until clicked. Collapsed-by-default remains the rule for everything outside this expanded set (SC-3 performance).

**Navigation (all four aids)**
- **D-05:** Ship all of: **find-me/recenter button**, **name search + pan-to**, **explicit zoom controls + fit-to-view/reset**, and a **minimap**.
- **D-06:** ⚠ **Minimap is native to `@xyflow/react`.** If the SC-1 spike forces the `family-chart` fallback, minimap availability is library-dependent — planning must treat minimap as conditional on the xyflow path, not a hard requirement of the fallback.

**Node content & interaction**
- **D-07:** Each node shows **avatar + full name + birth–death years** (e.g. `1932–2001`). Avatar reuses the Phase 16 `MemberAvatarImage` (generic-person icon fallback).
- **D-08:** A node click opens a **read-only detail card** (popover/side-panel) with the member's full details (photo, dates, phone/address, relationships). `/family` stays a pure viewing surface — **no inline editing** (CUR-01 deferred).
- **D-09:** Node status markers: **(a) the viewer's own node is visually highlighted**, and **(b) a gender indicator** encodes `FamilyMember.gender` (Male/Female/Other). No deceased marker, no editable-scope marker. The gender cue must **not be color-only** (accessibility — pair color with an icon/shape/label).

**Layout & spouse pairing**
- **D-10:** **Vertical top-down** orientation (apex ancestors up top, descendants below; dagre `rankdir TB`).
- **D-11:** **Spike xyflow first, fallback ready (SC-1).** Spike the synthetic-union-node spouse-pairing pattern on **`@xyflow/react` + `@dagrejs/dagre`** against a realistic-depth fixture. If it renders correctly, build on it; drop to **`family-chart`** only if the spike genuinely fails. The full `/family` build does not start until the spike passes.
- **D-12:** The exact spouse-pairing visual (research's candidate: adjacent couple joined by a short marriage connector, shared children descending from a synthetic union node) and edge styling (marriage vs descent) are **spike-driven** — locked once the spike proves what the chosen library renders cleanly at depth.

**Backend query & gating**
- **D-13:** **Relax `familyMembers` from `requireAdmin` to `requireFamilyAccess`** so linked members and admins share one whole-tree read. This matches the app's established posture — **viewing is broad, writing stays scope-gated** (precedent: Phase 16 D-07/D-08). No mutation guards change; editable scope is unaffected.
- **D-14:** Consistency check for planning: relaxing the guard means a linked non-admin can now fetch the full member list via `familyMembers` (the query `ManagePage` already uses). This is intended per D-13. Verify no field on that payload leaks something that should stay admin-only; PII read-scope policy is flagged tech-debt (Phase 14 WR-10) — confirm it doesn't regress.
- **D-15:** `/family` route gating (TREE-04) **reuses the existing `<ProtectedRoute>`** (no `allowedRoles`), which already redirects unlinked non-admins to `/pending` (`frontend/src/components/ProtectedRoute.jsx:16`). Register `path="family"` alongside `dashboard`/`manage` under the same guard.

### Claude's Discretion
- **Flat payload shape (TREE-03):** whether edges travel as thin ID fields (`motherId`/`fatherId`/`spouseIds`) or as nested one-level `{id}` refs on the existing schema — planning picks once the resolver/DataLoader wiring is examined. Requirement: one query, no per-node N+1, client assembles the graph in memory.
- **Expand/collapse affordance:** how a node signals hidden branches (count badge vs plain toggle) — use whatever the chosen library renders cleanly at depth.
- **Spouse-pairing & edge styling (D-12):** spike-driven.
- **Component-test bar (QUAL-02):** default to **logic-heavy + render-smoke** — thoroughly unit-test the pure client-side graph assembly (flat nodes → tree, spouse pairing, collapse state, find-me/search targeting) and assert a render-smoke level for the canvas (nodes present, viewer highlighted, expand toggles state), mocking the layout lib where jsdom can't lay out SVG/absolute-positioned nodes. Adjust the exact split once the spike reveals the library's testability under jsdom.

### Deferred Ideas (OUT OF SCOPE)
- **Inline editing from tree nodes (CUR-01)** — considered via the node-click question; explicitly kept out (D-08). `/family` is read-only; editing stays on `/manage`. v2.
- **Editable-scope node marker + "Edit in /manage" deep-link** — offered during node-marker/click discussion, not selected. Could be revisited if the read-only card ever needs a bridge to editing.
- **Duplicate-merge tooling (CUR-02), multiple-marriage/half-sibling/adoption genealogy (GEN-01/02)** — out of scope per REQUIREMENTS.md; the model supports one mother/father + spouse only.
- **Browser E2E (Playwright/Cypress)** — out of scope; component + integration tests meet the safety-net bar.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TREE-01 | A linked member can view the family as a tree on `/family`, with spouses shown paired. | Architecture Patterns → synthetic-union-node spouse pairing on `@xyflow/react` + `@dagrejs/dagre`; `family-chart` fallback documented. |
| TREE-02 | Pan/zoom and collapsible/expandable branches; navigable at ~10–23 generation depth without jank. | Architecture Patterns → collapsed-by-default via `node.hidden`; Common Pitfalls → jank sources at depth; Standard Stack → xyflow built-in viewport culling. |
| TREE-03 | Populated by a single flat whole-graph query assembled client-side (no per-node N+1). | Architecture Patterns → flat payload shape decision (no schema change needed) + client-side forest-assembly algorithm; verified against Phase 14 DataLoader batching. |
| TREE-04 | `/family` reachable only by linked members and admins. | Code Examples → route registration under existing `<ProtectedRoute>` (D-15); Security Domain → guard relaxation verification (D-13/D-14). |
| QUAL-02 | New frontend pages/components (`/manage`, `/family`, pending gate) covered by component tests. | Validation Architecture → req-to-test map; Common Pitfalls → mocking `@xyflow/react` under jsdom (`mockReactFlow`). |
| QUAL-03 | CI stays green; family-tree suite enforced on every push/PR. | Validation Architecture → confirms existing `npm test --workspaces` + `.github/workflows/ci.yml` already enforce this with zero new CI config needed. |
</phase_requirements>

## Summary

Phase 17 has one real technical risk — the tree-rendering library — and everything else is a straightforward extension of patterns already proven in Phases 13–16. The backend side requires almost nothing new: `familyMembers` already returns every field the tree needs (`mother`, `father`, `spouses`, `children` are already resolver fields on `FamilyMember`, already DataLoader-batched per Phase 14's SC-5 flat-query-count guarantee), so TREE-03 is satisfied by a **one-line guard change** (`requireAdmin` → `requireFamilyAccess`, D-13) plus a client-side query that selects thin `{ id }` refs for `mother`/`father`/`spouses`/`children` — no SDL changes, no new loader, no new N+1 risk. The only backend gotcha is that an existing adversarial test (`familyMember.resolver.test.js`, `familyMembers (list)` → `'rejects a non-admin caller'`) hard-asserts the *old* `'Admin access is required.'` message and **will break** the moment D-13 lands; this is expected and must be red-green-refactored as part of this phase, not treated as a regression.

The frontend risk is real: `@xyflow/react` (v12.11.2, formerly React Flow, npm-verified, React 18/Vite 6 compatible) is the modern, actively maintained choice, paired with `@dagrejs/dagre` (v3.0.0, the maintained fork of the deprecated `dagre` package) for hierarchical `rankdir: TB` layout. Neither library has native "spouse/couple" semantics — dagre is a pure DAG-rank layout engine — so spouse-pairing must be engineered via a **synthetic union node**: an invisible/small node per couple, connected to both partners with a `minlen: 0` marriage edge (keeps the couple at the same rank) and to their shared children with a normal `minlen: 1` descent edge (pushes children down one generation). This is the standard technique used by genealogical layout tools (yFiles calls it a "family node"); it is not a single copy-pasteable official xyflow example, so the SC-1 spike must prove it renders cleanly at ~10–23 generations before the full page is built, exactly as D-11 requires. `family-chart` (v0.9.0, d3-based, purpose-built for genealogy) is a credible fallback with native couple/children rendering but no minimap and no first-party React wrapper — the CONTEXT.md's D-06 caveat about minimap being xyflow-only is correct and must be preserved in the plan.

Collapsed-by-default at depth is handled natively by xyflow's `node.hidden` property (documented pattern, distinct from removing nodes/edges from the array), and its own docs single out "a tree with 400 nodes that displays only 40 at a time performs identically to a 40-node tree" — meaning TREE-02's jank concern is real only if the initial expanded set (D-04's ancestral spine + direct line) is kept small, which the phase's own decisions already guarantee. Testing under jsdom requires an explicit `mockReactFlow()`-style setup (ResizeObserver, DOMMatrixReadOnly, `offsetWidth`/`offsetHeight`, `SVGElement.getBBox` polyfills) documented officially by the library — this is the load-bearing fact for QUAL-02's "render-smoke, mock the layout lib" plan, and the pure graph-assembly algorithm (flat list → forest → union pairing → generation ranks) should be extracted into a plain JS module so it can be unit-tested with zero DOM/canvas mocking at all.

**Primary recommendation:** Ship the SC-1 spike first on `@xyflow/react` 12.11.2 + `@dagrejs/dagre` 3.0.0 using the synthetic-union-node pattern described in Architecture Patterns below, gate the full `/family` build behind that spike passing, keep the backend change to the single guard-relaxation line plus a client-only flat query (no schema edits), and split QUAL-02 tests into a fully-mocked-DOM-free unit suite for graph assembly and a `mockReactFlow()`-based render-smoke suite for the canvas.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Whole-tree flat data fetch | API / Backend | — | `familyMembers` resolver + Phase 14 DataLoaders already return a flat, N+1-safe payload; only the guard changes (D-13). |
| Forest assembly (apex detection, generation ranking, union pairing) | Browser / Client | — | TREE-03 requires client-side assembly by design; pure function, no server involvement. |
| Hierarchical layout (x/y positions) | Browser / Client | — | `@dagrejs/dagre` runs entirely in the browser at render/collapse time; no server-side layout. |
| Tree rendering (pan/zoom/nodes/edges) | Browser / Client | — | `@xyflow/react` renders to the DOM/SVG in-browser; xyflow's own viewport culling handles large-graph performance. |
| Collapse/expand state | Browser / Client | — | Component state (React), driving `node.hidden`; no persistence requirement stated. |
| Route/access gating | Frontend Server (SSR: N/A — SPA) / API | Browser | `<ProtectedRoute>` is a client-side redirect (UX only); the real enforcement is `requireFamilyAccess` server-side on the GraphQL query (defense in depth, same pattern as `/manage`). |
| Avatar image fetch | Browser / Client | API / Backend | Reuses existing `MemberAvatarImage` + `photoClient.js` blob-fetch pattern (Phase 16); backend already serves photo bytes via `/api/family-members/:id/photo`. |
| PII read-scope on `familyMembers` payload | API / Backend | — | `linkedUser` field resolver already self-gates (ADMIN or self only, Phase 14); must be re-verified once callers are member-users, not just admins. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xyflow/react` | 12.11.2 [VERIFIED: npm registry, published by github.com/xyflow/xyflow] | Pannable/zoomable node-edge canvas, MiniMap, Controls, viewport culling | The maintained successor to `react-flow-renderer` (deprecated) / `reactflow` (renamed); 9.1M weekly downloads; peer deps `react >=17`/`react-dom >=17` — compatible with the project's React 18.3. |
| `@dagrejs/dagre` | 3.0.0 [VERIFIED: npm registry, published by github.com/dagrejs/dagre] | Hierarchical DAG rank/position layout (`rankdir: TB`) | Standard pairing with React Flow for tree/hierarchy layouts (documented in xyflow's own "Dagre Tree" example); the legacy `dagre` package (0.8.5) is community-maintained-only — `@dagrejs/dagre` is the actively maintained scoped fork. 3.6M weekly downloads. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mui/icons-material` | ^6.3.1 (already installed) | `MaleRounded`/`FemaleRounded`/`TransgenderRounded` icons for the non-color-only gender indicator (D-09) | Already a project dependency (used elsewhere for `PersonRounded` in `MemberAvatarImage.jsx`) — confirmed present in the installed package: `Male.js`, `MaleRounded.js`, `Female.js`, `FemaleRounded.js`, `Transgender.js`, `TransgenderRounded.js` all exist. No new install. |

### Fallback (spike-conditional, D-11)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `family-chart` | 0.9.0 [VERIFIED: npm registry, published by github.com/donatso/family-chart] | Purpose-built genealogy tree renderer (d3-based) with native couple/children pairing | **Only if the SC-1 spike on `@xyflow/react` + `@dagrejs/dagre` genuinely fails.** Framework-agnostic (no first-party React wrapper — integrate as an escape-hatch DOM-managed component, e.g. inside a `useEffect` mounting into a ref'd container). Built-in zoom/pan; **no minimap** (D-06 caveat confirmed: minimap is xyflow-only). Single dependency (`d3` ^7.9.0), 0.9.0 currently active, ~3.4k weekly downloads (small but real, single maintainer, MIT-equivalent ISC license, active repo). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@xyflow/react` + `@dagrejs/dagre` synthetic-union-node pattern | Plain dagre layout with parent→child edges only, spouse edges drawn as a separate straight overlay line at the same rank (no union node) | Simpler to implement, no union-node bookkeeping — but does not give children a single convergence point when both parents are known (produces a "V" into the child from two separate edges), which is visually noisier at deep generations and doesn't match D-12's candidate design. Documented as a common alternative in community write-ups (e.g. tva.sg's ReactFlow family-tree article) but not what D-11/D-12 asked to be spiked. |
| `@dagrejs/dagre` | `elkjs` (v0.12.0) or `d3-hierarchy` | Both are valid alternative layout engines xyflow's own docs mention (used in their Pro "Auto Layout" example alongside dagre) — elk in particular handles some edge-crossing-minimization cases better, but dagre is the lowest-friction, most-documented choice for a first spike and is what D-11 explicitly names. |
| `family-chart` as primary | `react-family-tree` / `relatives-tree` (SanichKotikov) | Framework-native React component (unlike family-chart's vanilla-JS core) and a documented `left`/`top` position + `renderNode` callback API — but its underlying layout algorithm and union-node/couple-pairing internals are not clearly documented from the public README, and it's a much smaller ecosystem (lower confidence than family-chart as a fallback). Not recommended as primary or fallback; noted only as a rejected alternative. |

**Installation:**
```bash
npm install @xyflow/react @dagrejs/dagre --workspace frontend
```
(family-chart is NOT installed up front — only add it if the SC-1 spike fails and the fallback path is taken, per D-11's "spike first" gate.)

**Version verification:** Verified live against the npm registry during this research session (2026-07-24):
```
@xyflow/react   12.11.2   (created 2024-01-03, repo github.com/xyflow/xyflow)
@dagrejs/dagre   3.0.0    (created 2017-12-26, repo github.com/dagrejs/dagre)
family-chart     0.9.0    (created 2020-12-26, repo github.com/donatso/family-chart)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads (last 7 days) | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------------------|-------------|-----------|-------------|
| `@xyflow/react` | npm | ~2.5 yrs | 9,120,694/wk | github.com/xyflow/xyflow | [OK] | Approved |
| `@dagrejs/dagre` | npm | ~8.5 yrs | 3,586,990/wk | github.com/dagrejs/dagre | [OK] | Approved |
| `family-chart` | npm | ~5.5 yrs | 3,448/wk | github.com/donatso/family-chart | [OK] | Approved (fallback-only, do not install unless spike fails) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none — `family-chart`'s low download count (~3.4k/wk) is noted for awareness (single maintainer, small ecosystem) but slopcheck rated it `[OK]` (established repo, real history, real installs), so it is not flagged `[SUS]`.

*Note on how this was verified: `slopcheck install <pkgs>` was run to obtain the `[OK]` verdicts above. That subcommand's name is misleading — it actually executes `npm install` as a side effect. This accidentally modified the repo root's `package.json`/`package-lock.json` during research; the change was immediately reverted with `git checkout -- package.json package-lock.json` before this document was written, and no packages are installed in the repo as of this research. The planner must perform the actual `npm install --workspace frontend` as an explicit task.*

## Architecture Patterns

### System Architecture Diagram

```text
Browser (React SPA, /family route)
  │
  ▼
[FamilyTreePage] ──mount──▶ [ProtectedRoute] (D-15: reused, no allowedRoles)
  │
  ▼ (on mount)
graphqlRequest(FAMILY_TREE_QUERY)  ──POST /graphql──▶ Apollo Server
  │                                                        │
  │                                                        ▼
  │                                          familyMembers resolver
  │                                          requireFamilyAccess(user)  ◀── D-13 (was requireAdmin)
  │                                                        │
  │                                                        ▼
  │                                    models.FamilyMember.findAll()  (top-level, 1 query)
  │                                          │  mother/father/spouses/children field resolvers
  │                                          │  → loaders.memberById / childrenByParentId /
  │                                          │    spousesByMemberId  (DataLoader batch, 1 query
  │                                          │    PER FIELD TYPE across ALL members — flat, no N+1,
  │                                          │    proven by Phase 14 SC-5)
  │                                                        ▼
  │  ◀────────────── flat FamilyMember[] with { mother:{id}, father:{id}, spouses:[{id}], children:[{id}] }
  ▼
buildForest(flatMembers)                  [pure JS, unit-testable, zero DOM]
  │  1. apex-ancestor detection (mother==null && father==null)
  │  2. generation ranking (BFS/Kahn from apex roots, DAG guaranteed cycle-free
  │     by backend wouldCreateCycle — Phase 12)
  │  3. union-node synthesis (one per spouse pair / per co-parent pair with children)
  │  4. primary-lineage vs. other-apex-root partition (D-03)
  │  5. initial expand-set computation: ancestral spine + viewer direct line (D-04)
  ▼
{ nodes, edges } (xyflow shape)  ──▶  layoutWithDagre(nodes, edges)  [@dagrejs/dagre, rankdir TB]
  │
  ▼
<ReactFlow nodes edges> + <MiniMap/> + <Controls/> + <Panel> (search, find-me, zoom)
  │
  ├─ onNodeClick → read-only detail popover/side-panel (D-08, fetches nothing new — data already in memory)
  ├─ collapse toggle → sets node.hidden on descendants, re-runs dagre on VISIBLE subset only
  └─ jump-to-me / search → useReactFlow().setCenter(x, y, { zoom, duration }) or fitView({ nodes: [{id}] })
```

### Recommended Project Structure
```
frontend/src/
├── pages/
│   └── FamilyTreePage.jsx         # route component: fetch + orchestrate, mounts <ReactFlowProvider>
├── components/
│   └── family/
│       ├── FamilyTreeCanvas.jsx    # <ReactFlow> wrapper: MiniMap, Controls, Panel (search/find-me)
│       ├── MemberNode.jsx          # custom node: MemberAvatarImage + name + years + gender icon
│       ├── UnionNode.jsx           # tiny/invisible synthetic node rendering the marriage connector
│       ├── MemberDetailPanel.jsx   # D-08 read-only popover/side-panel
│       └── familyTree.assembly.js  # PURE module: buildForest(), rankGenerations(), pairSpouses(),
│                                    #   computeInitialExpandSet() — no React, no DOM, unit-tested directly
└── api/
    └── (reuses existing graphqlClient.js — no new transport)
```

### Pattern 1: Flat query, no schema change (TREE-03)
**What:** Reuse the existing `FamilyMember` GraphQL type's `mother`/`father`/`spouses`/`children` fields (already declared, already DataLoader-backed per Phase 14) with a thin `{ id }` sub-selection instead of full nested objects, in a single top-level `familyMembers` call.
**When to use:** Always — this is the recommended TREE-03 resolution to the "Claude's Discretion" flat-payload-shape question. No SDL change, no new loader, no new resolver.
**Why it's N+1-safe:** GraphQL resolves the `mother` field resolver once per row in the top-level list (e.g. 300 calls for 300 members), but every call synchronously does `loaders.memberById.load(id)`. DataLoader batches all `.load()` calls issued within the same tick into ONE `WHERE id IN (...)` query. The same applies per field type (`spouses`→1 query via `spousesByMemberId`, `children`→1 query via `childrenByParentId`). Total SQL query count is O(field types), not O(members) — exactly the invariant Phase 14's SC-5 test already locks in.
**Example:**
```graphql
# Source: existing schema (backend/src/schemas/familyMember.schema.js) — no changes needed
query FamilyTree {
  familyMembers {
    id firstname lastname fullname gender birthdate deathdate photoUrl
    mother { id }
    father { id }
    spouses { id }
    children { id }
  }
}
```
Siblings are NOT requested — they are derivable client-side from shared `mother.id`/`father.id` (same either-parent rule as the backend's D-03 sibling derivation), avoiding one extra loader round-trip in the payload for data the client already has.

### Pattern 2: Synthetic union node for spouse pairing (D-11/D-12 spike target)
**What:** For every distinct couple (spouse pair, or co-parent pair inferred from a shared child), synthesize an extra graph node (not a real `FamilyMember`) that sits between the two partners. Connect each partner to the union node with a `minlen: 0` "marriage" edge (dagre keeps same-rank endpoints when `minlen` is 0) and connect the union node to each shared child with a normal `minlen: 1` "descent" edge (default rank-per-generation).
**When to use:** This is the exact pattern named in D-11/D-12; it is the SC-1 spike's subject. It is engineered from documented dagre primitives (`minlen`, `weight` on `setEdge`) plus the general "family/union node" technique used in commercial genealogical layout engines (e.g. yFiles' `FamilyTreeLayout`, which explicitly models "family nodes" as predecessors of children and successors of parents) — it is not a single copy-pasteable official xyflow tutorial, hence the spike gate.
**Example:**
```javascript
// Source: synthesized from dagre's documented setEdge options
// (github.com/dagrejs/dagre/wiki — minlen/weight) + the union-node genealogical
// layout pattern (yworks.com family-tree-layout docs) — MEDIUM confidence,
// validate visually in the SC-1 spike before locking (D-12).
import dagre from '@dagrejs/dagre';

const PERSON_W = 180, PERSON_H = 64;
const UNION_W = 24, UNION_H = 24; // small connector node, not a real person

function layoutWithDagre(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 60 });

  nodes.forEach((n) => {
    const isUnion = n.type === 'union';
    g.setNode(n.id, { width: isUnion ? UNION_W : PERSON_W, height: isUnion ? UNION_H : PERSON_H });
  });

  edges.forEach((e) => {
    // marriage edge: partner -> union, minlen 0 keeps the union node at the SAME
    // rank as its partners (no visual gap before the couple's children).
    // descent edge: union -> child, default minlen 1 pushes children one full
    // generation down, weight 2 pulls children tight under the union horizontally.
    g.setEdge(e.source, e.target, {
      minlen: e.type === 'marriage' ? 0 : 1,
      weight: e.type === 'marriage' ? 1 : 2
    });
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    const w = n.type === 'union' ? UNION_W : PERSON_W;
    const h = n.type === 'union' ? UNION_H : PERSON_H;
    return { ...n, position: { x: x - w / 2, y: y - h / 2 } };
  });
}
```
**Dagre defaults for reference** [CITED: github.com/dagrejs/dagre/wiki]: `rankdir=TB`, `nodesep=50`, `ranksep=50`, `edgesep=10`, edge `minlen=1`, edge `weight=1`.

### Pattern 3: Collapse-by-default via `node.hidden` (TREE-02/SC-3)
**What:** xyflow nodes/edges support a `hidden` boolean; setting it toggles DOM rendering without removing the node from the layout data structure. The library's own performance guidance states a "tree with 400 nodes that displays only 40 at any given time performs identically to a 40-node tree" [CITED: reactflow.dev/learn/advanced-use/performance + community implementation write-ups].
**When to use:** Every branch outside the D-04 initial-expand set (ancestral spine + viewer's direct line) starts with `hidden: true` on its nodes AND the edges leading to them. Re-run `layoutWithDagre` on the currently-visible subset only when expand/collapse state changes (not on every render) — memoize with `useMemo` keyed on the visible-id-set, not the full flat list.
**Example:**
```javascript
// Source: pattern confirmed via reactflow.dev's official "Hidden"/"Expand and Collapse"
// examples (github.com/xyflow/xyflow discussion #1265, reactflow.dev/examples/nodes/hidden)
const visibleNodes = useMemo(
  () => allNodes.map((n) => ({ ...n, hidden: !expandedIds.has(n.id) })),
  [allNodes, expandedIds]
);
```

### Pattern 4: Jump-to-me / search-and-pan (D-02/D-05)
**What:** `useReactFlow()` exposes `getNode(id)`, `setCenter(x, y, options)`, and `fitView(options)`. `fitView({ nodes: [{ id: targetId }], duration: 400 })` frames a specific node; `setCenter` centers the viewport on arbitrary coordinates.
**Example:**
```javascript
// Source: reactflow.dev/api-reference/hooks/use-react-flow
const { fitView, getNode } = useReactFlow();

function jumpToMe(memberId) {
  const node = getNode(memberId);
  if (!node) return; // node may be inside a collapsed branch — expand first, then retry
  fitView({ nodes: [{ id: memberId }], duration: 400, maxZoom: 1.2 });
}
```
**Gotcha:** if the target node is inside a currently-collapsed branch, it won't exist in the *visible* node set passed to `<ReactFlow>` and `getNode` may return `undefined` for a hidden-but-present node depending on how "hidden" is implemented (filtered out of the array vs. `hidden: true` flag) — the D-04/name-search flow must first walk up the ancestor chain, force those branches' `expandedIds` open, then call `fitView` on the next tick (`requestAnimationFrame` or a `useEffect` keyed on `expandedIds`).

### Anti-Patterns to Avoid
- **Running dagre on every render:** dagre layout is synchronous and O(nodes+edges) but not free at ~hundreds of nodes; recompute only when the *visible* node/edge set changes (expand/collapse, initial load), not on pan/zoom/selection.
- **Fetching relationship data per-node on click:** the flat query already contains every member's core fields; the D-08 detail panel should read from the already-fetched in-memory map, not issue a new `graphqlRequest` per click.
- **Storing collapse state in URL/localStorage without a plan:** not required by any decision — keep it in component state unless a later requirement demands persistence; over-engineering this adds untested surface area.
- **Treating `family-chart` as a drop-in xyflow replacement:** it has a different mounting model (imperative DOM node, not a React component tree) — if the fallback is taken, the page-level integration code changes shape, not just the "engine," so budget for that in planning if D-11's spike fails.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hierarchical tree layout (x/y positions per generation) | A custom recursive positioning algorithm | `@dagrejs/dagre`'s rank algorithm | Dagre already solves rank assignment, edge-crossing minimization, and node ordering — a hand-rolled version would need to reinvent all three to avoid an unreadable tree at 10–23 generations. |
| Pan/zoom/viewport math | Custom `transform: translate()`/`scale()` mouse-drag handlers | `@xyflow/react`'s built-in viewport | xyflow already handles touch, wheel-zoom, drag-to-pan, and viewport-relative coordinate conversion (`screenToFlowPosition`) correctly across browsers — this is exactly the kind of "deceptively complex" problem (inertia, zoom-to-cursor math, touch gesture conflicts) that eats days if hand-rolled. |
| Minimap | A custom scaled-down SVG overview | `@xyflow/react`'s `<MiniMap>` | Ships free with xyflow, already wired to the same viewport state — D-05 requires a minimap and D-06 already flags it as xyflow-native; building one manually only makes sense if the fallback library is taken. |
| Cycle-safety in the tree data | Re-deriving cycle checks on the frontend | Trust the backend's Phase 12 `wouldCreateCycle` guard | The flat graph the client assembles is guaranteed to be a DAG by write-time backend validation; the client-side forest-assembly algorithm can assume no cycles and doesn't need its own cycle-detection pass (though a defensive max-depth guard in the generation-ranking BFS is cheap insurance against a future data-integrity bug). |

**Key insight:** every piece of this phase that "looks hard" (layout math, viewport interaction, minimap) already has a dedicated, actively-maintained library solving it — the only genuinely novel code this phase needs to write is the ~100-line pure `familyTree.assembly.js` module (flat list → forest → union pairing → generation ranks → initial expand set), which is exactly the part that should be unit-tested most thoroughly per QUAL-02.

## Common Pitfalls

### Pitfall 1: Existing adversarial test breaks on D-13's guard change
**What goes wrong:** `backend/src/resolvers/familyMember.resolver.test.js`'s `familyMembers (list)` → `it('rejects a non-admin caller', ...)` asserts `errors[0].message === 'Admin access is required.'` for a `USER` role caller. Once the resolver's guard changes from `requireAdmin(user)` to `requireFamilyAccess(user)`, a linked non-admin will now **succeed**, and only a truly unlinked non-admin will be rejected — with a different message (`'Your account is not yet linked to a family member.'`).
**Why it happens:** the test was written correctly for Phase 13's `familyMembers` behavior and has been stable since; D-13 is a deliberate, in-scope behavior change to this exact guard.
**How to avoid:** treat this as an expected TDD red-green step, not a regression to work around. Update the test FIRST (red: new expected behavior, still failing against old code), then flip the resolver guard (green). Add a new adversarial case alongside it: unlinked-non-admin still rejected, with the updated message.
**Warning signs:** if the backend suite goes from 319→318 or shows this specific test failing after the guard change, that's the expected/required breakage — do not "fix" it by reverting the guard.

### Pitfall 2: jsdom cannot lay out `@xyflow/react`'s absolutely-positioned/SVG DOM
**What goes wrong:** React Flow measures DOM nodes (`ResizeObserver`, `offsetWidth`/`offsetHeight`, `getBBox()` on SVG elements) to compute edge paths. jsdom implements none of these by default, so naive RTL renders of `<ReactFlow>` either throw or silently render zero edges/misplaced nodes.
**Why it happens:** jsdom is not a real layout/rendering engine — it has no CSS box model or SVG geometry implementation.
**How to avoid:** apply the library's own documented `mockReactFlow()` setup (ResizeObserver polyfill, `DOMMatrixReadOnly` polyfill, `offsetHeight`/`offsetWidth` getters keyed off inline style, `SVGElement.prototype.getBBox` stub) in a Vitest setup file, called once (or in `beforeEach`). Then `await waitFor(...)` before asserting on edges, since node measurement happens asynchronously even with the mocks. [CITED: reactflow.dev/learn/advanced-use/testing]
**Warning signs:** tests that render `<ReactFlow>` and immediately assert on `.react-flow__edge` counts without `waitFor` will flake or silently pass with 0 edges found (if the assertion is loose) or fail (if strict).

### Pitfall 3: Dragging/mouse-based node interactions are unreliable under RTL + jsdom
**What goes wrong:** xyflow uses `d3-drag` internally for node dragging and pan-on-drag; simulated mouse events in jsdom don't reliably trigger d3's pointer-event-based drag lifecycle, causing drag-dependent tests to be flaky or silently no-op.
**Why it happens:** `d3-drag` listens for real pointer capture semantics that jsdom's synthetic event system doesn't fully emulate.
**How to avoid:** since `/family` is read-only (D-08 — no dragging is a product requirement, not just a test convenience), disable `nodesDraggable={false}` and `panOnDrag` interactions aren't required to be tested at all — test click (`onNodeClick`) and programmatic viewport calls (`fitView`, `setCenter`) instead, both of which are plain function calls, not simulated gestures. [CITED: reactflow.dev/learn/advanced-use/testing]
**Warning signs:** a component test that tries to simulate a drag-to-pan gesture and asserts on resulting viewport position is testing a feature this phase doesn't even ship — a smell that the test is over-scoped.

### Pitfall 4: Union node accidentally getting its own generation rank
**What goes wrong:** if the marriage edge (partner → union) is registered with dagre's default `minlen: 1` (instead of `0`), dagre will place the union node one full rank BELOW the couple, visually pushing a gap between the parents and the union/children — producing a broken-looking extra "generation" that doesn't exist in the data.
**Why it happens:** dagre's default edge `minlen` is 1 (documented default); it must be explicitly overridden to 0 for marriage edges to keep same-rank placement.
**How to avoid:** always pass `{ minlen: 0 }` explicitly on marriage edges (partner→union) and leave `{ minlen: 1 }` (the default, can be omitted) on descent edges (union→child). This is the crux of the D-11 spike — verify it visually before locking D-12.
**Warning signs:** the rendered tree shows a visible empty row between every couple and their children.

### Pitfall 5: Forgetting the mandatory xyflow stylesheet import
**What goes wrong:** without `import '@xyflow/react/dist/style.css'`, nodes/edges/controls render with broken/absent positioning and styling (not just "unstyled" — core layout CSS lives in this file, not just cosmetic theming).
**Why it happens:** xyflow ships its structural CSS separately rather than injecting it via JS, by design (so consumers can override it), but it is not optional for a working canvas.
**How to avoid:** import it once at the top of the tree page or canvas component; per the library's own migration guidance, import it after any global CSS reset/framework stylesheet (MUI/Emotion inject at runtime so ordering conflicts are unlikely here, but keep the import at the top of `FamilyTreeCanvas.jsx`).
**Warning signs:** nodes stacked at `(0,0)`, MiniMap/Controls render as unstyled raw buttons, edges missing entirely.

### Pitfall 6: `familyMembers`'s existing `linkedUser` field resolver already self-gates — must be re-verified, not re-implemented
**What goes wrong:** D-14 asks planning to confirm the guard relaxation doesn't leak admin-only data. It's tempting to add a new gating layer.
**Why it happens:** the temptation is reasonable given D-13 broadens who can call `familyMembers` at all.
**How to avoid:** re-read `backend/src/resolvers/familyMember.resolver.js`'s `FamilyMember.linkedUser` field resolver — it already returns `null` unless `user?.role === 'ADMIN' || linked.id === user?.id` (Phase 14 CR-01 fix). This logic is keyed on the **caller's** identity, not a query-level guard, so it is unaffected by D-13 and already prevents a linked non-admin from enumerating other users' `email`/`role` through the tree query. Do NOT request `linkedUser` in the tree's flat query at all (the tree UI doesn't need it) — this is both simpler and removes any temptation to bypass the existing per-field check. Write a regression test proving a linked non-admin's `familyMembers` query with `linkedUser { email }` still returns `null` for members that aren't themselves.
**Warning signs:** a plan task that proposes adding a NEW admin-only field-level guard where one already exists (duplicated logic = drift risk).

## Code Examples

### Route registration (D-15, TREE-04)
```jsx
// Source: frontend/src/App.jsx (existing file, exact insertion point)
<Route element={<ProtectedRoute />}>
  <Route path="dashboard" element={<Dashboard />} />
  <Route path="manage" element={<ManagePage />} />
  <Route path="family" element={<FamilyTreePage />} />
</Route>
```

### Backend guard relaxation (D-13)
```javascript
// Source: backend/src/resolvers/familyMember.resolver.js:13-16 (current, requires the one-line change)
familyMembers: async (_parent, _args, { models, user }) => {
  requireFamilyAccess(user); // was: requireAdmin(user)
  return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
},
```
`requireFamilyAccess` is already imported in this file (line 1) — no new import needed.

### Testing setup — mockReactFlow (QUAL-02)
```javascript
// Source: reactflow.dev/learn/advanced-use/testing (official guidance), adapted to
// this project's existing Vitest + jsdom setup (frontend/vitest.config.js)
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
Call `mockReactFlow()` once (module scope guard, or in `beforeEach`) in the `/family` canvas test file — NOT globally in a shared setup file, to avoid polluting unrelated test files' `HTMLElement` prototype.

### Pure graph-assembly unit test shape (QUAL-02, DOM-free)
```javascript
// Source: this project's own conventions (Vitest, describe/it, colocated *.test.js)
// familyTree.assembly.test.js — zero DOM/xyflow mocking required, pure function I/O.
import { describe, it, expect } from 'vitest';
import { buildForest } from './familyTree.assembly.js';

describe('buildForest', () => {
  it('assigns generation 0 to apex ancestors (no mother, no father)', () => {
    const flat = [{ id: '1', mother: null, father: null, spouses: [], children: [] }];
    const { generations } = buildForest(flat);
    expect(generations.get('1')).toBe(0);
  });

  it('creates one union node per spouse pair and routes shared children to it', () => {
    const flat = [
      { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
      { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [{ id: '3' }] },
      { id: '3', mother: { id: '1' }, father: { id: '2' }, spouses: [], children: [] }
    ];
    const { nodes, edges } = buildForest(flat);
    const union = nodes.find((n) => n.type === 'union');
    expect(union).toBeTruthy();
    expect(edges.filter((e) => e.target === union.id && e.type === 'marriage')).toHaveLength(2);
    expect(edges.some((e) => e.source === union.id && e.target === '3' && e.type === 'descent')).toBe(true);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `react-flow-renderer` package | `reactflow` → now `@xyflow/react` (scoped) | `reactflow` renamed at v11 (2023); rebranded to `@xyflow/react` under the xyflow org for v12 (2024) | Any tutorial or Stack Overflow answer referencing `react-flow-renderer` or bare `reactflow` imports is stale — this project must use `@xyflow/react` (current, v12.11.2) and its v12 API (`<ReactFlow>` from `@xyflow/react`, not `react-flow-renderer`). |
| Community `dagre` (unscoped npm package, 0.8.5) | `@dagrejs/dagre` (scoped fork, 3.0.0) | The `dagrejs` org took over active maintenance; `dagre` unscoped has had no major-version activity in years relative to the scoped fork | Use `@dagrejs/dagre`, not `dagre` — same API surface, actively maintained. |

**Deprecated/outdated:** `react-flow-renderer` (explicitly deprecated on npm, points users to `reactflow`/`@xyflow/react`) — do not use, do not follow tutorials built on it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The synthetic-union-node + `minlen:0`/`minlen:1` dagre edge pattern will render cleanly at ~10–23 generations without manual tuning beyond `nodesep`/`ranksep` | Architecture Patterns → Pattern 2 | This is precisely why D-11 mandates a spike before the full build — if the pattern needs heavier customization (e.g. custom rank constraints per union, or dagre simply can't keep dense sibling clusters readable at depth), the spike is designed to surface that BEFORE the full page is built, and D-11's fallback to `family-chart` is the documented mitigation. Risk is explicitly owned by the phase's own gate, not hidden. |
| A2 | `family-chart`'s React integration (no first-party wrapper, imperative DOM mount) will be straightforward to wire into this project's React 18 SPA if the fallback is needed | Standard Stack → Fallback table | If integration friction is higher than expected (e.g. re-render/cleanup lifecycle conflicts with React's reconciliation), the fallback cost is higher than currently estimated — this only matters if the spike fails, and should be re-scoped at that point, not now. |
| A3 | The client-side sibling-derivation (either-parent rule mirrored from backend D-03) doesn't need its own query field — computing it from the already-fetched `mother.id`/`father.id` map is both correct and sufficient for the D-08 detail panel | Architecture Patterns → Pattern 1 | Low risk — this is a straightforward re-implementation of a rule already tested server-side (Phase 14); a discrepancy would only occur from a coding mistake, not missing information. |

## Open Questions (RESOLVED)

1. **Does the D-04 "ancestral spine + viewer direct line" initial-expand computation need to run in the same pass as generation-ranking, or as a second pass over the already-ranked forest?**
   - What we know: generation ranking must happen first (it needs the full apex-to-leaf structure to be meaningful); the ancestral-spine walk is a single root-to-viewer path, and the direct-line set (parents/spouse/children/siblings) is a 1-hop neighborhood around the viewer — both are cheap to compute once the parent/child adjacency map exists.
   - What's unclear: whether "ancestral spine" should include only ONE apex-to-viewer path (if the viewer has multiple apex ancestors via different lineage branches — e.g. two disconnected apex roots that later merge through a marriage) or all such paths.
   - Recommendation: planning should treat this as an implementation detail of `computeInitialExpandSet()`, default to "the shortest/most direct such path via the viewer's own mother/father chain," and note it as a candidate for a dedicated unit test with a fixture that has more than one apex-reachable path to the viewer, since the real family data (~10-23 generations, single-family scale) makes this a plausible real case, not just an edge case.
   - **RESOLVED (Plan 17-02, Task 1):** `computeInitialExpandSet()` runs as a second pass over the already-ranked forest and expands only the viewer's single most-direct apex path, preferring the viewer's **mother's** chain when multiple apex paths exist. A dedicated unit test covers the multi-apex-path fixture. A spouse's own separate parent chain is deliberately EXCLUDED from the initial expand set — 17-03's ancestor-direction reveal badge is the intended discoverable path to it (D-03), not auto-expansion.

2. **What exact fixture size proves the SC-1 spike "genuinely fails" vs. "needs tuning"?**
   - What we know: the roadmap/CONTEXT specify "realistic ~10–23 generation depth" as the fixture target; no specific node-count-per-generation or total-node-count threshold is given.
   - What's unclear: whether the spike's pass/fail bar is purely visual (a human looks at the render and judges it readable) or has a quantifiable criterion (e.g. render completes under N ms, no overlapping nodes at default zoom).
   - Recommendation: the plan should specify the spike's fixture (suggest: a synthetic generator producing ~15-20 generations, 1-3 children per couple, occasional multi-generation-skip via a lone apex in-married spouse) and a concrete pass bar (visual: no overlapping person cards at default zoom; functional: initial paint completes without a frozen/janky interaction) before the spike task is written, since "genuinely fails" is currently a judgment call reserved for whoever runs the spike.
   - **RESOLVED (Plan 17-02, Task 3):** the spike fixture is a synthetic generator producing ~15–20 generations, 1–3 children per couple, with occasional generation-skips via a lone apex in-married spouse. Pass bar is concrete: **visual** — no overlapping person cards at default zoom, couples render paired via a shared union node with children descending from it; **functional** — initial paint completes without a frozen/janky interaction. This gate is enforced by a `checkpoint:human-verify` task (D-11 hard gate).

## Environment Availability

No new external tools, runtimes, or services are required beyond what prior phases already verified (Node 18.x/24.x per `engines`, npm workspaces, MySQL via Docker Compose, GitHub Actions). This phase's only new dependencies are npm packages (`@xyflow/react`, `@dagrejs/dagre`, conditionally `family-chart`), which install via the existing `npm install --workspace frontend` flow — no environment probing needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 + React Testing Library 16.3.2 + jsdom 26 (frontend); Vitest 4.1.10 (backend, integration via `graphql()` test helper) — both already installed, no new framework |
| Config file | `frontend/vitest.config.js`, `backend/vitest.config.js` (existing) |
| Quick run command | `npm test --workspace frontend -- FamilyTree` (or `npm test --workspace backend -- familyMember.resolver`) |
| Full suite command | `npm test --workspaces` (root — this is exactly what `.github/workflows/ci.yml` already runs) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TREE-01 | Spouses render paired via a union node with marriage + descent edges | unit (assembly) + render-smoke | `npm test --workspace frontend -- familyTree.assembly` / `-- FamilyTreeCanvas` | ❌ Wave 0 |
| TREE-02 | Collapsed-by-default; expand/collapse toggles `node.hidden`; pan/zoom controls present | render-smoke | `npm test --workspace frontend -- FamilyTreeCanvas` | ❌ Wave 0 |
| TREE-03 | `familyMembers` returns a flat, N+1-safe payload; forest assembly derives full graph client-side with no extra fetches | integration (backend query-count) + unit (assembly) | `npm test --workspace backend -- familyMember.resolver` / `npm test --workspace frontend -- familyTree.assembly` | Partial — backend query-count pattern exists from Phase 14 SC-5, extend it; frontend assembly file is new (❌ Wave 0) |
| TREE-04 | `/family` gated identically to `/manage`/`dashboard`; unlinked non-admin redirected to `/pending` | component (route) + backend adversarial | `npm test --workspace frontend -- ProtectedRoute` (extend existing) / `npm test --workspace backend -- familyMember.resolver` | ProtectedRoute.test.jsx exists (extend); backend adversarial test exists but needs updating per Pitfall 1 |
| QUAL-02 | `/family` page/components have component-test coverage (unit + render-smoke); `/manage`/pending already covered | unit + render-smoke | `npm test --workspace frontend` | `/manage` (ManagePage.test.jsx) and `/pending` (Pending.test.jsx) already exist and pass — only `/family` files are new (❌ Wave 0) |
| QUAL-03 | Family-tree suite runs and is enforced on every push/PR; CI stays green | CI enforcement (no new test type) | `npm test` (root, matches `.github/workflows/ci.yml` step exactly) | ✅ — CI workflow already runs `npm ci && npm test` on `[push, pull_request]`; NO new CI config needed, this requirement is satisfied automatically once the new tests are added to the existing frontend/backend workspaces. |

### Sampling Rate
- **Per task commit:** targeted `npm test --workspace frontend -- <pattern>` / `npm test --workspace backend -- <pattern>` on the touched file(s)
- **Per wave merge:** `npm test --workspaces` (full suite, matches CI exactly)
- **Phase gate:** full suite green (backend currently 319 tests, frontend currently 115 tests, both green per STATE.md) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/family/familyTree.assembly.js` + `.test.js` — pure graph-assembly logic (apex detection, generation ranking, union pairing, initial-expand-set computation) — the highest-value, DOM-free test surface for this phase.
- [ ] `frontend/src/setupTests`-equivalent `mockReactFlow()` helper (colocated with the canvas test, not global — see Pitfall 2) — needed before any `<ReactFlow>` render-smoke test can run.
- [ ] `backend/src/resolvers/familyMember.resolver.test.js` — the existing `familyMembers (list)` → `'rejects a non-admin caller'` test must be updated (not just extended) per Pitfall 1, plus a new adversarial case for the still-rejected unlinked-non-admin path, plus a regression test that `linkedUser` stays gated for a linked-non-admin caller (D-14/Pitfall 6).
- [ ] No new test framework or config install — `vitest`/`@testing-library/react`/`jsdom` are already present at the pinned versions shown above.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (unchanged) | JWT auth already enforced upstream of every resolver via `getUserFromRequest` (unchanged this phase). |
| V3 Session Management | No (unchanged) | Stateless JWT, `passwordChangedAt` revocation already in place (Phase 9, unchanged). |
| V4 Access Control | **Yes** | `requireFamilyAccess` (linked-member-OR-admin) is the exact control being broadened onto `familyMembers` (D-13) — this is the phase's primary access-control change and must be tested both for the new "linked non-admin succeeds" path and the retained "unlinked non-admin still rejected" path. |
| V5 Input Validation | No new input surface | `/family` is read-only (D-08); no new mutations, no new user-supplied input fields. |
| V6 Cryptography | No (unchanged) | No new secrets/tokens/hashing introduced this phase. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Over-broad data exposure after a guard relaxation (D-13 widens `familyMembers` from admin-only to linked-member-or-admin) | Information Disclosure | Verify field-by-field that nothing on the `FamilyMember` payload is admin-only-appropriate but not access-controlled at the field level. The one field with prior admin-sensitivity (`linkedUser` → exposes another user's `email`/`role`) already self-gates independently of the query-level guard (Phase 14 CR-01: returns `null` unless caller is ADMIN or the linked user themselves) — confirmed still correct post-D-13, and the tree's own flat query should not even request `linkedUser` (Pitfall 6). No other field on `FamilyMember` (`firstname`/`lastname`/`fullname`/`gender`/`birthdate`/`deathdate`/`phone`/`address`/`photoUrl`/`mother`/`father`/`spouses`/`children`/`siblings`) carries admin-only sensitivity in this single-family-app's threat model — this matches the app's stated posture (Phase 16 D-07/D-08: "viewing broad, writing scoped") and REQUIREMENTS.md's MEM-02 which lists `phone`/`address` as ordinary optional member fields already visible to any linked member via `/manage`'s existing `myEditableMembers`/`familyMember` reads. |
| Regression via test-message coupling (Pitfall 1) masking an incomplete guard change | Tampering (of intent) | Treat the existing test's failure as a required red-green step, not a signal to patch the guard back — verified via the explicit TDD discipline already standard on this project (D-09 in Phase 14 CONTEXT, carried forward). |
| Unbounded query depth on the now-more-broadly-callable `familyMembers` | Denial of Service | Already mitigated — the Phase 14 `graphql-depth-limit`-style validation rule (max depth 100, env-overridable) applies to ALL GraphQL operations regardless of caller role; no change needed this phase. Confirm via a quick grep that the rule is still wired in `backend/src/graphql/serverConfig.js` (unchanged surface, sanity-check only). |

## Project Constraints (from CLAUDE.md)

- **Tech stack:** JavaScript ES Modules, Node 18.x (also 24.x per current `package.json` `engines` — confirm which is authoritative at plan time), npm workspaces. All new frontend code must be ESM `.jsx`/`.js` with explicit relative import extensions (project convention — no path aliases configured).
- **Test tooling:** Vitest is the single runner across backend and frontend (already true); React Testing Library + jsdom for frontend (already true); this phase adds no new test framework, only test files within the existing setup.
- **Non-destructive milestone framing (from PROJECT.md-level constraint, still relevant to how this phase is scoped):** this phase is explicitly the FEATURE-adding phase of the milestone (unlike the original "testing-foundation-only" CLAUDE.md framing which describes an earlier point in the project's history) — TREE-01..04 are net-new application behavior, not test-only additions; QUAL-02/03 are the test/CI-closeout requirements riding alongside them. No conflict — CLAUDE.md's stack/tooling constraints apply in full; its "non-destructive, tests-only" scope note describes the v1.0 milestone the file was originally written for, not this phase.
- **Code style:** 2-space indentation, single quotes, semicolons used, no trailing commas in single-line objects, object-shorthand preferred, no TypeScript, no ESLint/Prettier config to satisfy (none exists) — match the style already visible in `familyMember.resolver.js`/`ManagePage.jsx`.
- **No Apollo Client / urql on the frontend:** the `/family` flat query MUST go through the existing plain-axios `graphqlRequest` helper (`frontend/src/api/graphqlClient.js`), exactly like every other frontend GraphQL call in this codebase — do not introduce a GraphQL client library for this phase.
- **GSD workflow enforcement:** file-changing work on this phase must go through `/gsd-execute-phase` (per this repo's CLAUDE.md) — this research document is an input to that workflow, not a substitute for it.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`) — live version/metadata verification for `@xyflow/react` (12.11.2), `@dagrejs/dagre` (3.0.0), `family-chart` (0.9.0), legacy `dagre` (0.8.5), `react-flow-renderer` (deprecated), 2026-07-24.
- `slopcheck install` — package legitimacy scan, all three candidate packages returned `[OK]`, 2026-07-24 (see Package Legitimacy Audit note on the tool's `npm install` side effect and its revert).
- [reactflow.dev/learn/advanced-use/testing](https://reactflow.dev/learn/advanced-use/testing) — official `mockReactFlow()` jsdom setup, edge-measurement `waitFor` guidance, drag-testing caveats.
- [github.com/dagrejs/dagre/wiki](https://github.com/dagrejs/dagre/wiki) — documented `setEdge`/`setGraph` option defaults (`minlen`, `weight`, `rankdir`, `nodesep`, `ranksep`).
- [reactflow.dev/examples/layout/dagre](https://reactflow.dev/examples/layout/dagre) — official Dagre Tree example: `nodeWidth`/`nodeHeight` constants, `dagreGraph.setGraph({rankdir})`, position offset (`x - width/2`, `y - height/2`).
- [reactflow.dev/api-reference/hooks/use-react-flow](https://reactflow.dev/api-reference/hooks/use-react-flow) — `getNode`, `fitView`, `setCenter` API surface for jump-to-me/search.
- This project's own source files (read directly): `backend/src/resolvers/familyMember.resolver.js`, `backend/src/schemas/familyMember.schema.js`, `backend/src/loaders/familyMember.loaders.js`, `backend/src/utils/auth.js`, `backend/src/server.js`, `frontend/src/pages/ManagePage.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/api/graphqlClient.js`, `frontend/src/components/manage/MemberAvatarImage.jsx`, `frontend/src/App.jsx`, `frontend/src/components/AppLayout.jsx`, `frontend/package.json`, `.github/workflows/ci.yml`, `backend/src/resolvers/familyMember.resolver.test.js`, `frontend/src/pages/ManagePage.test.jsx`, `.planning/codebase/TESTING.md`, `.planning/codebase/CONVENTIONS.md`.

### Secondary (MEDIUM confidence)
- [ncoughlin.com/posts/react-flow-dagre-custom-nodes](https://ncoughlin.com/posts/react-flow-dagre-custom-nodes) — dagre + xyflow custom-node position-mapping pattern, cross-checked against the official Dagre Tree example.
- [tva.sg/insights/reactflow-family-tree-visualization](https://www.tva.sg/insights/reactflow-family-tree-visualization) — family-tree-specific ReactFlow+Dagre article; used for the "same-rank spouse overlay" alternative and the "400 nodes displaying 40" performance framing, cross-checked against official xyflow performance/hidden-node docs.
- [yworks.com/pages/drawing-family-trees-with-javascript](https://www.yworks.com/pages/drawing-family-trees-with-javascript) and [docs.yworks.com family_tree_layout](https://docs.yworks.com/yfiles-html/dguide/layout/family_tree_layout.html) — confirms "family/union node" as an established genealogical layout concept (predecessor of parents, successor of children), used to validate that the D-11/D-12 synthetic-union-node design matches known practice, not an invented technique.
- [github.com/donatso/family-chart](https://github.com/donatso/family-chart) README — data model (`id`, `rels.father/mother/spouses/children`), framework-agnostic integration note, no built-in minimap.
- GitHub discussions [xyflow/xyflow#1265](https://github.com/xyflow/xyflow/discussions/1265) (expand/collapse via hidden), [xyflow/xyflow#4975](https://github.com/xyflow/xyflow/discussions/4975) (large-graph performance patterns) — community guidance, consistent with official docs.

### Tertiary (LOW confidence)
- None retained as authoritative claims — all WebSearch-only findings were either cross-verified against an official/primary source above or explicitly flagged (Assumptions Log A1/A2) as spike-validated rather than asserted as fact.

## Metadata

**Confidence breakdown:**
- Standard stack (library choice, versions): HIGH — npm-registry-verified versions, official docs for API surface, slopcheck-clean.
- Architecture (union-node dagre pattern): MEDIUM — synthesized from documented primitives + established genealogical-layout theory, not a single official worked example; this is precisely why D-11 mandates a spike before commitment.
- Backend/TREE-03 (flat query, no schema change): HIGH — directly verified against this project's own Phase 14 DataLoader implementation and existing SC-5 test pattern.
- Pitfalls (jsdom/testing, guard-relaxation test breakage): HIGH — both are either official library guidance or a directly-read existing test file in this repo.
- Security (guard relaxation scope): HIGH — directly verified against this project's own resolver code (`linkedUser` field-level gate).

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 days — the xyflow/dagre ecosystem moves at a normal pace, no fast-moving-target flag; re-verify package versions if planning is delayed past this window)
