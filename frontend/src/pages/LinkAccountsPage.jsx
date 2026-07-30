import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { uploadMemberPhoto } from '../api/photoClient.js';
import { colors, getInitials } from '../theme.js';
import MemberAvatarImage from '../components/manage/MemberAvatarImage.jsx';
import MemberFields from '../components/manage/MemberFields.jsx';
import PhotoCropDialog from '../components/manage/PhotoCropDialog.jsx';

// Member list for the picker (name + avatar + subtitle) and for showing which
// members already have a linked account (linkedUser name/email — admin-visible).
const FAMILY_MEMBERS_QUERY = `
  query FamilyMembersForLinking {
    familyMembers {
      id firstname lastname fullname gender birthdate photoUrl
      linkedUser { id name email }
    }
  }
`;

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
  isAlive: true,
  phone: '',
  address: ''
};

// Builds the muted secondary line for a member option: "Gender · b. YYYY".
function memberOptionSubtitle(member) {
  const parts = [];
  if (member.gender) parts.push(member.gender);
  const year = member.birthdate ? String(member.birthdate).slice(0, 4) : null;
  if (year) parts.push(`b. ${year}`);
  return parts.join(' · ');
}

// A side-by-side "connection card": the account on the left, a link/chain cue
// in the middle, and the member picker (avatars + subtitle) on the right, so
// the account <-> member relationship is visually explicit.
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

            <LinkRoundedIcon aria-hidden="true" sx={{ color: colors.primary }} />

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

// Read-only row for an already-linked account. An account may only be linked to
// the family member that IS them, so the account and the member are the same
// person — we show a single entity (the member's photo + the account name and
// email), not the same name/avatar twice. Clicking the row opens the family
// tree headed on that person.
function LinkedAccountRow({ member }) {
  const account = member.linkedUser;
  const navigate = useNavigate();
  const openInTree = () => navigate(`/family?head=${member.id}`);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      role="button"
      tabIndex={0}
      aria-label={`View ${account.name} in the family tree`}
      onClick={openInTree}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openInTree();
        }
      }}
      sx={{ px: { xs: 3, md: 4 }, py: 2.5, cursor: 'pointer', '&:hover': { bgcolor: colors.gradientSoft } }}
    >
      <MemberAvatarImage member={member} size={40} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 600 }} noWrap>
          {account.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {account.email}
        </Typography>
      </Box>
      <ChevronRightRoundedIcon aria-hidden="true" sx={{ color: colors.slate }} />
    </Stack>
  );
}

export default function LinkAccountsPage() {
  const [members, setMembers] = useState([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');

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
    // Drop the account from "waiting" immediately, and refetch members so it
    // shows up under "Linked accounts" without a manual reload.
    setUnlinkedUsers((prev) => prev.filter((u) => u.id !== userId));
    graphqlRequest(FAMILY_MEMBERS_QUERY)
      .then((data) => setMembers(data.familyMembers))
      .catch((err) => setPageError(err.message));
  };

  // Members that already have an account connected, sorted by account name.
  const linkedMembers = members
    .filter((member) => member.linkedUser)
    .sort((a, b) => a.linkedUser.name.localeCompare(b.linkedUser.name));

  return (
    <Stack spacing={4} sx={{ maxWidth: 720, mx: 'auto' }}>
      <Box>
        <Typography variant="h4">Link accounts</Typography>
        <Typography color="text.secondary">
          Connect a registered account to the family member it belongs to, or create a new member for it.
        </Typography>
      </Box>

      {pageError && <Alert severity="error">{pageError}</Alert>}

      {pageLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Waiting to be linked
            </Typography>
            <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
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

          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Linked accounts
            </Typography>
            <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
              {linkedMembers.length === 0 ? (
                <Box sx={{ px: { xs: 3, md: 4 }, py: 4 }}>
                  <Typography>No accounts are linked yet.</Typography>
                </Box>
              ) : (
                <Stack divider={<Box sx={{ borderBottom: `1px solid ${colors.line}` }} />}>
                  {linkedMembers.map((member) => (
                    <LinkedAccountRow key={member.id} member={member} />
                  ))}
                </Stack>
              )}
            </Paper>
          </Box>
        </>
      )}
    </Stack>
  );
}
