import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Op } from 'sequelize';
import { models } from '../models/index.js';
import { graphql, resetTables, resetRateLimitStore, createTestUser } from '../../test/helpers.js';

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id role }
    }
  }
`;

const RENAMED_LOGIN_MUTATION = `
  mutation NotLogin($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
    }
  }
`;

const INLINE_FRAGMENT_LOGIN_MUTATION = `
  mutation InlineFragmentLogin($email: String!, $password: String!) {
    ... on Mutation {
      login(email: $email, password: $password) {
        token
      }
    }
  }
`;

const NAMED_FRAGMENT_LOGIN_MUTATION = `
  mutation NamedFragmentLogin($email: String!, $password: String!) {
    ...LoginFields
  }

  fragment LoginFields on Mutation {
    login(email: $email, password: $password) {
      token
    }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      message
    }
  }
`;

const REQUEST_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
      role
    }
  }
`;

const DASHBOARD_QUERY = `
  query Dashboard {
    dashboard {
      message
      user { id role }
      users { id }
    }
  }
`;

const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Please try again later.';

beforeEach(async () => {
  await resetTables();
  resetRateLimitStore();
});

describe('login rate limiting (RATE-01)', () => {
  it('rejects the 6th login attempt from the same IP within the window, regardless of credential validity', async () => {
    const clientIp = '10.10.10.1';

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        LOGIN_MUTATION,
        { email: 'nobody@example.com', password: 'wrong' },
        null,
        clientIp
      );
      expect(response.errors[0].message).toBe('Invalid email or password.');
    }

    const sixthResponse = await graphql(
      LOGIN_MUTATION,
      { email: 'nobody@example.com', password: 'wrong' },
      null,
      clientIp
    );
    expect(sixthResponse.errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(sixthResponse.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });

  it('is keyed by the invoked field, not the client-supplied operation name', async () => {
    const clientIp = '10.10.11.1';

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        RENAMED_LOGIN_MUTATION,
        { email: 'nobody@example.com', password: 'wrong' },
        null,
        clientIp
      );
      expect(response.errors[0].message).toBe('Invalid email or password.');
    }

    const sixthResponse = await graphql(
      RENAMED_LOGIN_MUTATION,
      { email: 'nobody@example.com', password: 'wrong' },
      null,
      clientIp
    );
    expect(sixthResponse.errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(sixthResponse.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('fragment bypass resistance (RATE-01 / CR-01)', () => {
  it('throttles login wrapped in an inline fragment', async () => {
    const clientIp = '10.10.12.1';

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        INLINE_FRAGMENT_LOGIN_MUTATION,
        { email: 'nobody@example.com', password: 'wrong' },
        null,
        clientIp
      );
      expect(response.errors[0].message).toBe('Invalid email or password.');
    }

    const sixthResponse = await graphql(
      INLINE_FRAGMENT_LOGIN_MUTATION,
      { email: 'nobody@example.com', password: 'wrong' },
      null,
      clientIp
    );
    expect(sixthResponse.errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(sixthResponse.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });

  it('throttles login invoked through a named fragment spread', async () => {
    const clientIp = '10.10.13.1';

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        NAMED_FRAGMENT_LOGIN_MUTATION,
        { email: 'nobody@example.com', password: 'wrong' },
        null,
        clientIp
      );
      expect(response.errors[0].message).toBe('Invalid email or password.');
    }

    const sixthResponse = await graphql(
      NAMED_FRAGMENT_LOGIN_MUTATION,
      { email: 'nobody@example.com', password: 'wrong' },
      null,
      clientIp
    );
    expect(sixthResponse.errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(sixthResponse.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('register rate limiting (RATE-02)', () => {
  it('rejects the 6th register attempt from the same IP within the window', async () => {
    const clientIp = '10.10.20.1';
    const responses = [];

    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await graphql(
          REGISTER_MUTATION,
          { name: 'X', email: `rl-user-${i}@example.com`, password: 'Password123!' },
          null,
          clientIp
        )
      );
    }

    for (let i = 0; i < 5; i += 1) {
      expect(responses[i].errors).toBeUndefined();
    }
    expect(responses[5].errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);

    const createdCount = await models.User.count({
      where: { email: { [Op.like]: 'rl-user-%@example.com' } }
    });
    expect(createdCount).toBe(5);
  });
});

describe('requestPasswordReset rate limiting (RATE-03)', () => {
  it('rejects the 6th reset request from the same IP within the window', async () => {
    const clientIp = '10.10.30.1';
    const responses = [];

    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await graphql(REQUEST_RESET_MUTATION, { email: 'whoever@example.com' }, null, clientIp)
      );
    }

    for (let i = 0; i < 5; i += 1) {
      expect(responses[i].errors).toBeUndefined();
      expect(responses[i].data.requestPasswordReset.message).toBe(
        'If the account exists, a password reset link has been sent.'
      );
    }
    expect(responses[5].errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });
});

describe('normal queries are unaffected (RATE-04)', () => {
  it('never throttles an interleaved me/dashboard burst sharing an IP with an exhausted login budget', async () => {
    const clientIp = '10.10.40.1';
    const user = await createTestUser({ role: 'ADMIN' });

    const responses = [];
    for (let i = 0; i < 5; i += 1) {
      await graphql(
        LOGIN_MUTATION,
        { email: 'nobody@example.com', password: 'wrong' },
        null,
        clientIp
      );
      responses.push(await graphql(ME_QUERY, {}, user, clientIp));
      responses.push(await graphql(ME_QUERY, {}, user, clientIp));
      responses.push(await graphql(DASHBOARD_QUERY, {}, user, clientIp));
      responses.push(await graphql(DASHBOARD_QUERY, {}, user, clientIp));
    }

    expect(responses).toHaveLength(20);
    for (const response of responses) {
      expect(response.errors).toBeUndefined();
    }
  });
});

describe('no enumeration oracle (RATE-05)', () => {
  it('breaches on the identical attempt number with the identical message for a real account and a nonexistent one', async () => {
    await createTestUser({ email: 'rl-real@example.com' });

    const realIp = '10.10.50.1';
    const nonexistentIp = '10.10.50.2';

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        LOGIN_MUTATION,
        { email: 'rl-real@example.com', password: 'Password123!' },
        null,
        realIp
      );
      expect(response.errors).toBeUndefined();
      expect(response.data.login.token).toBeTruthy();
    }

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        LOGIN_MUTATION,
        { email: 'rl-nonexistent@example.com', password: 'whatever' },
        null,
        nonexistentIp
      );
      expect(response.errors[0].message).toBe('Invalid email or password.');
    }

    const realSixth = await graphql(
      LOGIN_MUTATION,
      { email: 'rl-real@example.com', password: 'Password123!' },
      null,
      realIp
    );
    const nonexistentSixth = await graphql(
      LOGIN_MUTATION,
      { email: 'rl-nonexistent@example.com', password: 'whatever' },
      null,
      nonexistentIp
    );

    expect(realSixth.errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(realSixth.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
    expect(nonexistentSixth.errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(nonexistentSixth.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('window expiry', () => {
  afterEach(() => vi.useRealTimers());

  it('allows a new attempt once the window has fully elapsed', async () => {
    const clientIp = '10.10.60.1';

    for (let i = 0; i < 5; i += 1) {
      const response = await graphql(
        LOGIN_MUTATION,
        { email: 'nobody@example.com', password: 'wrong' },
        null,
        clientIp
      );
      expect(response.errors[0].message).toBe('Invalid email or password.');
    }

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1000);

    const afterWindowResponse = await graphql(
      LOGIN_MUTATION,
      { email: 'nobody@example.com', password: 'wrong' },
      null,
      clientIp
    );
    expect(afterWindowResponse.errors[0].message).toBe('Invalid email or password.');
  });
});
