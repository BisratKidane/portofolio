import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { env } from '../config/env.js';

const CHANGE_PASSWORD_MUTATION = `
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword) {
      token
      user { id email }
    }
  }
`;

beforeEach(resetTables);

describe('changePassword (self-service, requires current password)', () => {
  it('rejects an unauthenticated request', async () => {
    const { data, errors } = await graphql(
      CHANGE_PASSWORD_MUTATION,
      { currentPassword: 'Password123!', newPassword: 'NewPassword123!' },
      null
    );

    expect(errors[0].message).toBe('You must be logged in to perform this action.');
    expect(data).toBeNull();
  });

  it('rejects a wrong current password without changing anything', async () => {
    const user = await createTestUser({ email: 'self@example.com' });
    const hashBefore = user.passwordHash;

    const { data, errors } = await graphql(
      CHANGE_PASSWORD_MUTATION,
      { currentPassword: 'WrongPassword!', newPassword: 'NewPassword123!' },
      user
    );

    expect(errors[0].message).toBe('Your current password is incorrect.');
    expect(data).toBeNull();

    await user.reload();
    expect(user.passwordHash).toBe(hashBefore);
  });

  it('enforces the minimum password strength on the new password', async () => {
    const user = await createTestUser({ email: 'self@example.com' });

    const { data, errors } = await graphql(
      CHANGE_PASSWORD_MUTATION,
      { currentPassword: 'Password123!', newPassword: 'short' },
      user
    );

    expect(errors[0].message).toBe('Password must be at least 8 characters.');
    expect(data).toBeNull();
  });

  it('rejects reusing the current password as the new password', async () => {
    const user = await createTestUser({ email: 'self@example.com' });

    const { data, errors } = await graphql(
      CHANGE_PASSWORD_MUTATION,
      { currentPassword: 'Password123!', newPassword: 'Password123!' },
      user
    );

    expect(errors[0].message).toBe('New password must be different from your current password.');
    expect(data).toBeNull();
  });

  it('changes the password, sets passwordChangedAt, and returns a fresh valid token', async () => {
    const user = await createTestUser({ email: 'self@example.com' });
    expect(user.passwordChangedAt).toBeNull();

    const { data, errors } = await graphql(
      CHANGE_PASSWORD_MUTATION,
      { currentPassword: 'Password123!', newPassword: 'BrandNewPass1!' },
      user
    );

    expect(errors).toBeUndefined();
    expect(data.changePassword.user.id).toBe(String(user.id));

    // Fresh token identifies the same user and is not expired.
    const payload = jwt.verify(data.changePassword.token, env.jwtSecret);
    expect(String(payload.sub)).toBe(String(user.id));

    await user.reload();
    expect(user.passwordChangedAt).not.toBeNull();
    // New password validates; old one no longer does.
    expect(await user.validatePassword('BrandNewPass1!')).toBe(true);
    expect(await user.validatePassword('Password123!')).toBe(false);

    // The rotated token was issued at/after the password change, so it survives
    // the passwordChangedAt revocation check in getUserFromRequest.
    const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    expect(payload.iat).toBeGreaterThanOrEqual(changedAtSeconds);
  });
});
