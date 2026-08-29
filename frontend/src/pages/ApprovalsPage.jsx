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
  Divider,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';

const PENDING_QUERY = `
  query PendingRegistrations {
    pendingRegistrations {
      id
      invitedName
      invitedEmail
      relationshipToFamily
      invitationNote
      registeredAt
      inviter { id name }
      registeredUser { id name email }
    }
  }
`;

const APPROVE = `mutation Approve($id: ID!) { approveUser(userId: $id) { id status } }`;
const REJECT = `mutation Reject($id: ID!, $reason: String) { rejectUser(userId: $id, reason: $reason) { id status } }`;

function formatWhen(value) {
  if (!value) return '—';
  const ms = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <Typography variant="body2">
      <Box component="span" sx={{ color: 'text.secondary' }}>{label}: </Box>
      {value}
    </Typography>
  );
}

export default function ApprovalsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    return graphqlRequest(PENDING_QUERY)
      .then((data) => setRows(data.pendingRegistrations))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (row) => {
    setError('');
    setBusyId(row.id);
    try {
      await graphqlRequest(APPROVE, { id: row.registeredUser.id });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    const row = rejectTarget;
    setError('');
    setBusyId(row.id);
    setRejectTarget(null);
    try {
      await graphqlRequest(REJECT, { id: row.registeredUser.id, reason: rejectReason || null });
      setRejectReason('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={4} sx={{ maxWidth: 820, mx: 'auto' }}>
      <Box>
        <Typography variant="h4">Pending approvals</Typography>
        <Typography color="text.secondary">
          Review family members who registered via invitation. Approving activates their account; rejecting blocks sign-in.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {rows === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: `1px solid ${colors.line}`, textAlign: 'center' }}>
          <Typography color="text.secondary">No registrations are waiting for approval.</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {rows.map((row) => {
            const name = row.registeredUser?.name || row.invitedName || row.invitedEmail;
            const email = row.registeredUser?.email || row.invitedEmail;
            // Both mutations address the ACCOUNT, so a row whose registeredUser
            // is null has nothing to act on -- fk_invitations_registered_user is
            // ON DELETE SET NULL (migration 016), so this is reachable.
            const orphaned = !row.registeredUser;
            const blocked = orphaned;
            const blockedReason = orphaned ? 'This registration has no account to act on.' : '';
            return (
              <Paper key={row.id} elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, border: `1px solid ${colors.line}` }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="h6" noWrap>{name}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{email}</Typography>
                    <Stack spacing={0.25}>
                      <Field label="Invited by" value={row.inviter?.name} />
                      <Field label="Relationship" value={row.relationshipToFamily} />
                      <Field label="Note" value={row.invitationNote} />
                      <Field label="Registered" value={formatWhen(row.registeredAt)} />
                    </Stack>
                  </Box>
                  <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.5} sx={{ flexShrink: 0 }}>
                    <Tooltip title={blockedReason}>
                      <span>
                        <Button
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircleRoundedIcon />}
                          disabled={busyId === row.id || blocked}
                          onClick={() => handleApprove(row)}
                        >
                          Approve
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title={blockedReason}>
                      <span>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<CancelRoundedIcon />}
                          disabled={busyId === row.id || blocked}
                          onClick={() => { setRejectTarget(row); setRejectReason(''); }}
                        >
                          Reject
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reject registration</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Optionally record a reason (kept for auditing). The applicant is notified that they were not approved.
          </Typography>
          <TextField
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={submitReject}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
