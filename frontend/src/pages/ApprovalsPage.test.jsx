import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from './ApprovalsPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const ROW = {
  id: '5',
  invitedName: 'Cousin Joe',
  invitedEmail: 'joe@example.com',
  relationshipToFamily: 'cousin',
  invitationNote: 'Met at the reunion',
  registeredAt: '1700000000000',
  inviter: { id: '2', name: 'Aunt May' },
  registeredUser: { id: '9', name: 'Joseph Q', email: 'joe@example.com', emailVerified: true }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ApprovalsPage', () => {
  it('lists pending registrations with inviter, relationship, and note', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingRegistrations: [ROW] });
    render(<ApprovalsPage />);

    expect(await screen.findByText('Joseph Q')).toBeInTheDocument();
    expect(screen.getByText('Aunt May', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('cousin', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Met at the reunion', { exact: false })).toBeInTheDocument();
  });

  it('shows the empty state when nothing is pending', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingRegistrations: [] });
    render(<ApprovalsPage />);
    expect(await screen.findByText(/No registrations are waiting/i)).toBeInTheDocument();
  });

  it('approves a registration and refetches', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingRegistrations: [ROW] })
      .mockResolvedValueOnce({ approveInvitation: { id: '5', status: 'Approved' } })
      .mockResolvedValueOnce({ pendingRegistrations: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveInvitation'), { id: '5' });
    });
    expect(await screen.findByText(/No registrations are waiting/i)).toBeInTheDocument();
  });

  it('rejects a registration with a reason', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingRegistrations: [ROW] })
      .mockResolvedValueOnce({ rejectInvitation: { id: '5', status: 'Rejected' } })
      .mockResolvedValueOnce({ pendingRegistrations: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    await userEvent.type(screen.getByLabelText('Reason (optional)', { exact: false }), 'Not a relative');
    // The dialog's confirm button
    const dialogReject = screen.getAllByRole('button', { name: /reject/i }).pop();
    await userEvent.click(dialogReject);

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('rejectInvitation'), {
        id: '5',
        reason: 'Not a relative'
      });
    });
  });
});
