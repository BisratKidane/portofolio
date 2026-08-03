// Test harness mirrors FamilyTreePage.test.jsx's mock+render pattern
// (graphqlRequest + photoClient mocked, MemoryRouter wrapper) plus
// PersonCard.test.jsx's card assertions (getByTestId, Living/Deceased chip).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DetailPage from './DetailPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

import { graphqlRequest } from '../api/graphqlClient.js';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/detail']}>
      <DetailPage />
    </MemoryRouter>
  );
}

const HEAD = {
  id: '1',
  fullname: 'Ada Lovelace',
  geezFullname: null,
  gender: 'Female',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: []
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DetailPage', () => {
  it('shows a loading state while the initial fetch is in flight', () => {
    graphqlRequest.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('loads the family head then the head person-by-id, rendering exactly one PersonCard with no descendants', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Head')).toBeInTheDocument();

    expect(graphqlRequest).toHaveBeenCalledTimes(2);
    expect(graphqlRequest.mock.calls[0][0]).toMatch(/familyHead/);
    expect(graphqlRequest.mock.calls[1][1]).toEqual({ id: '1' });
  });

  it('shows an error state with a working Retry button on a failed request', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Network error'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();

    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
  });

  it('shows a missing-family-head info alert and does not call familyMember when familyHead resolves null', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: null });
    renderPage();

    await waitFor(() => expect(screen.getByText('No family head found')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
  });

  it('shows a graceful missing-person-info message when familyMember resolves null, never an empty PersonCard', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: null });
    renderPage();

    await waitFor(() => expect(screen.getByText(/couldn.t find that person/i)).toBeInTheDocument());
    expect(screen.queryByTestId(/^person-card-/)).not.toBeInTheDocument();
  });

  it('passes no-op onExpand/onEdit to PersonCard so the head card never crashes when clicked', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, canEdit: true, children: [{ id: '2' }] }
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }))).not.toThrow();
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }))
    ).not.toThrow();
  });
});
