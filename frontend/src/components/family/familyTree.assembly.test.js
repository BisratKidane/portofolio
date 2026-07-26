import { describe, it, expect } from 'vitest';
import {
  buildForest,
  collectDescendantIds,
  resolveRootAncestorId,
  computeRootExpandSet,
  deriveSiblings
} from './familyTree.assembly.js';

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
      initialExpandedIds: new Set(),
      rootAncestorId: null
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

  it("includes the root member's spouse in initialExpandedIds so the connecting edge is visible on first paint", () => {
    const flat = [
      { id: '6', mother: null, father: null, spouses: [{ id: '14' }], children: [] },
      { id: '14', mother: null, father: null, spouses: [{ id: '6' }], children: [] }
    ];
    const { initialExpandedIds } = buildForest(flat);
    expect(initialExpandedIds.has('6')).toBe(true);
    expect(initialExpandedIds.has('14')).toBe(true);
  });
});

describe('buildForest — root-based initial expand set', () => {
  // A three-generation tree rooted at the canonical top ancestor id 1 (Agne).
  // Id 1 has a married-in spouse (id 2), a child (id 3) who also has a
  // married-in spouse (id 4), and a grandchild (id 5).
  const flat = [
    { id: '1', mother: null, father: null, spouses: [{ id: '2' }], children: [{ id: '3' }] },
    { id: '2', mother: null, father: null, spouses: [{ id: '1' }], children: [{ id: '3' }] },
    { id: '3', mother: { id: '1' }, father: { id: '2' }, spouses: [{ id: '4' }], children: [{ id: '5' }] },
    { id: '4', mother: null, father: null, spouses: [{ id: '3' }], children: [{ id: '5' }] },
    { id: '5', mother: { id: '3' }, father: { id: '4' }, spouses: [], children: [] }
  ];

  it('defaults the root to id "1" when present in the payload', () => {
    const { rootAncestorId } = buildForest(flat);
    expect(rootAncestorId).toBe('1');
  });

  it('expands id 1 plus every descendant and the spouses of expanded members', () => {
    const { initialExpandedIds } = buildForest(flat);
    // Root, its descendants (3, 5), and the spouses of expanded members (2, 4).
    expect([...initialExpandedIds].sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('never emits union ids in the pure hierarchical model', () => {
    const { initialExpandedIds } = buildForest(flat);
    for (const id of initialExpandedIds) {
      expect(String(id).startsWith('union-')).toBe(false);
    }
  });
});

describe('resolveRootAncestorId / computeRootExpandSet — fallback root selection', () => {
  // No id 1 present. Two disconnected apexes: id 2 with a large descendant
  // subtree (3, 4, 5) and id 8 with a single child (9). The apex with the most
  // descendants (id 2) must win.
  const flat = [
    { id: '2', mother: null, father: null, spouses: [], children: [{ id: '3' }] },
    { id: '3', mother: { id: '2' }, father: null, spouses: [], children: [{ id: '4' }] },
    { id: '4', mother: { id: '3' }, father: null, spouses: [], children: [{ id: '5' }] },
    { id: '5', mother: { id: '4' }, father: null, spouses: [], children: [] },
    { id: '8', mother: null, father: null, spouses: [], children: [{ id: '9' }] },
    { id: '9', mother: { id: '8' }, father: null, spouses: [], children: [] }
  ];

  it('picks the apex with the most descendants when id 1 is absent', () => {
    const membersById = new Map(flat.map((m) => [String(m.id), m]));
    expect(resolveRootAncestorId(flat, membersById)).toBe('2');
  });

  it('root-expands the winning apex and all of its descendants', () => {
    const { rootAncestorId, initialExpandedIds } = buildForest(flat);
    expect(rootAncestorId).toBe('2');
    expect([...initialExpandedIds].sort()).toEqual(['2', '3', '4', '5']);
    // The smaller, disconnected apex chain is not part of the initial expand.
    expect(initialExpandedIds.has('8')).toBe(false);
    expect(initialExpandedIds.has('9')).toBe(false);
  });
});

describe('collectDescendantIds — spouse inclusion without traversing into the spouse', () => {
  // Root id 1 -> child id 2, who is married to id 3. The married-in spouse (3)
  // has their OWN unrelated ancestor (id 4) and out-of-line child (id 5). The
  // spouse's id is included, but their separate ancestry/descent stays out.
  const flat = [
    { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }] },
    { id: '2', mother: { id: '1' }, father: null, spouses: [{ id: '3' }], children: [] },
    { id: '3', mother: { id: '4' }, father: null, spouses: [{ id: '2' }], children: [{ id: '5' }] },
    { id: '4', mother: null, father: null, spouses: [], children: [{ id: '3' }] },
    { id: '5', mother: { id: '3' }, father: null, spouses: [], children: [] }
  ];

  it('includes the spouse of an expanded member but not the spouse’s own ancestors or out-of-line children', () => {
    const membersById = new Map(flat.map((m) => [String(m.id), m]));
    const ids = collectDescendantIds('1', membersById, { includeSpouses: true });

    expect(ids.has('1')).toBe(true);
    expect(ids.has('2')).toBe(true);
    expect(ids.has('3')).toBe(true); // married-in spouse of expanded member 2

    // The spouse's separate ancestor (4) and out-of-line child (5) are excluded.
    expect(ids.has('4')).toBe(false);
    expect(ids.has('5')).toBe(false);
  });

  it('omits spouses entirely when includeSpouses is false', () => {
    const membersById = new Map(flat.map((m) => [String(m.id), m]));
    const ids = collectDescendantIds('1', membersById, { includeSpouses: false });
    expect([...ids].sort()).toEqual(['1', '2']);
  });

  it('is guarded against a children cycle', () => {
    const cyclic = [
      { id: '1', mother: null, father: null, spouses: [], children: [{ id: '2' }] },
      { id: '2', mother: { id: '1' }, father: null, spouses: [], children: [{ id: '1' }] }
    ];
    const membersById = new Map(cyclic.map((m) => [String(m.id), m]));
    const ids = collectDescendantIds('1', membersById, { includeSpouses: false });
    expect([...ids].sort()).toEqual(['1', '2']);
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

describe('computeRootExpandSet — empty input', () => {
  it('returns an empty Set instance when flatMembers is empty', () => {
    const result = computeRootExpandSet([]);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('buildForest reports rootAncestorId null and an empty expand set for empty input', () => {
    const { rootAncestorId, initialExpandedIds } = buildForest([]);
    expect(rootAncestorId).toBeNull();
    expect(initialExpandedIds).toBeInstanceOf(Set);
    expect(initialExpandedIds.size).toBe(0);
  });

  it('falls back to the first member id when no apex exists (every member has a parent)', () => {
    // A pure cycle: no member has mother == null && father == null.
    const flat = [
      { id: '7', mother: { id: '8' }, father: null, spouses: [], children: [{ id: '8' }] },
      { id: '8', mother: { id: '7' }, father: null, spouses: [], children: [{ id: '7' }] }
    ];
    const membersById = new Map(flat.map((m) => [String(m.id), m]));
    expect(resolveRootAncestorId(flat, membersById)).toBe('7');
  });
});
