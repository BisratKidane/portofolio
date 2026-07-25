// Custom xyflow node type rendering a FamilyMember card on the /family tree
// (Phase 17, Plan 17-03). Matches 17-UI-SPEC.md's node anatomy contract:
// avatar + name + years + non-color-only gender cue + viewer ring/chip +
// descendant/ancestor hidden-count badges (D-03/D-09).
//
// Receives xyflow's standard custom-node props `{ data }` where
// `data = { member, isViewer, hiddenCount, onToggleExpand,
// ancestorHiddenCount, onToggleAncestorExpand }`.

import { Handle, Position } from '@xyflow/react';
import { Box, Chip, IconButton, Paper, Typography } from '@mui/material';
import { colors } from '../../theme.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

// Gender is now depicted by the card's COLOR (border + soft background tint)
// rather than a gender icon. Because colour is a single perceptual channel,
// the gender is also exposed to assistive tech via `data-gender` + the node's
// aria-label so it is not conveyed by colour alone.
const MALE_TINT = '#3b82f6';
const FEMALE_TINT = '#ec4899';

function formatYears(member) {
  const startYear = member.birthdate ? new Date(member.birthdate).getFullYear() : null;
  const endYear = member.deathdate ? new Date(member.deathdate).getFullYear() : null;
  if (startYear == null && endYear == null) return null;
  if (startYear != null && endYear != null) return `${startYear}–${endYear}`;
  if (startYear != null) return `${startYear}–`;
  return `–${endYear}`;
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

export default function MemberNode({ data }) {
  const {
    member,
    isViewer = false,
    hiddenCount = 0,
    onToggleExpand,
    ancestorHiddenCount = 0,
    onToggleAncestorExpand
  } = data;

  const years = formatYears(member);
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
        width: 180,
        height: 64,
        p: 0.75,
        // Gender is colour-coded on the card itself (border + soft tint).
        bgcolor: `${genderTint}14`,
        border: `2px solid ${genderTint}`,
        borderRadius: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
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

      <MemberAvatarImage member={member} />

      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
            {member.fullname}
          </Typography>
          {isViewer && (
            <Chip label="You" size="small" sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }} />
          )}
        </Box>
        {years && (
          <Typography sx={{ fontSize: 12, fontWeight: 400, color: colors.slate }} noWrap>
            {years}
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
