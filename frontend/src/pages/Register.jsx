import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function Register() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [form, setForm] = useState({ name: '', password: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(token, form.name, form.password);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Public self-registration is disabled — an account can only be created from
  // a valid invitation link (?token=...).
  if (!token) {
    return (
      <AuthShell
        eyebrow="Invitation required"
        title="You need an invitation"
        subtitle="Agne is invitation-only."
        footer={
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        }
      >
        <Alert severity="info">
          Registration is by invitation only. Ask a family member to invite you, then open the link they send.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="You've been invited — set up your Agne profile."
      footer={
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </Typography>
      }
    >
      <Stack spacing={2.25}>
        {error && <Alert severity="error">{error}</Alert>}
        {result ? (
          <>
            <Alert severity="success">{result.message}</Alert>
            <Typography variant="body2" color="text.secondary">
              We&apos;ve sent a verification link to your email. After you verify, an administrator will review and
              approve your account before you can sign in.
            </Typography>
          </>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.25}>
              <TextField
                label="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                fullWidth
                autoComplete="name"
              />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                fullWidth
                autoComplete="new-password"
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
    </AuthShell>
  );
}
