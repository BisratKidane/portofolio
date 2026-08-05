import { describe, it, expect, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { hashVerificationToken } from '../utils/auth.js';
import { env } from '../config/env.js';
import { isMariaDB } from '../../test/dbEngine.js';

const VERIFY_EMAIL_MUTATION = `
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) {
      token
      user {
        id
        name
        email
        role
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
});
