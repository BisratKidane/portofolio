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
      id firstname lastname fullname gender mothersname email birthdate deathdate phone address
    }
  }
`;

const MEMBER = {
  id: '1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  gender: 'Female',
  mothersname: 'Jane Doe',
  email: 'ada@example.com',
  birthdate: '1815-12-10',
  deathdate: '',
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

    expect(screen.getByLabelText('First name', { exact: false })).toHaveValue('Ada');
    expect(screen.getByLabelText('Last name', { exact: false })).toHaveValue('Lovelace');
    expect(screen.getByLabelText('Email', { exact: false })).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Phone', { exact: false })).toHaveValue('555-1234');
    expect(screen.getByLabelText('Address', { exact: false })).toHaveValue('1 Main St');
    expect(screen.getByLabelText("Mother's name", { exact: false })).toHaveValue('Jane Doe');
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

    const firstNameField = screen.getByLabelText('First name', { exact: false });
    await userEvent.clear(firstNameField);
    await userEvent.type(firstNameField, 'Augusta');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(EDIT_MEMBER_MUTATION, {
        id: '1',
        fields: {
          firstname: 'Augusta',
          lastname: 'Lovelace',
          gender: 'Female',
          mothersname: 'Jane Doe',
          email: 'ada@example.com',
          birthdate: '1815-12-10',
          deathdate: '',
          phone: '555-1234',
          address: '1 Main St'
        }
      });
    });

    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
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

    expect(screen.getByLabelText('First name', { exact: false })).toHaveValue('Grace');
    expect(screen.getByLabelText('Last name', { exact: false })).toHaveValue('Hopper');
  });
});
