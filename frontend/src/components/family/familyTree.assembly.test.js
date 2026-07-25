import { describe, it, expect } from 'vitest';
import { buildForest, computeInitialExpandSet, deriveSiblings } from './familyTree.assembly.js';

describe('buildForest', () => {
  it('assigns generation 0 to apex ancestors (no mother, no father)', () => {
    const flat = [{ id: '1', mother: null, father: null, spouses: [], children: [] }];
    const { generations } = buildForest(flat);
    expect(generations.get('1')).toBe(0);
  });

  it('creates only member nodes, one per flat member (no union nodes)', () => {
    const flat = [
      { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
      { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [{ id: '3' }] },
      { id: '3', mother: { id: '1' }, father: { id: '2' }, spouses: [], children: [] }
    ];
    const { nodes } = buildForest(flat);
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n.type === 'member')).toBe(true);
    expect(nodes.map((n) => n.id).sort()).toEqual(['1', '2', '3']);
  });

  it('creates two direct parent->child edges when a child has both parents present, with the parent/child handle ids', () => {
    const flat = [
      { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
      { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [{ id: '3' }] },
      { id: '3', mother: { id: '1' }, father: { id: '2' }, spouses: [], children: [] }
    ];
    const { edges } = buildForest(flat);
    const parentEdges = edges.filter((e) => e.type === 'parent');
    expect(parentEdges).toHaveLength(2);
    expect(parentEdges).toEqual(
      expect.arrayContaining([
        {
          id: 'parent-1-3',
          source: '1',
          target: '3',
          type: 'parent',
          sourceHandle: 'parent-source',
          targetHandle: 'child-target'
        },
        {
          id: 'parent-2-3',
          source: '2',
          target: '3',
          type: 'parent',
          sourceHandle: 'parent-source',
          targetHandle: 'child-target'
        }
      ])
    );
  });

  it('creates a single direct parent->child edge when a child has only one known parent, with handle ids', () => {
    const flat = [
      { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
      { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [] },
      { id: '3', mother: { id: '1' }, father: null, spouses: [], children: [] }
    ];
    const { edges } = buildForest(flat);
    expect(edges.filter((e) => e.type === 'parent')).toEqual([
      {
        id: 'parent-1-3',
        source: '1',
        target: '3',
        type: 'parent',
        sourceHandle: 'parent-source',
        targetHandle: 'child-target'
      }
    ]);
  });

  it('creates no edge for a parent reference that points outside the known member set', () => {
    const flat = [{ id: '3', mother: { id: 'unknown' }, father: null, spouses: [], children: [] }];
    const { edges } = buildForest(flat);
    expect(edges).toEqual([]);
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

  it('regression: real-data shape (single-parent chain of members) produces a connected chain of parent->child edges', () => {
    // Mirrors the real data shape: 0 two-parent children, 0 spouse rows —
    // every member has at most one known parent in the member set.
    const flat = [
      { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }] },
      { id: '2', mother: null, father: { id: '1' }, spouses: [], children: [{ id: '3' }] },
      { id: '3', mother: null, father: { id: '2' }, spouses: [], children: [] }
    ];
    const { edges } = buildForest(flat);
    expect(edges).toEqual(
      expect.arrayContaining([
        {
          id: 'parent-1-2',
          source: '1',
          target: '2',
          type: 'parent',
          sourceHandle: 'parent-source',
          targetHandle: 'child-target'
        },
        {
          id: 'parent-2-3',
          source: '2',
          target: '3',
          type: 'parent',
          sourceHandle: 'parent-source',
          targetHandle: 'child-target'
        }
      ])
    );
    expect(edges).toHaveLength(2);
  });
});

describe('buildForest — spouse connector edges', () => {
  it('emits exactly one spouse edge per unordered spouse pair, with sorted-id edge id and spouse handles', () => {
    const flat = [
      { id: '6', mother: null, father: null, spouses: [{ id: '14' }], children: [] },
      { id: '14', mother: null, father: null, spouses: [{ id: '6' }], children: [] }
    ];
    const { edges } = buildForest(flat);
    const spouseEdges = edges.filter((e) => e.type === 'spouse');
    expect(spouseEdges).toEqual([
      {
        id: 'spouse-6-14',
        source: '6',
        target: '14',
        type: 'spouse',
        sourceHandle: 'spouse-source',
        targetHandle: 'spouse-target'
      }
    ]);
  });

  it('dedupes a mutually-referenced spouse pair regardless of numeric id ordering (14 lists 6, 6 lists 14)', () => {
    const flat = [
      { id: '14', mother: null, father: null, spouses: [{ id: '6' }], children: [] },
      { id: '6', mother: null, father: null, spouses: [{ id: '14' }], children: [] }
    ];
    const { edges } = buildForest(flat);
    const spouseEdges = edges.filter((e) => e.type === 'spouse');
    expect(spouseEdges).toHaveLength(1);
    expect(spouseEdges[0].id).toBe('spouse-6-14');
  });

  it('ignores a spouse reference that points outside the known member set', () => {
    const flat = [{ id: '1', mother: null, father: null, spouses: [{ id: 'unknown' }], children: [] }];
    const { edges } = buildForest(flat);
    expect(edges.filter((e) => e.type === 'spouse')).toEqual([]);
  });

  it('emits no spouse edges when no member has a spouse', () => {
    const flat = [{ id: '1', mother: null, father: null, spouses: [], children: [] }];
    const { edges } = buildForest(flat);
    expect(edges.filter((e) => e.type === 'spouse')).toEqual([]);
  });

  it('includes the viewer spouse in initialExpandedIds so the connecting edge is visible on first paint', () => {
    const flat = [
      { id: '6', mother: null, father: null, spouses: [{ id: '14' }], children: [] },
      { id: '14', mother: null, father: null, spouses: [{ id: '6' }], children: [] }
    ];
    const { initialExpandedIds } = buildForest(flat, '6');
    expect(initialExpandedIds.has('6')).toBe(true);
    expect(initialExpandedIds.has('14')).toBe(true);
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

    // Direct line: viewer + both parents.
    expect(initialExpandedIds.has('4')).toBe(true);
    expect(initialExpandedIds.has('2')).toBe(true);
    expect(initialExpandedIds.has('3')).toBe(true);

    // Ancestral spine follows the mother's chain all the way to her apex.
    expect(initialExpandedIds.has('1')).toBe(true);

    // The father's own further ancestor (his apex, id 9) is NOT auto-expanded —
    // only his own direct id is part of the direct line.
    expect(initialExpandedIds.has('9')).toBe(false);

    // No union ids anywhere in the pure hierarchical model.
    for (const id of initialExpandedIds) {
      expect(String(id).startsWith('union-')).toBe(false);
    }
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
