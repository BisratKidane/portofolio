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

beforeEach(resetTables);

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
