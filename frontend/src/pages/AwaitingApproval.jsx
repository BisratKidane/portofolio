import { Box, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';

export default function AwaitingApproval() {
  return (
    <AuthShell
      eyebrow="Email verified"
      title="Awaiting admin approval"
      footer={
        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to="/login">
            Return to sign in
          </Link>
        </Typography>
      }
    >
      <Box>
        <Typography>
          Your email address is verified. An administrator now reviews your request to join the family.
        </Typography>
        <Typography color="text.secondary">
          You'll get an email as soon as you're approved — sign in from there.
        </Typography>
      </Box>
    </AuthShell>
  );
}
