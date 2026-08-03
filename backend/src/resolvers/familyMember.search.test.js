import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const SEARCH_QUERY = `
  query SearchFamilyMembers($term: String!, $limit: Int) {
    searchFamilyMembers(term: $term, limit: $limit) {
      id
      firstname
      lastname
    }
  }
`;

// Real-shaped Ge'ez samples (matching backend/src/resolvers/familyMember.geez.test.js convention).
const GEEZ_FIRSTNAME = 'ጃነ';
const GEEZ_LASTNAME = 'ዶ';

beforeEach(resetTables);

describe('Query.searchFamilyMembers (SC-3, D-03/D-04)', () => {
  it('matches a partial, case-insensitive Latin substring', async () => {
    await models.FamilyMember.create({ firstname: 'Bisrat', lastname: 'Kidane', gender: 'Male' });
    await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: 'isr' }, admin);

    expect(errors).toBeUndefined();
    expect(data.searchFamilyMembers).toHaveLength(1);
    expect(data.searchFamilyMembers[0].firstname).toBe('Bisrat');
  });

  it('matches a Ge\'ez substring on geezFirstname/geezLastname', async () => {
    await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      geezFirstname: GEEZ_FIRSTNAME,
      geezLastname: GEEZ_LASTNAME
    });
    await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: GEEZ_FIRSTNAME }, admin);

    expect(errors).toBeUndefined();
    expect(data.searchFamilyMembers).toHaveLength(1);
    expect(data.searchFamilyMembers[0].firstname).toBe('Byron');
  });

  it('does not match a substring that only appears in mothersname', async () => {
    await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      mothersname: 'Zephyrine'
    });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: 'Zephyr' }, admin);

    expect(errors).toBeUndefined();
    expect(data.searchFamilyMembers).toEqual([]);
  });

  it('returns an empty array for a blank/whitespace-only term without matching every row', async () => {
    await models.FamilyMember.create({ firstname: 'Bisrat', lastname: 'Kidane', gender: 'Male' });
    await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: '   ' }, admin);

    expect(errors).toBeUndefined();
    expect(data.searchFamilyMembers).toEqual([]);
  });

  it('caps results and sorts lastname ASC, firstname ASC', async () => {
    await models.FamilyMember.create({ firstname: 'Charlie', lastname: 'Zulu', gender: 'Male' });
    await models.FamilyMember.create({ firstname: 'Alice', lastname: 'Alpha', gender: 'Female' });
    await models.FamilyMember.create({ firstname: 'Bob', lastname: 'Bravo', gender: 'Male' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: 'a', limit: 2 }, admin);

    expect(errors).toBeUndefined();
    expect(data.searchFamilyMembers).toHaveLength(2);
    expect(data.searchFamilyMembers[0].lastname).toBe('Alpha');
    expect(data.searchFamilyMembers[1].lastname).toBe('Bravo');
  });

  it('rejects an anonymous caller before matching', async () => {
    await models.FamilyMember.create({ firstname: 'Bisrat', lastname: 'Kidane', gender: 'Male' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: 'Bis' }, null);

    // searchFamilyMembers is non-nullable ([FamilyMember!]!) -- a resolver
    // error nulls the whole data root, not just this field.
    expect(data).toBeNull();
    expect(errors[0].message).toBe('You must be logged in to perform this action.');
  });

  it('rejects an unlinked non-admin caller', async () => {
    const unlinked = await createTestUser({ role: 'USER' });

    const { data, errors } = await graphql(SEARCH_QUERY, { term: 'Bis' }, unlinked);

    expect(data).toBeNull();
    expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
  });
});
