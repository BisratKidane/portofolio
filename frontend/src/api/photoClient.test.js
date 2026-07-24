import { describe, it, expect, beforeEach } from 'vitest';
import { attachAuthHeader } from './photoClient.js';

beforeEach(() => {
  localStorage.clear();
});

describe('attachAuthHeader', () => {
  it('adds Authorization: Bearer <token> when a token is stored', () => {
    localStorage.setItem('authToken', 'my-token');

    const config = attachAuthHeader({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer my-token');
  });

  it('leaves headers.Authorization unset when no token is stored', () => {
    const config = attachAuthHeader({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });
});
