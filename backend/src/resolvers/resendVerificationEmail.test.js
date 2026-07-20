import { describe, it, expect, beforeEach, vi } from 'vitest';
import { graphql, resetTables, resetRateLimitStore, createTestUser } from '../../test/helpers.js';
import { hashVerificationToken } from '../utils/auth.js';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail } from '../services/mailer.js';
import { MIN_RESET_RESPONSE_MS } from './user.resolver.js';

const RESEND_VERIFICATION_MUTATION = `
  mutation ResendVerificationEmail($email: String!) {
    resendVerificationEmail(email: $email) {
      message
    }
  }
`;

const RESEND_VERIFICATION_MESSAGE = 'If an unverified account exists, a verification link has been sent.';
const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Please try again later.';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

beforeEach(async () => {
  await resetTables();
  resetRateLimitStore();
  vi.clearAllMocks();
});

describe('resendVerificationEmail', () => {
  it('reissues a fresh token for an existing unverified account and emails the matching raw token', async () => {
    const user = await createTestUser({
      email: 'unverified-resend@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('stale-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await graphql(RESEND_VERIFICATION_MUTATION, { email: 'unverified-resend@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.resendVerificationEmail.message).toBe(RESEND_VERIFICATION_MESSAGE);

    await vi.waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(1));
    const [{ to, token }] = sendVerificationEmail.mock.calls[0];
    expect(to).toBe('unverified-resend@example.com');

    await user.reload();
    expect(user.emailVerificationToken).not.toBe(hashVerificationToken('stale-token'));
    expect(hashVerificationToken(token)).toBe(user.emailVerificationToken);
  });

  it('returns the identical generic message and sends no email for an already-verified account', async () => {
    await createTestUser({ email: 'already-verified@example.com', emailVerified: true });

    const response = await graphql(RESEND_VERIFICATION_MUTATION, { email: 'already-verified@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.resendVerificationEmail.message).toBe(RESEND_VERIFICATION_MESSAGE);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns the identical generic message and sends no email for a nonexistent account', async () => {
    const response = await graphql(RESEND_VERIFICATION_MUTATION, { email: 'no-such-account@example.com' });

    expect(response.errors).toBeUndefined();
    expect(response.data.resendVerificationEmail.message).toBe(RESEND_VERIFICATION_MESSAGE);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not leak account existence through response latency', async () => {
    await createTestUser({ email: 'timing-unverified@example.com', emailVerified: false });

    const sample = async (email, clientIp) => {
      const startedAt = performance.now();
      const response = await graphql(RESEND_VERIFICATION_MUTATION, { email }, null, clientIp);
      const elapsed = performance.now() - startedAt;

      expect(response.errors).toBeUndefined();
      expect(response.data.resendVerificationEmail.message).toBe(RESEND_VERIFICATION_MESSAGE);
      return elapsed;
    };

    const existing = [];
    const missing = [];
    for (let i = 0; i < 5; i += 1) {
      existing.push(await sample('timing-unverified@example.com', `10.10.80.${i}`));
      missing.push(await sample('no-such-timing@example.com', `10.10.81.${i}`));
    }

    const existingMedian = median(existing);
    const missingMedian = median(missing);
    const tolerance = 25;

    expect(existingMedian).toBeGreaterThanOrEqual(MIN_RESET_RESPONSE_MS - tolerance);
    expect(missingMedian).toBeGreaterThanOrEqual(MIN_RESET_RESPONSE_MS - tolerance);
    expect(Math.abs(existingMedian - missingMedian)).toBeLessThan(50);
  }, 20000);

  it('rejects the 6th call from the same IP within the window (D-13)', async () => {
    const clientIp = '10.10.90.1';
    const responses = [];

    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await graphql(RESEND_VERIFICATION_MUTATION, { email: 'rate-limited-resend@example.com' }, null, clientIp)
      );
    }

    for (let i = 0; i < 5; i += 1) {
      expect(responses[i].errors).toBeUndefined();
      expect(responses[i].data.resendVerificationEmail.message).toBe(RESEND_VERIFICATION_MESSAGE);
    }

    expect(responses[5].errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(responses[5].errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });
});
