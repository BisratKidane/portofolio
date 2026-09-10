import { Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function Pending() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.familyMemberId || user.role === 'ADMIN') return <Navigate to="/dashboard" replace />;

  return (
    <AuthShell eyebrow="Almost there" title="Waiting to be linked to your family">
      <Box>
        <Typography>
          Your account is approved. An administrator still needs to link you to your family member in the tree —
          you'll get access as soon as that happens.
        </Typography>
      </Box>
    </AuthShell>
  );
}
