import { createTheme } from '@mui/material/styles';

/**
 * Central color system — the single source of truth for the whole app.
 * Change a value here and it propagates everywhere (theme + components).
 */
export const colors = {
  // Brand
  primary: '#6366f1', // indigo
  primaryDark: '#4f46e5',
  secondary: '#a855f7', // violet
  accent: '#06b6d4', // cyan

  // Semantic
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',

  // Neutrals
  ink: '#0f172a', // headings / primary text
  slate: '#64748b', // muted text
  line: '#e6e8f0', // borders
  bg: '#f5f6fb', // page background
  paper: '#ffffff',

  // Gradients
  gradient: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  gradientVivid: 'linear-gradient(135deg, #4f46e5 0%, #a855f7 55%, #06b6d4 100%)',
  gradientSoft: 'linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%)',
};

const FONT_SANS = '"Inter", "Abyssinica SIL", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Abyssinica SIL", "Inter", system-ui, sans-serif';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: colors.primary, dark: colors.primaryDark, contrastText: '#ffffff' },
    secondary: { main: colors.secondary, contrastText: '#ffffff' },
    info: { main: colors.accent, contrastText: '#ffffff' },
    success: { main: colors.success, contrastText: '#ffffff' },
    warning: { main: colors.warning, contrastText: '#ffffff' },
    error: { main: colors.error, contrastText: '#ffffff' },
    background: { default: colors.bg, paper: colors.paper },
    text: { primary: colors.ink, secondary: colors.slate },
    divider: colors.line,
  },
  shape: { borderRadius: 3.5 },
  typography: {
    fontFamily: FONT_SANS,
    h1: { fontFamily: FONT_DISPLAY, fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontFamily: FONT_DISPLAY, fontWeight: 800, letterSpacing: '-0.03em' },
    h3: { fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontFamily: FONT_DISPLAY, fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    overline: { fontWeight: 700, letterSpacing: '0.12em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: '100vh',
          backgroundColor: colors.bg,
          backgroundImage: `radial-gradient(1100px 560px at 100% -8%, rgba(168,85,247,0.10), transparent 60%),
            radial-gradient(900px 500px at -10% 8%, rgba(99,102,241,0.12), transparent 55%),
            radial-gradient(700px 500px at 90% 110%, rgba(6,182,212,0.08), transparent 55%)`,
          backgroundAttachment: 'fixed',
        },
        '::selection': { backgroundColor: 'rgba(99,102,241,0.22)' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 3, paddingBlock: 9, paddingInline: 20 },
        sizeLarge: { paddingBlock: 12, fontSize: '1rem' },
        containedPrimary: {
          backgroundImage: colors.gradient,
          boxShadow: '0 10px 22px -10px rgba(99,102,241,0.7)',
          '&:hover': { backgroundImage: colors.gradient, filter: 'brightness(1.05)' },
        },
        outlined: { borderColor: colors.line },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 5 },
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 5,
          border: `1px solid ${colors.line}`,
          boxShadow: '0 18px 40px -24px rgba(15,23,42,0.22)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          backgroundColor: '#fff',
          '& fieldset': { borderColor: colors.line },
          '&:hover fieldset': { borderColor: '#cbd0e0' },
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 3, fontWeight: 500 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: 2 } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: 'none' } } },
    MuiLink: { styleOverrides: { root: { fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } } } },
  },
});

/** Small helper reused across the UI. */
export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default theme;
