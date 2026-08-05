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
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

// Gender is signaled by color+tint (border/background) AND a non-color
// avatar-ring border-style -- never by color alone (CARD-03/D-09). Keyed off
// the normalized `genderLabel` from genderMeta(), never the raw
// `member.gender` value, so an unrecognized value still gets a real ring
// (RESEARCH.md Pitfall 2 -- `RING_STYLE[raw]` could silently resolve to
// `undefined` and drop the ring entirely).
const RING_STYLE = { Male: 'solid', Female: 'dashed', Other: 'dotted' };

// WCAG AA text-color fix (A11Y-01/D-03): the raw genderTint/colors.slate tokens fail 4.5:1
// against the card's own translucent background (male 3.13:1, female 2.97:1, role label
// 4.01-4.05:1) -- these darker, local-only constants replace them for text usage without
// touching the shared MALE_TINT/FEMALE_TINT/colors.slate tokens /family also consumes.
export const TEXT_TINT = { Male: '#1e40af', Female: '#9d174d', Other: '#334155' };
// Living/Deceased chip text fix: MUI's outlined Chip renders `success.main` at full opacity
// as text (only the border gets alpha) -- as low as 2.16:1 against the card background.
// Used only for the isAlive===true branch; the Deceased/default branch is untouched.
export const CHIP_TEXT_ALIVE = '#065f46';

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
  const { label: genderLabel, tint: genderTint } = genderMeta(member.gender);
  const ringStyle = RING_STYLE[genderLabel] ?? RING_STYLE.Other;
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
        bgcolor: `${genderTint}14`,
        border: `2px solid ${genderTint}`,
        borderRadius: '11px',
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
          sx={{ position: 'absolute', top: 8, right: 8, minWidth: 44, minHeight: 44 }}
        >
          <EditRoundedIcon />
        </IconButton>
      )}

      {showAddMenu && (
        <>
          <IconButton
            aria-label={`Add relative to ${member.fullname}`}
            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
            sx={{ position: 'absolute', top: 8, right: 56, minWidth: 44, minHeight: 44 }}
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

      <Box
        data-ring-style={ringStyle}
        sx={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: `3px ${ringStyle} ${genderTint}`,
          padding: '3px',
          boxSizing: 'border-box'
        }}
      >
        <Box sx={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
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
          sx={isAlive ? { color: CHIP_TEXT_ALIVE, borderColor: CHIP_TEXT_ALIVE } : undefined}
        />
      </Box>

      {showExpand && (
        <IconButton
          aria-label={expanded ? `Hide children of ${member.fullname}` : `Show children of ${member.fullname}`}
          onClick={() => onExpand(member)}
          sx={{ minWidth: 44, minHeight: 44, alignSelf: 'center' }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{childCountLabel(childCount)}</Typography>
          <ExpandMoreRoundedIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </IconButton>
      )}
    </Paper>
  );
}
