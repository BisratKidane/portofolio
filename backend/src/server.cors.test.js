import { describe, it, expect } from 'vitest';
import { httpClient } from '../test/helpers.js';
import { env } from './config/env.js';

const HEALTH_QUERY = '{ __typename }';

describe('CORS rejection over HTTP', () => {
  it('never echoes a rejected origin back to the client in the body or headers', async () => {
    const res = await httpClient()
      .post('/graphql')
      .set('Origin', 'https://evil.example')
      .send({ query: HEALTH_QUERY });

    const serialized = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(serialized).not.toContain('evil.example');
  });

  it('still allows an allowlisted origin to succeed', async () => {
    const allowedOrigin = env.clientOrigins[0];

    const res = await httpClient()
      .post('/graphql')
      .set('Origin', allowedOrigin)
      .send({ query: HEALTH_QUERY });

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.status).toBe(200);
  });
});
