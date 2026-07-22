import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const LINK_USER_TO_MEMBER_MUTATION = `
  mutation LinkUserToMember($userId: ID!, $memberId: ID, $newMember: NewFamilyMemberInput) {
    linkUserToMember(userId: $userId, memberId: $memberId, newMember: $newMember) {
      id
      familyMemberId
    }
  }
`;

beforeEach(resetTables);
afterEach(() => vi.restoreAllMocks());

describe('linkUserToMember', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await createTestUser({ role: 'USER' });
    const target = await createTestUser({ role: 'USER' });
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: String(target.id), memberId: String(member.id) },
      caller
    );

    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();
  });

  it('links an existing user to an existing member', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: String(target.id), memberId: String(member.id) },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.linkUserToMember.familyMemberId).toBe(String(member.id));
  });

  it('creates a bare FamilyMember and links it in one step (D-04/D-05)', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      {
        userId: String(target.id),
        newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' }
      },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.linkUserToMember.familyMemberId).not.toBeNull();

    const created = await models.FamilyMember.findByPk(data.linkUserToMember.familyMemberId);
    expect(created.firstname).toBe('Grace');
    expect(created.lastname).toBe('Hopper');
    expect(created.motherId).toBeNull();
    expect(created.fatherId).toBeNull();
  });

  it('throws when neither memberId nor newMember is supplied', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: String(target.id) },
      admin
    );

    expect(errors[0].message).toBe('Provide exactly one of memberId or newMember.');
    expect(data).toBeNull();
  });

  it('throws when both memberId and newMember are supplied', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      {
        userId: String(target.id),
        memberId: String(member.id),
        newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' }
      },
      admin
    );

    expect(errors[0].message).toBe('Provide exactly one of memberId or newMember.');
    expect(data).toBeNull();
  });

  it('throws "User not found." when userId does not resolve to an existing User', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: '999999', memberId: String(member.id) },
      admin
    );

    expect(errors[0].message).toBe('User not found.');
    expect(data).toBeNull();
  });

  it('throws "Family member not found." when memberId does not resolve to an existing FamilyMember', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: String(target.id), memberId: '999999' },
      admin
    );

    expect(errors[0].message).toBe('Family member not found.');
    expect(data).toBeNull();
  });

  it('throws a friendly error when memberId is already linked to a different user (D-07)', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    await createTestUser({ role: 'USER', familyMemberId: member.id });
    const secondTarget = await createTestUser({ role: 'USER' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: String(secondTarget.id), memberId: String(member.id) },
      admin
    );

    expect(errors[0].message).toBe('This family member is already linked to another account.');
    expect(data).toBeNull();
  });

  it('allows an ADMIN to self-link via newMember (ACC-03)', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      {
        userId: String(admin.id),
        newMember: { firstname: 'Admin', lastname: 'Self', gender: 'Other' }
      },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.linkUserToMember.id).toBe(String(admin.id));
    expect(data.linkUserToMember.familyMemberId).not.toBeNull();
  });

  it('sanitizes blank optional fields to null before creating the member (CR-01)', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      {
        userId: String(target.id),
        newMember: {
          firstname: 'Grace',
          lastname: 'Hopper',
          gender: 'Female',
          mothersname: '  ',
          email: '',
          birthdate: '',
          deathdate: '',
          phone: '',
          address: ''
        }
      },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.linkUserToMember.familyMemberId).not.toBeNull();

    const created = await models.FamilyMember.findByPk(data.linkUserToMember.familyMemberId);
    expect(created.firstname).toBe('Grace');
    expect(created.lastname).toBe('Hopper');
    expect(created.mothersname).toBeNull();
    expect(created.email).toBeNull();
    expect(created.birthdate).toBeNull();
    expect(created.deathdate).toBeNull();
    expect(created.phone).toBeNull();
    expect(created.address).toBeNull();
  });

  it('rolls back the created FamilyMember if linking the user afterwards fails (WR-01)', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const target = await createTestUser({ role: 'USER' });

    const beforeCount = await models.FamilyMember.count();

    const updateSpy = vi
      .spyOn(models.User.prototype, 'update')
      .mockRejectedValueOnce(new Error('simulated update failure'));

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      {
        userId: String(target.id),
        newMember: { firstname: 'Ada', lastname: 'Byron', gender: 'Female' }
      },
      admin
    );

    updateSpy.mockRestore();

    expect(data).toBeNull();
    expect(errors[0].message).toBe('simulated update failure');

    const afterCount = await models.FamilyMember.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('rejects linking a user that is already linked to a different member (WR-03)', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const memberA = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const memberB = await models.FamilyMember.create({ firstname: 'Grace', lastname: 'Hopper', gender: 'Female' });
    const target = await createTestUser({ role: 'USER', familyMemberId: memberA.id });

    const { data, errors } = await graphql(
      LINK_USER_TO_MEMBER_MUTATION,
      { userId: String(target.id), memberId: String(memberB.id) },
      admin
    );

    expect(errors[0].message).toBe('This account is already linked to a family member.');
    expect(data).toBeNull();

    await target.reload();
    expect(target.familyMemberId).toBe(memberA.id);
  });
});
