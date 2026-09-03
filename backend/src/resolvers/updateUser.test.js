import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail } from '../services/mailer.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { hashVerificationToken } from '../utils/auth.js';
import { models } from '../models/index.js';

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

describe('updateUser — last administrator guard covers email changes (CR-01)', () => {
  it('blocks the sole verified administrator from changing their own email', async () => {
    const onlyAdmin = await createTestUser({ role: 'ADMIN', email: 'sole-admin@example.com', emailVerified: true });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(onlyAdmin.id), input: { email: 'new-sole-admin@example.com' } },
      onlyAdmin
    );

    expect(errors[0].message).toBe("Promote another administrator before changing the last administrator's email.");
    expect(data).toBeNull();

    await onlyAdmin.reload();
    expect(onlyAdmin.email).toBe('sole-admin@example.com');
    expect(onlyAdmin.emailVerified).toBe(true);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('lets an administrator change their own email when a backup verified administrator exists', async () => {
    const adminA = await createTestUser({ role: 'ADMIN', email: 'admin-a@example.com', emailVerified: true });
    await createTestUser({ role: 'ADMIN', email: 'admin-b@example.com', emailVerified: true });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(adminA.id), input: { email: 'admin-a-new@example.com' } },
      adminA
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.email).toBe('admin-a-new@example.com');
    expect(data.updateUser.emailVerified).toBe(false);

    await adminA.reload();
    expect(adminA.email).toBe('admin-a-new@example.com');
    expect(adminA.emailVerified).toBe(false);

    await vi.waitFor(() => {
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    });
  });

  it('does not block the only (unverified) administrator from changing their own email (WR-01 fix)', async () => {
    // WR-01 fix: the original version of this test also created a verified
    // `backupAdmin`, which confounded the assertion -- the guard would have
    // let the change through anyway because a backup verified admin existed,
    // regardless of whether the `target.emailVerified === true` clause was
    // present. `unverifiedAdmin` is the ONLY administrator here, so this now
    // genuinely exercises that clause: the guard must skip the last-admin
    // count entirely because the target is not currently a verified admin.
    const unverifiedAdmin = await createTestUser({
      role: 'ADMIN',
      email: 'unverified-admin@example.com',
      emailVerified: false
    });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(unverifiedAdmin.id), input: { email: 'unverified-admin-new@example.com' } },
      unverifiedAdmin
    );

    expect(errors).toBeUndefined();
    expect(data.updateUser.email).toBe('unverified-admin-new@example.com');
    expect(data.updateUser.emailVerified).toBe(false);

    await unverifiedAdmin.reload();
    expect(unverifiedAdmin.email).toBe('unverified-admin-new@example.com');
  });
});

describe('updateUser — refuses to edit a non-editable (Rejected/Disabled) account (Gap 1, 3rd round)', () => {
  it('refuses to change a Rejected target\'s email and leaves the account untouched', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin-rejected-guard@example.com' });
    const target = await createTestUser({
      role: 'USER',
      status: 'Rejected',
      email: 'rejected-target@example.com'
    });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { email: 'rejected-target-new@example.com' } },
      admin
    );

    expect(errors[0].message).toBe('This account is not editable.');
    expect(data).toBeNull();

    await target.reload();
    expect(target.email).toBe('rejected-target@example.com');
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('refuses to change a Disabled target\'s name and leaves the account untouched', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin-disabled-guard@example.com' });
    const target = await createTestUser({
      role: 'USER',
      status: 'Disabled',
      email: 'disabled-target@example.com',
      name: 'Original Name'
    });

    const { data, errors } = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(target.id), input: { name: 'Hacked Name' } },
      admin
    );

    expect(errors[0].message).toBe('This account is not editable.');
    expect(data).toBeNull();

    await target.reload();
    expect(target.name).toBe('Original Name');
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('updateUser — concurrent last-administrator guard (CR-02, gap-closure)', () => {
  it('prevents two concurrent email changes on different administrators from both succeeding and driving verified admins to zero (CR-02 concurrency, gap-closure)', async () => {
    const adminA = await createTestUser({ role: 'ADMIN', email: 'race-admin-a@example.com', emailVerified: true });
    const adminB = await createTestUser({ role: 'ADMIN', email: 'race-admin-b@example.com', emailVerified: true });

    const [responseA, responseB] = await Promise.all([
      graphql(UPDATE_USER_MUTATION, { id: String(adminA.id), input: { email: 'race-a-new@example.com' } }, adminA),
      graphql(UPDATE_USER_MUTATION, { id: String(adminB.id), input: { email: 'race-b-new@example.com' } }, adminB)
    ]);

    for (const response of [responseA, responseB]) {
      if (response.errors) {
        expect(response.errors[0].message).not.toMatch(/Sequelize|ER_LOCK|deadlock/i);
      }
    }

    const functioningAdminCount = await models.User.count({ where: { role: 'ADMIN', status: 'Active', emailVerified: true } });
    expect(functioningAdminCount).toBeGreaterThanOrEqual(1);
  });

  it('prevents a concurrent role demotion and a concurrent email change on two different administrators from together driving verified admins to zero (CR-02 mixed-race, gap-closure)', async () => {
    const adminA = await createTestUser({ role: 'ADMIN', email: 'mix-admin-a@example.com', emailVerified: true });
    const adminB = await createTestUser({ role: 'ADMIN', email: 'mix-admin-b@example.com', emailVerified: true });

    const [responseA, responseB] = await Promise.all([
      graphql(UPDATE_USER_MUTATION, { id: String(adminA.id), input: { role: 'USER' } }, adminA),
      graphql(UPDATE_USER_MUTATION, { id: String(adminB.id), input: { email: 'mix-b-new@example.com' } }, adminB)
    ]);

    for (const response of [responseA, responseB]) {
      if (response.errors) {
        expect(response.errors[0].message).not.toMatch(/Sequelize|ER_LOCK|deadlock/i);
      }
    }

    const functioningAdminCount = await models.User.count({ where: { role: 'ADMIN', status: 'Active', emailVerified: true } });
    expect(functioningAdminCount).toBeGreaterThanOrEqual(1);
  });
});

describe('updateUser — last-administrator guard counts only FUNCTIONING admins (Gap 2, 3rd round)', () => {
  it('blocks demoting the sole functioning admin after a Pending, verified user was promoted to ADMIN (Gap 2, sequential reproduction)', async () => {
    const soleAdmin = await createTestUser({
      role: 'ADMIN',
      emailVerified: true,
      status: 'Active',
      email: 'sole-admin-g2-demote@example.com'
    });
    const promotee = await createTestUser({
      role: 'USER',
      emailVerified: true,
      status: 'Pending',
      email: 'promotee-g2-demote@example.com'
    });

    const promoteResponse = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(promotee.id), input: { role: 'ADMIN' } },
      soleAdmin
    );
    expect(promoteResponse.errors).toBeUndefined();
    expect(promoteResponse.data.updateUser.role).toBe('ADMIN');

    const demoteResponse = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(soleAdmin.id), input: { role: 'USER' } },
      soleAdmin
    );

    expect(demoteResponse.errors?.[0]?.message).toBe('Cannot remove the last administrator.');
    expect(demoteResponse.data).toBeNull();

    await soleAdmin.reload();
    expect(soleAdmin.role).toBe('ADMIN');
    expect(
      await models.User.count({ where: { role: 'ADMIN', status: 'Active', emailVerified: true } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('blocks the sole functioning admin from changing their own email after a Pending, verified user was promoted to ADMIN (Gap 2, sequential reproduction)', async () => {
    const soleAdmin = await createTestUser({
      role: 'ADMIN',
      emailVerified: true,
      status: 'Active',
      email: 'sole-admin-g2-email@example.com'
    });
    const promotee = await createTestUser({
      role: 'USER',
      emailVerified: true,
      status: 'Pending',
      email: 'promotee-g2-email@example.com'
    });

    const promoteResponse = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(promotee.id), input: { role: 'ADMIN' } },
      soleAdmin
    );
    expect(promoteResponse.errors).toBeUndefined();
    expect(promoteResponse.data.updateUser.role).toBe('ADMIN');

    const emailChangeResponse = await graphql(
      UPDATE_USER_MUTATION,
      { id: String(soleAdmin.id), input: { email: 'sole-admin-g2-email-new@example.com' } },
      soleAdmin
    );

    expect(emailChangeResponse.errors?.[0]?.message).toBe(
      "Promote another administrator before changing the last administrator's email."
    );
    expect(emailChangeResponse.data).toBeNull();

    await soleAdmin.reload();
    expect(soleAdmin.email).toBe('sole-admin-g2-email@example.com');
    expect(
      await models.User.count({ where: { role: 'ADMIN', status: 'Active', emailVerified: true } })
    ).toBeGreaterThanOrEqual(1);
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
