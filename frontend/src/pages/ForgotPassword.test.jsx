import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import ForgotPassword from './ForgotPassword.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderForgotPassword() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('ForgotPassword page', () => {
  it('replaces the form with a confirmation message and removes the email field on success', async () => {
    graphqlRequest.mockResolvedValueOnce({
      requestPasswordReset: { message: 'If the account exists, a password reset link has been sent.' }
    });

    renderForgotPassword();

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(
      await screen.findByText('If the account exists, a password reset link has been sent.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });

  it('never renders a raw token or a token-gated continue button after a successful submit', async () => {
    graphqlRequest.mockResolvedValueOnce({
      requestPasswordReset: { message: 'If the account exists, a password reset link has been sent.' }
    });

    renderForgotPassword();

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await screen.findByText('If the account exists, a password reset link has been sent.');

    expect(screen.queryByText(/^[a-f0-9]{16,}$/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue to reset/i })).toBeInTheDocument();
  });

  it('requests only the message field, never resetToken, from the mutation', async () => {
    graphqlRequest.mockResolvedValueOnce({
      requestPasswordReset: { message: 'If the account exists, a password reset link has been sent.' }
    });

    renderForgotPassword();

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await screen.findByText('If the account exists, a password reset link has been sent.');

    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('requestPasswordReset(email: $email) { message }'),
      { email: 'ada@example.com' }
    );
  });
});
