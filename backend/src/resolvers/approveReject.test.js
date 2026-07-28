import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountRejectedEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const APPROVE = `mutation A($id: ID!) { approveInvitation(invitationId: $id) { id status } }`;
const REJECT = `mutation R($id: ID!, $reason: String) { rejectInvitation(invitationId: $id, reason: $reason) { id status rejectionReason } }`;
const PENDING = `query { pendingRegistrations { id invitedEmail registeredUser { id name } } }`;

// Creates a Registered invitation with a Pending registered user awaiting review.
async function pendingRegistration(email = 'newbie@example.com') {
  const inviter = await createTestUser({ role: 'ADMIN', email: `inviter-${email}` });
  const registrant = await createTestUser({ email, name: 'Newbie', status: 'Pending', emailVerified: true });
  const invitation = await models.Invitation.create({
    tokenHash: `hash-${email}`,
    inviterId: inviter.id,
    invitedEmail: email,
    relationshipToFamily: 'cousin',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'Registered',
    registeredAt: new Date(),
    registeredUserId: registrant.id
  });
  return { inviter, registrant, invitation };
}

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('approveInvitation', () => {
  it('activates the user, stamps the decision, emails them, and audits it', async () => {
    const { registrant, invitation } = await pendingRegistration();
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(APPROVE, { id: String(invitation.id) }, admin);
    expect(errors).toBeUndefined();
    expect(data.approveInvitation.status).toBe('Approved');

    await registrant.reload();
    expect(registrant.status).toBe('Active');
    await invitation.reload();
    expect(invitation.approvedAt).toBeInstanceOf(Date);
    expect(invitation.approvedBy).toBe(admin.id);

    await vi.waitFor(() => expect(sendAccountApprovedEmail).toHaveBeenCalledTimes(1));
    expect(sendAccountApprovedEmail.mock.calls[0][0].to).toBe('newbie@example.com');

    const audits = await models.AuditLog.findAll({ where: { action: 'invitation.approved' } });
    expect(audits).toHaveLength(1);
  });

  it('rejects a non-admin', async () => {
    const { invitation } = await pendingRegistration();
    const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
    const { errors } = await graphql(APPROVE, { id: String(invitation.id) }, member);
    expect(errors[0].message).toBe('Admin access is required.');
  });

  it('refuses to approve an invitation not awaiting approval', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter2@example.com' });
    const inv = await models.Invitation.create({
      tokenHash: 'hash-pending',
      inviterId: inviter.id,
      invitedEmail: 'notyet@example.com',
      expiresAt: new Date(Date.now() + 1e6),
      status: 'Pending'
    });
    const { errors } = await graphql(APPROVE, { id: String(inv.id) }, admin);
    expect(errors[0].message).toBe('This registration is not awaiting approval.');
  });
});

describe('rejectInvitation', () => {
  it('marks the user Rejected, records the reason, emails them, and audits it', async () => {
    const { registrant, invitation } = await pendingRegistration('reject-me@example.com');
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      REJECT,
      { id: String(invitation.id), reason: 'Not a family member.' },
      admin
    );
    expect(errors).toBeUndefined();
    expect(data.rejectInvitation.status).toBe('Rejected');
    expect(data.rejectInvitation.rejectionReason).toBe('Not a family member.');

    await registrant.reload();
    expect(registrant.status).toBe('Rejected');

    await vi.waitFor(() => expect(sendAccountRejectedEmail).toHaveBeenCalledTimes(1));
    expect(sendAccountRejectedEmail.mock.calls[0][0].reason).toBe('Not a family member.');

    const audits = await models.AuditLog.findAll({ where: { action: 'invitation.rejected' } });
    expect(audits).toHaveLength(1);
  });

  it('blocks a rejected user from logging in', async () => {
    const { invitation } = await pendingRegistration('blocked@example.com');
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    await graphql(REJECT, { id: String(invitation.id), reason: null }, admin);

    const login = `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token } }`;
    const { errors } = await graphql(login, { e: 'blocked@example.com', p: 'Password123!' });
    expect(errors[0].message).toBe('Your registration was not approved.');
  });
});

describe('pendingRegistrations query', () => {
  it('returns only Registered invitations to an admin, with the registered user', async () => {
    await pendingRegistration('p1@example.com');
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(PENDING, {}, admin);
    expect(errors).toBeUndefined();
    expect(data.pendingRegistrations).toHaveLength(1);
    expect(data.pendingRegistrations[0].registeredUser.name).toBe('Newbie');
  });

  it('denies a non-admin', async () => {
    const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
    const { errors } = await graphql(PENDING, {}, member);
    expect(errors[0].message).toBe('Admin access is required.');
  });
});
