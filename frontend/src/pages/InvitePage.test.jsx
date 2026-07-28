import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitePage from './InvitePage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvitePage', () => {
  it('lists the caller\'s existing invitations on mount', async () => {
    graphqlRequest.mockResolvedValueOnce({
      myInvitations: [
        { id: '1', invitedName: 'Cousin Joe', invitedEmail: 'joe@example.com', relationshipToFamily: 'cousin', status: 'Pending', expiresAt: null, createdAt: '1700000000000' }
      ]
    });

    render(<InvitePage />);

    expect(await screen.findByText('Cousin Joe')).toBeInTheDocument();
    expect(screen.getByText('joe@example.com', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('creates an invitation and shows the copyable registration link', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ myInvitations: [] }) // initial load
      .mockResolvedValueOnce({
        createInvitation: {
          registrationUrl: 'https://agne.example/register?token=abc123',
          invitation: { id: '9', invitedEmail: 'new@example.com', relationshipToFamily: 'uncle', status: 'Pending', createdAt: '1700000000000' }
        }
      })
      .mockResolvedValueOnce({ myInvitations: [] }); // reload after create

    render(<InvitePage />);
    await screen.findByText(/You haven't sent any invitations yet/i);

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Relationship to the family', { exact: false }), 'uncle');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('createInvitation'),
        { input: { invitedName: null, invitedEmail: 'new@example.com', relationshipToFamily: 'uncle', invitationNote: null } }
      );
    });

    expect(await screen.findByDisplayValue('https://agne.example/register?token=abc123')).toBeInTheDocument();
    expect(screen.getByLabelText('Copy invitation link')).toBeInTheDocument();
  });

  it('shows an error and no link when creation fails', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ myInvitations: [] })
      .mockRejectedValueOnce(new Error('An invitation needs an email address.'));

    render(<InvitePage />);
    await screen.findByText(/You haven't sent any invitations yet/i);

    await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'x@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An invitation needs an email address.');
    expect(screen.queryByLabelText('Copy invitation link')).not.toBeInTheDocument();
  });
});
