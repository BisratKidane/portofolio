import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import LinkAccountsPage from './LinkAccountsPage.jsx';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/photoClient.js', () => ({
  uploadMemberPhoto: vi.fn(),
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }) => {
    if (onCropComplete) {
      onCropComplete({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
    }
    return <div data-testid="mock-cropper" />;
  }
}));

import { graphqlRequest } from '../api/graphqlClient.js';
import { uploadMemberPhoto } from '../api/photoClient.js';

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

const FAMILY_MEMBERS_FOR_LINKING = [
  { id: '10', firstname: 'John', lastname: 'Doe', fullname: 'John Doe', gender: 'Male', linkedUser: null },
  { id: '11', firstname: 'Jane', lastname: 'Doe', fullname: 'Jane Doe', gender: 'Female', linkedUser: null }
];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <LinkAccountsPage />
      </LocalizationProvider>
    </MemoryRouter>
  );
}

describe('LinkAccountsPage', () => {
  it('renders the "Link accounts" heading and lists fetched unlinked users', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: TWO_UNLINKED_USERS });

    renderPage();

    expect(await screen.findByText('Link accounts')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('lists a linked account as a single entity (account name + email, member fullname not shown twice) and opens the tree on click', async () => {
    const MEMBERS_WITH_A_LINK = [
      ...FAMILY_MEMBERS_FOR_LINKING,
      {
        id: '12',
        firstname: 'Ada',
        lastname: 'King',
        fullname: 'Ada King',
        gender: 'Female',
        linkedUser: { id: '7', name: 'Ada Account', email: 'ada.king@example.com' }
      }
    ];
    graphqlRequest.mockResolvedValueOnce({ familyMembers: MEMBERS_WITH_A_LINK });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });

    renderPage();

    expect(await screen.findByText('Linked accounts')).toBeInTheDocument();
    expect(screen.getByText('Ada Account')).toBeInTheDocument(); // the account name
    expect(screen.getByText('ada.king@example.com')).toBeInTheDocument();
    // The member IS the account holder, so the member fullname is not shown a
    // second time next to the account.
    expect(screen.queryByText('Ada King')).not.toBeInTheDocument();
    // Nothing waiting → the waiting section shows its empty state.
    expect(screen.getByText('No accounts are waiting to be linked.')).toBeInTheDocument();

    // Clicking the row opens the family tree headed on that member.
    await userEvent.click(screen.getByRole('button', { name: 'View Ada Account in the family tree' }));
    expect(navigateMock).toHaveBeenCalledWith('/family?head=12');
  });

  it('shows the "no accounts are linked yet" empty state when none are linked', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });

    renderPage();

    expect(await screen.findByText('No accounts are linked yet.')).toBeInTheDocument();
  });

  it('renders the empty-state message when there are no unlinked users', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });

    renderPage();

    expect(await screen.findByText('No accounts are waiting to be linked.')).toBeInTheDocument();
  });

  it('renders the connection card: account, member picker, and the Connect action', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });

    renderPage();

    await screen.findByText('ada@example.com');
    expect(screen.getByLabelText('Family member', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect account → member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect account → member' })).toBeDisabled();
  });

  it('uploads a deferred photo to the linked member id after create-and-link', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
    HTMLCanvasElement.prototype.toBlob = vi.fn(function toBlob(callback) {
      callback(new Blob(['fake-cropped'], { type: 'image/jpeg' }));
    });
    global.Image = class {
      set src(value) {
        this._src = value;
        if (this.onload) this.onload();
      }
      get src() {
        return this._src;
      }
    };

    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockResolvedValueOnce({ linkUserToMember: { id: '1', familyMemberId: '77' } });
    uploadMemberPhoto.mockResolvedValueOnce({ photoUrl: '/api/family-members/77/photo' });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING }); // post-link refetch

    renderPage();

    await screen.findByText('ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create new member instead' }));

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Bob');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Builder');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await userEvent.upload(document.querySelector('input[type="file"]'), file);
    await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create & link' }));

    await waitFor(() => {
      expect(uploadMemberPhoto).toHaveBeenCalledWith('77', expect.any(Blob));
    });
  });

  it('links an existing member via the Autocomplete and removes the row', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockResolvedValueOnce({ linkUserToMember: { id: '1', familyMemberId: '10' } });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING }); // post-link refetch

    renderPage();

    await screen.findByText('ada@example.com');

    const autocomplete = screen.getByLabelText('Family member', { exact: false });
    await userEvent.click(autocomplete);
    await userEvent.type(autocomplete, 'John');
    const option = await screen.findByRole('option', { name: /John Doe/ });
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: 'Connect account → member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(LINK_USER_TO_MEMBER_MUTATION, {
        userId: '1',
        memberId: '10',
        newMember: undefined
      });
    });

    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
  });

  it('creates and links a bare member when switched to create-mode', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockResolvedValueOnce({ linkUserToMember: { id: '1', familyMemberId: '99' } });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING }); // post-link refetch

    renderPage();

    await screen.findByText('ada@example.com');

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
          isAlive: true,
          phone: '',
          address: ''
        }
      });
    });

    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
  });

  it('renders a per-row error and keeps the row when the mutation is rejected', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: FAMILY_MEMBERS_FOR_LINKING });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: ONE_UNLINKED_USER });
    graphqlRequest.mockRejectedValueOnce(new Error('This family member is already linked to an account.'));

    renderPage();

    await screen.findByText('ada@example.com');

    const autocomplete = screen.getByLabelText('Family member', { exact: false });
    await userEvent.click(autocomplete);
    await userEvent.type(autocomplete, 'John');
    const option = await screen.findByRole('option', { name: /John Doe/ });
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: 'Connect account → member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This family member is already linked to an account.'
    );
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });
});
