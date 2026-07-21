import { models } from '../models/index.js';

const MAX_DEPTH = 100; // generous upper bound; tree is documented at ~10-23 generations

export async function wouldCreateCycle(childId, candidateParentId) {
  if (childId === candidateParentId) return true;

  let frontier = [candidateParentId];
  const visited = new Set();

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    if (frontier.includes(childId)) return true;

    const rows = await models.FamilyMember.findAll({
      where: { id: frontier },
      attributes: ['id', 'motherId', 'fatherId']
    });

    const next = new Set();
    for (const row of rows) {
      if (row.motherId && !visited.has(row.motherId)) next.add(row.motherId);
      if (row.fatherId && !visited.has(row.fatherId)) next.add(row.fatherId);
    }
    frontier.forEach((id) => visited.add(id));
    frontier = [...next];
  }

  return false;
}

export async function linkParent(childId, { motherId, fatherId } = {}) {
  if (motherId != null && (await wouldCreateCycle(childId, motherId))) {
    throw new Error('This assignment would make the member their own ancestor (mother).');
  }
  if (fatherId != null && (await wouldCreateCycle(childId, fatherId))) {
    throw new Error('This assignment would make the member their own ancestor (father).');
  }

  const updates = {};
  if (motherId !== undefined) updates.motherId = motherId;
  if (fatherId !== undefined) updates.fatherId = fatherId;

  return models.FamilyMember.update(updates, { where: { id: childId } });
}

export async function addChild(attrs) {
  return models.FamilyMember.create(attrs);
}
