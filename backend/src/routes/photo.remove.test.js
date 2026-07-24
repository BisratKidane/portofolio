import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { signToken } from '../utils/auth.js';
import { resolvePhotoPath } from '../services/photoStorage.service.js';
import { validJpegBuffer } from '../../test/fixtures/images.js';

beforeEach(resetTables);

async function createLinkedActor() {
  const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  const user = await createTestUser({ role: 'USER', familyMemberId: member.id });
  const token = signToken(user);
  return { member, user, token };
}

async function uploadPhoto(member, token) {
  const res = await httpClient()
    .post(`/api/family-members/${member.id}/photo`)
    .set('Authorization', `Bearer ${token}`)
    .attach('photo', validJpegBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  expect(res.status).toBe(200);
  await member.reload();
  return member.profilePicture;
}

describe('DELETE /api/family-members/:id/photo (D-11)', () => {
  it('removes an in-scope actor\'s existing photo, reverting to the placeholder state and deleting the stored file', async () => {
    const { member, token } = await createLinkedActor();
    const filename = await uploadPhoto(member, token);
    const filePath = resolvePhotoPath(filename);
    await expect(fs.access(filePath)).resolves.toBeUndefined();

    const res = await httpClient()
      .delete(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toBeNull();

    await member.reload();
    expect(member.profilePicture).toBeNull();
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('rejects an outside-scope actor with 403 and leaves the photo and file untouched', async () => {
    const { token } = await createLinkedActor();
    const outsider = await models.FamilyMember.create({ firstname: 'Bob', lastname: 'Other', gender: 'Male' });
    const outsiderUser = await createTestUser({ role: 'USER', familyMemberId: outsider.id });
    const outsiderToken = signToken(outsiderUser);
    const filename = await uploadPhoto(outsider, outsiderToken);
    const filePath = resolvePhotoPath(filename);

    const res = await httpClient()
      .delete(`/api/family-members/${outsider.id}/photo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This member is outside your editable scope.');

    await outsider.reload();
    expect(outsider.profilePicture).toBe(filename);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('is idempotent: removing a photo from a member with no photo returns 200 with no filesystem error', async () => {
    const { member, token } = await createLinkedActor();

    const res = await httpClient()
      .delete(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toBeNull();

    await member.reload();
    expect(member.profilePicture).toBeNull();
  });

  it('an unauthenticated removal is rejected with 401, not a 500 (WR-01)', async () => {
    const { member, token } = await createLinkedActor();
    const filename = await uploadPhoto(member, token);
    const filePath = resolvePhotoPath(filename);

    const res = await httpClient().delete(`/api/family-members/${member.id}/photo`);

    expect(res.status).toBe(401);
    await member.reload();
    expect(member.profilePicture).toBe(filename);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('if nulling the DB column fails during removal, the stored file is NOT deleted, so no dangling reference is created (WR-02)', async () => {
    const { member, token } = await createLinkedActor();
    const filename = await uploadPhoto(member, token);
    const filePath = resolvePhotoPath(filename);

    // The column-null write fails; a correct ordering nulls the column BEFORE
    // deleting the file, so the file must survive when that write fails.
    const spy = vi.spyOn(models.FamilyMember.prototype, 'update').mockRejectedValueOnce(new Error('db down'));

    const res = await httpClient()
      .delete(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`);

    spy.mockRestore();

    expect(res.status).toBe(500);
    await member.reload();
    expect(member.profilePicture).toBe(filename);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });
});
