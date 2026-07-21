import { describe, it, expect, beforeEach } from 'vitest';
import { Op } from 'sequelize';
import { models } from './index.js';
import { resetTables } from '../../test/helpers.js';

const { Spouse } = models;

beforeEach(resetTables);

describe('canonical ordering hook (D-01)', () => {
  it('swaps memberAId/memberBId into ascending order when built out of order', async () => {
    const instance = Spouse.build({ memberAId: 12, memberBId: 5 });

    await Spouse.runHooks('beforeValidate', instance);

    expect(instance.memberAId).toBe(5);
    expect(instance.memberBId).toBe(12);
  });

  it('leaves memberAId/memberBId unchanged when already ascending', async () => {
    const instance = Spouse.build({ memberAId: 3, memberBId: 9 });

    await Spouse.runHooks('beforeValidate', instance);

    expect(instance.memberAId).toBe(3);
    expect(instance.memberBId).toBe(9);
  });
});

describe('self-marriage rejection', () => {
  it('rejects a Spouse row where memberAId equals memberBId', async () => {
    const x = await models.FamilyMember.create({
      firstname: 'Alex',
      lastname: 'Doe',
      gender: 'Other'
    });

    await expect(
      models.Spouse.create({ memberAId: x.id, memberBId: x.id })
    ).rejects.toThrow();
  });
});

describe('unique canonical pair (D-01)', () => {
  it('rejects a second insert with the swapped memberAId/memberBId order', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Female'
    });
    const b = await models.FamilyMember.create({
      firstname: 'B',
      lastname: 'Doe',
      gender: 'Male'
    });

    await models.Spouse.create({ memberAId: a.id, memberBId: b.id });

    await expect(
      models.Spouse.create({ memberAId: b.id, memberBId: a.id })
    ).rejects.toThrow();
  });
});

describe('symmetric read (REL-02)', () => {
  it('returns the same canonical row when queried from either member id', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Female'
    });
    const b = await models.FamilyMember.create({
      firstname: 'B',
      lastname: 'Doe',
      gender: 'Male'
    });

    await models.Spouse.create({ memberAId: a.id, memberBId: b.id });

    const fromA = await models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: a.id }, { memberBId: a.id }] }
    });
    const fromB = await models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: b.id }, { memberBId: b.id }] }
    });

    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
    expect(fromA[0].id).toBe(fromB[0].id);
  });
});

describe('multiple spouse edges (D-02)', () => {
  it('allows a single member to have more than one spouse row simultaneously', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Female'
    });
    const b = await models.FamilyMember.create({
      firstname: 'B',
      lastname: 'Doe',
      gender: 'Male'
    });
    const c = await models.FamilyMember.create({
      firstname: 'C',
      lastname: 'Doe',
      gender: 'Male'
    });

    await models.Spouse.create({ memberAId: a.id, memberBId: b.id });
    await models.Spouse.create({ memberAId: a.id, memberBId: c.id });

    const rows = await models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: a.id }, { memberBId: a.id }] }
    });

    expect(rows).toHaveLength(2);
  });
});
