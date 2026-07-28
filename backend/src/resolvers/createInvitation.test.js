import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../services/whatsapp.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendWhatsappMessage: vi.fn().mockResolvedValue({ sent: false, reason: 'not_configured' })
}));

import { sendInvitationEmail } from '../services/mailer.js';
import { sendWhatsappMessage } from '../services/whatsapp.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { hashInvitationToken } from '../utils/auth.js';

const CREATE_INVITATION = `
  mutation Create($input: CreateInvitationInput!) {
    createInvitation(input: $input) {
      registrationUrl
      whatsappUrl
      invitation { id status invitationMethod invitedEmail invitedPhone relationshipToFamily }
    }
  }
`;

const MY_INVITATIONS = `query { myInvitations { id invitedEmail } }`;
const ALL_INVITATIONS = `query { invitations { id inviter { id name } } }`;

async function activeMember(overrides = {}) {
  const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  return createTestUser({ role: 'USER', familyMemberId: member.id, ...overrides });
}

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('createInvitation', () => {
  it('creates an email invitation, emails the link, stores only the token hash, and audits it', async () => {
    const inviter = await activeMember({ email: 'inviter@example.com', name: 'Ada' });

    const { data, errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'cousin@example.com', invitationMethod: 'email', relationshipToFamily: 'cousin' } },
      inviter
    );

    expect(errors).toBeUndefined();
    expect(data.createInvitation.invitation.status).toBe('Pending');
    expect(data.createInvitation.invitation.relationshipToFamily).toBe('cousin');
    expect(data.createInvitation.whatsappUrl).toBeNull();

    const url = data.createInvitation.registrationUrl;
    expect(url).toContain('/register?token=');
    const token = new URL(url).searchParams.get('token');
    expect(token).toBeTruthy();

    const row = await models.Invitation.findByPk(data.createInvitation.invitation.id);
    expect(row.tokenHash).toBe(hashInvitationToken(token));
    expect(row.tokenHash).not.toBe(token); // raw token never stored
    expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await vi.waitFor(() => expect(sendInvitationEmail).toHaveBeenCalledTimes(1));
    expect(sendInvitationEmail.mock.calls[0][0].to).toBe('cousin@example.com');

    const audits = await models.AuditLog.findAll({ where: { action: 'invitation.created' } });
    expect(audits).toHaveLength(1);
  });

  it('creates a WhatsApp invitation with a shareable wa.me link and no email', async () => {
    const inviter = await activeMember({ email: 'inviter2@example.com' });

    const { data, errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedPhone: '+1 (555) 123-4567', invitationMethod: 'whatsapp' } },
      inviter
    );

    expect(errors).toBeUndefined();
    expect(data.createInvitation.whatsappUrl).toContain('https://wa.me/15551234567?text=');
    expect(sendInvitationEmail).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(sendWhatsappMessage).toHaveBeenCalledTimes(1));
  });

  it('rejects an email invitation with no email address', async () => {
    const inviter = await activeMember({ email: 'inviter3@example.com' });
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitationMethod: 'email', invitedName: 'No Email' } },
      inviter
    );
    expect(errors[0].message).toBe('An email invitation needs an email address.');
  });

  it('rejects an unauthenticated inviter', async () => {
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'x@example.com', invitationMethod: 'email' } },
      null
    );
    expect(errors[0].message).toBe('You must be logged in to perform this action.');
  });

  it('rejects an authenticated but unlinked non-admin inviter', async () => {
    const unlinked = await createTestUser({ role: 'USER', email: 'unlinked@example.com', familyMemberId: null });
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'x@example.com', invitationMethod: 'email' } },
      unlinked
    );
    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
  });
});

describe('invitation queries', () => {
  it('myInvitations returns only the caller\'s invitations', async () => {
    const a = await activeMember({ email: 'a@example.com' });
    const b = await activeMember({ email: 'b@example.com' });
    await graphql(CREATE_INVITATION, { input: { invitedEmail: 'a-invite@example.com', invitationMethod: 'email' } }, a);
    await graphql(CREATE_INVITATION, { input: { invitedEmail: 'b-invite@example.com', invitationMethod: 'email' } }, b);

    const { data } = await graphql(MY_INVITATIONS, {}, a);
    expect(data.myInvitations).toHaveLength(1);
    expect(data.myInvitations[0].invitedEmail).toBe('a-invite@example.com');
  });

  it('invitations (all) requires admin and resolves the inviter', async () => {
    const member = await activeMember({ email: 'm@example.com', name: 'Ada' });
    await graphql(CREATE_INVITATION, { input: { invitedEmail: 'z@example.com', invitationMethod: 'email' } }, member);

    const denied = await graphql(ALL_INVITATIONS, {}, member);
    expect(denied.errors[0].message).toBe('Admin access is required.');

    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const { data, errors } = await graphql(ALL_INVITATIONS, {}, admin);
    expect(errors).toBeUndefined();
    expect(data.invitations).toHaveLength(1);
    expect(data.invitations[0].inviter.name).toBe('Ada');
  });
});
