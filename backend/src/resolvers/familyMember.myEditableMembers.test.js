import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { setSpouse } from '../services/familyMember.service.js';
import { computeEditableScope } from '../services/familyMember.service.js';

const MY_EDITABLE_MEMBERS_QUERY = `
  query MyEditableMembers {
    myEditableMembers {
      id
    }
  }
`;

beforeEach(resetTables);

describe('myEditableMembers (PERM-05 convenience, de-risks Phase 15)', () => {
  it("returns exactly the caller's computed editable scope, de-duplicated", async () => {
    const grandparent = await models.FamilyMember.create({ firstname: 'Great', lastname: 'Grand', gender: 'Female' });
    const mother = await models.FamilyMember.create({
      firstname: 'Mother',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: grandparent.id
    });
    const father = await models.FamilyMember.create({ firstname: 'Father', lastname: 'Lovelace', gender: 'Male' });
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: mother.id,
      fatherId: father.id
    });
    const spouse = await models.FamilyMember.create({ firstname: 'William', lastname: 'King', gender: 'Male' });
    await setSpouse(self.id, spouse.id);
    const child = await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      motherId: self.id
    });
    const sibling = await models.FamilyMember.create({
      firstname: 'Sibling',
      lastname: 'Lovelace',
      gender: 'Female',
      motherId: mother.id,
      fatherId: father.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(MY_EDITABLE_MEMBERS_QUERY, {}, actor);

    expect(errors).toBeUndefined();

    const scope = await computeEditableScope(self.id);
    const returnedIds = new Set(data.myEditableMembers.map((m) => Number(m.id)));

    expect(returnedIds.size).toBe(data.myEditableMembers.length);
    for (const id of scope.ids) {
      expect(returnedIds.has(id)).toBe(true);
    }
    for (const id of returnedIds) {
      expect(scope.ids.has(id)).toBe(true);
    }
    // sanity: confirms the fixture actually exercises all five categories
    expect(returnedIds.has(self.id)).toBe(true);
    expect(returnedIds.has(mother.id)).toBe(true);
    expect(returnedIds.has(father.id)).toBe(true);
    expect(returnedIds.has(spouse.id)).toBe(true);
    expect(returnedIds.has(child.id)).toBe(true);
    expect(returnedIds.has(sibling.id)).toBe(true);
    expect(returnedIds.has(grandparent.id)).toBe(false);
  });

  it('returns an empty list for an ADMIN with familyMemberId: null (Phase 13 carve-out)', async () => {
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

    const { data, errors } = await graphql(MY_EDITABLE_MEMBERS_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.myEditableMembers).toEqual([]);
  });

  it('rejects a verified-but-unlinked USER', async () => {
    const user = await createTestUser({ role: 'USER', familyMemberId: null });

    const { data, errors } = await graphql(MY_EDITABLE_MEMBERS_QUERY, {}, user);

    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
    expect(data).toBeNull();
  });
});
