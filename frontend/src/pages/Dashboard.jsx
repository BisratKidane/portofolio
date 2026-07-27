import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { colors, getInitials } from '../theme.js';
import EditUserDialog from '../components/dashboard/EditUserDialog.jsx';
import ChangePasswordDialog from '../components/dashboard/ChangePasswordDialog.jsx';
import SetPasswordDialog from '../components/dashboard/SetPasswordDialog.jsx';

const DASHBOARD_QUERY = `
  query Dashboard {
    dashboard {
      message
      user { id name email role emailVerified createdAt updatedAt }
      users { id name email role emailVerified createdAt updatedAt }
    }
  }
`;

function formatDate(value) {
  if (!value) return '—';
  const ms = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ icon, label, value, tint }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 4,
        border: `1px solid ${colors.line}`,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2.5,
          display: 'grid',
          placeItems: 'center',
          color: tint,
          backgroundColor: `${tint}1f`,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
          {label}
        </Typography>
        <Typography variant="h6" noWrap sx={{ fontFamily: '"Sora", sans-serif' }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

export default function Dashboard() {
  const { logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const [editTarget, setEditTarget] = useState(null); // { user, isSelf }
  const [passwordTarget, setPasswordTarget] = useState(null); // admin set-password target
  const [changingOwnPassword, setChangingOwnPassword] = useState(false);

  const load = useCallback(() => {
    return graphqlRequest(DASHBOARD_QUERY)
      .then((data) => setDashboard(data.dashboard))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert severity="error">{error}</Alert>;

  if (!dashboard) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const { user, users, message } = dashboard;
  const isAdmin = user.role === 'ADMIN';
  const adminCount = isAdmin && users ? users.filter((u) => u.role === 'ADMIN').length : null;

  return (
    <Stack spacing={4}>
      {/* Hero banner */}
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          backgroundImage: colors.gradientVivid,
          color: '#fff',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            right: -60,
            top: -60,
            width: 240,
            height: 240,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)',
          }}
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={3}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          sx={{ position: 'relative' }}
        >
          <Avatar
            sx={{
              width: 72,
              height: 72,
              fontSize: 26,
              fontFamily: '"Sora", sans-serif',
              fontWeight: 700,
              bgcolor: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: '2px solid rgba(255,255,255,0.4)',
            }}
          >
            {getInitials(user.name)}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="overline" sx={{ opacity: 0.85 }}>
              {message}
            </Typography>
            <Typography variant="h3" sx={{ color: '#fff', lineHeight: 1.1 }}>
              {user.name}
            </Typography>
            <Typography sx={{ opacity: 0.9, mt: 0.5 }}>{user.email}</Typography>
          </Box>
          <Chip
            label={user.role}
            icon={<ShieldRoundedIcon sx={{ color: '#fff !important', fontSize: 18 }} />}
            sx={{
              bgcolor: 'rgba(255,255,255,0.18)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.35)',
              px: 0.5,
              fontWeight: 700,
            }}
          />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ position: 'relative', mt: 3 }}>
          <Button
            variant="contained"
            startIcon={<EditRoundedIcon />}
            onClick={() => setEditTarget({ user, isSelf: true })}
            sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.28)', boxShadow: 'none' } }}
          >
            Edit account
          </Button>
          <Button
            variant="outlined"
            startIcon={<LockResetRoundedIcon />}
            onClick={() => setChangingOwnPassword(true)}
            sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
          >
            Change password
          </Button>
        </Stack>
      </Paper>

      {/* Stat tiles */}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: `repeat(${isAdmin ? 3 : 2}, 1fr)` },
        }}
      >
        <StatCard
          icon={<ShieldRoundedIcon />}
          label="Account role"
          value={isAdmin ? 'Administrator' : 'Member'}
          tint={colors.secondary}
        />
        <StatCard
          icon={<CalendarMonthRoundedIcon />}
          label="Member since"
          value={formatDate(user.createdAt)}
          tint={colors.accent}
        />
        {isAdmin && (
          <StatCard
            icon={<GroupRoundedIcon />}
            label="Total users"
            value={users ? users.length : '—'}
            tint={colors.primary}
          />
        )}
      </Box>

      {/* Admin: managed users */}
      {isAdmin && users && (
        <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
          <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="h5">System users</Typography>
                <Typography color="text.secondary" variant="body2">
                  Everyone with access to this workspace.
                </Typography>
              </Box>
              <Chip
                label={`${users.length} total · ${adminCount} admin`}
                sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }}
              />
            </Stack>
          </Box>
          <Divider sx={{ borderColor: colors.line }} />
          <Stack divider={<Divider sx={{ borderColor: colors.line }} />}>
            {users.map((u) => (
              <Stack
                key={u.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ px: { xs: 3, md: 4 }, py: 2, transition: 'background 0.15s', '&:hover': { bgcolor: 'rgba(99,102,241,0.04)' } }}
              >
                <Avatar
                  sx={{
                    width: 42,
                    height: 42,
                    fontSize: 15,
                    fontFamily: '"Sora", sans-serif',
                    fontWeight: 700,
                    backgroundImage: u.role === 'ADMIN' ? colors.gradient : 'none',
                    bgcolor: u.role === 'ADMIN' ? undefined : '#eef1f8',
                    color: u.role === 'ADMIN' ? '#fff' : colors.slate,
                  }}
                >
                  {getInitials(u.name)}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {u.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {u.email}
                  </Typography>
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right', minWidth: 140 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                    Joined {formatDate(u.createdAt)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                    Updated {formatDate(u.updatedAt)}
                  </Typography>
                </Box>
                {!u.emailVerified && (
                  <Chip label="Unverified" size="small" color="warning" variant="outlined" sx={{ minWidth: 64 }} />
                )}
                <Chip
                  label={u.role}
                  size="small"
                  variant={u.role === 'ADMIN' ? 'filled' : 'outlined'}
                  color={u.role === 'ADMIN' ? 'secondary' : 'default'}
                  sx={{ minWidth: 64 }}
                />
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Edit user">
                    <IconButton
                      size="small"
                      aria-label={`Edit ${u.name}`}
                      onClick={() => setEditTarget({ user: u, isSelf: String(u.id) === String(user.id) })}
                    >
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Set password">
                    <IconButton
                      size="small"
                      aria-label={`Set password for ${u.name}`}
                      onClick={() => setPasswordTarget(u)}
                    >
                      <LockResetRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {editTarget && (
        <EditUserDialog
          open
          user={editTarget.user}
          isSelf={editTarget.isSelf}
          canEditRole={isAdmin}
          onClose={() => setEditTarget(null)}
          onSaved={load}
          onRequireReverify={() => {
            setEditTarget(null);
            logout();
          }}
        />
      )}

      <ChangePasswordDialog open={changingOwnPassword} onClose={() => setChangingOwnPassword(false)} />

      {passwordTarget && (
        <SetPasswordDialog
          open
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSaved={load}
        />
      )}
    </Stack>
  );
}
