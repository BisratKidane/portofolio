import { describe, it, expect, beforeEach } from 'vitest';
import { enforceRateLimit } from './rateLimitPlugin.js';
import { resetRateLimitStore } from '../utils/rateLimitStore.js';

describe('enforceRateLimit', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('never throttles a field that is not a key in RATE_LIMITS, no matter how many times it is called', () => {
    const clientIp = '10.0.0.1';
    for (let i = 0; i < 20; i += 1) {
      expect(() => enforceRateLimit(clientIp, ['me'])).not.toThrow();
    }
    for (let i = 0; i < 20; i += 1) {
      expect(() => enforceRateLimit(clientIp, ['dashboard'])).not.toThrow();
    }
    for (let i = 0; i < 20; i += 1) {
      expect(() => enforceRateLimit(clientIp, ['logout'])).not.toThrow();
    }
  });

  it('allows exactly max attempts for a configured field, then throws on the next attempt', () => {
    const clientIp = '10.0.0.2';
    for (let i = 0; i < 5; i += 1) {
      expect(() => enforceRateLimit(clientIp, ['login'])).not.toThrow();
    }
    expect(() => enforceRateLimit(clientIp, ['login'])).toThrow();
  });

  it('throws a GraphQLError with exactly the generic message and TOO_MANY_REQUESTS code, nothing else', () => {
    const clientIp = '10.0.0.3';
    for (let i = 0; i < 5; i += 1) {
      enforceRateLimit(clientIp, ['login']);
    }

    let caught;
    try {
      enforceRateLimit(clientIp, ['login']);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(caught.message).toBe('Too many requests. Please try again later.');
    expect(caught.extensions.code).toBe('TOO_MANY_REQUESTS');
    expect(Object.keys(caught.extensions)).toHaveLength(1);
  });

  it('isolates counters between different clientIp values for the same configured field', () => {
    const ipA = '10.0.0.4';
    const ipB = '10.0.0.5';

    for (let i = 0; i < 5; i += 1) {
      enforceRateLimit(ipA, ['login']);
    }
    expect(() => enforceRateLimit(ipA, ['login'])).toThrow();

    for (let i = 0; i < 5; i += 1) {
      expect(() => enforceRateLimit(ipB, ['login'])).not.toThrow();
    }
  });

  it('isolates counters between different configured fields for the same clientIp', () => {
    const clientIp = '10.0.0.6';

    for (let i = 0; i < 5; i += 1) {
      enforceRateLimit(clientIp, ['login']);
    }
    expect(() => enforceRateLimit(clientIp, ['login'])).toThrow();

    for (let i = 0; i < 5; i += 1) {
      expect(() => enforceRateLimit(clientIp, ['register'])).not.toThrow();
    }
  });
});
