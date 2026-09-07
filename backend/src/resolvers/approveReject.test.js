import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountRejectedEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const APPROVE = `mutation A($id: ID!) { approveUser(userId: $id) { id status } }`;
const REJECT = `mutation R($id: ID!, $reason: String) { rejectUser(userId: $id, reason: $reason) { id status } }`;

// Creates a Registered invitation with a Pending registered user awaiting review.
async function pendingRegistration(email = 'newbie@example.com', { emailVerified = true } = {}) {
  const inviter = await createTestUser({ role: 'ADMIN', email: `inviter-${email}` });
  const registrant = await createTestUser({ email, name: 'Newbie', status: 'Pending', emailVerified });
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

describe('approveUser', () => {
  it('activates the user, stamps the decision, emails them, and audits it', async () => {
    const { registrant, invitation } = await pendingRegistration();
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(APPROVE, { id: String(registrant.id) }, admin);
    expect(errors).toBeUndefined();
    expect(data.approveUser.status).toBe('Active');

    await registrant.reload();
    expect(registrant.status).toBe('Active');
    await invitation.reload();
    expect(invitation.approvedAt).toBeInstanceOf(Date);
    expect(invitation.approvedBy).toBe(admin.id);

    // D-04/D-05: the account row is ALWAYS stamped, even when an Invitation
    // also exists and is stamped -- both rows must carry identical values.
    expect(registrant.approvedAt).toBeInstanceOf(Date);
    expect(registrant.approvedBy).toBe(admin.id);
    expect(registrant.approvedAt.getTime()).toBe(invitation.approvedAt.getTime());
    expect(registrant.approvedBy).toBe(invitation.approvedBy);

    await vi.waitFor(() => expect(sendAccountApprovedEmail).toHaveBeenCalledTimes(1));
    expect(sendAccountApprovedEmail.mock.calls[0][0].to).toBe('newbie@example.com');

    // writeAuditLog is fire-and-forget, so poll the query itself -- waiting on
    // the mocked mailer does not cover the real DB insert.
    await vi.waitFor(async () => {
      const audits = await models.AuditLog.findAll({ where: { action: 'user.approved' } });
      expect(audits).toHaveLength(1);
    });
  });

  it('rejects a non-admin', async () => {
    const { registrant } = await pendingRegistration();
    const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
    const { errors } = await graphql(APPROVE, { id: String(registrant.id) }, member);
    expect(errors[0].message).toBe('Admin access is required.');
  });

  it('refuses to re-approve an already-decided account (D-07)', async () => {
    const account = await createTestUser({ role: 'USER', status: 'Active', emailVerified: true });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { errors } = await graphql(APPROVE, { id: String(account.id) }, admin);
    expect(errors[0].message).toBe('This account is not awaiting a decision.');

    await account.reload();
    expect(account.status).toBe('Active');
  });

  // D-08/D-09/F-01: distinct from D-07's "not awaiting a decision" guard --
  // this account IS Pending (would pass D-07), it is the emailVerified check
  // that must fire here.
  it('refuses to approve an unverified account (F-01: intentional new behavior, not a regression)', async () => {
    const { registrant } = await pendingRegistration('unverified-approve@example.com', { emailVerified: false });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { errors } = await graphql(APPROVE, { id: String(registrant.id) }, admin);
    expect(errors[0].message).toBe('This account has not verified its email address yet.');

    await registrant.reload();
    expect(registrant.status).toBe('Pending');
  });

  it('approves a Pending, verified account with no invitation row (Phase 32 precursor)', async () => {
    const account = await createTestUser({ status: 'Pending', emailVerified: true });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(APPROVE, { id: String(account.id) }, admin);
    expect(errors).toBeUndefined();
    expect(data.approveUser.status).toBe('Active');

    // Audit write is fire-and-forget (not awaited by the resolver); poll for
    // the row rather than assuming the mocked mailer's resolution timing
    // also covers the (separate, real-DB) audit write.
    let audits = [];
    await vi.waitFor(async () => {
      audits = await models.AuditLog.findAll({ where: { action: 'user.approved' } });
      expect(audits).toHaveLength(1);
    });
    expect(audits[0]).toMatchObject({ invitationId: null });

    // D-04: with no Invitation row to fall back on, the User row alone must
    // carry the decision -- this is the assertion the original plan set was
    // missing and the entire reason this phase exists.
    await account.reload();
    expect(account.status).toBe('Active');
    expect(account.approvedAt).toBeInstanceOf(Date);
    expect(account.approvedBy).toBe(admin.id);
  });
});

describe('rejectUser', () => {
  it('marks the user Rejected, records the reason, emails them, and audits it', async () => {
    const { registrant, invitation } = await pendingRegistration('reject-me@example.com');
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      REJECT,
      { id: String(registrant.id), reason: 'Not a family member.' },
      admin
    );
    expect(errors).toBeUndefined();
    expect(data.rejectUser.status).toBe('Rejected');

    await registrant.reload();
    expect(registrant.status).toBe('Rejected');
    expect(registrant.rejectionReason).toBe('Not a family member.');

    // D-04/D-05: the account row is ALWAYS stamped, even when an Invitation
    // also exists and is stamped -- both rows must carry identical values.
    await invitation.reload();
    expect(registrant.rejectedAt).toBeInstanceOf(Date);
    expect(registrant.rejectedAt.getTime()).toBe(invitation.rejectedAt.getTime());
    expect(registrant.rejectionReason).toBe(invitation.rejectionReason);

    await vi.waitFor(() => expect(sendAccountRejectedEmail).toHaveBeenCalledTimes(1));
    expect(sendAccountRejectedEmail.mock.calls[0][0].reason).toBe('Not a family member.');

    await vi.waitFor(async () => {
      const audits = await models.AuditLog.findAll({ where: { action: 'user.rejected' } });
      expect(audits).toHaveLength(1);
    });
  });

  // WR-03 (code review + phase verification). approveUser had a non-admin test
  // and rejectUser did not, so `requireAdmin` could be deleted from rejectUser
  // and the suite would stay green. Phase 14 of this project shipped four authz
  // gaps behind green tests for exactly this reason: the non-admin paths were
  // never exercised.
  it('rejects a non-admin', async () => {
    const { registrant } = await pendingRegistration();
    const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
    const { errors } = await graphql(REJECT, { id: String(registrant.id), reason: 'nope' }, member);
    expect(errors[0].message).toBe('Admin access is required.');

    // The account must be untouched -- refused, not partially applied.
    await registrant.reload();
    expect(registrant.status).toBe('Pending');
    expect(registrant.rejectedAt).toBeNull();
  });

  it('rejects an unauthenticated caller', async () => {
    const { registrant } = await pendingRegistration();
    const { errors } = await graphql(REJECT, { id: String(registrant.id), reason: 'nope' });
    expect(errors[0].message).toBe('You must be logged in to perform this action.');
  });

  it('blocks a rejected user from logging in', async () => {
    const { registrant } = await pendingRegistration('blocked@example.com');
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    await graphql(REJECT, { id: String(registrant.id), reason: null }, admin);

    const login = `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token } }`;
    const { errors } = await graphql(login, { e: 'blocked@example.com', p: 'Password123!' });
    expect(errors[0].message).toBe('Your registration was not approved.');
  });

  it('refuses to re-reject an already-decided account (D-07)', async () => {
    const account = await createTestUser({ role: 'USER', status: 'Rejected', emailVerified: true });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { errors } = await graphql(REJECT, { id: String(account.id), reason: 'Second look.' }, admin);
    expect(errors[0].message).toBe('This account is not awaiting a decision.');

    await account.reload();
    expect(account.status).toBe('Rejected');
  });

  it('refuses to reject an unverified account (F-01: intentional new behavior, not a regression)', async () => {
    const { registrant } = await pendingRegistration('unverified-reject@example.com', { emailVerified: false });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { errors } = await graphql(REJECT, { id: String(registrant.id), reason: null }, admin);
    expect(errors[0].message).toBe('This account has not verified its email address yet.');

    await registrant.reload();
    expect(registrant.status).toBe('Pending');
  });

  it('rejects a Pending, verified account with no invitation row (Phase 32 precursor)', async () => {
    const account = await createTestUser({ status: 'Pending', emailVerified: true });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(REJECT, { id: String(account.id), reason: 'No relation found.' }, admin);
    expect(errors).toBeUndefined();
    expect(data.rejectUser.status).toBe('Rejected');

    // Audit write is fire-and-forget (not awaited by the resolver); poll for
    // the row rather than assuming the mocked mailer's resolution timing
    // also covers the (separate, real-DB) audit write.
    let audits = [];
    await vi.waitFor(async () => {
      audits = await models.AuditLog.findAll({ where: { action: 'user.rejected' } });
      expect(audits).toHaveLength(1);
    });
    expect(audits[0]).toMatchObject({ invitationId: null });

    // D-04: with no Invitation row to fall back on, the User row alone must
    // carry the decision -- this is the assertion the original plan set was
    // missing and the entire reason this phase exists.
    await account.reload();
    expect(account.status).toBe('Rejected');
    expect(account.rejectedAt).toBeInstanceOf(Date);
    expect(account.rejectionReason).toBe('No relation found.');
  });
});

// CR-01 regression (code review, Phase 30). The D-07 guard originally ran as a
// read-then-write outside any transaction, with no row lock, so two overlapping
// requests both passed `assertDispositionable` before either wrote. That is not
// a hypothetical: two admins working the same queue, or one admin with the page
// open in two tabs, is enough. The frontend's busyId interlock is per-component
// and does not span tabs, sessions, or scripted clients.
describe('concurrent disposition (CR-01)', () => {
  it('lets exactly one of two concurrent approveUser calls win', async () => {
    const { registrant } = await pendingRegistration();
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const results = await Promise.all([
      graphql(APPROVE, { id: String(registrant.id) }, admin),
      graphql(APPROVE, { id: String(registrant.id) }, admin)
    ]);

    const succeeded = results.filter((r) => !r.errors);
    const failed = results.filter((r) => r.errors);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].errors[0].message).toBe('This account is not awaiting a decision.');

    await registrant.reload();
    expect(registrant.status).toBe('Active');

    // One decision means one audit row and one email -- not two of each.
    await vi.waitFor(async () => {
      const audits = await models.AuditLog.findAll({ where: { action: 'user.approved' } });
      expect(audits).toHaveLength(1);
    });
    expect(sendAccountApprovedEmail).toHaveBeenCalledTimes(1);
  });

  it('never leaves an account stamped both approved and rejected', async () => {
    const { registrant } = await pendingRegistration();
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const results = await Promise.all([
      graphql(APPROVE, { id: String(registrant.id) }, admin),
      graphql(REJECT, { id: String(registrant.id), reason: 'nope' }, admin)
    ]);

    expect(results.filter((r) => !r.errors)).toHaveLength(1);
    expect(results.filter((r) => r.errors)).toHaveLength(1);

    // The row must reflect exactly one decision. A row carrying both
    // approvedAt and rejectedAt is a state no single code path can produce,
    // and it is precisely the audit record this phase exists to make
    // trustworthy.
    await registrant.reload();
    const approved = registrant.approvedAt !== null;
    const rejected = registrant.rejectedAt !== null;
    expect(approved).not.toBe(rejected);
    expect(registrant.status).toBe(approved ? 'Active' : 'Rejected');

    // The applicant must not receive two contradictory emails.
    const emailsSent =
      sendAccountApprovedEmail.mock.calls.length + sendAccountRejectedEmail.mock.calls.length;
    expect(emailsSent).toBe(1);
  });

  it('lets exactly one of two concurrent rejectUser calls win', async () => {
    const { registrant } = await pendingRegistration();
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const results = await Promise.all([
      graphql(REJECT, { id: String(registrant.id), reason: 'first' }, admin),
      graphql(REJECT, { id: String(registrant.id), reason: 'second' }, admin)
    ]);

    expect(results.filter((r) => !r.errors)).toHaveLength(1);
    expect(results.filter((r) => r.errors)).toHaveLength(1);

    await registrant.reload();
    expect(registrant.status).toBe('Rejected');
    await vi.waitFor(async () => {
      const audits = await models.AuditLog.findAll({ where: { action: 'user.rejected' } });
      expect(audits).toHaveLength(1);
    });
  });
});
