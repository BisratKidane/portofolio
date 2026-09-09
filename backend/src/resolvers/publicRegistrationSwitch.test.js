// Settings-layer integration coverage for the public registration switch
// (ADMIN-01 / ADMIN-03 / D-03). This file has two halves by design: this half
// (plan 34-03) covers the schema/resolver layer built here -- authz, flip
// persistence, the audit trail, transactional atomicity, upsert-on-absent-row,
// and the three D-06 attribution variants. Plan 34-05 appends the D-02
// five-state / D-07 register-agreement half to this same file.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { isPublicRegistrationEnabled, PUBLIC_REGISTRATION_KEY } from '../utils/appSettings.js';
// ESM-namespace import (distinct from the named import above) so the
// register-agreement half below can vi.spyOn the live module object and
// prove the three call sites share one function object (D-07 Layer 2).
import * as appSettings from '../utils/appSettings.js';

// The register-agreement half (plan 34-05) calls the real `register`
// mutation, so the mailer needs the same mock register.test.js's own
// preamble uses -- never a real SMTP socket, and a call-count surface for
// the D-09 "no owner-notification email" control.
// sendAccountApprovedEmail is mocked alongside register.test.js's own four
// senders (not merely those four): vi.mock replaces the WHOLE module, so any
// mailer export this file's resolvers call and this factory omits comes
// back undefined -- the D-10 control below calls the real approveUser
// mutation, which fires sendAccountApprovedEmail fire-and-forget, and an
// undefined export there throws synchronously before the resolver's own
// .catch can attach, turning a passing control into a crashed mutation.
vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationAttemptEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined)
}));

import {
  sendVerificationEmail,
  sendPendingRegistrationEmail,
  sendPasswordResetEmail,
  sendRegistrationAttemptEmail
} from '../services/mailer.js';
import { createInvitationToken, hashInvitationToken } from '../utils/auth.js';
import { PUBLIC_REGISTRATION_CLOSED_MESSAGE } from './user.resolver.js';

const PUBLIC_REGISTRATION_ENABLED_QUERY = `
  query {
    publicRegistrationEnabled
  }
`;

const PUBLIC_REGISTRATION_SETTING_QUERY = `
  query {
    publicRegistrationSetting {
      enabled
      updatedAt
      updatedByName
    }
  }
`;

const SET_PUBLIC_REGISTRATION = `
  mutation SetPublicRegistration($enabled: Boolean!) {
    setPublicRegistrationEnabled(enabled: $enabled) {
      enabled
      updatedAt
      updatedByName
    }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($token: String, $name: String!, $email: String, $password: String!, $relationshipNote: String) {
    register(token: $token, name: $name, email: $email, password: $password, relationshipNote: $relationshipNote) { message }
  }
`;

// D-10 control fixtures -- pendingApprovals/approveUser must stay unaffected
// by the switch (nothing in this plan touches either).
const PENDING_APPROVALS_QUERY = `
  query {
    pendingApprovals {
      id
      status
    }
  }
`;

const APPROVE_USER_MUTATION = `
  mutation Approve($id: ID!) {
    approveUser(userId: $id) { id status }
  }
`;

// Password is deliberately always 'Password123!' everywhere in this file's
// register-agreement half (Pitfall 3): the door check runs before
// assertPasswordStrength, but on any OPEN-door state a weak password would
// still throw the wrong error, and the point of every test below is the
// door, never the password policy.
const TOKENLESS_VARS = {
  name: 'Door Check Tester',
  email: 'door-check@example.com',
  password: 'Password123!',
  relationshipNote: 'Second cousin on the maternal side'
};

// Mirrors register.test.js's own makeInvitation(overrides) fixture -- the
// D-08 control below reuses it to prove an issued invitation still redeems
// while the public door is closed.
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

// AuditLog.metadata is a JSON column that round-trips as a string on MariaDB
// but a parsed object on MySQL 8 (see accountStatus.test.js's writeAuditLog
// describe block) -- normalize on read so these assertions are environment-independent.
function parsedMetadata(row) {
  return typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
}

describe('settings layer (ADMIN-01 / ADMIN-03 / D-03)', () => {
  describe('authorization', () => {
    it('publicRegistrationSetting rejects an unauthenticated caller (ADMIN-03)', async () => {
      const { errors } = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, null);
      expect(errors[0].message).toBe('You must be logged in to perform this action.');
    });

    it('publicRegistrationSetting rejects an Active non-admin (ADMIN-03 / T-34-03-B)', async () => {
      const nonAdmin = await createTestUser({ email: 'nonadmin-query@example.com' });
      const { errors } = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, nonAdmin);
      expect(errors[0].message).toBe('Admin access is required.');
    });

    it('setPublicRegistrationEnabled rejects an unauthenticated caller (T-34-03-A)', async () => {
      const { errors } = await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, null);
      expect(errors[0].message).toBe('You must be logged in to perform this action.');
    });

    it('setPublicRegistrationEnabled rejects an Active non-admin and leaves the setting unchanged (T-34-03-A, mutation M5)', async () => {
      const nonAdmin = await createTestUser({ email: 'nonadmin-mutate@example.com' });
      const { errors } = await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, nonAdmin);
      expect(errors[0].message).toBe('Admin access is required.');
      expect(await isPublicRegistrationEnabled(models)).toBe(true);
    });

    it('publicRegistrationEnabled is unauthenticated and returns a bare boolean with no attribution keys (D-07 / Pattern 5 / T-34-03-E)', async () => {
      const { data, errors } = await graphql(PUBLIC_REGISTRATION_ENABLED_QUERY, {}, null);
      expect(errors).toBeUndefined();
      expect(data.publicRegistrationEnabled).toBe(true);
      expect(Object.keys(data)).toEqual(['publicRegistrationEnabled']);
    });
  });

  describe('flip behaviour', () => {
    it('an admin flip to false persists the row, the predicate, and the stamped updatedById (ADMIN-01)', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-flip@example.com' });
      const { data, errors } = await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, admin);
      expect(errors).toBeUndefined();
      expect(data.setPublicRegistrationEnabled.enabled).toBe(false);
      expect(await isPublicRegistrationEnabled(models)).toBe(false);

      const row = await models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY);
      expect(row.value).toBe('false');
      expect(row.updatedById).toBe(admin.id);
    });

    it('the flip writes exactly one AuditLog row recording the actor and the from->to values (D-03)', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-audit@example.com' });
      await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, admin);

      const rows = await models.AuditLog.findAll({ where: { action: 'setting.public_registration_changed' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorUserId).toBe(admin.id);
      const metadata = parsedMetadata(rows[0]);
      expect(metadata.setting).toBe(PUBLIC_REGISTRATION_KEY);
      expect(metadata.from).toBe(true);
      expect(metadata.to).toBe(false);
    });

    it('flipping back to true writes a SECOND audit row, and both rows survive (D-03 chose audit history over self-overwriting columns)', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-audit2@example.com' });
      await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, admin);
      await graphql(SET_PUBLIC_REGISTRATION, { enabled: true }, admin);

      const count = await models.AuditLog.count({ where: { action: 'setting.public_registration_changed' } });
      expect(count).toBe(2);

      const rows = await models.AuditLog.findAll({
        where: { action: 'setting.public_registration_changed' },
        order: [['id', 'ASC']]
      });
      expect(parsedMetadata(rows[0])).toMatchObject({ from: true, to: false });
      expect(parsedMetadata(rows[1])).toMatchObject({ from: false, to: true });
    });

    it('flipping against an ABSENT settings row CREATES it, proving upsert rather than update (D-02, T-34-03-F)', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-absent@example.com' });
      await models.AppSetting.destroy({ where: { settingKey: PUBLIC_REGISTRATION_KEY } });
      expect(await models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY)).toBeNull();

      await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, admin);

      const row = await models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY);
      expect(row).not.toBeNull();
      expect(row.value).toBe('false');
    });

    it('rolls the flip back if the in-transaction audit write fails, so a lost audit row never leaves an untraced flip (D-03, T-34-03-D)', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-atomic@example.com' });
      const spy = vi.spyOn(models.AuditLog, 'create').mockRejectedValueOnce(new Error('audit write failed'));

      try {
        const { errors } = await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, admin);
        expect(errors).toBeDefined();
        expect(await isPublicRegistrationEnabled(models)).toBe(true);
        const row = await models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY);
        expect(row.value).toBe('true');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('attribution payload (D-06 variants)', () => {
    it('never changed since setup: the seeded row (updatedById null) yields the "not changed" payload', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-attr-never@example.com' });
      const { data, errors } = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, admin);
      expect(errors).toBeUndefined();
      expect(data.publicRegistrationSetting).toEqual({ enabled: true, updatedAt: null, updatedByName: null });
    });

    it('named actor: after an admin flip, updatedByName resolves and updatedAt parses as an epoch-ms number', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-attr-named@example.com' });
      await graphql(SET_PUBLIC_REGISTRATION, { enabled: false }, admin);

      const { data } = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, admin);
      expect(data.publicRegistrationSetting.updatedByName).toBe('Bisrat');
      expect(data.publicRegistrationSetting.updatedAt).not.toBeNull();
      expect(Number.isFinite(Number(data.publicRegistrationSetting.updatedAt))).toBe(true);
    });

    it('unknown actor: an updatedById that resolves to no user yields a non-null updatedAt but a null updatedByName', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-attr-unknown@example.com' });
      await models.AppSetting.update({ updatedById: 999999 }, { where: { settingKey: PUBLIC_REGISTRATION_KEY } });

      const { data } = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, admin);
      expect(data.publicRegistrationSetting.updatedAt).not.toBeNull();
      expect(data.publicRegistrationSetting.updatedByName).toBeNull();
    });

    it('absent row: the admin query still resolves without throwing, returning the closed/never-changed payload (a forgotten migration 021)', async () => {
      const admin = await createTestUser({ role: 'ADMIN', name: 'Bisrat', email: 'admin-attr-absent@example.com' });
      await models.AppSetting.destroy({ where: { settingKey: PUBLIC_REGISTRATION_KEY } });

      const { data, errors } = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, admin);
      expect(errors).toBeUndefined();
      expect(data.publicRegistrationSetting).toEqual({ enabled: false, updatedAt: null, updatedByName: null });
    });
  });
});

// Register-agreement half (plan 34-05). This is the phase's headline risk:
// the client-visible publicRegistrationEnabled query and the server-side
// check inside register's tokenless branch are an outer and an inner guard
// on ONE predicate, and that divergence class has produced a blocker in
// Phases 14, 15, 30, 31, 32 and 33 -- most recently INSIDE the agreement
// test built to prevent it (32-REVIEW.md CR-01 was TDD'd, green, and wrong,
// because it asserted only that the two sides agreed, which still passes
// when both sides agree on the wrong answer). The three describe blocks
// below implement all three of RESEARCH Pattern 3's layers: a call-count
// proof that the outer/inner call sites share one function object (Layer
// 2), a five-state table asserting the absolute value AND the agreement
// (Layer 3), and the controls proving the switch does not break anything it
// must not (D-08/D-09/D-10).
describe('client/server guard agreement (D-07)', () => {
  describe('Layer 2 -- shared call-site proof', () => {
    it('publicRegistrationEnabled, register, and publicRegistrationSetting all call through the SAME isPublicRegistrationEnabled function object', async () => {
      // This is a STRUCTURAL assertion, not a behavioural one: it proves the
      // three call sites resolve to the same function object, so if anyone
      // later inlines a second row read into register, this count goes red
      // immediately. The flip mutation (setPublicRegistrationEnabled) also
      // calls the accessor internally (for the audit's `from` value) and is
      // deliberately excluded from this sequence to keep the counts stable.
      // isPublicRegistrationEnabled's OWN internal call to
      // getPublicRegistrationSettingRow is a same-module function call, not
      // a namespace-qualified one -- it does not go through this spy and
      // does not need to. The spy target is isPublicRegistrationEnabled
      // itself; the row helper is never spied for this assertion.
      const spy = vi.spyOn(appSettings, 'isPublicRegistrationEnabled');
      try {
        const admin = await createTestUser({ role: 'ADMIN', email: 'd07-layer2-admin@example.com' });

        const publicResult = await graphql(PUBLIC_REGISTRATION_ENABLED_QUERY);
        expect(publicResult.errors).toBeUndefined();
        expect(spy).toHaveBeenCalledTimes(1);

        const registerResult = await graphql(REGISTER_MUTATION, TOKENLESS_VARS);
        // The increment (not a repeat of 1) is the proof that register did
        // NOT read the row itself -- it called through the same accessor.
        expect(registerResult.errors).toBeUndefined();
        expect(spy).toHaveBeenCalledTimes(2);

        const adminResult = await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, admin);
        expect(adminResult.errors).toBeUndefined();
        expect(spy).toHaveBeenCalledTimes(3);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('Layer 3 -- five-state agreement table', () => {
    // Every row asserts THREE things, and all three are required (32-REVIEW.md
    // CR-01, recurring through Phase 33):
    //   1. the ABSOLUTE value (D-02) -- catches mutation M3 (the accessor's
    //      catch returning true), where the agreement assertion alone still
    //      passes because both sides agree on the wrong answer;
    //   2. the AGREEMENT (D-07) -- r.errors === undefined is a clean
    //      discriminator BECAUSE of the uniform-response guard: with valid
    //      inputs a tokenless register returns success on every outcome
    //      (taken email, free email, create failure), so the only way it
    //      errors is the closed door;
    //   3. when closed, the exact refusal MESSAGE -- pins that the refusal
    //      is the door, so a password/name/email validation error can never
    //      masquerade as a door refusal.
    const STATES = [
      [
        'row value "true"',
        async () => {
          await models.AppSetting.update({ value: 'true' }, { where: { settingKey: PUBLIC_REGISTRATION_KEY } });
        },
        true
      ],
      [
        'row value "false"',
        async () => {
          await models.AppSetting.update({ value: 'false' }, { where: { settingKey: PUBLIC_REGISTRATION_KEY } });
        },
        false
      ],
      [
        'row value garbage ("yes")',
        async () => {
          await models.AppSetting.update({ value: 'yes' }, { where: { settingKey: PUBLIC_REGISTRATION_KEY } });
        },
        false
      ],
      [
        'row absent',
        async () => {
          await models.AppSetting.destroy({ where: { settingKey: PUBLIC_REGISTRATION_KEY } });
        },
        false
      ],
      [
        'read throws',
        () =>
          // The repeating (non-single-shot) rejection form: this row makes
          // TWO accessor-backed calls (the public query, then the register
          // mutation) and both must see the throw -- a single-shot rejection
          // would silently let the register half of this row test the
          // wrong thing.
          vi.spyOn(models.AppSetting, 'findByPk').mockRejectedValue(new Error('simulated read failure')),
        false
      ]
    ];

    STATES.forEach(([label, setup, expected], index) => {
      it(`state "${label}": publicRegistrationEnabled reports ${expected} and register agrees`, async () => {
        let maybeSpy;
        try {
          maybeSpy = await setup();

          const queryResult = await graphql(PUBLIC_REGISTRATION_ENABLED_QUERY);
          const registerResult = await graphql(REGISTER_MUTATION, {
            ...TOKENLESS_VARS,
            email: `d07-layer3-${index}@example.com`
          });

          expect(queryResult.data.publicRegistrationEnabled).toBe(expected);
          expect(registerResult.errors === undefined).toBe(queryResult.data.publicRegistrationEnabled);
          if (!expected) {
            expect(registerResult.errors[0].message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
          }
        } finally {
          if (maybeSpy) maybeSpy.mockRestore();
        }
      });
    });
  });
});

// D-08 / D-09 / D-10: proves the switch does not break anything it must
// not. A matrix that only exercises the closed-door refusal could go green
// while the switch silently breaks invitations, taxes the refusal with real
// side effects, moves the check below a validator without anyone noticing,
// grants admins a bypass, or strands the approval queue -- none of which
// ADMIN-02/D-07/D-08/D-09/D-10 permit.
describe('controls the switch must NOT break (D-08 / D-09 / D-10)', () => {
  beforeEach(async () => {
    // Door closed for every test in this block.
    await models.AppSetting.update({ value: 'false' }, { where: { settingKey: PUBLIC_REGISTRATION_KEY } });
  });

  it('D-08: a valid invitation still registers normally while the door is closed -- closing stops new arrivals, it does not void invitations already issued', async () => {
    const { rawToken } = await makeInvitation({ invitedEmail: 'invited-while-closed@example.com' });

    const { data, errors } = await graphql(REGISTER_MUTATION, {
      token: rawToken,
      name: 'Invited While Closed',
      password: 'Password123!'
    });

    expect(errors).toBeUndefined();
    expect(data.register.message).toBe('Registration received. Verify your email to activate your account.');
    const user = await models.User.findOne({ where: { email: 'invited-while-closed@example.com' } });
    expect(user).not.toBeNull();
  });

  it('D-09: the refusal is cheap and side-effect free -- no lookup, no write, no email', async () => {
    const findOneSpy = vi.spyOn(models.User, 'findOne');
    const createSpy = vi.spyOn(models.User, 'create');

    try {
      const { errors } = await graphql(REGISTER_MUTATION, {
        ...TOKENLESS_VARS,
        email: 'd09-refusal@example.com'
      });

      expect(errors[0].message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
      expect(findOneSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(await models.User.count()).toBe(0);
      expect(sendVerificationEmail).not.toHaveBeenCalled();
      expect(sendPendingRegistrationEmail).not.toHaveBeenCalled();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(sendRegistrationAttemptEmail).not.toHaveBeenCalled();
    } finally {
      findOneSpy.mockRestore();
      createSpy.mockRestore();
    }
  });

  it('D-09 ordering: the door check runs before the relationship-note/name/email validators', async () => {
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Ordering Test',
      email: 'not-an-email',
      password: 'Password123!',
      relationshipNote: 'x'.repeat(501)
    });

    // This ordering claim is trivially true given where the guard was
    // placed in Task 1, but the test still has value as a pin: it stops a
    // future refactor from re-inserting the guard lower in the function
    // without anyone noticing.
    expect(errors[0].message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
  });

  it('door check precedes assertPasswordStrength for a tokenless call (the blocker fix)', async () => {
    // If this test is ever made to assert the password-policy error
    // instead, the door check has been moved after assertPasswordStrength
    // by accident. This is a POSITIVE proof of ordering, not an accepted
    // exception: D-09 is locked verbatim as "checked first," and there is
    // no longer any statement in the tokenless path that runs before it.
    const { errors } = await graphql(REGISTER_MUTATION, {
      name: 'Weak Password Test',
      email: 'weak-password-ordering@example.com',
      password: 'weak1',
      relationshipNote: 'Cousin'
    });

    expect(errors[0].message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
  });

  it('being an admin does not reopen the door for yourself -- the switch is not a permission', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'self-registering-admin@example.com' });

    const { errors } = await graphql(
      REGISTER_MUTATION,
      { ...TOKENLESS_VARS, email: 'admin-attempts-self-register@example.com' },
      admin
    );

    expect(errors[0].message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
  });

  it('D-10: the approval queue is untouched -- a Pending, verified user created before the close stays visible and approvable after it', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'd10-admin@example.com' });
    const pendingUser = await createTestUser({
      email: 'd10-pending@example.com',
      status: 'Pending',
      emailVerified: true
    });

    // The door is already closed via this block's beforeEach -- closing
    // stops new arrivals, it does not void people who already registered
    // and verified before the close.
    const pending = await graphql(PENDING_APPROVALS_QUERY, {}, admin);
    expect(pending.errors).toBeUndefined();
    expect(pending.data.pendingApprovals.map((row) => row.id)).toContain(String(pendingUser.id));

    const approved = await graphql(APPROVE_USER_MUTATION, { id: String(pendingUser.id) }, admin);
    expect(approved.errors).toBeUndefined();
    expect(approved.data.approveUser.status).toBe('Active');
  });
});
