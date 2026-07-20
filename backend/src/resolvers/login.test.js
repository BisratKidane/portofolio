import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id role }
    }
  }
`;

beforeEach(resetTables);

describe('login', () => {
  it('returns a verifiable JWT for valid credentials', async () => {
    const user = await createTestUser({ email: 'ada@example.com', role: 'ADMIN' });

    const { data, errors } = await graphql(LOGIN_MUTATION, {
      email: 'ada@example.com',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();

    const payload = jwt.verify(data.login.token, env.jwtSecret);
    expect(payload.sub).toBe(Number(user.id));
    expect(payload.role).toBe('ADMIN');
  });

  it('rejects the correct email with the wrong password', async () => {
    await createTestUser({ email: 'bob@example.com' });

    const { data, errors } = await graphql(LOGIN_MUTATION, {
      email: 'bob@example.com',
      password: 'WrongPassword!'
    });

    expect(errors[0].message).toBe('Invalid email or password.');
    expect(data).toBeNull();
  });

  it('rejects an email with no matching user, with the identical message', async () => {
    const { data, errors } = await graphql(LOGIN_MUTATION, {
      email: 'nobody@example.com',
      password: 'Password123!'
    });

    expect(errors[0].message).toBe('Invalid email or password.');
    expect(data).toBeNull();
  });

  it('rejects a correct password for an unverified account', async () => {
    await createTestUser({ email: 'unverified@example.com', emailVerified: false });

    const { data, errors } = await graphql(LOGIN_MUTATION, {
      email: 'unverified@example.com',
      password: 'Password123!'
    });

    expect(errors[0].message).toBe('Please verify your email before signing in.');
    expect(data).toBeNull();
  });

  it('rejects a wrong password for an unverified account with the credentials message, not the verify message', async () => {
    await createTestUser({ email: 'unverified@example.com', emailVerified: false });

    const { data, errors } = await graphql(LOGIN_MUTATION, {
      email: 'unverified@example.com',
      password: 'WrongPassword!'
    });

    expect(errors[0].message).toBe('Invalid email or password.');
    expect(data).toBeNull();
  });
});
