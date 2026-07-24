import { describe, it, expect, beforeEach } from 'vitest';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { signToken } from '../utils/auth.js';
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
}

describe('GET /api/family-members/:id/photo (D-07 -- any valid JWT, no scope check)', () => {
  it('serves the stored photo bytes with a matching Content-Type for any valid JWT holder, regardless of scope', async () => {
    const { member, token } = await createLinkedActor();
    await uploadPhoto(member, token);

    // A second, unrelated linked user (NOT in member's editable scope) can
    // still view the photo -- D-07's deliberately broad view boundary.
    const viewerMember = await models.FamilyMember.create({ firstname: 'Zed', lastname: 'Viewer', gender: 'Male' });
    const viewerUser = await createTestUser({ role: 'USER', familyMemberId: viewerMember.id });
    const viewerToken = signToken(viewerUser);

    const res = await httpClient()
      .get(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(Buffer.compare(res.body, validJpegBuffer)).toBe(0);
  });

  it('rejects a request with no or an invalid JWT with 401', async () => {
    const { member, token } = await createLinkedActor();
    await uploadPhoto(member, token);

    const noAuthRes = await httpClient().get(`/api/family-members/${member.id}/photo`);
    expect(noAuthRes.status).toBe(401);
    expect(noAuthRes.body.error).toBe('You must be logged in to perform this action.');

    const invalidAuthRes = await httpClient()
      .get(`/api/family-members/${member.id}/photo`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(invalidAuthRes.status).toBe(401);
    expect(invalidAuthRes.body.error).toBe('You must be logged in to perform this action.');
  });

  it('returns 404 when the member exists but has no photo', async () => {
    const { member, token } = await createLinkedActor();

    const res = await httpClient()
      .get(`/api/family-members/${member.id}/photo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('This member has no photo.');
  });

  it('returns 404 when the member does not exist', async () => {
    const { token } = await createLinkedActor();

    const res = await httpClient()
      .get('/api/family-members/999999/photo')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('This member has no photo.');
  });
});
