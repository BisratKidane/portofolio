import { describe, it, expect, vi } from 'vitest';
import { corsOriginValidator } from './corsOptions.js';

describe('corsOriginValidator', () => {
  it('allows requests with no Origin header', () => {
    const callback = vi.fn();

    corsOriginValidator(undefined, callback, { clientOrigins: ['http://localhost:5173'] });

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows an allowlisted origin', () => {
    const callback = vi.fn();

    corsOriginValidator('http://localhost:5173', callback, { clientOrigins: ['http://localhost:5173'] });

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects a non-allowlisted origin with the fixed client message, never echoing the real origin', () => {
    const callback = vi.fn();

    corsOriginValidator('https://evil.example', callback, { clientOrigins: ['http://localhost:5173'] });

    expect(callback).toHaveBeenCalledTimes(1);
    const [err, allowed] = callback.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not allowed by CORS.');
    expect(err.message).not.toContain('evil.example');
    expect(allowed).toBeUndefined();
  });
});
