import request from 'supertest';
import { ApolloServer } from '@apollo/server';
import { models, sequelize } from '../src/models/index.js';
import { typeDefs, resolvers, validationRules } from '../src/graphql/serverConfig.js';
import { app } from '../src/server.js';
import { rateLimitPlugin } from '../src/plugins/rateLimitPlugin.js';
import { resetRateLimitStore } from '../src/utils/rateLimitStore.js';

const server = new ApolloServer({ typeDefs, resolvers, validationRules, plugins: [rateLimitPlugin] });

export function httpClient() {
  return request(app);
}

export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp } }
  );
  return response.body.singleResult;
}

export async function resetTables() {
  // MySQL forbids TRUNCATE on any table still referenced by a foreign key
  // (family_members self-references itself via motherId/fatherId, and
  // spouses references family_members), even once the referencing rows are
  // gone. Disabling FK checks around the truncate sequence is the standard
  // pattern for FK-constrained test resets.
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await models.Spouse.destroy({ where: {}, truncate: true });
  await models.FamilyMember.destroy({ where: {}, truncate: true });
  await models.User.destroy({ where: {}, truncate: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
}

export { resetRateLimitStore };

export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    emailVerified: true,
    ...overrides
  });
}
