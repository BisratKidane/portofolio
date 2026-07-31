import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import EditMemberDialog from './EditMemberDialog.jsx';

vi.mock('../../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../../api/graphqlClient.js';

const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id firstname lastname fullname gender mothersname email birthdate isAlive phone address
    }
  }
`;

const MEMBER = {
  id: '1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  geezFirstname: 'አዳ',
  geezLastname: 'ላቭሌስ',
  gender: 'Female',
  mothersname: 'Jane Doe',
  geezMothersname: 'ጄን',
  email: 'ada@example.com',
  birthdate: '1815-12-10',
  isAlive: true,
  phone: '555-1234',
  address: '1 Main St'
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <EditMemberDialog open member={MEMBER} onClose={onClose} onSaved={onSaved} {...props} />
    </LocalizationProvider>
  );
  return { ...utils, onClose, onSaved };
}

describe('EditMemberDialog', () => {
  it('pre-fills the form fields from the member prop', () => {
    renderDialog();

    expect(screen.getByLabelText(/^First name/i)).toHaveValue('Ada');
    expect(screen.getByLabelText(/^Last name/i)).toHaveValue('Lovelace');
    expect(screen.getByLabelText('Email', { exact: false })).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Phone', { exact: false })).toHaveValue('555-1234');
    expect(screen.getByLabelText('Address', { exact: false })).toHaveValue('1 Main St');
    expect(screen.getByLabelText(/^Mother's name/i)).toHaveValue('Jane Doe');
  });

  it("pre-fills the 3 Ge'ez fields from a member with real Ge'ez values (SC1 round-trip)", () => {
    renderDialog();

    expect(screen.getByLabelText("Ge'ez first name (ስም)", { exact: false })).toHaveValue('አዳ');
    expect(screen.getByLabelText("Ge'ez last name (ስም ኣቦ)", { exact: false })).toHaveValue('ላቭሌስ');
    expect(screen.getByLabelText("Ge'ez mother's name (ስም ኣደ)", { exact: false })).toHaveValue('ጄን');
  });

  it("pre-fills the 3 Ge'ez fields with empty string for a member with no Ge'ez data yet", () => {
    const memberWithoutGeez = { ...MEMBER, geezFirstname: null, geezLastname: null, geezMothersname: null };
    renderDialog({ member: memberWithoutGeez });

    expect(screen.getByLabelText("Ge'ez first name (ስም)", { exact: false })).toHaveValue('');
    expect(screen.getByLabelText("Ge'ez last name (ስም ኣቦ)", { exact: false })).toHaveValue('');
    expect(screen.getByLabelText("Ge'ez mother's name (ስም ኣደ)", { exact: false })).toHaveValue('');
  });

  it('renders "Save changes" as the primary submit button', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('submits editMember with the exact EditFamilyMemberInput field list, changing firstname', async () => {
    graphqlRequest.mockResolvedValueOnce({
      editMember: { id: '1', firstname: 'Augusta', lastname: 'Lovelace' }
    });
    const { onClose, onSaved } = renderDialog();

    const firstNameField = screen.getByLabelText(/^First name/i);
    await userEvent.clear(firstNameField);
    await userEvent.type(firstNameField, 'Augusta');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(EDIT_MEMBER_MUTATION, {
        id: '1',
        fields: {
          firstname: 'Augusta',
          lastname: 'Lovelace',
          geezFirstname: 'አዳ',
          geezLastname: 'ላቭሌስ',
          gender: 'Female',
          mothersname: 'Jane Doe',
          geezMothersname: 'ጄን',
          email: 'ada@example.com',
          birthdate: '1815-12-10',
          isAlive: true,
          phone: '555-1234',
          address: '1 Main St'
        }
      });
    });

    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clearing a previously-filled Ge'ez field before submit sends '' for that key (D-05)", async () => {
    graphqlRequest.mockResolvedValueOnce({ editMember: { id: '1' } });
    renderDialog();

    await userEvent.clear(screen.getByLabelText("Ge'ez first name (ስም)", { exact: false }));

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(
        EDIT_MEMBER_MUTATION,
        expect.objectContaining({
          fields: expect.objectContaining({ geezFirstname: '' })
        })
      );
    });
  });

  it('never sends motherId/fatherId/spouse in the fields argument', async () => {
    graphqlRequest.mockResolvedValueOnce({ editMember: { id: '1' } });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalled();
    });

    const [, variables] = graphqlRequest.mock.calls[0];
    expect(variables.fields).not.toHaveProperty('motherId');
    expect(variables.fields).not.toHaveProperty('fatherId');
    expect(variables.fields).not.toHaveProperty('spouse');
  });

  it('renders the mutation error and keeps the dialog open on rejection', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('Something went wrong.'));
    const { onClose, onSaved } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('resets the form when a different member is opened', () => {
    const { rerender } = renderDialog();

    const OTHER_MEMBER = { ...MEMBER, id: '2', firstname: 'Grace', lastname: 'Hopper' };
    rerender(
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <EditMemberDialog open member={OTHER_MEMBER} onClose={vi.fn()} onSaved={vi.fn()} />
      </LocalizationProvider>
    );

    expect(screen.getByLabelText(/^First name/i)).toHaveValue('Grace');
    expect(screen.getByLabelText(/^Last name/i)).toHaveValue('Hopper');
  });
});
