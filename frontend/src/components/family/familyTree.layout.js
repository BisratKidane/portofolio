// Pure, DOM-free dagre layout wrapper for the /family tree (Phase 17, Plan
// 17-02). Consumes { nodes, edges } from familyTree.assembly.js's
// buildForest() and returns a NEW nodes array with { position: { x, y } }
// added. No React, no DOM.
//
// Deviation from 17-RESEARCH.md Pattern 2 (documented, Rule 1 bug fix):
// Pattern 2 specifies feeding marriage edges (partner -> union) into dagre
// with `minlen: 0` so the union node lands on the SAME rank as its two
// partners. That literal approach crashes @dagrejs/dagre at runtime
// (`Cannot read properties of undefined (reading 'forEach')`) -- reproduced
// with a minimal 2-node graph across dagre v1.1.4, v2.0.4, and v3.0.0 (the
// installed version); corroborated by upstream issue dagrejs/dagre#280
// ("cannot set edge minlen=0", open/unresolved). `minlen: 0` is not usable
// with this library.
//
// This module achieves the IDENTICAL documented behavioral contract --
// union node visually at the same rank as its two partners, children
// exactly one rank below -- via a mechanism that avoids minlen: 0 entirely:
//   1. Union nodes are excluded from the dagre ranking graph. Only 'member'
//      nodes are laid out by dagre.
//   2. For each descent edge (union -> child) in the input, both of the
//      union's partners (resolved from the input's marriage edges) get a
//      direct minlen: 1 ranking edge straight to the child. This mirrors
//      familyTree.assembly.js's own generation rule ("take the max of the
//      two parent generations + 1 when both are known") -- dagre's
//      longest-path ranking naturally assigns both partners the SAME rank
//      when they share a child (proven in familyTree.layout.test.js).
//   3. After dagre lays out the member nodes, each union node's position is
//      computed as the midpoint of its two (already-positioned) partners --
//      not fed through dagre at all, so a couple with zero shared children
//      still resolves a sane position for free.
//
// D-12 (spike-driven spouse-pairing pattern) is unaffected: the *visual*
// contract -- a union node sitting between its partners, descent edges
// dropping one rank to children -- is exactly what RESEARCH.md's Pattern 2
// specifies. Only the internal dagre wiring differs.

import dagre from '@dagrejs/dagre';

const PERSON_W = 180;
const PERSON_H = 64;
const UNION_W = 24;
const UNION_H = 24;

function centerOf(position, width, height) {
  return { x: position.x + width / 2, y: position.y + height / 2 };
}

export function layoutWithDagre(nodes, edges, options = {}) {
  const { rankdir = 'TB', nodesep = 60, ranksep = 90, edgesep = 10 } = options;

  const memberNodes = nodes.filter((n) => n.type !== 'union');
  const unionNodes = nodes.filter((n) => n.type === 'union');

  // Resolve each union's two partner ids from the marriage edges pointing
  // at it (partner -> union), and its children from the descent edges
  // leaving it (union -> child).
  const partnersByUnion = new Map();
  for (const e of edges) {
    if (e.type !== 'marriage') continue;
    const list = partnersByUnion.get(e.target) || [];
    list.push(e.source);
    partnersByUnion.set(e.target, list);
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep, edgesep });

  memberNodes.forEach((n) => {
    g.setNode(n.id, { width: PERSON_W, height: PERSON_H });
  });

  edges.forEach((e) => {
    if (e.type !== 'descent') return;
    const partnerIds = partnersByUnion.get(e.source) || [];
    partnerIds.forEach((partnerId) => {
      g.setEdge(partnerId, e.target, { minlen: 1, weight: 2 });
    });
  });

  dagre.layout(g);

  const memberPositions = new Map();
  memberNodes.forEach((n) => {
    const { x, y } = g.node(n.id);
    memberPositions.set(n.id, { x: x - PERSON_W / 2, y: y - PERSON_H / 2 });
  });

  const unionPositions = new Map();
  unionNodes.forEach((n) => {
    const partnerIds = partnersByUnion.get(n.id) || [];
    const partnerCenters = partnerIds
      .map((id) => memberPositions.get(id))
      .filter(Boolean)
      .map((pos) => centerOf(pos, PERSON_W, PERSON_H));

    let centerX = 0;
    let centerY = 0;
    if (partnerCenters.length > 0) {
      centerX = partnerCenters.reduce((sum, c) => sum + c.x, 0) / partnerCenters.length;
      centerY = Math.max(...partnerCenters.map((c) => c.y));
    }
    unionPositions.set(n.id, { x: centerX - UNION_W / 2, y: centerY - UNION_H / 2 });
  });

  return nodes.map((n) => {
    const position = n.type === 'union' ? unionPositions.get(n.id) : memberPositions.get(n.id);
    return { ...n, position: position || { x: 0, y: 0 } };
  });
}
