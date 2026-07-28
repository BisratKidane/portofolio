import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import ManagePage from './ManagePage.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';

const useAuthMock = vi.fn();

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/photoClient.js', () => ({
  uploadMemberPhoto: vi.fn(),
  removeMemberPhoto: vi.fn(),
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
import { removeMemberPhoto, uploadMemberPhoto } from '../api/photoClient.js';

const SELF_ROW = {
  id: '1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  birthdate: null,
  isAlive: true,
  phone: null,
  email: null,
  address: null,
  mother: { id: '2' },
  father: null,
  spouses: [{ id: '3', fullname: 'John Doe' }],
  children: [{ id: '4', fullname: 'Byron Lovelace' }],
  siblings: [{ id: '5', fullname: 'Anna Lovelace' }],
  linkedUser: { id: '1' }
};

const MOTHER_ROW = {
  id: '2',
  firstname: 'Grace',
  lastname: 'Hopper',
  fullname: 'Grace Hopper',
  gender: 'Female',
  mother: null,
  father: null,
  spouses: [],
  children: [],
  siblings: [],
  linkedUser: null
};

const SPOUSE_ROW = {
  id: '3',
  firstname: 'John',
  lastname: 'Doe',
  fullname: 'John Doe',
  gender: 'Male',
  mother: null,
  father: null,
  spouses: [],
  children: [],
  siblings: [],
  linkedUser: null
};

const CHILD_ROW = {
  id: '4',
  firstname: 'Byron',
  lastname: 'Lovelace',
  fullname: 'Byron Lovelace',
  gender: 'Male',
  mother: { id: '1' },
  father: null,
  spouses: [],
  children: [],
  siblings: [],
  linkedUser: null
};

const SIBLING_ROW = {
  id: '5',
  firstname: 'Anna',
  lastname: 'Lovelace',
  fullname: 'Anna Lovelace',
  gender: 'Female',
  mother: { id: '2' },
  father: null,
  spouses: [],
  children: [],
  siblings: [],
  linkedUser: null
};

const ALL_ROWS = [SELF_ROW, MOTHER_ROW, SPOUSE_ROW, CHILD_ROW, SIBLING_ROW];

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    user: { id: 1, role: 'USER', familyMemberId: '1' },
    loading: false
  });
});

function renderPage() {
  return render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <ManagePage />
    </LocalizationProvider>
  );
}

describe('ManagePage (member branch)', () => {
  it('fetches myEditableMembers and renders the grouped Parents/Spouse/Children/Siblings sections', async () => {
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });

    renderPage();

    expect(await screen.findByText('Parents')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Spouse')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Siblings')).toBeInTheDocument();
    expect(screen.getByText('Anna Lovelace')).toBeInTheDocument();

    expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('myEditableMembers'));
  });

  it('renders the member subtitle copy', async () => {
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });

    renderPage();

    expect(await screen.findByText('Manage family')).toBeInTheDocument();
    expect(screen.getByText("Add and edit the relatives you're connected to.")).toBeInTheDocument();
  });

  it('opens AddRelativeDialog with relationType="child" and targetId equal to the member\'s own self.id', async () => {
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '6', fullname: 'New Child' } });
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });

    renderPage();
    await screen.findByText('Parents');

    await userEvent.click(screen.getByRole('button', { name: '+ Add child' }));

    expect(await screen.findByText('Add child')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Grace');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Female' }));
    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('addChild'),
        expect.objectContaining({ memberId: '1' })
      );
    });
  });

  it('refetches myEditableMembers after AddRelativeDialog reports success', async () => {
    const UPDATED_SELF_ROW = { ...SELF_ROW, children: [...SELF_ROW.children, { id: '6', fullname: 'New Child' }] };
    const NEW_CHILD_ROW = {
      id: '6',
      firstname: 'New',
      lastname: 'Child',
      fullname: 'New Child',
      gender: 'Female',
      mother: { id: '1' },
      father: null,
      spouses: [],
      children: [],
      siblings: [],
      linkedUser: null
    };

    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '6', fullname: 'New Child' } });
    graphqlRequest.mockResolvedValueOnce({
      myEditableMembers: [UPDATED_SELF_ROW, MOTHER_ROW, SPOUSE_ROW, CHILD_ROW, SIBLING_ROW, NEW_CHILD_ROW]
    });

    renderPage();
    await screen.findByText('Parents');

    await userEvent.click(screen.getByRole('button', { name: '+ Add child' }));
    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'New');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Child');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Female' }));
    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByText('New Child')).toBeInTheDocument();
  });

  it('opens EditMemberDialog pre-filled when Edit is clicked on the self card, and refetches after save', async () => {
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });
    graphqlRequest.mockResolvedValueOnce({ editMember: { id: '1', firstname: 'Augusta' } });
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });

    renderPage();
    await screen.findByText('Parents');

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(editButtons[0]);

    expect(await screen.findByText('Edit member')).toBeInTheDocument();
    expect(screen.getByLabelText('First name', { exact: false })).toHaveValue('Ada');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('editMember'),
        expect.objectContaining({ id: '1' })
      );
    });
  });

  it('opens the "Remove photo?" confirm dialog when Remove photo is clicked on the self card, and calls removeMemberPhoto on confirm', async () => {
    const SELF_ROW_WITH_PHOTO = { ...SELF_ROW, photoUrl: '/api/family-members/1/photo' };
    const ROWS_WITH_PHOTO = [SELF_ROW_WITH_PHOTO, MOTHER_ROW, SPOUSE_ROW, CHILD_ROW, SIBLING_ROW];

    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ROWS_WITH_PHOTO });
    removeMemberPhoto.mockResolvedValueOnce({});
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });

    renderPage();
    await screen.findByText('Parents');

    const removePhotoButtons = screen.getAllByRole('button', { name: 'Remove photo' });
    expect(removePhotoButtons).toHaveLength(1);
    await userEvent.click(removePhotoButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove photo?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Remove Ada Lovelace's photo? Their avatar goes back to the default icon. This can't be undone."
      )
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }));

    await waitFor(() => {
      expect(removeMemberPhoto).toHaveBeenCalledWith('1');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

const ADMIN_TABLE_MEMBERS = [
  { id: '1', firstname: 'Ada', lastname: 'Lovelace', fullname: 'Ada Lovelace', gender: 'Female', linkedUser: null }
];

const ADMIN_FOCUS_ROW = {
  id: '1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  birthdate: null,
  isAlive: true,
  phone: null,
  email: null,
  address: null,
  mother: { id: '2', fullname: 'Grace Hopper' },
  father: null,
  spouses: [{ id: '3', fullname: 'John Doe' }],
  children: [{ id: '4', fullname: 'Byron Lovelace' }],
  siblings: [{ id: '5', fullname: 'Anna Lovelace' }],
  linkedUser: { id: '1', name: 'Ada Lovelace', email: 'ada@example.com' }
};

describe('ManagePage (admin branch)', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: 99, role: 'ADMIN' },
      loading: false
    });
  });

  it('fetches familyMembers and renders AdminMemberTable under the admin subtitle', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });

    renderPage();

    expect(await screen.findByText('Search the whole tree and manage any member.')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('familyMembers'));
  });

  it('selecting a row fetches familyMember(id) and renders the grouped panel via the shared groupByRelation helper', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
    graphqlRequest.mockResolvedValueOnce({ familyMember: ADMIN_FOCUS_ROW });

    renderPage();

    await userEvent.click(await screen.findByText('Ada Lovelace'));

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Byron Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Anna Lovelace')).toBeInTheDocument();

    expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('familyMember('), { id: '1' });
  });

  it('opens the Edit dialog fully pre-filled for a spouse card in the admin-focused panel', async () => {
    const FULL_FOCUS = {
      ...ADMIN_FOCUS_ROW,
      spouses: [
        {
          id: '3',
          firstname: 'John',
          lastname: 'Doe',
          fullname: 'John Doe',
          gender: 'Male',
          mothersname: 'Mary Doe',
          email: 'john@example.com',
          birthdate: '1979-05-04',
          isAlive: true,
          phone: '555-9000',
          address: '2 Oak St',
          photoUrl: null
        }
      ]
    };

    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
    graphqlRequest.mockResolvedValueOnce({ familyMember: FULL_FOCUS });

    renderPage();

    await userEvent.click(await screen.findByText('Ada Lovelace'));
    await screen.findByText('John Doe');

    // Cards render in order: self, parent (mother), spouse, child, sibling.
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(editButtons[2]); // spouse

    expect(await screen.findByText('Edit member')).toBeInTheDocument();
    expect(screen.getByLabelText('First name', { exact: false })).toHaveValue('John');
    expect(screen.getByLabelText('Last name', { exact: false })).toHaveValue('Doe');
    expect(screen.getByLabelText('Email', { exact: false })).toHaveValue('john@example.com');
    expect(screen.getByLabelText('Phone', { exact: false })).toHaveValue('555-9000');
    expect(screen.getByLabelText("Mother's name", { exact: false })).toHaveValue('Mary Doe');
  });

  it('shows an active Edit button for every card in the admin-focused panel regardless of linkedUser (D-06 bypass)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
    graphqlRequest.mockResolvedValueOnce({ familyMember: ADMIN_FOCUS_ROW });

    renderPage();

    await userEvent.click(await screen.findByText('Ada Lovelace'));
    await screen.findByText('Grace Hopper');

    // self + mother + spouse + child + sibling = 5 cards, every one editable for an admin
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(5);
  });

  it('opens the two-step confirm dialog with UI-SPEC-exact copy and calls deleteMember on confirm, clearing focus and refetching', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
    graphqlRequest.mockResolvedValueOnce({ familyMember: ADMIN_FOCUS_ROW });
    graphqlRequest.mockResolvedValueOnce({ deleteMember: true });
    graphqlRequest.mockResolvedValueOnce({ familyMembers: [] });

    renderPage();

    await userEvent.click(await screen.findByText('Ada Lovelace'));
    await screen.findByText('Grace Hopper');

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove member?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Blood relatives are preserved\. This can't be undone\./)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('deleteMember'), { id: '1' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
    });
  });

  it('opens the "Remove photo?" confirm dialog on the admin-focused panel and calls removeMemberPhoto, refetching after confirm', async () => {
    const ADMIN_FOCUS_WITH_PHOTO = { ...ADMIN_FOCUS_ROW, photoUrl: '/api/family-members/1/photo' };

    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: [] });
    graphqlRequest.mockResolvedValueOnce({ familyMember: ADMIN_FOCUS_WITH_PHOTO });
    removeMemberPhoto.mockResolvedValueOnce({});
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ familyMember: ADMIN_FOCUS_ROW });

    renderPage();

    await userEvent.click(await screen.findByText('Ada Lovelace'));
    await screen.findByText('Grace Hopper');

    const removePhotoButtons = screen.getAllByRole('button', { name: 'Remove photo' });
    expect(removePhotoButtons).toHaveLength(1);
    await userEvent.click(removePhotoButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove photo?')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }));

    await waitFor(() => {
      expect(removeMemberPhoto).toHaveBeenCalledWith('1');
    });
  });
});

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

describe('ManagePage (admin branch — account linking, MNG-03)', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: 99, role: 'ADMIN' },
      loading: false
    });
  });

  it('renders the "Link accounts" section listing fetched unlinked users', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
    graphqlRequest.mockResolvedValueOnce({ unlinkedUsers: TWO_UNLINKED_USERS });

    renderPage();

    expect(await screen.findByText('Link accounts')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('renders the empty-state message when there are no unlinked users', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMembers: ADMIN_TABLE_MEMBERS });
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

describe('ManagePage route gating (MNG-04, T-15-09, real /manage path)', () => {
  function renderManageRoute() {
    return render(
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <MemoryRouter initialEntries={['/manage']}>
          <Routes>
            <Route path="/pending" element={<div>Pending Sentinel</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/manage" element={<ManagePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>
    );
  }

  it('redirects an unlinked, non-admin user to /pending instead of rendering ManagePage', () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: { id: 1, role: 'USER', familyMemberId: null }
    });

    renderManageRoute();

    expect(screen.getByText('Pending Sentinel')).toBeInTheDocument();
    expect(screen.queryByText('Manage family')).not.toBeInTheDocument();
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('renders ManagePage content for a linked, non-admin member', async () => {
    graphqlRequest.mockResolvedValueOnce({ myEditableMembers: ALL_ROWS });
    useAuthMock.mockReturnValue({
      loading: false,
      user: { id: 1, role: 'USER', familyMemberId: '1' }
    });

    renderManageRoute();

    expect(await screen.findByText('Manage family')).toBeInTheDocument();
    expect(screen.queryByText('Pending Sentinel')).not.toBeInTheDocument();
  });
});
