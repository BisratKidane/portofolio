import { useEffect, useState } from 'react';
import { Alert, Box, Link, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setError('Missing verification token.');
      setLoading(false);
      return;
    }
    verifyEmail(token)
      .then((user) => {
        // Email verified, but the account may still be awaiting admin approval
        // (two-gate flow) — route there instead of the dashboard.
        navigate(user && user.status && user.status !== 'Active' ? '/pending' : '/dashboard');
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Verifying your email"
      footer={
        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to="/login">
            Return to sign in
          </Link>
        </Typography>
      }
    >
      <Box>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          loading && <Typography>Verifying your email…</Typography>
        )}
      </Box>
    </AuthShell>
  );
}
