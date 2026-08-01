// Pure, DOM-free dagre layout wrapper for the /family tree (Phase 17, Plan
// 17-02, revised for the pure hierarchical model). Consumes { nodes, edges }
// from familyTree.assembly.js's buildForest() and returns a NEW nodes array
// with { position: { x, y } } added. No React, no DOM.
//
// Pure hierarchical model (supersedes the union/marriage/descent model,
// D-11/D-12): every node is a 'member' node and every edge is a direct
// parent->child 'parent' edge, so this module no longer needs the
// union-exclusion / midpoint-positioning workaround that the old union-based
// model required (see git history for the retired dagre#280 minlen:0
// workaround). All nodes and edges are fed directly into dagre.

import dagre from '@dagrejs/dagre';

const PERSON_W = 252;
const PERSON_H = 120;
const SPOUSE_GAP = 40;
const COUPLE_W = PERSON_W * 2 + SPOUSE_GAP;

export function layoutWithDagre(nodes, edges, options = {}) {
  const { rankdir = 'TB', nodesep = 60, ranksep = 90, edgesep = 10 } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep, edgesep });

  // Determine spouse pairings (anchor/mover) BEFORE building dagre nodes, so
  // dagre can reserve the couple's combined footprint (COUPLE_W) as the
  // anchor's node width. Without this, dagre only ever reserves one
  // PERSON_W slot per person; the mover is snapped beside the anchor after
  // layout with no space actually reserved for it, so the mover can land on
  // top of a neighboring node (e.g. the anchor's sibling to its right).
  const memberById = new Map(nodes.map((n) => [n.id, n.data?.member]));
  const hasParent = (m) => Boolean(m && (m.mother || m.father));
  const anchorsWithSpouse = new Set();
  const spousePairs = [];
  const usedInPair = new Set();
  edges.forEach((e) => {
    if (e.type !== 'spouse') return;
    if (!memberById.has(e.source) || !memberById.has(e.target)) return;
    const sourceBlood = hasParent(memberById.get(e.source));
    const targetBlood = hasParent(memberById.get(e.target));
    // Anchor = the bloodline partner; ties fall back to the edge source.
    const anchor = targetBlood && !sourceBlood ? e.target : e.source;
    const mover = anchor === e.source ? e.target : e.source;
    // Guard: a node already committed to a pair (as either anchor or
    // mover) cannot take part in a second pair — leave it to whatever
    // position dagre/the snap loop below assigns it as an ordinary node.
    if (usedInPair.has(anchor) || usedInPair.has(mover)) return;
    usedInPair.add(anchor);
    usedInPair.add(mover);
    anchorsWithSpouse.add(anchor);
    spousePairs.push({ anchor, mover });
  });

  nodes.forEach((n) => {
    const width = anchorsWithSpouse.has(n.id) ? COUPLE_W : PERSON_W;
    g.setNode(n.id, { width, height: PERSON_H });
  });

  // Only rank direct parent->child edges in dagre. A spouse connector edge
  // must never influence rank assignment — feeding it to dagre could pull a
  // spouse with no parent/child edges of their own down to a different rank
  // just because their partner has one (see familyTree.layout.test.js).
  edges.forEach((e) => {
    if (e.type !== 'parent') return;
    g.setEdge(e.source, e.target, { minlen: 1, weight: 2 });
  });

  dagre.layout(g);

  const positions = new Map();
  nodes.forEach((n) => {
    const { x, y } = g.node(n.id);
    const w = anchorsWithSpouse.has(n.id) ? COUPLE_W : PERSON_W;
    positions.set(n.id, { x: x - w / 2, y: y - PERSON_H / 2 });
  });

  // Place spouses side by side: the partner with a place in the bloodline (has a
  // parent in the tree) anchors on the LEFT, and the other spouse is snapped
  // immediately to its RIGHT on the same row. Because the anchor's dagre node
  // was given the couple's combined COUPLE_W footprint above, the anchor's
  // reserved slot already has room for the mover — dagre's own nodesep spacing
  // keeps neighboring nodes (e.g. a sibling) out of that span, so the mover
  // can never land on top of another node.
  spousePairs.forEach(({ anchor, mover }) => {
    const anchorPos = positions.get(anchor);
    if (!anchorPos) return;
    positions.set(mover, { x: anchorPos.x + PERSON_W + SPOUSE_GAP, y: anchorPos.y });
  });

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) || { x: 0, y: 0 } }));
}
