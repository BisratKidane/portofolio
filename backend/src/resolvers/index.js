import { userResolvers } from './user.resolver.js';
import { familyMemberResolvers } from './familyMember.resolver.js';
import { invitationResolvers } from './invitation.resolver.js';
import { approvalResolvers } from './approval.resolver.js';
import { settingResolvers } from './setting.resolver.js';

export const resolvers = [userResolvers, familyMemberResolvers, invitationResolvers, approvalResolvers, settingResolvers];
