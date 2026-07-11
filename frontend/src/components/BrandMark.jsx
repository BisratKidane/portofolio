import { Box, Stack, Typography } from '@mui/material';
import { colors } from '../theme.js';

/** The gradient "P" logo tile, reused in the navbar and auth cards. */
export function BrandGlyph({ size = 38, radius = 3, fontSize }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${radius}px`,
        backgroundImage: colors.gradient,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontFamily: '"Sora", sans-serif',
        fontWeight: 800,
        fontSize: fontSize ?? size * 0.52,
        boxShadow: '0 8px 18px -6px rgba(99,102,241,0.65)',
        flexShrink: 0,
      }}
    >
      P
    </Box>
  );
}

export default function BrandMark({ size = 38 }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center">
      <BrandGlyph size={size} />
      <Typography
        sx={{
          fontFamily: '"Sora", sans-serif',
          fontWeight: 800,
          fontSize: size * 0.5,
          color: colors.ink,
          letterSpacing: '-0.02em',
        }}
      >
        Portofolio
      </Typography>
    </Stack>
  );
}
