// D-08/SEC-01 (32-05, CR-01 gap closure): caps a self-registrant's `name` at
// 255 chars to match `users.name`'s Sequelize-default VARCHAR(255) mapping
// (`User.js`), so an over-length name is rejected with a friendly message
// BEFORE it can reach `models.User.create` and surface as a raw
// `Data too long for column 'name' at row 1` DB error -- the exact
// enumeration side channel CR-01 exploited. Mirrors passwordPolicy.js's
// single-guard-clause idiom. Non-string input is coerced via
// `String(name ?? '')` (escapeHtml's coercion style) so a non-string `name`
// never throws an unrelated TypeError before this policy gets a chance to
// produce its own message.
export const MAX_NAME_LENGTH = 255;

export function assertRegistrationName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Name is required.');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error('Name must be 255 characters or fewer.');
  return trimmed;
}
