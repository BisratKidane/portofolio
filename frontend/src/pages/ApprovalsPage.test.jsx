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

// fk_invitations_registered_user is ON DELETE SET NULL (migration 016), so an
// invitation can outlive the account it created and arrive here with a null
// registeredUser.
const ORPHANED_ROW = { ...ROW, registeredUser: null };

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
      .mockResolvedValueOnce({ approveUser: { id: '9', status: 'Active' } })
      .mockResolvedValueOnce({ pendingRegistrations: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveUser'), { id: '9' });
    });
    expect(await screen.findByText(/No registrations are waiting/i)).toBeInTheDocument();
  });

  it('rejects a registration with a reason', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingRegistrations: [ROW] })
      .mockResolvedValueOnce({ rejectUser: { id: '9', status: 'Rejected' } })
      .mockResolvedValueOnce({ pendingRegistrations: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    await userEvent.type(screen.getByLabelText('Reason (optional)', { exact: false }), 'Not a relative');
    // The dialog's confirm button
    const dialogReject = screen.getAllByRole('button', { name: /reject/i }).pop();
    await userEvent.click(dialogReject);

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('rejectUser'), {
        id: '9',
        reason: 'Not a relative'
      });
    });
  });

  it('disables Approve and Reject for a row with no registered user (WR-01)', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingRegistrations: [ORPHANED_ROW] });
    render(<ApprovalsPage />);

    await screen.findByText('Cousin Joe');

    // `row.registeredUser && !row.registeredUser.emailVerified` short-circuits
    // to null when registeredUser is null -- falsy -- so the buttons rendered
    // ENABLED and clicking dereferenced row.registeredUser.id. That is the
    // exact failure D-11 exists to prevent, fixed for emailVerified but not
    // for the other nullable case.
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled();
  });
});
