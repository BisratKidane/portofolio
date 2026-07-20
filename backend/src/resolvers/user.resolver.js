import {
  createResetToken,
  createVerificationToken,
  hashResetToken,
  hashVerificationToken,
  requireAdmin,
  requireAuth,
  resetTokenExpiry,
  signToken,
  verificationTokenExpiry
} from '../utils/auth.js';
import { assertPasswordStrength } from '../utils/passwordPolicy.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mailer.js';

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
      requireAuth(user);
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

      // Atomic conditional update: only succeeds if the token is still the one we just read.
      // This closes the read-then-write race where two concurrent requests could both pass
      // the findOne/expiry check and both save() successfully (mirrors resetPassword's WR-02 fix).
      const [affectedCount] = await models.User.update(
        { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null },
        { where: { id: user.id, emailVerificationToken: hashed }, individualHooks: true }
      );
      if (affectedCount === 0) throw new Error('The email verification token is invalid or has expired.');

      // Race-safe ADMIN assignment: a second, separate atomic update. Only sets role='ADMIN'
      // if no verified ADMIN exists yet — under two concurrent verifications, exactly one
      // wins this conditional UPDATE and the loser's WHERE clause simply matches zero rows.
      // An already-filled ADMIN slot is never reopened (D-04/D-06).
      // MySQL forbids selecting directly from the same table being updated inside a subquery
      // ("You can't specify target table 'users' for update in FROM clause"), so the
      // NOT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN' AND emailVerified = true) check
      // is expressed as an UPDATE ... JOIN against a materialized derived table instead —
      // functionally identical atomicity/race-safety, MySQL-compatible syntax.
      await models.User.sequelize.query(
        `UPDATE users
         JOIN (
           SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true
         ) AS existingAdmin
         SET users.role = 'ADMIN'
         WHERE users.id = :id AND users.role != 'ADMIN' AND existingAdmin.adminCount = 0`,
        { replacements: { id: user.id } }
      );

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
    }
  }
};
