import { describe, it, expect } from 'vitest';
import { assertRegistrationEmail, MAX_EMAIL_LENGTH } from './emailPolicy.js';

describe('assertRegistrationEmail', () => {
  it('does not throw for a well-formed email and returns it normalized (lowercased, trimmed)', () => {
    expect(assertRegistrationEmail(' ADA@Example.com ')).toBe('ada@example.com');
  });

  it('accepts an email with a subdomain', () => {
    expect(() => assertRegistrationEmail('ada@mail.example.com')).not.toThrow();
  });

  it('throws for an empty string', () => {
    expect(() => assertRegistrationEmail('')).toThrow('Email is required.');
  });

  it('throws for a whitespace-only string', () => {
    expect(() => assertRegistrationEmail('   ')).toThrow('Email is required.');
  });

  it('throws for null (coerced via String(email ?? \'\'), not a TypeError)', () => {
    expect(() => assertRegistrationEmail(null)).toThrow('Email is required.');
  });

  it('throws for undefined (coerced via String(email ?? \'\'), not a TypeError)', () => {
    expect(() => assertRegistrationEmail(undefined)).toThrow('Email is required.');
  });

  it('does not throw for a normalized value at exactly 255 characters (upper boundary)', () => {
    const email = `${'a'.repeat(243)}@example.com`;
    expect(email).toHaveLength(255);
    expect(() => assertRegistrationEmail(email)).not.toThrow();
  });

  it('throws for a normalized value at 256 characters', () => {
    const email = `${'a'.repeat(244)}@example.com`;
    expect(email).toHaveLength(256);
    expect(() => assertRegistrationEmail(email)).toThrow('Email must be 255 characters or fewer.');
  });

  it('throws "Enter a valid email address." for a missing-TLD address, not a required/TypeError (32-VERIFICATION.md reproduction)', () => {
    expect(() => assertRegistrationEmail('ada@exmaple')).toThrow('Enter a valid email address.');
  });

  it('throws for an address with no @ at all', () => {
    expect(() => assertRegistrationEmail('adaexample.com')).toThrow('Enter a valid email address.');
  });

  it('exports MAX_EMAIL_LENGTH as 255 to match users.email\'s VARCHAR(255) column', () => {
    expect(MAX_EMAIL_LENGTH).toBe(255);
  });
});
