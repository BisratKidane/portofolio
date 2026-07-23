import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../models/index.js';

const MAX_DEPTH = 100; // generous upper bound; tree is documented at ~10-23 generations

export async function wouldCreateCycle(childId, candidateParentId, { transaction } = {}) {
  if (childId === candidateParentId) return true;

  let frontier = [candidateParentId];
  const visited = new Set();

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    if (frontier.includes(childId)) return true;

    const rows = await models.FamilyMember.findAll({
      where: { id: frontier },
      attributes: ['id', 'motherId', 'fatherId'],
      transaction
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

export async function linkParent(childId, { motherId, fatherId } = {}, { transaction } = {}) {
  if (motherId != null && (await wouldCreateCycle(childId, motherId, { transaction }))) {
    throw new Error('This assignment would make the member their own ancestor (mother).');
  }
  if (fatherId != null && (await wouldCreateCycle(childId, fatherId, { transaction }))) {
    throw new Error('This assignment would make the member their own ancestor (father).');
  }

  const updates = {};
  if (motherId !== undefined) updates.motherId = motherId;
  if (fatherId !== undefined) updates.fatherId = fatherId;

  return models.FamilyMember.update(updates, { where: { id: childId }, transaction });
}

// REL-06 (D-08/D-09/D-10/D-11): the single, unconditional dedup guard for
// every addChild caller (member add, admin add, addSibling -- which routes
// through this function -- and any future caller). No role/admin-override
// parameter exists here by design (D-08 -- no admin override).
async function run(attrs, t) {
  const parentIds = [attrs.motherId, attrs.fatherId].filter((id) => id != null);

  if (parentIds.length > 0) {
    // Lock the shared-parent row(s) FIRST, before the duplicate-name read --
    // this is what closes the TOCTOU race a bare SELECT-then-INSERT would
    // leave open (D-10). Two concurrent addChild calls targeting the same
    // parent serialize on this lock, one at a time.
    await models.FamilyMember.findAll({
      where: { id: parentIds },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    // Normalize INSIDE the guard itself -- never assume the caller already
    // normalized firstname (belt-and-suspenders on top of sanitizeNewMember).
    const normalizedFirstname = attrs.firstname.trim().toLowerCase();

    const conflict = await models.FamilyMember.findOne({
      where: {
        [Op.and]: [
          { [Op.or]: parentIds.flatMap((pid) => [{ motherId: pid }, { fatherId: pid }]) },
          sequelize.where(
            sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('FamilyMember.firstname'))),
            normalizedFirstname
          )
        ]
      },
      include: [{ association: 'mother' }, { association: 'father' }],
      transaction: t
    });

    if (conflict) {
      const sharedParent = parentIds.includes(conflict.motherId) ? conflict.mother : conflict.father;
      throw new Error(
        `A child named '${conflict.firstname}' already exists under ${sharedParent.fullname}. ` +
          `Pick a different name, or edit the existing member.`
      );
    }
  }

  return models.FamilyMember.create(attrs, { transaction: t });
}

export async function addChild(attrs, { transaction } = {}) {
  // Mirrors setSpouse's exact convention: run directly against a
  // caller-supplied transaction (never nest a second sequelize.transaction(...)
  // inside an existing one); when no transaction is supplied, open one here
  // so the guard is never silently skipped by a caller that forgets to pass
  // one (Pitfall 2/A3).
  if (transaction) {
    return run(attrs, transaction);
  }
  return sequelize.transaction((t) => run(attrs, t));
}

async function createOrFindSpouseRow(memberAId, memberBId, transaction) {
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
}

export async function setSpouse(memberAId, memberBId, { transaction } = {}) {
  // When a transaction is supplied by the caller, run directly against it --
  // never nest a second sequelize.transaction(...) inside an existing one.
  // Only wrap in a fresh transaction when no caller-supplied transaction
  // exists, preserving the pre-existing 2-arg-caller behavior unchanged.
  if (transaction) {
    return createOrFindSpouseRow(memberAId, memberBId, transaction);
  }
  return sequelize.transaction((t) => createOrFindSpouseRow(memberAId, memberBId, t));
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

// PERM-05: the single, reused server-side computation of the "editable set" —
// self, both parents, spouses (from either Spouse-row direction), children,
// and either-parent-derived siblings (including half-siblings). Bounded to
// exactly one hop of self's own parentIds — never recurses into
// grandparents, cousins, or a sibling's other siblings. Every mutation
// resolver in this phase must import and reuse this, never re-derive scope
// inline (T-14-01).
export async function computeEditableScope(memberId, { transaction } = {}) {
  if (memberId == null) {
    return { ids: new Set(), self: null, parents: [], spouses: [], children: [], siblings: [] };
  }

  const self = await models.FamilyMember.findByPk(memberId, { transaction });
  if (!self) {
    return { ids: new Set(), self: null, parents: [], spouses: [], children: [], siblings: [] };
  }

  const parentIds = [self.motherId, self.fatherId].filter((id) => id != null);

  const [parents, spouseRows, children, siblings] = await Promise.all([
    parentIds.length > 0
      ? models.FamilyMember.findAll({ where: { id: parentIds }, transaction })
      : Promise.resolve([]),
    models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
      include: [{ association: 'memberA' }, { association: 'memberB' }],
      transaction
    }),
    models.FamilyMember.findAll({
      where: { [Op.or]: [{ motherId: memberId }, { fatherId: memberId }] },
      transaction
    }),
    // Never add a bare null-valued parent-column clause here — that would
    // compile to an IS NULL check, matching every other parentless member
    // (Pitfall 4). Skip the query entirely when self has no recorded parents.
    parentIds.length > 0
      ? models.FamilyMember.findAll({
          where: {
            [Op.and]: [
              { id: { [Op.ne]: memberId } },
              { [Op.or]: parentIds.flatMap((pid) => [{ motherId: pid }, { fatherId: pid }]) }
            ]
          },
          transaction
        })
      : Promise.resolve([])
  ]);

  const spouses = spouseRows.map((row) => (row.memberAId === memberId ? row.memberB : row.memberA));

  const ids = new Set([
    memberId,
    ...parentIds,
    ...spouses.map((s) => s.id),
    ...children.map((c) => c.id),
    ...siblings.map((s) => s.id)
  ]);

  return { ids, self, parents, spouses, children, siblings };
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
