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
});
