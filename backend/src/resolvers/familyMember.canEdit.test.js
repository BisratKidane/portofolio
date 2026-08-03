import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

const CAN_EDIT_QUERY = `
  query Member($id: ID!) {
    familyMember(id: $id) {
      id
      canEdit
    }
  }
`;

beforeEach(resetTables);

describe('FamilyMember.canEdit (SC-5, D-07/D-08)', () => {
  it('resolves true when queried by an ADMIN actor', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(CAN_EDIT_QUERY, { id: String(base.id) }, admin);

    expect(errors).toBeUndefined();
    expect(data.familyMember.canEdit).toBe(true);
  });

  it('resolves false when queried by a linked non-admin USER actor', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const viewer = await createTestUser({ role: 'USER', email: 'viewer@example.com', familyMemberId: base.id });

    const { data, errors } = await graphql(CAN_EDIT_QUERY, { id: String(base.id) }, viewer);

    expect(errors).toBeUndefined();
    expect(data.familyMember.canEdit).toBe(false);
  });

  it('rejects an anonymous caller at the parent familyMember query, never reaching canEdit', async () => {
    const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });

    const { data, errors } = await graphql(CAN_EDIT_QUERY, { id: String(base.id) }, null);

    // familyMember(id: ID!): FamilyMember is nullable -- a requireFamilyAccess
    // error nulls this field only, not the whole data root (mirrors
    // familyMember.head.test.js's anonymous-rejection assertion shape).
    expect(data.familyMember).toBeNull();
    expect(errors[0].message).toBe('You must be logged in to perform this action.');
  });
});
