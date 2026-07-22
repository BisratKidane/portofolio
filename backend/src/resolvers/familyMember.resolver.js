import { requireAdmin, requireFamilyAccess } from '../utils/auth.js';

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
