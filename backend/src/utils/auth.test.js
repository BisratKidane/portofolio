import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  signToken,
  getUserFromRequest,
  requireAuth,
  requireAdmin,
  requireFamilyAccess,
  createResetToken,
  resetTokenExpiry,
  createVerificationToken,
  hashVerificationToken,
  verificationTokenExpiry
} from './auth.js';

describe('signToken', () => {
  it('produces a token whose decoded payload carries the expected sub and role claims', () => {
    const token = signToken({ id: 42, role: 'ADMIN' });
    const payload = jwt.verify(token, env.jwtSecret);

    expect(payload.sub).toBe(42);
    expect(payload.role).toBe('ADMIN');
  });
});

describe('getUserFromRequest', () => {
  it('resolves the stubbed user for a valid Bearer token', async () => {
    const token = signToken({ id: 7, role: 'USER' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let calledWith;
    const models = { User: { findByPk: (id) => { calledWith = id; return { id, role: 'USER', emailVerified: true }; } } };

    const result = await getUserFromRequest(req, models);

    expect(calledWith).toBe(7);
    expect(result).toEqual({ id: 7, role: 'USER', emailVerified: true });
  });

  it('returns null without invoking findByPk when there is no Authorization header', async () => {
    const req = { headers: {} };
    const models = { User: { findByPk: () => { throw new Error('should not be called'); } } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });

  it('returns null for an expired token, without reaching the stubbed DB lookup', async () => {
    const expired = jwt.sign({ sub: 1, role: 'USER' }, env.jwtSecret, { expiresIn: '-1s' });
    const req = { headers: { authorization: `Bearer ${expired}` } };
    const models = { User: { findByPk: () => { throw new Error('should not be called'); } } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });

  it('returns null for a tampered-signature token', async () => {
    const token = signToken({ id: 1, role: 'USER' });
    const parts = token.split('.');
    const lastChar = parts[2].slice(-1);
    parts[2] = parts[2].slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
    const tampered = parts.join('.');
    const req = { headers: { authorization: `Bearer ${tampered}` } };
    const models = { User: { findByPk: () => { throw new Error('should not be called'); } } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const wrongSecretToken = jwt.sign({ sub: 1, role: 'USER' }, 'a-different-secret', { expiresIn: '1d' });
    const req = { headers: { authorization: `Bearer ${wrongSecretToken}` } };
    const models = { User: { findByPk: () => { throw new Error('should not be called'); } } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });

  it('propagates a DB/infrastructure error from findByPk instead of swallowing it as unauthenticated (WR-01)', async () => {
    const token = signToken({ id: 7, role: 'USER' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const dbError = new Error('connection pool exhausted');
    const models = { User: { findByPk: async () => { throw dbError; } } };

    await expect(getUserFromRequest(req, models)).rejects.toThrow('connection pool exhausted');
  });
});

describe('getUserFromRequest — passwordChangedAt revocation (SESS-03)', () => {
  it('accepts a token whose iat lands in the same whole second as passwordChangedAt', async () => {
    const changedAt = new Date('2026-01-01T12:00:00.900Z');
    const iatSameSecond = Math.floor(changedAt.getTime() / 1000);

    // expiresIn is deliberately large (10y) — iat is a fixed historical instant used purely to pin
    // the same-second boundary, and must not accidentally expire relative to the real wall clock.
    const token = jwt.sign({ sub: 7, role: 'USER', iat: iatSameSecond }, env.jwtSecret, { expiresIn: '3650d' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', passwordChangedAt: changedAt, emailVerified: true }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).not.toBeNull();
  });

  it('revokes a token whose iat is in the second immediately before passwordChangedAt', async () => {
    const changedAt = new Date('2026-01-01T12:00:01.100Z');
    const iatPriorSecond = Math.floor(changedAt.getTime() / 1000) - 1;

    const token = jwt.sign({ sub: 7, role: 'USER', iat: iatPriorSecond }, env.jwtSecret, { expiresIn: '3650d' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', passwordChangedAt: changedAt }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });

  it('does not revoke when passwordChangedAt is NULL (D-05 — no backfill)', async () => {
    const token = signToken({ id: 7, role: 'USER' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', passwordChangedAt: null, emailVerified: true }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).not.toBeNull();
  });
});

describe('getUserFromRequest — email verification gate (VERIFY-05)', () => {
  it('resolves the user when emailVerified is true for an otherwise-valid token', async () => {
    const token = signToken({ id: 7, role: 'USER' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', emailVerified: true }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).not.toBeNull();
  });

  it('returns null when emailVerified is false, even with a valid, unexpired token', async () => {
    const token = signToken({ id: 7, role: 'USER' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', emailVerified: false }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });
});

describe('requireAuth', () => {
  it('does not throw for an authenticated user', () => {
    expect(() => requireAuth({ id: 1, role: 'USER' })).not.toThrow();
  });

  it('throws for null', () => {
    expect(() => requireAuth(null)).toThrow();
  });

  it('throws for undefined', () => {
    expect(() => requireAuth(undefined)).toThrow();
  });
});

describe('requireAdmin', () => {
  it('does not throw for ADMIN', () => {
    expect(() => requireAdmin({ role: 'ADMIN' })).not.toThrow();
  });

  it('throws for USER', () => {
    expect(() => requireAdmin({ role: 'USER' })).toThrow();
  });

  it('throws for null (via requireAuth)', () => {
    expect(() => requireAdmin(null)).toThrow();
  });
});

describe('requireFamilyAccess', () => {
  it('does not throw for a linked (non-admin) user', () => {
    expect(() => requireFamilyAccess({ role: 'USER', familyMemberId: 5 })).not.toThrow();
  });

  it('does not throw for an ADMIN with no linked member (D-06 carve-out)', () => {
    expect(() => requireFamilyAccess({ role: 'ADMIN', familyMemberId: null })).not.toThrow();
  });

  it('throws for an unlinked, non-admin user', () => {
    expect(() => requireFamilyAccess({ role: 'USER', familyMemberId: null })).toThrow(
      'Your account is not yet linked to a family member.'
    );
  });

  it('throws for null (via requireAuth)', () => {
    expect(() => requireFamilyAccess(null)).toThrow('You must be logged in to perform this action.');
  });
});

describe('createResetToken', () => {
  it('returns a 64-char hex string', () => {
    expect(createResetToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different value on each call', () => {
    expect(createResetToken()).not.toBe(createResetToken());
  });
});

describe('resetTokenExpiry', () => {
  it('returns a Date in the future, within tolerance of env.resetTokenExpiresMinutes', () => {
    const expiry = resetTokenExpiry();
    const now = Date.now();

    expect(expiry.getTime()).toBeGreaterThan(now);
    expect(expiry.getTime()).toBeLessThanOrEqual(now + (env.resetTokenExpiresMinutes + 1) * 60000);
  });
});

describe('createVerificationToken', () => {
  it('returns a 64-char hex string', () => {
    expect(createVerificationToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different value on each call', () => {
    expect(createVerificationToken()).not.toBe(createVerificationToken());
  });
});

describe('hashVerificationToken', () => {
  it('is deterministic for a fixed input token', () => {
    const token = 'a'.repeat(64);

    expect(hashVerificationToken(token)).toBe(hashVerificationToken(token));
    expect(hashVerificationToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verificationTokenExpiry', () => {
  it('returns a Date roughly 24h in the future', () => {
    const expiry = verificationTokenExpiry();
    const now = Date.now();

    expect(expiry.getTime()).toBeGreaterThan(now);
    expect(expiry.getTime()).toBeLessThanOrEqual(now + 24 * 60 * 60 * 1000 + 60000);
  });
});
