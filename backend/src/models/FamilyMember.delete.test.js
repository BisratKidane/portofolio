import { describe, it, expect, beforeEach } from 'vitest';
import { models } from './index.js';
import { resetTables } from '../../test/helpers.js';
import { setSpouse, deleteMember } from '../services/familyMember.service.js';

beforeEach(resetTables);

describe('deleteMember — blood-relative survival (D-03, D-04)', () => {
  it('deletes a mid-tree blood member, nulls the child FK, and keeps the blood spouse', async () => {
    const grandparent = await models.FamilyMember.create({
      firstname: 'Grandparent',
      lastname: 'Doe',
      gender: 'Female'
    });
    const otherRoot = await models.FamilyMember.create({
      firstname: 'OtherRoot',
      lastname: 'Doe',
      gender: 'Male'
    });
    const parent = await models.FamilyMember.create({
      firstname: 'Parent',
      lastname: 'Doe',
      gender: 'Male',
      motherId: grandparent.id
    });
    const child = await models.FamilyMember.create({
      firstname: 'Child',
      lastname: 'Doe',
      gender: 'Female',
      motherId: parent.id
    });
    const bloodSpouse = await models.FamilyMember.create({
      firstname: 'BloodSpouse',
      lastname: 'Doe',
      gender: 'Female',
      motherId: otherRoot.id
    });

    await setSpouse(parent.id, bloodSpouse.id);

    await deleteMember(parent.id);

    const reloadedParent = await models.FamilyMember.findByPk(parent.id);
    expect(reloadedParent).toBeNull();

    const reloadedChild = await models.FamilyMember.findByPk(child.id);
    expect(reloadedChild).not.toBeNull();
    expect(reloadedChild.motherId).toBeNull();

    const reloadedBloodSpouse = await models.FamilyMember.findByPk(bloodSpouse.id);
    expect(reloadedBloodSpouse).not.toBeNull();

    const remainingSpouseRows = await models.Spouse.count({
      where: { memberBId: parent.id }
    });
    expect(remainingSpouseRows).toBe(0);
  });
});

describe('deleteMember — married-in one-hop rule (D-03)', () => {
  it('deletes a married-in-only spouse alongside the deleted target', async () => {
    const p2 = await models.FamilyMember.create({
      firstname: 'P2',
      lastname: 'Doe',
      gender: 'Male'
    });
    const mi = await models.FamilyMember.create({
      firstname: 'MI',
      lastname: 'Doe',
      gender: 'Female'
    });

    await setSpouse(p2.id, mi.id);

    await deleteMember(p2.id);

    const reloadedP2 = await models.FamilyMember.findByPk(p2.id);
    expect(reloadedP2).toBeNull();

    const reloadedMi = await models.FamilyMember.findByPk(mi.id);
    expect(reloadedMi).toBeNull();
  });

  it('does not recurse into the removed married-in partner\'s own married-in spouse (two-hop)', async () => {
    const p3 = await models.FamilyMember.create({
      firstname: 'P3',
      lastname: 'Doe',
      gender: 'Male'
    });
    const mi1 = await models.FamilyMember.create({
      firstname: 'MI1',
      lastname: 'Doe',
      gender: 'Female'
    });
    const mi2 = await models.FamilyMember.create({
      firstname: 'MI2',
      lastname: 'Doe',
      gender: 'Male'
    });

    await setSpouse(p3.id, mi1.id);
    await setSpouse(mi1.id, mi2.id);

    await deleteMember(p3.id);

    const reloadedP3 = await models.FamilyMember.findByPk(p3.id);
    expect(reloadedP3).toBeNull();

    const reloadedMi1 = await models.FamilyMember.findByPk(mi1.id);
    expect(reloadedMi1).toBeNull();

    const reloadedMi2 = await models.FamilyMember.findByPk(mi2.id);
    expect(reloadedMi2).not.toBeNull();
  });
});
