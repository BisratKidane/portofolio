import { describe, it, expect } from 'vitest';
import { buildForest, computeInitialExpandSet, deriveSiblings } from './familyTree.assembly.js';

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

  it('does not create a descent edge when a child has only one known parent in the pair', () => {
    const flat = [
      { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
      { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [] },
      { id: '3', mother: { id: '1' }, father: null, spouses: [], children: [] }
    ];
    const { nodes, edges } = buildForest(flat);
    const union = nodes.find((n) => n.type === 'union');
    expect(union).toBeTruthy();
    expect(edges.some((e) => e.type === 'descent' && e.target === '3')).toBe(false);
  });

  it('returns an empty forest for an empty member list', () => {
    const result = buildForest([]);
    expect(result).toEqual({
      nodes: [],
      edges: [],
      generations: new Map(),
      apexIds: [],
      initialExpandedIds: new Set()
    });
  });

  it('deep multi-generation chain ranks generations correctly (apex=0 down to leaf)', () => {
    const flat = [
      { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }] },
      { id: '2', mother: { id: '1' }, father: null, spouses: [], children: [{ id: '3' }] },
      { id: '3', mother: { id: '2' }, father: null, spouses: [], children: [{ id: '4' }] },
      { id: '4', mother: { id: '3' }, father: null, spouses: [], children: [] }
    ];
    const { generations, apexIds } = buildForest(flat);
    expect(apexIds).toEqual(['1']);
    expect(generations.get('1')).toBe(0);
    expect(generations.get('2')).toBe(1);
    expect(generations.get('3')).toBe(2);
    expect(generations.get('4')).toBe(3);
  });
});

describe('computeInitialExpandSet — multi-apex-path spine (Open Question 1)', () => {
  // Viewer's mother chain reaches a separate apex (1) and viewer's father chain
  // reaches a DIFFERENT separate apex (9). Only the mother's chain is walked as
  // the ancestral spine; the father's own further-up chain is deliberately
  // excluded even though the father himself IS in the direct line.
  const flat = [
    { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }] },
    { id: '2', mother: { id: '1' }, father: null, spouses: [{ id: '3' }], children: [{ id: '4' }] },
    { id: '9', mother: null, father: null, spouses: [], children: [{ id: '3' }] },
    { id: '3', mother: { id: '9' }, father: null, spouses: [{ id: '2' }], children: [{ id: '4' }] },
    { id: '4', mother: { id: '2' }, father: { id: '3' }, spouses: [], children: [] }
  ];

  it('walks only the viewer mother chain up to its apex, not the father chain beyond the direct line', () => {
    const { initialExpandedIds } = buildForest(flat, '4');

    // Direct line: viewer + both parents + the union connecting them.
    expect(initialExpandedIds.has('4')).toBe(true);
    expect(initialExpandedIds.has('2')).toBe(true);
    expect(initialExpandedIds.has('3')).toBe(true);
    expect(initialExpandedIds.has('union-2-3')).toBe(true);

    // Ancestral spine follows the mother's chain all the way to her apex.
    expect(initialExpandedIds.has('1')).toBe(true);

    // The father's own further ancestor (his apex, id 9) is NOT auto-expanded —
    // only his own direct id is part of the direct line.
    expect(initialExpandedIds.has('9')).toBe(false);
  });
});

describe('computeInitialExpandSet — D-03 disconnected apex exclusion', () => {
  // The viewer's spouse has their OWN separate parent chain (a disconnected
  // apex root unrelated to the viewer's own lineage) — D-03's explicit example
  // of a spouse who "married in." That spouse's parent ids must be excluded
  // from initialExpandedIds even though the spouse's own id is included.
  const flat = [
    { id: '4', mother: null, father: null, spouses: [{ id: '5' }], children: [] },
    { id: '5', mother: { id: '6' }, father: { id: '7' }, spouses: [{ id: '4' }], children: [] },
    { id: '6', mother: null, father: null, spouses: [{ id: '7' }], children: [{ id: '5' }] },
    { id: '7', mother: null, father: null, spouses: [{ id: '6' }], children: [{ id: '5' }] }
  ];

  it('includes the married-in spouse but excludes their separate/disconnected apex parents', () => {
    const initialExpandedIds = computeInitialExpandSet(flat, '4');

    expect(initialExpandedIds.has('4')).toBe(true);
    expect(initialExpandedIds.has('5')).toBe(true);

    // Spouse's own disconnected apex parent chain is deliberately excluded —
    // it stays collapsed behind 17-03's ancestor-reveal badge, not auto-expanded.
    expect(initialExpandedIds.has('6')).toBe(false);
    expect(initialExpandedIds.has('7')).toBe(false);
  });

  it('buildForest itself excludes the same disconnected apex ids from initialExpandedIds', () => {
    const { initialExpandedIds } = buildForest(flat, '4');
    expect(initialExpandedIds.has('5')).toBe(true);
    expect(initialExpandedIds.has('6')).toBe(false);
    expect(initialExpandedIds.has('7')).toBe(false);
  });
});

describe('deriveSiblings', () => {
  const membersById = new Map([
    ['1', { id: '1', mother: null, father: null, spouses: [], children: [] }],
    ['2', { id: '2', mother: { id: '1' }, father: { id: '9' }, spouses: [], children: [] }],
    ['3', { id: '3', mother: { id: '1' }, father: null, spouses: [], children: [] }],
    ['4', { id: '4', mother: null, father: { id: '9' }, spouses: [], children: [] }],
    ['5', { id: '5', mother: null, father: null, spouses: [], children: [] }]
  ]);

  it('matches siblings sharing either parent (either-parent rule, mirrors backend D-03)', () => {
    const siblings = deriveSiblings('2', membersById);
    const siblingIds = siblings.map((s) => s.id).sort();
    // 3 shares mother (1) with 2; 4 shares father (9) with 2.
    expect(siblingIds).toEqual(['3', '4']);
  });

  it('excludes the member itself and returns an empty array for a member with no known parents', () => {
    expect(deriveSiblings('5', membersById)).toEqual([]);
  });

  it('returns an empty array for an unknown member id', () => {
    expect(deriveSiblings('does-not-exist', membersById)).toEqual([]);
  });
});

describe('computeInitialExpandSet — standalone export', () => {
  it('returns an empty Set instance when flatMembers is empty', () => {
    const result = computeInitialExpandSet([], '1');
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns an empty Set when viewerId is not found among the flat members', () => {
    const flat = [{ id: '1', mother: null, father: null, spouses: [], children: [] }];
    const result = computeInitialExpandSet(flat, 'does-not-exist');
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});
