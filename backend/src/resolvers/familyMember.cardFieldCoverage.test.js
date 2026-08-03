import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

// SC-2, D-09: proves the existing familyMember(id) query already returns
// every field the person card needs (Latin + Ge'ez name, gender,
// birth/death info, photo) in ONE operation -- this file adds no
// production schema/resolver code, it only verifies field coverage.
const CARD_FIELD_COVERAGE_QUERY = `
  query Member($id: ID!) {
    familyMember(id: $id) {
      id
      firstname
      lastname
      fullname
      gender
      geezFirstname
      geezLastname
      geezFullname
      birthdate
      isAlive
      photoUrl
      canEdit
    }
  }
`;

const GEEZ_FIRSTNAME = 'ጃነ';
const GEEZ_LASTNAME = 'ዶ';
const EXPECTED_GEEZ_FULLNAME = 'ጃነ ዶ';

beforeEach(resetTables);

describe('familyMember(id) card field coverage (SC-2, D-09 -- no rebuild)', () => {
  it('returns every person-card field in a single query', async () => {
    const member = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      geezFirstname: GEEZ_FIRSTNAME,
      geezLastname: GEEZ_LASTNAME,
      birthdate: '1815-12-10',
      isAlive: false,
      profilePicture: 'some-uuid-filename.jpg'
    });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(CARD_FIELD_COVERAGE_QUERY, { id: String(member.id) }, admin);

    expect(errors).toBeUndefined();
    const result = data.familyMember;

    expect(result.id).toBe(String(member.id));
    expect(result.firstname).toBe('Ada');
    expect(result.lastname).toBe('Lovelace');
    expect(result.fullname).toBe('Ada Lovelace');
    expect(['Male', 'Female', 'Other']).toContain(result.gender);
    expect(result.gender).toBe('Female');
    expect(result.geezFirstname).toBe(GEEZ_FIRSTNAME);
    expect(result.geezLastname).toBe(GEEZ_LASTNAME);
    expect(result.geezFullname).toBe(EXPECTED_GEEZ_FULLNAME);
    expect(result.birthdate).toBe('1815-12-10');
    expect(result.isAlive).toBe(false);
    expect(result.photoUrl).toBe(`/api/family-members/${member.id}/photo`);
    expect(result.canEdit).toBe(true);
  });
});
