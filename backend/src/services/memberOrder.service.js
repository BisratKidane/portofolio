function birthTime(value) {
  if (value === null || value === undefined || value === '') return Infinity;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Infinity : time;
}

function compareSiblings(a, b) {
  const ta = birthTime(a.birthdate);
  const tb = birthTime(b.birthdate);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return Number(a.id) - Number(b.id);
}

function addToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

// Pure: orders members depth-first (pre-order) through the parent -> child tree.
// Roots (no parent in the set) ascend by id; children ascend by birthdate (unknown
// last, then id); a married-in spouse follows their partner before the children.
export function orderDepthFirst(members, spouseRows) {
  const byId = new Map();
  for (const member of members) byId.set(Number(member.id), member);

  const hasParentInSet = (member) =>
    byId.has(Number(member.fatherId)) || byId.has(Number(member.motherId));

  const children = new Map();
  for (const member of members) {
    const parents = new Set([Number(member.fatherId), Number(member.motherId)]);
    for (const parentId of parents) {
      if (byId.has(parentId)) addToMap(children, parentId, member);
    }
  }
  for (const list of children.values()) list.sort(compareSiblings);

  const spouses = new Map();
  for (const row of spouseRows || []) {
    const a = Number(row.memberAId);
    const b = Number(row.memberBId);
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    addToMap(spouses, a, byId.get(b));
    addToMap(spouses, b, byId.get(a));
  }
  for (const list of spouses.values()) list.sort((x, y) => Number(x.id) - Number(y.id));

  const visited = new Set();
  const result = [];

  const walk = (startId) => {
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      const member = byId.get(id);
      result.push(member);

      const marriedIn = (spouses.get(id) || []).filter(
        (spouse) => !visited.has(Number(spouse.id)) && !hasParentInSet(spouse)
      );
      for (const spouse of marriedIn) {
        visited.add(Number(spouse.id));
        result.push(spouse);
      }

      // A married-in spouse's children follow the member's own children.
      const next = [...(children.get(id) || [])];
      for (const spouse of marriedIn) next.push(...(children.get(Number(spouse.id)) || []));
      for (let i = next.length - 1; i >= 0; i -= 1) stack.push(Number(next[i].id));
    }
  };

  const sortedIds = [...byId.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    if (!visited.has(id) && !hasParentInSet(byId.get(id))) walk(id);
  }
  // Anything left (cycles) is still listed once, with its descendants adjacent.
  for (const id of sortedIds) {
    if (!visited.has(id)) walk(id);
  }
  return result;
}

// Two queries regardless of size. Performs NO auth check: callers must run it first.
export async function loadMembersDepthFirst(models) {
  const members = await models.FamilyMember.findAll();
  const spouses = await models.Spouse.findAll();
  return orderDepthFirst(members, spouses);
}
