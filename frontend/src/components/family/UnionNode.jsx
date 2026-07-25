// Synthetic union (marriage-connector) node type for the /family tree
// (Phase 17, Plan 17-03). Represents a couple, not a real FamilyMember --
// no avatar, no name, no click target. Visual is spike-approved-simple
// (Plan 17-02's SC-1 spike used a small neutral dot); kept minimal here.

import { Box } from '@mui/material';
import { colors } from '../../theme.js';

export default function UnionNode() {
  return (
    <Box
      data-testid="union-node"
      sx={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        bgcolor: colors.line,
        border: `1px solid ${colors.slate}`
      }}
    />
  );
}
