import { describe, it, expect, beforeEach } from 'vitest';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { signToken } from '../utils/auth.js';
import { validJpegBuffer, validPngBuffer, nonImageBuffer, oversizedImageBuffer } from '../../test/fixtures/images.js';

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
