import { describe, it, expect } from 'vitest';
import { buildForest } from './familyTree.assembly.js';
import { layoutWithDagre } from './familyTree.layout.js';

// Fixture mirrors familyTree.assembly.test.js's spouse-pair worked example:
// two spouses (1, 2) sharing one child (3), routed through a synthesized
// union node. Proves the Pitfall-4 regression guard: marriage edges must
// carry minlen: 0 so the union node stays on the SAME rank as its two
// partners, not one rank below them.
const spousePairFixture = [
  { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
  { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [{ id: '3' }] },
  { id: '3', mother: { id: '1' }, father: { id: '2' }, spouses: [], children: [] }
];

// Node heights differ (person 64px vs. union 24px), so "same rank" is a
// CENTER-y invariant, not an equal top-left-y invariant -- a smaller union
// node correctly has a larger top-left y than its taller partners even when
// perfectly rank-aligned (vertically centered on the same row).
const PERSON_H = 64;
const UNION_H = 24;

function centerY(node) {
  const h = node.type === 'union' ? UNION_H : PERSON_H;
  return node.position.y + h / 2;
}

describe('layoutWithDagre', () => {
  it('places the union node on the same rank (center-y) as its two spouse partners', () => {
    const { nodes, edges } = buildForest(spousePairFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const byId = new Map(laidOut.map((n) => [n.id, n]));
    const partnerA = byId.get('1');
    const partnerB = byId.get('2');
    const union = laidOut.find((n) => n.type === 'union');

    expect(union).toBeTruthy();
    expect(partnerA.position).toBeTruthy();
    expect(partnerB.position).toBeTruthy();

    // Same-rank invariant (Pitfall 4 regression guard): the union node must
    // NOT be pushed to a rank below its partners -- its vertical CENTER
    // must land on the same row as both partners' centers.
    expect(centerY(union)).toBe(centerY(partnerA));
    expect(centerY(union)).toBe(centerY(partnerB));
  });

  it('places the shared child strictly one rank below the union node (descent edge minlen: 1)', () => {
    const { nodes, edges } = buildForest(spousePairFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const byId = new Map(laidOut.map((n) => [n.id, n]));
    const child = byId.get('3');
    const union = laidOut.find((n) => n.type === 'union');

    expect(child.position).toBeTruthy();
    expect(child.position.y).toBeGreaterThan(union.position.y);
  });

  it('preserves existing node fields via spread while adding position', () => {
    const { nodes, edges } = buildForest(spousePairFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const member = laidOut.find((n) => n.id === '1');
    expect(member.type).toBe('member');
    expect(member.data.member.id).toBe('1');
    expect(member.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('returns a new array (does not mutate the input nodes array)', () => {
    const { nodes, edges } = buildForest(spousePairFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    expect(laidOut).not.toBe(nodes);
    expect(nodes[0].position).toBeUndefined();
  });

  it('accepts rankdir/nodesep/ranksep/edgesep overrides without throwing', () => {
    const { nodes, edges } = buildForest(spousePairFixture);
    expect(() =>
      layoutWithDagre(nodes, edges, { rankdir: 'TB', nodesep: 40, ranksep: 100, edgesep: 15 })
    ).not.toThrow();
  });
});
