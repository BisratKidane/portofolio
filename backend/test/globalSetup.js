import { assertTestDatabase } from './guard.js';

export default async function setup() {
  assertTestDatabase();

  const { sequelize } = await import('../src/config/database.js');
  await sequelize.authenticate();
  await sequelize.sync({ force: true, match: /_test$/ });

  return async function teardown() {
    await sequelize.drop();
    await sequelize.close();
  };
}
