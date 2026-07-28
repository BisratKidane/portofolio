import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { getUserFromRequest, signToken } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';

const LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { token }
  }
`;

beforeEach(resetTables);

describe('login account-status gating', () => {
  it('lets an Active, verified user log in', async () => {
    await createTestUser({ email: 'active@example.com', status: 'Active', emailVerified: true });
    const { data, errors } = await graphql(LOGIN, { email: 'active@example.com', password: 'Password123!' });
    expect(errors).toBeUndefined();
    expect(data.login.token).toBeTruthy();
  });

  it('rejects a Pending user with an awaiting-approval message', async () => {
    await createTestUser({ email: 'pending@example.com', status: 'Pending', emailVerified: true });
    const { errors } = await graphql(LOGIN, { email: 'pending@example.com', password: 'Password123!' });
    expect(errors[0].message).toBe('Your account is awaiting administrator approval.');
  });

  it('rejects a Rejected user', async () => {
    await createTestUser({ email: 'rejected@example.com', status: 'Rejected', emailVerified: true });
    const { errors } = await graphql(LOGIN, { email: 'rejected@example.com', password: 'Password123!' });
    expect(errors[0].message).toBe('Your registration was not approved.');
  });

  it('rejects a Disabled user', async () => {
    await createTestUser({ email: 'disabled@example.com', status: 'Disabled', emailVerified: true });
    const { errors } = await graphql(LOGIN, { email: 'disabled@example.com', password: 'Password123!' });
    expect(errors[0].message).toBe('Your account has been disabled.');
  });

  it('still gates on email verification before status', async () => {
    await createTestUser({ email: 'unverified@example.com', status: 'Pending', emailVerified: false });
    const { errors } = await graphql(LOGIN, { email: 'unverified@example.com', password: 'Password123!' });
    expect(errors[0].message).toBe('Please verify your email before signing in.');
  });
});

describe('getUserFromRequest account-status gating', () => {
  it('returns null for a non-Active user even with an otherwise-valid token', async () => {
    const user = await createTestUser({ email: 'pending2@example.com', status: 'Pending', emailVerified: true });
    const req = { headers: { authorization: `Bearer ${signToken(user)}` } };
    expect(await getUserFromRequest(req, models)).toBeNull();
  });

  it('resolves an Active user from a valid token', async () => {
    const user = await createTestUser({ email: 'active2@example.com', status: 'Active', emailVerified: true });
    const req = { headers: { authorization: `Bearer ${signToken(user)}` } };
    const resolved = await getUserFromRequest(req, models);
    expect(resolved?.id).toBe(user.id);
  });
});

describe('writeAuditLog', () => {
  it('records an audit entry with actor + metadata', async () => {
    const actor = await createTestUser({ role: 'ADMIN', email: 'auditor@example.com' });
    const row = await writeAuditLog(models, {
      action: 'invitation.created',
      actorUserId: actor.id,
      metadata: { invitedEmail: 'x@example.com' }
    });
    // Assert on the in-memory create result — the JSON column round-trips as a
    // string on MariaDB but a parsed object on MySQL 8, so re-fetching would be
    // environment-dependent.
    expect(row.metadata).toEqual({ invitedEmail: 'x@example.com' });

    const rows = await models.AuditLog.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('invitation.created');
    expect(rows[0].actorUserId).toBe(actor.id);
  });
});
