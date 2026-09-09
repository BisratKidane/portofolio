import { assertTestDatabase } from './guard.js';
import { seedDefaultAppSettings } from '../src/utils/appSettings.js';

export default async function setup() {
  assertTestDatabase();

  // Import the models aggregator (not config/database.js directly) so the
  // User model is registered on the sequelize instance before sync() runs
  // — sync() only creates tables for models already attached to the instance.
  const { sequelize, models } = await import('../src/models/index.js');
  await sequelize.authenticate();
  await sequelize.sync({ force: true, match: /_test$/ });

  // sync({ force: true }) creates app_settings but not its seeded row (D-02:
  // an absent row means CLOSED). Seed once here so the 23 backend test files
  // that never call resetTables() also observe production-equivalent (OPEN)
  // state, not just the 44 that reset per test.
  await seedDefaultAppSettings(models);

  return async function teardown() {
    await sequelize.drop();
    await sequelize.close();
  };
}
