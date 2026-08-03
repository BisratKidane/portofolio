import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const FAMILY_HEAD_QUERY = `
  query FamilyHead {
    familyHead {
      id
      firstname
      lastname
    }
  }
`;

// resetTables() truncates family_members, which resets AUTO_INCREMENT to 1
// (MySQL/MariaDB TRUNCATE semantics). Deleting a row does NOT reclaim its id
// within the same server session, so destroying the id-1 row immediately
// after creating it deterministically exercises the "id 1 absent" fallback
// path for the rest of a given test.
async function removeIdOne() {
  const placeholder = await models.FamilyMember.create({ firstname: 'Placeholder', lastname: 'Placeholder', gender: 'Male' });
  expect(placeholder.id).toBe(1);
  await placeholder.destroy();
}

beforeEach(resetTables);

describe('Query.familyHead (SC-1, D-01/D-02)', () => {
  it('returns the member with id 1 (fast path) even when other apex members with larger subtrees exist', async () => {
    const head = await models.FamilyMember.create({ firstname: 'Agne', lastname: 'Weldehiwet', gender: 'Female' });
    expect(head.id).toBe(1);

    const otherApex = await models.FamilyMember.create({ firstname: 'Bisrat', lastname: 'Kidane', gender: 'Male' });
    await models.FamilyMember.create({ firstname: 'C1', lastname: 'Kidane', gender: 'Male', motherId: otherApex.id });
    await models.FamilyMember.create({ firstname: 'C2', lastname: 'Kidane', gender: 'Female', motherId: otherApex.id });

    const admin = await createTestUser({ role: 'ADMIN' });
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.familyHead.id).toBe('1');
    expect(data.familyHead.firstname).toBe('Agne');
  });

  it('falls back to the largest-subtree apex when id 1 is absent', async () => {
    await removeIdOne();

    const smallApex = await models.FamilyMember.create({ firstname: 'Small', lastname: 'Zamora', gender: 'Male' });
    const bigApex = await models.FamilyMember.create({ firstname: 'Big', lastname: 'Anderson', gender: 'Male' });
    await models.FamilyMember.create({ firstname: 'BigChild1', lastname: 'Anderson', gender: 'Male', motherId: bigApex.id });
    await models.FamilyMember.create({ firstname: 'BigChild2', lastname: 'Anderson', gender: 'Female', motherId: bigApex.id });
    void smallApex;

    const admin = await createTestUser({ role: 'ADMIN' });
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.familyHead.id).toBe(String(bigApex.id));
    expect(data.familyHead.firstname).toBe('Big');
  });

  it('breaks a subtree-size tie by lastname ASC, firstname ASC (matching the client scan order)', async () => {
    await removeIdOne();

    const apexBravo = await models.FamilyMember.create({ firstname: 'Bravo', lastname: 'Bravo', gender: 'Male' });
    const apexAlpha = await models.FamilyMember.create({ firstname: 'Alpha', lastname: 'Alpha', gender: 'Female' });
    void apexBravo;

    const admin = await createTestUser({ role: 'ADMIN' });
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.familyHead.id).toBe(String(apexAlpha.id));
    expect(data.familyHead.lastname).toBe('Alpha');
  });

  it('falls back to the first member (lastname/firstname order) when no apex member exists at all', async () => {
    await removeIdOne();

    const memberA = await models.FamilyMember.create({ firstname: 'Zed', lastname: 'AAA', gender: 'Male' });
    const memberB = await models.FamilyMember.create({ firstname: 'Ann', lastname: 'AAA', gender: 'Female' });
    // Give each other as a parent so neither is a parentless apex.
    await memberA.update({ motherId: memberB.id });
    await memberB.update({ motherId: memberA.id });

    const admin = await createTestUser({ role: 'ADMIN' });
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.familyHead.lastname).toBe('AAA');
    expect(data.familyHead.firstname).toBe('Ann');
  });

  it('returns null when family_members is empty', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    expect(data.familyHead).toBeNull();
  });

  it('rejects an anonymous caller with the same error requireFamilyAccess throws for familyMember/familyMembers', async () => {
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, null);

    expect(data.familyHead).toBeNull();
    expect(errors[0].message).toBe('You must be logged in to perform this action.');
  });

  it('rejects an unlinked non-admin caller', async () => {
    const unlinked = await createTestUser({ role: 'USER' });
    const { data, errors } = await graphql(FAMILY_HEAD_QUERY, {}, unlinked);

    expect(data.familyHead).toBeNull();
    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
  });
});
