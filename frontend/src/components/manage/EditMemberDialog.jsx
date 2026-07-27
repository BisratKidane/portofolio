import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, Stack } from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';
import MemberFields from './MemberFields.jsx';

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

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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

          <MemberFields form={form} onChange={handleFieldChange} />

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
