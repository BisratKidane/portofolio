import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useAuth } from '../../context/AuthContext.jsx';

// Self-service password change. Requires the current password (verified
// server-side) and never sends an email — the account is already verified.
export default function ChangePasswordDialog({ open, onClose, onChanged }) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }, [open]);

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableSubmit = !currentPassword || !newPassword || !confirmPassword || submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Change password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            fullWidth
          />
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
              {submitting ? 'Changing…' : 'Change password'}
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
