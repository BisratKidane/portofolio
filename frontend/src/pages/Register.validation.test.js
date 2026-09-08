import { describe, it, expect } from 'vitest';
import {
  validateFullName,
  validateEmail,
  validatePassword,
  validateRelationshipNote
} from './Register.validation.js';
// D-04 (33-CONTEXT.md): these are the REAL backend policy modules, imported
// test-time only, never re-implemented. See Register.validation.js's header
// comment and this file's own comments below for why this import must never
// move into a production file.
import { assertRegistrationName } from '../../../backend/src/utils/namePolicy.js';
import { assertRegistrationEmail } from '../../../backend/src/utils/emailPolicy.js';
import { assertRelationshipNoteLength } from '../../../backend/src/utils/relationshipNotePolicy.js';
import { assertPasswordStrength } from '../../../backend/src/utils/passwordPolicy.js';

// Only the throw/no-throw distinction is compared against the client
// validator's `.valid` flag -- never the error message (33-01-PLAN.md's
// Task 1 behavior spec; passwordPolicy.js also raw-throws a TypeError on
// non-string input, which this helper handles identically to a policy
// Error since both are just "thrown").
function backendAccepts(fn, value) {
  try {
    fn(value);
    return true;
  } catch {
    return false;
  }
}

describe('Register.validation own-behavior', () => {
  it.each([
    ['', { valid: false, message: 'Enter your name.' }],
    ['a'.repeat(256), { valid: false, message: 'Name must be 255 characters or fewer.' }],
    ['Ada', { valid: true, message: null }]
  ])('validateFullName(%#) matches the expected result', (value, expected) => {
    expect(validateFullName(value)).toEqual(expected);
  });

  it.each([
    ['', { valid: false, message: 'Enter your email address.' }],
    ['not-an-email', { valid: false, message: 'Enter a valid email address.' }],
    [`${'a'.repeat(243)}@example.com`, { valid: false, message: 'Email must be 254 characters or fewer.' }],
    ['ada@example.com', { valid: true, message: null }]
  ])('validateEmail(%#) matches the expected result', (value, expected) => {
    expect(validateEmail(value)).toEqual(expected);
  });

  it.each([
    ['1234567', { valid: false, message: 'Password must be at least 8 characters.' }],
    ['12345678', { valid: true, message: null }]
  ])('validatePassword(%#) matches the expected result', (value, expected) => {
    expect(validatePassword(value)).toEqual(expected);
  });

  it.each([
    ['', { valid: false, message: "Tell us how you're related to the family." }],
    ['a'.repeat(501), { valid: false, message: 'Relationship note must be 500 characters or fewer.' }],
    ['a'.repeat(500), { valid: true, message: null }]
  ])('validateRelationshipNote(%#) matches the expected result', (value, expected) => {
    expect(validateRelationshipNote(value)).toEqual(expected);
  });
});

// D-04's actual gate: client-accepts must imply server-accepts, proven
// against the real backend assert* functions -- not a hand-maintained
// comment, and not the client rules checked only against themselves (the
// exact CR-01 bug class, 32-REVIEW.md). Only the boundary fixtures named in
// 33-01-PLAN.md's Task 1 behavior spec are asserted here; the relationship
// note's UI-only requiredness rule is intentionally NOT compared, since
// relationshipNotePolicy.js has no requiredness check at all (a stricter
// client rule on top of a permissive server rule is not a D-04 violation).
describe('client/server validation agreement (D-04)', () => {
  it.each([
    ['a'.repeat(255), true],
    ['a'.repeat(256), false]
  ])('name %# agrees with namePolicy.js', (value, expected) => {
    expect(validateFullName(value).valid).toBe(expected);
    expect(backendAccepts(assertRegistrationName, value)).toBe(expected);
  });

  it.each([
    ['ada@example.com', true],
    ['not-an-email', false],
    [`${'a'.repeat(243)}@example.com`, false],
    // CR-01 (33-REVIEW.md): these 9 inputs were empirically confirmed to be
    // accepted by the old hand-rolled EMAIL_FORMAT regex and rejected by the
    // real backend assertRegistrationEmail (validator.isEmail). If the client
    // regressed to a hand-rolled approximation, these rows would go RED.
    ['ada@gmail..com', false],
    ['ada..lovelace@gmail.com', false],
    ['.ada@gmail.com', false],
    ['ada@gmail.com.', false],
    ['ada@exam_ple.com', false],
    ['ada@-example.com', false],
    ['a@b.c', false],
    ['ada@[127.0.0.1]', false],
    [`${'a'.repeat(65)}@gmail.com`, false]
  ])('email %# agrees with emailPolicy.js', (value, expected) => {
    expect(validateEmail(value).valid).toBe(expected);
    expect(backendAccepts(assertRegistrationEmail, value)).toBe(expected);
  });

  it.each([
    ['12345678', true],
    ['1234567', false]
  ])('password %# agrees with passwordPolicy.js', (value, expected) => {
    expect(validatePassword(value).valid).toBe(expected);
    expect(backendAccepts(assertPasswordStrength, value)).toBe(expected);
  });

  it.each([
    ['a'.repeat(500), true],
    ['a'.repeat(501), false],
    // CR-02 (33-REVIEW.md): 500 meaningful characters plus one trailing
    // space is raw length 501. The old code trimmed before checking the cap,
    // so this passed client-side and failed server-side (raw, untrimmed
    // check in relationshipNotePolicy.js). Register.jsx submits the raw
    // value, so this is the real submitted-vs-checked mismatch, not a
    // hypothetical one.
    [`${'a'.repeat(500)} `, false]
  ])('relationship note length %# agrees with relationshipNotePolicy.js', (value, expected) => {
    expect(validateRelationshipNote(value).valid).toBe(expected);
    expect(backendAccepts(assertRelationshipNoteLength, value)).toBe(expected);
  });
});
