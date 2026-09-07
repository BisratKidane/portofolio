// Pure, dependency-free client-side validators for the signup form (REG-01).
//
// D-04 (33-CONTEXT.md): validation here must never be more permissive than
// the real backend policy modules it mirrors. A human-maintained comment
// alone is NOT sufficient proof of agreement -- Phase 32's CR-01 shipped
// exactly that failure mode (a client-side guard more permissive than the
// server, surviving TDD + mutation testing because every test checked the
// guard against itself). The actual gate is Register.validation.test.js,
// which imports the real backend/src/utils/{emailPolicy,namePolicy,
// relationshipNotePolicy,passwordPolicy}.js functions and asserts
// client-accepts => server-accepts over a fixture table. This file itself
// must stay a pure module with zero dependencies -- safe for the production
// bundle, and never imports anything from backend/.

// Matches backend/src/utils/namePolicy.js's MAX_NAME_LENGTH.
export const MAX_NAME_LENGTH = 255;

// Matches backend/src/utils/emailPolicy.js's MAX_EMAIL_LENGTH.
export const MAX_EMAIL_LENGTH = 254;

// Matches backend/src/utils/passwordPolicy.js's assertPasswordStrength minimum.
export const MIN_PASSWORD_LENGTH = 8;

// Matches backend/src/utils/relationshipNotePolicy.js's assertRelationshipNoteLength cap.
export const MAX_RELATIONSHIP_NOTE_LENGTH = 500;

// Practical email-shape check. Does not need to be byte-identical to
// backend/src/utils/emailPolicy.js's validator.isEmail -- only needs to
// agree with it on the fixture values Register.validation.test.js asserts
// against (33-01-PLAN.md Task 1 behavior spec).
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFullName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { valid: false, message: 'Enter your name.' };
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { valid: false, message: 'Name must be 255 characters or fewer.' };
  }
  return { valid: true, message: null };
}

export function validateEmail(email) {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) return { valid: false, message: 'Enter your email address.' };
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, message: 'Email must be 254 characters or fewer.' };
  }
  if (!EMAIL_FORMAT.test(trimmed)) {
    return { valid: false, message: 'Enter a valid email address.' };
  }
  return { valid: true, message: null };
}

export function validatePassword(password) {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  return { valid: true, message: null };
}

// Requiredness is a UI-only rule layered on top of a server rule that
// permits empty (backend/src/utils/relationshipNotePolicy.js has no
// requiredness check -- Phase 32 D-06 made the note optional). A stricter
// client rule on top of a permissive server rule is not a D-04 violation;
// only a more permissive client rule would be. See 33-UI-SPEC.md's
// Validation Contract table.
export function validateRelationshipNote(note) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) return { valid: false, message: "Tell us how you're related to the family." };
  if (trimmed.length > MAX_RELATIONSHIP_NOTE_LENGTH) {
    return { valid: false, message: 'Relationship note must be 500 characters or fewer.' };
  }
  return { valid: true, message: null };
}
