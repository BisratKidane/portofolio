import { describe, it, expect } from 'vitest';
import { env } from './env.js';
import { requiredPositiveInt } from './requiredPositiveInt.js';

describe('MAX_QUERY_DEPTH parsing (CR-03/CR-04)', () => {
  it('resolves to the concrete bound of 12, not a permissive fallback', () => {
    expect(env.maxQueryDepth).toBe(12);
  });

  it('falls back to the supplied default when the variable is unset or empty', () => {
    expect(requiredPositiveInt(undefined, 12, 'MAX_QUERY_DEPTH')).toBe(12);
    expect(requiredPositiveInt('', 12, 'MAX_QUERY_DEPTH')).toBe(12);
  });

  it('accepts an explicit positive integer', () => {
    expect(requiredPositiveInt('8', 12, 'MAX_QUERY_DEPTH')).toBe(8);
  });

  it('fails fast rather than failing open on a malformed value', () => {
    // The old `Number(process.env.MAX_QUERY_DEPTH || 100)` yielded NaN here,
    // and `depth > NaN` is always false -- silently disabling the rule.
    expect(() => requiredPositiveInt('unlimited', 12, 'MAX_QUERY_DEPTH')).toThrow(
      /MAX_QUERY_DEPTH must be a positive integer/
    );
    expect(() => requiredPositiveInt('12 ', 12, 'MAX_QUERY_DEPTH')).not.toThrow();
    expect(() => requiredPositiveInt('1.5', 12, 'MAX_QUERY_DEPTH')).toThrow(
      /MAX_QUERY_DEPTH must be a positive integer/
    );
  });

  it('fails fast on 0 and negatives rather than inverting them to the most permissive value', () => {
    expect(() => requiredPositiveInt('0', 12, 'MAX_QUERY_DEPTH')).toThrow(
      /MAX_QUERY_DEPTH must be a positive integer/
    );
    expect(() => requiredPositiveInt('-1', 12, 'MAX_QUERY_DEPTH')).toThrow(
      /MAX_QUERY_DEPTH must be a positive integer/
    );
  });
});
