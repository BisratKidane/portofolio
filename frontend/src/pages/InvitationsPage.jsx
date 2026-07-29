import { Divider, Stack } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { colors } from '../theme.js';
import InvitePage from './InvitePage.jsx';
import ApprovalsPage from './ApprovalsPage.jsx';

// One page for the whole invitation lifecycle: anyone can invite a family
// member (top), and admins additionally review pending registrations (bottom).
// Composed from the two previously-separate pages so each keeps its own data
// loading and tests.
export default function InvitationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Stack spacing={6} sx={{ maxWidth: 820, mx: 'auto' }}>
      <InvitePage />
      {isAdmin && (
        <>
          <Divider sx={{ borderColor: colors.line }} />
          <ApprovalsPage />
        </>
      )}
    </Stack>
  );
}
