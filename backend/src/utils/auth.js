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

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }

  const user = await models.User.findByPk(payload.sub); // DB errors propagate as real errors
  if (!user) return null;

  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAtSeconds) return null;
  }

  if (!user.emailVerified) return null;

  // Only Active accounts may authenticate. A Pending (awaiting-approval),
  // Rejected, or Disabled user's token is treated as not-logged-in.
  if (user.status !== 'Active') return null;

  return user;
}

export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}

export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}

// The single named in-memory definition of "a currently-functioning administrator": role ADMIN,
// status Active, AND emailVerified true. Scoped to an already-loaded User instance (today: only
// verifyAndPromote's inviter-vouching check in user.resolver.js). As of Plan 32-12 (Gap 2, 3rd
// round), the two raw-SQL admin counts -- verifyAndPromote's admin-slot COUNT(*) and updateUser's
// otherFunctioningAdminCount helper, both in user.resolver.js -- are unified with this function on
// the exact same three-part CRITERIA (role = 'ADMIN' AND status = 'Active' AND emailVerified =
// true), even though they deliberately do NOT call this function directly: one is a raw SQL
// string, not a JS predicate over a loaded instance, and the other is a Sequelize where-clause
// count over a different set of users, not an in-memory check on one row -- unifying the CODE PATH
// (not just the criteria) would change their query/locking shape and is out of scope here. This
// helper only covers the in-memory-instance case, so a fourth call site loading a User row can
// reuse it instead of hand-rolling a fourth variant of the same three-part check.
export function isFunctioningAdmin(user) {
  return Boolean(user) && user.role === 'ADMIN' && user.status === 'Active' && user.emailVerified === true;
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

export function createVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verificationTokenExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

// Invitation tokens: same hash-at-rest scheme as reset/verification tokens —
// the raw token is only ever returned once (to build the registration URL) and
// never stored; only its sha256 hash lives in the DB.
export function createInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function invitationExpiry() {
  return new Date(Date.now() + env.inviteExpiresDays * 24 * 60 * 60 * 1000);
}
