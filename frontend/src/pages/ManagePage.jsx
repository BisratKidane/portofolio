import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import { useAuth } from '../context/AuthContext.jsx';
import { graphqlRequest } from '../api/graphqlClient.js';
import { removeMemberPhoto, uploadMemberPhoto } from '../api/photoClient.js';
import { colors, getInitials } from '../theme.js';
import RelationshipGroupedPanel from '../components/manage/RelationshipGroupedPanel.jsx';
import AddRelativeDialog from '../components/manage/AddRelativeDialog.jsx';
import EditMemberDialog from '../components/manage/EditMemberDialog.jsx';
import AdminMemberTable from '../components/manage/AdminMemberTable.jsx';
import MemberAvatarImage from '../components/manage/MemberAvatarImage.jsx';
import MemberFields from '../components/manage/MemberFields.jsx';
import PhotoCropDialog from '../components/manage/PhotoCropDialog.jsx';

const MY_EDITABLE_MEMBERS_QUERY = `
  query MyEditableMembers {
    myEditableMembers {
      id firstname lastname fullname gender birthdate deathdate phone email address photoUrl
      mother { id siblings { id fullname gender birthdate photoUrl } }
      father { id siblings { id fullname gender birthdate photoUrl } }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id }
    }
  }
`;

const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersTable {
    familyMembers { id firstname lastname fullname gender birthdate photoUrl linkedUser { id name email } }
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
      id firstname lastname fullname gender birthdate deathdate phone email address photoUrl
      mother { id fullname siblings { id fullname gender birthdate photoUrl } }
      father { id fullname siblings { id fullname gender birthdate photoUrl } }
      spouses { id fullname } children { id fullname } siblings { id fullname }
      linkedUser { id name email }
    }
  }
`;

const DELETE_MEMBER_MUTATION = `
  mutation DeleteMember($id: ID!) { deleteMember(id: $id) }
`;

// Re-homed verbatim from AdminLinkMembers.jsx (pre-15-05-redirect, commit 9082440) --
// MNG-03: account-linking moves into /manage, /admin/link-members no longer hosts it.
const UNLINKED_USERS_QUERY = `
  query UnlinkedUsers {
    unlinkedUsers { id name email createdAt }
  }
`;

const LINK_USER_TO_MEMBER_MUTATION = `
  mutation LinkUserToMember($userId: ID!, $memberId: ID, $newMember: NewFamilyMemberInput) {
    linkUserToMember(userId: $userId, memberId: $memberId, newMember: $newMember) { id familyMemberId }
  }
`;

const EMPTY_LINK_FORM = {
  firstname: '',
  lastname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  deathdate: '',
  phone: '',
  address: ''
};

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

const EMPTY_DIALOG_STATE = { open: false, relationType: '', targetId: null, targetName: '' };
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
          setDialogState({
            open: true,
            relationType,
            targetId: scope.self.id,
            targetName: scope.self.fullname
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

// Builds the muted secondary line for a member option: "Gender · b. YYYY".
function memberOptionSubtitle(member) {
  const parts = [];
  if (member.gender) parts.push(member.gender);
  const year = member.birthdate ? String(member.birthdate).slice(0, 4) : null;
  if (year) parts.push(`b. ${year}`);
  return parts.join(' · ');
}

// Re-homed from AdminLinkMembers.jsx (pre-15-05-redirect, commit 9082440), then
// reworked into a side-by-side "connection card": the account on the left, a
// link/chain cue in the middle, and the member picker (avatars + subtitle) on
// the right, so the account <-> member relationship is visually explicit.
function UnlinkedUserRow({ user, familyMembers, onLinked }) {
  const [mode, setMode] = useState('pick');
  const [selectedMember, setSelectedMember] = useState(null);
  const [form, setForm] = useState(EMPTY_LINK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearPhoto = () => {
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCroppedBlob(null);
  };

  const handlePickPhoto = (file) => {
    setCropFile(file);
    setCropOpen(true);
  };

  const handleCropped = (blob) => {
    clearPhoto();
    setCroppedBlob(blob);
    setPhotoPreviewUrl(URL.createObjectURL(blob));
  };

  const handleLink = async () => {
    setError('');
    setSubmitting(true);
    try {
      await graphqlRequest(LINK_USER_TO_MEMBER_MUTATION, {
        userId: user.id,
        memberId: selectedMember.id,
        newMember: undefined
      });
      onLinked(user.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAndLink = async () => {
    setError('');
    setSubmitting(true);
    try {
      const data = await graphqlRequest(LINK_USER_TO_MEMBER_MUTATION, {
        userId: user.id,
        memberId: undefined,
        newMember: form
      });
      const linked = data.linkUserToMember;

      // Photo-on-create is best-effort: a failed upload must NOT lose the member.
      if (croppedBlob && linked?.familyMemberId) {
        try {
          await uploadMemberPhoto(linked.familyMemberId, croppedBlob);
        } catch (photoErr) {
          console.warn(`Member created, but the photo could not be uploaded: ${photoErr.message}`);
        }
      }

      onLinked(user.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const accountBlock = (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, flex: 1 }}>
      <Avatar sx={{ width: 42, height: 42, bgcolor: '#eef1f8', color: colors.slate }}>
        {getInitials(user.name)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }} noWrap>
          {user.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {user.email}
        </Typography>
      </Box>
    </Stack>
  );

  return (
    <Stack spacing={2} sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
      {error && <Alert severity="error">{error}</Alert>}

      {mode === 'pick' ? (
        <>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ md: 'center' }}
            sx={{ border: `1px solid ${colors.line}`, borderRadius: 4, p: 2, bgcolor: colors.gradientSoft }}
          >
            {accountBlock}

            <LinkRoundedIcon aria-hidden="true" sx={{ color: colors.primary, transform: { xs: 'rotate(90deg)', md: 'none' } }} />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Autocomplete
                options={familyMembers}
                getOptionLabel={(member) => member.fullname}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={selectedMember}
                onChange={(_event, value) => setSelectedMember(value)}
                renderOption={(props, member) => {
                  const { key, ...optionProps } = props;
                  const subtitle = memberOptionSubtitle(member);
                  return (
                    <Box component="li" key={key} {...optionProps} sx={{ gap: 1.5 }}>
                      <MemberAvatarImage member={member} size={32} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap>{member.fullname}</Typography>
                        {subtitle && (
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {subtitle}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                }}
                renderInput={(params) => <TextField {...params} label="Family member" />}
              />
              {selectedMember && (
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
                  <MemberAvatarImage member={selectedMember} size={32} />
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {selectedMember.fullname}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button variant="contained" disabled={!selectedMember || submitting} onClick={handleLink}>
              {submitting ? 'Connecting…' : 'Connect account → member'}
            </Button>
            <Button variant="text" disabled={submitting} onClick={() => setMode('create')}>
              Create new member instead
            </Button>
          </Stack>
        </>
      ) : (
        <Stack spacing={2}>
          {accountBlock}

          <MemberFields
            form={form}
            onChange={handleFieldChange}
            withPhoto
            photoPreviewUrl={photoPreviewUrl}
            onPickPhoto={handlePickPhoto}
            onClearPhoto={clearPhoto}
          />

          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              disabled={!form.firstname || !form.lastname || !form.gender || submitting}
              onClick={handleCreateAndLink}
            >
              {submitting ? 'Creating…' : 'Create & link'}
            </Button>
            <Button
              variant="text"
              disabled={submitting}
              onClick={() => {
                setMode('pick');
                setForm(EMPTY_LINK_FORM);
                clearPhoto();
              }}
            >
              Back
            </Button>
          </Stack>
        </Stack>
      )}

      <PhotoCropDialog
        open={cropOpen}
        file={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onCropped={handleCropped}
      />
    </Stack>
  );
}

function AdminBranch({ user }) {
  const [members, setMembers] = useState([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState([]);
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

  useEffect(() => {
    setPageLoading(true);
    Promise.all([graphqlRequest(FAMILY_MEMBERS_QUERY), graphqlRequest(UNLINKED_USERS_QUERY)])
      .then(([membersData, unlinkedData]) => {
        setMembers(membersData.familyMembers);
        setUnlinkedUsers(unlinkedData.unlinkedUsers);
      })
      .catch((err) => setPageError(err.message))
      .finally(() => setPageLoading(false));
  }, []);

  const handleLinked = (userId) => {
    setUnlinkedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

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

      {/* Two columns: the member list + search on the left, the selected
          member's add/edit panel on the right, so the edit area is always
          visible next to the list instead of pushed below it. */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="flex-start">
        <Box sx={{ width: '100%', flex: { md: '0 0 44%' }, minWidth: 0 }}>
          <AdminMemberTable members={members} onSelect={handleFocus} />
        </Box>

        <Box
          sx={{
            width: '100%',
            flex: { md: 1 },
            minWidth: 0,
            position: { md: 'sticky' },
            top: { md: 88 }
          }}
        >
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
                  targetName: focusedScope.self.fullname
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

      <Box>
        <Typography variant="h6">Link accounts</Typography>
        <Paper
          elevation={0}
          sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden', mt: 2 }}
        >
          {unlinkedUsers.length === 0 ? (
            <Box sx={{ px: { xs: 3, md: 4 }, py: 4 }}>
              <Typography>No accounts are waiting to be linked.</Typography>
            </Box>
          ) : (
            <Stack divider={<Box sx={{ borderBottom: `1px solid ${colors.line}` }} />}>
              {unlinkedUsers.map((unlinkedUser) => (
                <UnlinkedUserRow
                  key={unlinkedUser.id}
                  user={unlinkedUser}
                  familyMembers={members}
                  onLinked={handleLinked}
                />
              ))}
            </Stack>
          )}
        </Paper>
      </Box>

      <AddRelativeDialog
        open={dialogState.open}
        relationType={dialogState.relationType}
        targetId={dialogState.targetId}
        targetName={dialogState.targetName}
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
