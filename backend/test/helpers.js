import request from 'supertest';
import { ApolloServer } from '@apollo/server';
import { models } from '../src/models/index.js';
import { typeDefs } from '../src/schemas/index.js';
import { resolvers } from '../src/resolvers/index.js';
import { app } from '../src/server.js';
import { rateLimitPlugin } from '../src/plugins/rateLimitPlugin.js';
import { resetRateLimitStore } from '../src/utils/rateLimitStore.js';

const server = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });

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
  await models.User.destroy({ where: {}, truncate: true });
}

export { resetRateLimitStore };

export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    ...overrides
  });
}
