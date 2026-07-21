import { describe, it, expect } from 'vitest';
import { sequelize, models } from './index.js';

describe('database connectivity', () => {
  it('authenticates against the isolated test database', async () => {
    await sequelize.authenticate();
    expect(sequelize.config.database).toMatch(/_test$/);
  });

  it('can query the User table', async () => {
    const count = await models.User.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('can query the FamilyMember table', async () => {
    expect(models.FamilyMember).toBeDefined();
    const count = await models.FamilyMember.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('can query the Spouse table', async () => {
    expect(models.Spouse).toBeDefined();
    const count = await models.Spouse.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

describe('familyMemberId link column (ACC-05)', () => {
  it('persists and reloads a linked familyMemberId', async () => {
    const member = await models.FamilyMember.create({
      firstname: 'Link',
      lastname: 'Target',
      gender: 'Male'
    });
    const user = await models.User.create({
      name: 'Linked User',
      email: `linked-${Date.now()}@example.com`,
      passwordHash: 'Password123!',
      role: 'USER',
      emailVerified: true,
      familyMemberId: member.id
    });

    await user.reload();

    expect(user.familyMemberId).toBe(member.id);
  });

  it('rejects linking a second user to an already-linked member (UNIQUE)', async () => {
    const member = await models.FamilyMember.create({
      firstname: 'Unique',
      lastname: 'Member',
      gender: 'Female'
    });
    await models.User.create({
      name: 'First Linked User',
      email: `first-${Date.now()}@example.com`,
      passwordHash: 'Password123!',
      role: 'USER',
      emailVerified: true,
      familyMemberId: member.id
    });

    await expect(
      models.User.create({
        name: 'Second Linked User',
        email: `second-${Date.now()}@example.com`,
        passwordHash: 'Password123!',
        role: 'USER',
        emailVerified: true,
        familyMemberId: member.id
      })
    ).rejects.toThrow();
  });

  it('nulls familyMemberId when the linked FamilyMember is deleted (ON DELETE SET NULL)', async () => {
    const member = await models.FamilyMember.create({
      firstname: 'ToDelete',
      lastname: 'Member',
      gender: 'Male'
    });
    const user = await models.User.create({
      name: 'Re-pended User',
      email: `repend-${Date.now()}@example.com`,
      passwordHash: 'Password123!',
      role: 'USER',
      emailVerified: true,
      familyMemberId: member.id
    });

    await member.destroy();
    await user.reload();

    expect(user.familyMemberId).toBeNull();
  });
});
