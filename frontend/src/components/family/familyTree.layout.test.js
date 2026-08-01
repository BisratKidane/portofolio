import { describe, it, expect } from 'vitest';
import { buildForest } from './familyTree.assembly.js';
import { layoutWithDagre } from './familyTree.layout.js';

// Mirrors the module-private constants in familyTree.layout.js. Kept local
// (not imported) since the module intentionally only exports
// layoutWithDagre; these values must match PERSON_W/PERSON_H/SPOUSE_GAP
// there exactly (252/120/40, unchanged by the couple-footprint fix).
const PERSON_W = 252;
const PERSON_H = 120;
const SPOUSE_GAP = 40;

// Fixture: a two-parent child (3) of parents 1 and 2 — pure hierarchical
// model, direct parent->child edges only, no union node.
const twoParentFixture = [
  { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
  { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [{ id: '3' }] },
  { id: '3', mother: { id: '1' }, father: { id: '2' }, spouses: [], children: [] }
];

describe('layoutWithDagre', () => {
  it('ranks a two-parent child strictly one rank below BOTH parents (direct parent->child edges)', () => {
    const { nodes, edges } = buildForest(twoParentFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const byId = new Map(laidOut.map((n) => [n.id, n]));
    const parentA = byId.get('1');
    const parentB = byId.get('2');
    const child = byId.get('3');

    expect(parentA.position).toBeTruthy();
    expect(parentB.position).toBeTruthy();
    expect(child.position).toBeTruthy();

    expect(child.position.y).toBeGreaterThan(parentA.position.y);
    expect(child.position.y).toBeGreaterThan(parentB.position.y);
  });

  it('ranks a single-parent child strictly one rank below the parent (direct parent->child edge)', () => {
    const fixture = [
      { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }] },
      { id: '2', mother: { id: '1' }, father: null, spouses: [], children: [] }
    ];
    const { nodes, edges } = buildForest(fixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const byId = new Map(laidOut.map((n) => [n.id, n]));
    const parent = byId.get('1');
    const child = byId.get('2');

    expect(child.position.y).toBeGreaterThan(parent.position.y);
  });

  it('preserves existing node fields via spread while adding position', () => {
    const { nodes, edges } = buildForest(twoParentFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const member = laidOut.find((n) => n.id === '1');
    expect(member.type).toBe('member');
    expect(member.data.member.id).toBe('1');
    expect(member.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('returns a new array (does not mutate the input nodes array)', () => {
    const { nodes, edges } = buildForest(twoParentFixture);
    const laidOut = layoutWithDagre(nodes, edges);

    expect(laidOut).not.toBe(nodes);
    expect(nodes[0].position).toBeUndefined();
  });

  it('accepts rankdir/nodesep/ranksep/edgesep overrides without throwing', () => {
    const { nodes, edges } = buildForest(twoParentFixture);
    expect(() =>
      layoutWithDagre(nodes, edges, { rankdir: 'TB', nodesep: 40, ranksep: 100, edgesep: 15 })
    ).not.toThrow();
  });
});

describe('layoutWithDagre — spouse edges excluded from dagre ranking', () => {
  it('keeps two spouses (no parent/child edge between them) on the same rank', () => {
    const flat = [
      { id: '6', mother: null, father: null, spouses: [{ id: '14' }], children: [] },
      { id: '14', mother: null, father: null, spouses: [{ id: '6' }], children: [] }
    ];
    const { nodes, edges } = buildForest(flat);
    expect(edges).toEqual([
      expect.objectContaining({ id: 'spouse-6-14', type: 'spouse' })
    ]);

    const laidOut = layoutWithDagre(nodes, edges);
    const byId = new Map(laidOut.map((n) => [n.id, n]));

    expect(byId.get('6').position.y).toBe(byId.get('14').position.y);
  });

  it('never demotes a partner to a lower rank via the spouse edge when one partner is a parent', () => {
    // 1 (apex) -> 3 (child). 2 is 1's spouse with no parent/child edges of
    // her own. Without spouse-edge exclusion, dagre could push 2 down to
    // align near her spouse's rank via the spouse edge; the spouse edge
    // must be invisible to dagre so 2 stays at rank 0 alongside 1.
    const flat = [
      { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
      { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [] },
      { id: '3', mother: { id: '1' }, father: null, spouses: [], children: [] }
    ];
    const { nodes, edges } = buildForest(flat);
    const laidOut = layoutWithDagre(nodes, edges);
    const byId = new Map(laidOut.map((n) => [n.id, n]));

    expect(byId.get('2').position.y).toBe(byId.get('1').position.y);
    expect(byId.get('3').position.y).toBeGreaterThan(byId.get('1').position.y);
  });

  it('snaps the mover exactly PERSON_W + SPOUSE_GAP to the right of the anchor, same y (relative invariant)', () => {
    const flat = [
      { id: '6', mother: null, father: null, spouses: [{ id: '14' }], children: [] },
      { id: '14', mother: null, father: null, spouses: [{ id: '6' }], children: [] }
    ];
    const { nodes, edges } = buildForest(flat);
    const laidOut = layoutWithDagre(nodes, edges);
    const byId = new Map(laidOut.map((n) => [n.id, n]));

    const anchor = byId.get('6');
    const mover = byId.get('14');

    expect(mover.position.x).toBe(anchor.position.x + PERSON_W + SPOUSE_GAP);
    expect(mover.position.y).toBe(anchor.position.y);
  });
});

describe('layoutWithDagre — spouse/sibling overlap regression', () => {
  it('never overlaps a spouse rect with any other node rect, even when the bloodline anchor has a sibling to its right', () => {
    // Apex (1) has two children: '2' (the spouse-pairing anchor, so it has
    // a sibling on the same rank) and '3' (the sibling). '4' is a married-in
    // spouse of '2' with no parents/children of her own. Before the
    // couple-footprint fix, dagre reserved only one PERSON_W slot for '2'
    // and the post-layout snap of '4' beside '2' could land on top of '3'.
    const fixture = [
      { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }, { id: '3' }] },
      { id: '2', mother: { id: '1' }, father: null, spouses: [{ id: '4' }], children: [] },
      { id: '3', mother: { id: '1' }, father: null, spouses: [], children: [] },
      { id: '4', mother: null, father: null, spouses: [{ id: '2' }], children: [] }
    ];
    const { nodes, edges } = buildForest(fixture);
    const laidOut = layoutWithDagre(nodes, edges);

    const rectsOverlap = (a, b) =>
      a.position.x < b.position.x + PERSON_W &&
      a.position.x + PERSON_W > b.position.x &&
      a.position.y < b.position.y + PERSON_H &&
      a.position.y + PERSON_H > b.position.y;

    for (let i = 0; i < laidOut.length; i += 1) {
      for (let j = i + 1; j < laidOut.length; j += 1) {
        expect(rectsOverlap(laidOut[i], laidOut[j])).toBe(false);
      }
    }
  });
});
