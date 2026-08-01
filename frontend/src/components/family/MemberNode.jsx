// Custom xyflow node type rendering a FamilyMember card on the /family tree
// (Phase 17, Plan 17-03; restyled by quick task 260726-sh4). Two-column card:
// a 1/3-width avatar column + a rows column (reserved top row, fullname,
// birthday, mother name, address-if-alive). Preserves the non-color-only
// gender cue + viewer ring/chip + descendant/ancestor hidden-count badges
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

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

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

const ROW_SX = { fontSize: 12, fontWeight: 400, color: colors.slate };

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

  const birthday = formatDate(member.birthdate);
  const geez = getGeezDisplay(member);
  const motherName = member.mother?.fullname || member.mothersname;
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
        borderRadius: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        gap: 1,
        boxSizing: 'border-box',
        outline: isViewer ? `2px solid ${colors.primary}` : 'none',
        outlineOffset: 2,
        // The current tree "head" (re-rooted focus) gets a distinct glow so it's
        // obvious which person the branch is rooted at.
        boxShadow: isFocusRoot ? `0 0 0 3px ${colors.primary}66` : 'none',
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
          borderRadius: 1,
          overflow: 'hidden'
        }}
      >
        <MemberAvatarImage member={member} variant="rounded" fill />
      </Box>

      {/* Right column: reserved row + fullname + birthday + mother + address.
          The card is a fixed 252x120 node (VIEW-01): clip vertical overflow so the
          worst case (focus-root "Head" row + Ge'ez line + birthday + mother +
          address) can never spill past the card border. minHeight:0 lets this flex
          child shrink below its content so overflow:hidden actually clips. */}
      <Box
        data-testid={`member-node-body-${member.id}`}
        sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0.25 }}
      >
        {/* Top row: shows a "Head" tag when this card is the re-rooted tree
            head; otherwise reserved (kept for a future edit action). */}
        <Box sx={{ height: isFocusRoot ? 18 : 0, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isFocusRoot && (
            <Typography
              component="span"
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: colors.primaryDark,
                bgcolor: colors.gradientSoft,
                px: 0.75,
                borderRadius: 0.5,
                lineHeight: 1.5
              }}
            >
              Head
            </Typography>
          )}
        </Box>

        {/* The viewer is identified by the card's double border (gender border +
            viewer outline ring), so no separate "You" chip is needed. */}
        <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
          {member.fullname}
        </Typography>

        {geez && (
          <Typography sx={{ ...ROW_SX, color: genderTint }} lang={geez.lang} noWrap>
            {geez.text}
          </Typography>
        )}

        {birthday && (
          <Typography sx={ROW_SX} noWrap>
            {birthday}
          </Typography>
        )}

        {motherName && (
          <Typography sx={{ ...ROW_SX, color: genderTint }} noWrap>
            {motherName}
          </Typography>
        )}

        {showAddress && (
          <Typography sx={ROW_SX} noWrap>
            {member.address}
          </Typography>
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
