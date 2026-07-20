import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await models.User.findByPk(payload.sub);
    if (!user) return null;

    if (user.passwordChangedAt) {
      const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < changedAtSeconds) return null;
    }

    return user;
  } catch {
    return null;
  }
}

export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}

export function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function resetTokenExpiry() {
  return new Date(Date.now() + env.resetTokenExpiresMinutes * 60 * 1000);
}
