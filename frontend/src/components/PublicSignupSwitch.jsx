import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography
} from '@mui/material';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';

const PUBLIC_REGISTRATION_SETTING_QUERY = `
  query PublicRegistrationSetting {
    publicRegistrationSetting {
      enabled
      updatedAt
      updatedByName
    }
  }
`;

const SET_PUBLIC_REGISTRATION = `mutation SetPublicRegistration($enabled: Boolean!) { setPublicRegistrationEnabled(enabled: $enabled) { enabled updatedAt updatedByName } }`;

// Copied from AdminMemberTable.jsx:21-26 -- this backend's GraphQL `String`
// timestamps arrive as epoch-ms strings, hence the Number.isNaN dance rather
// than a plain `new Date(value)`.
function formatWhen(value) {
  if (!value) return null;
  const ms = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// D-06's three attribution variants, byte-identical to the copy contract.
function describeAttribution(setting) {
  if (setting.updatedAt === null || setting.updatedAt === undefined) {
    return 'Not changed since setup.';
  }
  const verb = setting.enabled ? 'Opened' : 'Closed';
  const actor = setting.updatedByName || 'an administrator';
  return `${verb} by ${actor} on ${formatWhen(setting.updatedAt)}.`;
}

// Not routed and not a page (D-04) -- flat under components/, alongside
// AuthShell.jsx / ProtectedRoute.jsx. Owns its own query, its own mutation
// and its own state, per InvitationsPage.jsx's own "each keeps its own data
// loading and tests" convention.
export default function PublicSignupSwitch() {
  const [setting, setSetting] = useState(null);
  // Two SEPARATE error strings -- carrying Phase 33 WR-01's loadError/actionError
  // split forward. Do not collapse into one `error` state.
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // `enabled` is derived ONLY from the last server-confirmed `setting`, never
  // from local intent -- a rendered OPEN is always backed by a server value.
  const enabled = setting?.enabled;

  const load = useCallback(() => {
    setLoadError('');
    return graphqlRequest(PUBLIC_REGISTRATION_SETTING_QUERY)
      .then((data) => setSetting(data.publicRegistrationSetting))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flip = async (next) => {
    setActionError('');
    setBusy(true);
    try {
      await graphqlRequest(SET_PUBLIC_REGISTRATION, { enabled: next });
      await load();
    } catch (err) {
      setActionError(err.message);
      // Two admins in an incident can flip in opposite directions -- a lost
      // race must be refreshed away rather than left showing a stale state
      // next to a live control (mirrors ApprovalsPage.jsx's WR-01 recovery).
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Asymmetric friction, locked by D-05 and derived from ADMIN-01's own
  // wording ("a spam wave can be stopped in seconds"). Turning OFF flips
  // directly -- one click, no dialog, no interstitial, no undo snackbar.
  // Turning ON only opens the confirmation dialog. There is deliberately no
  // equivalent confirmation on the closing direction -- a reviewer should
  // read that absence as intentional, not as a missing dialog.
  const handleChange = (event) => {
    if (event.target.checked) {
      setConfirmOpen(true);
    } else {
      flip(false);
    }
  };

  const handleConfirmOpen = async () => {
    await flip(true);
    setConfirmOpen(false);
  };

  return (
    <Stack spacing={4} sx={{ maxWidth: 820, mx: 'auto' }}>
      <Box>
        <Typography variant="h4">Public signup</Typography>
        <Typography color="text.secondary">
          Whether someone without an invitation can create an account. Closing it stops new requests — it doesn't affect invitations you've already sent, or anyone already waiting in the queue below.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, border: `1px solid ${colors.line}` }}>
        {loadError ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            <Alert severity="error">{loadError}</Alert>
            <Button variant="contained" sx={{ minHeight: 44 }} onClick={load}>
              Retry
            </Button>
          </Box>
        ) : setting === null ? (
          // The thumb position is the primary state signal, so rendering it
          // before the value is known would assert a state that may be false
          // -- a direct ADMIN-03 violation on the one surface ADMIN-03 governs.
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} aria-hidden="true" />
            <Typography variant="body2" color="text.secondary">
              Checking whether public signup is open…
            </Typography>
          </Stack>
        ) : (
          <>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={2}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                {enabled ? (
                  <LockOpenRoundedIcon sx={{ color: colors.primaryDark }} />
                ) : (
                  <LockRoundedIcon sx={{ color: colors.slate }} />
                )}
                <Stack spacing={0.5}>
                  <Typography variant="h6">
                    {enabled ? 'Public signup is open' : 'Public signup is closed'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {busy
                      ? enabled
                        ? 'Closing public signup…'
                        : 'Opening public signup…'
                      : describeAttribution(setting)}
                  </Typography>
                </Stack>
              </Stack>
              <Tooltip title={enabled ? 'Open — click to close public signup' : 'Closed — click to open public signup'}>
                <Switch
                  checked={Boolean(enabled)}
                  disabled={busy}
                  onChange={handleChange}
                  inputProps={{ 'aria-label': 'Public signup' }}
                />
              </Tooltip>
            </Stack>
            {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}
          </>
        )}
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Open public signup?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Anyone who reaches the sign-up page will be able to create an account without an invitation. Every request still needs your approval before it becomes active, and you can close this again at any time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Keep it closed</Button>
          <Button variant="contained" disabled={busy} onClick={handleConfirmOpen}>
            {busy ? 'Opening…' : 'Open signup'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
