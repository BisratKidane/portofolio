import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { getSpouseRows } from '../services/familyMember.service.js';

const ADD_SPOUSE_MUTATION = `
  mutation AddSpouse($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSpouse(memberId: $memberId, newMember: $newMember) {
      id
      firstname
      lastname
    }
  }
`;

beforeEach(resetTables);
afterEach(() => vi.restoreAllMocks());

describe('addSpouse (PERM-01/PERM-02, D-01/D-02)', () => {
  it('adds a new spouse to the acting member-user themselves', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_SPOUSE_MUTATION,
      { memberId: String(self.id), newMember: { firstname: 'William', lastname: 'King', gender: 'Male' } },
      actor
    );

    expect(errors).toBeUndefined();
    expect(data.addSpouse.firstname).toBe('William');

    const rows = await getSpouseRows(self.id);
    expect(rows).toHaveLength(1);
    const spouseIds = [rows[0].memberAId, rows[0].memberBId];
    expect(spouseIds).toContain(self.id);
    expect(spouseIds).toContain(Number(data.addSpouse.id));
  });

  it('adds a new spouse to an in-scope relative (own child)', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const child = await models.FamilyMember.create({
      firstname: 'Byron',
      lastname: 'Lovelace',
      gender: 'Male',
      motherId: self.id
    });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      ADD_SPOUSE_MUTATION,
      { memberId: String(child.id), newMember: { firstname: 'Jane', lastname: 'Byron', gender: 'Female' } },
      actor
    );

    expect(errors).toBeUndefined();

    const rows = await getSpouseRows(child.id);
    expect(rows).toHaveLength(1);
    const spouseIds = [rows[0].memberAId, rows[0].memberBId];
    expect(spouseIds).toContain(child.id);
    expect(spouseIds).toContain(Number(data.addSpouse.id));
  });

  it('rejects a memberId outside the actor editable scope', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const stranger = await models.FamilyMember.create({ firstname: 'Stranger', lastname: 'Doe', gender: 'Male' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeMemberCount = await models.FamilyMember.count();
    const beforeSpouseCount = await models.Spouse.count();

    const { data, errors } = await graphql(
      ADD_SPOUSE_MUTATION,
      { memberId: String(stranger.id), newMember: { firstname: 'Outside', lastname: 'Scope', gender: 'Female' } },
      actor
    );

    expect(errors[0].message).toBe('This member is outside your editable scope.');
    expect(data).toBeNull();

    expect(await models.FamilyMember.count()).toBe(beforeMemberCount);
    expect(await models.Spouse.count()).toBe(beforeSpouseCount);
  });

  it('allows an ADMIN to addSpouse targeting any member', async () => {
    const target = await models.FamilyMember.create({ firstname: 'Someone', lastname: 'Else', gender: 'Male' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      ADD_SPOUSE_MUTATION,
      { memberId: String(target.id), newMember: { firstname: 'New', lastname: 'Spouse', gender: 'Female' } },
      admin
    );

    expect(errors).toBeUndefined();

    const rows = await getSpouseRows(target.id);
    expect(rows).toHaveLength(1);
  });

  it('rolls back the created spouse FamilyMember row if the Spouse join fails to commit', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const beforeCount = await models.FamilyMember.count();

    const createSpy = vi
      .spyOn(models.Spouse, 'create')
      .mockRejectedValueOnce(new Error('simulated spouse join failure'));

    const { data, errors } = await graphql(
      ADD_SPOUSE_MUTATION,
      { memberId: String(self.id), newMember: { firstname: 'William', lastname: 'King', gender: 'Male' } },
      actor
    );

    createSpy.mockRestore();

    expect(data).toBeNull();
    expect(errors[0].message).toBe('simulated spouse join failure');

    const afterCount = await models.FamilyMember.count();
    expect(afterCount).toBe(beforeCount);
  });
});
