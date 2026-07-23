import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';

const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id firstname lastname fullname gender mothersname email birthdate deathdate phone address
    }
  }
`;

const EMPTY_FORM = {
  firstname: '',
  lastname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  deathdate: '',
  phone: '',
  address: ''
};

function formFromMember(member) {
  if (!member) return EMPTY_FORM;
  return {
    firstname: member.firstname ?? '',
    lastname: member.lastname ?? '',
    gender: member.gender ?? '',
    mothersname: member.mothersname ?? '',
    email: member.email ?? '',
    birthdate: member.birthdate ?? '',
    deathdate: member.deathdate ?? '',
    phone: member.phone ?? '',
    address: member.address ?? ''
  };
}

export default function EditMemberDialog({ open, member, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(formFromMember(member));
    setError('');
  }, [member, open]);

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await graphqlRequest(EDIT_MEMBER_MUTATION, { id: member.id, fields: form });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableSubmit = !form.firstname || !form.lastname || !form.gender || submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit member</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="First name"
              required
              value={form.firstname}
              onChange={handleFormChange('firstname')}
              fullWidth
            />
            <TextField
              label="Last name"
              required
              value={form.lastname}
              onChange={handleFormChange('lastname')}
              fullWidth
            />
            <TextField
              select
              label="Gender"
              required
              value={form.gender}
              onChange={handleFormChange('gender')}
              fullWidth
            >
              <MenuItem value="Male">Male</MenuItem>
              <MenuItem value="Female">Female</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Email" value={form.email} onChange={handleFormChange('email')} fullWidth />
            <TextField label="Phone" value={form.phone} onChange={handleFormChange('phone')} fullWidth />
            <TextField label="Address" value={form.address} onChange={handleFormChange('address')} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Birthdate" value={form.birthdate} onChange={handleFormChange('birthdate')} fullWidth />
            <TextField label="Deathdate" value={form.deathdate} onChange={handleFormChange('deathdate')} fullWidth />
            <TextField
              label="Mother's name"
              value={form.mothersname}
              onChange={handleFormChange('mothersname')}
              fullWidth
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button variant="contained" disabled={disableSubmit} onClick={handleSubmit}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="text" disabled={submitting} onClick={handleClose}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
