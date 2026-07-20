import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import VerifyEmail from './VerifyEmail.jsx';

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

function renderVerifyEmail(initialEntries) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('VerifyEmail page', () => {
  it('auto-verifies the URL token on mount and navigates to /dashboard on success', async () => {
    graphqlRequest.mockResolvedValueOnce({
      verifyEmail: {
        token: 'tok-abc',
        user: { id: 3, name: 'Ada', email: 'ada@example.com', role: 'USER' }
      }
    });

    renderVerifyEmail(['/verify-email?token=abc123']);

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
    expect(graphqlRequest).toHaveBeenCalledWith(expect.any(String), { token: 'abc123' });
  });

  it('shows a recoverable error state and never navigates when verification fails', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('The email verification token is invalid or has expired.'));

    renderVerifyEmail(['/verify-email?token=bad-token']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email verification token is invalid or has expired.'
    );
    expect(screen.getByRole('link', { name: /return to sign in/i })).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('shows an error state immediately and never calls verifyEmail when no token is present', async () => {
    renderVerifyEmail(['/verify-email']);

    expect(await screen.findByRole('alert')).toHaveTextContent('Missing verification token.');
    expect(graphqlRequest).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
