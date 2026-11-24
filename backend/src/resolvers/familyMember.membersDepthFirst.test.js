import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const DEPTH_QUERY = `query { familyMembersDepthFirst { id firstname lastname } }`;
const ALPHA_QUERY = `query { familyMembers { id firstname lastname } }`;

beforeEach(resetTables);

// Lastname order is Abe(Mid) < Bea(Aaa) ... deliberately different from depth-first.
async function seedTree() {
  const root = await models.FamilyMember.create({ firstname: 'Zed', lastname: 'Zulu', gender: 'Male' });
  const child = await models.FamilyMember.create({
    firstname: 'Abe', lastname: 'Mid', gender: 'Male', fatherId: root.id
  });
  const grandchild = await models.FamilyMember.create({
    firstname: 'Mo', lastname: 'Yank', gender: 'Male', fatherId: child.id
  });
  const spouse = await models.FamilyMember.create({ firstname: 'Bea', lastname: 'Aaa', gender: 'Female' });
  await models.Spouse.create({ memberAId: root.id, memberBId: spouse.id });
  return { root, child, grandchild, spouse };
}

describe('familyMembersDepthFirst query', () => {
  it('returns no member data to an unauthenticated caller', async () => {
    await seedTree();
    const res = await graphql(DEPTH_QUERY, {}, null);
    expect(res.errors[0].message).toMatch(/logged in/i);
    expect(res.data).toBeNull();
    expect(JSON.stringify(res)).not.toMatch(/Zulu|Mid|Yank|Aaa/);
  });

  it('rejects an unlinked non-admin USER with no member data', async () => {
    await seedTree();
    const user = await createTestUser({ role: 'USER', familyMemberId: null });
    const res = await graphql(DEPTH_QUERY, {}, user);
    expect(res.errors[0].message).toMatch(/not yet linked/i);
    expect(res.data).toBeNull();
    expect(JSON.stringify(res)).not.toMatch(/Zulu|Mid|Yank|Aaa/);
  });

  it('returns members depth-first to a linked USER while familyMembers stays by lastname', async () => {
    const { root, child, grandchild, spouse } = await seedTree();
    const user = await createTestUser({ role: 'USER', familyMemberId: root.id });

    const depth = await graphql(DEPTH_QUERY, {}, user);
    expect(depth.errors).toBeUndefined();
    expect(depth.data.familyMembersDepthFirst.map((x) => Number(x.id))).toEqual([
      root.id, spouse.id, child.id, grandchild.id
    ].map(Number));

    const alpha = await graphql(ALPHA_QUERY, {}, user);
    expect(alpha.errors).toBeUndefined();
    // Aaa, Mid, Yank, Zulu
    expect(alpha.data.familyMembers.map((x) => Number(x.id))).toEqual([
      spouse.id, child.id, grandchild.id, root.id
    ].map(Number));
  });

  it('returns all members to an unlinked ADMIN', async () => {
    await seedTree();
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });
    const res = await graphql(DEPTH_QUERY, {}, admin);
    expect(res.errors).toBeUndefined();
    expect(res.data.familyMembersDepthFirst).toHaveLength(4);
  });
});
