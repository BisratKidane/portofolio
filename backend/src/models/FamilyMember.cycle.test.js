import { describe, it, expect, beforeEach } from 'vitest';
import { models } from './index.js';
import { resetTables } from '../../test/helpers.js';
import { wouldCreateCycle, linkParent, addChild } from '../services/familyMember.service.js';

beforeEach(resetTables);

describe('wouldCreateCycle', () => {
  it('resolves true immediately for self-assignment', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });

    await expect(wouldCreateCycle(a.id, a.id)).resolves.toBe(true);
  });

  it('resolves true for a multi-generation cycle', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });
    const b = await models.FamilyMember.create({
      firstname: 'B',
      lastname: 'Doe',
      gender: 'Female',
      motherId: a.id
    });
    const c = await models.FamilyMember.create({
      firstname: 'C',
      lastname: 'Doe',
      gender: 'Male',
      motherId: b.id
    });

    await expect(wouldCreateCycle(a.id, c.id)).resolves.toBe(true);
  });

  it('resolves false for an unrelated member', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });
    const d = await models.FamilyMember.create({
      firstname: 'D',
      lastname: 'Doe',
      gender: 'Male'
    });

    await expect(wouldCreateCycle(d.id, a.id)).resolves.toBe(false);
  });
});

describe('linkParent (REL-01, REL-05)', () => {
  it('rejects a cyclic reassignment and leaves the row unmodified', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });
    const b = await models.FamilyMember.create({
      firstname: 'B',
      lastname: 'Doe',
      gender: 'Female',
      motherId: a.id
    });
    const c = await models.FamilyMember.create({
      firstname: 'C',
      lastname: 'Doe',
      gender: 'Male',
      motherId: b.id
    });

    await expect(linkParent(a.id, { motherId: c.id })).rejects.toThrow();

    await a.reload();
    expect(a.motherId).toBeNull();
  });

  it('accepts a valid, non-cyclic motherId reassignment and persists it', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });
    const d = await models.FamilyMember.create({
      firstname: 'D',
      lastname: 'Doe',
      gender: 'Male'
    });

    await linkParent(d.id, { motherId: a.id });

    await d.reload();
    expect(d.motherId).toBe(a.id);
  });

  it('accepts a valid, non-cyclic fatherId reassignment and persists it', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });
    const d = await models.FamilyMember.create({
      firstname: 'D',
      lastname: 'Doe',
      gender: 'Male'
    });

    await linkParent(d.id, { fatherId: a.id });

    await d.reload();
    expect(d.fatherId).toBe(a.id);
  });

  it('surfaces the FK error for a nonexistent parent id, not a cycle error', async () => {
    const d = await models.FamilyMember.create({
      firstname: 'D',
      lastname: 'Doe',
      gender: 'Male'
    });

    await expect(linkParent(d.id, { motherId: 999999 })).rejects.toThrow();
  });
});

describe('addChild (REL-03)', () => {
  it('creates a new member under an existing parent, persisting the parent FK', async () => {
    const a = await models.FamilyMember.create({
      firstname: 'A',
      lastname: 'Doe',
      gender: 'Male'
    });

    const child = await addChild({
      firstname: 'Newborn',
      lastname: 'Doe',
      gender: 'Female',
      motherId: a.id
    });

    expect(child.motherId).toBe(a.id);

    const reloaded = await models.FamilyMember.findByPk(child.id);
    expect(reloaded.motherId).toBe(a.id);
  });

  it('creates a valid root member with no parent ids', async () => {
    const child = await addChild({
      firstname: 'Root',
      lastname: 'Doe',
      gender: 'Other'
    });

    expect(child.motherId).toBeFalsy();
    expect(child.fatherId).toBeFalsy();

    const reloaded = await models.FamilyMember.findByPk(child.id);
    expect(reloaded.motherId).toBeNull();
    expect(reloaded.fatherId).toBeNull();
  });
});
