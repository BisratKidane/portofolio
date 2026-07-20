import { describe, it, expect, beforeEach, vi } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail } from '../services/mailer.js';
import { hashVerificationToken } from '../utils/auth.js';

const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      message
    }
  }
`;

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('register', () => {
  it('returns a message-only payload for a brand-new email', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();
    expect(typeof data.register.message).toBe('string');
    expect(data.register.message.length).toBeGreaterThan(0);
  });

  it('creates an unverified row with a hashed verification token and ~24h expiry', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();

    const row = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(row.emailVerified).toBe(false);
    expect(row.emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(row.emailVerificationExpiresAt).toBeInstanceOf(Date);

    const now = Date.now();
    const expiresAt = row.emailVerificationExpiresAt.getTime();
    expect(expiresAt).toBeGreaterThan(now);
    expect(expiresAt).toBeLessThanOrEqual(now + 24 * 60 * 60 * 1000 + 60 * 1000);
  });

  it('emails the raw token while only the hash is persisted', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();

    await vi.waitFor(() => {
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    const [{ to, token }] = sendVerificationEmail.mock.calls[0];
    expect(to).toBe('ada@example.com');

    const row = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(hashVerificationToken(token)).toBe(row.emailVerificationToken);
  });

  it('rejects a duplicate email with the exact API-contract message', async () => {
    await createTestUser({ email: 'dup@example.com' });

    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Dup',
      email: 'dup@example.com',
      password: 'Password123!'
    });

    expect(errors[0].message).toBe('A user with this email already exists.');
    expect(data).toBeNull();
  });

  it('rejects a password shorter than 8 characters before creating the user', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Weak',
      email: 'weak@example.com',
      password: 'short'
    });

    expect(errors[0].message).toBe('Password must be at least 8 characters.');
    expect(data).toBeNull();

    const row = await models.User.findOne({ where: { email: 'weak@example.com' } });
    expect(row).toBeNull();
  });

  // Exercises Sequelize's isEmail model validator (resolver/model-level rejection),
  // not a GraphQL schema-level rejection — the SDL only enforces String! presence.
  it('rejects a malformed email via the isEmail model validator', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Invalid',
      email: 'not-an-email',
      password: 'Password123!'
    });

    expect(errors[0].message).toBe('Validation error: Validation isEmail on email failed');
    expect(data).toBeNull();
  });

  it('makes the very first registrant USER, not ADMIN', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();

    const row = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(row.role).toBe('USER');
  });
});
