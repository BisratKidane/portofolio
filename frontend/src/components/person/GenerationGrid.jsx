// Presentational children-grid wrapper reused for both the gen1 (Child) and
// gen2 (Grandchild) rows on /detail (Phase 27, NAV-01). Lays one generation's
// people into a responsive MUI Grid with a single group-level inverted-V (∧)
// apex cue above it -- never one line per child card (D-06) -- communicating
// "these children belong to the couple above." PersonCard (Phase 25) is
// rendered unmodified; this file only composes it and forwards props.
import { Box, CircularProgress, Grid } from '@mui/material';
import { colors } from '../../theme.js';
import PersonCard from './PersonCard.jsx';

// A small, fixed-size, restrained cue -- two short rotated line segments
// meeting at a shared center-top point, forming a calm inverted-V pointing
// up. Same plain-Box-no-SVG technique as PersonCard's dashed spouse
// connector, but in colors.line (lighter/more restrained than both
// colors.slate's /family tree edges and colors.primary's spouse connector,
// per D-06).
function ApexCue() {
  return (
    <Box
      aria-hidden="true"
      data-testid="generation-apex"
      sx={{ position: 'relative', height: 14, width: 40, mx: 'auto' }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 8,
          width: '50%',
          height: 2,
          bgcolor: colors.line,
          transform: 'rotate(20deg)',
          transformOrigin: 'right center'
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          right: 0,
          top: 8,
          width: '50%',
          height: 2,
          bgcolor: colors.line,
          transform: 'rotate(-20deg)',
          transformOrigin: 'left center'
        }}
      />
    </Box>
  );
}

export default function GenerationGrid({ people, role, expandedId, onExpand, onEdit, loadingId }) {
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <ApexCue />
      <Grid container spacing={2} sx={{ width: '100%' }}>
        {people.map((person) => (
          <Grid key={person.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Box sx={{ position: 'relative' }}>
              <PersonCard
                member={person}
                role={role}
                spouse={person.spouses?.[0]}
                expanded={person.id === expandedId}
                onExpand={onExpand}
                onEdit={onEdit}
              />
              {loadingId === person.id && (
                <CircularProgress
                  size={16}
                  aria-hidden="true"
                  data-testid={`generation-loading-${person.id}`}
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                />
              )}
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
