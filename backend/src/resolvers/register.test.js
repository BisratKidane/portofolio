import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      token
      user { id name email role }
    }
  }
`;

beforeEach(resetTables);

describe('register', () => {
  it('makes the first registrant ADMIN and persists a hashed password', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();
    expect(data.register.user.role).toBe('ADMIN');

    const payload = jwt.verify(data.register.token, env.jwtSecret);
    expect(payload.role).toBe('ADMIN');
    expect(payload.sub).toBe(Number(data.register.user.id));

    const row = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(row.passwordHash).not.toBe('Password123!');
    await expect(row.validatePassword('Password123!')).resolves.toBe(true);
  });

  it('makes subsequent registrants USER', async () => {
    await createTestUser();

    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Bob',
      email: 'bob@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();
    expect(data.register.user.role).toBe('USER');
  });

  it('rejects a duplicate email with the exact API-contract message', async () => {
    await createTestUser({ email: 'dup@example.com' });

    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Dup',
      email: 'dup@example.com',
      password: 'Password123!'
    });

    expect(errors[0].message).toBe('A user with this email already exists.');
    expect(data).toBeNull();
  });

  // Exercises Sequelize's isEmail model validator (resolver/model-level rejection),
  // not a GraphQL schema-level rejection — the SDL only enforces String! presence.
  it('rejects a malformed email via the isEmail model validator', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Invalid',
      email: 'not-an-email',
      password: 'Password123!'
    });

    expect(errors[0].message).toBe('Validation error: Validation isEmail on email failed');
    expect(data).toBeNull();
  });
});
