import { requireAdmin, requireFamilyAccess, createInvitationToken, hashInvitationToken, invitationExpiry } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { sendInvitationEmail } from '../services/mailer.js';
import { buildWhatsappShareUrl, sendWhatsappMessage } from '../services/whatsapp.js';
import { env } from '../config/env.js';

function blankToNull(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export const invitationResolvers = {
  Query: {
    // An inviter's own sent invitations.
    myInvitations: async (_parent, _args, { models, user }) => {
      requireFamilyAccess(user);
      return models.Invitation.findAll({ where: { inviterId: user.id }, order: [['createdAt', 'DESC']] });
    },
    // Admin-only: every invitation (feeds the approval dashboard in Phase 4).
    invitations: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.Invitation.findAll({ order: [['createdAt', 'DESC']] });
    }
  },
  Mutation: {
    // Any Active linked family member (or admin) may invite. Access is already
    // gated to Active users by getUserFromRequest; requireFamilyAccess adds the
    // linked-member requirement so an unlinked account can't invite.
    createInvitation: async (_parent, { input }, { models, user }) => {
      requireFamilyAccess(user);

      const method = input.invitationMethod;
      const invitedEmail = blankToNull(input.invitedEmail);
      const invitedPhone = blankToNull(input.invitedPhone);

      // The mutation is the integrity boundary — validate here, not just in the
      // model, so we can give a precise message before creating a token.
      if (method === 'email' && !invitedEmail) throw new Error('An email invitation needs an email address.');
      if (method === 'whatsapp' && !invitedPhone) throw new Error('A WhatsApp invitation needs a phone number.');

      const rawToken = createInvitationToken();
      const invitation = await models.Invitation.create({
        tokenHash: hashInvitationToken(rawToken),
        inviterId: user.id,
        invitedName: blankToNull(input.invitedName),
        invitedEmail,
        invitedPhone,
        invitationMethod: method,
        relationshipToFamily: blankToNull(input.relationshipToFamily),
        invitationNote: blankToNull(input.invitationNote),
        expiresAt: invitationExpiry(),
        status: 'Pending'
      });

      const registrationUrl = `${env.clientUrl}/register?token=${rawToken}`;
      const shareMessage = `You've been invited to join the family platform. Register here (single-use, expires soon): ${registrationUrl}`;
      let whatsappUrl = null;

      if (method === 'email') {
        sendInvitationEmail({
          to: invitedEmail,
          url: registrationUrl,
          inviterName: user.name,
          invitedName: invitation.invitedName,
          relationship: invitation.relationshipToFamily,
          note: invitation.invitationNote
        }).catch((err) => console.error('Failed to send invitation email:', err));
      } else {
        // WhatsApp: always provide the shareable link; the Business-API send is
        // attempted too but stays dormant until credentials are configured.
        whatsappUrl = buildWhatsappShareUrl(invitedPhone, shareMessage);
        sendWhatsappMessage({ to: invitedPhone, message: shareMessage }).catch((err) =>
          console.error('Failed to send WhatsApp invitation:', err)
        );
      }

      writeAuditLog(models, {
        action: 'invitation.created',
        actorUserId: user.id,
        invitationId: invitation.id,
        metadata: { method, invitedEmail, invitedPhone }
      }).catch((err) => console.error('Failed to write audit log:', err));

      return { invitation, registrationUrl, whatsappUrl };
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
    }
  }
};
