import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { resetTables } from '../../test/helpers.js';
import { computeEditableScope } from './familyMember.service.js';

beforeEach(resetTables);

describe('computeEditableScope (PERM-05, REL-04)', () => {
  it('always includes self, even with no parents/spouse/children recorded', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Self', lastname: 'Doe', gender: 'Other' });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(self.id)).toBe(true);
    expect(scope.self.id).toBe(self.id);
    expect(scope.parents).toEqual([]);
    expect(scope.spouses).toEqual([]);
    expect(scope.children).toEqual([]);
    expect(scope.siblings).toEqual([]);
  });

  it('includes mother and father when set', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Mom', lastname: 'Doe', gender: 'Female' });
    const father = await models.FamilyMember.create({ firstname: 'Dad', lastname: 'Doe', gender: 'Male' });
    const self = await models.FamilyMember.create({
      firstname: 'Self',
      lastname: 'Doe',
      gender: 'Other',
      motherId: mother.id,
      fatherId: father.id
    });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(mother.id)).toBe(true);
    expect(scope.ids.has(father.id)).toBe(true);
    expect(scope.parents.map((p) => p.id).sort()).toEqual([mother.id, father.id].sort());
  });

  it('includes a spouse regardless of which side of the canonical Spouse row the actor is on', async () => {
    // Creation order is deliberate: spouseB is created BEFORE self (lower id, so
    // self lands as memberB after the model's canonical-ordering hook), and
    // spouseA is created AFTER self (higher id, so self lands as memberA).
    const spouseB = await models.FamilyMember.create({ firstname: 'SpouseB', lastname: 'Doe', gender: 'Female' });
    const self = await models.FamilyMember.create({ firstname: 'Self', lastname: 'Doe', gender: 'Male' });
    const spouseA = await models.FamilyMember.create({ firstname: 'SpouseA', lastname: 'Doe', gender: 'Female' });

    await models.Spouse.create({ memberAId: spouseB.id, memberBId: self.id });
    await models.Spouse.create({ memberAId: self.id, memberBId: spouseA.id });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(spouseA.id)).toBe(true);
    expect(scope.ids.has(spouseB.id)).toBe(true);
    expect(scope.spouses.map((s) => s.id).sort()).toEqual([spouseA.id, spouseB.id].sort());
  });

  it('includes children (rows where the actor is motherId or fatherId)', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Self', lastname: 'Doe', gender: 'Male' });
    const childViaMother = await models.FamilyMember.create({
      firstname: 'ChildM',
      lastname: 'Doe',
      gender: 'Female',
      motherId: self.id
    });
    const childViaFather = await models.FamilyMember.create({
      firstname: 'ChildF',
      lastname: 'Doe',
      gender: 'Male',
      fatherId: self.id
    });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(childViaMother.id)).toBe(true);
    expect(scope.ids.has(childViaFather.id)).toBe(true);
    expect(scope.children.map((c) => c.id).sort()).toEqual(
      [childViaMother.id, childViaFather.id].sort()
    );
  });

  it('includes a full sibling (shares both motherId and fatherId)', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Mom', lastname: 'Doe', gender: 'Female' });
    const father = await models.FamilyMember.create({ firstname: 'Dad', lastname: 'Doe', gender: 'Male' });
    const self = await models.FamilyMember.create({
      firstname: 'Self',
      lastname: 'Doe',
      gender: 'Other',
      motherId: mother.id,
      fatherId: father.id
    });
    const sibling = await models.FamilyMember.create({
      firstname: 'Sib',
      lastname: 'Doe',
      gender: 'Other',
      motherId: mother.id,
      fatherId: father.id
    });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(sibling.id)).toBe(true);
  });

  it('includes a half-sibling (shares only fatherId, differing motherId) (D-03 either-parent rule)', async () => {
    const father = await models.FamilyMember.create({ firstname: 'Dad', lastname: 'Doe', gender: 'Male' });
    const motherA = await models.FamilyMember.create({ firstname: 'MomA', lastname: 'Doe', gender: 'Female' });
    const motherB = await models.FamilyMember.create({ firstname: 'MomB', lastname: 'Doe', gender: 'Female' });
    const self = await models.FamilyMember.create({
      firstname: 'Self',
      lastname: 'Doe',
      gender: 'Other',
      motherId: motherA.id,
      fatherId: father.id
    });
    const halfSibling = await models.FamilyMember.create({
      firstname: 'HalfSib',
      lastname: 'Doe',
      gender: 'Other',
      motherId: motherB.id,
      fatherId: father.id
    });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(halfSibling.id)).toBe(true);
  });

  it('returns an empty siblings array without throwing for a member with no parents recorded (D-04)', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Self', lastname: 'Doe', gender: 'Other' });

    const scope = await computeEditableScope(self.id);

    expect(scope.siblings).toEqual([]);
  });

  it('SC-3 exclusion: does NOT include a grandparent (self.mother.motherId)', async () => {
    const grandmother = await models.FamilyMember.create({ firstname: 'Grandma', lastname: 'Doe', gender: 'Female' });
    const mother = await models.FamilyMember.create({
      firstname: 'Mom',
      lastname: 'Doe',
      gender: 'Female',
      motherId: grandmother.id
    });
    const self = await models.FamilyMember.create({
      firstname: 'Self',
      lastname: 'Doe',
      gender: 'Other',
      motherId: mother.id
    });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(grandmother.id)).toBe(false);
  });

  it("SC-3 exclusion: does NOT include a cousin (a parent's sibling's child)", async () => {
    const grandmother = await models.FamilyMember.create({ firstname: 'Grandma', lastname: 'Doe', gender: 'Female' });
    const mother = await models.FamilyMember.create({
      firstname: 'Mom',
      lastname: 'Doe',
      gender: 'Female',
      motherId: grandmother.id
    });
    const auntUncle = await models.FamilyMember.create({
      firstname: 'Aunt',
      lastname: 'Doe',
      gender: 'Female',
      motherId: grandmother.id
    });
    const cousin = await models.FamilyMember.create({
      firstname: 'Cousin',
      lastname: 'Doe',
      gender: 'Other',
      motherId: auntUncle.id
    });
    const self = await models.FamilyMember.create({
      firstname: 'Self',
      lastname: 'Doe',
      gender: 'Other',
      motherId: mother.id
    });

    const scope = await computeEditableScope(self.id);

    expect(scope.ids.has(cousin.id)).toBe(false);
  });

  it("SC-3 exclusion: does NOT include a sibling-of-sibling (T is S's half-sibling via a motherId self does not share, per Assumption A3)", async () => {
    const father = await models.FamilyMember.create({ firstname: 'Dad', lastname: 'Doe', gender: 'Male' });
    const selfMother = await models.FamilyMember.create({ firstname: 'SelfMom', lastname: 'Doe', gender: 'Female' });
    const sMother = await models.FamilyMember.create({ firstname: 'SMom', lastname: 'Doe', gender: 'Female' });

    const self = await models.FamilyMember.create({
      firstname: 'Self',
      lastname: 'Doe',
      gender: 'Other',
      motherId: selfMother.id,
      fatherId: father.id
    });
    const S = await models.FamilyMember.create({
      firstname: 'S',
      lastname: 'Doe',
      gender: 'Other',
      motherId: sMother.id,
      fatherId: father.id
    });
    const T = await models.FamilyMember.create({
      firstname: 'T',
      lastname: 'Doe',
      gender: 'Other',
      motherId: sMother.id
    });

    const scope = await computeEditableScope(self.id);

    // S shares fatherId with self, so S IS self's half-sibling.
    expect(scope.ids.has(S.id)).toBe(true);
    // T shares motherId with S but not with self at all — T must NOT be
    // reachable from self's scope, even though T is a sibling of self's sibling S.
    expect(scope.ids.has(T.id)).toBe(false);
  });
});
