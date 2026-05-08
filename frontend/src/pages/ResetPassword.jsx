import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';

const RESET_PASSWORD = `
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

export default function ResetPassword() {
  const [form, setForm] = useState({ token: '', password: '' });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);
    try {
      await graphqlRequest(RESET_PASSWORD, form);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Paper sx={{ maxWidth: 560, mx: 'auto', p: 4 }}>
      <Typography variant="h4" gutterBottom>Set a new password</Typography>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">Password updated. You can log in with your new password.</Alert>}
          <TextField label="Reset token" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required />
          <TextField label="New password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Button type="submit" variant="contained">Reset password</Button>
        </Stack>
      </Box>
    </Paper>
  );
}
