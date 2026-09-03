// Gap 3 (32-VERIFICATION.md Truth 8, new this round / 32-REVIEW.md CR-02
// second-round numbering): mirrors namePolicy.js's shape so `email` gets the
// same pre-try, actionable-error treatment `name` and `relationshipNote`
// already get on the tokenless register branch. Before this, email format
// (Sequelize's `isEmail` validator) and length (the `VARCHAR(255)` column)
// were left to the model layer, which throws INSIDE the guarded try/catch
// and is swallowed by the catch-all into the identical uniform success
// message -- silently dropping a malformed-email self-registration forever,
// with no signal to the registrant (e.g. a plain missing-TLD typo like
// "ada@exmaple").
//
// The format check below is a standalone regex, not `validator`'s
// implementation (the package Sequelize's own `isEmail` validator uses
// internally). `validator` is only a transitive dependency today (pulled in
// by `sequelize`), not declared in backend/package.json's own
// `dependencies`; importing it directly here would be a phantom dependency.
//
// This is explicitly NOT an enumeration/SEC-01 concern: format and length
// depend only on the caller's own input, never on whether an account
// already exists at that address, so this check belongs alongside the
// name/note guards outside the guarded try block, not inside it -- it
// cannot be used to distinguish a taken address from a free one.
//
// MAX_EMAIL_LENGTH is 254, not the users.email column's VARCHAR(255) width:
// Sequelize's own `isEmail: true` model validator (backed by the
// `validator` package's isEmail, transitively pulled in by sequelize)
// enforces RFC 5321's practical 254-character total-address limit
// regardless of column width, and rejects anything longer even though the
// column would happily store it. A 255-character, format-valid email would
// pass a naive <=255 check here, then fail Sequelize's own isEmail
// validation INSIDE the guarded try/catch -- reopening exactly the
// silent-drop gap this utility exists to close, just for one specific
// length instead of "any overlong email". Confirmed empirically against the
// installed `validator` version: 254 chars accepted, 255 rejected,
// independent of local-part length (itself capped at 64 by the same rule).
export const MAX_EMAIL_LENGTH = 254;

const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 254 characters or fewer.');
  if (!EMAIL_FORMAT.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
