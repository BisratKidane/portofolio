import { requireAdmin } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';

// Shared precondition for both approveUser/rejectUser. Order matters: a
// repeat click on an already-decided account must get the "not awaiting a
// decision" message, not the verification message -- so status is checked
// before emailVerified (D-07 before D-08/D-09).
function assertDispositionable(target) {
  if (target.status !== 'Pending') throw new Error('This account is not awaiting a decision.');
  if (!target.emailVerified) throw new Error('This account has not verified its email address yet.');
}

export const approvalResolvers = {
  Mutation: {
    // Admin approves an account directly: activate the user and stamp the
    // decision onto the User row itself (D-04), whether or not an Invitation
    // row exists. When an Invitation does exist, it is also stamped (D-05)
    // inside the same transaction, sharing the identical now/admin.id values.
    approveUser: async (_parent, { userId }, { models, user }) => {
      requireAdmin(user);
      const target = await models.User.findByPk(userId);
      if (!target) throw new Error('User not found.');
      assertDispositionable(target);

      const invitation = await models.Invitation.findOne({ where: { registeredUserId: target.id } });
      const now = new Date();

      const sequelize = models.User.sequelize;
      await sequelize.transaction(async (t) => {
        await target.update({ status: 'Active', approvedAt: now, approvedBy: user.id }, { transaction: t });
        if (invitation) {
          await invitation.update({ status: 'Approved', approvedAt: now, approvedBy: user.id }, { transaction: t });
        }
      });

      sendAccountApprovedEmail({ to: target.email, name: target.name }).catch((err) =>
        console.error('Failed to send approval email:', err)
      );
      writeAuditLog(models, {
        action: 'user.approved',
        actorUserId: user.id,
        invitationId: invitation?.id ?? null,
        targetUserId: target.id
      }).catch((err) => console.error('Failed to write audit log:', err));

      return target;
    },
    // Admin rejects an account directly: mark it Rejected (login stays
    // blocked) and stamp the decision onto the User row itself (D-04). When
    // an Invitation exists, it is also stamped (D-05) with the identical
    // now/cleanReason values used for the User row.
    rejectUser: async (_parent, { userId, reason }, { models, user }) => {
      requireAdmin(user);
      const target = await models.User.findByPk(userId);
      if (!target) throw new Error('User not found.');
      assertDispositionable(target);

      const invitation = await models.Invitation.findOne({ where: { registeredUserId: target.id } });
      const now = new Date();
      const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

      const sequelize = models.User.sequelize;
      await sequelize.transaction(async (t) => {
        await target.update({ status: 'Rejected', rejectedAt: now, rejectionReason: cleanReason }, { transaction: t });
        if (invitation) {
          await invitation.update({ status: 'Rejected', rejectedAt: now, rejectionReason: cleanReason }, { transaction: t });
        }
      });

      sendAccountRejectedEmail({ to: target.email, name: target.name, reason: cleanReason }).catch((err) =>
        console.error('Failed to send rejection email:', err)
      );
      writeAuditLog(models, {
        action: 'user.rejected',
        actorUserId: user.id,
        invitationId: invitation?.id ?? null,
        targetUserId: target.id,
        metadata: { reason: cleanReason }
      }).catch((err) => console.error('Failed to write audit log:', err));

      return target;
    }
  }
};
