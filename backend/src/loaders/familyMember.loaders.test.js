import { describe, it, expect, beforeEach } from 'vitest';
import { models, sequelize } from '../models/index.js';
import { resetTables } from '../../test/helpers.js';
import { createLoaders } from './familyMember.loaders.js';

beforeEach(resetTables);

async function countQueries(fn) {
  const original = sequelize.options.logging;
  let count = 0;
  sequelize.options.logging = () => {
    count += 1;
  };
  try {
    await fn();
  } finally {
    sequelize.options.logging = original;
  }
  return count;
}

function makeMember(overrides = {}) {
  return {
    firstname: 'First',
    lastname: 'Last',
    gender: 'Other',
    ...overrides
  };
}

describe('createLoaders (D-07)', () => {
  describe('memberById', () => {
    it('batches 5 concurrent .load() calls into exactly 1 SQL query and resolves each id to its correct row', async () => {
      const rows = await models.FamilyMember.bulkCreate(
        [1, 2, 3, 4, 5].map((n) => makeMember({ firstname: `Member${n}` }))
      );

      const loaders = createLoaders(models);

      let loaded;
      const queryCount = await countQueries(async () => {
        loaded = await Promise.all(rows.map((row) => loaders.memberById.load(row.id)));
      });

      expect(queryCount).toBe(1);
      loaded.forEach((row, i) => {
        expect(row.id).toBe(rows[i].id);
        expect(row.firstname).toBe(rows[i].firstname);
      });
    });
  });

  describe('childrenByParentId', () => {
    it('returns exactly a parent\'s children and batches two different parents into 1 query', async () => {
      const motherA = await models.FamilyMember.create(makeMember({ firstname: 'MotherA', gender: 'Female' }));
      const motherB = await models.FamilyMember.create(makeMember({ firstname: 'MotherB', gender: 'Female' }));

      const childrenOfA = await models.FamilyMember.bulkCreate(
        [1, 2, 3].map((n) => makeMember({ firstname: `ChildA${n}`, motherId: motherA.id }))
      );
      await models.FamilyMember.create(makeMember({ firstname: 'ChildB1', motherId: motherB.id }));

      const loaders = createLoaders(models);

      let resultA;
      let resultB;
      const queryCount = await countQueries(async () => {
        [resultA, resultB] = await Promise.all([
          loaders.childrenByParentId.load(motherA.id),
          loaders.childrenByParentId.load(motherB.id)
        ]);
      });

      expect(queryCount).toBe(1);
      expect(resultA.map((c) => c.id).sort()).toEqual(childrenOfA.map((c) => c.id).sort());
      expect(resultB).toHaveLength(1);
    });
  });

  describe('spousesByMemberId', () => {
    it('resolves to the other member from either side of the pair', async () => {
      const memberA = await models.FamilyMember.create(makeMember({ firstname: 'SpouseA' }));
      const memberB = await models.FamilyMember.create(makeMember({ firstname: 'SpouseB' }));
      await models.Spouse.create({ memberAId: memberA.id, memberBId: memberB.id });

      const loaders = createLoaders(models);

      const [fromA, fromB] = await Promise.all([
        loaders.spousesByMemberId.load(memberA.id),
        loaders.spousesByMemberId.load(memberB.id)
      ]);

      expect(fromA).toHaveLength(1);
      expect(fromA[0].id).toBe(memberB.id);
      expect(fromB).toHaveLength(1);
      expect(fromB[0].id).toBe(memberA.id);
    });
  });

  describe('batch-function length/order invariant', () => {
    it('positionally aligns results with input keys, using null for a missing id', async () => {
      const existing = await models.FamilyMember.create(makeMember({ firstname: 'Exists' }));
      const missingId = existing.id + 999999;

      const loaders = createLoaders(models);

      const [first, second, third] = await Promise.all([
        loaders.memberById.load(existing.id),
        loaders.memberById.load(missingId),
        loaders.memberById.load(existing.id)
      ]);

      expect(first.id).toBe(existing.id);
      expect(second).toBeNull();
      expect(third.id).toBe(existing.id);
    });
  });

  describe('D-07 no-leak proof', () => {
    it('two separate createLoaders(models) instances do not share cache state', async () => {
      const member = await models.FamilyMember.create(makeMember({ firstname: 'Isolated' }));

      const loadersOne = createLoaders(models);
      const loadersTwo = createLoaders(models);

      const first = await loadersOne.memberById.load(member.id);
      expect(first.firstname).toBe('Isolated');

      await member.update({ firstname: 'Renamed' });

      // loadersOne would still be cached (same instance, same key) -- the
      // proof this test cares about is that a FRESH createLoaders() call
      // (loadersTwo) never shares loadersOne's cache and re-fetches fresh.
      const second = await loadersTwo.memberById.load(member.id);
      expect(second.firstname).toBe('Renamed');
    });
  });
});
