// Custom xyflow node type rendering a FamilyMember card on the /family tree
// (Phase 17, Plan 17-03; restyled by quick task 260726-sh4; card redesign 2026-08).
// Two-column card: a 1/3-width avatar column + a text column holding an identity
// pair (Latin name + native Ge'ez name) over a quieter metadata group (mother name
// [Ge'ez-preferred] with a parent glyph, address-if-alive with a pin). The re-rooted
// tree "head" is shown by the card's boxShadow glow, not a text tag. Preserves the
// non-color-only gender cue + viewer ring + descendant/ancestor hidden-count badges
// (D-03/D-09).
//
// Receives xyflow's standard custom-node props `{ data }` where
// `data = { member, isViewer, hiddenCount, onToggleExpand,
// ancestorHiddenCount, onToggleAncestorExpand }`.

import { Handle, Position } from '@xyflow/react';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import { colors } from '../../theme.js';
import { getGeezDisplay } from '../../utils/displayName.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

// Gender is now depicted by the card's COLOR (border + soft background tint)
// rather than a gender icon. Because colour is a single perceptual channel,
// the gender is also exposed to assistive tech via `data-gender` + the node's
// aria-label so it is not conveyed by colour alone.
const MALE_TINT = '#3b82f6';
const FEMALE_TINT = '#ec4899';

function genderMeta(gender) {
  if (gender === 'Male') return { label: 'Male', tint: MALE_TINT };
  if (gender === 'Female') return { label: 'Female', tint: FEMALE_TINT };
  return { label: 'Other', tint: colors.slate };
}

const BADGE_SX = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  minWidth: 44,
  minHeight: 44,
  borderRadius: '50%',
  bgcolor: colors.gradientSoft,
  color: colors.primaryDark,
  fontSize: 11,
  fontWeight: 700,
  '&:hover': { bgcolor: colors.gradientSoft }
};

// Tiny outline affordances that disambiguate the metadata rows: a parent glyph
// on the mother's name (so a gender-tinted mother name can't be mistaken for the
// person's own Ge'ez name) and a pin on the address. Inline SVG keeps them crisp
// and cheap across every node; colour flows from the `color` prop via currentColor.
function MotherIcon({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, color }}>
      <circle cx="8" cy="5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.4 14c0-2.8 2-4.6 4.6-4.6s4.6 1.8 4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PinIcon({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, color }}>
      <path d="M8 1.6c-2.5 0-4.5 2-4.5 4.5C3.5 9.5 8 14.4 8 14.4s4.5-4.9 4.5-8.3C12.5 3.6 10.5 1.6 8 1.6z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="6.1" r="1.6" fill="currentColor" />
    </svg>
  );
}

export default function MemberNode({ data }) {
  const {
    member,
    isViewer = false,
    isFocusRoot = false,
    hiddenCount = 0,
    onToggleExpand,
    ancestorHiddenCount = 0,
    onToggleAncestorExpand
  } = data;

  const geez = getGeezDisplay(member);
  // Prefer the mother's name in Ge'ez (linked mother's geezFullname, then the
  // free-text geezMothersname), falling back to the Latin name when no Ge'ez
  // mother name exists — so the row never disappears for pre-Ge'ez members.
  const motherName =
    member.mother?.geezFullname ||
    member.geezMothersname ||
    member.mother?.fullname ||
    member.mothersname;
  // The Ge'ez sources win the fallback above, so the shown mother name is Ge'ez
  // whenever either Ge'ez source is present — tag it lang=ti in that case.
  const motherIsGeez = Boolean(member.mother?.geezFullname || member.geezMothersname);
  const showAddress = member.isAlive !== false && Boolean(member.address);
  const { label: genderLabel, tint: genderTint } = genderMeta(member.gender);

  return (
    <Paper
      elevation={0}
      data-testid={`member-node-${member.id}`}
      data-viewer-ring={isViewer ? 'true' : 'false'}
      data-focus-root={isFocusRoot ? 'true' : 'false'}
      data-gender={genderLabel}
      aria-label={`${member.fullname}, ${genderLabel}`}
      title={genderLabel}
      sx={{
        width: 252,
        height: 120,
        p: 0.75,
        // Gender is colour-coded on the card itself (border + soft tint).
        bgcolor: `${genderTint}14`,
        border: `2px solid ${genderTint}`,
        borderRadius: '11px',
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        gap: 1,
        boxSizing: 'border-box',
        outline: isViewer ? `2px solid ${colors.primary}` : 'none',
        outlineOffset: 2,
        // The current tree "head" (re-rooted focus) gets a distinct glow so it's
        // obvious which person the branch is rooted at; every other card gets a
        // soft elevation shadow so the tree reads as a set of raised cards.
        boxShadow: isFocusRoot
          ? `0 0 0 3px ${colors.primary}66`
          : '0 1px 2px rgba(15,23,42,0.05), 0 3px 12px rgba(15,23,42,0.05)',
        '&:focus-visible': { outline: `2px solid ${colors.primary}`, outlineOffset: '2px' }
      }}
    >
      {/* Edge attach points. Parent->child edges leave a parent's bottom
          (parent-source) and enter a child's top (child-target). The spouse
          connector edge leaves one partner's right side (spouse-source) and
          enters the other partner's left side (spouse-target). Explicit ids
          are required now that a node has more than one handle of each
          type — without them React Flow can't tell which handle an edge's
          sourceHandle/targetHandle refers to. Kept small and subtle. */}
      <Handle
        id="child-target"
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ width: 6, height: 6, background: colors.line, border: 'none' }}
      />
      <Handle
        id="parent-source"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ width: 6, height: 6, background: colors.line, border: 'none' }}
      />
      <Handle
        id="spouse-source"
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ width: 6, height: 6, background: colors.line, border: 'none' }}
      />
      <Handle
        id="spouse-target"
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ width: 6, height: 6, background: colors.line, border: 'none' }}
      />

      {ancestorHiddenCount > 0 && (
        <IconButton
          size="small"
          aria-label={`Show ${ancestorHiddenCount} hidden ancestors of ${member.fullname}`}
          onClick={(event) => {
            event.stopPropagation();
            if (onToggleAncestorExpand) onToggleAncestorExpand(member.id);
          }}
          sx={{ ...BADGE_SX, top: -18 }}
        >
          +{ancestorHiddenCount}
        </IconButton>
      )}

      {/* Left column: the photo fills the whole 1/3-width column, full height,
          cropping/zooming to cover (object-fit: cover via the Avatar). */}
      <Box
        sx={{
          flex: '0 0 33%',
          alignSelf: 'stretch',
          minWidth: 0,
          borderRadius: '7px',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.08)'
        }}
      >
        <MemberAvatarImage member={member} variant="rounded" fill />
      </Box>

      {/* Right column: an identity pair (Latin name + native Ge'ez name, read as
          one unit) above a quieter metadata group (mother [Ge'ez-preferred] with a
          parent glyph, address-if-alive with a pin). The re-rooted tree "head" is
          marked by the card's boxShadow glow (see Paper sx), not a text tag. Fixed
          252x120 node (VIEW-01): the block is vertically centred and vertical
          overflow is clipped so content can never spill past the card border;
          minHeight:0 lets this flex child shrink so overflow:hidden actually clips. */}
      <Box
        data-testid={`member-node-body-${member.id}`}
        sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        {/* The viewer is identified by the card's double border (gender border +
            viewer outline ring), so no separate "You" chip is needed. */}
        <Typography sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: colors.ink }} noWrap>
          {member.fullname}
        </Typography>

        {geez && (
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: genderTint }} lang={geez.lang} noWrap>
            {geez.text}
          </Typography>
        )}

        {(motherName || showAddress) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px', mt: 0.75, minWidth: 0 }}>
            {motherName && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <MotherIcon color={genderTint} />
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: genderTint }} lang={motherIsGeez ? 'ti' : undefined} noWrap>
                  {motherName}
                </Typography>
              </Box>
            )}

            {showAddress && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <PinIcon color={colors.slate} />
                <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: colors.slate }} noWrap>
                  {member.address}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {hiddenCount > 0 && (
        <IconButton
          size="small"
          aria-label={`Show ${hiddenCount} hidden descendants of ${member.fullname}`}
          onClick={(event) => {
            event.stopPropagation();
            if (onToggleExpand) onToggleExpand(member.id);
          }}
          sx={{ ...BADGE_SX, bottom: -18 }}
        >
          +{hiddenCount}
        </IconButton>
      )}
    </Paper>
  );
}
