import { requireAdmin, requireFamilyAccess, createInvitationToken, hashInvitationToken, invitationExpiry } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { sendInvitationEmail, sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';
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
    // Admin-only: every invitation.
    invitations: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.Invitation.findAll({ order: [['createdAt', 'DESC']] });
    },
    // Admin-only: invitations awaiting an approval decision.
    pendingRegistrations: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.Invitation.findAll({ where: { status: 'Registered' }, order: [['registeredAt', 'DESC']] });
    }
  },
  Mutation: {
    // Any Active linked family member (or admin) may invite. Access is already
    // gated to Active users by getUserFromRequest; requireFamilyAccess adds the
    // linked-member requirement so an unlinked account can't invite.
    createInvitation: async (_parent, { input }, { models, user }) => {
      requireFamilyAccess(user);

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
    },
    // Admin approves a registered invitation: activate the user and stamp the
    // decision. Only a 'Registered' invitation (invitee has registered, awaiting
    // review) can be approved.
    approveInvitation: async (_parent, { invitationId }, { models, user }) => {
      requireAdmin(user);
      const invitation = await models.Invitation.findByPk(invitationId);
      if (!invitation) throw new Error('Invitation not found.');
      if (invitation.status !== 'Registered') throw new Error('This registration is not awaiting approval.');

      const target = invitation.registeredUserId ? await models.User.findByPk(invitation.registeredUserId) : null;
      if (!target) throw new Error('The registered user no longer exists.');

      const sequelize = models.User.sequelize;
      await sequelize.transaction(async (t) => {
        await target.update({ status: 'Active' }, { transaction: t });
        await invitation.update({ status: 'Approved', approvedAt: new Date(), approvedBy: user.id }, { transaction: t });
      });

      sendAccountApprovedEmail({ to: target.email, name: target.name }).catch((err) =>
        console.error('Failed to send approval email:', err)
      );
      writeAuditLog(models, {
        action: 'invitation.approved',
        actorUserId: user.id,
        invitationId: invitation.id,
        targetUserId: target.id
      }).catch((err) => console.error('Failed to write audit log:', err));

      return invitation;
    },
    // Admin rejects a registered invitation: mark the user Rejected (login stays
    // blocked) and record the optional reason for auditing.
    rejectInvitation: async (_parent, { invitationId, reason }, { models, user }) => {
      requireAdmin(user);
      const invitation = await models.Invitation.findByPk(invitationId);
      if (!invitation) throw new Error('Invitation not found.');
      if (invitation.status !== 'Registered') throw new Error('This registration is not awaiting approval.');

      const target = invitation.registeredUserId ? await models.User.findByPk(invitation.registeredUserId) : null;
      const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

      const sequelize = models.User.sequelize;
      await sequelize.transaction(async (t) => {
        if (target) await target.update({ status: 'Rejected' }, { transaction: t });
        await invitation.update(
          { status: 'Rejected', rejectedAt: new Date(), rejectionReason: cleanReason },
          { transaction: t }
        );
      });

      if (target) {
        sendAccountRejectedEmail({ to: target.email, name: target.name, reason: cleanReason }).catch((err) =>
          console.error('Failed to send rejection email:', err)
        );
      }
      writeAuditLog(models, {
        action: 'invitation.rejected',
        actorUserId: user.id,
        invitationId: invitation.id,
        targetUserId: target?.id ?? null,
        metadata: { reason: cleanReason }
      }).catch((err) => console.error('Failed to write audit log:', err));

      return invitation;
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
