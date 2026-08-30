import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from './index.js';

const { User } = models;

describe('validatePassword', () => {
  it('resolves true for the correct password against a known bcrypt hash', async () => {
    const known = await bcrypt.hash('Password123!', 12);
    const user = User.build({ passwordHash: known });

    await expect(user.validatePassword('Password123!')).resolves.toBe(true);
  });

  it('resolves false for an incorrect password against a known bcrypt hash', async () => {
    const known = await bcrypt.hash('Password123!', 12);
    const user = User.build({ passwordHash: known });

    await expect(user.validatePassword('WrongPassword')).resolves.toBe(false);
  });
});

describe('beforeCreate hashing hook', () => {
  it('does not hash the password on build() alone', () => {
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: 'Password123!',
      role: 'USER'
    });

    expect(user.passwordHash).toBe('Password123!');
  });

  it('hashes the password when the beforeCreate hook runs, without persisting', async () => {
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: 'Password123!',
      role: 'USER'
    });

    await User.runHooks('beforeCreate', user);

    expect(user.passwordHash).not.toBe('Password123!');
    await expect(bcrypt.compare('Password123!', user.passwordHash)).resolves.toBe(true);
    expect(user.isNewRecord).toBe(true);
  });

  it('does not re-hash an already-hashed passwordHash when options.passwordAlreadyHashed is true (Plan 32-03 D-09 key_link)', async () => {
    const alreadyHashed = await bcrypt.hash('Password123!', 12);
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: alreadyHashed,
      role: 'USER'
    });

    await User.runHooks('beforeCreate', user, { passwordAlreadyHashed: true });

    expect(user.passwordHash).toBe(alreadyHashed);
    await expect(bcrypt.compare('Password123!', user.passwordHash)).resolves.toBe(true);
  });

  it('still hashes a plaintext password that merely LOOKS like a bcrypt hash when no options are passed (invited-path regression)', async () => {
    const bcryptShapedPlaintext = '$2a$04$aaaaaaaaaaaaaaaaaaaaaa';
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: bcryptShapedPlaintext,
      role: 'USER'
    });

    await User.runHooks('beforeCreate', user);

    expect(user.passwordHash).not.toBe(bcryptShapedPlaintext);
    await expect(bcrypt.compare(bcryptShapedPlaintext, user.passwordHash)).resolves.toBe(true);
  });

  it('declares relationshipNote as nullable (D-04, D-05)', () => {
    expect(User.rawAttributes.relationshipNote.allowNull).toBe(true);
  });
});

describe('beforeUpdate passwordChangedAt stamping hook (SESS-01)', () => {
  it('stamps passwordChangedAt with the current time when passwordHash changes', async () => {
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: 'Password123!',
      role: 'USER'
    });
    user.set('passwordHash', 'NewPassword123!');

    await User.runHooks('beforeUpdate', user);

    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect(Date.now() - user.passwordChangedAt.getTime()).toBeLessThan(5000);
  });

  it('does not stamp passwordChangedAt when an unrelated field changes', async () => {
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: 'Password123!',
      role: 'USER'
    });
    // Simulate an already-persisted record (build() marks every provided
    // attribute as changed for a brand-new instance) so that only the
    // subsequent name update is tracked as dirty.
    user.changed('passwordHash', false);
    user.set('name', 'Updated Name');

    await User.runHooks('beforeUpdate', user);

    expect(user.changed('passwordHash')).toBe(false);
    expect(user.passwordChangedAt).toBeFalsy();
  });
});

describe('emailVerified / emailVerificationToken / emailVerificationExpiresAt columns (VERIFY-01)', () => {
  it('defaults emailVerified to false on build() when not provided', () => {
    const user = User.build({
      name: 'Test',
      email: 'test@example.com',
      passwordHash: 'Password123!',
      role: 'USER'
    });

    expect(user.emailVerified).toBe(false);
  });

  it('declares emailVerificationToken and emailVerificationExpiresAt as nullable', () => {
    expect(User.rawAttributes.emailVerificationToken.allowNull).toBe(true);
    expect(User.rawAttributes.emailVerificationExpiresAt.allowNull).toBe(true);
  });
});
