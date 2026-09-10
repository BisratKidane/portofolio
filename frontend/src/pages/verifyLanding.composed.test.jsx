import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import VerifyEmail from './VerifyEmail.jsx';
import AwaitingApproval from './AwaitingApproval.jsx';
import Pending from './Pending.jsx';
import Login from './Login.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderApp(initialEntries) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/awaiting-approval" element={<AwaitingApproval />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard Sentinel</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('verify -> landing composed flow (W-1)', () => {
  it('lands a still-Pending verifier on the awaiting-approval page with no session (W-1 reproduction)', async () => {
    graphqlRequest.mockResolvedValueOnce({
      verifyEmail: {
        token: 'tok',
        user: { id: 5, name: 'Caleb', email: 'caleb@example.com', role: 'USER', status: 'Pending' }
      }
    });

    renderApp(['/verify-email?token=abc']);

    await waitFor(() => expect(screen.getByText(/your email address is verified/i)).toBeInTheDocument());
    expect(screen.getByText(/you'll get an email as soon as you're approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in to agne/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('lands an Active verifier on /dashboard with a stored session', async () => {
    graphqlRequest.mockResolvedValueOnce({
      verifyEmail: {
        token: 'tok-active',
        user: { id: 4, name: 'Beti', email: 'beti@example.com', role: 'USER', status: 'Active' }
      }
    });

    renderApp(['/verify-email?token=active-token']);

    await waitFor(() => expect(screen.getByText('Dashboard Sentinel')).toBeInTheDocument());
    expect(localStorage.getItem('authToken')).toEqual(expect.any(String));
  });

  it('bounces a no-session /pending hit to /login (SC-2 defence in depth)', () => {
    renderApp(['/pending']);

    expect(screen.getByRole('heading', { name: /sign in to agne/i })).toBeInTheDocument();
  });

  it('renders the landing page on a direct hit with no session and zero network calls', () => {
    renderApp(['/awaiting-approval']);

    expect(screen.getByText(/your email address is verified/i)).toBeInTheDocument();
    expect(graphqlRequest).not.toHaveBeenCalled();
  });
});
