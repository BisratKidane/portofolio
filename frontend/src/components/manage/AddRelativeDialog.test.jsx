import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddRelativeDialog from './AddRelativeDialog.jsx';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../../api/graphqlClient.js';

const ADD_PARENT_MUTATION = `
  mutation AddParent($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!) {
    addParent(memberId: $memberId, role: $role, newMember: $newMember) { id fullname }
  }
`;

const ADD_SPOUSE_MUTATION = `
  mutation AddSpouse($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSpouse(memberId: $memberId, newMember: $newMember) { id fullname }
  }
`;

const IN_SCOPE_MEMBERS = [{ id: '20', fullname: 'William King' }];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const utils = render(
    <AddRelativeDialog
      open
      relationType="parent"
      targetId="1"
      inScopeMembers={IN_SCOPE_MEMBERS}
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />
  );
  return { ...utils, onClose, onCreated };
}

describe('AddRelativeDialog - parent', () => {
  it('renders "Add member" as the primary submit button', () => {
    renderDialog({ relationType: 'parent' });
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
  });

  it('submits addParent with role and form fields, then calls onCreated and onClose', async () => {
    graphqlRequest.mockResolvedValueOnce({ addParent: { id: '30', fullname: 'Byron Lovelace' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'parent' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Byron');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_PARENT_MUTATION, {
        memberId: '1',
        role: 'MOTHER',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
          gender: 'Male',
          mothersname: '',
          email: '',
          birthdate: '',
          deathdate: '',
          phone: '',
          address: ''
        }
      });
    });

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddRelativeDialog - spouse', () => {
  it('does not render a role field for spouse', () => {
    renderDialog({ relationType: 'spouse' });
    expect(screen.queryByLabelText('Role', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
  });

  it('submits addSpouse with form fields only', async () => {
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '31', fullname: 'William King' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'William');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'King');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_SPOUSE_MUTATION, {
        memberId: '1',
        newMember: {
          firstname: 'William',
          lastname: 'King',
          gender: 'Male',
          mothersname: '',
          email: '',
          birthdate: '',
          deathdate: '',
          phone: '',
          address: ''
        }
      });
    });

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the mutation error and keeps the dialog open on rejection', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Something went wrong.'));
    const { onClose, onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'William');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'King');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
