import { describe, it, expect } from 'vitest';
import { assertRegistrationName, MAX_NAME_LENGTH } from './namePolicy.js';

describe('assertRegistrationName', () => {
  it('does not throw for a 254-character name', () => {
    expect(() => assertRegistrationName('a'.repeat(254))).not.toThrow();
  });

  it('does not throw for a 255-character name (upper boundary)', () => {
    expect(() => assertRegistrationName('a'.repeat(255))).not.toThrow();
  });

  it('throws for a 256-character name', () => {
    expect(() => assertRegistrationName('a'.repeat(256))).toThrow('Name must be 255 characters or fewer.');
  });

  it('throws for an empty string', () => {
    expect(() => assertRegistrationName('')).toThrow('Name is required.');
  });

  it('throws for a whitespace-only string', () => {
    expect(() => assertRegistrationName('   ')).toThrow('Name is required.');
  });

  it('throws for null (coerced via String(name ?? \'\'), not a TypeError)', () => {
    expect(() => assertRegistrationName(null)).toThrow('Name is required.');
  });

  it('throws for undefined (coerced via String(name ?? \'\'), not a TypeError)', () => {
    expect(() => assertRegistrationName(undefined)).toThrow('Name is required.');
  });

  it('returns the trimmed name when leading/trailing whitespace surrounds valid content', () => {
    expect(assertRegistrationName('  Ada Lovelace  ')).toBe('Ada Lovelace');
  });

  it('coerces a non-string input to a string and evaluates it against the same rules', () => {
    // String(12345) === '12345' -- non-empty, well under the cap, so it passes
    // through unchanged (documenting actual behavior, not assumed).
    expect(assertRegistrationName(12345)).toBe('12345');
  });

  it('exports MAX_NAME_LENGTH as 255 to match users.name\'s VARCHAR(255) column', () => {
    expect(MAX_NAME_LENGTH).toBe(255);
  });
});
