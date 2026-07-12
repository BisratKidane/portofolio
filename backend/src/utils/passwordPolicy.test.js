import { describe, it, expect } from 'vitest';
import { assertPasswordStrength } from './passwordPolicy.js';

describe('assertPasswordStrength', () => {
  it('throws for a password shorter than 8 characters', () => {
    expect(() => assertPasswordStrength('short')).toThrow('Password must be at least 8 characters.');
  });

  it('does not throw for a password exactly 8 characters long (boundary case)', () => {
    expect(() => assertPasswordStrength('12345678')).not.toThrow();
  });

  it('does not throw for a long password with mixed case and digits (no max length, no composition rules)', () => {
    expect(() => assertPasswordStrength('ThisIsAReallyLongPassword123')).not.toThrow();
  });
});
