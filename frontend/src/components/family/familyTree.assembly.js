// Pure, DOM-free client-side forest-assembly module for the /family tree
// (Phase 17, Plan 17-02, revised for the pure hierarchical model). Consumes
// the flat FamilyMember payload shape documented in 17-RESEARCH.md Pattern 1
// ({ id, mother: {id}|null, father: {id}|null, spouses: [{id}],
// children: [{id}] }) and produces the xyflow-shaped { nodes, edges } plus
// generation ranks and the D-04 initial expand set. No React, no dagre, no
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

// Walks up from the viewer, preferring the mother's chain at every step
// (Open Question 1 resolution), collecting every member id on the path,
// until an apex ancestor (no mother, no father) is reached.
function walkAncestralSpine(viewerId, membersById) {
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
// derived siblings. Deliberately does NOT walk into a spouse's own parent
// chain (D-03: a married-in spouse's separate/disconnected apex ancestry
// stays collapsed behind 17-03's ancestor-reveal badge, not auto-expanded
// here).
function directLineIds(viewerId, membersById) {
  const ids = new Set([viewerId]);
  const viewer = membersById.get(viewerId);
  if (!viewer) return ids;

  const motherId = idOrNull(viewer.mother);
  const fatherId = idOrNull(viewer.father);
  if (motherId != null && membersById.has(motherId)) ids.add(motherId);
  if (fatherId != null && membersById.has(fatherId)) ids.add(fatherId);

  for (const spouse of viewer.spouses || []) {
    const spouseId = idOrNull(spouse);
    if (spouseId == null || !membersById.has(spouseId)) continue;
    ids.add(spouseId);
  }

  for (const child of viewer.children || []) {
    const childId = idOrNull(child);
    if (childId == null || !membersById.has(childId)) continue;
    ids.add(childId);
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

  const spine = walkAncestralSpine(viewerIdStr, membersById);
  const direct = directLineIds(viewerIdStr, membersById);

  return new Set([...spine, ...direct]);
}

/**
 * Assembles the flat FamilyMember payload into an xyflow-shaped forest: one
 * 'member' node per row (no synthetic union nodes), and one direct
 * parent->child 'parent' edge per present, known parent (a single-parent
 * child yields 1 edge, a two-parent child yields 2 edges).
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

  const nodes = flatMembers.map((member) => ({ id: String(member.id), type: 'member', data: { member } }));

  const edges = [];
  for (const member of flatMembers) {
    const childId = String(member.id);
    const motherId = idOrNull(member.mother);
    const fatherId = idOrNull(member.father);
    if (motherId != null && membersById.has(motherId)) {
      edges.push({ id: `parent-${motherId}-${childId}`, source: motherId, target: childId, type: 'parent' });
    }
    if (fatherId != null && membersById.has(fatherId)) {
      edges.push({ id: `parent-${fatherId}-${childId}`, source: fatherId, target: childId, type: 'parent' });
    }
  }

  const initialExpandedIds = computeInitialExpandSet(flatMembers, viewerId);

  return { nodes, edges, generations, apexIds, initialExpandedIds };
}
