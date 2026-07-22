import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const FAMILY_MEMBER_RELATIONSHIPS_QUERY = `
  query FamilyMemberRelationships($id: ID!) {
    familyMember(id: $id) {
      id
      fullname
      mother { id fullname }
      father { id fullname }
      spouses { id fullname }
      children { id fullname }
      siblings { id fullname }
      linkedUser { id email }
    }
  }
`;

beforeEach(resetTables);

async function makeAdmin() {
  return createTestUser({ role: 'ADMIN', familyMemberId: null });
}

describe('FamilyMember relationship field resolvers (REL-04)', () => {
  it('resolves mother and father to null when the corresponding FK is null', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await makeAdmin();

    const { data, errors } = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: member.id }, admin);

    expect(errors).toBeUndefined();
    expect(data.familyMember.mother).toBeNull();
    expect(data.familyMember.father).toBeNull();
  });

  it('resolves mother and father to the correct row when both FKs are set', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Mary', lastname: 'Lovelace', gender: 'Female' });
    const father = await models.FamilyMember.create({ firstname: 'John', lastname: 'Lovelace', gender: 'Male' });
    const child = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: mother.id,
      fatherId: father.id
    });
    const admin = await makeAdmin();

    const { data, errors } = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: child.id }, admin);

    expect(errors).toBeUndefined();
    expect(data.familyMember.mother.id).toBe(String(mother.id));
    expect(data.familyMember.mother.fullname).toBe('Mary Lovelace');
    expect(data.familyMember.father.id).toBe(String(father.id));
    expect(data.familyMember.father.fullname).toBe('John Lovelace');
  });

  it('resolves spouses to the correct partner regardless of which side of the canonical Spouse row the queried member is on', async () => {
    // memberOne is created first (lower id) so becomes memberAId; memberTwo
    // becomes memberBId per the Spouse model's beforeValidate reorder hook.
    const memberOne = await models.FamilyMember.create({ firstname: 'Alice', lastname: 'Smith', gender: 'Female' });
    const memberTwo = await models.FamilyMember.create({ firstname: 'Bob', lastname: 'Smith', gender: 'Male' });
    await models.Spouse.create({ memberAId: memberOne.id, memberBId: memberTwo.id });
    const admin = await makeAdmin();

    const fromMemberOne = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: memberOne.id }, admin);
    const fromMemberTwo = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: memberTwo.id }, admin);

    expect(fromMemberOne.errors).toBeUndefined();
    expect(fromMemberOne.data.familyMember.spouses).toHaveLength(1);
    expect(fromMemberOne.data.familyMember.spouses[0].id).toBe(String(memberTwo.id));

    expect(fromMemberTwo.errors).toBeUndefined();
    expect(fromMemberTwo.data.familyMember.spouses).toHaveLength(1);
    expect(fromMemberTwo.data.familyMember.spouses[0].id).toBe(String(memberOne.id));
  });

  it('resolves children to all rows where the queried member is motherId OR fatherId', async () => {
    const parent = await models.FamilyMember.create({ firstname: 'Pat', lastname: 'Doe', gender: 'Female' });
    const childViaMother = await models.FamilyMember.create({
      firstname: 'Kid1',
      lastname: 'Doe',
      gender: 'Male',
      motherId: parent.id
    });
    const childViaFather = await models.FamilyMember.create({
      firstname: 'Kid2',
      lastname: 'Doe',
      gender: 'Female',
      fatherId: parent.id
    });
    const admin = await makeAdmin();

    const { data, errors } = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: parent.id }, admin);

    expect(errors).toBeUndefined();
    const childIds = data.familyMember.children.map((c) => c.id).sort();
    expect(childIds).toEqual([String(childViaFather.id), String(childViaMother.id)].sort());
  });

  it('resolves siblings to full siblings and half-siblings, excluding the member itself', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Mary', lastname: 'Doe', gender: 'Female' });
    const father = await models.FamilyMember.create({ firstname: 'John', lastname: 'Doe', gender: 'Male' });
    const otherFather = await models.FamilyMember.create({ firstname: 'Sam', lastname: 'Roe', gender: 'Male' });

    const subject = await models.FamilyMember.create({
      firstname: 'Subject',
      lastname: 'Doe',
      gender: 'Female',
      motherId: mother.id,
      fatherId: father.id
    });
    const fullSibling = await models.FamilyMember.create({
      firstname: 'FullSib',
      lastname: 'Doe',
      gender: 'Male',
      motherId: mother.id,
      fatherId: father.id
    });
    const halfSibling = await models.FamilyMember.create({
      firstname: 'HalfSib',
      lastname: 'Doe',
      gender: 'Female',
      motherId: mother.id,
      fatherId: otherFather.id
    });
    const admin = await makeAdmin();

    const { data, errors } = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: subject.id }, admin);

    expect(errors).toBeUndefined();
    const siblingIds = data.familyMember.siblings.map((s) => s.id).sort();
    expect(siblingIds).toEqual([String(fullSibling.id), String(halfSibling.id)].sort());
    expect(siblingIds).not.toContain(String(subject.id));
  });

  it('resolves linkedUser to the linked User row when present, and null when absent', async () => {
    const linkedMember = await models.FamilyMember.create({ firstname: 'Linked', lastname: 'Person', gender: 'Other' });
    const unlinkedMember = await models.FamilyMember.create({ firstname: 'Unlinked', lastname: 'Person', gender: 'Other' });
    const linkedUser = await createTestUser({ role: 'USER', familyMemberId: linkedMember.id });
    const admin = await makeAdmin();

    const linkedResult = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: linkedMember.id }, admin);
    const unlinkedResult = await graphql(FAMILY_MEMBER_RELATIONSHIPS_QUERY, { id: unlinkedMember.id }, admin);

    expect(linkedResult.errors).toBeUndefined();
    expect(linkedResult.data.familyMember.linkedUser.id).toBe(String(linkedUser.id));
    expect(linkedResult.data.familyMember.linkedUser.email).toBe(linkedUser.email);

    expect(unlinkedResult.errors).toBeUndefined();
    expect(unlinkedResult.data.familyMember.linkedUser).toBeNull();
  });
});
