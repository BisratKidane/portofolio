import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors, getInitials } from '../theme.js';

const DASHBOARD_QUERY = `
  query Dashboard {
    dashboard {
      message
      user { id name email role createdAt }
      users { id name email role createdAt }
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
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    graphqlRequest(DASHBOARD_QUERY)
      .then((data) => setDashboard(data.dashboard))
      .catch((err) => setError(err.message));
  }, []);

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
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                  {formatDate(u.createdAt)}
                </Typography>
                <Chip
                  label={u.role}
                  size="small"
                  variant={u.role === 'ADMIN' ? 'filled' : 'outlined'}
                  color={u.role === 'ADMIN' ? 'secondary' : 'default'}
                  sx={{ minWidth: 64 }}
                />
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
