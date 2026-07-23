import { useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';

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

const NEEDS_ROLE = new Set(['parent']);

export default function AddRelativeDialog({ open, relationType, targetId, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const resetState = () => {
    setForm(EMPTY_FORM);
    setRole('');
    setError('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      if (relationType === 'parent') {
        await graphqlRequest(ADD_PARENT_MUTATION, { memberId: targetId, role, newMember: form });
      } else if (relationType === 'spouse') {
        await graphqlRequest(ADD_SPOUSE_MUTATION, { memberId: targetId, newMember: form });
      }
      resetState();
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const needsRole = NEEDS_ROLE.has(relationType);
  const disableSubmit = !form.firstname || !form.lastname || !form.gender || (needsRole && !role) || submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add {relationType}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {needsRole && (
            <TextField
              select
              label="Role"
              required
              value={role}
              onChange={(event) => setRole(event.target.value)}
              fullWidth
            >
              <MenuItem value="MOTHER">Mother</MenuItem>
              <MenuItem value="FATHER">Father</MenuItem>
            </TextField>
          )}

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
              {submitting ? 'Adding…' : 'Add member'}
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
