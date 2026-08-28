import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendInvitationEmail } from '../services/mailer.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { hashInvitationToken } from '../utils/auth.js';

const CREATE_INVITATION = `
  mutation Create($input: CreateInvitationInput!) {
    createInvitation(input: $input) {
      registrationUrl
      invitation { id status invitedEmail relationshipToFamily }
    }
  }
`;

const MY_INVITATIONS = `query { myInvitations { id invitedEmail } }`;
const ALL_INVITATIONS = `query { invitations { id inviter { id name } } }`;

// The linked, Active, non-admin USER actor F-01 names -- the exact adversarial
// actor createInvitation/myInvitations must refuse under D-01/D-02, since an
// unlinked account was already refused by the old requireFamilyAccess guard
// and would prove nothing about the new requireAdmin guard.
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
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter@example.com', name: 'Ada' });

    const { data, errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'cousin@example.com', relationshipToFamily: 'cousin' } },
      inviter
    );

    expect(errors).toBeUndefined();
    expect(data.createInvitation.invitation.status).toBe('Pending');
    expect(data.createInvitation.invitation.relationshipToFamily).toBe('cousin');

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

  it('rejects an invitation with a blank email address', async () => {
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter3@example.com' });
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: '   ', invitedName: 'No Email' } },
      inviter
    );
    expect(errors[0].message).toBe('An invitation needs an email address.');
  });

  it('rejects an unauthenticated inviter', async () => {
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'x@example.com' } },
      null
    );
    expect(errors[0].message).toBe('You must be logged in to perform this action.');
  });

  it('rejects an authenticated but unlinked non-admin inviter', async () => {
    const unlinked = await createTestUser({ role: 'USER', email: 'unlinked@example.com', familyMemberId: null });
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'x@example.com' } },
      unlinked
    );
    expect(errors[0].message).toBe('Admin access is required.');
  });

  // F-01/SC-1: the adversarial actor INVITE-01 names -- linked, Active,
  // non-admin. Proves the guard is enforced server-side, not merely hidden in
  // the UI (D-01).
  it('refuses a linked, Active, non-admin member (F-01/SC-1)', async () => {
    const member = await activeMember();
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'x@example.com' } },
      member
    );
    expect(errors[0].message).toBe('Admin access is required.');
  });
});

describe('invitation queries', () => {
  it('myInvitations returns only the caller\'s invitations', async () => {
    const a = await createTestUser({ role: 'ADMIN', email: 'a@example.com' });
    const b = await createTestUser({ role: 'ADMIN', email: 'b@example.com' });
    await graphql(CREATE_INVITATION, { input: { invitedEmail: 'a-invite@example.com' } }, a);
    await graphql(CREATE_INVITATION, { input: { invitedEmail: 'b-invite@example.com' } }, b);

    const { data } = await graphql(MY_INVITATIONS, {}, a);
    expect(data.myInvitations).toHaveLength(1);
    expect(data.myInvitations[0].invitedEmail).toBe('a-invite@example.com');
  });

  // D-02: myInvitations is admin-only, independent of nav visibility -- defense
  // in depth given this codebase's history of authorization gaps surviving
  // green tests (Phases 14, 15, 30).
  it('denies myInvitations to a non-admin', async () => {
    const member = await activeMember();
    const { errors } = await graphql(MY_INVITATIONS, {}, member);
    expect(errors[0].message).toBe('Admin access is required.');
  });

  it('invitations (all) requires admin and resolves the inviter', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'm@example.com', name: 'Ada' });
    await graphql(CREATE_INVITATION, { input: { invitedEmail: 'z@example.com' } }, admin);

    const nonAdmin = await activeMember({ email: 'nonadmin@example.com' });
    const denied = await graphql(ALL_INVITATIONS, {}, nonAdmin);
    expect(denied.errors[0].message).toBe('Admin access is required.');

    const { data, errors } = await graphql(ALL_INVITATIONS, {}, admin);
    expect(errors).toBeUndefined();
    expect(data.invitations).toHaveLength(1);
    expect(data.invitations[0].inviter.name).toBe('Ada');
  });
});
