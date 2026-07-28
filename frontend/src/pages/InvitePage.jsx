import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';

const CREATE_INVITATION = `
  mutation CreateInvitation($input: CreateInvitationInput!) {
    createInvitation(input: $input) {
      registrationUrl
      invitation { id invitedEmail relationshipToFamily status createdAt }
    }
  }
`;

const MY_INVITATIONS = `
  query MyInvitations {
    myInvitations { id invitedName invitedEmail relationshipToFamily status expiresAt createdAt }
  }
`;

const EMPTY = { invitedName: '', invitedEmail: '', relationshipToFamily: '', invitationNote: '' };

const STATUS_COLOR = {
  Pending: 'default',
  Registered: 'info',
  Approved: 'success',
  Rejected: 'error',
  Expired: 'warning'
};

function formatDate(value) {
  if (!value) return '—';
  const ms = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvitePage() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastUrl, setLastUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [invitations, setInvitations] = useState([]);

  const load = useCallback(() => {
    return graphqlRequest(MY_INVITATIONS)
      .then((data) => setInvitations(data.myInvitations))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setCopied(false);
    setSubmitting(true);
    try {
      const data = await graphqlRequest(CREATE_INVITATION, {
        input: {
          invitedName: form.invitedName || null,
          invitedEmail: form.invitedEmail,
          relationshipToFamily: form.relationshipToFamily || null,
          invitationNote: form.invitationNote || null
        }
      });
      setLastUrl(data.createInvitation.registrationUrl);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lastUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Stack spacing={4} sx={{ maxWidth: 720, mx: 'auto' }}>
      <Box>
        <Typography variant="h4">Invite a family member</Typography>
        <Typography color="text.secondary">
          We&apos;ll email them a single-use registration link. An administrator approves every new account before it
          becomes active.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, border: `1px solid ${colors.line}` }}>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2.25}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Name (optional)"
                value={form.invitedName}
                onChange={(e) => setForm({ ...form, invitedName: e.target.value })}
                fullWidth
              />
              <TextField
                label="Email address"
                type="email"
                required
                value={form.invitedEmail}
                onChange={(e) => setForm({ ...form, invitedEmail: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              label="Relationship to the family"
              placeholder="e.g. cousin, uncle, family friend"
              value={form.relationshipToFamily}
              onChange={(e) => setForm({ ...form, relationshipToFamily: e.target.value })}
              fullWidth
            />
            <TextField
              label="Note (optional)"
              multiline
              minRows={2}
              value={form.invitationNote}
              onChange={(e) => setForm({ ...form, invitationNote: e.target.value })}
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={submitting || !form.invitedEmail}>
              {submitting ? 'Sending invitation…' : 'Send invitation'}
            </Button>
          </Stack>
        </Box>

        {lastUrl && (
          <Alert severity="success" sx={{ mt: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Invitation sent by email. You can also share this single-use link directly:
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField value={lastUrl} size="small" fullWidth InputProps={{ readOnly: true }} />
              <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
                <IconButton aria-label="Copy invitation link" onClick={handleCopy}>
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Alert>
        )}
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 4, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 3, md: 4 }, py: 2.5 }}>
          <Typography variant="h6">Your invitations</Typography>
        </Box>
        <Divider sx={{ borderColor: colors.line }} />
        {invitations.length === 0 ? (
          <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
            <Typography color="text.secondary">You haven&apos;t sent any invitations yet.</Typography>
          </Box>
        ) : (
          <Stack divider={<Divider sx={{ borderColor: colors.line }} />}>
            {invitations.map((inv) => (
              <Stack
                key={inv.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ px: { xs: 3, md: 4 }, py: 2 }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {inv.invitedName || inv.invitedEmail}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {inv.invitedEmail}
                    {inv.relationshipToFamily ? ` · ${inv.relationshipToFamily}` : ''}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                  Sent {formatDate(inv.createdAt)}
                </Typography>
                <Chip label={inv.status} size="small" color={STATUS_COLOR[inv.status] || 'default'} variant="outlined" />
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
