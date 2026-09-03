import { describe, it, expect } from 'vitest';
import { assertRegistrationEmail, MAX_EMAIL_LENGTH } from './emailPolicy.js';
import { models } from '../models/index.js';

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

  it('does not throw for a normalized value at exactly 254 characters (upper boundary, RFC 5321 practical email length limit -- see emailPolicy.js header comment), padded on the domain, not the local part (CR-01 gap-closure: a local-part-padded 242-char local part is itself invalid, >64 chars)', () => {
    const email = `${'k'.repeat(10)}@${'k.'.repeat(120)}com`;
    expect(email).toHaveLength(254);
    expect(() => assertRegistrationEmail(email)).not.toThrow();
  });

  it('throws for a normalized value at 255 characters', () => {
    const email = `${'a'.repeat(243)}@example.com`;
    expect(email).toHaveLength(255);
    expect(() => assertRegistrationEmail(email)).toThrow('Email must be 254 characters or fewer.');
  });

  it('throws "Enter a valid email address." for a missing-TLD address, not a required/TypeError (32-VERIFICATION.md reproduction)', () => {
    expect(() => assertRegistrationEmail('ada@exmaple')).toThrow('Enter a valid email address.');
  });

  it('throws for an address with no @ at all', () => {
    expect(() => assertRegistrationEmail('adaexample.com')).toThrow('Enter a valid email address.');
  });

  it('exports MAX_EMAIL_LENGTH as 254, matching validator.isEmail\'s RFC 5321 practical length limit rather than the wider VARCHAR(255) column', () => {
    expect(MAX_EMAIL_LENGTH).toBe(254);
  });
});

// CR-01 gap-closure: the old hand-rolled EMAIL_FORMAT regex accepted every one
// of these 8 inputs, but models.User's `validate: { isEmail: true }` (backed
// by the same `validator` package assertRegistrationEmail now imports
// directly) rejects all of them. Each one used to flow past the guard, into
// models.User.create, throw inside the guarded try/catch, and be silently
// swallowed into the identical uniform success message -- leaving the
// registrant waiting forever for a verification email that would never
// arrive. See 32-REVIEW.md CR-01.
describe('assertRegistrationEmail (CR-01 divergent inputs)', () => {
  const divergentInputs = [
    'ada@gmail..com',
    'ada..lovelace@gmail.com',
    '.ada@gmail.com',
    'ada@gmail.com.',
    'ada@exam_ple.com',
    'ada@-example.com',
    'a@b.c',
    `${'a'.repeat(65)}@example.com`
  ];

  it.each(divergentInputs)('rejects %s with "Enter a valid email address."', (input) => {
    expect(() => assertRegistrationEmail(input)).toThrow('Enter a valid email address.');
  });
});

// CR-01's core requirement: assertRegistrationEmail and models.User's
// isEmail validator must never disagree, proven directly against the real
// model (not a re-implementation of either validator). For every input
// where the guard does not throw, models.User must also accept it; for
// every input where the guard throws, models.User must also reject it.
describe('guard <-> model agreement (CR-01)', () => {
  const cases = [
    // 8 confirmed CR-01 divergent inputs: guard now rejects, model also rejects.
    { input: 'ada@gmail..com', shouldAccept: false },
    { input: 'ada..lovelace@gmail.com', shouldAccept: false },
    { input: '.ada@gmail.com', shouldAccept: false },
    { input: 'ada@gmail.com.', shouldAccept: false },
    { input: 'ada@exam_ple.com', shouldAccept: false },
    { input: 'ada@-example.com', shouldAccept: false },
    { input: 'a@b.c', shouldAccept: false },
    { input: `${'a'.repeat(65)}@example.com`, shouldAccept: false },
    // Valid inputs: guard accepts, model must also accept.
    { input: 'ada@example.com', shouldAccept: true },
    { input: ' ADA@Example.COM ', shouldAccept: true },
    { input: 'ada@mail.example.com', shouldAccept: true },
    { input: `${'k'.repeat(10)}@${'k.'.repeat(120)}com`, shouldAccept: true }
  ];

  it.each(cases)('$input -> shouldAccept=$shouldAccept agrees between guard and model', async ({ input, shouldAccept }) => {
    if (shouldAccept) {
      let result;
      expect(() => {
        result = assertRegistrationEmail(input);
      }).not.toThrow();

      const built = models.User.build({ email: result });
      await expect(built.validate({ fields: ['email'] })).resolves.not.toThrow();
    } else {
      expect(() => assertRegistrationEmail(input)).toThrow();

      const built = models.User.build({ email: input });
      await expect(built.validate({ fields: ['email'] })).rejects.toThrow();
    }
  });
});
