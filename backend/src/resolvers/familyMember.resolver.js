import { requireAdmin, requireFamilyAccess } from '../utils/auth.js';
import { sanitizeNewMember } from './user.resolver.js';
import { computeEditableScope, linkParent, setSpouse } from '../services/familyMember.service.js';

export const familyMemberResolvers = {
  Query: {
    familyMembers: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
    },
    familyMember: async (_parent, { id }, { models, user }) => {
      requireFamilyAccess(user);
      return models.FamilyMember.findByPk(id);
    }
  },
  Mutation: {
    // T-14-01/T-14-02 (mitigate): every non-admin call is scope-checked via
    // computeEditableScope (PERM-05 single source of truth) before any
    // write, and D-01 is enforced structurally -- this mutation only ever
    // accepts a `newMember` payload for the parent being added, never an
    // existing-node id.
    addParent: async (_parent, { memberId, role, newMember }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(memberId);
      const isAdmin = user.role === 'ADMIN';

      if (!isAdmin) {
        const scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      const slot = role === 'MOTHER' ? 'motherId' : 'fatherId';

      return models.User.sequelize.transaction(async (t) => {
        const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
        if (!target) throw new Error('Family member not found.');

        if (target[slot] != null && !isAdmin) {
          throw new Error(`This member already has a ${role.toLowerCase()} on record.`);
        }

        const parent = await models.FamilyMember.create(sanitizeNewMember(newMember), { transaction: t });
        await linkParent(targetId, { [slot]: parent.id }, { transaction: t });

        return parent;
      });
    },
    // T-14-01 (mitigate): identical non-admin scope check to addParent, gated
    // through the same computeEditableScope single source of truth; D-01 is
    // enforced structurally (newMember-only, never an existing-node id).
    addSpouse: async (_parent, { memberId, newMember }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(memberId);
      const isAdmin = user.role === 'ADMIN';

      if (!isAdmin) {
        const scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      return models.User.sequelize.transaction(async (t) => {
        const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
        if (!target) throw new Error('Family member not found.');

        const spouse = await models.FamilyMember.create(sanitizeNewMember(newMember), { transaction: t });
        await setSpouse(targetId, spouse.id, { transaction: t });

        return spouse;
      });
    }
  },
  FamilyMember: {
    mother: (member, _args, { loaders }) =>
      member.motherId != null ? loaders.memberById.load(Number(member.motherId)) : null,
    father: (member, _args, { loaders }) =>
      member.fatherId != null ? loaders.memberById.load(Number(member.fatherId)) : null,
    spouses: (member, _args, { loaders }) => loaders.spousesByMemberId.load(Number(member.id)),
    children: (member, _args, { loaders }) => loaders.childrenByParentId.load(Number(member.id)),
    // Derived, never stored (REL-04/D-03): reuses the same batched
    // childrenByParentId loader `children` uses -- no dedicated siblings
    // loader is added. Collect this member's non-null parent ids, load each
    // parent's children (already batched/cached per-request), flatten and
    // de-duplicate by id, then exclude the member itself.
    siblings: async (member, _args, { loaders }) => {
      const parentIds = [member.motherId, member.fatherId].filter((id) => id != null).map(Number);
      if (parentIds.length === 0) return [];

      const childArrays = await Promise.all(
        parentIds.map((parentId) => loaders.childrenByParentId.load(parentId))
      );

      const byId = new Map();
      for (const children of childArrays) {
        for (const child of children) {
          byId.set(child.id, child);
        }
      }
      byId.delete(member.id);

      return [...byId.values()];
    },
    // Deliberate, discretionary choice (not an oversight): linkedUser uses
    // the Sequelize-generated association mixin directly rather than a
    // DataLoader. Unlike children/spouses/siblings, this field is not on the
    // deep-fan-out recursive traversal path, so per-node batching is lower
    // priority here.
    linkedUser: (member) => member.getLinkedUser()
  }
};
