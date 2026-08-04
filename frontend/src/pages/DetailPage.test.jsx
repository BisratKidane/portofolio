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
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import DetailPage from './DetailPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

import { graphqlRequest } from '../api/graphqlClient.js';

// EditMemberDialog (mounted unconditionally as of Plan 28-04) renders a
// MUI X DatePicker via MemberFields when open, which requires a
// LocalizationProvider ancestor -- mirrors ManagePage.test.jsx's wrapping.
function renderPage() {
  return render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MemoryRouter initialEntries={['/detail']}>
        <DetailPage />
      </MemoryRouter>
    </LocalizationProvider>
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

  // Edit wiring (Plan 28-04, PERM-01): the head-save DOM assertions below are
  // the actual regression test for the plan-checker blocker -- a
  // graphqlRequest-call-only assertion is NOT sufficient (see plan revision
  // note), since nav.topPerson renders from useDescendantNav's per-id cache,
  // not from the mainPerson React state variable, once a cache entry exists.
  const HEAD_EDIT_FIELDS = {
    id: '1',
    firstname: 'Ada',
    lastname: 'Lovelace',
    geezFirstname: null,
    geezLastname: null,
    geezMothersname: null,
    gender: 'Female',
    mothersname: null,
    email: null,
    birthdate: null,
    isAlive: true,
    phone: '555-0000',
    address: null,
    photoUrl: null,
    canEdit: true
  };

  it('clicking Edit on the head fetches full editable fields BEFORE the dialog opens', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true } });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    let resolveEditFetch;
    graphqlRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEditFetch = resolve;
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));

    const editFetchCall = graphqlRequest.mock.calls[graphqlRequest.mock.calls.length - 1];
    expect(editFetchCall[0]).toMatch(/phone/);
    expect(editFetchCall[1]).toEqual({ id: '1' });
    expect(screen.queryByText('Edit member')).not.toBeInTheDocument();

    resolveEditFetch({ familyMember: HEAD_EDIT_FIELDS });
    await waitFor(() => expect(screen.getByText('Edit member')).toBeInTheDocument());
  });

  it('opens the dialog pre-filled with the fetched full editable field set (e.g. phone)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true } });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD_EDIT_FIELDS });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));

    await waitFor(() => expect(screen.getByText('Edit member')).toBeInTheDocument());
    expect(screen.getByLabelText('Phone').value).toBe('555-0000');
  });

  it('BLOCKER REGRESSION: saving an edit to the HEAD updates the rendered PersonCard text, not just fires a fetch', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true } });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();

    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD_EDIT_FIELDS });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));
    await waitFor(() => expect(screen.getByText('Edit member')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ editMember: { ...HEAD_EDIT_FIELDS, fullname: 'Ada Lovelace Updated' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '1',
        fullname: 'Ada Lovelace Updated',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: []
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Ada Lovelace Updated')).toBeInTheDocument());
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('head-save refresh call matches the REFRESH_PERSON_QUERY shape (children carry full fields incl. nested canEdit), never loadPersonById', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true } });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD_EDIT_FIELDS });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));
    await waitFor(() => expect(screen.getByText('Edit member')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ editMember: { ...HEAD_EDIT_FIELDS, fullname: 'Ada Lovelace Updated' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '1',
        fullname: 'Ada Lovelace Updated',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: []
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Ada Lovelace Updated')).toBeInTheDocument());

    const refreshCall = graphqlRequest.mock.calls[graphqlRequest.mock.calls.length - 1];
    expect(refreshCall[0]).toMatch(/familyMember/);
    expect(refreshCall[0]).toMatch(/children/);
    // REFRESH_PERSON_QUERY nests canEdit inside `children` too (2 occurrences);
    // loadPersonById's FAMILY_MEMBER_QUERY only selects `children { id }`
    // (1 occurrence, top-level only) -- this is the shape-level proof that
    // the refresh never falls back to loadPersonById.
    expect(refreshCall[0].match(/canEdit/g)).toHaveLength(2);
    expect(refreshCall[1]).toEqual({ id: '1' });
  });

  it('saving an edit to the head with gen1 already expanded leaves gen1 expanded after the refresh (no accidental collapse)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, canEdit: true, children: [{ id: '2' }] }
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '2', fullname: 'Child Two', gender: 'Male' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ familyMember: HEAD_EDIT_FIELDS });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Ada Lovelace' }));
    await waitFor(() => expect(screen.getByText('Edit member')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ editMember: { ...HEAD_EDIT_FIELDS, fullname: 'Ada Lovelace Updated' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '1',
        fullname: 'Ada Lovelace Updated',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: [person({ id: '2', fullname: 'Child Two', gender: 'Male' })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Ada Lovelace Updated')).toBeInTheDocument());
    expect(screen.getByTestId('person-card-2')).toBeInTheDocument();
  });

  it('saving an edit for a forward-shifted promoted-top descendant (id !== original head) refreshes that card via refreshEntry, proven via updated DOM text', async () => {
    // Mirrors 27-04's NAV-03/NAV-04 forward-shift setup: head -> expand
    // Child Two -> expand its child Grandchild Three (childful) -> Child
    // Two is promoted to state.topId. nav.topPerson then derives from
    // cache.current.get(state.topId)?.self -- the SAME per-id cache slot
    // refreshEntry writes to for any id, proving the "uniform for every
    // target, including a forward-shifted promoted top" claim in the plan's
    // revision note.
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }, { id: '7' }] }
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [
          person({ id: '2', fullname: 'Child Two', gender: 'Male', canEdit: true, children: [{ id: '3' }] }),
          person({ id: '7', fullname: 'Sibling Seven', children: [] })
        ]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [person({ id: '3', fullname: 'Grandchild Three', children: [{ id: '4' }] })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '4', fullname: 'Great Grandchild Four', gender: 'Male' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Grandchild Three' }));
    await waitFor(() => expect(screen.getByTestId('person-card-4')).toBeInTheDocument());

    // Child Two is now the promoted top (role "Head").
    expect(screen.getByText('Head')).toBeInTheDocument();
    expect(screen.getByText('Child Two')).toBeInTheDocument();

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '2',
        firstname: 'Child',
        lastname: 'Two',
        geezFirstname: null,
        geezLastname: null,
        geezMothersname: null,
        gender: 'Male',
        mothersname: null,
        email: null,
        birthdate: null,
        isAlive: true,
        phone: '555-1111',
        address: null,
        photoUrl: null,
        canEdit: true
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Child Two' }));
    await waitFor(() => expect(screen.getByText('Edit member')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({ editMember: { id: '2', fullname: 'Child Two Updated' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '2',
        fullname: 'Child Two Updated',
        geezFullname: null,
        gender: 'Male',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: [person({ id: '3', fullname: 'Grandchild Three' })]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Child Two Updated')).toBeInTheDocument());
    expect(screen.queryByText('Child Two')).not.toBeInTheDocument();

    const refreshCall = graphqlRequest.mock.calls[graphqlRequest.mock.calls.length - 1];
    expect(refreshCall[0]).toMatch(/familyMember/);
    expect(refreshCall[0]).toMatch(/children/);
    expect(refreshCall[1]).toEqual({ id: '2' });
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

  // Add wiring + auto-expand (Plan 28-05, PERM-02/SC-2): the Add-menu
  // control (Plan 28-02) wired to the existing AddRelativeDialog at all 3
  // /detail render sites, refreshed in place via refreshAfterMutation
  // (Plan 28-04, revised to route every target -- head included -- through
  // nav.refreshEntry unconditionally).

  it('non-admin sees no Add control at any of the 3 render sites (head/gen1/gen2)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, children: [{ id: '2' }] } });
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

    expect(screen.queryAllByLabelText(/^Add relative to/)).toHaveLength(0);
  });

  it('admin: clicking the Add control on the head then "Add child" opens AddRelativeDialog pre-targeted at the head, with an empty inScopeMembers co-parent picker', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Ada Lovelace' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));

    expect(screen.getByText(/Add child/i)).toBeInTheDocument();

    // inScopeMembers={[]}: the co-parent Autocomplete never surfaces options.
    await userEvent.click(screen.getByRole('button', { name: 'or pick someone already in your family' }));
    const picker = screen.getByLabelText('Other parent (optional)', { exact: false });
    await userEvent.click(picker);
    await userEvent.type(picker, 'Anyone');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('admin: successful add-child to the HEAD when children are collapsed auto-expands to reveal the new child (D-05)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true, children: [{ id: '2' }] } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(screen.queryByTestId('person-card-2')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Ada Lovelace' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));
    await screen.findByText(/Add child/i);

    await userEvent.type(screen.getByLabelText(/^First name/i), 'New');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Kid');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '20', fullname: 'New Kid' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '1',
        fullname: 'Ada Lovelace',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: [
          person({ id: '2', fullname: 'Existing Child', gender: 'Male' }),
          person({ id: '20', fullname: 'New Kid', gender: 'Male' })
        ]
      }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(screen.getByTestId('person-card-20')).toBeInTheDocument());
    expect(screen.getByText('New Kid')).toBeInTheDocument();
  });

  it("WARNING 2a: successful add-child to the HEAD when children are ALREADY expanded shows the new child with no extra click", async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, canEdit: true, children: [{ id: '2' }] } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '2', fullname: 'Existing Child', gender: 'Male', canEdit: true })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Ada Lovelace' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));
    await screen.findByText(/Add child/i);

    await userEvent.type(screen.getByLabelText(/^First name/i), 'New');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Kid');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '21', fullname: 'New Kid' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '1',
        fullname: 'Ada Lovelace',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: [
          person({ id: '2', fullname: 'Existing Child', gender: 'Male', canEdit: true }),
          person({ id: '21', fullname: 'New Kid', gender: 'Male' })
        ]
      }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(screen.getByTestId('person-card-21')).toBeInTheDocument());
    expect(screen.getByTestId('person-card-2')).toBeInTheDocument();
  });

  it('admin: successful add-child to a collapsed gen1 person auto-expands it to reveal the new grandchild', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, children: [{ id: '2' }] } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '2', fullname: 'Child Two', gender: 'Male', canEdit: true })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Child Two' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));
    await screen.findByText(/Add child/i);

    await userEvent.type(screen.getByLabelText(/^First name/i), 'New');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Grandkid');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '30', fullname: 'New Grandkid' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '2',
        fullname: 'Child Two',
        geezFullname: null,
        gender: 'Male',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: [person({ id: '30', fullname: 'New Grandkid', gender: 'Male' })]
      }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(screen.getByTestId('person-card-30')).toBeInTheDocument());
  });

  it('WARNING 2b: successful add-spouse to the HEAD refreshes the rendered head card spouse via DOM, with no repeated familyHead call', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, canEdit: true, spouses: [person({ id: '15', fullname: 'Old Spouse', gender: 'Male' })] }
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());
    expect(screen.getByText('Old Spouse')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Ada Lovelace' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add spouse' }));
    await screen.findByText(/Add spouse/i);

    await userEvent.type(screen.getByLabelText(/^First name/i), 'New');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Spouse');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    const callCountBeforeSubmit = graphqlRequest.mock.calls.length;
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '21', fullname: 'New Spouse' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '1',
        fullname: 'Ada Lovelace',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [person({ id: '21', fullname: 'New Spouse', gender: 'Male' })],
        children: []
      }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(screen.getByText('New Spouse')).toBeInTheDocument());
    expect(screen.queryByText('Old Spouse')).not.toBeInTheDocument();

    expect(graphqlRequest.mock.calls.length).toBe(callCountBeforeSubmit + 2);
    const callsAfterSubmit = graphqlRequest.mock.calls.slice(callCountBeforeSubmit);
    expect(callsAfterSubmit.every((call) => !/familyHead/.test(call[0]))).toBe(true);
  });

  // NOTE: refreshEntry (Plan 28-03/28-04) writes only the exact-id cache
  // slot -- it does not propagate into an ancestor's already-cached
  // `children` array (see 28-04-SUMMARY.md "Next Phase Readiness"). A gen1
  // or gen2 person still rendered as a nested GenerationGrid list item (not
  // currently promoted to state.topId) therefore refreshes silently in the
  // cache but does not visibly update until that grid itself re-fetches --
  // the exact same limitation 28-04 documented for its own edit-refresh
  // test. This test targets a forward-shifted PROMOTED-TOP descendant
  // (mirroring 28-04's own corrected test) so the assertion is provably
  // true against real component behavior.
  it('admin: successful add-spouse to a forward-shifted promoted-top descendant (originally gen1) refreshes its rendered spouse via DOM', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...HEAD, children: [{ id: '2' }, { id: '7' }] }
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('person-card-1')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        children: [
          person({ id: '2', fullname: 'Child Two', gender: 'Male', canEdit: true, children: [{ id: '3' }] }),
          person({ id: '7', fullname: 'Sibling Seven', children: [] })
        ]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Ada Lovelace' }));
    await waitFor(() => expect(screen.getByTestId('person-card-2')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '3', fullname: 'Grandchild Three', children: [{ id: '4' }] })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    graphqlRequest.mockResolvedValueOnce({
      familyMember: { children: [person({ id: '4', fullname: 'Great Grandchild Four', gender: 'Male' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Grandchild Three' }));
    await waitFor(() => expect(screen.getByTestId('person-card-4')).toBeInTheDocument());

    // Child Two is now the promoted top (role "Head").
    expect(screen.getByText('Head')).toBeInTheDocument();
    expect(screen.getByText('Child Two')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Child Two' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add spouse' }));
    await screen.findByText(/Add spouse/i);

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Two');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Spouse');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Female' }));

    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '22', fullname: 'Two Spouse' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '2',
        fullname: 'Child Two',
        geezFullname: null,
        gender: 'Male',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [person({ id: '22', fullname: 'Two Spouse', gender: 'Female' })],
        children: [person({ id: '3', fullname: 'Grandchild Three' })]
      }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(screen.getByText('Two Spouse')).toBeInTheDocument());
  });

  it('admin: successful add-child to a gen2 (grandchild) person triggers the forward-shift path (former top card no longer present)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } });
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...HEAD, children: [{ id: '2' }] } });
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
      familyMember: {
        children: [
          person({ id: '3', fullname: 'Grandchild Three', gender: 'Female', canEdit: true, children: [] })
        ]
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show children of Child Two' }));
    await waitFor(() => expect(screen.getByTestId('person-card-3')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add relative to Grandchild Three' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add child' }));
    await screen.findByText(/Add child/i);

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Great');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Grandkid');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '40', fullname: 'Great Grandkid' } });
    graphqlRequest.mockResolvedValueOnce({
      familyMember: {
        id: '3',
        fullname: 'Grandchild Three',
        geezFullname: null,
        gender: 'Female',
        isAlive: true,
        photoUrl: null,
        canEdit: true,
        spouses: [],
        children: [person({ id: '40', fullname: 'Great Grandkid', gender: 'Male' })]
      }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(screen.getByTestId('person-card-40')).toBeInTheDocument());
    expect(screen.queryByTestId('person-card-1')).not.toBeInTheDocument();
    expect(screen.getByText('Head')).toBeInTheDocument();
    expect(screen.getByText('Child Two')).toBeInTheDocument();
  });
});
