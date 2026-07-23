import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { setSpouse } from '../services/familyMember.service.js';
import { familyMemberTypeDefs } from '../schemas/familyMember.schema.js';

const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) {
      id
      firstname
      lastname
    }
  }
`;

beforeEach(resetTables);

describe('addChild (SC-4 primary target, D-01/D-02, PERM-01/PERM-02, REL-04)', () => {
  it('adds a new child to the acting member-user themselves with no otherParentId', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'MOTHER',
        newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' },
        otherParentId: null
      },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.addChild.firstname).toBe('Byron');

    const child = await models.FamilyMember.findByPk(data.addChild.id);
    expect(child.motherId).toBe(self.id);
    expect(child.fatherId).toBeNull();
  });

  it('adds a new child with otherParentId set to the actor own in-scope spouse', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const spouse = await models.FamilyMember.create({ firstname: 'William', lastname: 'King', gender: 'Male' });
    await setSpouse(self.id, spouse.id);
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'MOTHER',
        newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' },
        otherParentId: String(spouse.id)
      },
      actor
    );

    expect(errors).toBeUndefined();

    const child = await models.FamilyMember.findByPk(data.addChild.id);
    expect(child.motherId).toBe(self.id);
    expect(child.fatherId).toBe(spouse.id);
  });

  it('rejects (SC-4) an otherParentId referencing a stranger with their own linked user account', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const stranger = await models.FamilyMember.create({ firstname: 'Stranger', lastname: 'Doe', gender: 'Male' });
    await createTestUser({ role: 'USER', familyMemberId: stranger.id, email: `stranger-${Date.now()}@example.com` });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'MOTHER',
        newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' },
        otherParentId: String(stranger.id)
      },
      actor
    );

    expect(errors[0].message).toBe('You may only reference relatives already within your editable scope.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeCount);
    await stranger.reload();
    expect(stranger.motherId).toBeNull();
    expect(stranger.fatherId).toBeNull();
  });

  it('rejects (SC-4) an otherParentId referencing the actor own grandparent (in tree, outside scope)', async () => {
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

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'MOTHER',
        newMember: { firstname: 'Byron', lastname: 'Lovelace', gender: 'Male' },
        otherParentId: String(grandparent.id)
      },
      actor
    );

    expect(errors[0].message).toBe('You may only reference relatives already within your editable scope.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it('rejects a memberId (primary target) outside the actor editable scope', async () => {
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
      ADD_CHILD_MUTATION,
      {
        memberId: String(grandparent.id),
        role: 'MOTHER',
        newMember: { firstname: 'Outside', lastname: 'Scope', gender: 'Female' },
        otherParentId: null
      },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();
  });

  it('allows an ADMIN to addChild referencing any existing member as otherParentId', async () => {
    const target = await models.FamilyMember.create({ firstname: 'Someone', lastname: 'Else', gender: 'Female' });
    const stranger = await models.FamilyMember.create({ firstname: 'Stranger', lastname: 'Doe', gender: 'Male' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(target.id),
        role: 'MOTHER',
        newMember: { firstname: 'Byron', lastname: 'Else', gender: 'Male' },
        otherParentId: String(stranger.id)
      },
      admin
    );

    expect(errors).toBeUndefined();

    const child = await models.FamilyMember.findByPk(data.addChild.id);
    expect(child.motherId).toBe(target.id);
    expect(child.fatherId).toBe(stranger.id);
  });

  it('(D-01) the SDL exposes no existing-node id argument for the child itself', () => {
    const mutationMatch = familyMemberTypeDefs.match(/addChild\(([^)]*)\)/);
    expect(mutationMatch).not.toBeNull();
    const argsSignature = mutationMatch[1];
    expect(argsSignature).toContain('newMember: NewFamilyMemberInput!');
    expect(argsSignature).not.toMatch(/childId/i);
  });

  it('(REL-06, D-09 motherId-only) rejects a duplicate-firstname child sharing the same mother', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: self.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'MOTHER',
        newMember: { firstname: ' sara ', lastname: 'Kidane', gender: 'Female' },
        otherParentId: null
      },
      actor
    );

    expect(errors[0].message).toBe(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );
    expect(data).toBeNull();
    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it('(REL-06, D-09 fatherId-only) rejects a duplicate-firstname child sharing the same father', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Kebede', lastname: 'Tesfaye', gender: 'Male' });
    const otherMother = await models.FamilyMember.create({ firstname: 'MomB', lastname: 'Tesfaye', gender: 'Female' });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Tesfaye',
      gender: 'Female',
      fatherId: self.id,
      motherId: otherMother.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'FATHER',
        newMember: { firstname: 'Sara', lastname: 'Tesfaye', gender: 'Female' },
        otherParentId: null
      },
      actor
    );

    expect(errors[0].message).toBe(
      "A child named 'Sara' already exists under Kebede Tesfaye. Pick a different name, or edit the existing member."
    );
    expect(data).toBeNull();
    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });

  it('(REL-06, Pitfall 4) rejects a duplicate-firstname child for an ADMIN too -- no admin override', async () => {
    const target = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: target.id
    });
    const admin = await createTestUser({ role: 'ADMIN' });

    const beforeCount = await models.FamilyMember.count();

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(target.id),
        role: 'MOTHER',
        newMember: { firstname: 'Sara', lastname: 'Kidane', gender: 'Female' },
        otherParentId: null
      },
      admin
    );

    expect(errors[0].message).toBe(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );
    expect(data).toBeNull();
    expect(await models.FamilyMember.count()).toBe(beforeCount);
  });
});
