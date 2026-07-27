import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangePasswordDialog from './ChangePasswordDialog.jsx';

const changePassword = vi.fn();

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ changePassword })
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const utils = render(<ChangePasswordDialog open onClose={onClose} onChanged={onChanged} {...props} />);
  return { ...utils, onClose, onChanged };
}

describe('ChangePasswordDialog', () => {
  it('changes the password via AuthContext with the current + new password', async () => {
    changePassword.mockResolvedValueOnce({ id: '1' });
    const { onClose, onChanged } = renderDialog();

    await userEvent.type(screen.getByLabelText('Current password', { exact: false }), 'Password123!');
    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'BrandNewPass1!');
    await userEvent.type(screen.getByLabelText('Confirm', { exact: false }), 'BrandNewPass1!');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith('Password123!', 'BrandNewPass1!');
    });
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks submit and warns when the new passwords do not match', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('Current password', { exact: false }), 'Password123!');
    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'BrandNewPass1!');
    await userEvent.type(screen.getByLabelText('Confirm', { exact: false }), 'Mismatch1!');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('renders the error from AuthContext and keeps the dialog open', async () => {
    changePassword.mockRejectedValueOnce(new Error('Your current password is incorrect.'));
    const { onClose } = renderDialog();

    await userEvent.type(screen.getByLabelText('Current password', { exact: false }), 'WrongPass!');
    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'BrandNewPass1!');
    await userEvent.type(screen.getByLabelText('Confirm', { exact: false }), 'BrandNewPass1!');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
