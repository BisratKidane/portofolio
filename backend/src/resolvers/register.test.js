import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { MIN_REGISTER_RESPONSE_MS } from './user.resolver.js';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationAttemptEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail, sendPendingRegistrationEmail, sendRegistrationAttemptEmail } from '../services/mailer.js';
import { createInvitationToken, hashInvitationToken, hashVerificationToken } from '../utils/auth.js';
import * as authUtils from '../utils/auth.js';

const REGISTER_MUTATION = `
  mutation Register($token: String, $name: String!, $email: String, $password: String!, $relationshipNote: String) {
    register(token: $token, name: $name, email: $email, password: $password, relationshipNote: $relationshipNote) { message }
  }
`;

const SUCCESS_MESSAGE = 'Registration received. Verify your email to activate your account.';

// Creates a Pending invitation and returns its raw (unhashed) token.
async function makeInvitation(overrides = {}) {
  const inviter = overrides.inviter || (await createTestUser({ role: 'ADMIN', email: `inviter-${Date.now()}@example.com` }));
  const rawToken = createInvitationToken();
  const invitation = await models.Invitation.create({
    tokenHash: hashInvitationToken(rawToken),
    inviterId: inviter.id,
    invitedEmail: overrides.invitedEmail || 'invitee@example.com',
    relationshipToFamily: overrides.relationshipToFamily || 'cousin',
    invitationNote: overrides.invitationNote || null,
    expiresAt: overrides.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: overrides.status || 'Pending'
  });
  return { rawToken, invitation, inviter };
}

beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});

describe('register (invitation-only)', () => {
  it('creates a Pending, unverified USER from a valid invitation and consumes it', async () => {
    const { rawToken, invitation } = await makeInvitation({ invitedEmail: 'ada@example.com' });

    const { data, errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Ada', password: 'Password123!' });

    expect(errors).toBeUndefined();
    expect(data.register.message).toBe(SUCCESS_MESSAGE);

    const user = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(user.role).toBe('USER');
    expect(user.status).toBe('Pending');
    expect(user.emailVerified).toBe(false);
    expect(user.emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);

    await invitation.reload();
    expect(invitation.status).toBe('Registered');
    expect(invitation.registeredUserId).toBe(user.id);
    expect(invitation.registeredAt).toBeInstanceOf(Date);
  });

  it('emails the verification link and does not notify admins (D-11)', async () => {
    await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const { rawToken } = await makeInvitation({ invitedEmail: 'ada@example.com' });

    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Ada', password: 'Password123!' });
    expect(errors).toBeUndefined();

    await vi.waitFor(() => {
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    });
    expect(sendPendingRegistrationEmail).not.toHaveBeenCalled();
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('ada@example.com');

    const user = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(hashVerificationToken(sendVerificationEmail.mock.calls[0][0].token)).toBe(user.emailVerificationToken);

    // writeAuditLog is fire-and-forget in register (user.resolver.js) -- the mutation returns
    // before the audit row is committed, so this assertion must poll like the
    // sendVerificationEmail one above rather than read the table once (post-merge race, 31-05).
    await vi.waitFor(async () => {
      const audits = await models.AuditLog.findAll({ where: { action: 'invitation.registered' } });
      expect(audits).toHaveLength(1);
    });
  });

  it('rejects an invalid invitation token', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, { token: 'not-a-real-token', name: 'X', password: 'Password123!' });
    expect(errors[0].message).toBe('This invitation link is invalid.');
    expect(data).toBeNull();
  });

  it('rejects an expired invitation and marks it Expired', async () => {
    const { rawToken, invitation } = await makeInvitation({ expiresAt: new Date(Date.now() - 1000) });
    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'X', password: 'Password123!' });
    expect(errors[0].message).toBe('This invitation link has expired.');
    await invitation.reload();
    expect(invitation.status).toBe('Expired');
  });

  it('rejects reusing an already-registered invitation (one-time use)', async () => {
    const { rawToken } = await makeInvitation({ invitedEmail: 'once@example.com' });
    const first = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'First', password: 'Password123!' });
    expect(first.errors).toBeUndefined();

    const second = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Second', password: 'Password123!' });
    expect(second.errors[0].message).toBe('This invitation has already been used.');
  });

  it('lets only one of two concurrent registrations on the same token win', async () => {
    const { rawToken } = await makeInvitation({ invitedEmail: 'race@example.com' });
    const [a, b] = await Promise.all([
      graphql(REGISTER_MUTATION, { token: rawToken, name: 'A', password: 'Password123!' }),
      graphql(REGISTER_MUTATION, { token: rawToken, name: 'B', password: 'Password123!' })
    ]);
    const successes = [a, b].filter((r) => !r.errors);
    expect(successes).toHaveLength(1);
    expect(await models.User.count({ where: { email: 'race@example.com' } })).toBe(1);
  });

  it('rejects a weak password before consuming the invitation', async () => {
    const { rawToken, invitation } = await makeInvitation();
    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Weak', password: 'short' });
    expect(errors[0].message).toBe('Password must be at least 8 characters.');
    await invitation.reload();
    expect(invitation.status).toBe('Pending'); // not consumed
  });

  it('rejects registration when the invited email already has an account', async () => {
    await createTestUser({ email: 'taken@example.com' });
    const { rawToken } = await makeInvitation({ invitedEmail: 'taken@example.com' });
    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Dup', password: 'Password123!' });
    expect(errors[0].message).toBe('An account with this email already exists.');
  });

  it('creates the account at the invitation\'s invitedEmail even when a hostile email argument is supplied (D-02)', async () => {
    const { rawToken } = await makeInvitation({ invitedEmail: 'alice@example.com' });

    const { errors } = await graphql(REGISTER_MUTATION, {
      token: rawToken,
      name: 'X',
      email: 'attacker@evil.com',
      password: 'Password123!'
    });
    expect(errors).toBeUndefined();

    const legit = await models.User.findOne({ where: { email: 'alice@example.com' } });
    expect(legit).not.toBeNull();

    const hostile = await models.User.findOne({ where: { email: 'attacker@evil.com' } });
    expect(hostile).toBeNull();
  });
});

describe('register (tokenless)', () => {
  it('creates a Pending, unverified USER from a fresh email with the stored relationship note', async () => {
    const { data, errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ada',
      email: 'ADA@Example.com ',
      password: 'Password123!',
      relationshipNote: 'my cousin'
    });

    expect(errors).toBeUndefined();
    expect(data.register.message).toBe(SUCCESS_MESSAGE);

    const user = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(user).not.toBeNull();
    expect(user.status).toBe('Pending');
    expect(user.emailVerified).toBe(false);
    expect(user.relationshipNote).toBe('my cousin');
    expect(user.emailVerificationToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the identical success message and creates no second row when the email is already taken, and emails the real owner (D-08, D-10, SEC-01)', async () => {
    const existing = await createTestUser({ email: 'taken@example.com', name: 'Existing Owner' });

    const first = await graphql(REGISTER_MUTATION, {
      name: 'Impersonator',
      email: 'taken@example.com',
      password: 'Password123!'
    });

    expect(first.errors).toBeUndefined();
    expect(first.data.register.message).toBe(SUCCESS_MESSAGE);
    expect(await models.User.count({ where: { email: 'taken@example.com' } })).toBe(1);

    await vi.waitFor(() => {
      expect(sendRegistrationAttemptEmail).toHaveBeenCalledTimes(1);
    });
    expect(sendRegistrationAttemptEmail.mock.calls[0][0]).toEqual({
      to: existing.email,
      name: existing.name
    });

    // WR-09 (well-formed-input half): the same name/password against a distinct
    // fresh email must produce a byte-identical full response, not just an
    // equal `.message` string.
    const second = await graphql(REGISTER_MUTATION, {
      name: 'Impersonator',
      email: 'wr09-fresh@example.com',
      password: 'Password123!'
    });

    expect(second.errors).toBeUndefined();
    expect(first).toEqual(second);
  });

  it('rejects a tokenless register with no email (email required, no token)', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, { name: 'X', password: 'Password123!' });
    expect(errors[0].message).toBe('Email is required.');
  });

  it('lets a tokenless self-registrant log in with their original plain-text password once verified and Active', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Bea',
      email: 'bea@example.com',
      password: 'Password123!'
    });
    expect(errors).toBeUndefined();

    const user = await models.User.findOne({ where: { email: 'bea@example.com' } });
    user.emailVerified = true;
    user.status = 'Active';
    await user.save();

    const isValid = await user.validatePassword('Password123!');
    expect(isValid).toBe(true);
  });

  it('computes the bcrypt hash before the existing-user lookup (D-09, shape not timing)', async () => {
    const bcryptSpy = vi.spyOn(bcrypt, 'hash');
    const findOneSpy = vi.spyOn(models.User, 'findOne');

    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Cara',
      email: 'cara@example.com',
      password: 'Password123!'
    });
    expect(errors).toBeUndefined();

    // Guard: the spy must have actually intercepted the calls, not silently
    // no-op'd (possible for a CJS default-export module like bcryptjs under
    // Vitest's ESM interop). Otherwise the ordering assertion below would
    // pass vacuously against zero real calls.
    expect(bcryptSpy.mock.calls.length).toBe(1);
    expect(findOneSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    expect(bcryptSpy.mock.invocationCallOrder[0]).toBeLessThan(findOneSpy.mock.invocationCallOrder[0]);

    bcryptSpy.mockRestore();
    findOneSpy.mockRestore();
  });

  it('rejects a relationship note over 500 characters and creates no row (D-05)', async () => {
    const countBefore = await models.User.count();

    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Dora',
      email: 'dora@example.com',
      password: 'Password123!',
      relationshipNote: 'x'.repeat(501)
    });

    expect(errors[0].message).toBe('Relationship note must be 500 characters or fewer.');
    expect(await models.User.count()).toBe(countBefore);
  });

  it('accepts a tokenless register with no relationship note and stores null (D-06, F-01)', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Eli',
      email: 'eli@example.com',
      password: 'Password123!'
    });
    expect(errors).toBeUndefined();

    const user = await models.User.findOne({ where: { email: 'eli@example.com' } });
    expect(user.relationshipNote).toBeNull();
  });

  // 32-VERIFICATION.md gap 1 regression coverage -- closes CR-01, also covers WR-01/WR-02/WR-03(tokenless)/WR-09.
  describe('enumeration-safety hardening (CR-01, WR-01, WR-02, WR-03, WR-09)', () => {
    it('returns byte-identical responses for a taken email and a fresh email under a hostile 300-char name payload (CR-01)', async () => {
      await createTestUser({ email: 'cr01-taken@example.com', name: 'Existing Owner' });
      const hostileName = 'A'.repeat(300);

      const takenResult = await graphql(REGISTER_MUTATION, {
        name: hostileName,
        email: 'cr01-taken@example.com',
        password: 'Password123!'
      });

      const freshResult = await graphql(REGISTER_MUTATION, {
        name: hostileName,
        email: 'cr01-fresh@example.com',
        password: 'Password123!'
      });

      expect(takenResult).toEqual(freshResult);
      expect(freshResult.errors[0].message).toBe('Name must be 255 characters or fewer.');
      expect(await models.User.count({ where: { email: 'cr01-fresh@example.com' } })).toBe(0);
    });

    it('rejects a whitespace-only name on a fresh email (WR-03, tokenless half)', async () => {
      const { errors } = await graphql(REGISTER_MUTATION, {
        name: '   ',
        email: 'wr03-fresh@example.com',
        password: 'Password123!'
      });

      expect(errors[0].message).toBe('Name is required.');
      expect(await models.User.count({ where: { email: 'wr03-fresh@example.com' } })).toBe(0);
    });

    it('accepts a name exactly at the 255-character cap (boundary)', async () => {
      const boundaryName = 'B'.repeat(255);

      const { errors } = await graphql(REGISTER_MUTATION, {
        name: boundaryName,
        email: 'cap-255@example.com',
        password: 'Password123!'
      });

      expect(errors).toBeUndefined();
      expect(await models.User.count({ where: { email: 'cap-255@example.com' } })).toBe(1);
    });

    it('rejects a name one character over the 255-character cap (boundary)', async () => {
      const overCapName = 'B'.repeat(256);

      const { errors } = await graphql(REGISTER_MUTATION, {
        name: overCapName,
        email: 'cap-256@example.com',
        password: 'Password123!'
      });

      expect(errors[0].message).toBe('Name must be 255 characters or fewer.');
      expect(await models.User.count({ where: { email: 'cap-256@example.com' } })).toBe(0);
    });

    it('returns byte-identical responses when two concurrent registrations race on the same fresh email (duplicate-insert race)', async () => {
      // Racing two real GraphQL calls with a bare Promise.all is flaky: bcrypt's
      // libuv-threadpool timing can let the second call's existing-user lookup
      // run AFTER the first call's row has already committed, which resolves
      // the race via the ordinary "taken email" branch instead of exercising
      // the unique-constraint collision this test targets. Gate both calls'
      // `models.User.findOne` on a barrier that only releases once BOTH have
      // arrived, guaranteeing both see no existing user and both attempt
      // `models.User.create` concurrently every run.
      const originalFindOne = models.User.findOne.bind(models.User);
      let arrivals = 0;
      let releaseBarrier;
      const barrier = new Promise((resolve) => {
        releaseBarrier = resolve;
      });
      const findOneSpy = vi.spyOn(models.User, 'findOne').mockImplementation(async (...args) => {
        arrivals += 1;
        if (arrivals >= 2) releaseBarrier();
        await barrier;
        return originalFindOne(...args);
      });

      try {
        const [a, b] = await Promise.all([
          graphql(REGISTER_MUTATION, { name: 'Racer A', email: 'race-fresh@example.com', password: 'Password123!' }),
          graphql(REGISTER_MUTATION, { name: 'Racer B', email: 'race-fresh@example.com', password: 'Password123!' })
        ]);

        expect(a).toEqual(b);
        expect(await models.User.count({ where: { email: 'race-fresh@example.com' } })).toBe(1);

        for (const result of [a, b]) {
          if (result.errors) {
            for (const error of result.errors) {
              expect(error.message).not.toMatch(/Validation error/i);
              expect(error.message).not.toMatch(/Sequelize/i);
            }
          }
        }
      } finally {
        findOneSpy.mockRestore();
      }
    });

    it('never leaks raw ORM/DB error text when models.User.create fails for any other reason (WR-02)', async () => {
      const createSpy = vi
        .spyOn(models.User, 'create')
        .mockRejectedValueOnce(new Error("Unknown column 'relationshipNote' in 'field list'"));

      try {
        const { errors, data } = await graphql(REGISTER_MUTATION, {
          name: 'Simulated Failure',
          email: 'wr02-fresh@example.com',
          password: 'Password123!'
        });

        expect(errors).toBeUndefined();
        expect(data.register.message).toBe(SUCCESS_MESSAGE);
        expect(await models.User.count({ where: { email: 'wr02-fresh@example.com' } })).toBe(0);
      } finally {
        createSpy.mockRestore();
      }
    });

    it('never leaks raw ORM/DB error text when models.User.findOne rejects (CR-03)', async () => {
      const injectedMessage = 'SequelizeConnectionError: connection pool exhausted';
      const findOneSpy = vi.spyOn(models.User, 'findOne').mockRejectedValueOnce(new Error(injectedMessage));

      try {
        const result = await graphql(REGISTER_MUTATION, {
          name: 'CR03 FindOne',
          email: 'cr03-findone@example.com',
          password: 'Password123!'
        });

        expect(result.errors).toBeUndefined();
        expect(result.data.register.message).toBe(SUCCESS_MESSAGE);
        expect(await models.User.count({ where: { email: 'cr03-findone@example.com' } })).toBe(0);

        // Belt-and-suspenders: the injected error's own message text must not
        // leak anywhere in the response, not just via `errors`.
        expect(JSON.stringify(result)).not.toContain(injectedMessage);
      } finally {
        findOneSpy.mockRestore();
      }
    });

    it('never leaks raw error text when createVerificationToken throws on the free-email path (CR-03)', async () => {
      const injectedMessage = 'crypto.randomBytes failed';
      const tokenSpy = vi.spyOn(authUtils, 'createVerificationToken').mockImplementationOnce(() => {
        throw new Error(injectedMessage);
      });

      try {
        const result = await graphql(REGISTER_MUTATION, {
          name: 'CR03 Token',
          email: 'cr03-token@example.com',
          password: 'Password123!'
        });

        expect(result.errors).toBeUndefined();
        expect(result.data.register.message).toBe(SUCCESS_MESSAGE);
        expect(await models.User.count({ where: { email: 'cr03-token@example.com' } })).toBe(0);
        expect(JSON.stringify(result)).not.toContain(injectedMessage);
      } finally {
        tokenSpy.mockRestore();
      }
    });

    it('applies the same minimum response-time floor to every tokenless outcome (WR-01, shape not wall-clock)', async () => {
      await createTestUser({ email: 'wr01-taken@example.com', name: 'Existing Owner' });

      // A blanket `setTimeout` mock that always fires `cb()` synchronously
      // recurses into the Sequelize connection pool's own internal idle-check
      // timer (which reschedules itself via `setTimeout` every time it fires,
      // at intervals as short as 1000ms -- too close to plausible response-
      // floor values to filter by magnitude alone) and blows the call stack.
      // Filter by call-site instead: only intercept `setTimeout` calls made
      // from within `user.resolver.js` (i.e. this resolver's own `delay()`
      // helper) and let every other caller -- the connection pool included --
      // pass through to the real `setTimeout` completely untouched.
      const realSetTimeout = global.setTimeout;
      const shortDelays = [];
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation((cb, ms, ...args) => {
        const stack = new Error().stack || '';
        if (stack.includes('user.resolver.js')) {
          shortDelays.push(ms);
          cb();
          return 0;
        }
        return realSetTimeout(cb, ms, ...args);
      });
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);

      try {
        await graphql(REGISTER_MUTATION, {
          name: 'Taken Path',
          email: 'wr01-taken@example.com',
          password: 'Password123!'
        });

        await graphql(REGISTER_MUTATION, {
          name: 'Free Path',
          email: 'wr01-fresh@example.com',
          password: 'Password123!'
        });

        expect(shortDelays.length).toBeGreaterThanOrEqual(2);
        for (const ms of shortDelays) {
          expect(ms).toBe(MIN_REGISTER_RESPONSE_MS);
        }
      } finally {
        setTimeoutSpy.mockRestore();
        dateNowSpy.mockRestore();
      }
    });
  });
});
