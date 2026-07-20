import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndIncrement, resetRateLimitStore } from './rateLimitStore.js';

beforeEach(() => resetRateLimitStore());

describe('checkAndIncrement', () => {
  it('allows up to max attempts within the same window, then rejects the next one', () => {
    expect(checkAndIncrement('k1', 3, 1000, 1000)).toBe(true);
    expect(checkAndIncrement('k1', 3, 1000, 1000)).toBe(true);
    expect(checkAndIncrement('k1', 3, 1000, 1000)).toBe(true);
    expect(checkAndIncrement('k1', 3, 1000, 1000)).toBe(false);
  });

  it('never shares a counter between two independent keys (D-01)', () => {
    expect(checkAndIncrement('k1', 1, 1000, 1000)).toBe(true);
    expect(checkAndIncrement('k2', 1, 1000, 1000)).toBe(true);
  });

  it('resets the counter once the window has fully elapsed, via an injectable clock', () => {
    expect(checkAndIncrement('k1', 1, 1000, 1000)).toBe(true);
    expect(checkAndIncrement('k1', 1, 1000, 1000)).toBe(false);

    expect(checkAndIncrement('k1', 1, 1000, 2001)).toBe(true);
  });

  it('resetRateLimitStore() clears all counters immediately, mid-window', () => {
    expect(checkAndIncrement('k1', 1, 1000, 1000)).toBe(true);
    expect(checkAndIncrement('k1', 1, 1000, 1000)).toBe(false);

    resetRateLimitStore();

    expect(checkAndIncrement('k1', 1, 1000, 1000)).toBe(true);
  });

  it('defaults `now` to Date.now() when no 4th argument is passed', () => {
    expect(checkAndIncrement('k5', 1, 60000)).toBe(true);
  });
});
