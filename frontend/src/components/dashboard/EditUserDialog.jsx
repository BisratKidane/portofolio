import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';

const UPDATE_USER_MUTATION = `
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      id
      name
      email
      role
      emailVerified
    }
  }
`;

const EMPTY = { name: '', email: '', role: 'USER' };

function formFromUser(user) {
  if (!user) return EMPTY;
  return { name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'USER' };
}

// Edit an account's name/email (and role, admin-only). Changing the email
// forces re-verification server-side, so we warn before submitting. When the
// signed-in user changes their OWN email, the app must treat it as a sign-out
// (they become unverified) — that path calls onRequireReverify instead of
// onSaved.
export default function EditUserDialog({
  open,
  user,
  canEditRole = false,
  isSelf = false,
  onClose,
  onSaved,
  onRequireReverify
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(formFromUser(user));
    setError('');
  }, [user, open]);

  const originalEmail = user?.email ?? '';
  const emailChanged = form.email.trim().toLowerCase() !== originalEmail.trim().toLowerCase();

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    const input = { name, email: form.email.trim() };
    if (canEditRole) input.role = form.role;

    setError('');
    setSubmitting(true);
    try {
      await graphqlRequest(UPDATE_USER_MUTATION, { id: user.id, input });
      if (isSelf && emailChanged) {
        // Own email changed → account is now unverified → session is dead.
        onRequireReverify?.();
      } else {
        onSaved?.();
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableSubmit = !form.name.trim() || !form.email.trim() || submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{isSelf ? 'Edit account' : 'Edit user'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            fullWidth
          />
          {canEditRole && (
            <TextField
              select
              label="Role"
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              fullWidth
            >
              <MenuItem value="USER">Member</MenuItem>
              <MenuItem value="ADMIN">Administrator</MenuItem>
            </TextField>
          )}

          {emailChanged && (
            <Alert severity="warning">
              {isSelf
                ? 'Changing your email will sign you out until you re-verify the new address.'
                : 'This will send a verification link; the user must re-verify before they can sign in again.'}
            </Alert>
          )}

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
