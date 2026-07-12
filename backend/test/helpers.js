import request from 'supertest';
import { ApolloServer } from '@apollo/server';
import { models } from '../src/models/index.js';
import { typeDefs } from '../src/schemas/index.js';
import { resolvers } from '../src/resolvers/index.js';
import { app } from '../src/server.js';

const server = new ApolloServer({ typeDefs, resolvers });

export function httpClient() {
  return request(app);
}

export async function graphql(query, variables, user = null) {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user } }
  );
  return response.body.singleResult;
}

export async function resetTables() {
  await models.User.destroy({ where: {}, truncate: true });
}

export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    ...overrides
  });
}
