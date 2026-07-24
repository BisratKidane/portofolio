import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { colors } from '../../theme.js';
import MemberCard from './MemberCard.jsx';

function SectionHeading({ title, onAdd, addLabel }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
      <Typography variant="h6">{title}</Typography>
      {onAdd && (
        <Button variant="contained" onClick={onAdd}>
          {addLabel}
        </Button>
      )}
    </Stack>
  );
}

function MemberRows({
  members,
  self,
  isAdmin,
  actingUserId,
  isDerived,
  onEdit,
  onDelete,
  onPickPhoto,
  onRemovePhoto
}) {
  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          isAdmin={isAdmin}
          actingUserId={actingUserId}
          isSelf={member.id === self.id}
          isDerived={isDerived}
          onEdit={onEdit}
          onDelete={onDelete}
          onPickPhoto={onPickPhoto}
          onRemovePhoto={onRemovePhoto}
        />
      ))}
    </Stack>
  );
}

export default function RelationshipGroupedPanel({
  scope,
  isAdmin,
  actingUserId,
  onAddRelative,
  onEdit,
  onDelete,
  onPickPhoto,
  onRemovePhoto
}) {
  const { self, parents, spouses, children, siblings } = scope;

  const allCoreEmpty = parents.length === 0 && spouses.length === 0 && children.length === 0;

  const rowProps = { self, isAdmin, actingUserId, onEdit, onDelete, onPickPhoto, onRemovePhoto };

  return (
    <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
      <Stack divider={<Box sx={{ borderBottom: `1px solid ${colors.line}` }} />}>
        <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
          <Typography variant="h6">You</Typography>
          <Box sx={{ mt: 2 }}>
            <MemberCard
              member={self}
              isAdmin={isAdmin}
              actingUserId={actingUserId}
              isSelf
              isDerived={false}
              onEdit={onEdit}
              onDelete={onDelete}
              onPickPhoto={onPickPhoto}
              onRemovePhoto={onRemovePhoto}
            />
          </Box>
        </Box>

        {allCoreEmpty && (
          <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
            <Typography variant="h6">Just you so far.</Typography>
            <Typography color="text.secondary" variant="body2">
              Add your parents, spouse, or children to start building your branch of the family.
            </Typography>
          </Box>
        )}

        <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
          <SectionHeading title="Parents" onAdd={() => onAddRelative('parent')} addLabel="+ Add parent" />
          <MemberRows members={parents} isDerived={false} {...rowProps} />
        </Box>

        <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
          <SectionHeading title="Spouse" onAdd={() => onAddRelative('spouse')} addLabel="+ Add spouse" />
          <MemberRows members={spouses} isDerived={false} {...rowProps} />
        </Box>

        <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
          <SectionHeading title="Children" onAdd={() => onAddRelative('child')} addLabel="+ Add child" />
          <MemberRows members={children} isDerived={false} {...rowProps} />
        </Box>

        <Box sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
          <SectionHeading title="Siblings" onAdd={() => onAddRelative('sibling')} addLabel="+ Add sibling" />
          {siblings.length === 0 ? (
            <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
              No siblings yet — they appear automatically once you and another child share a parent.
            </Typography>
          ) : (
            <MemberRows members={siblings} isDerived {...rowProps} />
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
