import { describe, it, expect, beforeEach, vi } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

vi.mock('../services/mailer.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendPasswordResetEmail } from '../services/mailer.js';

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

    await vi.waitFor(() =>
      expect(sendPasswordResetEmail).toHaveBeenCalledWith({ to: user.email, token: user.resetPasswordToken })
    );
  });

  it('returns the identical generic message and never calls the mailer for a non-existing email', async () => {
    const response = await graphql(REQUEST_RESET_MUTATION, { email: 'no-such-user@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.requestPasswordReset.message).toBe(
      'If the account exists, a password reset link has been sent.'
    );
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

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
      resetPasswordToken: 'a-valid-reset-token',
      resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const response = await graphql(RESET_PASSWORD_MUTATION, {
      token: 'a-valid-reset-token',
      password: 'short'
    });

    expect(response.errors[0].message).toBe('Password must be at least 8 characters.');
    expect(response.data).toBeNull();

    await user.reload();
    expect(user.resetPasswordToken).toBe('a-valid-reset-token');
  });

  it('rejects reusing an already-consumed reset token', async () => {
    await createTestUser({
      email: 'single-use@example.com',
      resetPasswordToken: 'single-use-token',
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

  it('rejects an expired reset token', async () => {
    const user = await createTestUser({
      email: 'expired@example.com',
      resetPasswordToken: 'expired-token',
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
