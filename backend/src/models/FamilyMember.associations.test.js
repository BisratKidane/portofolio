import { describe, it, expect, beforeEach } from 'vitest';
import { models } from './index.js';
import { resetTables } from '../../test/helpers.js';

beforeEach(resetTables);

describe('parent linking (REL-01)', () => {
  it('persists motherId/fatherId when set to an existing member id', async () => {
    const mother = await models.FamilyMember.create({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female'
    });
    const father = await models.FamilyMember.create({
      firstname: 'John',
      lastname: 'Doe',
      gender: 'Male'
    });
    const child = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male',
      motherId: mother.id,
      fatherId: father.id
    });

    await child.reload();

    expect(child.motherId).toBe(mother.id);
    expect(child.fatherId).toBe(father.id);
  });

  it('is readable via the mother/father association aliases', async () => {
    const mother = await models.FamilyMember.create({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female'
    });
    const father = await models.FamilyMember.create({
      firstname: 'John',
      lastname: 'Doe',
      gender: 'Male'
    });
    const child = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male',
      motherId: mother.id,
      fatherId: father.id
    });

    const reloaded = await models.FamilyMember.findByPk(child.id, {
      include: ['mother', 'father']
    });

    expect(reloaded.mother.id).toBe(mother.id);
    expect(reloaded.father.id).toBe(father.id);
  });

  it('rejects a motherId that does not reference an existing member', async () => {
    await expect(
      models.FamilyMember.create({
        firstname: 'Jack',
        lastname: 'Doe',
        gender: 'Male',
        motherId: 999999
      })
    ).rejects.toThrow();
  });
});

describe('inverse children association (REL-03)', () => {
  it('exposes childrenAsMother containing the linked child', async () => {
    const mother = await models.FamilyMember.create({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female'
    });
    const child = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male',
      motherId: mother.id
    });

    const reloadedMother = await models.FamilyMember.findByPk(mother.id, {
      include: ['childrenAsMother']
    });

    expect(reloadedMother.childrenAsMother.some((c) => c.id === child.id)).toBe(true);
  });
});

describe('cascade-safety on parent delete (D-05)', () => {
  it('sets motherId to null (not deleting the child) when the mother row is deleted', async () => {
    const mother = await models.FamilyMember.create({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female'
    });
    const child = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male',
      motherId: mother.id
    });

    await models.FamilyMember.destroy({ where: { id: mother.id } });

    const reloadedChild = await models.FamilyMember.findByPk(child.id);

    expect(reloadedChild).not.toBeNull();
    expect(reloadedChild.motherId).toBeNull();
  });
});

describe('mothersname independence (D-06)', () => {
  it('persists mothersname with no motherId set', async () => {
    const member = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male',
      mothersname: 'Jane Smith'
    });

    expect(member.mothersname).toBe('Jane Smith');
    expect(member.motherId).toBeFalsy();
  });

  it('persists both mothersname and motherId simultaneously', async () => {
    const mother = await models.FamilyMember.create({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female'
    });
    const child = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male',
      mothersname: 'Jane Smith',
      motherId: mother.id
    });

    expect(child.mothersname).toBe('Jane Smith');
    expect(child.motherId).toBe(mother.id);
  });

  it('leaves both mothersname and motherId null when neither is set', async () => {
    const member = await models.FamilyMember.create({
      firstname: 'Jack',
      lastname: 'Doe',
      gender: 'Male'
    });

    expect(member.mothersname).toBeNull();
    expect(member.motherId).toBeFalsy();
  });
});
