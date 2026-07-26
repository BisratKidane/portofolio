import { Box, Stack, Typography } from '@mui/material';
import { colors } from '../theme.js';

// The white "tree of people" glyph that sits on the gradient tile. Same artwork
// as public/favicon.svg, minus the tile background (BrandGlyph supplies that).
function TreeGlyph({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M48 86 L48 50" />
        <path d="M48 50 L48 34" />
        <path d="M48 50 C60 48 66 42 69 37" />
        <path d="M48 50 C36 48 30 42 27 37" />
        <path d="M48 62 C66 60 76 55 80 51" />
        <path d="M48 62 C30 60 20 55 16 51" />
      </g>
      <path fill="#ffffff" d="M41 88 h14 a2.5 2.5 0 0 0 2.4-3.2 l-1.8-6.3 h-15.2 l-1.8 6.3 a2.5 2.5 0 0 0 2.4 3.2 z" />
      <g fill="#ffffff">
        <g transform="translate(33.5,5) scale(1.25)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></g>
        <g transform="translate(13,18) scale(1.1)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></g>
        <g transform="translate(53,18) scale(1.1)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></g>
        <g transform="translate(2.5,34) scale(1.0)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></g>
        <g transform="translate(64.5,34) scale(1.0)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></g>
      </g>
    </svg>
  );
}

/** The gradient logo tile (tree-of-people glyph), reused in the navbar and auth cards. */
export function BrandGlyph({ size = 38, radius = 3 }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${radius}px`,
        backgroundImage: colors.gradient,
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 8px 18px -6px rgba(99,102,241,0.65)',
        flexShrink: 0,
      }}
    >
      <TreeGlyph size={size * 0.72} />
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
        Agne
      </Typography>
    </Stack>
  );
}
