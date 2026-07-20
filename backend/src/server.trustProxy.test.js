import { describe, it, expect, beforeEach } from 'vitest';
import { httpClient } from '../test/helpers.js';
import { resetRateLimitStore } from './utils/rateLimitStore.js';

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
    }
  }
`;

function loginRequest(forwardedFor) {
  return httpClient()
    .post('/graphql')
    .set('X-Forwarded-For', forwardedFor)
    .send({
      query: LOGIN_MUTATION,
      variables: { email: 'nobody@example.com', password: 'WrongPassword!' }
    });
}

describe('trust proxy + rate limiting over HTTP', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('honors only the single trusted rightmost hop: forging different prefixes cannot bypass or reset the derived clientIp budget', async () => {
    let res;
    for (let i = 1; i <= 6; i += 1) {
      res = await loginRequest(`203.0.113.${i}, 198.51.100.77`);
    }

    expect(res.body.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });

  it('isolates budgets correctly per real (trusted) client IP', async () => {
    const res = await loginRequest('203.0.113.99, 198.51.100.88');

    expect(res.body.errors[0].extensions?.code).not.toBe('TOO_MANY_REQUESTS');
  });
});
