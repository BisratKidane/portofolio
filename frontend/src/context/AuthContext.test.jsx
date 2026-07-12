import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';
import { AuthProvider, useAuth } from './AuthContext.jsx';

function Probe() {
  const { user, loading, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span>loading:{String(loading)}</span>
      <span>authed:{String(isAuthenticated)}</span>
      <span>user:{user ? user.name : 'none'}</span>
      <button onClick={() => login('ada@example.com', 'secret')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('exposes an unauthenticated baseline when no token is present, without calling graphqlRequest', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('loading:false')).toBeInTheDocument();
    });
    expect(screen.getByText('authed:false')).toBeInTheDocument();
    expect(screen.getByText('user:none')).toBeInTheDocument();
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('loads the user on mount when a token is already present in localStorage', async () => {
    localStorage.setItem('authToken', 'seed-token');
    graphqlRequest.mockResolvedValueOnce({
      me: { id: 1, name: 'Ada', email: 'ada@example.com', role: 'USER' }
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(await screen.findByText('user:Ada')).toBeInTheDocument();
    expect(screen.getByText('authed:true')).toBeInTheDocument();
  });

  it('stores the token and exposes the user after a successful login', async () => {
    graphqlRequest.mockResolvedValueOnce({
      login: {
        token: 'tok-123',
        user: { id: 1, name: 'Ada', email: 'ada@example.com', role: 'USER' }
      }
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    expect(await screen.findByText('user:Ada')).toBeInTheDocument();
    expect(screen.getByText('authed:true')).toBeInTheDocument();
    expect(localStorage.getItem('authToken')).toBe('tok-123');
  });

  it('clears the user and the token after logout', async () => {
    graphqlRequest.mockResolvedValueOnce({
      login: {
        token: 'tok-123',
        user: { id: 1, name: 'Ada', email: 'ada@example.com', role: 'USER' }
      }
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('user:Ada')).toBeInTheDocument();

    graphqlRequest.mockResolvedValueOnce({ logout: true });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(screen.getByText('user:none')).toBeInTheDocument();
    });
    expect(screen.getByText('authed:false')).toBeInTheDocument();
    expect(localStorage.getItem('authToken')).toBeNull();
  });
});
