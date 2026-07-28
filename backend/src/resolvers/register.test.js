import { describe, it, expect, beforeEach, vi } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail, sendPendingRegistrationEmail } from '../services/mailer.js';
import { createInvitationToken, hashInvitationToken, hashVerificationToken } from '../utils/auth.js';

const REGISTER_MUTATION = `
  mutation Register($token: String!, $name: String!, $password: String!) {
    register(token: $token, name: $name, password: $password) { message }
  }
`;

// Creates a Pending invitation and returns its raw (unhashed) token.
async function makeInvitation(overrides = {}) {
  const inviter = overrides.inviter || (await createTestUser({ role: 'ADMIN', email: `inviter-${Date.now()}@example.com` }));
  const rawToken = createInvitationToken();
  const invitation = await models.Invitation.create({
    tokenHash: hashInvitationToken(rawToken),
    inviterId: inviter.id,
    invitedEmail: overrides.invitedEmail || 'invitee@example.com',
    relationshipToFamily: overrides.relationshipToFamily || 'cousin',
    invitationNote: overrides.invitationNote || null,
    expiresAt: overrides.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: overrides.status || 'Pending'
  });
  return { rawToken, invitation, inviter };
}

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('register (invitation-only)', () => {
  it('creates a Pending, unverified USER from a valid invitation and consumes it', async () => {
    const { rawToken, invitation } = await makeInvitation({ invitedEmail: 'ada@example.com' });

    const { data, errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Ada', password: 'Password123!' });

    expect(errors).toBeUndefined();
    expect(typeof data.register.message).toBe('string');

    const user = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(user.role).toBe('USER');
    expect(user.status).toBe('Pending');
    expect(user.emailVerified).toBe(false);
    expect(user.emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);

    await invitation.reload();
    expect(invitation.status).toBe('Registered');
    expect(invitation.registeredUserId).toBe(user.id);
    expect(invitation.registeredAt).toBeInstanceOf(Date);
  });

  it('emails the verification link and notifies admins', async () => {
    await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const { rawToken } = await makeInvitation({ invitedEmail: 'ada@example.com' });

    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Ada', password: 'Password123!' });
    expect(errors).toBeUndefined();

    await vi.waitFor(() => {
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(sendPendingRegistrationEmail).toHaveBeenCalled();
    });
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('ada@example.com');

    const user = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(hashVerificationToken(sendVerificationEmail.mock.calls[0][0].token)).toBe(user.emailVerificationToken);

    const audits = await models.AuditLog.findAll({ where: { action: 'invitation.registered' } });
    expect(audits).toHaveLength(1);
  });

  it('rejects an invalid invitation token', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, { token: 'not-a-real-token', name: 'X', password: 'Password123!' });
    expect(errors[0].message).toBe('This invitation link is invalid.');
    expect(data).toBeNull();
  });

  it('rejects an expired invitation and marks it Expired', async () => {
    const { rawToken, invitation } = await makeInvitation({ expiresAt: new Date(Date.now() - 1000) });
    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'X', password: 'Password123!' });
    expect(errors[0].message).toBe('This invitation link has expired.');
    await invitation.reload();
    expect(invitation.status).toBe('Expired');
  });

  it('rejects reusing an already-registered invitation (one-time use)', async () => {
    const { rawToken } = await makeInvitation({ invitedEmail: 'once@example.com' });
    const first = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'First', password: 'Password123!' });
    expect(first.errors).toBeUndefined();

    const second = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Second', password: 'Password123!' });
    expect(second.errors[0].message).toBe('This invitation has already been used.');
  });

  it('lets only one of two concurrent registrations on the same token win', async () => {
    const { rawToken } = await makeInvitation({ invitedEmail: 'race@example.com' });
    const [a, b] = await Promise.all([
      graphql(REGISTER_MUTATION, { token: rawToken, name: 'A', password: 'Password123!' }),
      graphql(REGISTER_MUTATION, { token: rawToken, name: 'B', password: 'Password123!' })
    ]);
    const successes = [a, b].filter((r) => !r.errors);
    expect(successes).toHaveLength(1);
    expect(await models.User.count({ where: { email: 'race@example.com' } })).toBe(1);
  });

  it('rejects a weak password before consuming the invitation', async () => {
    const { rawToken, invitation } = await makeInvitation();
    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Weak', password: 'short' });
    expect(errors[0].message).toBe('Password must be at least 8 characters.');
    await invitation.reload();
    expect(invitation.status).toBe('Pending'); // not consumed
  });

  it('rejects registration when the invited email already has an account', async () => {
    await createTestUser({ email: 'taken@example.com' });
    const { rawToken } = await makeInvitation({ invitedEmail: 'taken@example.com' });
    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Dup', password: 'Password123!' });
    expect(errors[0].message).toBe('An account with this email already exists.');
  });
});
