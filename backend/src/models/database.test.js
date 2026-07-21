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
