import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Login from './Login.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateSpy
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('Login page', () => {
  it('navigates to /dashboard on successful login', async () => {
    graphqlRequest.mockResolvedValueOnce({
      login: {
        token: 'tok-abc',
        user: { id: 1, name: 'Ada', email: 'ada@example.com', role: 'USER' }
      }
    });

    renderLogin();

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows an error alert and does not navigate on rejected login', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Invalid email or password.'));

    renderLogin();

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
