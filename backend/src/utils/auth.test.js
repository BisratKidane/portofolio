import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { signToken, getUserFromRequest } from './auth.js';

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
    const models = { User: { findByPk: (id) => { calledWith = id; return { id, role: 'USER' }; } } };

    const result = await getUserFromRequest(req, models);

    expect(calledWith).toBe(7);
    expect(result).toEqual({ id: 7, role: 'USER' });
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
});
