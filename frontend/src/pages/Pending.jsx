import { Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function Pending() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.familyMemberId || user.role === 'ADMIN') return <Navigate to="/dashboard" replace />;

  return (
    <AuthShell eyebrow="Almost there" title="Waiting for admin approval">
      <Box>
        <Typography>
          Your account is awaiting an admin to link you to your family member; you'll get access once linked.
        </Typography>
      </Box>
    </AuthShell>
  );
}
