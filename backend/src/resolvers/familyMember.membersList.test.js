import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const MEMBERS_QUERY = `
  query Members {
    familyMembers {
      id firstname lastname gender mothersname geezFirstname geezLastname geezMothersname
    }
  }
`;

beforeEach(resetTables);

async function seed() {
  return models.FamilyMember.create({
    firstname: 'Ada',
    lastname: 'Lovelace',
    gender: 'Female',
    mothersname: 'Anne',
    geezFirstname: 'ሰላም',
    geezLastname: 'ተስፋዬ',
    geezMothersname: 'አበባ'
  });
}

describe('familyMembers query (members list page data)', () => {
  it('returns no member data to an unauthenticated caller', async () => {
    await seed();
    const { data, errors } = await graphql(MEMBERS_QUERY, {}, null);
    expect(errors[0].message).toMatch(/logged in/i);
    expect(data).toBeNull();
    expect(JSON.stringify({ data, errors })).not.toContain('Lovelace');
  });

  it('rejects an unlinked non-admin USER', async () => {
    await seed();
    const user = await createTestUser({ role: 'USER', familyMemberId: null });
    const { data, errors } = await graphql(MEMBERS_QUERY, {}, user);
    expect(errors[0].message).toMatch(/not yet linked/i);
    expect(data).toBeNull();
  });

  it("returns names, Ge'ez names, mother and gender to a linked USER", async () => {
    const m = await seed();
    const user = await createTestUser({ role: 'USER', familyMemberId: m.id });
    const { data, errors } = await graphql(MEMBERS_QUERY, {}, user);
    expect(errors).toBeUndefined();
    expect(data.familyMembers[0]).toMatchObject({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      mothersname: 'Anne',
      geezFirstname: 'ሰላም',
      geezLastname: 'ተስፋዬ',
      geezMothersname: 'አበባ'
    });
  });

  it('returns all members to an unlinked ADMIN', async () => {
    await seed();
    await models.FamilyMember.create({ firstname: 'Bo', lastname: 'Zed', gender: 'Male' });
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });
    const { data, errors } = await graphql(MEMBERS_QUERY, {}, admin);
    expect(errors).toBeUndefined();
    expect(data.familyMembers).toHaveLength(2);
  });
});
