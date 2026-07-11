import { ApolloServer } from '@apollo/server';
import { models } from '../src/models/index.js';
import { typeDefs } from '../src/schemas/index.js';
import { resolvers } from '../src/resolvers/index.js';

const server = new ApolloServer({ typeDefs, resolvers });

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
