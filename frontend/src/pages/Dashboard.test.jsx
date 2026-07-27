import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ changePassword: vi.fn(), logout: vi.fn() })
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const ADMIN = { id: '1', name: 'Root Admin', email: 'admin@example.com', role: 'ADMIN', emailVerified: true, createdAt: '1700000000000', updatedAt: '1700000000000' };

const ADMIN_DASHBOARD = {
  dashboard: {
    message: 'Welcome to the admin dashboard.',
    user: ADMIN,
    users: [
      ADMIN,
      { id: '2', name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER', emailVerified: false, createdAt: '1700000000000', updatedAt: '1700500000000' }
    ]
  }
};

const USER_DASHBOARD = {
  dashboard: {
    message: 'Welcome to your dashboard.',
    user: { id: '5', name: 'Grace Hopper', email: 'grace@example.com', role: 'USER', emailVerified: true, createdAt: '1700000000000', updatedAt: '1700000000000' },
    users: null
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard — admin system users list', () => {
  it('shows a last-updated value and an Unverified chip for an unverified user', async () => {
    graphqlRequest.mockResolvedValueOnce(ADMIN_DASHBOARD);
    render(<Dashboard />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getAllByText(/Updated/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Unverified/i)).toBeInTheDocument();
  });

  it('renders per-row Edit and Set password actions', async () => {
    graphqlRequest.mockResolvedValueOnce(ADMIN_DASHBOARD);
    render(<Dashboard />);

    await screen.findByText('Ada Lovelace');
    expect(screen.getByLabelText('Edit Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByLabelText('Set password for Ada Lovelace')).toBeInTheDocument();
  });
});

describe('Dashboard — self-service controls on the hero card', () => {
  it('offers Edit account and Change password for a normal user (no users list)', async () => {
    graphqlRequest.mockResolvedValueOnce(USER_DASHBOARD);
    render(<Dashboard />);

    await screen.findByRole('button', { name: /edit account/i });
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    expect(screen.queryByText('System users')).not.toBeInTheDocument();
  });

  it('opens the Change password dialog from the hero button', async () => {
    graphqlRequest.mockResolvedValueOnce(USER_DASHBOARD);
    render(<Dashboard />);

    await userEvent.click(await screen.findByRole('button', { name: /change password/i }));

    expect(await screen.findByLabelText('Current password', { exact: false })).toBeInTheDocument();
  });
});
