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

const PERSON_W = 180;
const PERSON_H = 64;

export function layoutWithDagre(nodes, edges, options = {}) {
  const { rankdir = 'TB', nodesep = 60, ranksep = 90, edgesep = 10 } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep, edgesep });

  nodes.forEach((n) => {
    g.setNode(n.id, { width: PERSON_W, height: PERSON_H });
  });

  edges.forEach((e) => {
    g.setEdge(e.source, e.target, { minlen: 1, weight: 2 });
  });

  dagre.layout(g);

  const positions = new Map();
  nodes.forEach((n) => {
    const { x, y } = g.node(n.id);
    positions.set(n.id, { x: x - PERSON_W / 2, y: y - PERSON_H / 2 });
  });

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) || { x: 0, y: 0 } }));
}
