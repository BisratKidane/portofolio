import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) {
      id
      geezFirstname
      geezLastname
      geezMothersname
      geezFullname
    }
  }
`;

const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id
      geezFirstname
      geezLastname
      geezMothersname
      geezFullname
    }
  }
`;

// Shared Ethiopic samples (matching backend/src/models/FamilyMember.test.js
// lines 203, 214, 236-238). geezFullname joins only first+last (D-01),
// excluding geezMothersname.
const GEEZ_FIRSTNAME = 'ጃነ';
const GEEZ_LASTNAME = 'ዶ';
const GEEZ_MOTHERSNAME = 'ኣለም';
const EXPECTED_GEEZ_FULLNAME = 'ጃነ ዶ';

beforeEach(resetTables);

describe('Ge\'ez fields over the GraphQL API (DATA-03, D-05)', () => {
  it('create-path round-trip via addChild: reads back the three writable fields and derives geezFullname', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_CHILD_MUTATION,
      {
        memberId: String(self.id),
        role: 'MOTHER',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
          gender: 'Male',
          geezFirstname: GEEZ_FIRSTNAME,
          geezLastname: GEEZ_LASTNAME,
          geezMothersname: GEEZ_MOTHERSNAME
        },
        otherParentId: null
      },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.addChild.geezFirstname).toBe(GEEZ_FIRSTNAME);
    expect(data.addChild.geezLastname).toBe(GEEZ_LASTNAME);
    expect(data.addChild.geezMothersname).toBe(GEEZ_MOTHERSNAME);
    expect(data.addChild.geezFullname).toBe(EXPECTED_GEEZ_FULLNAME);
  });

  it('editMember SET: reads back the Ge\'ez fields and derives geezFullname', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(self.id), fields: { geezFirstname: GEEZ_FIRSTNAME, geezLastname: GEEZ_LASTNAME } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.geezFirstname).toBe(GEEZ_FIRSTNAME);
    expect(data.editMember.geezLastname).toBe(GEEZ_LASTNAME);
    expect(data.editMember.geezFullname).toBe(EXPECTED_GEEZ_FULLNAME);
  });

  it('(SC3, load-bearing) editMember CLEAR-TO-NULL: clearing geezFirstname with \'\' persists strictly null, not \'\'', async () => {
    const self = await models.FamilyMember.create({
      firstname: 'Ada',
      lastname: 'Lovelace',
      gender: 'Female',
      geezFirstname: GEEZ_FIRSTNAME,
      geezLastname: GEEZ_LASTNAME
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      EDIT_MEMBER_MUTATION,
      { id: String(self.id), fields: { geezFirstname: '' } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.editMember.geezFirstname).toBeNull();

    await self.reload();
    expect(self.geezFirstname).toBeNull();
  });
});
