import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
import { removeMemberPhoto } from '../api/photoClient.js';
import { colors } from '../theme.js';
import RelationshipGroupedPanel from '../components/manage/RelationshipGroupedPanel.jsx';
import AddRelativeDialog from '../components/manage/AddRelativeDialog.jsx';
import EditMemberDialog from '../components/manage/EditMemberDialog.jsx';
import AdminMemberTable from '../components/manage/AdminMemberTable.jsx';
import PhotoCropDialog from '../components/manage/PhotoCropDialog.jsx';

// The scalar fields both the avatar (gender, photoUrl) and the edit form
// (all editable fields incl. mothersname) need on any member card. Requested
// on nested relatives so a relative's Edit dialog opens fully populated, not
// just with an id + fullname.
const EDITABLE_MEMBER_FIELDS =
  'id firstname lastname fullname geezFirstname geezLastname geezMothersname geezFullname gender mothersname email birthdate isAlive phone address photoUrl';

const MY_EDITABLE_MEMBERS_QUERY = `
  query MyEditableMembers {
    myEditableMembers {
      ${EDITABLE_MEMBER_FIELDS}
      mother { id siblings { id fullname geezFullname gender birthdate photoUrl } }
      father { id siblings { id fullname geezFullname gender birthdate photoUrl } }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id }
    }
  }
`;

const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersTable {
    familyMembers {
      id firstname lastname fullname geezFullname gender birthdate isAlive photoUrl
      linkedUser { id name email }
      createdBy { id name } updatedBy { id name } createdAt updatedAt
    }
  }
`;

const TOGGLE_ALIVE_MUTATION = `
  mutation ToggleAlive($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) { id isAlive updatedAt updatedBy { id name } }
  }
`;

// Every relative is fetched with the full editable field set (not just id +
// fullname) so the admin panel renders correct gendered/photo avatars AND each
// relative's Edit dialog opens fully populated. Parents' siblings (uncles &
// aunts) get the same treatment for the same reason.
const FAMILY_MEMBER_FOCUS_QUERY = `
  query FamilyMemberFocus($id: ID!) {
    familyMember(id: $id) {
      ${EDITABLE_MEMBER_FIELDS}
      mother { ${EDITABLE_MEMBER_FIELDS} siblings { ${EDITABLE_MEMBER_FIELDS} } }
      father { ${EDITABLE_MEMBER_FIELDS} siblings { ${EDITABLE_MEMBER_FIELDS} } }
      spouses { ${EDITABLE_MEMBER_FIELDS} }
      children { ${EDITABLE_MEMBER_FIELDS} }
      siblings { ${EDITABLE_MEMBER_FIELDS} }
      linkedUser { id name email }
    }
  }
`;

const DELETE_MEMBER_MUTATION = `
  mutation DeleteMember($id: ID!) { deleteMember(id: $id) }
`;

// Uncles & aunts = the siblings of the person's parents. Derived from the
// nested `mother.siblings` / `father.siblings` the queries fetch, deduped by id,
// excluding the person themselves and their own parents.
function collectUnclesAunts(self) {
  const parentIds = new Set([self.mother?.id, self.father?.id].filter(Boolean));
  const byId = new Map();
  for (const parent of [self.mother, self.father]) {
    for (const sib of parent?.siblings ?? []) {
      if (!sib || sib.id === self.id || parentIds.has(sib.id) || byId.has(sib.id)) continue;
      byId.set(sib.id, sib);
    }
  }
  return [...byId.values()];
}

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
    siblings: rows.filter((row) => siblingIds.has(row.id)),
    unclesAunts: collectUnclesAunts(self)
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

const EMPTY_DIALOG_STATE = {
  open: false,
  relationType: '',
  targetId: null,
  targetName: '',
  targetGender: '',
  targetFirstname: '',
  targetLastname: '',
  targetGeezFirstname: '',
  targetGeezLastname: ''
};
const EMPTY_CROP_STATE = { open: false, file: null, member: null };

function MemberBranch({ user }) {
  const [rows, setRows] = useState([]);
  const [scope, setScope] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [dialogState, setDialogState] = useState(EMPTY_DIALOG_STATE);
  const [editTarget, setEditTarget] = useState(null);
  const [cropDialog, setCropDialog] = useState(EMPTY_CROP_STATE);
  const [removePhotoTarget, setRemovePhotoTarget] = useState(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [removePhotoError, setRemovePhotoError] = useState('');

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

  const handleRemovePhotoConfirm = async () => {
    setRemovePhotoError('');
    setRemovingPhoto(true);
    try {
      await removeMemberPhoto(removePhotoTarget.id);
      await refetch();
      setRemovePhotoTarget(null);
    } catch (err) {
      setRemovePhotoError(err.message);
    } finally {
      setRemovingPhoto(false);
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

  const inScopeMembers = rows
    .filter((row) => row.id !== scope.self.id)
    .map(({ id, fullname, geezFullname }) => ({ id, fullname, geezFullname }));

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
          setDialogState({
            open: true,
            relationType,
            targetId: scope.self.id,
            targetName: scope.self.fullname,
            targetGender: scope.self.gender,
            targetFirstname: scope.self.firstname,
            targetLastname: scope.self.lastname,
            targetGeezFirstname: scope.self.geezFirstname,
            targetGeezLastname: scope.self.geezLastname
          })
        }
        onEdit={(member) => setEditTarget(member)}
        onDelete={undefined}
        onPickPhoto={(member, file) => setCropDialog({ open: true, file, member })}
        onRemovePhoto={(member) => setRemovePhotoTarget(member)}
      />

      <AddRelativeDialog
        open={dialogState.open}
        relationType={dialogState.relationType}
        targetId={dialogState.targetId}
        targetName={dialogState.targetName}
        targetGender={dialogState.targetGender}
        targetFirstname={dialogState.targetFirstname}
        targetLastname={dialogState.targetLastname}
        targetGeezFirstname={dialogState.targetGeezFirstname}
        targetGeezLastname={dialogState.targetGeezLastname}
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

      <PhotoCropDialog
        open={cropDialog.open}
        file={cropDialog.file}
        member={cropDialog.member}
        onClose={() => setCropDialog(EMPTY_CROP_STATE)}
        onUploaded={refetch}
      />

      <Dialog open={Boolean(removePhotoTarget)} onClose={() => (removingPhoto ? null : setRemovePhotoTarget(null))}>
        <DialogTitle>Remove photo?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {removePhotoError && <Alert severity="error">{removePhotoError}</Alert>}
            <Typography>
              {`Remove ${removePhotoTarget?.fullname}'s photo? Their avatar goes back to the default icon. This can't be undone.`}
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="text" disabled={removingPhoto} onClick={() => setRemovePhotoTarget(null)}>
                Cancel
              </Button>
              <Button variant="contained" color="error" disabled={removingPhoto} onClick={handleRemovePhotoConfirm}>
                {removingPhoto ? 'Removing…' : 'Remove photo'}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
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
  const [cropDialog, setCropDialog] = useState(EMPTY_CROP_STATE);
  const [removePhotoTarget, setRemovePhotoTarget] = useState(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [removePhotoError, setRemovePhotoError] = useState('');

  const refetchMembers = useCallback(() => {
    return graphqlRequest(FAMILY_MEMBERS_QUERY).then((data) => setMembers(data.familyMembers));
  }, []);

  // Admin isAlive toggle from the members table: flip the flag and patch the
  // row (incl. the refreshed "last edited by" provenance) in place.
  const handleToggleMemberAlive = useCallback(async (member) => {
    const { editMember } = await graphqlRequest(TOGGLE_ALIVE_MUTATION, {
      id: member.id,
      fields: { isAlive: member.isAlive === false }
    });
    setMembers((prev) =>
      prev.map((m) =>
        String(m.id) === String(member.id)
          ? { ...m, isAlive: editMember.isAlive, updatedAt: editMember.updatedAt, updatedBy: editMember.updatedBy }
          : m
      )
    );
  }, []);

  useEffect(() => {
    setPageLoading(true);
    graphqlRequest(FAMILY_MEMBERS_QUERY)
      .then((membersData) => setMembers(membersData.familyMembers))
      .catch((err) => setPageError(err.message))
      .finally(() => setPageLoading(false));
  }, []);

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

  const handleRemovePhotoConfirm = async () => {
    setRemovePhotoError('');
    setRemovingPhoto(true);
    try {
      await removeMemberPhoto(removePhotoTarget.id);
      await refetchMembers();
      await refetchFocused();
      setRemovePhotoTarget(null);
    } catch (err) {
      setRemovePhotoError(err.message);
    } finally {
      setRemovingPhoto(false);
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
    ? members
        .filter((member) => member.id !== focusedScope.self.id)
        .map(({ id, fullname, geezFullname }) => ({ id, fullname, geezFullname }))
    : [];

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h5">Manage family</Typography>
        <Typography color="text.secondary" variant="body2">
          Search the whole tree and manage any member.
        </Typography>
      </Box>

      {/* Two equal (50/50) columns on lg+: member list + search (left) and the
          selected member's add/edit panel (right, with Uncles & Aunts below
          Siblings). Stacks vertically below lg. */}
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={4} alignItems="flex-start">
        {/* Left: list + search */}
        <Box sx={{ width: '100%', flex: { lg: '1 1 0' }, minWidth: 0 }}>
          <AdminMemberTable members={members} onSelect={handleFocus} onToggleAlive={handleToggleMemberAlive} />
        </Box>

        {/* Right: selected member's edit panel (Uncles & Aunts render below Siblings) */}
        <Box sx={{ width: '100%', flex: { lg: '1 1 0' }, minWidth: 0 }}>
          {focusedScope ? (
            <RelationshipGroupedPanel
              scope={focusedScope}
              isAdmin
              actingUserId={user.id}
              onAddRelative={(relationType) =>
                setDialogState({
                  open: true,
                  relationType,
                  targetId: focusedScope.self.id,
                  targetName: focusedScope.self.fullname,
                  targetGender: focusedScope.self.gender,
                  targetFirstname: focusedScope.self.firstname,
                  targetLastname: focusedScope.self.lastname,
                  targetGeezFirstname: focusedScope.self.geezFirstname,
                  targetGeezLastname: focusedScope.self.geezLastname
                })
              }
              onEdit={(member) => setEditTarget(member)}
              onDelete={(member) => setDeleteTarget(member)}
              onPickPhoto={(member, file) => setCropDialog({ open: true, file, member })}
              onRemovePhoto={(member) => setRemovePhotoTarget(member)}
            />
          ) : (
            <Paper
              elevation={0}
              sx={{
                border: `1px solid ${colors.line}`,
                borderRadius: 5,
                p: { xs: 3, md: 5 },
                textAlign: 'center'
              }}
            >
              <Typography color="text.secondary">
                Select a member from the list to view and edit their relatives.
              </Typography>
            </Paper>
          )}
        </Box>
      </Stack>

      <AddRelativeDialog
        open={dialogState.open}
        relationType={dialogState.relationType}
        targetId={dialogState.targetId}
        targetName={dialogState.targetName}
        targetGender={dialogState.targetGender}
        targetFirstname={dialogState.targetFirstname}
        targetLastname={dialogState.targetLastname}
        targetGeezFirstname={dialogState.targetGeezFirstname}
        targetGeezLastname={dialogState.targetGeezLastname}
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

      <PhotoCropDialog
        open={cropDialog.open}
        file={cropDialog.file}
        member={cropDialog.member}
        onClose={() => setCropDialog(EMPTY_CROP_STATE)}
        onUploaded={() => {
          refetchMembers();
          refetchFocused();
        }}
      />

      <Dialog open={Boolean(removePhotoTarget)} onClose={() => (removingPhoto ? null : setRemovePhotoTarget(null))}>
        <DialogTitle>Remove photo?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {removePhotoError && <Alert severity="error">{removePhotoError}</Alert>}
            <Typography>
              {`Remove ${removePhotoTarget?.fullname}'s photo? Their avatar goes back to the default icon. This can't be undone.`}
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="text" disabled={removingPhoto} onClick={() => setRemovePhotoTarget(null)}>
                Cancel
              </Button>
              <Button variant="contained" color="error" disabled={removingPhoto} onClick={handleRemovePhotoConfirm}>
                {removingPhoto ? 'Removing…' : 'Remove photo'}
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
