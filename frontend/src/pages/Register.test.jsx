import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Register from './Register.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderRegister(token = 'invite-token-123') {
  const path = token ? `/register?token=${token}` : '/register';
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Register />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('Register page (invitation-only)', () => {
  it('shows an "invitation required" notice and no form when there is no token', () => {
    renderRegister(null);
    expect(screen.getByText(/invitation only/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Full name', { exact: false })).not.toBeInTheDocument();
  });

  it('registers with the token + name + password (no email field) and shows the confirmation', async () => {
    graphqlRequest.mockResolvedValueOnce({
      register: { message: 'Registration received. Verify your email — then an administrator will review your account.' }
    });

    renderRegister('tok-abc');

    expect(screen.queryByLabelText('Email address', { exact: false })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/an administrator will review your account/i)).toBeInTheDocument();
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('register(token'),
      { token: 'tok-abc', name: 'Ada', password: 'secret123' }
    );
    expect(screen.queryByLabelText('Full name', { exact: false })).not.toBeInTheDocument();
  });

  it('shows an error alert and keeps the form on a rejected registration', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('This invitation link has expired.'));

    renderRegister('tok-expired');

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation link has expired.');
    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
  });
});
