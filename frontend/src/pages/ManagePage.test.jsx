import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ManagePage from './ManagePage.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';

const useAuthMock = vi.fn();

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const SELF_ROW = {
  id: '1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  birthdate: null,
  deathdate: null,
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
  return render(<ManagePage />);
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
});

describe('ManagePage route gating (MNG-04, T-15-09, real /manage path)', () => {
  function renderManageRoute() {
    return render(
      <MemoryRouter initialEntries={['/manage']}>
        <Routes>
          <Route path="/pending" element={<div>Pending Sentinel</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/manage" element={<ManagePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
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
