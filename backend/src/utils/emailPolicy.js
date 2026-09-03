import isEmail from 'validator/lib/isEmail.js';

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
// CR-01 gap-closure: this guard front-runs `models/User.js`'s
// `validate: { isEmail: true }` (backed by the `validator` package,
// transitively pulled in by sequelize, now also a declared direct
// dependency here). It imports and calls the identical `isEmail` function
// the model uses, with default options, so the two can never disagree --
// agreement is guaranteed by construction, not approximated by a
// hand-rolled regex. The previous hand-rolled regex approach was proven by
// a code review to diverge from `validator.isEmail` on 8 realistic input
// classes: adjacent dots, a leading dot, a trailing dot after the TLD, an
// underscore in the domain, a leading hyphen in a domain label, a 1-character
// TLD, and a local part over 64 characters -- see 32-REVIEW.md CR-01. Every
// one of those passed the old regex but was then rejected by
// `models.User.create` INSIDE the guarded try/catch, where the catch-all
// silently discarded it into the identical uniform success message.
//
// This is explicitly NOT an enumeration/SEC-01 concern: format and length
// depend only on the caller's own input, never on whether an account
// already exists at that address, so this check belongs alongside the
// name/note guards outside the guarded try block, not inside it -- it
// cannot be used to distinguish a taken address from a free one.
//
// MAX_EMAIL_LENGTH is 254, not the users.email column's VARCHAR(255) width:
// Sequelize's own `isEmail: true` model validator (backed by the same
// `validator` package this guard now imports directly) enforces RFC 5321's
// practical 254-character total-address limit regardless of column width,
// and rejects anything longer even though the column would happily store
// it. MAX_EMAIL_LENGTH stays a fast-path check ahead of `isEmail` purely to
// give a specific, friendlier message ('Email must be 254 characters or
// fewer.') instead of the generic 'Enter a valid email address.' for the
// common over-length case -- this does not reintroduce disagreement because
// 254 is itself `validator.isEmail`'s own RFC 5321 practical length
// boundary. Confirmed empirically against the installed `validator`
// version: 254 chars accepted, 255 rejected, independent of local-part
// length (itself capped at 64 by the same rule).
export const MAX_EMAIL_LENGTH = 254;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 254 characters or fewer.');
  if (!isEmail(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
