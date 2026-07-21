import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const FAMILY_MEMBER_QUERY = `
  query FamilyMember($id: ID!) {
    familyMember(id: $id) {
      id
      fullname
    }
  }
`;

const FAMILY_MEMBERS_QUERY = `
  query FamilyMembers {
    familyMembers {
      id
      fullname
    }
  }
`;

beforeEach(resetTables);

describe('familyMember', () => {
  it('rejects a verified-but-unlinked USER calling directly (LOCKED adversarial test, SC5)', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const user = await createTestUser({ role: 'USER', familyMemberId: null });

    const { data, errors } = await graphql(FAMILY_MEMBER_QUERY, { id: member.id }, user);

    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
    expect(data.familyMember).toBeNull();
  });

  it('succeeds for a linked USER', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id });

    const { data, errors } = await graphql(FAMILY_MEMBER_QUERY, { id: member.id }, user);

    expect(errors).toBeUndefined();
    expect(data.familyMember.id).toBe(String(member.id));
    expect(data.familyMember.fullname).toBe('Ada Lovelace');
  });

  it('succeeds for an ADMIN with familyMemberId: null (carve-out, ACC-03)', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

    const { data, errors } = await graphql(FAMILY_MEMBER_QUERY, { id: member.id }, admin);

    expect(errors).toBeUndefined();
    expect(data.familyMember.id).toBe(String(member.id));
  });
});

describe('familyMembers (list)', () => {
  it('rejects a non-admin caller', async () => {
    const user = await createTestUser({ role: 'USER', familyMemberId: null });

    const { data, errors } = await graphql(FAMILY_MEMBERS_QUERY, {}, user);

    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();
  });

  it('returns all FamilyMember rows, ordered by lastname then firstname, for an ADMIN caller', async () => {
    await models.FamilyMember.create({ firstname: 'Zed', lastname: 'Adams', gender: 'Male' });
    await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Byron', gender: 'Female' });
    await models.FamilyMember.create({ firstname: 'Amy', lastname: 'Adams', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(FAMILY_MEMBERS_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.familyMembers.map((m) => m.fullname)).toEqual(['Amy Adams', 'Zed Adams', 'Ada Byron']);
  });
});
