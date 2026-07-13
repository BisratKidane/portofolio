import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import ResetPassword from './ResetPassword.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderResetPassword(initialEntries = ['/reset-password']) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ResetPassword />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('ResetPassword page', () => {
  it('hides the token field and submits the URL token when ?token= is present', async () => {
    graphqlRequest.mockResolvedValueOnce({ resetPassword: true });

    renderResetPassword(['/reset-password?token=abc']);

    expect(screen.queryByLabelText('Reset token', { exact: false })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(graphqlRequest).toHaveBeenCalledWith(expect.any(String), {
        token: 'abc',
        password: 'newpassword123'
      })
    );
  });

  it('shows the paste field when no token is in the URL', () => {
    renderResetPassword(['/reset-password']);
    expect(screen.getByLabelText('Reset token', { exact: false })).toBeInTheDocument();
  });
});
