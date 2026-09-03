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
export const MAX_EMAIL_LENGTH = 255;

const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 255 characters or fewer.');
  if (!EMAIL_FORMAT.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
