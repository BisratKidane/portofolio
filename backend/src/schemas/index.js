import { userTypeDefs } from './user.schema.js';
import { familyMemberTypeDefs } from './familyMember.schema.js';
import { invitationTypeDefs } from './invitation.schema.js';
import { approvalTypeDefs } from './approval.schema.js';

export const typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs, approvalTypeDefs];
