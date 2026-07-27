import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const SET_USER_PASSWORD_MUTATION = `
  mutation SetUserPassword($userId: ID!, $newPassword: String!) {
    setUserPassword(userId: $userId, newPassword: $newPassword)
  }
`;

beforeEach(resetTables);

describe('setUserPassword (admin sets another user\'s password, no email)', () => {
  it('requires an authenticated admin', async () => {
    const target = await createTestUser({ email: 'target@example.com' });

    const { data, errors } = await graphql(
      SET_USER_PASSWORD_MUTATION,
      { userId: String(target.id), newPassword: 'NewPassword123!' },
      null
    );

    expect(errors[0].message).toBe('You must be logged in to perform this action.');
    expect(data).toBeNull();
  });

  it('forbids a non-admin from setting anyone\'s password', async () => {
    const actor = await createTestUser({ role: 'USER', email: 'actor@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'target@example.com' });
    const hashBefore = target.passwordHash;

    const { data, errors } = await graphql(
      SET_USER_PASSWORD_MUTATION,
      { userId: String(target.id), newPassword: 'NewPassword123!' },
      actor
    );

    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();

    await target.reload();
    expect(target.passwordHash).toBe(hashBefore);
  });

  it('returns "User not found." for an unknown user id', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      SET_USER_PASSWORD_MUTATION,
      { userId: '999999', newPassword: 'NewPassword123!' },
      admin
    );

    expect(errors[0].message).toBe('User not found.');
    expect(data).toBeNull();
  });

  it('enforces password strength', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'target@example.com' });

    const { data, errors } = await graphql(
      SET_USER_PASSWORD_MUTATION,
      { userId: String(target.id), newPassword: 'short' },
      admin
    );

    expect(errors[0].message).toBe('Password must be at least 8 characters.');
    expect(data).toBeNull();
  });

  it('sets the new password and invalidates the target\'s existing sessions via passwordChangedAt', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'target@example.com' });
    expect(target.passwordChangedAt).toBeNull();

    const { data, errors } = await graphql(
      SET_USER_PASSWORD_MUTATION,
      { userId: String(target.id), newPassword: 'AdminSetPass1!' },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.setUserPassword).toBe(true);

    await target.reload();
    expect(await target.validatePassword('AdminSetPass1!')).toBe(true);
    expect(target.passwordChangedAt).not.toBeNull();
  });
});
