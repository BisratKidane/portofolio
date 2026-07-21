import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../models/index.js';

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

export async function setSpouse(memberAId, memberBId) {
  return sequelize.transaction(async (transaction) => {
    try {
      return await models.Spouse.create({ memberAId, memberBId }, { transaction });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return models.Spouse.findOne({
          where: {
            [Op.or]: [
              { memberAId, memberBId },
              { memberAId: memberBId, memberBId: memberAId }
            ]
          },
          transaction
        });
      }
      throw error;
    }
  });
}

export async function getSpouseRows(memberId) {
  return models.Spouse.findAll({
    where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
    include: [{ association: 'memberA' }, { association: 'memberB' }]
  });
}

async function isMarriedInOnly(memberId, transaction) {
  const member = await models.FamilyMember.findByPk(memberId, { transaction });
  if (!member) return false;
  if (member.motherId != null || member.fatherId != null) return false;

  const childCount = await models.FamilyMember.count({
    where: { [Op.or]: [{ motherId: memberId }, { fatherId: memberId }] },
    transaction
  });
  return childCount === 0;
}

export async function deleteMember(memberId) {
  return sequelize.transaction(async (transaction) => {
    const spouseRows = await models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
      transaction
    });

    const partnerIds = spouseRows.map((row) =>
      row.memberAId === memberId ? row.memberBId : row.memberAId
    );

    // ONE HOP ONLY: check married-in status using the CURRENT state (before
    // the target is deleted), never recurse into the partner's own spouses.
    const marriedInPartnerIds = [];
    for (const partnerId of partnerIds) {
      if (await isMarriedInOnly(partnerId, transaction)) {
        marriedInPartnerIds.push(partnerId);
      }
    }

    // Delete spouse join rows first (both target's and married-in partner's),
    // then the married-in partner(s), then the target. Order matters: the FK
    // from Spouse -> FamilyMember has no cascade configured, so join rows
    // must be removed explicitly before either FamilyMember row is destroyed.
    await models.Spouse.destroy({
      where: {
        [Op.or]: [
          { memberAId: memberId }, { memberBId: memberId },
          ...marriedInPartnerIds.flatMap((id) => [{ memberAId: id }, { memberBId: id }])
        ]
      },
      transaction
    });

    if (marriedInPartnerIds.length > 0) {
      await models.FamilyMember.destroy({ where: { id: marriedInPartnerIds }, transaction });
    }

    // Deleting this row triggers ON DELETE SET NULL on any children's
    // motherId/fatherId at the DB constraint level automatically.
    await models.FamilyMember.destroy({ where: { id: memberId }, transaction });
  });
}
