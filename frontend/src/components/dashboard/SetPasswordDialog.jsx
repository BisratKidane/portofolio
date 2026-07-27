import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';

const SET_USER_PASSWORD_MUTATION = `
  mutation SetUserPassword($userId: ID!, $newPassword: String!) {
    setUserPassword(userId: $userId, newPassword: $newPassword)
  }
`;

// Admin sets another account's password directly (no email, no current
// password). The target's existing sessions are revoked server-side.
export default function SetPasswordDialog({ open, user, onClose, onSaved }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }, [open, user]);

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await graphqlRequest(SET_USER_PASSWORD_MUTATION, { userId: user.id, newPassword });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableSubmit = !newPassword || !confirmPassword || submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Set password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {user && (
            <Typography variant="body2" color="text.secondary">
              Set a new password for <strong>{user.name}</strong> ({user.email}). They will be signed out on their other devices.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <Button variant="contained" disabled={disableSubmit} onClick={handleSubmit}>
              {submitting ? 'Saving…' : 'Set password'}
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
