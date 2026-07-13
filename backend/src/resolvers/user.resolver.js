import { createResetToken, requireAdmin, requireAuth, resetTokenExpiry, signToken } from '../utils/auth.js';
import { assertPasswordStrength } from '../utils/passwordPolicy.js';
import { sendPasswordResetEmail } from '../services/mailer.js';

function serializeUser(user) {
  return user ? user.get({ plain: true }) : null;
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

      const userCount = await models.User.count();
      const user = await models.User.create({
        name,
        email,
        passwordHash: password,
        role: userCount === 0 ? 'ADMIN' : 'USER'
      });

      return { token: signToken(user), user };
    },
    login: async (_parent, { email, password }, { models }) => {
      const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
      if (!user || !(await user.validatePassword(password))) throw new Error('Invalid email or password.');
      return { token: signToken(user), user };
    },
    logout: (_parent, _args, { user }) => {
      requireAuth(user);
      return true;
    },
    requestPasswordReset: async (_parent, { email }, { models }) => {
      const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
      const message = 'If the account exists, a password reset link has been sent.';
      if (!user) return { message };

      const resetToken = createResetToken();
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpiresAt = resetTokenExpiry();
      await user.save();

      sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
        console.error('Failed to send password reset email:', err);
      });

      return { message };
    },
    resetPassword: async (_parent, { token, password }, { models }) => {
      const user = await models.User.findOne({ where: { resetPasswordToken: token } });
      if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
        throw new Error('The password reset token is invalid or has expired.');
      }

      assertPasswordStrength(password);

      user.passwordHash = password;
      user.resetPasswordToken = null;
      user.resetPasswordExpiresAt = null;
      await user.save();
      return true;
    }
  }
};
