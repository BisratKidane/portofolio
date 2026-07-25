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
import MaleRoundedIcon from '@mui/icons-material/MaleRounded';
import FemaleRoundedIcon from '@mui/icons-material/FemaleRounded';
import TransgenderRoundedIcon from '@mui/icons-material/TransgenderRounded';
import { colors } from '../../theme.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

// UI-SPEC D-09b tints -- icon shape + aria-label carry the meaning, tint is
// reinforcement only, never the sole channel.
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
  if (gender === 'Male') return { Icon: MaleRoundedIcon, label: 'Male', tint: MALE_TINT };
  if (gender === 'Female') return { Icon: FemaleRoundedIcon, label: 'Female', tint: FEMALE_TINT };
  return { Icon: TransgenderRoundedIcon, label: 'Other', tint: colors.slate };
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
  const { Icon: GenderIcon, label: genderLabel, tint: genderTint } = genderMeta(member.gender);

  return (
    <Paper
      elevation={0}
      data-testid={`member-node-${member.id}`}
      data-viewer-ring={isViewer ? 'true' : 'false'}
      sx={{
        width: 180,
        height: 64,
        p: 0.75,
        bgcolor: colors.paper,
        border: `1px solid ${colors.line}`,
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
      {/* Edge attach points: parent→child edges leave a parent's bottom
          (source) and enter a child's top (target). Without these handles
          React Flow renders no edges at all. Kept small and subtle. */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ width: 6, height: 6, background: colors.line, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
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
        <GenderIcon aria-label={genderLabel} aria-hidden={false} sx={{ fontSize: 16, color: genderTint }} />
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
