// Covers SEARCH-01/SEARCH-02/SEARCH-03: debounced async searchFamilyMembers
// fetch, min-char threshold, raw Latin+Ge'ez term pass-through (D-02), rich
// suggestion rows (D-03), no-matches (D-08), and selection (D-05).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonSearch from './PersonSearch.jsx';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

import { graphqlRequest } from '../../api/graphqlClient.js';

const MEMBER = {
  id: '7',
  fullname: 'Byron Lovelace',
  geezFullname: 'ባይሮን ላቭሌስ',
  gender: 'Male',
  birthdate: '1998-04-12',
  photoUrl: null,
  mothersname: 'Ada Byron'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PersonSearch', () => {
  it('does not fetch below the 2-char minimum threshold', async () => {
    render(<PersonSearch onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'A');

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('fires exactly one debounced searchFamilyMembers call for a rapidly-typed multi-char term', async () => {
    graphqlRequest.mockResolvedValue({ searchFamilyMembers: [MEMBER] });
    render(<PersonSearch onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'Byr');

    await waitFor(() => expect(graphqlRequest).toHaveBeenCalledTimes(1));
    expect(graphqlRequest.mock.calls[0][1]).toEqual({ term: 'Byr' });
  });

  it("renders a rich suggestion row with fullname, Ge'ez text, and birth year", async () => {
    graphqlRequest.mockResolvedValue({ searchFamilyMembers: [MEMBER] });
    render(<PersonSearch onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'Byron');

    expect(await screen.findByText('Byron Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ባይሮን ላቭሌስ')).toBeInTheDocument();
    expect(screen.getByText(/b\. 1998/)).toBeInTheDocument();
  });

  it("passes a Ge'ez-typed term to searchFamilyMembers unmodified (D-02)", async () => {
    graphqlRequest.mockResolvedValue({ searchFamilyMembers: [] });
    render(<PersonSearch onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'ባይሮን');

    await waitFor(() => expect(graphqlRequest).toHaveBeenCalled());
    expect(graphqlRequest.mock.calls[0][1]).toEqual({ term: 'ባይሮን' });
  });

  it('shows "No matches" when searchFamilyMembers resolves empty (D-08)', async () => {
    graphqlRequest.mockResolvedValue({ searchFamilyMembers: [] });
    render(<PersonSearch onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'Zzzz');

    await waitFor(() => expect(graphqlRequest).toHaveBeenCalled());
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('calls onSelect with the member id when a suggestion is clicked (D-05)', async () => {
    graphqlRequest.mockResolvedValue({ searchFamilyMembers: [MEMBER] });
    const onSelect = vi.fn();
    render(<PersonSearch onSelect={onSelect} />);
    const input = screen.getByLabelText('Search by name');
    await userEvent.click(input);
    await userEvent.type(input, 'Byron');

    const option = await screen.findByText('Byron Lovelace');
    await userEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith('7');
  });
});
