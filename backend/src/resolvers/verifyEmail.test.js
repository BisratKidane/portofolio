import { describe, it, expect, beforeEach, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { hashVerificationToken } from '../utils/auth.js';
import { env } from '../config/env.js';
import { isMariaDB } from '../../test/dbEngine.js';
import { models } from '../models/index.js';

vi.mock('../services/mailer.js', () => ({
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendPendingRegistrationEmail } from '../services/mailer.js';

const VERIFY_EMAIL_MUTATION = `
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) {
      token
      user {
        id
        name
        email
        role
        status
      }
    }
  }
`;

const INVALID_OR_EXPIRED_MESSAGE = 'The email verification token is invalid or has expired.';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A second, real MySQL connection (independent of the resolver's Sequelize pool) used to hold
// genuine InnoDB locks and deterministically force the concurrent interleaving that a bare
// in-process Promise.all cannot (WR-03). Same test DB the Vitest suite already runs against.
async function rawConnection() {
  const conn = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name
  });
  // Keep any accidental lock wait short so a mis-designed test fails fast rather than hanging.
  await conn.query('SET SESSION innodb_lock_wait_timeout = 10');
  return conn;
}

beforeEach(resetTables);
beforeEach(() => vi.clearAllMocks());

describe('verifyEmail', () => {
  it('flips emailVerified, clears the token/expiry, and returns a working session for a valid token', async () => {
    const user = await createTestUser({
      email: 'verify-me@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('a-valid-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'a-valid-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.token).toEqual(expect.any(String));
    expect(response.data.verifyEmail.user.email).toBe('verify-me@example.com');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerificationToken).toBeNull();
    expect(user.emailVerificationExpiresAt).toBeNull();
  });

  it('rejects an unknown/garbage token', async () => {
    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'not-a-real-token' });

    expect(response.errors[0].message).toBe(INVALID_OR_EXPIRED_MESSAGE);
    expect(response.data).toBeNull();
  });

  it('rejects an expired token and does not flip emailVerified', async () => {
    const user = await createTestUser({
      email: 'expired-verify@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('expired-token'),
      emailVerificationExpiresAt: new Date(Date.now() - 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'expired-token' });

    expect(response.errors[0].message).toBe(INVALID_OR_EXPIRED_MESSAGE);
    expect(response.data).toBeNull();

    await user.reload();
    expect(user.emailVerified).toBe(false);
  });

  it('rejects reusing an already-consumed verification token (single-use)', async () => {
    await createTestUser({
      email: 'single-use-verify@example.com',
      emailVerified: false,
      emailVerificationToken: hashVerificationToken('single-use-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const firstResponse = await graphql(VERIFY_EMAIL_MUTATION, { token: 'single-use-token' });
    expect(firstResponse.errors).toBeUndefined();
    expect(firstResponse.data.verifyEmail.user.email).toBe('single-use-verify@example.com');

    const secondResponse = await graphql(VERIFY_EMAIL_MUTATION, { token: 'single-use-token' });
    expect(secondResponse.errors[0].message).toBe(INVALID_OR_EXPIRED_MESSAGE);
    expect(secondResponse.data).toBeNull();
  });

  // Test A — deterministic lock-contention proof. A raw connection takes the exact locking
  // admin-count read the fixed resolver uses (SELECT ... FOR UPDATE) and holds it across a
  // controlled ~300ms SQL SLEEP window. A concurrent real verifier must serialize behind that
  // lock rather than racing it independently, so it cannot resolve before the holder commits.
  it('serializes a concurrent verifier behind a held admin-slot lock instead of racing it independently', async () => {
    await createTestUser({
      email: 'lock-contended@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('lock-contended-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const conn = await rawConnection();
    let rawCommittedAt = 0;
    let mutationResolvedAt = 0;
    let response;
    try {
      await conn.beginTransaction();
      await conn.query(
        "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE"
      );

      await Promise.all([
        (async () => {
          response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'lock-contended-token' });
          mutationResolvedAt = Date.now();
        })(),
        (async () => {
          await conn.query('SELECT SLEEP(0.3)');
          await conn.commit();
          rawCommittedAt = Date.now();
        })()
      ]);
    } finally {
      try {
        await conn.rollback();
      } catch {
        /* already committed */
      }
      await conn.end();
    }

    // The verifier genuinely contended on the held admin-slot lock: it resolved only once the
    // lock holder committed, not independently ahead of it.
    expect(mutationResolvedAt).toBeGreaterThanOrEqual(rawCommittedAt - 25);
    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.token).toEqual(expect.any(String));
  });

  // Test B — real two-racer outcome + no-burned-token guarantee (VERIFY-04). Two real verifiers
  // are pinned at their admin-count read by a raw connection holding an exclusive lock on a shared
  // non-admin "anchor" row that both promotion scans must read (but neither primary-key-keyed token
  // UPDATE touches). Releasing that lock lets both promotions run at the same instant, forcing the
  // lock-order interleaving. The pre-fix two-statement autocommit shape deadlocks here — one racer
  // gets an unhandled ER_LOCK_DEADLOCK after its single-use token was already burned. The fix must
  // make both racers keep a usable session with exactly one ADMIN.
  it('lets two users racing to verify simultaneously each keep a usable session, with exactly one becoming ADMIN (VERIFY-04)', async (ctx) => {
    ctx.skip(
      await isMariaDB(),
      'MariaDB does not implement the MySQL 8.4 SELECT ... FOR UPDATE lock-wait semantics this ' +
        'test asserts (it raises a Sequelize optimistic-version error instead). This test runs ' +
        'and must pass on CI (MySQL 8.4). See KNOWN-ISSUES.md.'
    );
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const racerA = await createTestUser({
      email: 'racer-one@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('racer-one-token'),
      emailVerificationExpiresAt: future
    });
    const racerB = await createTestUser({
      email: 'racer-two@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('racer-two-token'),
      emailVerificationExpiresAt: future
    });
    // Non-admin anchor row read by every admin-count scan; never targeted by a token UPDATE.
    const anchor = await createTestUser({ email: 'race-anchor@example.com', emailVerified: true, role: 'USER' });

    const conn = await rawConnection();
    let responseA;
    let responseB;
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE users SET name = name WHERE id = ?', [anchor.id]);

      [responseA, responseB] = await Promise.all([
        graphql(VERIFY_EMAIL_MUTATION, { token: 'racer-one-token' }),
        graphql(VERIFY_EMAIL_MUTATION, { token: 'racer-two-token' }),
        (async () => {
          // Give both verifiers time to consume their token and block on the anchor lock at the
          // admin-count read, then release so both promotions fire simultaneously.
          await wait(300);
          await conn.commit();
        })()
      ]);
    } finally {
      try {
        await conn.rollback();
      } catch {
        /* already committed */
      }
      await conn.end();
    }

    // Neither racer may surface a raw unhandled SQL error (e.g. a deadlock) ...
    expect(responseA.errors).toBeUndefined();
    expect(responseB.errors).toBeUndefined();
    // ... and every racer that consumed its single-use token must receive a usable session.
    expect(responseA.data.verifyEmail.token).toEqual(expect.any(String));
    expect(responseB.data.verifyEmail.token).toEqual(expect.any(String));

    const roles = [responseA.data.verifyEmail.user.role, responseB.data.verifyEmail.user.role];
    expect(roles.filter((role) => role === 'ADMIN')).toHaveLength(1);
    expect(roles.filter((role) => role === 'USER')).toHaveLength(1);

    await racerA.reload();
    await racerB.reload();
    expect(racerA.emailVerified).toBe(true);
    expect(racerB.emailVerified).toBe(true);
  });

  it('does not reopen the ADMIN slot for a later verification once it is already filled (D-04/D-06)', async () => {
    await createTestUser({ email: 'existing-admin@example.com', role: 'ADMIN', emailVerified: true });

    await createTestUser({
      email: 'late-verifier@example.com',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('late-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'late-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.role).toBe('USER');
  });

  // SC-3: an invited, Pending registrant is promoted straight to Active the moment they
  // verify their email, with no admin action in between (D-04, D-05, D-07).
  it('promotes a Pending invited registrant to Active on verification (SC-3)', async () => {
    const user = await createTestUser({
      email: 'invited-verifier@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('invited-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter-sc3@example.com' });
    const invitation = await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-this-test',
      inviterId: inviter.id,
      invitedEmail: user.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: user.id
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'invited-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Active');
    expect(response.data.verifyEmail.token).toEqual(expect.any(String));

    await user.reload();
    expect(user.status).toBe('Active');
    expect(user.emailVerified).toBe(true);

    await invitation.reload();
    // D-08: the promotion never stamps Invitation.status -- it stays 'Registered'.
    expect(invitation.status).toBe('Registered');
  });

  // D-06: a Rejected account that re-verifies its email stays Rejected -- verification
  // itself still succeeds, but promotion is silently skipped, never resurrecting it.
  it('does not resurrect a Rejected invited account on verification (D-06)', async () => {
    const user = await createTestUser({
      email: 'rejected-verifier@example.com',
      status: 'Rejected',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('rejected-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter-rejected@example.com' });
    await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-this-test-2',
      inviterId: inviter.id,
      invitedEmail: user.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: user.id
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'rejected-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Rejected');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe('Rejected');
  });

  // D-06: identical guarantee for a Disabled account.
  it('does not resurrect a Disabled invited account on verification (D-06)', async () => {
    const user = await createTestUser({
      email: 'disabled-verifier@example.com',
      status: 'Disabled',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('disabled-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter-disabled@example.com' });
    await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-this-test-3',
      inviterId: inviter.id,
      invitedEmail: user.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: user.id
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'disabled-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Disabled');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe('Disabled');
  });

  // CR-01 (legacy row): a Pending, invited registrant whose invitation was issued by a
  // non-admin (a pre-Phase-31 row, when createInvitation was still gated by
  // requireFamilyAccess) must not be silently promoted -- existence of the Invitation row
  // alone proves nothing about who currently holds ADMIN.
  it('does not activate a Pending account whose invitation was issued by a non-admin (CR-01, legacy row)', async () => {
    const user = await createTestUser({
      email: 'legacy-row-verifier@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('legacy-row-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({ role: 'USER', email: 'inviter-legacy-row@example.com' });
    await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-this-test-4',
      inviterId: inviter.id,
      invitedEmail: user.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: user.id
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'legacy-row-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Pending');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe('Pending');

    expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
  });

  // CR-01 (demoted/disabled admin, TOCTOU): the inviter's authority is re-checked at
  // redemption time, not trusted from invite-creation time -- an admin who has since been
  // disabled must not still vouch for anyone.
  it('does not activate a Pending account whose inviter is an admin who is now Disabled (CR-01, demoted/disabled admin)', async () => {
    const user = await createTestUser({
      email: 'demoted-admin-verifier@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('demoted-admin-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({
      role: 'ADMIN',
      status: 'Disabled',
      email: 'inviter-demoted-admin@example.com'
    });
    await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-this-test-5',
      inviterId: inviter.id,
      invitedEmail: user.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: user.id
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'demoted-admin-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Pending');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe('Pending');

    expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
  });

  // CR-02 (regression guard): a Pending account with NO invitation row at all must stay
  // Pending -- pins the `if (invitation)` boundary itself so a future change cannot silently
  // remove it and have the suite stay green.
  it('does not activate a Pending account with no invitation row at all (CR-02, regression guard)', async () => {
    const user = await createTestUser({
      email: 'no-invitation-verifier@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('no-invitation-verifier-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'no-invitation-verifier-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Pending');

    await user.reload();
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe('Pending');

    expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
  });

  // 31-05, TOCTOU lock: the inviter is a legitimate ADMIN/Active/verified account at the moment
  // verifyEmail begins, but is demoted to USER by a concurrent raw connection WHILE verifyEmail's
  // own transaction is still open (blocked on the admin-slot FOR UPDATE scan, which needs the
  // inviter's row). Against a plain, non-locking re-read the inviter check would still see the
  // transaction's earlier REPEATABLE READ snapshot (still role: 'ADMIN') and wrongly promote --
  // this test proves the row is genuinely locked, not just re-read.
  it('refuses to promote a Pending registrant when the inviter is demoted to USER concurrently with redemption (31-05, TOCTOU lock)', async (ctx) => {
    ctx.skip(
      await isMariaDB(),
      'MariaDB does not implement the MySQL 8.4 SELECT ... FOR UPDATE lock-wait semantics this ' +
        'test asserts (it raises a Sequelize optimistic-version error instead, same divergence as ' +
        'VERIFY-04). This test runs and must pass on CI (MySQL 8.4). See KNOWN-ISSUES.md.'
    );
    const registrant = await createTestUser({
      email: 'toctou-registrant@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('toctou-lock-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({ role: 'ADMIN', email: 'toctou-inviter@example.com' });
    // A separate, always-present anchor admin keeps the admin-slot count >= 1 after the inviter
    // is demoted, so the unrelated ADMIN-slot-filling branch never fires on this test.
    await createTestUser({ role: 'ADMIN', email: 'toctou-anchor-admin@example.com' });
    await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-toctou-lock-test',
      inviterId: inviter.id,
      invitedEmail: registrant.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: registrant.id
    });

    const conn = await rawConnection();
    let response;
    try {
      await conn.beginTransaction();
      await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [inviter.id]);

      await Promise.all([
        (async () => {
          response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'toctou-lock-token' });
        })(),
        (async () => {
          await conn.query('SELECT SLEEP(0.3)');
          await conn.query('UPDATE users SET role = ? WHERE id = ?', ['USER', inviter.id]);
          await conn.commit();
        })()
      ]);
    } finally {
      try {
        await conn.rollback();
      } catch {
        /* already committed */
      }
      await conn.end();
    }

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Pending');

    await registrant.reload();
    expect(registrant.status).toBe('Pending');
    expect(registrant.emailVerified).toBe(true);

    expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
  });

  // 31-05, emailVerified gap: an ADMIN/Active inviter whose own emailVerified is false (e.g.
  // after changing their email via updateUser) cannot authenticate at all per
  // getUserFromRequest, yet role/status alone would still let them vouch for a pending invitee
  // under the pre-fix predicate. isFunctioningAdmin must require emailVerified too.
  it('does not activate a Pending account whose inviter is an ADMIN with emailVerified: false (31-05, emailVerified gap)', async () => {
    const registrant = await createTestUser({
      email: 'emailverified-gap-registrant@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER',
      emailVerificationToken: hashVerificationToken('emailverified-gap-token'),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    const inviter = await createTestUser({
      role: 'ADMIN',
      status: 'Active',
      emailVerified: false,
      email: 'emailverified-gap-inviter@example.com'
    });
    await models.Invitation.create({
      tokenHash: 'irrelevant-hash-for-emailverified-gap-test',
      inviterId: inviter.id,
      invitedEmail: registrant.email,
      relationshipToFamily: 'cousin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'Registered',
      registeredAt: new Date(),
      registeredUserId: registrant.id
    });

    const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'emailverified-gap-token' });

    expect(response.errors).toBeUndefined();
    expect(response.data.verifyEmail.user.status).toBe('Pending');

    await registrant.reload();
    expect(registrant.emailVerified).toBe(true);
    expect(registrant.status).toBe('Pending');

    expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
  });

  // D-12/D-13: verifying a self-registered (no Invitation row) account notifies Active,
  // email-verified admins exactly once via the plain-field notifier; an invited registrant
  // never triggers this notifier, whether or not their verification promotes them to Active.
  describe('admin notification on self-registration verification (D-12, D-13)', () => {
    it('notifies Active, email-verified admins exactly once when a self-registrant (no Invitation row) verifies their email', async () => {
      const admin = await createTestUser({ role: 'ADMIN', email: 'notify-admin@example.com' });
      await createTestUser({
        email: 'self-registrant@example.com',
        name: 'Self Registrant',
        status: 'Pending',
        emailVerified: false,
        role: 'USER',
        relationshipNote: "My cousin on my mother's side",
        emailVerificationToken: hashVerificationToken('self-registrant-token'),
        emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });

      const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'self-registrant-token' });

      expect(response.errors).toBeUndefined();
      expect(response.data.verifyEmail.user.status).toBe('Pending');

      await vi.waitFor(() => {
        expect(sendPendingRegistrationEmail).toHaveBeenCalledTimes(1);
      });
      expect(sendPendingRegistrationEmail.mock.calls[0][0].to).toBe(admin.email);
      expect(sendPendingRegistrationEmail.mock.calls[0][0].newUserName).toBe('Self Registrant');
      expect(sendPendingRegistrationEmail.mock.calls[0][0].newUserEmail).toBe('self-registrant@example.com');
      expect(sendPendingRegistrationEmail.mock.calls[0][0].note).toBe("My cousin on my mother's side");
    });

    it('never notifies admins when an invited registrant (unvouched inviter) verifies their email and stays Pending', async () => {
      const user = await createTestUser({
        email: 'invited-unvouched@example.com',
        status: 'Pending',
        emailVerified: false,
        role: 'USER',
        emailVerificationToken: hashVerificationToken('invited-unvouched-token'),
        emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });
      const inviter = await createTestUser({ role: 'USER', email: 'inviter-unvouched@example.com' });
      await models.Invitation.create({
        tokenHash: 'irrelevant-hash-unvouched',
        inviterId: inviter.id,
        invitedEmail: user.email,
        relationshipToFamily: 'cousin',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'Registered',
        registeredAt: new Date(),
        registeredUserId: user.id
      });

      const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'invited-unvouched-token' });

      expect(response.errors).toBeUndefined();
      expect(response.data.verifyEmail.user.status).toBe('Pending');

      // F-02: wait on an already-settled side effect from the same call before
      // asserting the notifier was NOT called -- never a bare synchronous check.
      await vi.waitFor(async () => {
        await user.reload();
        expect(user.emailVerified).toBe(true);
      });
      expect(sendPendingRegistrationEmail).not.toHaveBeenCalled();
    });

    it('never notifies admins when an invited registrant is promoted to Active on verification', async () => {
      const user = await createTestUser({
        email: 'invited-vouched@example.com',
        status: 'Pending',
        emailVerified: false,
        role: 'USER',
        emailVerificationToken: hashVerificationToken('invited-vouched-token'),
        emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });
      const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter-vouched@example.com' });
      await models.Invitation.create({
        tokenHash: 'irrelevant-hash-vouched',
        inviterId: inviter.id,
        invitedEmail: user.email,
        relationshipToFamily: 'cousin',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'Registered',
        registeredAt: new Date(),
        registeredUserId: user.id
      });

      const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'invited-vouched-token' });

      expect(response.errors).toBeUndefined();
      expect(response.data.verifyEmail.user.status).toBe('Active');

      // F-02: wait on the already-settled audit-log side effect before asserting
      // the notifier was NOT called.
      await vi.waitFor(async () => {
        const audits = await models.AuditLog.findAll({ where: { action: 'invitation.activated' } });
        expect(audits).toHaveLength(1);
      });
      expect(sendPendingRegistrationEmail).not.toHaveBeenCalled();
    });

    it('excludes an Active admin whose own email is unverified from the notified recipients (D-13)', async () => {
      const verifiedAdmin = await createTestUser({ role: 'ADMIN', email: 'verified-admin@example.com' });
      const unverifiedAdmin = await createTestUser({
        role: 'ADMIN',
        status: 'Active',
        emailVerified: false,
        email: 'unverified-admin@example.com'
      });
      await createTestUser({
        email: 'self-registrant-d13@example.com',
        status: 'Pending',
        emailVerified: false,
        role: 'USER',
        emailVerificationToken: hashVerificationToken('self-registrant-d13-token'),
        emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });

      const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'self-registrant-d13-token' });
      expect(response.errors).toBeUndefined();

      await vi.waitFor(() => {
        expect(sendPendingRegistrationEmail).toHaveBeenCalledTimes(1);
      });
      expect(sendPendingRegistrationEmail.mock.calls[0][0].to).toBe(verifiedAdmin.email);
      expect(sendPendingRegistrationEmail.mock.calls.some((call) => call[0].to === unverifiedAdmin.email)).toBe(
        false
      );
    });
  });
});
