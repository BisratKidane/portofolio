import { AppBar, Avatar, Box, Button, Container, Stack, Toolbar } from '@mui/material';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { colors, getInitials } from '../theme.js';
import BrandMark from './BrandMark.jsx';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${colors.line}`,
          color: colors.ink,
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 72 }, gap: 2 }}>
            <Box component={RouterLink} to="/" sx={{ textDecoration: 'none' }}>
              <BrandMark />
            </Box>
            <Box sx={{ flexGrow: 1 }} />

            {user ? (
              <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} alignItems="center">
                <Button
                  component={RouterLink}
                  to="/dashboard"
                  sx={{ color: colors.slate, fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Dashboard
                </Button>
                <Button
                  component={RouterLink}
                  to="/family"
                  sx={{ color: colors.slate, fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Family tree
                </Button>
                <Avatar
                  sx={{
                    width: 38,
                    height: 38,
                    backgroundImage: colors.gradient,
                    fontFamily: '"Sora", sans-serif',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {getInitials(user.name)}
                </Avatar>
                <Button variant="outlined" onClick={handleLogout} sx={{ color: colors.ink, borderColor: colors.line }}>
                  Logout
                </Button>
              </Stack>
            ) : (
              <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} alignItems="center">
                <Button component={RouterLink} to="/login" sx={{ color: colors.slate, fontWeight: 600 }}>
                  Login
                </Button>
                <Button component={RouterLink} to="/register" variant="contained">
                  Get started
                </Button>
              </Stack>
            )}
          </Toolbar>
        </Container>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1 }}>
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
