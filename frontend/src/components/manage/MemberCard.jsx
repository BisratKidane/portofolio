import { Avatar, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { colors, getInitials } from '../../theme.js';

// T-15-04 (mitigate): this lock condition is copied verbatim from
// familyMember.resolver.js's editMember check --
// `target.linkedUser && target.linkedUser.id !== user.id` -- using the
// ACTING USER's id (never a FamilyMember id). A component test pins this
// exact comparison so a future refactor cannot silently swap in the wrong
// id. The server's own editMember check remains the actual enforcement
// regardless of what this component renders.
export default function MemberCard({ member, isAdmin, actingUserId, isSelf, isDerived, onEdit, onDelete }) {
  const locked = !isAdmin && !isSelf && member.linkedUser && member.linkedUser.id !== actingUserId;

  return (
    <Stack direction="row" alignItems="center" spacing={2}>
      <Avatar sx={{ width: 42, height: 42, bgcolor: '#eef1f8', color: colors.slate }}>
        {getInitials(member.fullname)}
      </Avatar>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontWeight: 600 }} noWrap>
            {member.fullname}
          </Typography>
          {isDerived && (
            <Chip label="Derived" size="small" sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }} />
          )}
        </Stack>
        {locked && (
          <Typography variant="body2" color="text.secondary">
            Manages their own profile.
          </Typography>
        )}
      </Box>
      {/* No relink-edge action is rendered here -- no backing mutation exists
          this phase (T-15-05, mitigate). Do not fabricate one. */}
      {!locked && (
        <Button variant="text" onClick={() => onEdit(member)}>
          Edit
        </Button>
      )}
      {isAdmin && (
        <Button variant="text" color="error" onClick={() => onDelete(member)}>
          Remove
        </Button>
      )}
    </Stack>
  );
}
