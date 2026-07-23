import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';
import RelationshipGroupedPanel from '../components/manage/RelationshipGroupedPanel.jsx';
import AddRelativeDialog from '../components/manage/AddRelativeDialog.jsx';
import EditMemberDialog from '../components/manage/EditMemberDialog.jsx';
import AdminMemberTable from '../components/manage/AdminMemberTable.jsx';

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

const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersTable {
    familyMembers { id firstname lastname fullname gender linkedUser { id name email } }
  }
`;

// Deviation (Rule 1): the plan's <interfaces> block wrote `mother { id } father { id }`
// (copy-pasted from MY_EDITABLE_MEMBERS_QUERY's shape), but 15-RESEARCH.md's "Admin table
// + focus query shape" section -- the canonical source this task's read_first points to --
// specifies `mother { id fullname }` / `father { id fullname }`. Without fullname these
// flattened parent rows would render blank names in the Parents section, so this follows
// RESEARCH.md.
const FAMILY_MEMBER_FOCUS_QUERY = `
  query FamilyMemberFocus($id: ID!) {
    familyMember(id: $id) {
      id firstname lastname fullname gender birthdate deathdate phone email address
      mother { id fullname } father { id fullname }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id name email }
    }
  }
`;

const DELETE_MEMBER_MUTATION = `
  mutation DeleteMember($id: ID!) { deleteMember(id: $id) }
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

// Flattens a familyMember(id) focus response into the same "array of rows" shape
// myEditableMembers already returns, so the SAME groupByRelation helper above can group
// it -- one grouping function, two entry points (D-03).
function flattenFocusedRow(focusedRow) {
  return [
    focusedRow,
    focusedRow.mother,
    focusedRow.father,
    ...(focusedRow.spouses ?? []),
    ...(focusedRow.children ?? []),
    ...(focusedRow.siblings ?? [])
  ].filter(Boolean);
}

const EMPTY_DIALOG_STATE = { open: false, relationType: '', targetId: null };

function MemberBranch({ user }) {
  const [rows, setRows] = useState([]);
  const [scope, setScope] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [dialogState, setDialogState] = useState(EMPTY_DIALOG_STATE);
  const [editTarget, setEditTarget] = useState(null);

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

      <EditMemberDialog
        open={Boolean(editTarget)}
        member={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={refetch}
      />
    </Stack>
  );
}

function AdminBranch({ user }) {
  const [members, setMembers] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [focusedScope, setFocusedScope] = useState(null);
  const [dialogState, setDialogState] = useState(EMPTY_DIALOG_STATE);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const refetchMembers = useCallback(() => {
    return graphqlRequest(FAMILY_MEMBERS_QUERY).then((data) => setMembers(data.familyMembers));
  }, []);

  useEffect(() => {
    setPageLoading(true);
    refetchMembers()
      .catch((err) => setPageError(err.message))
      .finally(() => setPageLoading(false));
  }, [refetchMembers]);

  const handleFocus = useCallback((member) => {
    return graphqlRequest(FAMILY_MEMBER_FOCUS_QUERY, { id: member.id })
      .then((data) => {
        const focusedRow = data.familyMember;
        setFocusedScope(groupByRelation(flattenFocusedRow(focusedRow), focusedRow));
      })
      .catch((err) => setPageError(err.message));
  }, []);

  const refetchFocused = useCallback(() => {
    if (focusedScope) return handleFocus(focusedScope.self);
    return Promise.resolve();
  }, [focusedScope, handleFocus]);

  const handleDeleteConfirm = async () => {
    setDeleteError('');
    setDeleting(true);
    try {
      await graphqlRequest(DELETE_MEMBER_MUTATION, { id: deleteTarget.id });
      await refetchMembers();
      setDeleteTarget(null);
      setFocusedScope(null);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (pageLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (pageError) return <Alert severity="error">{pageError}</Alert>;

  const inScopeMembers = focusedScope
    ? members.filter((member) => member.id !== focusedScope.self.id).map(({ id, fullname }) => ({ id, fullname }))
    : [];

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h5">Manage family</Typography>
        <Typography color="text.secondary" variant="body2">
          Search the whole tree and manage any member.
        </Typography>
      </Box>

      <AdminMemberTable members={members} onSelect={handleFocus} />

      {focusedScope && (
        <RelationshipGroupedPanel
          scope={focusedScope}
          isAdmin
          actingUserId={user.id}
          onAddRelative={(relationType) =>
            setDialogState({ open: true, relationType, targetId: focusedScope.self.id })
          }
          onEdit={(member) => setEditTarget(member)}
          onDelete={(member) => setDeleteTarget(member)}
        />
      )}

      <AddRelativeDialog
        open={dialogState.open}
        relationType={dialogState.relationType}
        targetId={dialogState.targetId}
        inScopeMembers={inScopeMembers}
        onClose={() => setDialogState(EMPTY_DIALOG_STATE)}
        onCreated={() => {
          refetchMembers();
          refetchFocused();
        }}
      />

      <EditMemberDialog
        open={Boolean(editTarget)}
        member={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          refetchMembers();
          refetchFocused();
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => (deleting ? null : setDeleteTarget(null))}>
        <DialogTitle>Remove member?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
            <Typography>
              {`Remove ${deleteTarget?.fullname} from the family tree? Blood relatives are preserved. This can't be undone.`}
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="text" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="contained" color="error" disabled={deleting} onClick={handleDeleteConfirm}>
                {deleting ? 'Removing…' : 'Remove'}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

export default function ManagePage() {
  const { user } = useAuth();

  if (user.role === 'ADMIN') {
    return <AdminBranch user={user} />;
  }

  return <MemberBranch user={user} />;
}
