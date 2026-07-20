import { describe, it, expect, beforeEach, vi } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

vi.mock('../services/mailer.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendPasswordResetEmail } from '../services/mailer.js';
import { MIN_RESET_RESPONSE_MS } from './user.resolver.js';
import { hashResetToken } from '../utils/auth.js';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const REQUEST_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
    }
  }
`;

const REQUEST_RESET_WITH_TOKEN_FIELD = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
      resetToken
    }
  }
`;

const RESET_PASSWORD_MUTATION = `
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('requestPasswordReset', () => {
  it('returns the generic message and persists a reset token + expiry for an existing email', async () => {
    const user = await createTestUser({ email: 'existing-user@example.com' });

    const response = await graphql(REQUEST_RESET_MUTATION, { email: 'existing-user@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.requestPasswordReset.message).toBe(
      'If the account exists, a password reset link has been sent.'
    );

    await user.reload();
    expect(user.resetPasswordToken).not.toBeNull();
    expect(user.resetPasswordExpiresAt).not.toBeNull();

    await vi.waitFor(async () => {
      expect(sendPasswordResetEmail).toHaveBeenCalled();
      const rawToken = sendPasswordResetEmail.mock.calls[0][0].token;
      await user.reload();
      expect(hashResetToken(rawToken)).toBe(user.resetPasswordToken);
    });
  });

  it('never persists the raw/emailed reset token — only its hash is stored (RESET-06)', async () => {
    const user = await createTestUser({ email: 'hash-at-rest@example.com' });

    const response = await graphql(REQUEST_RESET_MUTATION, { email: 'hash-at-rest@example.com' });
    expect(response.errors).toBeUndefined();

    await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalled());

    await user.reload();
    const rawToken = sendPasswordResetEmail.mock.calls[0][0].token;
    expect(user.resetPasswordToken).not.toBe(rawToken);
  });

  it('returns the identical generic message and never calls the mailer for a non-existing email', async () => {
    const response = await graphql(REQUEST_RESET_MUTATION, { email: 'no-such-user@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.requestPasswordReset.message).toBe(
      'If the account exists, a password reset link has been sent.'
    );
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('does not leak account existence through response latency', async () => {
    await createTestUser({ email: 'timing-existing@example.com' });

    const sample = async (email) => {
      const startedAt = performance.now();
      const response = await graphql(REQUEST_RESET_MUTATION, { email });
      const elapsed = performance.now() - startedAt;

      expect(response.errors).toBeUndefined();
      expect(response.data.requestPasswordReset.message).toBe(
        'If the account exists, a password reset link has been sent.'
      );
      return elapsed;
    };

    const existing = [];
    const missing = [];
    for (let i = 0; i < 5; i += 1) {
      existing.push(await sample('timing-existing@example.com'));
      missing.push(await sample('no-such-user@example.com'));
    }

    const existingMedian = median(existing);
    const missingMedian = median(missing);
    const tolerance = 25;

    expect(existingMedian).toBeGreaterThanOrEqual(MIN_RESET_RESPONSE_MS - tolerance);
    expect(missingMedian).toBeGreaterThanOrEqual(MIN_RESET_RESPONSE_MS - tolerance);
    expect(Math.abs(existingMedian - missingMedian)).toBeLessThan(50);
  }, 20000);

  it('rejects querying the removed resetToken field with a GraphQL validation error', async () => {
    const response = await graphql(REQUEST_RESET_WITH_TOKEN_FIELD, { email: 'existing-user@example.com' });

    expect(response.errors).toBeDefined();
    expect(response.data).toBeFalsy();
  });
});

describe('resetPassword', () => {
  it('rejects a password shorter than 8 characters before persisting anything', async () => {
    const user = await createTestUser({
      email: 'reset-me@example.com',
      resetPasswordToken: hashResetToken('a-valid-reset-token'),
      resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const response = await graphql(RESET_PASSWORD_MUTATION, {
      token: 'a-valid-reset-token',
      password: 'short'
    });

    expect(response.errors[0].message).toBe('Password must be at least 8 characters.');
    expect(response.data).toBeNull();

    await user.reload();
    expect(user.resetPasswordToken).toBe(hashResetToken('a-valid-reset-token'));
  });

  it('rejects reusing an already-consumed reset token', async () => {
    await createTestUser({
      email: 'single-use@example.com',
      resetPasswordToken: hashResetToken('single-use-token'),
      resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const firstResponse = await graphql(RESET_PASSWORD_MUTATION, {
      token: 'single-use-token',
      password: 'ValidPass123'
    });
    expect(firstResponse.data.resetPassword).toBe(true);

    const secondResponse = await graphql(RESET_PASSWORD_MUTATION, {
      token: 'single-use-token',
      password: 'AnotherValid456'
    });
    expect(secondResponse.errors[0].message).toBe('The password reset token is invalid or has expired.');
    expect(secondResponse.data).toBeNull();
  });

  it('allows only one winner when two requests race on the same still-valid token (WR-02)', async () => {
    await createTestUser({
      email: 'concurrent-use@example.com',
      resetPasswordToken: hashResetToken('concurrent-token'),
      resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const [firstResponse, secondResponse] = await Promise.all([
      graphql(RESET_PASSWORD_MUTATION, { token: 'concurrent-token', password: 'ValidPass123' }),
      graphql(RESET_PASSWORD_MUTATION, { token: 'concurrent-token', password: 'AnotherValid456' })
    ]);

    const results = [firstResponse, secondResponse];
    const successes = results.filter((r) => r.data && r.data.resetPassword === true);
    const failures = results.filter((r) => r.errors && r.errors[0].message === 'The password reset token is invalid or has expired.');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it('rejects an expired reset token', async () => {
    const user = await createTestUser({
      email: 'expired@example.com',
      resetPasswordToken: hashResetToken('expired-token'),
      resetPasswordExpiresAt: new Date(Date.now() - 1000)
    });
    const passwordHashBefore = user.passwordHash;

    const response = await graphql(RESET_PASSWORD_MUTATION, {
      token: 'expired-token',
      password: 'ValidPass123'
    });

    expect(response.errors[0].message).toBe('The password reset token is invalid or has expired.');
    expect(response.data).toBeNull();

    await user.reload();
    expect(user.passwordHash).toBe(passwordHashBefore);
  });
});
