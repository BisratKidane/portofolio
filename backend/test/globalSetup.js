import { assertTestDatabase } from './guard.js';

export default async function setup() {
  assertTestDatabase();

  // Import the models aggregator (not config/database.js directly) so the
  // User model is registered on the sequelize instance before sync() runs
  // — sync() only creates tables for models already attached to the instance.
  const { sequelize } = await import('../src/models/index.js');
  await sequelize.authenticate();
  await sequelize.sync({ force: true, match: /_test$/ });

  return async function teardown() {
    await sequelize.drop();
    await sequelize.close();
  };
}
