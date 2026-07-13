import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { graphqlRequest } from '../api/graphqlClient.js';
import AuthShell from '../components/AuthShell.jsx';

const RESET_PASSWORD = `
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const [form, setForm] = useState({ token: tokenFromUrl || '', password: '' });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);
    try {
      await graphqlRequest(RESET_PASSWORD, form);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="New password"
      title="Set a new password"
      subtitle="Paste your reset token and choose a new password."
      footer={
        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to="/login">
            Return to sign in
          </Link>
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.25}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && (
            <Alert severity="success">
              Password updated. You can now sign in with your new password.
            </Alert>
          )}
          {!tokenFromUrl && (
            <TextField
              label="Reset token"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              required
              fullWidth
            />
          )}
          <TextField
            label="New password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            fullWidth
            autoComplete="new-password"
          />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </Stack>
      </Box>
    </AuthShell>
  );
}
