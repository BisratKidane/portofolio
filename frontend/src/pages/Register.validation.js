import isEmail from 'validator/lib/isEmail.js';

// Client-side validators for the signup form (REG-01).
//
// D-04 (33-CONTEXT.md): validation here must never be more permissive than
// the real backend policy modules it mirrors. A human-maintained comment
// alone is NOT sufficient proof of agreement -- Phase 32's CR-01 shipped
// exactly that failure mode (a client-side guard more permissive than the
// server, surviving TDD + mutation testing because every test checked the
// guard against itself). The actual gate is Register.validation.test.js,
// which imports the real backend/src/utils/{emailPolicy,namePolicy,
// relationshipNotePolicy,passwordPolicy}.js functions and asserts
// client-accepts => server-accepts over a fixture table.
//
// This file has exactly one intentional production dependency: `validator`
// (specifically `validator/lib/isEmail.js`, imported above), so validateEmail
// agrees with backend/src/utils/emailPolicy.js's assertRegistrationEmail by
// construction rather than by a hand-maintained approximation -- the prior
// hand-rolled regex was itself the CR-01 bug (33-REVIEW.md), accepting 9
// realistic email shapes the server rejects. The "never imports anything
// from backend/" boundary is unchanged and still holds -- only
// Register.validation.test.js crosses that boundary, and only at test time.

// Matches backend/src/utils/namePolicy.js's MAX_NAME_LENGTH.
export const MAX_NAME_LENGTH = 255;

// Matches backend/src/utils/emailPolicy.js's MAX_EMAIL_LENGTH.
export const MAX_EMAIL_LENGTH = 254;

// Matches backend/src/utils/passwordPolicy.js's assertPasswordStrength minimum.
export const MIN_PASSWORD_LENGTH = 8;

// Matches backend/src/utils/relationshipNotePolicy.js's assertRelationshipNoteLength cap.
export const MAX_RELATIONSHIP_NOTE_LENGTH = 500;

// Checked during CR-02 gap closure (33-REVIEW.md) for the same raw/trimmed
// mismatch class fixed below in validateRelationshipNote, and found NOT to
// apply: backend/src/utils/namePolicy.js's assertRegistrationName trims
// before both its length check and before returning the value used for
// storage (user.resolver.js's cleanName), matching this function's own
// trim-then-check order exactly. No divergence to fix here -- do not re-open.
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
  if (!isEmail(trimmed)) {
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
  const raw = String(note ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, message: "Tell us how you're related to the family." };
  // CR-02 (33-REVIEW.md): the cap check runs against the raw, untrimmed
  // value -- the same value Register.jsx actually submits and
  // relationshipNotePolicy.js's assertRelationshipNoteLength actually
  // checks (also raw, untrimmed). Checking `trimmed.length` here let a
  // 500-char note plus trailing whitespace pass client-side and fail
  // server-side.
  if (raw.length > MAX_RELATIONSHIP_NOTE_LENGTH) {
    return { valid: false, message: 'Relationship note must be 500 characters or fewer.' };
  }
  return { valid: true, message: null };
}
