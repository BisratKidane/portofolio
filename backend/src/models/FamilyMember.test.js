import { describe, it, expect } from 'vitest';
import { DataTypes } from 'sequelize';
import { models } from './index.js';

const { FamilyMember } = models;

describe('required fields (MEM-01)', () => {
  it('rejects a build with no fields at all', async () => {
    const instance = FamilyMember.build({});

    await expect(instance.validate()).rejects.toThrow();
  });

  it('rejects a build with firstname and lastname but no gender', async () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe' });

    await expect(instance.validate()).rejects.toThrow();
  });

  it('resolves when firstname, lastname, and gender are all present', async () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Male' });

    await expect(instance.validate()).resolves.not.toThrow();
  });
});

describe('gender ENUM (MEM-01, D-07)', () => {
  it('rejects a gender value outside the allowed ENUM', async () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Alien' });

    await expect(instance.validate()).rejects.toThrow();
  });

  it.each(['Male', 'Female', 'Other'])('resolves for gender %s', async (gender) => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender });

    await expect(instance.validate()).resolves.not.toThrow();
  });
});

describe('optional fields nullable (MEM-02, D-08)', () => {
  it('resolves when mothersname/email/birthdate/deathdate/phone/address are all omitted', async () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Other' });

    await expect(instance.validate()).resolves.not.toThrow();
  });

  it('declares mothersname, email, birthdate, deathdate, phone, address as nullable', () => {
    expect(FamilyMember.rawAttributes.mothersname.allowNull).toBe(true);
    expect(FamilyMember.rawAttributes.email.allowNull).toBe(true);
    expect(FamilyMember.rawAttributes.birthdate.allowNull).toBe(true);
    expect(FamilyMember.rawAttributes.deathdate.allowNull).toBe(true);
    expect(FamilyMember.rawAttributes.phone.allowNull).toBe(true);
    expect(FamilyMember.rawAttributes.address.allowNull).toBe(true);
  });
});

describe('email conditional isEmail validation (D-10)', () => {
  it('rejects an invalid email format', async () => {
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      email: 'not-an-email'
    });

    await expect(instance.validate()).rejects.toThrow();
  });

  it('resolves for a valid email format', async () => {
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      email: 'a@b.com'
    });

    await expect(instance.validate()).resolves.not.toThrow();
  });

  it('resolves when email is omitted', async () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Female' });

    await expect(instance.validate()).resolves.not.toThrow();
  });
});

describe('fullname VIRTUAL getter (MEM-03, D-09)', () => {
  it('derives fullname as firstname + lastname on a built (unsaved) instance', () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Female' });

    expect(instance.fullname).toBe('Jane Doe');
  });

  it('declares fullname as a Sequelize VIRTUAL field', () => {
    expect(FamilyMember.rawAttributes.fullname.type).toBeInstanceOf(DataTypes.VIRTUAL);
  });
});

describe('date validation (D-10)', () => {
  it('rejects when deathdate is before birthdate', async () => {
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      birthdate: '2000-01-01',
      deathdate: '1999-01-01'
    });

    await expect(instance.validate()).rejects.toThrow();
  });

  it('resolves when deathdate equals birthdate', async () => {
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      birthdate: '2000-01-01',
      deathdate: '2000-01-01'
    });

    await expect(instance.validate()).resolves.not.toThrow();
  });

  it('resolves when deathdate is one day after birthdate', async () => {
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      birthdate: '2000-01-01',
      deathdate: '2000-01-02'
    });

    await expect(instance.validate()).resolves.not.toThrow();
  });

  it('rejects a birthdate in the future', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      birthdate: tomorrow
    });

    await expect(instance.validate()).rejects.toThrow();
  });

  it('rejects a deathdate in the future', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      deathdate: tomorrow
    });

    await expect(instance.validate()).rejects.toThrow();
  });

  it('resolves for an arbitrarily old birthdate with no deathdate (no lower bound)', async () => {
    const instance = FamilyMember.build({
      firstname: 'Jane',
      lastname: 'Doe',
      gender: 'Female',
      birthdate: '1650-01-01'
    });

    await expect(instance.validate()).resolves.not.toThrow();
  });
});
