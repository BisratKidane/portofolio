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
