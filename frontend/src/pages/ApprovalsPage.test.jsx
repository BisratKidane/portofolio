import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from './ApprovalsPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const ROW = {
  id: '9',
  name: 'Joseph Q',
  email: 'joe@example.com',
  relationshipNote: 'Met at the reunion',
  createdAt: '1700000000000'
};

// D-08: an empty/null note is a normal state, not an error -- must render
// "No note provided." rather than an empty gap.
const ROW_NO_NOTE = { ...ROW, id: '10', relationshipNote: null };

// SEC-03 UI half: the note is attacker-controlled free text up to 500 chars.
// It must render as literal text, never as markup.
const HTML_NOTE = '<img src=x onerror=alert(1)>';
const ROW_HTML_NOTE = { ...ROW, id: '11', relationshipNote: HTML_NOTE };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ApprovalsPage', () => {
  it('renders a card with name, email, full relationship note, and registration time', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingApprovals: [ROW] });
    render(<ApprovalsPage />);

    expect(await screen.findByText('Joseph Q')).toBeInTheDocument();
    expect(screen.getByText('joe@example.com')).toBeInTheDocument();
    expect(screen.getByText('Met at the reunion')).toBeInTheDocument();
    expect(screen.getByText(/Registered/i)).toBeInTheDocument();
  });

  it('renders "No note provided." for a row with a null relationshipNote', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingApprovals: [ROW_NO_NOTE] });
    render(<ApprovalsPage />);

    await screen.findByText('Joseph Q');
    expect(screen.getByText('No note provided.')).toBeInTheDocument();
  });

  it('renders an HTML-bearing note as literal text, never as markup (SEC-03)', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingApprovals: [ROW_HTML_NOTE] });
    render(<ApprovalsPage />);

    await screen.findByText('Joseph Q');

    // The literal string must be visible as text content...
    expect(screen.getByText(HTML_NOTE)).toBeInTheDocument();
    // ...and React must never have parsed it into a DOM element: no <img>
    // was created from the note, proving default child-text escaping was
    // not bypassed via dangerouslySetInnerHTML or a markdown renderer.
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing is pending', async () => {
    graphqlRequest.mockResolvedValueOnce({ pendingApprovals: [] });
    render(<ApprovalsPage />);
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });

  it('approves a registration by row.id directly and refetches', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingApprovals: [ROW] })
      .mockResolvedValueOnce({ approveUser: { id: '9', status: 'Active' } })
      .mockResolvedValueOnce({ pendingApprovals: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveUser'), { id: '9' });
    });
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });

  it('rejects a registration by row.id directly with an optional reason', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingApprovals: [ROW] })
      .mockResolvedValueOnce({ rejectUser: { id: '9', status: 'Rejected' } })
      .mockResolvedValueOnce({ pendingApprovals: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    // D-09's locked dialog copy
    expect(screen.getByText('Reject this request?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep pending' })).toBeInTheDocument();

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

  it('submits a reject with an empty reason successfully (D-09)', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingApprovals: [ROW] })
      .mockResolvedValueOnce({ rejectUser: { id: '9', status: 'Rejected' } })
      .mockResolvedValueOnce({ pendingApprovals: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    const dialogReject = screen.getAllByRole('button', { name: /reject/i }).pop();
    await userEvent.click(dialogReject);

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('rejectUser'), {
        id: '9',
        reason: null
      });
    });
  });

  it('shows only the error Alert on a failed initial load -- no spinner, no empty panel, no card list (SC-5)', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Network error'));
    render(<ApprovalsPage />);

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing to review')).not.toBeInTheDocument();
    expect(screen.queryByText('Joseph Q')).not.toBeInTheDocument();
  });
});
