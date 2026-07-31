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

  it('does not render a manual Role field for parent (role is derived from gender)', () => {
    renderDialog({ relationType: 'parent' });
    expect(screen.queryByLabelText('Role', { exact: false })).not.toBeInTheDocument();
  });

  it('submits addParent with role FATHER derived from a Male gender', async () => {
    graphqlRequest.mockResolvedValueOnce({ addParent: { id: '30', fullname: 'Byron Lovelace' } });
    const { onClose, onCreated } = renderDialog({ relationType: 'parent' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_PARENT_MUTATION, {
        memberId: '1',
        role: 'FATHER',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
          geezFirstname: '',
          geezLastname: '',
          geezMothersname: '',
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

  it('submits addParent with role MOTHER derived from a Female gender', async () => {
    graphqlRequest.mockResolvedValueOnce({ addParent: { id: '31', fullname: 'Ada Lovelace' } });
    renderDialog({ relationType: 'parent' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Ada');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Female' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        ADD_PARENT_MUTATION,
        expect.objectContaining({ role: 'MOTHER' })
      );
    });
  });

  it('keeps submit disabled for an Other-gender parent (no father/mother slot)', async () => {
    renderDialog({ relationType: 'parent' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Sky');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Doe');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));

    expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled();
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

    await userEvent.type(screen.getByLabelText(/^First name/i), 'William');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'King');

    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_SPOUSE_MUTATION, {
        memberId: '1',
        newMember: {
          firstname: 'William',
          lastname: 'King',
          geezFirstname: '',
          geezLastname: '',
          geezMothersname: '',
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

  it("sends a Ge'ez value typed into the Ge'ez first name field through to the create mutation", async () => {
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '31', fullname: 'William King' } });
    renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'William');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'King');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.type(screen.getByLabelText("Ge'ez first name", { exact: false }), 'ጃነ');

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        ADD_SPOUSE_MUTATION,
        expect.objectContaining({
          newMember: expect.objectContaining({ geezFirstname: 'ጃነ' })
        })
      );
    });
  });

  it('attaches a deferred photo to the created member after the add mutation returns', async () => {
    graphqlRequest.mockResolvedValueOnce({ addSpouse: { id: '31', fullname: 'William King' } });
    uploadMemberPhoto.mockResolvedValueOnce({ photoUrl: '/api/family-members/31/photo' });
    const { onCreated } = renderDialog({ relationType: 'spouse' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'William');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'King');
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

    await userEvent.type(screen.getByLabelText(/^First name/i), 'William');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'King');
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

    await userEvent.type(screen.getByLabelText(/^First name/i), 'William');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'King');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe('AddRelativeDialog - child', () => {
  it('renders no manual role field, and shows the in-scope-only "other parent" picker toggle', () => {
    renderDialog({ relationType: 'child', targetGender: 'Male', targetFirstname: 'Almaz' });
    expect(screen.queryByLabelText('Role', { exact: false })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'or pick someone already in your family' })
    ).toBeInTheDocument();
  });

  it('states that a male anchor will be recorded as the child\'s father', () => {
    renderDialog({ relationType: 'child', targetName: 'Almaz Kidane', targetGender: 'Male', targetFirstname: 'Almaz' });
    expect(
      screen.getByText("Almaz Kidane will be recorded as this child's father.")
    ).toBeInTheDocument();
  });

  it('states that a female anchor will be recorded as the child\'s mother', () => {
    renderDialog({ relationType: 'child', targetName: 'Almaz Kidane', targetGender: 'Female', targetFirstname: 'Almaz' });
    expect(
      screen.getByText("Almaz Kidane will be recorded as this child's mother.")
    ).toBeInTheDocument();
  });

  it('prefills the last name with a male anchor\'s first name', () => {
    renderDialog({ relationType: 'child', targetGender: 'Male', targetFirstname: 'Almaz' });
    expect(screen.getByLabelText(/^Last name/i)).toHaveValue('Almaz');
  });

  it('does not prefill the last name for a female anchor', () => {
    renderDialog({ relationType: 'child', targetGender: 'Female', targetFirstname: 'Almaz' });
    expect(screen.getByLabelText(/^Last name/i)).toHaveValue('');
  });

  it('submits addChild with role FATHER derived from a male anchor (otherParentId null)', async () => {
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '40', fullname: 'Byron Almaz' } });
    const { onClose, onCreated } = renderDialog({
      relationType: 'child',
      targetGender: 'Male',
      targetFirstname: 'Almaz'
    });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_CHILD_MUTATION, {
        memberId: '1',
        role: 'FATHER',
        newMember: {
          firstname: 'Byron',
          lastname: 'Almaz',
          geezFirstname: '',
          geezLastname: '',
          geezMothersname: '',
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

  it('submits addChild with role MOTHER derived from a female anchor', async () => {
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '42', fullname: 'Byron Lovelace' } });
    renderDialog({ relationType: 'child', targetGender: 'Female', targetFirstname: 'Ada' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        ADD_CHILD_MUTATION,
        expect.objectContaining({ role: 'MOTHER' })
      );
    });
  });

  it('submits addChild with otherParentId set from the in-scope Autocomplete selection', async () => {
    graphqlRequest.mockResolvedValueOnce({ addChild: { id: '41', fullname: 'Byron Lovelace' } });
    const { onCreated } = renderDialog({
      relationType: 'child',
      targetGender: 'Female',
      targetFirstname: 'Ada'
    });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

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
    renderDialog({
      relationType: 'child',
      targetGender: 'Female',
      targetFirstname: 'Ada',
      inScopeMembers: IN_SCOPE_MEMBERS
    });
    await userEvent.click(screen.getByRole('button', { name: 'or pick someone already in your family' }));
    const picker = screen.getByLabelText('Other parent (optional)', { exact: false });
    await userEvent.click(picker);
    await userEvent.type(picker, 'William');
    expect(await screen.findByText('William King')).toBeInTheDocument();
    await userEvent.clear(picker);
    await userEvent.type(picker, 'Someone Not In Scope');
    expect(screen.queryByText('Someone Not In Scope')).not.toBeInTheDocument();
  });

  it('blocks submit and warns when the anchor has no Male/Female gender', async () => {
    renderDialog({ relationType: 'child', targetGender: 'Other', targetFirstname: 'Sky' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled();
    expect(screen.getByText(/can't be set as this child's mother or father/i)).toBeInTheDocument();
  });

  it('renders the exact REL-06 dedup rejection message inside role="alert"', async () => {
    const rel06Message =
      "A child named 'Sara' already exists under Almaz Kidane. Pick a different name, or edit the existing member.";
    graphqlRequest.mockRejectedValueOnce(new Error(rel06Message));
    renderDialog({ relationType: 'child', targetGender: 'Female', targetFirstname: 'Almaz' });

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Sara');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Kidane');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Female' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    // A derived-role info alert is also present, so assert on the error text.
    expect(await screen.findByText(rel06Message)).toBeInTheDocument();
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

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(ADD_SIBLING_MUTATION, {
        memberId: '1',
        newMember: {
          firstname: 'Byron',
          lastname: 'Lovelace',
          geezFirstname: '',
          geezLastname: '',
          geezMothersname: '',
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

    await userEvent.type(screen.getByLabelText(/^First name/i), 'Byron');
    await userEvent.type(screen.getByLabelText(/^Last name/i), 'Lovelace');
    await userEvent.click(screen.getByLabelText('Gender', { exact: false }));
    await userEvent.click(await screen.findByRole('option', { name: 'Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(d04Message);
  });
});
