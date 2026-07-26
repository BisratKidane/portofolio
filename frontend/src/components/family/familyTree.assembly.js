// Pure, DOM-free client-side forest-assembly module for the /family tree
// (Phase 17, Plan 17-02, revised for the pure hierarchical model). Consumes
// the flat FamilyMember payload shape documented in 17-RESEARCH.md Pattern 1
// ({ id, mother: {id}|null, father: {id}|null, spouses: [{id}],
// children: [{id}] }) and produces the xyflow-shaped { nodes, edges } plus
// generation ranks and the root-based initial expand set. No React, no dagre, no
// DOM — see familyTree.layout.js for the dagre wrapper that consumes this
// module's output.
//
// Pure hierarchical model (supersedes the union/marriage/descent model,
// D-11/D-12): the real data has 0 two-parent children and 0 spouse rows, so
// the union-only edge model produced ZERO edges. There are only 'member'
// nodes now — no synthetic union nodes — and one direct parent->child edge
// per present, known parent (a single-parent child gets 1 edge; a two-parent
// child gets 2 edges, mother->child and father->child).

const MAX_GENERATION_DEPTH = 500; // defensive guard against a data-integrity cycle bug

function idOrNull(ref) {
  return ref?.id != null ? String(ref.id) : null;
}

// Numeric-aware pair sort (member ids are numeric strings in practice) so a
// pair like ('6', '14') sorts as [6, 14] rather than lexicographically as
// ['14', '6']; falls back to string compare for any non-numeric id.
function sortIdPair(idA, idB) {
  const numA = Number(idA);
  const numB = Number(idB);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
    return numA < numB ? [idA, idB] : [idB, idA];
  }
  return [idA, idB].sort();
}

function buildMembersById(flatMembers) {
  return new Map(flatMembers.map((member) => [String(member.id), member]));
}

function resolveGeneration(id, membersById, generations, visiting, depth) {
  if (generations.has(id)) return generations.get(id);

  const member = membersById.get(id);
  if (!member || depth > MAX_GENERATION_DEPTH || visiting.has(id)) {
    generations.set(id, 0);
    return 0;
  }

  visiting.add(id);

  const parentIds = [idOrNull(member.mother), idOrNull(member.father)].filter(
    (parentId) => parentId != null && membersById.has(parentId)
  );

  let generation = 0;
  if (parentIds.length > 0) {
    generation = Math.max(
      ...parentIds.map((parentId) => resolveGeneration(parentId, membersById, generations, visiting, depth + 1) + 1)
    );
  }

  visiting.delete(id);
  generations.set(id, generation);
  return generation;
}

function computeGenerations(membersById) {
  const generations = new Map();
  for (const id of membersById.keys()) {
    resolveGeneration(id, membersById, generations, new Set(), 0);
  }
  return generations;
}

/**
 * Given a Map<id, flatMember>, returns the flat-member rows sharing
 * mother.id OR father.id with `memberId`'s own row (either-parent rule,
 * mirrors the backend's already-tested Phase 14 sibling field resolver),
 * excluding `memberId` itself, de-duplicated by id.
 */
export function deriveSiblings(memberId, membersById) {
  const id = String(memberId);
  const member = membersById.get(id);
  if (!member) return [];

  const motherId = idOrNull(member.mother);
  const fatherId = idOrNull(member.father);
  if (motherId == null && fatherId == null) return [];

  const siblings = new Map();
  for (const [otherId, other] of membersById) {
    if (otherId === id) continue;
    const otherMotherId = idOrNull(other.mother);
    const otherFatherId = idOrNull(other.father);
    const sharesParent =
      (motherId != null && otherMotherId === motherId) || (fatherId != null && otherFatherId === fatherId);
    if (sharesParent) siblings.set(otherId, other);
  }

  return [...siblings.values()];
}

/**
 * BFS from `rootId` down the `children` graph, guarded against cycles with a
 * `visited` set. Adds the root and every reachable descendant. When
 * `includeSpouses`, also adds each visited member's `spouses` WITHOUT
 * traversing into them (a married-in spouse's out-of-line children/ancestors
 * stay out). Ignores refs whose id is not in `membersById`. Returns a
 * `Set<string>` of ids.
 */
export function collectDescendantIds(rootId, membersById, { includeSpouses = true } = {}) {
  const ids = new Set();
  const rootIdStr = rootId != null ? String(rootId) : null;
  if (rootIdStr == null || !membersById.has(rootIdStr)) return ids;

  const visited = new Set([rootIdStr]);
  const queue = [rootIdStr];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const member = membersById.get(currentId);
    if (!member) continue;
    ids.add(currentId);

    if (includeSpouses) {
      for (const spouse of member.spouses || []) {
        const spouseId = idOrNull(spouse);
        if (spouseId != null && membersById.has(spouseId)) ids.add(spouseId);
      }
    }

    for (const child of member.children || []) {
      const childId = idOrNull(child);
      if (childId == null || !membersById.has(childId) || visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return ids;
}

/**
 * Resolves the id of the member to root the tree at: the canonical top
 * ancestor id `"1"` when present; otherwise the apex member
 * (`mother == null && father == null`) with the largest descendant subtree
 * (spouses excluded from the size comparison so married-in partners don't
 * inflate a shallow apex); otherwise the first member's id; `null` for an
 * empty payload.
 */
export function resolveRootAncestorId(flatMembers, membersById) {
  if (!flatMembers || flatMembers.length === 0) return null;
  if (membersById.has('1')) return '1';

  const apexMembers = flatMembers.filter((member) => member.mother == null && member.father == null);
  if (apexMembers.length > 0) {
    let bestId = null;
    let bestSize = -1;
    for (const member of apexMembers) {
      const apexId = String(member.id);
      const size = collectDescendantIds(apexId, membersById, { includeSpouses: false }).size;
      if (size > bestSize) {
        bestSize = size;
        bestId = apexId;
      }
    }
    return bestId;
  }

  return String(flatMembers[0].id);
}

/**
 * Computes the root-based initial-expand set: resolves the root ancestor and
 * returns every descendant of it plus the spouses of those expanded members
 * (so married-in partners/couples show on first paint). Returns an empty
 * `Set` for empty input or when no root resolves.
 */
export function computeRootExpandSet(flatMembers) {
  if (!flatMembers || flatMembers.length === 0) return new Set();

  const membersById = buildMembersById(flatMembers);
  const rootId = resolveRootAncestorId(flatMembers, membersById);
  if (rootId == null) return new Set();

  return collectDescendantIds(rootId, membersById, { includeSpouses: true });
}

/**
 * Assembles the flat FamilyMember payload into an xyflow-shaped forest: one
 * 'member' node per row (no synthetic union nodes), and one direct
 * parent->child 'parent' edge per present, known parent (a single-parent
 * child yields 1 edge, a two-parent child yields 2 edges).
 */
export function buildForest(flatMembers) {
  if (!flatMembers || flatMembers.length === 0) {
    return {
      nodes: [],
      edges: [],
      generations: new Map(),
      apexIds: [],
      initialExpandedIds: new Set(),
      rootAncestorId: null
    };
  }

  const membersById = buildMembersById(flatMembers);
  const apexIds = flatMembers.filter((member) => member.mother == null && member.father == null).map((member) => String(member.id));
  const generations = computeGenerations(membersById);

  const nodes = flatMembers.map((member) => ({ id: String(member.id), type: 'member', data: { member } }));

  const edges = [];
  for (const member of flatMembers) {
    const childId = String(member.id);
    const motherId = idOrNull(member.mother);
    const fatherId = idOrNull(member.father);
    if (motherId != null && membersById.has(motherId)) {
      edges.push({
        id: `parent-${motherId}-${childId}`,
        source: motherId,
        target: childId,
        type: 'parent',
        sourceHandle: 'parent-source',
        targetHandle: 'child-target'
      });
    }
    if (fatherId != null && membersById.has(fatherId)) {
      edges.push({
        id: `parent-${fatherId}-${childId}`,
        source: fatherId,
        target: childId,
        type: 'parent',
        sourceHandle: 'parent-source',
        targetHandle: 'child-target'
      });
    }
  }

  // Spouse connector edges (one per unordered pair, dedupe via sorted ids so
  // a mutually-referenced pair — each side lists the other in `spouses` —
  // yields a single edge, not two).
  const seenSpousePairs = new Set();
  for (const member of flatMembers) {
    const memberId = String(member.id);
    for (const spouse of member.spouses || []) {
      const spouseId = idOrNull(spouse);
      if (spouseId == null || !membersById.has(spouseId)) continue;
      const [a, b] = sortIdPair(memberId, spouseId);
      const pairKey = `${a}-${b}`;
      if (seenSpousePairs.has(pairKey)) continue;
      seenSpousePairs.add(pairKey);
      edges.push({
        id: `spouse-${a}-${b}`,
        source: a,
        target: b,
        type: 'spouse',
        sourceHandle: 'spouse-source',
        targetHandle: 'spouse-target'
      });
    }
  }

  const rootAncestorId = resolveRootAncestorId(flatMembers, membersById);
  const initialExpandedIds =
    rootAncestorId != null
      ? collectDescendantIds(rootAncestorId, membersById, { includeSpouses: true })
      : new Set();

  return { nodes, edges, generations, apexIds, initialExpandedIds, rootAncestorId };
}
