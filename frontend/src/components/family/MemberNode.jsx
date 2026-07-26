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
    hiddenCount = 0,
    onToggleExpand,
    ancestorHiddenCount = 0,
    onToggleAncestorExpand
  } = data;

  const birthday = formatDate(member.birthdate);
  const motherName = member.mother?.fullname || member.mothersname;
  const showAddress = member.deathdate == null && Boolean(member.address);
  const { label: genderLabel, tint: genderTint } = genderMeta(member.gender);

  return (
    <Paper
      elevation={0}
      data-testid={`member-node-${member.id}`}
      data-viewer-ring={isViewer ? 'true' : 'false'}
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
          onClick={() => onToggleAncestorExpand && onToggleAncestorExpand(member.id)}
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

      {/* Right column: reserved row + fullname + birthday + mother + address. */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {/* Reserved row — kept empty for a future edit action (deferred). */}
        <Box sx={{ height: 18, flexShrink: 0 }} />

        {/* The viewer is identified by the card's double border (gender border +
            viewer outline ring), so no separate "You" chip is needed. */}
        <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
          {member.fullname}
        </Typography>

        {birthday && (
          <Typography sx={ROW_SX} noWrap>
            {birthday}
          </Typography>
        )}

        {motherName && (
          <Typography sx={ROW_SX} noWrap>
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
          onClick={() => onToggleExpand && onToggleExpand(member.id)}
          sx={{ ...BADGE_SX, bottom: -18 }}
        >
          +{hiddenCount}
        </IconButton>
      )}
    </Paper>
  );
}
