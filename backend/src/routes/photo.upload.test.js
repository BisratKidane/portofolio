import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import { httpClient, resetTables, createTestUser, graphql } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { signToken } from '../utils/auth.js';
import { resolvePhotoPath } from '../services/photoStorage.service.js';
import { validJpegBuffer, validPngBuffer, nonImageBuffer, oversizedImageBuffer } from '../../test/fixtures/images.js';

const FAMILY_MEMBER_PHOTO_QUERY = `
  query FamilyMemberPhoto($id: ID!) {
    familyMember(id: $id) {
      id
      photoUrl
    }
  }
`;

beforeEach(resetTables);

async function createLinkedActor() {
  const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  const user = await createTestUser({ role: 'USER', familyMemberId: member.id });
  const token = signToken(user);
  return { member, user, token };
}

describe('POST /api/family-members/:id/photo (adversarial-first, T-16-08/T-16-09/T-16-10)', () => {
  it('never lets a path-traversal filename reach the stored profilePicture value', async () => {
    const { member, token } = await createLinkedActor();

    const res = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', validJpegBuffer, { filename: '../../../etc/passwd.jpg', contentType: 'image/jpeg' });

    // The route must exist and produce a real handled response (not the
    // default 404 for an unmatched route) -- this is what proves the RED
    // state (route missing) before implementation, and the GREEN state
    // (route handles the request) after.
    expect(res.status).not.toBe(404);

    await member.reload();
    if (member.profilePicture) {
      expect(member.profilePicture).toMatch(/^[0-9a-f-]{36}\.[a-z0-9]+$/i);
      expect(member.profilePicture).not.toMatch(/etc|passwd/i);
    }
  });

  it('(content-type) rejects a mislabeled malicious payload declared as image/jpeg', async () => {
    const { member, token } = await createLinkedActor();

    const res = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', nonImageBuffer, { filename: 'file.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('(content-type) accepts a real image even when declared with a wrong header, proving the header is ignored', async () => {
    const { member, token } = await createLinkedActor();

    const res = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', validPngBuffer, { filename: 'file.png', contentType: 'text/html' });

    expect(res.status).toBe(200);
  });

  it('rejects a file over 5 MB with a clean 400, not a 500', async () => {
    const { member, token } = await createLinkedActor();

    const res = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', oversizedImageBuffer(), { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/family-members/:id/photo (happy path, outside-scope, replace)', () => {
  it('happy path: an in-scope actor uploads a photo and it is reflected via profilePicture + GraphQL photoUrl', async () => {
    const { member, user, token } = await createLinkedActor();

    const res = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', validJpegBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toBe(`/api/family-members/${member.id}/photo`);

    await member.reload();
    expect(member.profilePicture).toBeTruthy();

    const { data, errors } = await graphql(FAMILY_MEMBER_PHOTO_QUERY, { id: String(member.id) }, user);
    expect(errors).toBeUndefined();
    expect(data.familyMember.photoUrl).toBe(`/api/family-members/${member.id}/photo`);
  });

  it('outside scope: an actor cannot upload a photo for a member outside their editable scope', async () => {
    const { token } = await createLinkedActor();
    const outsider = await models.FamilyMember.create({ firstname: 'Bob', lastname: 'Other', gender: 'Male' });

    const res = await httpClient()
      .post(`/api/family-members/${outsider.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', validJpegBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This member is outside your editable scope.');

    await outsider.reload();
    expect(outsider.profilePicture).toBeNull();
  });

  it('replace: uploading a second valid photo deletes the first stored file from disk (no orphan)', async () => {
    const { member, token } = await createLinkedActor();

    const firstRes = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', validJpegBuffer, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(firstRes.status).toBe(200);

    await member.reload();
    const firstFilename = member.profilePicture;
    const firstPath = resolvePhotoPath(firstFilename);
    await expect(fs.access(firstPath)).resolves.toBeUndefined();

    const secondRes = await httpClient()
      .post(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', validPngBuffer, { filename: 'b.png', contentType: 'image/png' });
    expect(secondRes.status).toBe(200);

    await member.reload();
    const secondFilename = member.profilePicture;
    expect(secondFilename).not.toBe(firstFilename);

    await expect(fs.access(firstPath)).rejects.toThrow();
    await expect(fs.access(resolvePhotoPath(secondFilename))).resolves.toBeUndefined();
  });
});
