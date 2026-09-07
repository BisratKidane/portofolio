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
  Typography
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';

const PENDING_APPROVALS_QUERY = `
  query PendingApprovals {
    pendingApprovals {
      id
      name
      email
      relationshipNote
      createdAt
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

export default function ApprovalsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    return graphqlRequest(PENDING_APPROVALS_QUERY)
      .then((data) => setRows(data.pendingApprovals))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (row) => {
    setError('');
    setBusyId(row.id);
    try {
      await graphqlRequest(APPROVE, { id: row.id });
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
      await graphqlRequest(REJECT, { id: row.id, reason: rejectReason || null });
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
          People who signed up on their own and verified their email, waiting for a decision on whether they're family.
        </Typography>
      </Box>

      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : rows === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: `1px solid ${colors.line}`, textAlign: 'center' }}>
          <Typography variant="h6">Nothing to review</Typography>
          <Typography color="text.secondary">
            No one is waiting for approval right now. New self-registrations will appear here once they verify their email.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {rows.map((row) => (
            <Paper key={row.id} elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, border: `1px solid ${colors.line}` }}>
              <Stack spacing={0.5}>
                <Typography variant="h6">{row.name}</Typography>
                <Typography variant="body2" color="text.secondary">{row.email}</Typography>
              </Stack>

              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">Relationship note</Typography>
                <Box sx={{ mt: 0.5, p: 2, borderRadius: 3, backgroundColor: colors.bg, maxWidth: { xs: '100%', sm: 640 } }}>
                  {row.relationshipNote ? (
                    <Typography variant="body1" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {row.relationshipNote}
                    </Typography>
                  ) : (
                    <Typography variant="body1" color="text.secondary">No note provided.</Typography>
                  )}
                </Box>
              </Box>

              <Divider sx={{ my: 2, borderColor: colors.line }} />

              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5}>
                <Typography variant="body2" color="text.secondary">Registered {formatWhen(row.createdAt)}</Typography>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleRoundedIcon />}
                    disabled={busyId === row.id}
                    onClick={() => handleApprove(row)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<CancelRoundedIcon />}
                    disabled={busyId === row.id}
                    onClick={() => { setRejectTarget(row); setRejectReason(''); }}
                  >
                    Reject
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reject this request?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            They'll be notified they weren't approved. You can add a reason (optional) — it's kept for auditing but isn't required.
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
          <Button onClick={() => setRejectTarget(null)}>Keep pending</Button>
          <Button color="error" variant="contained" onClick={submitReject}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
