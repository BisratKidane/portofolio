import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { hashVerificationToken } from '../utils/auth.js';

const VERIFY_EMAIL_MUTATION = `
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) {
      token
      user {
        id
        name
        email
        role
      }
    }
  }
`;

const INVALID_OR_EXPIRED_MESSAGE = 'The email verification token is invalid or has expired.';

beforeEach(resetTables);

describe('verifyEmail', () => {
  it('flips emailVerified, clears the token/expiry, and returns a working session for a valid token', async () => {
    const user = await createTestUser({
      email: 'verify-me@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('a-valid-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'a-valid-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.token).toEqual(expect.any(String));
    expect(response.data.verifyEmail.user.email).toBe('verify-me@example.com');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerificationToken).toBeNull();
    expect(user.emailVerificationExpiresAt).toBeNull();
  });

  it('rejects an unknown/garbage token', async () => {
    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'not-a-real-token' });

    expect(response.errors[0].message).toBe(INVALID_OR_EXPIRED_MESSAGE);
    expect(response.data).toBeNull();
  });

  it('rejects an expired token and does not flip emailVerified', async () => {
    const user = await createTestUser({
      email: 'expired-verify@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('expired-token'),
      emailVerificationExpiresAt: new Date(Date.now() - 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'expired-token' });

    expect(response.errors[0].message).toBe(INVALID_OR_EXPIRED_MESSAGE);
    expect(response.data).toBeNull();

    await user.reload();
    expect(user.emailVerified).toBe(false);
  });

  it('rejects reusing an already-consumed verification token (single-use)', async () => {
    await createTestUser({
      email: 'single-use-verify@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('single-use-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const firstResponse = await graphql(VERIFY_EMAIL_MUTATION, { token: 'single-use-token' });
    expect(firstResponse.errors).toBeUndefined();
    expect(firstResponse.data.verifyEmail.user.email).toBe('single-use-verify@example.com');

    const secondResponse = await graphql(VERIFY_EMAIL_MUTATION, { token: 'single-use-token' });
    expect(secondResponse.errors[0].message).toBe(INVALID_OR_EXPIRED_MESSAGE);
    expect(secondResponse.data).toBeNull();
  });

  it('assigns ADMIN to exactly one of two users racing to verify with zero existing ADMIN (VERIFY-04)', async () => {
    await createTestUser({
      email: 'racer-one@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('racer-one-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    await createTestUser({
      email: 'racer-two@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('racer-two-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const [firstResponse, secondResponse] = await Promise.all([
      graphql(VERIFY_EMAIL_MUTATION, { token: 'racer-one-token' }),
      graphql(VERIFY_EMAIL_MUTATION, { token: 'racer-two-token' })
    ]);

    expect(firstResponse.errors).toBeUndefined();
    expect(secondResponse.errors).toBeUndefined();

    const roles = [firstResponse.data.verifyEmail.user.role, secondResponse.data.verifyEmail.user.role];
    const admins = roles.filter((role) => role === 'ADMIN');
    const users = roles.filter((role) => role === 'USER');

    expect(admins).toHaveLength(1);
    expect(users).toHaveLength(1);
  });

  it('does not reopen the ADMIN slot for a later verification once it is already filled (D-04/D-06)', async () => {
    await createTestUser({ email: 'existing-admin@example.com', role: 'ADMIN', emailVerified: true });

    await createTestUser({
      email: 'late-verifier@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('late-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'late-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.role).toBe('USER');
  });
});
