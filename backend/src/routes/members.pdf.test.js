import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { signToken } from '../utils/auth.js';
import * as pdfService from '../services/membersPdf.service.js';

beforeEach(resetTables);
afterEach(() => vi.restoreAllMocks());

const SECRET_FIRSTNAME = 'Zzyzxsecretname';

async function seedMember() {
  return models.FamilyMember.create({ firstname: SECRET_FIRSTNAME, lastname: 'Lovelace', gender: 'Female' });
}

function expectNoLeak(res) {
  expect(String(res.text ?? '')).not.toContain('%PDF');
  expect(String(res.text ?? '')).not.toContain(SECRET_FIRSTNAME);
  expect(JSON.stringify(res.body ?? {})).not.toContain(SECRET_FIRSTNAME);
}

function binaryParser(r, cb) {
  const chunks = [];
  r.on('data', (c) => chunks.push(c));
  r.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('GET /api/members.pdf', () => {
  it('rejects a request with no token with 401 and no PDF bytes', async () => {
    await seedMember();
    const res = await httpClient().get('/api/members.pdf');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBeTruthy();
    expectNoLeak(res);
  });

  it('rejects a garbage token with 401', async () => {
    await seedMember();
    const res = await httpClient().get('/api/members.pdf').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expectNoLeak(res);
  });

  it('rejects a verified but unlinked non-admin with 403 and no PDF bytes', async () => {
    await seedMember();
    const user = await createTestUser({ role: 'USER', familyMemberId: null });
    const res = await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
    expectNoLeak(res);
  });

  it('rejects a non-Active user with 401', async () => {
    const member = await seedMember();
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id, status: 'Disabled' });
    const res = await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(401);
    expectNoLeak(res);
  });

  it('rejects an email-unverified user with 401', async () => {
    const member = await seedMember();
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id, emailVerified: false });
    const res = await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(401);
    expectNoLeak(res);
  });

  it('does not read members or build a PDF for unauthorized callers', async () => {
    await seedMember();
    const findAll = vi.spyOn(models.FamilyMember, 'findAll');
    const spouseFindAll = vi.spyOn(models.Spouse, 'findAll');
    const build = vi.spyOn(pdfService, 'buildMembersPdf');
    await httpClient().get('/api/members.pdf');
    const unlinked = await createTestUser({ role: 'USER', familyMemberId: null });
    await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(unlinked)}`);
    expect(findAll).not.toHaveBeenCalled();
    expect(spouseFindAll).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });

  it('serves a PDF to a linked USER', async () => {
    const member = await seedMember();
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id });
    const res = await httpClient()
      .get('/api/members.pdf')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="members.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('passes members to the PDF builder in depth-first order', async () => {
    const root = await models.FamilyMember.create({ firstname: 'Zed', lastname: 'Zulu', gender: 'Male' });
    const child = await models.FamilyMember.create({ firstname: 'Abe', lastname: 'Mid', gender: 'Male', fatherId: root.id });
    const spouse = await models.FamilyMember.create({ firstname: 'Bea', lastname: 'Aaa', gender: 'Female' });
    await models.Spouse.create({ memberAId: root.id, memberBId: spouse.id });
    const user = await createTestUser({ role: 'USER', familyMemberId: root.id });
    const build = vi.spyOn(pdfService, 'buildMembersPdf');
    const res = await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(200);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][0].map((x) => Number(x.id))).toEqual([root.id, spouse.id, child.id].map(Number));
  });

  it('serves a PDF to an unlinked ADMIN', async () => {
    await seedMember();
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });
    const res = await httpClient()
      .get('/api/members.pdf')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .buffer(true)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('does not leak member data or PDF bytes when the DB read fails', async () => {
    const member = await seedMember();
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id });
    vi.spyOn(models.FamilyMember, 'findAll').mockRejectedValue(new Error(`db down ${SECRET_FIRSTNAME}`));
    const res = await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).not.toMatch(/application\/pdf/);
    expectNoLeak(res);
  });

  it('does not leak member data when the PDF builder fails', async () => {
    const member = await seedMember();
    const user = await createTestUser({ role: 'USER', familyMemberId: member.id });
    vi.spyOn(pdfService, 'buildMembersPdf').mockRejectedValue(new Error(`boom ${SECRET_FIRSTNAME}`));
    const res = await httpClient().get('/api/members.pdf').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).not.toMatch(/application\/pdf/);
    expectNoLeak(res);
  });
});
