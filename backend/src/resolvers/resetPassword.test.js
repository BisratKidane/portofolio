import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const REQUEST_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
      resetToken
    }
  }
`;

beforeEach(resetTables);

// Per D-09: this suite asserts the happy path only — the reset-token exposure
// itself is documented in the repo-root KNOWN-ISSUES.md (Task 2 of this plan),
// not asserted here as expected/desired behavior.
describe('requestPasswordReset', () => {
  it('returns the generic message and persists a reset token + expiry for an existing email', async () => {
    const user = await createTestUser({ email: 'existing-user@example.com' });

    const response = await graphql(REQUEST_RESET_MUTATION, { email: 'existing-user@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.requestPasswordReset.message).toBe(
      'If the account exists, a password reset token has been generated.'
    );

    await user.reload();
    expect(user.resetPasswordToken).not.toBeNull();
    expect(user.resetPasswordExpiresAt).not.toBeNull();
  });

  it('returns the identical generic message and a null resetToken for a non-existing email', async () => {
    const response = await graphql(REQUEST_RESET_MUTATION, { email: 'no-such-user@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.requestPasswordReset.message).toBe(
      'If the account exists, a password reset token has been generated.'
    );
    expect(response.data.requestPasswordReset.resetToken).toBeNull();
  });
});
