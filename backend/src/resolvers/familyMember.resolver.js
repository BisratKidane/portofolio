import { requireAdmin, requireFamilyAccess } from '../utils/auth.js';
import { sanitizeNewMember } from './user.resolver.js';
import {
  computeEditableScope,
  linkParent,
  setSpouse,
  addChild,
  deleteMember as deleteFamilyMember
} from '../services/familyMember.service.js';

export const familyMemberResolvers = {
  Query: {
    familyMembers: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
    },
    familyMember: async (_parent, { id }, { models, user }) => {
      requireFamilyAccess(user);
      return models.FamilyMember.findByPk(id);
    },
    // T-14-10 (accept): no arguments exist for a client to request another
    // user's scope -- the returned set is entirely server-derived from
    // user.familyMemberId, so no cross-user leak is possible by construction.
    myEditableMembers: async (_parent, _args, { user }) => {
      requireFamilyAccess(user);
      if (user.familyMemberId == null) return [];

      const scope = await computeEditableScope(user.familyMemberId);
      const rows = [scope.self, ...scope.parents, ...scope.spouses, ...scope.children, ...scope.siblings].filter(
        Boolean
      );

      const seen = new Map();
      for (const row of rows) seen.set(row.id, row);
      return [...seen.values()];
    }
  },
  Mutation: {
    // T-14-01/T-14-02 (mitigate): every non-admin call is scope-checked via
    // computeEditableScope (PERM-05 single source of truth) before any
    // write, and D-01 is enforced structurally -- this mutation only ever
    // accepts a `newMember` payload for the parent being added, never an
    // existing-node id.
    addParent: async (_parent, { memberId, role, newMember }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(memberId);
      const isAdmin = user.role === 'ADMIN';

      if (!isAdmin) {
        const scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      const slot = role === 'MOTHER' ? 'motherId' : 'fatherId';

      return models.User.sequelize.transaction(async (t) => {
        const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
        if (!target) throw new Error('Family member not found.');

        if (target[slot] != null && !isAdmin) {
          throw new Error(`This member already has a ${role.toLowerCase()} on record.`);
        }

        const parent = await models.FamilyMember.create(sanitizeNewMember(newMember), { transaction: t });
        await linkParent(targetId, { [slot]: parent.id }, { transaction: t });

        return parent;
      });
    },
    // T-14-01 (mitigate): identical non-admin scope check to addParent, gated
    // through the same computeEditableScope single source of truth; D-01 is
    // enforced structurally (newMember-only, never an existing-node id).
    addSpouse: async (_parent, { memberId, newMember }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(memberId);
      const isAdmin = user.role === 'ADMIN';

      if (!isAdmin) {
        const scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      return models.User.sequelize.transaction(async (t) => {
        const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
        if (!target) throw new Error('Family member not found.');

        const spouse = await models.FamilyMember.create(sanitizeNewMember(newMember), { transaction: t });
        await setSpouse(targetId, spouse.id, { transaction: t });

        return spouse;
      });
    },
    // T-14-01 (mitigate, primary SC-4 target): `otherParentId` -- the ONE
    // argument in this entire phase where a member-user references an
    // EXISTING node id to complete a relationship -- is checked against the
    // SAME scope.ids computed for the primary target, before the transaction
    // opens. T-14-02 (mitigate): only the NEW child's FK slots are ever set;
    // neither memberId's nor otherParentId's own motherId/fatherId is ever
    // rewritten by this mutation.
    addChild: async (_parent, { memberId, role, newMember, otherParentId }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(memberId);
      const isAdmin = user.role === 'ADMIN';

      let scope;
      if (!isAdmin) {
        scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      let otherId = null;
      if (otherParentId != null) {
        otherId = Number(otherParentId);
        if (!isAdmin && !scope.ids.has(otherId)) {
          throw new Error('You may only reference relatives already within your editable scope.');
        }
      }

      const slot = role === 'MOTHER' ? 'motherId' : 'fatherId';
      const otherSlot = role === 'MOTHER' ? 'fatherId' : 'motherId';

      return models.User.sequelize.transaction(async (t) => {
        const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
        if (!target) throw new Error('Family member not found.');

        let otherParent = null;
        if (otherId != null) {
          otherParent = await models.FamilyMember.findByPk(otherId, { transaction: t });
          if (!otherParent) throw new Error('Family member not found.');
        }

        const attrs = { ...sanitizeNewMember(newMember), [slot]: targetId };
        if (otherParent) attrs[otherSlot] = otherId;

        return addChild(attrs, { transaction: t });
      });
    },
    // T-14-09 (mitigate): the no-parent-recorded rejection is a data-integrity
    // rule, not a scope boundary -- it applies even to admins, since fabricating
    // a placeholder parent nobody created would corrupt the tree regardless of
    // who requested it.
    addSibling: async (_parent, { memberId, newMember }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(memberId);
      const isAdmin = user.role === 'ADMIN';

      let scope;
      if (!isAdmin) {
        scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      return models.User.sequelize.transaction(async (t) => {
        const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
        if (!target) throw new Error('Family member not found.');

        if (target.motherId == null && target.fatherId == null) {
          throw new Error('Add a parent first — siblings are derived from a shared parent.');
        }

        // CR-02 (mitigate, SC-4): the parent FKs copied off the target are an
        // implicit reference to EXISTING nodes, exactly like addChild's
        // otherParentId -- and computeEditableScope is one hop, so a child's
        // co-parent or a spouse's parents are provably outside scope. Reject
        // with addChild's message so both doors enforce the same control.
        if (!isAdmin) {
          const inherited = [target.motherId, target.fatherId]
            .filter((id) => id != null)
            .map(Number);
          if (!inherited.every((id) => scope.ids.has(id))) {
            throw new Error('You may only reference relatives already within your editable scope.');
          }
        }

        const attrs = { ...sanitizeNewMember(newMember) };
        if (target.motherId != null) attrs.motherId = target.motherId;
        if (target.fatherId != null) attrs.fatherId = target.fatherId;

        return addChild(attrs, { transaction: t });
      });
    },
    // T-14-01 (mitigate): identical non-admin scope check via
    // computeEditableScope. T-14-03 (mitigate, D-06 field-lock): compares
    // target.linkedUser.id against the ACTING user's id (user.id), not
    // user.familyMemberId -- this is the exact identity match that keeps
    // self-edit allowed while blocking edits to a relative who manages their
    // own linked profile. D-05 is enforced structurally by
    // EditFamilyMemberInput's schema shape (no edge-mutating field exists at
    // all), not by resolver logic.
    editMember: async (_parent, { id, fields }, { models, user }) => {
      requireFamilyAccess(user);

      const targetId = Number(id);
      const isAdmin = user.role === 'ADMIN';

      if (!isAdmin) {
        const scope = await computeEditableScope(user.familyMemberId);
        if (!scope.ids.has(targetId)) {
          throw new Error('This member is outside your editable scope.');
        }
      }

      const target = await models.FamilyMember.findByPk(targetId, {
        include: [{ association: 'linkedUser' }]
      });
      if (!target) throw new Error('Family member not found.');

      if (!isAdmin && target.linkedUser && target.linkedUser.id !== user.id) {
        throw new Error('This member manages their own profile and cannot be edited by others.');
      }

      return target.update(sanitizeNewMember(fields));
    },
    // T-14-04 (mitigate): requireAdmin(user) is the FIRST and ONLY guard --
    // deliberately no computeEditableScope call anywhere in this resolver.
    // Members have zero delete capability by construction, not by a scope
    // check that happens to always fail for non-admins (PERM-03/PERM-04).
    // D-10: reuses the Phase 12 deleteMember service function verbatim,
    // imported under the deleteFamilyMember alias to avoid shadowing this
    // resolver map's own deleteMember key.
    deleteMember: async (_parent, { id }, { models, user }) => {
      requireAdmin(user);

      const targetId = Number(id);
      const target = await models.FamilyMember.findByPk(targetId);
      if (!target) throw new Error('Family member not found.');

      await deleteFamilyMember(targetId);
      return true;
    }
  },
  FamilyMember: {
    // PHOTO-01: computed, never a raw column passthrough -- exposes only the
    // route path clients fetch bytes from, never the stored filename itself.
    photoUrl: (member) => (member.profilePicture ? `/api/family-members/${member.id}/photo` : null),
    mother: (member, _args, { loaders }) =>
      member.motherId != null ? loaders.memberById.load(Number(member.motherId)) : null,
    father: (member, _args, { loaders }) =>
      member.fatherId != null ? loaders.memberById.load(Number(member.fatherId)) : null,
    spouses: (member, _args, { loaders }) => loaders.spousesByMemberId.load(Number(member.id)),
    children: (member, _args, { loaders }) => loaders.childrenByParentId.load(Number(member.id)),
    // Derived, never stored (REL-04/D-03): reuses the same batched
    // childrenByParentId loader `children` uses -- no dedicated siblings
    // loader is added. Collect this member's non-null parent ids, load each
    // parent's children (already batched/cached per-request), flatten and
    // de-duplicate by id, then exclude the member itself.
    siblings: async (member, _args, { loaders }) => {
      const parentIds = [member.motherId, member.fatherId].filter((id) => id != null).map(Number);
      if (parentIds.length === 0) return [];

      const childArrays = await Promise.all(
        parentIds.map((parentId) => loaders.childrenByParentId.load(parentId))
      );

      const byId = new Map();
      for (const children of childArrays) {
        for (const child of children) {
          byId.set(child.id, child);
        }
      }
      byId.delete(member.id);

      return [...byId.values()];
    },
    // Deliberate, discretionary choice (not an oversight): linkedUser uses
    // the Sequelize-generated association mixin directly rather than a
    // DataLoader. Unlike children/spouses/siblings, this field is not on the
    // deep-fan-out recursive traversal path, so per-node batching is lower
    // priority here.
    //
    // CR-01 (mitigate): the User type carries email/role, which Query.users
    // and Query.unlinkedUsers protect with requireAdmin. Member ids are
    // sequential, so an ungated traversal here would let any linked USER
    // enumerate the whole user table. Resolve the row only for an ADMIN, or
    // when the linked user IS the acting user; otherwise null (the SDL field
    // is nullable).
    linkedUser: async (member, _args, { user }) => {
      const linked = await member.getLinkedUser();
      if (!linked) return null;
      if (user?.role === 'ADMIN' || linked.id === user?.id) return linked;
      return null;
    }
  }
};
