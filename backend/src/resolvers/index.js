import { userResolvers } from './user.resolver.js';
import { familyMemberResolvers } from './familyMember.resolver.js';
import { invitationResolvers } from './invitation.resolver.js';

export const resolvers = [userResolvers, familyMemberResolvers, invitationResolvers];
