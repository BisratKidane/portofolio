import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { graphqlRequest } from '../api/graphqlClient.js';
import AuthShell from '../components/AuthShell.jsx';

const REQUEST_RESET = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) { message }
  }
`;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await graphqlRequest(REQUEST_RESET, { email });
      setResult(data.requestPasswordReset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Password recovery"
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to reset your password."
      footer={
        <Typography variant="body2" color="text.secondary">
          Remembered it?{' '}
          <Link component={RouterLink} to="/login">
            Back to sign in
          </Link>
        </Typography>
      }
    >
      <Stack spacing={2.25}>
        {error && <Alert severity="error">{error}</Alert>}
        {result ? (
          <>
            <Alert severity="success">{result.message}</Alert>
            <Button component={RouterLink} to="/reset-password" variant="outlined" size="large" fullWidth>
              Continue to reset password
            </Button>
          </>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.25}>
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoComplete="email"
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                {loading ? 'Sending…' : 'Send reset token'}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
    </AuthShell>
  );
}
