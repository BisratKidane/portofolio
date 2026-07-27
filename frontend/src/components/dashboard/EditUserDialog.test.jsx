import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditUserDialog from './EditUserDialog.jsx';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../../api/graphqlClient.js';

const UPDATE_USER_MUTATION = `
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      id
      name
      email
      role
      emailVerified
    }
  }
`;

const USER = { id: '7', name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER' };

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onRequireReverify = vi.fn();
  const utils = render(
    <EditUserDialog
      open
      user={USER}
      onClose={onClose}
      onSaved={onSaved}
      onRequireReverify={onRequireReverify}
      {...props}
    />
  );
  return { ...utils, onClose, onSaved, onRequireReverify };
}

describe('EditUserDialog', () => {
  it('pre-fills name and email from the user prop', () => {
    renderDialog();
    expect(screen.getByLabelText('Name', { exact: false })).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('Email', { exact: false })).toHaveValue('ada@example.com');
  });

  it('hides the role selector unless the actor can edit roles', () => {
    renderDialog({ canEditRole: false });
    expect(screen.queryByLabelText('Role', { exact: false })).not.toBeInTheDocument();
  });

  it('shows the role selector when the actor can edit roles', () => {
    renderDialog({ canEditRole: true });
    expect(screen.getByLabelText('Role', { exact: false })).toBeInTheDocument();
  });

  it('submits updateUser with name + email (no role) for a non-role editor', async () => {
    graphqlRequest.mockResolvedValueOnce({ updateUser: { id: '7' } });
    const { onSaved, onClose } = renderDialog({ canEditRole: false });

    const nameField = screen.getByLabelText('Name', { exact: false });
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'Augusta Ada');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(UPDATE_USER_MUTATION, {
        id: '7',
        input: { name: 'Augusta Ada', email: 'ada@example.com' }
      });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('includes role in the payload when the actor can edit roles', async () => {
    graphqlRequest.mockResolvedValueOnce({ updateUser: { id: '7' } });
    renderDialog({ canEditRole: true });

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(graphqlRequest).toHaveBeenCalled());
    const [, variables] = graphqlRequest.mock.calls[0];
    expect(variables.input).toHaveProperty('role', 'USER');
  });

  it('warns that changing your own email requires re-verification', async () => {
    renderDialog({ isSelf: true });

    const emailField = screen.getByLabelText('Email', { exact: false });
    await userEvent.clear(emailField);
    await userEvent.type(emailField, 'new@example.com');

    expect(screen.getByText(/re-?verif/i)).toBeInTheDocument();
  });

  it('routes a self email change to onRequireReverify instead of onSaved', async () => {
    graphqlRequest.mockResolvedValueOnce({ updateUser: { id: '7', emailVerified: false } });
    const { onSaved, onRequireReverify } = renderDialog({ isSelf: true });

    const emailField = screen.getByLabelText('Email', { exact: false });
    await userEvent.clear(emailField);
    await userEvent.type(emailField, 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onRequireReverify).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('renders the mutation error and keeps the dialog open on rejection', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('A user with this email already exists.'));
    const { onClose, onSaved } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
