// The one reusable person card the /detail page (Phase 26) and descendant
// navigation (Phase 27) render for the family head, every child, and every
// grandchild -- no parallel/duplicate card component (CARD-02). This is a
// fresh vertical /detail card (D-01/D-03): fluid width, height-to-content,
// avatar prominent with fields stacked below -- distinct from /family's
// fixed 252x120 MemberNode geometry and /manage's horizontal MemberCard row.
//
// Reuses the app's established gender/spouse/Ge'ez conventions:
// genderTheme.js (D-02), getGeezDisplay (Ge'ez name derivation),
// MemberAvatarImage (photo/blob avatar + fallback).
//
// Spouse pairing (SPOUSE-01, D-12/D-13/D-14): when `spouse` is supplied to a
// non-spouse anchor card, this component composes the anchor card + a
// dashed connector + a second PersonCard for the spouse (leaf-only, never
// recursing into the spouse's own spouse). `isSpouse` gates both the footer
// expand control (D-13) and the spouse-composition recursion guard (D-14).
import { useState } from 'react';
import { Box, Chip, IconButton, Menu, MenuItem, Paper, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { colors } from '../../theme.js';
import { getGeezDisplay } from '../../utils/displayName.js';
import { genderMeta } from '../../utils/genderTheme.js';
import { LIFT_EASING, RIM_TINT, TEXT_TINT, cardSurface, depthShadow } from '../../utils/cardDepth.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

// Gender is signaled by color+tint (border/background) AND a non-color
// avatar-ring border-style -- never by color alone (CARD-03/D-09). Keyed off
// the normalized `genderLabel` from genderMeta(), never the raw
// `member.gender` value, so an unrecognized value still gets a real ring
// (RESEARCH.md Pitfall 2 -- `RING_STYLE[raw]` could silently resolve to
// `undefined` and drop the ring entirely).
const RING_STYLE = { Male: 'solid', Female: 'dashed', Other: 'dotted' };

// WCAG AA text-color fix (A11Y-01/D-03): the raw genderTint/colors.slate tokens fail 4.5:1
// against the card's own background -- TEXT_TINT replaces them for text usage without
// touching the shared MALE_TINT/FEMALE_TINT/colors.slate tokens /family also consumes.
// It moved into utils/cardDepth.js when /detail and /family started sharing one depth
// system; re-exported here because theme.contrast.test.js gates it at this path.
export { TEXT_TINT };
// Living/Deceased chip text fix: MUI's outlined Chip renders `success.main` at full opacity
// as text (only the border gets alpha) -- as low as 2.16:1 against the card background.
// Used only for the isAlive===true branch; the Deceased/default branch is untouched.
export const CHIP_TEXT_ALIVE = '#065f46';

// Interactive affordances sit *on* the card face, so they get their own small
// raised treatment -- a paper pill with a lit top edge and a contact shadow --
// rather than floating as bare glyphs on a gradient. This is also where the
// card's hover motion lives: the card body is not a click target, so only the
// things you can actually press respond to the pointer.
const RAISED = [
  'inset 0 1px 0 rgba(255,255,255,0.95)',
  'inset 0 0 0 1px rgba(15,23,42,0.08)',
  '0 1px 1px rgba(15,23,42,0.05)',
  '0 4px 10px -3px rgba(15,23,42,0.18)'
].join(', ');

const RAISED_HOVER = [
  'inset 0 1px 0 rgba(255,255,255,0.95)',
  `inset 0 0 0 1px ${colors.primary}40`,
  '0 1px 1px rgba(15,23,42,0.05)',
  '0 8px 16px -5px rgba(15,23,42,0.24)'
].join(', ');

const CONTROL_SX = {
  minWidth: 44,
  minHeight: 44,
  // The avatar well below is `position: relative` (it needs to be, for its
  // ::after recess), which puts it in the same paint layer as these absolutely
  // positioned controls and later in DOM order -- without a z-index it paints
  // over them.
  zIndex: 1,
  color: colors.slate,
  // A translucent scrim rather than an opaque pill. At /detail's real width a
  // spouse pair leaves each card ~194px wide, so these top-right controls
  // overlap the 96px centred avatar -- a scrim keeps the glyph legible over a
  // photo AND over the gradient face, where a solid disc would read as a
  // button dropped on someone's head.
  backgroundColor: 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(6px)',
  boxShadow: RAISED,
  transition: `transform 160ms ${LIFT_EASING}, box-shadow 160ms ${LIFT_EASING}, color 160ms linear`,
  '&:hover': {
    backgroundColor: 'rgba(255,255,255,0.96)',
    color: colors.primaryDark,
    transform: 'translateY(-1px)',
    boxShadow: RAISED_HOVER
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': { transform: 'none' }
  }
};

// The expand control is the card's primary affordance, so it reads as a pill
// rather than a round icon button -- it carries a text label as well as the
// chevron.
const EXPAND_SX = {
  ...CONTROL_SX,
  backgroundColor: colors.paper,
  backdropFilter: 'none',
  alignSelf: 'center',
  borderRadius: '999px',
  px: 1.75,
  gap: 0.5,
  color: colors.primaryDark,
  backgroundImage: colors.gradientSoft
};

function childCountLabel(count) {
  return count === 1 ? '1 child' : `${count} children`;
}

// SPOUSE-01 (D-12/D-13/D-14): when `spouse` is supplied to a non-spouse
// anchor card, render the anchor followed by a dashed connector and a
// second PersonCard for the spouse. The spouse card is always a rendering
// leaf -- `isSpouse === true` cards never read/render their own `spouse`
// prop or look up `member.spouses`, so recursion depth is hard-capped at
// exactly one level regardless of caller input (defense in depth per
// RESEARCH.md Pitfall 4; the page/nav layer in Phase 26/27 is responsible
// for only ever passing `spouse` to non-spouse anchor cards, but PersonCard
// must not trust that alone).
export default function PersonCard({ member, role, spouse, isSpouse = false, expanded, onExpand, onEdit, onAddRelative }) {
  const card = (
    <PersonCardSingle
      member={member}
      role={role}
      isSpouse={isSpouse}
      expanded={expanded}
      onExpand={onExpand}
      onEdit={onEdit}
      onAddRelative={onAddRelative}
    />
  );

  if (!spouse || isSpouse) {
    return card;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {card}
      <Box
        aria-hidden="true"
        data-connector-style="dashed"
        sx={{ width: 32, alignSelf: 'center', borderTop: `2px dashed ${colors.primary}` }}
      />
      <PersonCardSingle member={spouse} isSpouse onEdit={onEdit} />
    </Box>
  );
}

function PersonCardSingle({ member, role, isSpouse = false, expanded, onExpand, onEdit, onAddRelative }) {
  const { label: genderLabel } = genderMeta(member.gender);
  const ringStyle = RING_STYLE[genderLabel] ?? RING_STYLE.Other;
  const rimTint = RIM_TINT[genderLabel] ?? RIM_TINT.Other;
  const geez = getGeezDisplay(member);
  const isAlive = member.isAlive !== false; // MemberDetailPanel.jsx convention
  const childCount = member.children?.length ?? 0;
  const showExpand = !isSpouse && childCount >= 1;
  const [addMenuAnchor, setAddMenuAnchor] = useState(null);
  const showAddMenu = !isSpouse && member.canEdit === true && typeof onAddRelative === 'function';

  return (
    <Paper
      elevation={0}
      data-testid={`person-card-${member.id}`}
      data-gender={genderLabel}
      aria-label={`${member.fullname}, ${genderLabel}`}
      sx={{
        width: '100%',
        p: 2,
        // Same depth system as /family's MemberNode (utils/cardDepth.js): a
        // raking gradient face over an opaque base, a rim gradient revealed by
        // the transparent border, and a layered elevation with a glow in the
        // card's own gender hue. Unlike the tree node this card is not a click
        // target -- so it gets the resting elevation and no hover lift, which
        // would promise an interaction that does not exist. The affordances
        // that ARE interactive (edit, add, expand) carry their own raised
        // treatment instead.
        background: cardSurface(genderLabel),
        border: '2px solid transparent',
        borderRadius: '16px',
        boxShadow: depthShadow(rimTint),
        position: 'relative',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5
      }}
    >
      {member.canEdit === true && (
        <IconButton
          aria-label={`Edit ${member.fullname}`}
          onClick={() => onEdit(member)}
          sx={{ ...CONTROL_SX, position: 'absolute', top: 8, right: 8 }}
        >
          <EditRoundedIcon />
        </IconButton>
      )}

      {showAddMenu && (
        <>
          <IconButton
            aria-label={`Add relative to ${member.fullname}`}
            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
            sx={{ ...CONTROL_SX, position: 'absolute', top: 8, right: 56 }}
          >
            <AddRoundedIcon />
          </IconButton>
          <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={() => setAddMenuAnchor(null)}>
            <MenuItem
              onClick={() => {
                setAddMenuAnchor(null);
                onAddRelative('child', member);
              }}
            >
              Add child
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAddMenuAnchor(null);
                onAddRelative('spouse', member);
              }}
            >
              Add spouse
            </MenuItem>
          </Menu>
        </>
      )}

      {/* The avatar reads like a medallion: the gender ring is a bezel standing
          proud of the card face, and the portrait inside it is sunken behind
          it. Two opposite depth directions in one assembly is what sells both.
          The ring's border-STYLE stays the non-colour gender cue (D-09) and its
          colour deepens to rimTint for the 3:1 non-text floor. */}
      <Box
        data-ring-style={ringStyle}
        sx={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: `3px ${ringStyle} ${rimTint}`,
          padding: '3px',
          boxSizing: 'border-box',
          boxShadow: `0 1px 0 rgba(255,255,255,0.9), 0 6px 14px -6px ${rimTint}66`
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            overflow: 'hidden',
            // The recess lives on an ::after overlay because a plain `inset`
            // box-shadow here would be painted underneath the <img>, which
            // fills the circle edge to edge.
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              background: 'linear-gradient(200deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 46%)',
              boxShadow: `inset 0 2px 5px rgba(15,23,42,0.32), inset 0 0 0 1px ${rimTint}40`
            }
          }}
        >
          <MemberAvatarImage member={member} variant="circular" fill />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 0, width: '100%' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: colors.ink }} noWrap>
          {member.fullname}
        </Typography>

        {geez && (
          <Typography
            sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: TEXT_TINT[genderLabel] ?? TEXT_TINT.Other }}
            lang={geez.lang}
            noWrap
          >
            {geez.text}
          </Typography>
        )}

        {role && (
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.4,
              letterSpacing: '0.04em',
              color: TEXT_TINT[genderLabel] ?? TEXT_TINT.Other
            }}
          >
            {role}
          </Typography>
        )}

        <Chip
          size="small"
          label={isAlive ? 'Living' : 'Deceased'}
          color={isAlive ? 'success' : 'default'}
          variant="outlined"
          // A quiet label, not a control: it gets a paper fill so it reads off
          // the gradient face cleanly, but no raised shadow -- nothing here is
          // pressable and it should not look like it is.
          sx={{
            backgroundColor: 'rgba(255,255,255,0.72)',
            ...(isAlive ? { color: CHIP_TEXT_ALIVE, borderColor: CHIP_TEXT_ALIVE } : null)
          }}
        />
      </Box>

      {showExpand && (
        <IconButton
          aria-label={expanded ? `Hide children of ${member.fullname}` : `Show children of ${member.fullname}`}
          onClick={() => onExpand(member)}
          sx={EXPAND_SX}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{childCountLabel(childCount)}</Typography>
          <ExpandMoreRoundedIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </IconButton>
      )}
    </Paper>
  );
}
