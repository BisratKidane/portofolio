import { describe, it, expect, beforeEach } from 'vitest';
import { resetTables, createTestUser } from '../../test/helpers.js';
import { models } from './index.js';

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

beforeEach(resetTables);

describe('Invitation model', () => {
  it('defaults status to Pending', async () => {
    const inviter = await createTestUser({ role: 'ADMIN', email: 'inviter@example.com' });
    const inv = await models.Invitation.create({
      tokenHash: 'hash-1',
      inviterId: inviter.id,
      invitedEmail: 'invitee@example.com',
      expiresAt: future()
    });
    expect(inv.status).toBe('Pending');
    await inv.reload();
    expect(inv.registeredAt).toBeNull();
    expect(inv.approvedAt).toBeNull();
  });

  it('requires an invited email', async () => {
    const inviter = await createTestUser({ email: 'inviter2@example.com' });
    await expect(
      models.Invitation.create({ tokenHash: 'hash-2', inviterId: inviter.id, expiresAt: future() })
    ).rejects.toThrow();
  });

  it('enforces a unique tokenHash', async () => {
    const inviter = await createTestUser({ email: 'inviter4@example.com' });
    await models.Invitation.create({
      tokenHash: 'dup-hash',
      inviterId: inviter.id,
      invitedEmail: 'one@example.com',
      expiresAt: future()
    });
    await expect(
      models.Invitation.create({
        tokenHash: 'dup-hash',
        inviterId: inviter.id,
        invitedEmail: 'two@example.com',
        expiresAt: future()
      })
    ).rejects.toThrow();
  });

  it('resolves the inviter association', async () => {
    const inviter = await createTestUser({ email: 'inviter5@example.com', name: 'Aunt May' });
    const inv = await models.Invitation.create({
      tokenHash: 'hash-5',
      inviterId: inviter.id,
      invitedEmail: 'x@example.com',
      expiresAt: future()
    });
    const loaded = await models.Invitation.findByPk(inv.id, { include: [{ association: 'inviter' }] });
    expect(loaded.inviter.name).toBe('Aunt May');
  });
});
