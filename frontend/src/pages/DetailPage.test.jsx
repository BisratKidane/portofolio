// Test harness mirrors FamilyTreePage.test.jsx's mock+render pattern
// (graphqlRequest + photoClient mocked, MemoryRouter wrapper) plus
// PersonCard.test.jsx's card assertions (getByTestId, Living/Deceased chip).
// Search-select tests adapt AddRelativeDialog.test.jsx's Autocomplete
// typing/select pattern (26-02).
import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const SEARCH_HIT = {
  id: '9',
  fullname: 'Byron Lovelace',
  geezFullname: 'ባይሮን ላቭሌስ',
  gender: 'Male',
  birthdate: '1998-04-12',
  photoUrl: null,
  mothersname: 'Ada Byron'
};

const SELECTED_MAIN_PERSON = {
  id: '9',
  fullname: 'Byron Lovelace',
  geezFullname: 'ባይሮን ላቭሌስ',
  gender: 'Male',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: []
};

// Minimal card-ready person fixture for descendant-navigation tests (Task
// 2) — `children` here is only ever used by PersonCard for its count/expand
// affordance, never dereferenced beyond `.length`.
function person(overrides) {
  return {
    geezFullname: null,
    gender: 'Female',
    isAlive: true,
    photoUrl: null,
    canEdit: false,
    spouses: [],
    children: [],
    ...overrides
  };
}

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

  it('passes a no-op onEdit but a live onExpand to PersonCard, rendering fetched children on click', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, canEdit: true, children: [{ id: '2' }] }
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }))).not.toThrow();

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [
          {
            id: '2',
            fullname: 'Child Two',
            geezFullname: null,
            gender: 'Male',
            isAlive: true,
            photoUrl: null,
            canEdit: false,
            spouses: [],
            children: []
          }
        ]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));

    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());
  });

  it('selecting a search suggestion re-fetches familyMember by the selected id and swaps the rendered card (SEARCH-03/D-05)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ searchFamilyMembers: [SEARCH_HIT] });
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'Byron');

    const option = await screen.findByText('Byron Lovelace');
    graphqlRequest.mockResolvedValueOnce({ familyMember: SELECTED_MAIN_PERSON });
    await userEvent.click(option);

    await waitFor(() => expect(screen.getByTestId('person-card-9')).toBeInTheDocument());
    expect(screen.queryByTestId('person-card-1')).not.toBeInTheDocument();

    const lastCall = graphqlRequest.mock.calls[graphqlRequest.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/familyMember/);
    expect(lastCall[1]).toEqual({ id: '9' });
  });

  it("passes a Ge'ez-typed search term to searchFamilyMembers unmodified (D-02)", async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ searchFamilyMembers: [] });
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'ባይሮን');

    await waitFor(() => expect(graphqlRequest).toHaveBeenCalledWith(expect.stringMatching(/searchFamilyMembers/), { term: 'ባይሮን' }));
  });

  // Descendant navigation (Plan 27-04): end-to-end coverage of the
  // useDescendantNav (27-03) + GenerationGrid (27-02) wiring added in
  // Task 1, through the real rendered component tree.

  it('PERF-01: opening /detail fires exactly 2 initial-load calls and zero children-fetch calls before any expand', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }] }
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
  });

  it('NAV-01: expanding the head shows its direct children in a GenerationGrid with a visible connector', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }] }
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '2', fullname: 'Child Two', gender: 'Male' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));

    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());
    expect(screen.getByTestId('generation-apex')).toBeInTheDocument();
  });

  it('NAV-02: collapsing an expanded child hides its grandchildren, control reflects state', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }] }
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [person({ id: '2', fullname: 'Child Two', gender: 'Male', children: [{ id: '3' }] })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '3', fullname: 'Grandchild Three' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Hide children of Child Two' }));
    await waitFor(() => expect(screen.queryByTestId('person-card-3')).not.toBeInTheDocument());
  });

  it('D-01: expanding a second child auto-collapses the first, only one branch is ever open', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }, { id: '5' }] }
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [
          person({ id: '2', fullname: 'Child A', gender: 'Male', children: [{ id: '3' }] }),
          person({ id: '5', fullname: 'Child B', gender: 'Male', children: [{ id: '6' }] })
        ]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());
    expect(screen.getByTestId('person-card-5')).toBeInTheDocument();

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '3', fullname: 'Grandchild A' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child A' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '6', fullname: 'Grandchild B' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child B' }));

    await waitFor(() => expect(screen.getByTestId('person-card-6')).toBeInTheDocument());
    expect(screen.queryByTestId('person-card-3')).not.toBeInTheDocument();
  });

  it('NAV-03/NAV-04/D-04: expanding a childful grandchild forward-shifts the view (capped at 3 generations) and collapsing the promoted top restores the exact pre-shift view with no new fetches', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }, { id: '7' }] }
    });
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    // Expand head: reveal Child Two (has its own children) and its childless
    // sibling Sibling Seven.
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [
          person({ id: '2', fullname: 'Child Two', gender: 'Male', children: [{ id: '3' }] }),
          person({ id: '7', fullname: 'Sibling Seven', children: [] })
        ]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());
    expect(screen.getByTestId('person-card-7')).toBeInTheDocument();

    // Expand Child Two: reveal Grandchild Three (itself childful).
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [person({ id: '3', fullname: 'Grandchild Three', children: [{ id: '4' }] })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    // Expand Grandchild Three: triggers the forward shift (NAV-04).
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [person({ id: '4', fullname: 'Great Grandchild Four', gender: 'Male' })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Grandchild Three' }));
    await waitFor(() => expect(screen.getByTestId('person-card-4')).toBeInTheDocument());

    // Child Two is now promoted to the view's top slot (role "Head").
    expect(screen.getByTestId('person-card-2')).toBeInTheDocument();
    expect(screen.getByText('Head')).toBeInTheDocument();
    // Original head and Child Two's sibling (the dropped grandparent's other
    // children) are gone (NAV-03).
    expect(screen.queryByTestId('person-card-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('person-card-7')).not.toBeInTheDocument();
    // Never more than 3 generations' worth of cards mounted at once.
    const cardsAtPeak = container.querySelectorAll('[data-testid^="person-card-"]');
    expect(cardsAtPeak).toHaveLength(3);

    // Collapse the promoted top: undo walks back up exactly (D-04), with no
    // additional graphqlRequest calls (the popped frame's data was cached).
    const callCountBeforeUndo = graphqlRequest.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Hide children of Child Two' }));

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(screen.getByTestId('person-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('person-card-7')).toBeInTheDocument();
    expect(screen.getByTestId('person-card-3')).toBeInTheDocument();
    expect(screen.queryByTestId('person-card-4')).not.toBeInTheDocument();
    expect(graphqlRequest).toHaveBeenCalledTimes(callCountBeforeUndo);
  });

  it('PERF-03: re-expanding a cached child fires zero new graphqlRequest calls and an exact, bounded render-commit count', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }] }
    });

    const onRenderSpy = vi.fn();
    render(
      <MemoryRouter initialEntries={['/detail']}>
        <Profiler id="nav" onRender={onRenderSpy}>
          <DetailPage />
        </Profiler>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [person({ id: '2', fullname: 'Child Two', gender: 'Male', children: [{ id: '3' }] })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '3', fullname: 'Grandchild Three' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Hide children of Child Two' }));
    await waitFor(() => expect(screen.queryByTestId('person-card-3')).not.toBeInTheDocument());

    const callCountBeforeReExpand = graphqlRequest.mock.calls.length;
    onRenderSpy.mockClear();

    // Re-expand: the grandchild's cache entry already holds `children`, so
    // ensureEntry short-circuits to Promise.resolve() with zero setLoadingId
    // calls -- a single EXPAND_CHILD dispatch is the only state update this
    // click can possibly cause. The collapsed GenerationGrid/PersonCard
    // subtree unmounted on collapse, so this click also freshly re-mounts a
    // new MemberAvatarImage instance for the grandchild card, whose own
    // (member-photoUrl-driven, no-photo-here) mount effect settles in a
    // second, tiny, no-DOM-visible-change commit right after the dispatch's
    // commit -- traced/isolated in isolation (each commit's actualDuration
    // and the DetailPage-level render count) to rule out a hidden refetch:
    // exactly 2 commits, not the 3+ a cache-miss expand produces (which adds
    // a distinct setLoadingId(true)/setLoadingId(false) pair of commits).
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    expect(graphqlRequest).toHaveBeenCalledTimes(callCountBeforeReExpand);
    expect(onRenderSpy).toHaveBeenCalledTimes(2);
  });
});
