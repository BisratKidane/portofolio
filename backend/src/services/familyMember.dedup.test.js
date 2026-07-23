import { describe, it, expect, beforeEach } from 'vitest';
import { models, sequelize } from '../models/index.js';
import { resetTables } from '../../test/helpers.js';
import { addChild } from './familyMember.service.js';

beforeEach(resetTables);

describe('addChild REL-06 dedup guard (D-08/D-09/D-10/D-11)', () => {
  it('rejects a second child whose firstname (trimmed + case-folded) matches an existing child sharing the same motherId', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: mother.id
    });

    await expect(
      addChild({ firstname: ' sara ', lastname: 'Kidane', gender: 'Female', motherId: mother.id })
    ).rejects.toThrow(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );
  });

  it('rejects the same duplicate when the shared parent is fatherId only (either-parent, D-09)', async () => {
    const father = await models.FamilyMember.create({ firstname: 'Kebede', lastname: 'Tesfaye', gender: 'Male' });
    const motherA = await models.FamilyMember.create({ firstname: 'MomA', lastname: 'Tesfaye', gender: 'Female' });
    const motherB = await models.FamilyMember.create({ firstname: 'MomB', lastname: 'Tesfaye', gender: 'Female' });

    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Tesfaye',
      gender: 'Female',
      motherId: motherA.id,
      fatherId: father.id
    });

    await expect(
      addChild({
        firstname: 'Sara',
        lastname: 'Tesfaye',
        gender: 'Female',
        motherId: motherB.id,
        fatherId: father.id
      })
    ).rejects.toThrow(
      "A child named 'Sara' already exists under Kebede Tesfaye. Pick a different name, or edit the existing member."
    );
  });

  it('allows the same firstname when the two children share no parent at all (no false positive)', async () => {
    const motherA = await models.FamilyMember.create({ firstname: 'MomA', lastname: 'Doe', gender: 'Female' });
    const motherB = await models.FamilyMember.create({ firstname: 'MomB', lastname: 'Doe', gender: 'Female' });

    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Doe',
      gender: 'Female',
      motherId: motherA.id
    });

    const child = await addChild({
      firstname: 'Sara',
      lastname: 'Doe',
      gender: 'Female',
      motherId: motherB.id
    });

    expect(child.firstname).toBe('Sara');
  });

  it('(D-10 TOCTOU proof) two genuinely concurrent addChild calls targeting the same parent+firstname: exactly one succeeds', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });

    const attrsA = { firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id };
    const attrsB = { firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id };

    const results = await Promise.allSettled([addChild(attrsA), addChild(attrsB)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toBe(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );

    const count = await models.FamilyMember.count({
      where: { motherId: mother.id, firstname: 'Sara' }
    });
    expect(count).toBe(1);
  });

  it('(Pitfall 4) rejects a duplicate regardless of any admin context — addChild has no isAdmin parameter at all', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: mother.id
    });

    // addChild takes (attrs, { transaction }) only — there is no admin/role
    // parameter to pass, so this call is indistinguishable from a member's.
    await expect(
      addChild({ firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id })
    ).rejects.toThrow(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );
  });

  it('(D-10 resolver-path TOCTOU, CR-01) detects a duplicate even when a plain read earlier in the SAME transaction froze the REPEATABLE READ snapshot — mirrors addChild/addSibling resolvers findByPk-ing the target before the guard runs', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });

    const t1 = await sequelize.transaction();
    try {
      // Mirror the resolver: a plain (non-locking) read of the target BEFORE
      // the transaction is handed to the guard. Under InnoDB REPEATABLE READ
      // this fixes t1's consistent-read snapshot right here, before any sibling
      // a concurrent request is about to commit exists.
      await models.FamilyMember.findByPk(mother.id, { transaction: t1 });

      // A concurrent request commits a sibling AFTER t1's snapshot was frozen
      // but BEFORE the guard runs (autocommit — no transaction — so it commits).
      await models.FamilyMember.create({
        firstname: 'Sara',
        lastname: 'Kidane',
        gender: 'Female',
        motherId: mother.id
      });

      // The guard must STILL see 'Sara' and reject. A plain SELECT inside the
      // guard reads t1's stale snapshot and misses it, reopening the D-10 race
      // on the real resolver call path (which the direct-call tests never hit).
      await expect(
        addChild(
          { firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id },
          { transaction: t1 }
        )
      ).rejects.toThrow(
        "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
      );
    } finally {
      await t1.rollback();
    }
  });

  it('(Pitfall 2/A3) still enforces the guard when no transaction is supplied by the caller', async () => {
    const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
    await models.FamilyMember.create({
      firstname: 'Sara',
      lastname: 'Kidane',
      gender: 'Female',
      motherId: mother.id
    });

    await expect(
      addChild({ firstname: 'Sara', lastname: 'Kidane', gender: 'Female', motherId: mother.id })
    ).rejects.toThrow(
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member."
    );
  });
});
