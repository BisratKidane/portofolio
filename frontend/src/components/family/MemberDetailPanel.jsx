// Read-only detail panel for the /family tree (Phase 17, Plan 17-04). Opens
// on a node click and reads everything from already-fetched in-memory data
// (membersById, passed down by FamilyTreePage) -- no new network call, no
// edit affordances (D-08).

import { Box, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { colors } from '../../theme.js';
import { deriveSiblings } from './familyTree.assembly.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';

function idOrNull(ref) {
  return ref?.id != null ? String(ref.id) : null;
}

// Same year-formatting shape as MemberNode.jsx's formatYears, but this panel
// falls back to an explicit "Dates unknown" string (UI-SPEC copy) instead of
// omitting the line entirely.
function formatDates(member) {
  const startYear = member.birthdate ? new Date(member.birthdate).getFullYear() : null;
  const endYear = member.deathdate ? new Date(member.deathdate).getFullYear() : null;
  if (startYear == null && endYear == null) return 'Dates unknown';
  if (startYear != null && endYear != null) return `${startYear}–${endYear}`;
  if (startYear != null) return `${startYear}–`;
  return `–${endYear}`;
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

export default function MemberDetailPanel({ open, member, membersById, onClose }) {
  if (!open || !member) return null;

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
            <Typography sx={{ mt: 2 }} color="text.secondary" variant="body2">
              {formatDates(member)}
            </Typography>
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
