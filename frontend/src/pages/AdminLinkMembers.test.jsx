import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminLinkMembers from './AdminLinkMembers.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const LINK_USER_TO_MEMBER_MUTATION = `
  mutation LinkUserToMember($userId: ID!, $memberId: ID, $newMember: NewFamilyMemberInput) {
    linkUserToMember(userId: $userId, memberId: $memberId, newMember: $newMember) { id familyMemberId }
  }
`;

const TWO_UNLINKED_USERS = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'Grace Hopper', email: 'grace@example.com', createdAt: '2026-01-02T00:00:00.000Z' }
];

const ONE_UNLINKED_USER = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', createdAt: '2026-01-01T00:00:00.000Z' }
];

const FAMILY_MEMBERS = [
  { id: '10', firstname: 'John', lastname: 'Doe', fullname: 'John Doe' },
  { id: '11', firstname: 'Jane', lastname: 'Doe', fullname: 'Jane Doe' }
];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminLinkMembers />
    </MemoryRouter>
  );
}

describe('AdminLinkMembers page', () => {
  it('renders the fetched unlinked-users list', async () => {
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: TWO_UNLINKED_USERS });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS });

    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('links an existing member via the Autocomplete and removes the row', async () => {
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ linkUserToMember: { id: '1', familyMemberId: '10' } });

    renderPage();

    await screen.findByText('Ada Lovelace');

    const autocomplete = screen.getByLabelText('Family member', { exact: false });
    await userEvent.click(autocomplete);
    await userEvent.type(autocomplete, 'John');
    const option = await screen.findByText('John Doe');
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(LINK_USER_TO_MEMBER_MUTATION, {
        userId: '1',
        memberId: '10',
        newMember: undefined
      });
    });

    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('creates and links a bare member when switched to create-mode', async () => {
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ linkUserToMember: { id: '1', familyMemberId: '99' } });

    renderPage();

    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: 'Create new member instead' }));

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Bob');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Builder');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create & link' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(LINK_USER_TO_MEMBER_MUTATION, {
        userId: '1',
        memberId: undefined,
        newMember: {
          firstname: 'Bob',
          lastname: 'Builder',
          gender: 'Male',
          mothersname: '',
          email: '',
          birthdate: '',
          deathdate: '',
          phone: '',
          address: ''
        }
      });
    });

    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('renders a per-row error and keeps the row when the mutation is rejected', async () => {
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS });
    graphqlRequest.mockRejectedValueOnce(new Error('This family member is already linked to an account.'));

    renderPage();

    await screen.findByText('Ada Lovelace');

    const autocomplete = screen.getByLabelText('Family member', { exact: false });
    await userEvent.click(autocomplete);
    await userEvent.type(autocomplete, 'John');
    const option = await screen.findByText('John Doe');
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This family member is already linked to an account.'
    );
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders the empty-state message when there are no unlinked users', async () => {
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS });

    renderPage();

    expect(await screen.findByText('No accounts are waiting to be linked.')).toBeInTheDocument();
  });
});
