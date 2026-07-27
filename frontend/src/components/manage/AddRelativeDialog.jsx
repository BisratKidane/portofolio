import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField
} from '@mui/material';
import { graphqlRequest } from '../../api/graphqlClient.js';
import { uploadMemberPhoto } from '../../api/photoClient.js';
import MemberFields from './MemberFields.jsx';
import PhotoCropDialog from './PhotoCropDialog.jsx';

const ADD_PARENT_MUTATION = `
  mutation AddParent($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!) {
    addParent(memberId: $memberId, role: $role, newMember: $newMember) { id fullname }
  }
`;

const ADD_SPOUSE_MUTATION = `
  mutation AddSpouse($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSpouse(memberId: $memberId, newMember: $newMember) { id fullname }
  }
`;

const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) { id fullname }
  }
`;

const ADD_SIBLING_MUTATION = `
  mutation AddSibling($memberId: ID!, $newMember: NewFamilyMemberInput!) {
    addSibling(memberId: $memberId, newMember: $newMember) { id fullname }
  }
`;

const EMPTY_FORM = {
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

const NEEDS_ROLE = new Set(['parent', 'child']);

export default function AddRelativeDialog({
  open,
  relationType,
  targetId,
  targetName,
  inScopeMembers,
  onClose,
  onCreated
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [role, setRole] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [otherParent, setOtherParent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);

  const clearPhoto = () => {
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCroppedBlob(null);
  };

  // Release the preview object URL when the dialog unmounts.
  useEffect(
    () => () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    },
    [photoPreviewUrl]
  );

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetState = () => {
    setForm(EMPTY_FORM);
    setRole('');
    setShowPicker(false);
    setOtherParent(null);
    setError('');
    clearPhoto();
    setCropFile(null);
    setCropOpen(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
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

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      let created;
      if (relationType === 'parent') {
        const data = await graphqlRequest(ADD_PARENT_MUTATION, { memberId: targetId, role, newMember: form });
        created = data.addParent;
      } else if (relationType === 'spouse') {
        const data = await graphqlRequest(ADD_SPOUSE_MUTATION, { memberId: targetId, newMember: form });
        created = data.addSpouse;
      } else if (relationType === 'child') {
        const data = await graphqlRequest(ADD_CHILD_MUTATION, {
          memberId: targetId,
          role,
          newMember: form,
          otherParentId: otherParent?.id ?? null
        });
        created = data.addChild;
      } else if (relationType === 'sibling') {
        const data = await graphqlRequest(ADD_SIBLING_MUTATION, { memberId: targetId, newMember: form });
        created = data.addSibling;
      }

      // Photo-on-create is best-effort: a failed upload must NOT lose the member.
      if (croppedBlob && created?.id) {
        try {
          await uploadMemberPhoto(created.id, croppedBlob);
        } catch (photoErr) {
          console.warn(`Member created, but the photo could not be uploaded: ${photoErr.message}`);
        }
      }

      resetState();
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const needsRole = NEEDS_ROLE.has(relationType);
  const who = targetName || 'this person';
  const roleHelperText =
    relationType === 'child'
      ? `${who} is this child's mother or father.`
      : `Is this person the mother or father of ${who}?`;
  const disableSubmit = !form.firstname || !form.lastname || !form.gender || (needsRole && !role) || submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add {relationType}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {needsRole && (
            <TextField
              select
              label="Role"
              required
              value={role}
              onChange={(event) => setRole(event.target.value)}
              helperText={roleHelperText}
              fullWidth
            >
              <MenuItem value="MOTHER">Mother</MenuItem>
              <MenuItem value="FATHER">Father</MenuItem>
            </TextField>
          )}

          <MemberFields
            form={form}
            onChange={handleFieldChange}
            withPhoto
            photoPreviewUrl={photoPreviewUrl}
            onPickPhoto={handlePickPhoto}
            onClearPhoto={clearPhoto}
          />

          {relationType === 'child' &&
            (showPicker ? (
              <Autocomplete
                options={inScopeMembers}
                getOptionLabel={(member) => member.fullname}
                value={otherParent}
                onChange={(_event, value) => setOtherParent(value)}
                renderInput={(params) => <TextField {...params} label="Other parent (optional)" />}
              />
            ) : (
              <Button variant="text" onClick={() => setShowPicker(true)} sx={{ alignSelf: 'flex-start' }}>
                or pick someone already in your family
              </Button>
            ))}

          <Stack direction="row" spacing={2}>
            <Button variant="contained" disabled={disableSubmit} onClick={handleSubmit}>
              {submitting ? 'Adding…' : 'Add member'}
            </Button>
            <Button variant="text" disabled={submitting} onClick={handleClose}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </DialogContent>

      <PhotoCropDialog
        open={cropOpen}
        file={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onCropped={handleCropped}
      />
    </Dialog>
  );
}
