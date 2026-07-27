// Read-only detail panel for the /family tree (Phase 17, Plan 17-04). Opens
// on a node click and reads everything from already-fetched in-memory data
// (membersById, passed down by FamilyTreePage) -- no new network call, no
// edit affordances (D-08).

import { Box, Button, Chip, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { colors } from '../../theme.js';
import { deriveSiblings } from './familyTree.assembly.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

function idOrNull(ref) {
  return ref?.id != null ? String(ref.id) : null;
}

// Birth year only (death dates are no longer tracked — living status is a
// boolean). Falls back to the explicit "Dates unknown" UI-SPEC copy.
function formatBirth(member) {
  const startYear = member.birthdate ? new Date(member.birthdate).getFullYear() : null;
  return startYear != null ? `Born ${startYear}` : 'Dates unknown';
}

function resolveRefs(refs, membersById) {
  return (refs || [])
    .map((ref) => membersById.get(idOrNull(ref)))
    .filter(Boolean);
}

function RelationshipSection({ title, members, emptyLabel }) {
  return (
    <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
      <Typography variant="h6">{title}</Typography>
      {members.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
          No recorded {emptyLabel}
        </Typography>
      ) : (
        <Stack spacing={2} sx={{ mt: 2 }}>
          {members.map((relatedMember) => (
            <Stack key={relatedMember.id} direction="row" alignItems="center" spacing={2}>
              <MemberAvatarImage member={relatedMember} />
              <Typography sx={{ fontWeight: 600 }} noWrap>
                {relatedMember.fullname}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function MemberDetailPanel({
  open,
  member,
  membersById,
  onClose,
  canToggleAlive = false,
  onToggleAlive
}) {
  if (!open || !member) return null;

  const isAlive = member.isAlive !== false;

  const parents = [member.mother, member.father]
    .map((ref) => idOrNull(ref))
    .filter(Boolean)
    .map((id) => membersById.get(id))
    .filter(Boolean);
  const spouses = resolveRefs(member.spouses, membersById);
  const children = resolveRefs(member.children, membersById);
  const siblings = deriveSiblings(member.id, membersById);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 420 } }} role="presentation">
        <Stack divider={<Box sx={{ borderBottom: `1px solid ${colors.line}` }} />}>
          <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={2}>
                <MemberAvatarImage member={member} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h5" noWrap>
                    {member.fullname}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {member.gender}
                  </Typography>
                </Box>
              </Stack>
              <IconButton aria-label="Close" onClick={onClose}>
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
              <Typography color="text.secondary" variant="body2">
                {formatBirth(member)}
              </Typography>
              <Chip
                size="small"
                label={isAlive ? 'Living' : 'Deceased'}
                color={isAlive ? 'success' : 'default'}
                variant="outlined"
              />
            </Stack>
            {canToggleAlive && (
              <Button
                size="small"
                variant="outlined"
                sx={{ mt: 1.5 }}
                onClick={() => onToggleAlive && onToggleAlive(member)}
              >
                {isAlive ? 'Mark as deceased' : 'Mark as living'}
              </Button>
            )}
            {member.phone && (
              <Typography sx={{ mt: 1 }} variant="body2">
                {member.phone}
              </Typography>
            )}
            {member.address && (
              <Typography sx={{ mt: 0.5 }} variant="body2">
                {member.address}
              </Typography>
            )}
          </Box>

          <RelationshipSection title="Parents" members={parents} emptyLabel="parents" />
          <RelationshipSection title="Spouse" members={spouses} emptyLabel="spouse" />
          <RelationshipSection title="Children" members={children} emptyLabel="children" />
          <RelationshipSection title="Siblings" members={siblings} emptyLabel="siblings" />
        </Stack>
      </Box>
    </Drawer>
  );
}
