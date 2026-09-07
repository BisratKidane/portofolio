import { requireAdmin, createInvitationToken, hashInvitationToken, invitationExpiry } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { sendInvitationEmail } from '../services/mailer.js';
import { env } from '../config/env.js';

function blankToNull(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export const invitationResolvers = {
  Query: {
    // Admin-only: an inviter's own sent invitations (D-02 — after this phase
    // every invitation is admin-issued, so a non-admin's list could only ever
    // return legacy rows they cannot act on).
    myInvitations: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.Invitation.findAll({ where: { inviterId: user.id }, order: [['createdAt', 'DESC']] });
    },
    // Admin-only: every invitation.
    invitations: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.Invitation.findAll({ order: [['createdAt', 'DESC']] });
    }
  },
  Mutation: {
    // Admin-only (D-01): every invitation is now admin-issued, enforced
    // server-side, not merely hidden in the UI.
    createInvitation: async (_parent, { input }, { models, user }) => {
      requireAdmin(user);

      const invitedEmail = blankToNull(input.invitedEmail);

      // The mutation is the integrity boundary — validate here, not just in the
      // model, so we can give a precise message before creating a token.
      if (!invitedEmail) throw new Error('An invitation needs an email address.');

      const rawToken = createInvitationToken();
      const invitation = await models.Invitation.create({
        tokenHash: hashInvitationToken(rawToken),
        inviterId: user.id,
        invitedName: blankToNull(input.invitedName),
        invitedEmail,
        relationshipToFamily: blankToNull(input.relationshipToFamily),
        invitationNote: blankToNull(input.invitationNote),
        expiresAt: invitationExpiry(),
        status: 'Pending'
      });

      const registrationUrl = `${env.clientUrl}/register?token=${rawToken}`;

      sendInvitationEmail({
        to: invitedEmail,
        url: registrationUrl,
        inviterName: user.name,
        invitedName: invitation.invitedName,
        relationship: invitation.relationshipToFamily,
        note: invitation.invitationNote
      }).catch((err) => console.error('Failed to send invitation email:', err));

      writeAuditLog(models, {
        action: 'invitation.created',
        actorUserId: user.id,
        invitationId: invitation.id,
        metadata: { invitedEmail }
      }).catch((err) => console.error('Failed to write audit log:', err));

      return { invitation, registrationUrl };
    }
  },
  Invitation: {
    // Only expose the inviter to an admin or to the inviter themselves — the
    // queries already scope which invitations are visible, and this keeps the
    // User row (email/role) from leaking further.
    inviter: async (invitation, _args, { user, loaders }) => {
      if (invitation.inviterId == null) return null;
      if (user?.role === 'ADMIN' || Number(invitation.inviterId) === Number(user?.id)) {
        return loaders.userById.load(Number(invitation.inviterId));
      }
      return null;
    },
    // Admin-only: the account that registered against this invitation (feeds the
    // approval dashboard with the name/email/verification the invitee chose).
    registeredUser: async (invitation, _args, { user, loaders }) => {
      if (invitation.registeredUserId == null || user?.role !== 'ADMIN') return null;
      return loaders.userById.load(Number(invitation.registeredUserId));
    }
  }
};
