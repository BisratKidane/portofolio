import { UniqueConstraintError } from 'sequelize';
import {
  createResetToken,
  createVerificationToken,
  hashResetToken,
  hashVerificationToken,
  requireAdmin,
  requireAuth,
  requireFamilyAccess,
  resetTokenExpiry,
  signToken,
  verificationTokenExpiry
} from '../utils/auth.js';
import { assertPasswordStrength } from '../utils/passwordPolicy.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mailer.js';

const OPTIONAL_FAMILY_MEMBER_FIELDS = ['mothersname', 'email', 'birthdate', 'deathdate', 'phone', 'address'];

// Admin-submitted `newMember` payloads send blank optional fields as empty
// strings, not null/undefined. Sequelize only skips validators for
// null/undefined, so an empty string reaches `isEmail`/DATEONLY validation
// and fails (CR-01). Trim strings and convert blank optional fields to null
// before they reach the model; required fields (firstname/lastname/gender)
// are left untouched so their own required-field validation still fires.
function sanitizeNewMember(newMember) {
  const sanitized = { ...newMember };
  for (const key of OPTIONAL_FAMILY_MEMBER_FIELDS) {
    const value = sanitized[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      sanitized[key] = trimmed === '' ? null : trimmed;
    }
  }
  return sanitized;
}

const RESET_REQUEST_MESSAGE = 'If the account exists, a password reset link has been sent.';
const RESEND_VERIFICATION_MESSAGE = 'If an unverified account exists, a verification link has been sent.';

export const MIN_RESET_RESPONSE_MS = 250;

function serializeUser(user) {
  return user ? user.get({ plain: true }) : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const userResolvers = {
  Query: {
    me: (_parent, _args, { user }) => serializeUser(user),
    dashboard: async (_parent, _args, { models, user }) => {
      requireFamilyAccess(user);
      const users = user.role === 'ADMIN' ? await models.User.findAll({ order: [['createdAt', 'DESC']] }) : null;
      return {
        message: user.role === 'ADMIN' ? 'Welcome to the admin dashboard.' : 'Welcome to your dashboard.',
        user,
        users
      };
    },
    users: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.User.findAll({ order: [['createdAt', 'DESC']] });
    },
    unlinkedUsers: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.User.findAll({ where: { familyMemberId: null }, order: [['createdAt', 'DESC']] });
    }
  },
  Mutation: {
    register: async (_parent, { name, email, password }, { models }) => {
      assertPasswordStrength(password);

      const existingUser = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
      if (existingUser) throw new Error('A user with this email already exists.');

      const verificationToken = createVerificationToken();
      const user = await models.User.create({
        name,
        email,
        passwordHash: password,
        emailVerificationToken: hashVerificationToken(verificationToken),
        emailVerificationExpiresAt: verificationTokenExpiry()
      });

      sendVerificationEmail({ to: user.email, token: verificationToken }).catch((err) => {
        console.error('Failed to send verification email:', err);
      });

      return { message: 'Registration successful. Please check your email to verify your account.' };
    },
    login: async (_parent, { email, password }, { models }) => {
      const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
      if (!user || !(await user.validatePassword(password))) throw new Error('Invalid email or password.');
      if (!user.emailVerified) throw new Error('Please verify your email before signing in.');
      return { token: signToken(user), user };
    },
    logout: (_parent, _args, { user }) => {
      requireAuth(user);
      return true;
    },
    requestPasswordReset: async (_parent, { email }, { models }) => {
      const startedAt = Date.now();

      const issueResetToken = async () => {
        const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
        if (!user) return;

        const resetToken = createResetToken();
        user.resetPasswordToken = hashResetToken(resetToken);
        user.resetPasswordExpiresAt = resetTokenExpiry();
        await user.save();

        sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
          console.error('Failed to send password reset email:', err);
        });
      };

      try {
        await issueResetToken();
      } catch (err) {
        console.error('Failed to issue password reset token:', err);
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_RESET_RESPONSE_MS) await delay(MIN_RESET_RESPONSE_MS - elapsed);

      return { message: RESET_REQUEST_MESSAGE };
    },
    resetPassword: async (_parent, { token, password }, { models }) => {
      const hashed = hashResetToken(token);
      const user = await models.User.findOne({ where: { resetPasswordToken: hashed } });
      if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
        throw new Error('The password reset token is invalid or has expired.');
      }

      assertPasswordStrength(password);

      // Atomic conditional update: only succeeds if the token is still the one we just read.
      // This closes the read-then-write race where two concurrent requests could both pass
      // the findOne/expiry check and both save() successfully (WR-02).
      const [affectedCount] = await models.User.update(
        { passwordHash: password, resetPasswordToken: null, resetPasswordExpiresAt: null },
        { where: { id: user.id, resetPasswordToken: hashed }, individualHooks: true }
      );
      if (affectedCount === 0) throw new Error('The password reset token is invalid or has expired.');
      return true;
    },
    verifyEmail: async (_parent, { token }, { models }) => {
      const hashed = hashVerificationToken(token);
      const user = await models.User.findOne({ where: { emailVerificationToken: hashed } });
      if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
        throw new Error('The email verification token is invalid or has expired.');
      }

      const sequelize = models.User.sequelize;

      // Verify-and-promote run inside a single transaction so token consumption and the single
      // ADMIN-slot decision commit (or roll back) as one atomic unit. The admin-count read takes
      // a locking FOR UPDATE read, so concurrent verifiers serialize on it — structurally
      // guaranteeing at most one ADMIN rather than relying on statement-level autocommit timing.
      // Nothing is visible until the whole transaction commits, so a deadlock arising from two
      // racers contending on lock order is always safe to retry: the losing racer's token is not
      // yet consumed on rollback, so re-running the transaction is idempotent (D-04/D-05/D-11).
      const verifyAndPromote = () =>
        sequelize.transaction(async (t) => {
          // Atomic conditional update: only succeeds if the token is still the one we just read.
          const [affectedCount] = await models.User.update(
            { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null },
            { where: { id: user.id, emailVerificationToken: hashed }, individualHooks: true, transaction: t }
          );
          if (affectedCount === 0) throw new Error('The email verification token is invalid or has expired.');

          const [{ adminCount }] = await sequelize.query(
            "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE",
            { transaction: t, type: sequelize.QueryTypes.SELECT }
          );
          if (Number(adminCount) === 0) {
            await models.User.update({ role: 'ADMIN' }, { where: { id: user.id }, transaction: t });
          }
        });

      const isDeadlock = (error) =>
        error?.original?.code === 'ER_LOCK_DEADLOCK' || error?.parent?.code === 'ER_LOCK_DEADLOCK';

      try {
        await verifyAndPromote();
      } catch (error) {
        // A lock-order deadlock between two concurrent racers rolls back cleanly (nothing
        // committed, single-use token not consumed), so it is safe to retry exactly once. Any
        // other error, or a second deadlock, propagates unchanged.
        if (!isDeadlock(error)) throw error;
        await verifyAndPromote();
      }

      await user.reload();
      return { token: signToken(user), user };
    },
    resendVerificationEmail: async (_parent, { email }, { models }) => {
      const startedAt = Date.now();

      const issueVerificationToken = async () => {
        const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
        if (!user || user.emailVerified) return;

        const verificationToken = createVerificationToken();
        user.emailVerificationToken = hashVerificationToken(verificationToken);
        user.emailVerificationExpiresAt = verificationTokenExpiry();
        await user.save();

        sendVerificationEmail({ to: user.email, token: verificationToken }).catch((err) => {
          console.error('Failed to send verification email:', err);
        });
      };

      try {
        await issueVerificationToken();
      } catch (err) {
        console.error('Failed to issue verification token:', err);
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_RESET_RESPONSE_MS) await delay(MIN_RESET_RESPONSE_MS - elapsed);

      return { message: RESEND_VERIFICATION_MESSAGE };
    },
    linkUserToMember: async (_parent, { userId, memberId, newMember }, { models, user }) => {
      requireAdmin(user);

      if ((memberId == null) === (newMember == null)) {
        throw new Error('Provide exactly one of memberId or newMember.');
      }

      const targetUser = await models.User.findByPk(userId);
      if (!targetUser) throw new Error('User not found.');

      // WR-03: the mutation is the security/data-integrity boundary, so it
      // must enforce "already linked" itself rather than relying on the
      // admin UI only listing unlinked users. Without this, re-linking an
      // already-linked user would silently re-point them and orphan the
      // previous member's linkedUser.
      if (targetUser.familyMemberId != null) {
        throw new Error('This account is already linked to a family member.');
      }

      // Member resolution/creation and the user link are wrapped in a single
      // transaction (WR-01): if linking the user fails after a new
      // FamilyMember row was just created, the whole thing rolls back
      // instead of leaving an orphaned, unlinked family_members row.
      try {
        await models.User.sequelize.transaction(async (t) => {
          let resolvedMemberId;
          if (memberId != null) {
            const member = await models.FamilyMember.findByPk(memberId, { transaction: t });
            if (!member) throw new Error('Family member not found.');
            resolvedMemberId = memberId;
          } else {
            const createdMember = await models.FamilyMember.create(sanitizeNewMember(newMember), { transaction: t });
            resolvedMemberId = createdMember.id;
          }

          await targetUser.update({ familyMemberId: resolvedMemberId }, { transaction: t });
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new Error('This family member is already linked to another account.');
        }
        throw error;
      }

      return targetUser;
    }
  }
};
