import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors, getInitials } from '../theme.js';

const UNLINKED_USERS_QUERY = `
  query UnlinkedUsers {
    unlinkedUsers { id name email createdAt }
  }
`;

const FAMILY_MEMBERS_QUERY = `
  query FamilyMembers {
    familyMembers { id firstname lastname fullname }
  }
`;

const LINK_USER_TO_MEMBER_MUTATION = `
  mutation LinkUserToMember($userId: ID!, $memberId: ID, $newMember: NewFamilyMemberInput) {
    linkUserToMember(userId: $userId, memberId: $memberId, newMember: $newMember) { id familyMemberId }
  }
`;

const EMPTY_FORM = {
  firstname: '',
  lastname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  deathdate: '',
  phone: '',
  address: '',
};

function UnlinkedUserRow({ user, familyMembers, onLinked }) {
  const [mode, setMode] = useState('pick');
  const [selectedMember, setSelectedMember] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleLink = async () => {
    setError('');
    setSubmitting(true);
    try {
      await graphqlRequest(LINK_USER_TO_MEMBER_MUTATION, {
        userId: user.id,
        memberId: selectedMember.id,
        newMember: undefined,
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
      await graphqlRequest(LINK_USER_TO_MEMBER_MUTATION, {
        userId: user.id,
        memberId: undefined,
        newMember: form,
      });
      onLinked(user.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ px: { xs: 3, md: 4 }, py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Avatar sx={{ width: 42, height: 42, bgcolor: '#eef1f8', color: colors.slate }}>
          {getInitials(user.name)}
        </Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }} noWrap>
            {user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {mode === 'pick' ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <Autocomplete
            options={familyMembers}
            getOptionLabel={(member) => member.fullname}
            value={selectedMember}
            onChange={(_event, value) => setSelectedMember(value)}
            sx={{ minWidth: 260, flexGrow: 1 }}
            renderInput={(params) => <TextField {...params} label="Family member" />}
          />
          <Button variant="contained" disabled={!selectedMember || submitting} onClick={handleLink}>
            {submitting ? 'Linking…' : 'Link'}
          </Button>
          <Button variant="text" disabled={submitting} onClick={() => setMode('create')}>
            Create new member instead
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="First name"
              required
              value={form.firstname}
              onChange={handleFormChange('firstname')}
              fullWidth
            />
            <TextField
              label="Last name"
              required
              value={form.lastname}
              onChange={handleFormChange('lastname')}
              fullWidth
            />
            <TextField
              select
              label="Gender"
              required
              value={form.gender}
              onChange={handleFormChange('gender')}
              fullWidth
            >
              <MenuItem value="Male">Male</MenuItem>
              <MenuItem value="Female">Female</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Email" value={form.email} onChange={handleFormChange('email')} fullWidth />
            <TextField label="Phone" value={form.phone} onChange={handleFormChange('phone')} fullWidth />
            <TextField label="Address" value={form.address} onChange={handleFormChange('address')} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Birthdate" value={form.birthdate} onChange={handleFormChange('birthdate')} fullWidth />
            <TextField label="Deathdate" value={form.deathdate} onChange={handleFormChange('deathdate')} fullWidth />
            <TextField
              label="Mother's name"
              value={form.mothersname}
              onChange={handleFormChange('mothersname')}
              fullWidth
            />
          </Stack>
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
                setForm(EMPTY_FORM);
              }}
            >
              Back
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

export default function AdminLinkMembers() {
  const [unlinkedUsers, setUnlinkedUsers] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    Promise.all([graphqlRequest(UNLINKED_USERS_QUERY), graphqlRequest(FAMILY_MEMBERS_QUERY)])
      .then(([unlinkedUsersData, familyMembersData]) => {
        setUnlinkedUsers(unlinkedUsersData.unlinkedUsers);
        setFamilyMembers(familyMembersData.familyMembers);
      })
      .catch((err) => setPageError(err.message))
      .finally(() => setPageLoading(false));
  }, []);

  const handleLinked = (userId) => {
    setUnlinkedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  if (pageLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (pageError) return <Alert severity="error">{pageError}</Alert>;

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h5">Link accounts to family members</Typography>
        <Typography color="text.secondary" variant="body2">
          Connect unlinked accounts to an existing family member, or create a new one.
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ borderRadius: 5, border: `1px solid ${colors.line}`, overflow: 'hidden' }}>
        {unlinkedUsers.length === 0 ? (
          <Box sx={{ px: { xs: 3, md: 4 }, py: 4 }}>
            <Typography>No accounts are waiting to be linked.</Typography>
          </Box>
        ) : (
          <Stack divider={<Box sx={{ borderBottom: `1px solid ${colors.line}` }} />}>
            {unlinkedUsers.map((user) => (
              <UnlinkedUserRow key={user.id} user={user} familyMembers={familyMembers} onLinked={handleLinked} />
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
