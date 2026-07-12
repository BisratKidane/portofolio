import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Register from './Register.jsx';

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

function renderRegister() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('Register page', () => {
  it('navigates to /dashboard on successful registration', async () => {
    graphqlRequest.mockResolvedValueOnce({
      register: {
        token: 'tok-def',
        user: { id: 2, name: 'Ada', email: 'ada@example.com', role: 'USER' }
      }
    });

    renderRegister();

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows an error alert and does not navigate on rejected registration', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('A user with this email already exists.'));

    renderRegister();

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists.');
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
