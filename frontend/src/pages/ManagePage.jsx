import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';
import RelationshipGroupedPanel from '../components/manage/RelationshipGroupedPanel.jsx';
import AddRelativeDialog from '../components/manage/AddRelativeDialog.jsx';

const MY_EDITABLE_MEMBERS_QUERY = `
  query MyEditableMembers {
    myEditableMembers {
      id firstname lastname fullname gender birthdate deathdate phone email address
      mother { id } father { id }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id }
    }
  }
`;

function groupByRelation(rows, self) {
  const parentIds = new Set([self.mother?.id, self.father?.id].filter(Boolean));
  const spouseIds = new Set((self.spouses ?? []).map((member) => member.id));
  const childIds = new Set((self.children ?? []).map((member) => member.id));
  const siblingIds = new Set((self.siblings ?? []).map((member) => member.id));

  return {
    self,
    parents: rows.filter((row) => parentIds.has(row.id)),
    spouses: rows.filter((row) => spouseIds.has(row.id)),
    children: rows.filter((row) => childIds.has(row.id)),
    siblings: rows.filter((row) => siblingIds.has(row.id))
  };
}

const EMPTY_DIALOG_STATE = { open: false, relationType: '', targetId: null };

function MemberBranch({ user }) {
  const [rows, setRows] = useState([]);
  const [scope, setScope] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [dialogState, setDialogState] = useState(EMPTY_DIALOG_STATE);
  // TODO(Task 2 of this plan): setEditTarget is a placeholder no-op until
  // EditMemberDialog is wired in; no dialog renders from it yet.
  const setEditTarget = () => {};

  const refetch = useCallback(() => {
    setPageLoading(true);
    return graphqlRequest(MY_EDITABLE_MEMBERS_QUERY)
      .then((data) => {
        const fetchedRows = data.myEditableMembers;
        const self = fetchedRows.find((row) => row.id === user.familyMemberId);
        setRows(fetchedRows);
        setScope(groupByRelation(fetchedRows, self));
      })
      .catch((err) => setPageError(err.message))
      .finally(() => setPageLoading(false));
  }, [user.familyMemberId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (pageLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (pageError) return <Alert severity="error">{pageError}</Alert>;

  const inScopeMembers = rows
    .filter((row) => row.id !== scope.self.id)
    .map(({ id, fullname }) => ({ id, fullname }));

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h5">Manage family</Typography>
        <Typography color="text.secondary" variant="body2">
          Add and edit the relatives you&apos;re connected to.
        </Typography>
      </Box>

      <RelationshipGroupedPanel
        scope={scope}
        isAdmin={false}
        actingUserId={user.id}
        onAddRelative={(relationType) =>
          setDialogState({ open: true, relationType, targetId: scope.self.id })
        }
        onEdit={(member) => setEditTarget(member)}
        onDelete={undefined}
      />

      <AddRelativeDialog
        open={dialogState.open}
        relationType={dialogState.relationType}
        targetId={dialogState.targetId}
        inScopeMembers={inScopeMembers}
        onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
        onCreated={refetch}
      />
    </Stack>
  );
}

function AdminPlaceholder() {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h5">Manage family</Typography>
        <Typography color="text.secondary" variant="body2">
          Search the whole tree and manage any member.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, p: { xs: 3, md: 4 } }}>
        <Typography color="text.secondary" variant="body2">
          Admin tree search and management tools are added in a later plan.
        </Typography>
      </Paper>
    </Stack>
  );
}

export default function ManagePage() {
  const { user } = useAuth();

  if (user.role === 'ADMIN') {
    return <AdminPlaceholder />;
  }

  return <MemberBranch user={user} />;
}
