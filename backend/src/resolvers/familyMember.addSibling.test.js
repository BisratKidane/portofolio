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

  it('rejects (CR-02) inheriting a co-parent FK that lies outside the actor editable scope', async () => {
    // The actor's child C has motherId = self and fatherId = coParent. C is in
    // self's scope (children), but coParent is not (one hop only) -- addChild
    // would reject otherParentId: coParent, so addSibling must reject too.
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const coParent = await models.FamilyMember.create({ firstname: 'Co', lastname: 'Parent', gender: 'Male' });
    const child = await models.FamilyMember.create({
      firstname: 'Kid',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: self.id,
      fatherId: coParent.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(child.id), newMember: { firstname: 'Smuggled', lastname: 'Child', gender: 'Male' } },
      actor
    );

    expect(errors[0].message).toBe('You may only reference relatives already within your editable scope.');
    expect(data).toBeNull();
    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it("rejects (CR-02) inheriting a spouse's parent FKs, which lie outside the actor editable scope", async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const spouseMother = await models.FamilyMember.create({ firstname: 'P1', lastname: 'InLaw', gender: 'Female' });
    const spouse = await models.FamilyMember.create({
      firstname: 'Spouse',
      lastname: 'InLaw',
      gender: 'Male',
      motherId: spouseMother.id
    });
    await models.Spouse.create({ memberAId: self.id, memberBId: spouse.id });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(spouse.id), newMember: { firstname: 'Smuggled', lastname: 'InLaw', gender: 'Female' } },
      actor
    );

    expect(errors[0].message).toBe('You may only reference relatives already within your editable scope.');
    expect(data).toBeNull();
    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it('still allows an ADMIN to add a sibling whose inherited parents are outside any scope', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Mother', lastname: 'Far', gender: 'Female' });
    const target = await models.FamilyMember.create({
      firstname: 'Target',
      lastname: 'Far',
      gender: 'Male',
      motherId: mother.id
    });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(target.id), newMember: { firstname: 'New', lastname: 'Far', gender: 'Female' } },
      admin
    );

    expect(errors).toBeUndefined();
    const sibling = await models.FamilyMember.findByPk(data.addSibling.id);
    expect(sibling.motherId).toBe(mother.id);
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

  it('(REL-06, D-11) rejects a new sibling whose firstname duplicates an existing child of the shared parent', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: mother.id
    });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: mother.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_SIBLING_MUTATION,
      { memberId: String(self.id), newMember: { firstname: 'Sara', lastname: 'Kidane', gender: 'Female' } },
      actor
    );

    expect(errors[0].message).toBe(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );
    expect(data).toBeNull();
    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });
});
