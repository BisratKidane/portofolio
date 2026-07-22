import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const ADD_PARENT_MUTATION = `
  mutation AddParent($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!) {
    addParent(memberId: $memberId, role: $role, newMember: $newMember) {
      id
      firstname
      lastname
    }
  }
`;

beforeEach(resetTables);

describe('addParent (PERM-01/PERM-02, D-01/D-02/D-05)', () => {
  it('adds a new mother to the acting member-user themselves', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_PARENT_MUTATION,
      { memberId: String(self.id), role: 'MOTHER', newMember: { firstname: 'Grand', lastname: 'Mother', gender: 'Female' } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.addParent.firstname).toBe('Grand');
    expect(data.addParent.lastname).toBe('Mother');

    await self.reload();
    expect(self.motherId).toBe(Number(data.addParent.id));
  });

  it('adds a new father to the acting member-user themselves', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_PARENT_MUTATION,
      { memberId: String(self.id), role: 'FATHER', newMember: { firstname: 'Grand', lastname: 'Father', gender: 'Male' } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.addParent.firstname).toBe('Grand');
    expect(data.addParent.lastname).toBe('Father');

    await self.reload();
    expect(self.fatherId).toBe(Number(data.addParent.id));
  });

  it('adds a new parent to an in-scope relative (own child)', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const child = await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      motherId: self.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_PARENT_MUTATION,
      { memberId: String(child.id), role: 'FATHER', newMember: { firstname: 'Charles', lastname: 'Byron', gender: 'Male' } },
      actor
    );

    expect(errors).toBeUndefined();

    await child.reload();
    expect(child.fatherId).toBe(Number(data.addParent.id));
  });

  it('rejects a memberId outside the actor editable scope', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const grandparent = await models.FamilyMember.create({ firstname: 'Great', lastname: 'Grand', gender: 'Female' });
    const mother = await models.FamilyMember.create({
      firstname: 'Mother',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: grandparent.id
    });
    await self.update({ motherId: mother.id });

    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_PARENT_MUTATION,
      { memberId: String(grandparent.id), role: 'MOTHER', newMember: { firstname: 'Outside', lastname: 'Scope', gender: 'Female' } },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();

    const afterCount = await models.FamilyMember.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('rejects overwriting an already-filled slot for a non-admin (D-05 add-only)', async () => {
    const existingMother = await models.FamilyMember.create({ firstname: 'Existing', lastname: 'Mother', gender: 'Female' });
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: existingMother.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_PARENT_MUTATION,
      { memberId: String(self.id), role: 'MOTHER', newMember: { firstname: 'New', lastname: 'Mother', gender: 'Female' } },
      actor
    );

    expect(errors[0].message).toBe('This member already has a mother on record.');
    expect(data).toBeNull();

    await self.reload();
    expect(self.motherId).toBe(existingMother.id);
  });

  it('allows an ADMIN to addParent on any member and overwrite an already-filled slot', async () => {
    const existingMother = await models.FamilyMember.create({ firstname: 'Existing', lastname: 'Mother', gender: 'Female' });
    const target = await models.FamilyMember.create({
      firstname: 'Someone',
      lastname: 'Else',
      gender: 'Male',
      motherId: existingMother.id
    });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      ADD_PARENT_MUTATION,
      { memberId: String(target.id), role: 'MOTHER', newMember: { firstname: 'Replacement', lastname: 'Mother', gender: 'Female' } },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.addParent.firstname).toBe('Replacement');

    await target.reload();
    expect(target.motherId).toBe(Number(data.addParent.id));
  });
});
