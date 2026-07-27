import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const ADD_PARENT = `
  mutation AddParent($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!) {
    addParent(memberId: $memberId, role: $role, newMember: $newMember) {
      id
      isAlive
    }
  }
`;

const EDIT_MEMBER = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id
      isAlive
    }
  }
`;

const PROVENANCE_QUERY = `
  query Member($id: ID!) {
    familyMember(id: $id) {
      id
      isAlive
      createdBy { id name }
      updatedBy { id name }
      createdAt
      updatedAt
    }
  }
`;

beforeEach(resetTables);

describe('family member provenance + isAlive', () => {
  it('defaults isAlive to true on a newly created member', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      ADD_PARENT,
      { memberId: String(base.id), role: 'MOTHER', newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.addParent.isAlive).toBe(true);
  });

  it('accepts isAlive=false on NewFamilyMemberInput', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      ADD_PARENT,
      {
        memberId: String(base.id),
        role: 'FATHER',
        newMember: { firstname: 'Charles', lastname: 'Babbage', gender: 'Male', isAlive: false }
      },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.addParent.isAlive).toBe(false);
  });

  it('stamps createdByUserId with the acting user on create', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data } = await graphql(
      ADD_PARENT,
      { memberId: String(base.id), role: 'MOTHER', newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' } },
      admin
    );

    const created = await models.FamilyMember.findByPk(data.addParent.id);
    expect(created.createdByUserId).toBe(admin.id);
    expect(created.updatedByUserId).toBeNull();
  });

  it('stamps updatedByUserId on editMember (and can toggle isAlive)', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(
      EDIT_MEMBER,
      { id: String(member.id), fields: { isAlive: false } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.isAlive).toBe(false);

    await member.reload();
    expect(member.isAlive).toBe(false);
    expect(member.updatedByUserId).toBe(admin.id);
  });

  it('exposes createdBy/updatedBy to an ADMIN viewer', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com', name: 'Root Admin' });

    const { data: addData } = await graphql(
      ADD_PARENT,
      { memberId: String(base.id), role: 'MOTHER', newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' } },
      admin
    );

    const { data, errors } = await graphql(PROVENANCE_QUERY, { id: addData.addParent.id }, admin);

    expect(errors).toBeUndefined();
    expect(data.familyMember.createdBy).toEqual({ id: String(admin.id), name: 'Root Admin' });
    expect(data.familyMember.createdAt).toBeTruthy();
  });

  it('hides createdBy/updatedBy from a non-admin viewer', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const { data: addData } = await graphql(
      ADD_PARENT,
      { memberId: String(base.id), role: 'MOTHER', newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' } },
      admin
    );

    // A linked, verified non-admin can read the tree but must not see provenance.
    const viewer = await createTestUser({ role: 'USER', email: 'viewer@example.com', familyMemberId: base.id });

    const { data, errors } = await graphql(PROVENANCE_QUERY, { id: addData.addParent.id }, viewer);

    expect(errors).toBeUndefined();
    expect(data.familyMember.createdBy).toBeNull();
    expect(data.familyMember.updatedBy).toBeNull();
  });
});
