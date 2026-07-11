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
});
