import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetPasswordDialog from './SetPasswordDialog.jsx';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../../api/graphqlClient.js';

const SET_USER_PASSWORD_MUTATION = `
  mutation SetUserPassword($userId: ID!, $newPassword: String!) {
    setUserPassword(userId: $userId, newPassword: $newPassword)
  }
`;

const USER = { id: '9', name: 'Grace Hopper', email: 'grace@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(<SetPasswordDialog open user={USER} onClose={onClose} onSaved={onSaved} {...props} />);
  return { ...utils, onClose, onSaved };
}

describe('SetPasswordDialog', () => {
  it('submits setUserPassword with the target user id and new password', async () => {
    graphqlRequest.mockResolvedValueOnce({ setUserPassword: true });
    const { onSaved, onClose } = renderDialog();

    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'AdminSetPass1!');
    await userEvent.type(screen.getByLabelText('Confirm', { exact: false }), 'AdminSetPass1!');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(SET_USER_PASSWORD_MUTATION, {
        userId: '9',
        newPassword: 'AdminSetPass1!'
      });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks submit and warns when the two passwords do not match', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'AdminSetPass1!');
    await userEvent.type(screen.getByLabelText('Confirm', { exact: false }), 'Different1!');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('renders the mutation error and keeps the dialog open', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Password must be at least 8 characters.'));
    const { onClose } = renderDialog();

    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'abcdefgh');
    await userEvent.type(screen.getByLabelText('Confirm', { exact: false }), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
