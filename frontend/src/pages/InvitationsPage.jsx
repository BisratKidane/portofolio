import { Divider, Stack } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { colors } from '../theme.js';
import PublicSignupSwitch from '../components/PublicSignupSwitch.jsx';
import InvitePage from './InvitePage.jsx';
import ApprovalsPage from './ApprovalsPage.jsx';

// One page for the whole invitation lifecycle: admins can control whether the
// public door is open (top), anyone can invite a family member (middle), and
// admins additionally review pending registrations (bottom). Composed from
// previously-separate pieces so each keeps its own data loading and tests.
export default function InvitationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Stack spacing={6} sx={{ maxWidth: 820, mx: 'auto' }}>
      {isAdmin && (
        <>
          <PublicSignupSwitch />
          <Divider sx={{ borderColor: colors.line }} />
        </>
      )}
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
