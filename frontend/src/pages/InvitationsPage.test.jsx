import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvitationsPage from './InvitationsPage.jsx';

const useAuthMock = vi.fn();
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  graphqlRequest.mockImplementation((query) => {
    if (query.includes('myInvitations')) return Promise.resolve({ myInvitations: [] });
    if (query.includes('pendingRegistrations')) return Promise.resolve({ pendingRegistrations: [] });
    return Promise.resolve({});
  });
});

describe('InvitationsPage', () => {
  it('shows the invite section but NOT approvals for a non-admin', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER' } });

    render(<InvitationsPage />);

    expect(await screen.findByText('Invite a family member')).toBeInTheDocument();
    expect(screen.queryByText('Pending approvals')).not.toBeInTheDocument();
  });

  it('shows both the invite section and the approvals section for an admin', async () => {
    useAuthMock.mockReturnValue({ user: { id: 99, role: 'ADMIN' } });

    render(<InvitationsPage />);

    expect(await screen.findByText('Invite a family member')).toBeInTheDocument();
    expect(await screen.findByText('Pending approvals')).toBeInTheDocument();
  });
});
