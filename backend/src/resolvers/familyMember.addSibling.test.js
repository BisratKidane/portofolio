import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const ADD_SIBLING_MUTATION = `
  mutation AddSibling($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSibling(memberId: $memberId, newMember: $newMember) {
      id
      firstname
      lastname
    }
  }
`;

beforeEach(resetTables);

describe('addSibling (D-03/D-04, REL-04, PERM-01/PERM-02)', () => {
  it('adds a new full sibling inheriting both parent FKs', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Mother', lastname: 'Lovelace', gender: 'Female' });
    const father = await models.FamilyMember.create({ firstname: 'Father', lastname: 'Lovelace', gender: 'Male' });
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: mother.id,
      fatherId: father.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(self.id), newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' } },
      actor
    );

    expect(errors).toBeUndefined();

    const sibling = await models.FamilyMember.findByPk(data.addSibling.id);
    expect(sibling.motherId).toBe(mother.id);
    expect(sibling.fatherId).toBe(father.id);
  });

  it('adds a new half sibling inheriting only the recorded parent FK (never fabricating the other)', async () => {
    const father = await models.FamilyMember.create({ firstname: 'Father', lastname: 'Lovelace', gender: 'Male' });
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      fatherId: father.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(self.id), newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' } },
      actor
    );

    expect(errors).toBeUndefined();

    const sibling = await models.FamilyMember.findByPk(data.addSibling.id);
    expect(sibling.fatherId).toBe(father.id);
    expect(sibling.motherId).toBeNull();
  });

  it('rejects (D-04) adding a sibling to a member with no parent recorded', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(self.id), newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' } },
      actor
    );

    expect(errors[0].message).toBe('Add a parent first — siblings are derived from a shared parent.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it('rejects a memberId outside the actor editable scope', async () => {
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
      ADD_SIBLING_MUTATION,
      { memberId: String(grandparent.id), newMember: { firstname: 'Outside', lastname: 'Scope', gender: 'Female' } },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();
  });

  it('rejects (D-04) even for an ADMIN when the target has no parent recorded', async () => {
    const target = await models.FamilyMember.create({ firstname: 'Someone', lastname: 'Else', gender: 'Male' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(target.id), newMember: { firstname: 'New', lastname: 'Sibling', gender: 'Female' } },
      admin
    );

    expect(errors[0].message).toBe('Add a parent first — siblings are derived from a shared parent.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });
});
