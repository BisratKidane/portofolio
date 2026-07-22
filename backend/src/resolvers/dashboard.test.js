import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const DASHBOARD_QUERY = `
  query Dashboard {
    dashboard {
      message
      user { id role }
      users { id }
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
      role
    }
  }
`;

beforeEach(resetTables);

describe('dashboard', () => {
  it('returns the admin dashboard with a populated users list for an ADMIN user', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(DASHBOARD_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.dashboard.message).toBe('Welcome to the admin dashboard.');
    expect(data.dashboard.users).not.toBeNull();
    expect(Array.isArray(data.dashboard.users)).toBe(true);
  });

  it('returns the user dashboard with a null users list for a USER', async () => {
    // requireFamilyAccess (WR-04) rejects an unlinked non-admin, so this
    // fixture must be a linked member, mirroring familyMember.resolver.test.js.
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id });

    const { data, errors } = await graphql(DASHBOARD_QUERY, {}, user);

    expect(errors).toBeUndefined();
    expect(data.dashboard.message).toBe('Welcome to your dashboard.');
    expect(data.dashboard.users).toBeNull();
  });

  it('rejects an unauthenticated request with the exact API-contract message', async () => {
    const { data, errors } = await graphql(DASHBOARD_QUERY, {}, null);

    expect(errors[0].message).toBe('You must be logged in to perform this action.');
    expect(data).toBeNull();
  });

  it('rejects a verified-but-unlinked USER (WR-04)', async () => {
    const user = await createTestUser({ role: 'USER', familyMemberId: null });

    const { data, errors } = await graphql(DASHBOARD_QUERY, {}, user);

    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
    expect(data).toBeNull();
  });
});

describe('me', () => {
  it('returns the authenticated user\'s fields', async () => {
    const user = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(ME_QUERY, {}, user);

    expect(errors).toBeUndefined();
    expect(data.me.id).toBe(String(user.id));
    expect(data.me.role).toBe('ADMIN');
  });

  it('returns null without throwing when unauthenticated', async () => {
    const { data, errors } = await graphql(ME_QUERY, {}, null);

    expect(errors).toBeUndefined();
    expect(data.me).toBeNull();
  });
});
