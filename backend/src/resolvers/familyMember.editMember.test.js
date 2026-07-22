import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { familyMemberTypeDefs } from '../schemas/familyMember.schema.js';

const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id
      phone
    }
  }
`;

beforeEach(resetTables);

describe('editMember (MEM-04, PERM-02, D-05 structural, D-06 field-lock)', () => {
  it('allows a linked member-user to edit a plain field on themselves', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(self.id), fields: { phone: '555-1000' } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.phone).toBe('555-1000');

    await self.reload();
    expect(self.phone).toBe('555-1000');
  });

  it('allows a linked member-user to edit a plain field on an in-scope relative with no linked user account', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const child = await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      motherId: self.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(child.id), fields: { phone: '555-2000' } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.phone).toBe('555-2000');

    await child.reload();
    expect(child.phone).toBe('555-2000');
  });

  it('(D-06 field-lock) rejects an edit to an in-scope relative who has their own linked user account', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const child = await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      motherId: self.id
    });
    await createTestUser({
      role: 'USER',
      familyMemberId: child.id,
      email: `child-${Date.now()}@example.com`
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(child.id), fields: { phone: '555-3000' } },
      actor
    );

    expect(errors[0].message).toBe('This member manages their own profile and cannot be edited by others.');
    expect(data).toBeNull();

    await child.reload();
    expect(child.phone).toBeNull();
  });

  it('(D-06 self-exception) allows the linked relative to edit their own record', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const child = await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      motherId: self.id
    });
    const childActor = await createTestUser({
      role: 'USER',
      familyMemberId: child.id,
      email: `child-${Date.now()}@example.com`
    });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(child.id), fields: { phone: '555-4000' } },
      childActor
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.phone).toBe('555-4000');
  });

  it('rejects an id outside the actor editable scope', async () => {
    const grandparent = await models.FamilyMember.create({ firstname: 'Great', lastname: 'Grand', gender: 'Female' });
    const mother = await models.FamilyMember.create({
      firstname: 'Mother',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: grandparent.id
    });
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: mother.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(grandparent.id), fields: { phone: '555-5000' } },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();
  });

  it('(D-05, structural) EditFamilyMemberInput has no edge-mutating field', () => {
    const inputMatch = familyMemberTypeDefs.match(/input EditFamilyMemberInput \{([^}]*)\}/);
    expect(inputMatch).not.toBeNull();
    const fieldsBlock = inputMatch[1];
    expect(fieldsBlock).not.toMatch(/motherId|fatherId|spouse/i);
  });

  it('allows an ADMIN to edit any member fields, including one with a linked user account belonging to someone else', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    await createTestUser({
      role: 'USER',
      familyMemberId: self.id,
      email: `self-${Date.now()}@example.com`
    });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(self.id), fields: { phone: '555-6000' } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.phone).toBe('555-6000');
  });
});
