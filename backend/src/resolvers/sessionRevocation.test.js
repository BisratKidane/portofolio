import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';

vi.mock('../services/mailer.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendPasswordResetEmail } from '../services/mailer.js';

const REQUEST_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
    }
  }
`;

const RESET_PASSWORD_MUTATION = `
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
    }
  }
`;

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session revocation via passwordChangedAt (SESS-03, end-to-end)', () => {
  it('rejects a pre-reset token and accepts a same-second post-reset token, through the real HTTP/Apollo/DB stack', async () => {
    const email = 'session-revocation@example.com';
    await createTestUser({ email });

    // 1. Login BEFORE the reset, a whole second earlier — pre-reset token's iat floor is 11:59:59.
    vi.setSystemTime(new Date('2026-01-01T11:59:59.000Z'));
    const preLoginResponse = await httpClient()
      .post('/graphql')
      .send({ query: LOGIN_MUTATION, variables: { email, password: 'Password123!' } });
    const preResetToken = preLoginResponse.body.data.login.token;
    expect(preResetToken).toBeTruthy();

    // 2. Request a password reset, capturing the raw token emailed by the mocked mailer.
    const requestResetResponse = await httpClient()
      .post('/graphql')
      .send({ query: REQUEST_RESET_MUTATION, variables: { email } });
    expect(requestResetResponse.body.errors).toBeUndefined();
    await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalled());
    const rawToken = sendPasswordResetEmail.mock.calls[0][0].token;

    // 3. Reset the password at 12:00:00.900 — passwordChangedAt floors to 12:00:00.
    vi.setSystemTime(new Date('2026-01-01T12:00:00.900Z'));
    const resetResponse = await httpClient()
      .post('/graphql')
      .send({ query: RESET_PASSWORD_MUTATION, variables: { token: rawToken, password: 'NewPassword123!' } });
    expect(resetResponse.body.errors).toBeUndefined();
    expect(resetResponse.body.data.resetPassword).toBe(true);

    // 4. Re-login with the NEW password in the SAME whole second as the reset (12:00:00.950).
    vi.setSystemTime(new Date('2026-01-01T12:00:00.950Z'));
    const postLoginResponse = await httpClient()
      .post('/graphql')
      .send({ query: LOGIN_MUTATION, variables: { email, password: 'NewPassword123!' } });
    const postResetToken = postLoginResponse.body.data.login.token;
    expect(postResetToken).toBeTruthy();

    // 5. Query `me` shortly after, still within the same faked-clock window so neither token has
    //    hit its real 1-day `exp` — only the passwordChangedAt revocation check should decide the
    //    outcome here, not JWT expiry (jwt.verify checks `exp` against the real/faked wall clock).
    vi.setSystemTime(new Date('2026-01-01T12:00:01.000Z'));

    // Negative case: the pre-reset token (iat floor 11:59:59) must now be rejected.
    const meWithPreResetToken = await httpClient()
      .post('/graphql')
      .set('Authorization', `Bearer ${preResetToken}`)
      .send({ query: ME_QUERY });
    expect(meWithPreResetToken.body.data.me).toBeNull();

    // Positive case: the same-second post-reset token (iat floor 12:00:00) must be honored.
    const meWithPostResetToken = await httpClient()
      .post('/graphql')
      .set('Authorization', `Bearer ${postResetToken}`)
      .send({ query: ME_QUERY });
    expect(meWithPostResetToken.body.data.me).not.toBeNull();

    vi.useRealTimers();
  });
});
