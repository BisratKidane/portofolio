import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import AddRelativeDialog from './AddRelativeDialog.jsx';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../../api/photoClient.js', () => ({
  uploadMemberPhoto: vi.fn()
}));

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }) => {
    if (onCropComplete) {
      onCropComplete({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
    }
    return <div data-testid="mock-cropper" />;
  }
}));

import { graphqlRequest } from '../../api/graphqlClient.js';
import { uploadMemberPhoto } from '../../api/photoClient.js';

const ADD_PARENT_MUTATION = `
  mutation AddParent($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!) {
    addParent(memberId: $memberId, role: $role, newMember: $newMember) { id fullname }
  }
`;

const ADD_SPOUSE_MUTATION = `
  mutation AddSpouse($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSpouse(memberId: $memberId, newMember: $newMember) { id fullname }
  }
`;

const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) { id fullname }
  }
`;

const ADD_SIBLING_MUTATION = `
  mutation AddSibling($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSibling(memberId: $memberId, newMember: $newMember) { id fullname }
  }
`;

const IN_SCOPE_MEMBERS = [{ id: '20', fullname: 'William King' }];

beforeEach(() => {
  vi.clearAllMocks();
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
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const utils = render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <AddRelativeDialog
        open
        relationType="parent"
        targetId="1"
        targetName="Almaz Kidane"
        inScopeMembers={IN_SCOPE_MEMBERS}
        onClose={onClose}
        onCreated={onCreated}
        {...props}
      />
    </LocalizationProvider>
  );
  return { ...utils, onClose, onCreated };
}

describe('AddRelativeDialog - parent', () => {
  it('renders "Add member" as the primary submit button', () => {
    renderDialog({ relationType: 'parent' });
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
  });

  it('names the active member in the role helper text', () => {
    renderDialog({ relationType: 'parent', targetName: 'Almaz Kidane' });
    expect(
      screen.getByText('Is this person the mother or father of Almaz Kidane?')
    ).toBeInTheDocument();
  });

  it('submits addParent with role and form fields, then calls onCreated and onClose', async () => {
    graphqlRequest.mockResolvedValueOnce({ addParent: { id: '30', fullname: 'Byron Lovelace' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'parent' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Byron');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_PARENT_MUTATION, {
        memberId: '1',
        role: 'MOTHER',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
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

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddRelativeDialog - spouse', () => {
  it('does not render a role field for spouse', () => {
    renderDialog({ relationType: 'spouse' });
    expect(screen.queryByLabelText('Role', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
  });

  it('submits addSpouse with form fields only', async () => {
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '31', fullname: 'William King' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'William');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'King');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_SPOUSE_MUTATION, {
        memberId: '1',
        newMember: {
          firstname: 'William',
          lastname: 'King',
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

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('attaches a deferred photo to the created member after the add mutation returns', async () => {
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '31', fullname: 'William King' } });
    uploadMemberPhoto.mockResolvedValueOnce({ photoUrl: '/api/family-members/31/photo' });
    const { onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'William');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'King');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    // Pick a file -> opens the crop dialog in deferred mode.
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));

    // Blob is held locally; no upload happens until the member is created.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    });
    expect(uploadMemberPhoto).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(uploadMemberPhoto).toHaveBeenCalledTimes(1);
    });
    const [memberId, blob] = uploadMemberPhoto.mock.calls[0];
    expect(memberId).toBe('31');
    expect(blob).toBeInstanceOf(Blob);
    expect(onCreated).toHaveBeenCalled();
  });

  it('still treats the member as created when the photo upload fails (non-fatal)', async () => {
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '32', fullname: 'William King' } });
    uploadMemberPhoto.mockRejectedValueOnce(new Error('Upload failed.'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { onClose, onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'William');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'King');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await userEvent.upload(document.querySelector('input[type="file"]'), file);
    await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders the mutation error and keeps the dialog open on rejection', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Something went wrong.'));
    const { onClose, onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'William');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'King');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe('AddRelativeDialog - child', () => {
  it('renders the role field and the in-scope-only "other parent" picker toggle', () => {
    renderDialog({ relationType: 'child' });
    expect(screen.getByLabelText('Role', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'or pick someone already in your family' })
    ).toBeInTheDocument();
  });

  it('names the active member in the child role helper text', () => {
    renderDialog({ relationType: 'child', targetName: 'Almaz Kidane' });
    expect(
      screen.getByText("Almaz Kidane is this child's mother or father.")
    ).toBeInTheDocument();
  });

  it('submits addChild with otherParentId null when no picker selection is made', async () => {
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '40', fullname: 'Byron Lovelace' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'child' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Byron');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));
    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_CHILD_MUTATION, {
        memberId: '1',
        role: 'MOTHER',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
          gender: 'Male',
          mothersname: '',
          email: '',
          birthdate: '',
          isAlive: true,
          phone: '',
          address: ''
        },
        otherParentId: null
      });
    });

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('submits addChild with otherParentId set from the in-scope Autocomplete selection', async () => {
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '41', fullname: 'Byron Lovelace' } });
    const { onCreated } = renderDialog({ relationType: 'child' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Byron');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));
    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));

    await userEvent.click(screen.getByRole('button', { name: 'or pick someone already in your family' }));
    const picker = screen.getByLabelText('Other parent (optional)', { exact: false });
    await userEvent.click(picker);
    await userEvent.type(picker, 'William');
    const option = await screen.findByText('William King');
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        ADD_CHILD_MUTATION,
        expect.objectContaining({ otherParentId: '20' })
      );
    });

    expect(onCreated).toHaveBeenCalled();
  });

  it('binds the Autocomplete options strictly to the inScopeMembers prop', async () => {
    renderDialog({ relationType: 'child', inScopeMembers: IN_SCOPE_MEMBERS });
    await userEvent.click(screen.getByRole('button', { name: 'or pick someone already in your family' }));
    const picker = screen.getByLabelText('Other parent (optional)', { exact: false });
    await userEvent.click(picker);
    await userEvent.type(picker, 'William');
    expect(await screen.findByText('William King')).toBeInTheDocument();
    await userEvent.clear(picker);
    await userEvent.type(picker, 'Someone Not In Scope');
    expect(screen.queryByText('Someone Not In Scope')).not.toBeInTheDocument();
  });

  it('renders the exact REL-06 dedup rejection message inside role="alert"', async () => {
    const rel06Message =
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member.";
    graphqlRequest.mockRejectedValueOnce(new Error(rel06Message));
    renderDialog({ relationType: 'child' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Sara');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Kidane');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Female' }));
    await userEvent.click(screen.getByLabelText('Role', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Mother' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(rel06Message);
  });
});

describe('AddRelativeDialog - sibling', () => {
  it('renders no role field and no picker toggle', () => {
    renderDialog({ relationType: 'sibling' });
    expect(screen.queryByLabelText('Role', { exact: false })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'or pick someone already in your family' })
    ).not.toBeInTheDocument();
  });

  it('submits addSibling with form fields only', async () => {
    graphqlRequest.mockResolvedValueOnce({ addSibling: { id: '50', fullname: 'Byron Lovelace' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'sibling' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Byron');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_SIBLING_MUTATION, {
        memberId: '1',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
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

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the Phase 14 D-04 "add a parent first" rejection inside role="alert"', async () => {
    const d04Message = 'Add a parent first — siblings are derived from a shared parent.';
    graphqlRequest.mockRejectedValueOnce(new Error(d04Message));
    renderDialog({ relationType: 'sibling' });

    await userEvent.type(screen.getByLabelText('First name', { exact: false }), 'Byron');
    await userEvent.type(screen.getByLabelText('Last name', { exact: false }), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(d04Message);
  });
});
