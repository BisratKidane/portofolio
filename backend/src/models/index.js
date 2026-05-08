import { sequelize } from '../config/database.js';
import { initUser } from './User.js';

const User = initUser(sequelize);

export const models = {
  User
};

export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
}

export { sequelize };
