import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id
      phone
    }
  }
`;

const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) {
      id
      firstname
      lastname
    }
  }
`;

const ADD_SPOUSE_MUTATION = `
  mutation AddSpouse($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSpouse(memberId: $memberId, newMember: $newMember) {
      id
      firstname
      lastname
    }
  }
`;

beforeEach(resetTables);

describe('Phase 28 admin-actions-on-detail adversarial rejection (PERM-03, SC-3)', () => {
  it('rejects editMember on a /detail-displayed person outside the actor editable scope', async () => {
    const headCandidate = await models.FamilyMember.create({
      firstname: 'Head',
      lastname: 'Candidate',
      gender: 'Male'
    });
    const actorSelf = await models.FamilyMember.create({
      firstname: 'Actor',
      lastname: 'Self',
      gender: 'Female'
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: actorSelf.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(headCandidate.id), fields: { phone: '555-9999' } },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();

    await headCandidate.reload();
    expect(headCandidate.phone).toBeNull();
  });

  it('rejects addChild targeting a /detail-displayed person outside the actor editable scope', async () => {
    const headCandidate = await models.FamilyMember.create({
      firstname: 'Head',
      lastname: 'Candidate',
      gender: 'Male'
    });
    const actorSelf = await models.FamilyMember.create({
      firstname: 'Actor',
      lastname: 'Self',
      gender: 'Female'
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: actorSelf.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(headCandidate.id),
        role: 'FATHER',
        newMember: { firstname: 'Outside', lastname: 'Scope', gender: 'Female' },
        otherParentId: null
      },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it('rejects addSpouse targeting a /detail-displayed person outside the actor editable scope', async () => {
    const headCandidate = await models.FamilyMember.create({
      firstname: 'Head',
      lastname: 'Candidate',
      gender: 'Male'
    });
    const actorSelf = await models.FamilyMember.create({
      firstname: 'Actor',
      lastname: 'Self',
      gender: 'Female'
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: actorSelf.id });

    const beforeMemberCount = await models.FamilyMember.count();
    const beforeSpouseCount = await models.Spouse.count();

    const { data, errors } = await graphql(
      ADD_SPOUSE_MUTATION,
      {
        memberId: String(headCandidate.id),
        newMember: { firstname: 'Outside', lastname: 'Scope', gender: 'Female' }
      },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeMemberCount);
    expect(await models.Spouse.count()).toBe(beforeSpouseCount);
  });
});
