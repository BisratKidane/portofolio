// Pure, DOM-free client-side forest-assembly module for the /family tree
// (Phase 17, Plan 17-02). Consumes the flat FamilyMember payload shape
// documented in 17-RESEARCH.md Pattern 1 ({ id, mother: {id}|null,
// father: {id}|null, spouses: [{id}], children: [{id}] }) and produces the
// xyflow-shaped { nodes, edges } plus generation ranks and the D-04 initial
// expand set. No React, no dagre, no DOM — see familyTree.layout.js for the
// dagre wrapper that consumes this module's output.

const MAX_GENERATION_DEPTH = 500; // defensive guard against a data-integrity cycle bug

function idOrNull(ref) {
  return ref?.id != null ? String(ref.id) : null;
}

function sortIdPair(idA, idB) {
  const a = String(idA);
  const b = String(idB);
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    return numA <= numB ? [a, b] : [b, a];
  }
  return a <= b ? [a, b] : [b, a];
}

function unionKey(idA, idB) {
  const [a, b] = sortIdPair(idA, idB);
  return `${a}-${b}`;
}

function buildMembersById(flatMembers) {
  return new Map(flatMembers.map((member) => [String(member.id), member]));
}

// One union node per distinct spouse pair, deduped via the sorted-pair key
// (spouses reference each other symmetrically in the flat payload).
function buildUnions(membersById) {
  const unions = new Map();
  for (const [id, member] of membersById) {
    for (const spouse of member.spouses || []) {
      const spouseId = idOrNull(spouse);
      if (spouseId == null || !membersById.has(spouseId)) continue;
      const key = unionKey(id, spouseId);
      if (unions.has(key)) continue;
      const [partnerA, partnerB] = sortIdPair(id, spouseId);
      unions.set(key, { id: `union-${key}`, partnerIds: [partnerA, partnerB] });
    }
  }
  return unions;
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

// Walks up from the viewer, preferring the mother's chain at every step
// (Open Question 1 resolution), collecting every id on the path plus every
// union node connecting a couple to their child along that path, until an
// apex ancestor (no mother, no father) is reached.
function walkAncestralSpine(viewerId, membersById, unions) {
  const spine = new Set();
  const visited = new Set();
  let currentId = viewerId;

  while (currentId != null && membersById.has(currentId) && !visited.has(currentId)) {
    visited.add(currentId);
    spine.add(currentId);

    const member = membersById.get(currentId);
    const motherId = idOrNull(member.mother);
    const fatherId = idOrNull(member.father);

    if (motherId == null && fatherId == null) break; // reached an apex ancestor

    if (motherId != null && fatherId != null) {
      const union = unions.get(unionKey(motherId, fatherId));
      if (union) spine.add(union.id);
    }

    const nextId =
      motherId != null && membersById.has(motherId)
        ? motherId
        : fatherId != null && membersById.has(fatherId)
          ? fatherId
          : null;

    if (nextId == null) break;
    currentId = nextId;
  }

  return spine;
}

// The viewer's direct 1-hop neighborhood: self, parents, spouses, children,
// derived siblings — plus the union node(s) directly connecting the viewer
// to each. Deliberately does NOT walk into a spouse's own parent chain
// (D-03: a married-in spouse's separate/disconnected apex ancestry stays
// collapsed behind 17-03's ancestor-reveal badge, not auto-expanded here).
function directLineIds(viewerId, membersById, unions) {
  const ids = new Set([viewerId]);
  const viewer = membersById.get(viewerId);
  if (!viewer) return ids;

  const motherId = idOrNull(viewer.mother);
  const fatherId = idOrNull(viewer.father);
  if (motherId != null && membersById.has(motherId)) ids.add(motherId);
  if (fatherId != null && membersById.has(fatherId)) ids.add(fatherId);
  if (motherId != null && fatherId != null) {
    const parentUnion = unions.get(unionKey(motherId, fatherId));
    if (parentUnion) ids.add(parentUnion.id);
  }

  for (const spouse of viewer.spouses || []) {
    const spouseId = idOrNull(spouse);
    if (spouseId == null || !membersById.has(spouseId)) continue;
    ids.add(spouseId);
    const union = unions.get(unionKey(viewerId, spouseId));
    if (union) ids.add(union.id);
  }

  for (const child of viewer.children || []) {
    const childId = idOrNull(child);
    if (childId == null || !membersById.has(childId)) continue;
    ids.add(childId);

    const childMember = membersById.get(childId);
    const childMotherId = idOrNull(childMember.mother);
    const childFatherId = idOrNull(childMember.father);
    if (childMotherId != null && childFatherId != null) {
      const union = unions.get(unionKey(childMotherId, childFatherId));
      if (union) ids.add(union.id);
    }
  }

  for (const sibling of deriveSiblings(viewerId, membersById)) {
    ids.add(String(sibling.id));
  }

  return ids;
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
 * Computes ONLY the D-04 initial-expand-set piece: the ancestral spine
 * (apex to viewer, mother-preferred) plus the viewer's direct line (parents,
 * spouse, children, siblings). Standalone so a later viewerId resolution
 * (e.g. after `user` loads) can recompute this without re-running the full
 * `buildForest`. `buildForest` calls this internally.
 */
export function computeInitialExpandSet(flatMembers, viewerId) {
  if (!flatMembers || flatMembers.length === 0 || viewerId == null) return new Set();

  const membersById = buildMembersById(flatMembers);
  const viewerIdStr = String(viewerId);
  if (!membersById.has(viewerIdStr)) return new Set();

  const unions = buildUnions(membersById);
  const spine = walkAncestralSpine(viewerIdStr, membersById, unions);
  const direct = directLineIds(viewerIdStr, membersById, unions);

  return new Set([...spine, ...direct]);
}

/**
 * Assembles the flat FamilyMember payload into an xyflow-shaped forest:
 * one 'member' node per row, one synthetic 'union' node per distinct spouse
 * pair, 'marriage' edges (partner -> union) and 'descent' edges
 * (union -> shared child, only when BOTH parents match the pair).
 */
export function buildForest(flatMembers, viewerId) {
  if (!flatMembers || flatMembers.length === 0) {
    return {
      nodes: [],
      edges: [],
      generations: new Map(),
      apexIds: [],
      initialExpandedIds: new Set()
    };
  }

  const membersById = buildMembersById(flatMembers);
  const apexIds = flatMembers.filter((member) => member.mother == null && member.father == null).map((member) => String(member.id));
  const generations = computeGenerations(membersById);
  const unions = buildUnions(membersById);

  const nodes = [
    ...flatMembers.map((member) => ({ id: String(member.id), type: 'member', data: { member } })),
    ...[...unions.values()].map((union) => ({ id: union.id, type: 'union', data: {} }))
  ];

  const edges = [];
  for (const union of unions.values()) {
    const [partnerA, partnerB] = union.partnerIds;
    edges.push({ id: `${union.id}-marriage-${partnerA}`, source: partnerA, target: union.id, type: 'marriage' });
    edges.push({ id: `${union.id}-marriage-${partnerB}`, source: partnerB, target: union.id, type: 'marriage' });
  }

  for (const member of flatMembers) {
    const motherId = idOrNull(member.mother);
    const fatherId = idOrNull(member.father);
    if (motherId == null || fatherId == null) continue; // both parents required to route through a union

    const union = unions.get(unionKey(motherId, fatherId));
    if (!union) continue; // parents aren't a registered spouse pair — no descent edge in this pass

    edges.push({ id: `${union.id}-descent-${String(member.id)}`, source: union.id, target: String(member.id), type: 'descent' });
  }

  const initialExpandedIds = computeInitialExpandSet(flatMembers, viewerId);

  return { nodes, edges, generations, apexIds, initialExpandedIds };
}
