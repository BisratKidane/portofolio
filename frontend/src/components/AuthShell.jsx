import { Box, Paper, Stack, Typography } from '@mui/material';
import { colors } from '../theme.js';
import { BrandGlyph } from './BrandMark.jsx';

/**
 * Centered, branded card used by every auth page (login, register, reset...).
 * Keeps the forms visually consistent from one screen to the next.
 */
export default function AuthShell({ eyebrow, title, subtitle, children, footer, maxWidth = 460 }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 1, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth,
          p: { xs: 3, md: 4.5 },
          borderRadius: 4,
          border: `1px solid ${colors.line}`,
          backgroundColor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 30px 70px -34px rgba(79,70,229,0.45)',
        }}
      >
        <Stack spacing={1.25} sx={{ mb: 3.5 }}>
          <BrandGlyph size={48} radius={3.5} />
          {eyebrow && (
            <Typography variant="overline" sx={{ color: colors.primary, mt: 1 }}>
              {eyebrow}
            </Typography>
          )}
          <Typography variant="h4" sx={{ lineHeight: 1.15 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ fontSize: '0.975rem' }}>
              {subtitle}
            </Typography>
          )}
        </Stack>

        {children}

        {footer && (
          <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${colors.line}`, textAlign: 'center' }}>
            {footer}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
