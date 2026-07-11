import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { graphqlRequest } from '../api/graphqlClient.js';
import AuthShell from '../components/AuthShell.jsx';

const REQUEST_RESET = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) { message resetToken }
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
      subtitle="Enter your email and we'll generate a reset token for you."
      footer={
        <Typography variant="body2" color="text.secondary">
          Remembered it?{' '}
          <Link component={RouterLink} to="/login">
            Back to sign in
          </Link>
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.25}>
          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <Alert severity="success" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
              {result.message}
              {result.resetToken && (
                <Box
                  sx={{
                    mt: 1,
                    p: 1,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(16,185,129,0.12)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.8rem',
                    wordBreak: 'break-all',
                  }}
                >
                  {result.resetToken}
                </Box>
              )}
            </Alert>
          )}
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
          {result?.resetToken && (
            <Button component={RouterLink} to="/reset-password" variant="outlined" size="large" fullWidth>
              Continue to reset
            </Button>
          )}
        </Stack>
      </Box>
    </AuthShell>
  );
}
