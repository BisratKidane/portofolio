import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail } from '../services/mailer.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { hashVerificationToken } from '../utils/auth.js';

const UPDATE_USER_MUTATION = `
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      id
      name
      email
      role
      emailVerified
    }
  }
`;

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('updateUser — authorization', () => {
  it('lets an ADMIN edit another user\'s name', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'target@example.com', name: 'Old Name' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { name: 'New Name' } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.name).toBe('New Name');

    await target.reload();
    expect(target.name).toBe('New Name');
  });

  it('lets a normal user edit their OWN name', async () => {
    const self = await createTestUser({ role: 'USER', email: 'self@example.com', name: 'Ada' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(self.id), input: { name: 'Augusta' } },
      self
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.name).toBe('Augusta');
  });

  it('forbids a normal user from editing ANOTHER account', async () => {
    const actor = await createTestUser({ role: 'USER', email: 'actor@example.com' });
    const victim = await createTestUser({ role: 'USER', email: 'victim@example.com', name: 'Untouched' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(victim.id), input: { name: 'Hacked' } },
      actor
    );

    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();

    await victim.reload();
    expect(victim.name).toBe('Untouched');
  });

  it('rejects an unauthenticated request', async () => {
    const target = await createTestUser({ email: 'target@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { name: 'Nope' } },
      null
    );

    expect(errors[0].message).toBe('You must be logged in to perform this action.');
    expect(data).toBeNull();
  });

  it('returns "User not found." for an unknown id', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: '999999', input: { name: 'Ghost' } },
      admin
    );

    expect(errors[0].message).toBe('User not found.');
    expect(data).toBeNull();
  });
});

describe('updateUser — role changes', () => {
  it('forbids a normal user from changing their own role', async () => {
    const self = await createTestUser({ role: 'USER', email: 'self@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(self.id), input: { role: 'ADMIN' } },
      self
    );

    expect(errors[0].message).toBe('Only an administrator can change roles.');
    expect(data).toBeNull();

    await self.reload();
    expect(self.role).toBe('USER');
  });

  it('lets an ADMIN promote a USER to ADMIN', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'target@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { role: 'ADMIN' } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.role).toBe('ADMIN');
  });

  it('lets an ADMIN demote another ADMIN when other verified admins remain', async () => {
    const adminA = await createTestUser({ role: 'ADMIN', email: 'a@example.com' });
    const adminB = await createTestUser({ role: 'ADMIN', email: 'b@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(adminB.id), input: { role: 'USER' } },
      adminA
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.role).toBe('USER');
  });

  it('blocks demoting the last verified administrator', async () => {
    const onlyAdmin = await createTestUser({ role: 'ADMIN', email: 'only@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(onlyAdmin.id), input: { role: 'USER' } },
      onlyAdmin
    );

    expect(errors[0].message).toBe('Cannot remove the last administrator.');
    expect(data).toBeNull();

    await onlyAdmin.reload();
    expect(onlyAdmin.role).toBe('ADMIN');
  });

  it('does not count an UNVERIFIED admin as a remaining administrator', async () => {
    const activeAdmin = await createTestUser({ role: 'ADMIN', email: 'active@example.com' });
    // An unverified admin cannot log in, so demoting the only verified admin
    // must still be blocked even though another ADMIN row exists.
    await createTestUser({ role: 'ADMIN', email: 'pending@example.com', emailVerified: false });

    const { errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(activeAdmin.id), input: { role: 'USER' } },
      activeAdmin
    );

    expect(errors[0].message).toBe('Cannot remove the last administrator.');
  });
});

describe('updateUser — email changes trigger re-verification', () => {
  it('flips emailVerified to false and emails a verification link on email change', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'old@example.com', emailVerified: true });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { email: 'new@example.com' } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.email).toBe('new@example.com');
    expect(data.updateUser.emailVerified).toBe(false);

    await target.reload();
    expect(target.email).toBe('new@example.com');
    expect(target.emailVerified).toBe(false);
    expect(target.emailVerificationToken).not.toBeNull();

    await vi.waitFor(() => {
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      const { to, token } = sendVerificationEmail.mock.calls[0][0];
      expect(to).toBe('new@example.com');
      expect(hashVerificationToken(token)).toBe(target.emailVerificationToken);
    });
  });

  it('does NOT re-verify or email when the submitted email is unchanged', async () => {
    const self = await createTestUser({ role: 'USER', email: 'same@example.com', emailVerified: true, name: 'Ada' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(self.id), input: { name: 'Ada Lovelace', email: 'same@example.com' } },
      self
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.emailVerified).toBe(true);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('rejects an email already used by another account', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    await createTestUser({ role: 'USER', email: 'taken@example.com' });
    const target = await createTestUser({ role: 'USER', email: 'target@example.com' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { email: 'taken@example.com' } },
      admin
    );

    expect(errors[0].message).toBe('A user with this email already exists.');
    expect(data).toBeNull();

    await target.reload();
    expect(target.email).toBe('target@example.com');
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('updateUser — validation', () => {
  it('rejects a blank name', async () => {
    const self = await createTestUser({ role: 'USER', email: 'self@example.com', name: 'Ada' });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(self.id), input: { name: '   ' } },
      self
    );

    expect(errors[0].message).toBe('Name is required.');
    expect(data).toBeNull();
  });
});
