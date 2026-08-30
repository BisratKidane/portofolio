import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const PENDING_APPROVALS_QUERY = `
  query {
    pendingApprovals {
      id
      name
      email
      status
      emailVerified
      relationshipNote
    }
  }
`;

beforeEach(resetTables);

// D-11: pendingApprovals is a new, admin-only query returning exactly the
// Pending+email-verified self-registrations awaiting an admin decision --
// coexisting with the untouched pendingRegistrations query (invitation-flow
// specific). REG-05: an unverified self-registration must never appear.
describe('pendingApprovals (D-11, REG-05)', () => {
  it('returns a Pending, email-verified self-registrant, including one whose relationshipNote is null (F-01)', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const withNote = await createTestUser({
      email: 'with-note@example.com',
      name: 'With Note',
      status: 'Pending',
      emailVerified: true,
      role: 'USER',
      relationshipNote: 'My second cousin'
    });
    const withoutNote = await createTestUser({
      email: 'without-note@example.com',
      name: 'Without Note',
      status: 'Pending',
      emailVerified: true,
      role: 'USER',
      relationshipNote: null
    });

    const { data, errors } = await graphql(PENDING_APPROVALS_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    const ids = data.pendingApprovals.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([String(withNote.id), String(withoutNote.id)]));

    const noteRow = data.pendingApprovals.find((row) => row.id === String(withoutNote.id));
    // F-01: an empty note is a normal state, not excluded from the queue.
    expect(noteRow.relationshipNote).toBeNull();

    const withNoteRow = data.pendingApprovals.find((row) => row.id === String(withNote.id));
    expect(withNoteRow.relationshipNote).toBe('My second cousin');
  });

  it('does not return a Pending, email-unverified self-registrant (REG-05)', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin-unverified-check@example.com' });
    const unverified = await createTestUser({
      email: 'unverified-self-reg@example.com',
      status: 'Pending',
      emailVerified: false,
      role: 'USER'
    });

    const { data, errors } = await graphql(PENDING_APPROVALS_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    const ids = data.pendingApprovals.map((row) => row.id);
    expect(ids).not.toContain(String(unverified.id));
  });

  it('does not return an Active user', async () => {
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin-active-check@example.com' });
    const active = await createTestUser({
      email: 'already-active@example.com',
      status: 'Active',
      emailVerified: true,
      role: 'USER'
    });

    const { data, errors } = await graphql(PENDING_APPROVALS_QUERY, {}, admin);

    expect(errors).toBeUndefined();
    const ids = data.pendingApprovals.map((row) => row.id);
    expect(ids).not.toContain(String(active.id));
  });

  it('refuses a non-admin caller', async () => {
    const nonAdmin = await createTestUser({ role: 'USER', email: 'non-admin@example.com' });

    const { data, errors } = await graphql(PENDING_APPROVALS_QUERY, {}, nonAdmin);

    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();
  });

  it('refuses an unauthenticated caller', async () => {
    const { data, errors } = await graphql(PENDING_APPROVALS_QUERY, {}, null);

    expect(errors[0].message).toBe('You must be logged in to perform this action.');
    expect(data).toBeNull();
  });
});
