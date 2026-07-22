import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { setSpouse } from '../services/familyMember.service.js';

const DELETE_MEMBER_MUTATION = `
  mutation DeleteMember($id: ID!) {
    deleteMember(id: $id)
  }
`;

beforeEach(resetTables);

describe('deleteMember (PERM-03/PERM-04, admin-only by construction)', () => {
  it('rejects a linked member-user attempting to delete any member, including themselves', async () => {
    const self = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
    const actor = await createTestUser({ role: 'USER', familyMemberId: self.id });

    const { data, errors } = await graphql(
      DELETE_MEMBER_MUTATION,
      { id: String(self.id) },
      actor
    );

    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();

    const stillExists = await models.FamilyMember.findByPk(self.id);
    expect(stillExists).not.toBeNull();
  });

  it('allows an ADMIN to delete a member with no spouse/children', async () => {
    const member = await models.FamilyMember.create({ firstname: 'Solo', lastname: 'Person', gender: 'Male' });
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      DELETE_MEMBER_MUTATION,
      { id: String(member.id) },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.deleteMember).toBe(true);

    const deleted = await models.FamilyMember.findByPk(member.id);
    expect(deleted).toBeNull();
  });

  it('allows an ADMIN to delete a mid-tree member, preserving blood spouse and children (Phase 12 married-in semantics unaffected)', async () => {
    const grandparent = await models.FamilyMember.create({ firstname: 'Grandparent', lastname: 'Doe', gender: 'Female' });
    const otherRoot = await models.FamilyMember.create({ firstname: 'OtherRoot', lastname: 'Doe', gender: 'Male' });
    const parent = await models.FamilyMember.create({
      firstname: 'Parent',
      lastname: 'Doe',
      gender: 'Male',
      motherId: grandparent.id
    });
    const child = await models.FamilyMember.create({
      firstname: 'Child',
      lastname: 'Doe',
      gender: 'Female',
      motherId: parent.id
    });
    const bloodSpouse = await models.FamilyMember.create({
      firstname: 'BloodSpouse',
      lastname: 'Doe',
      gender: 'Female',
      motherId: otherRoot.id
    });
    await setSpouse(parent.id, bloodSpouse.id);
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      DELETE_MEMBER_MUTATION,
      { id: String(parent.id) },
      admin
    );

    expect(errors).toBeUndefined();
    expect(data.deleteMember).toBe(true);

    const reloadedParent = await models.FamilyMember.findByPk(parent.id);
    expect(reloadedParent).toBeNull();

    const reloadedChild = await models.FamilyMember.findByPk(child.id);
    expect(reloadedChild).not.toBeNull();
    expect(reloadedChild.motherId).toBeNull();

    const reloadedBloodSpouse = await models.FamilyMember.findByPk(bloodSpouse.id);
    expect(reloadedBloodSpouse).not.toBeNull();
  });

  it('rejects deleting a non-existent id as an ADMIN', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const { data, errors } = await graphql(
      DELETE_MEMBER_MUTATION,
      { id: '999999' },
      admin
    );

    expect(errors[0].message).toBe('Family member not found.');
    expect(data).toBeNull();
  });
});
