import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PUBLIC_REGISTRATION_KEY,
  isPublicRegistrationEnabled,
  getPublicRegistrationSettingRow,
  seedDefaultAppSettings
} from './appSettings.js';
import { models } from '../models/index.js';
import { resetTables } from '../../test/helpers.js';

beforeEach(resetTables);

// D-02's five states, each proven independently. A fail-closed default that
// is never exercised is a fail-open default nobody has noticed yet.
describe('isPublicRegistrationEnabled (D-02 five-state fail-closed coverage)', () => {
  it('resolves true when the row value is the exact string \'true\' (the state resetTables leaves behind)', async () => {
    await expect(isPublicRegistrationEnabled(models)).resolves.toBe(true);
  });

  it('resolves false when the row value is \'false\'', async () => {
    await models.AppSetting.update(
      { value: 'false' },
      { where: { settingKey: PUBLIC_REGISTRATION_KEY } }
    );
    await expect(isPublicRegistrationEnabled(models)).resolves.toBe(false);
  });

  it.each(['yes', 'TRUE', '1', ''])(
    "resolves false for garbage row value %j -- anything that is not the exact string 'true' is closed",
    async (garbage) => {
      await models.AppSetting.update(
        { value: garbage },
        { where: { settingKey: PUBLIC_REGISTRATION_KEY } }
      );
      await expect(isPublicRegistrationEnabled(models)).resolves.toBe(false);
    }
  );

  it('resolves false, without throwing, when the row is absent', async () => {
    await models.AppSetting.destroy({ where: { settingKey: PUBLIC_REGISTRATION_KEY } });
    await expect(isPublicRegistrationEnabled(models)).resolves.toBe(false);
  });

  it('resolves false when the read throws (mockRejectedValue, not ...Once -- every caller in a test must see the same throw)', async () => {
    const spy = vi
      .spyOn(models.AppSetting, 'findByPk')
      .mockRejectedValue(new Error('SequelizeConnectionError: connection pool exhausted'));
    try {
      await expect(isPublicRegistrationEnabled(models)).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('PUBLIC_REGISTRATION_KEY', () => {
  it('is pinned to the exact literal migration 021 hard-codes -- a rename must be a deliberate two-file edit', () => {
    expect(PUBLIC_REGISTRATION_KEY).toBe('public_registration_enabled');
  });
});

describe('getPublicRegistrationSettingRow (no-predicate-logic contract)', () => {
  it('returns the RAW row, not a boolean, when the seeded OPEN row is present -- isPublicRegistrationEnabled is the only thing allowed to turn the row into an answer', async () => {
    const row = await getPublicRegistrationSettingRow(models);
    expect(row).not.toBeNull();
    expect(row.value).toBe('true');
  });

  it('resolves null, not a rejection and not false, when the row is absent', async () => {
    await models.AppSetting.destroy({ where: { settingKey: PUBLIC_REGISTRATION_KEY } });
    await expect(getPublicRegistrationSettingRow(models)).resolves.toBeNull();
  });
});

describe('seedDefaultAppSettings (idempotent, non-clobbering)', () => {
  it('does not clobber a row a caller has deliberately set to \'false\'', async () => {
    await models.AppSetting.update(
      { value: 'false' },
      { where: { settingKey: PUBLIC_REGISTRATION_KEY } }
    );

    await seedDefaultAppSettings(models);

    await expect(isPublicRegistrationEnabled(models)).resolves.toBe(false);
  });

  it('creates the row as OPEN when it was absent -- the property that makes this helper safe inside resetTables and migration 021\'s ON DUPLICATE KEY UPDATE', async () => {
    await models.AppSetting.destroy({ where: { settingKey: PUBLIC_REGISTRATION_KEY } });

    await seedDefaultAppSettings(models);

    await expect(isPublicRegistrationEnabled(models)).resolves.toBe(true);
  });
});
