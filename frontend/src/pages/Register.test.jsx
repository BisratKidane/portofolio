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
  it('shows a check-your-email confirmation panel and never navigates on successful registration', async () => {
    graphqlRequest.mockResolvedValueOnce({
      register: { message: 'Registration successful. Please check your email to verify your account.' }
    });

    renderRegister();

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Registration successful. Please check your email to verify your account.')
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Registration successful. Please check your email to verify your account.'
    );
    expect(screen.queryByLabelText('Full name', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password', { exact: false })).not.toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('shows an error alert, keeps the form visible, and does not navigate on rejected registration', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('A user with this email already exists.'));

    renderRegister();

    await userEvent.type(screen.getByLabelText('Full name', { exact: false }), 'Ada');
    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: false }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists.');
    expect(screen.getByLabelText('Full name', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
