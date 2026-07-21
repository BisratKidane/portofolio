import { sequelize } from '../config/database.js';
import { initUser } from './User.js';
import { initFamilyMember } from './FamilyMember.js';

const User = initUser(sequelize);
const FamilyMember = initFamilyMember(sequelize);

export const models = {
  User,
  FamilyMember
};

export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
}

export { sequelize };
