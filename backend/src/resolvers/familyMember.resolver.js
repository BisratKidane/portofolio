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
  }
};
