import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
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
  geezFirstname: '', geezLastname: '', geezMothersname: '',
  gender: '',
  mothersname: '',
  email: '',
  birthdate: '',
  isAlive: true,
  phone: '',
  address: ''
};

// Maps a gender to the mother/father slot that gender occupies. Used for BOTH
// relations that need a role: a new parent's role follows the parent's own
// gender, and a child's role follows the ANCHOR's gender (the anchor is the
// child's father if male, mother if female). 'Other'/unset yields no slot, so
// submit stays disabled. No role is ever picked manually.
function parentRoleFromGender(gender) {
  if (gender === 'Male') return 'FATHER';
  if (gender === 'Female') return 'MOTHER';
  return '';
}

export default function AddRelativeDialog({
  open,
  relationType,
  targetId,
  targetName,
  targetGender,
  targetFirstname,
  inScopeMembers,
  onClose,
  onCreated
}) {
  const [form, setForm] = useState(EMPTY_FORM);
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

  // When adding a child to a male anchor, the child inherits the anchor's first
  // name as its last name (father's-first-name convention). Prefill it on open;
  // it stays editable.
  useEffect(() => {
    if (open && relationType === 'child' && targetGender === 'Male' && targetFirstname) {
      setForm((prev) => ({ ...prev, lastname: targetFirstname }));
    }
  }, [open, relationType, targetGender, targetFirstname]);

  const resetState = () => {
    setForm(EMPTY_FORM);
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
        const data = await graphqlRequest(ADD_PARENT_MUTATION, {
          memberId: targetId,
          role: parentRoleFromGender(form.gender),
          newMember: form
        });
        created = data.addParent;
      } else if (relationType === 'spouse') {
        const data = await graphqlRequest(ADD_SPOUSE_MUTATION, { memberId: targetId, newMember: form });
        created = data.addSpouse;
      } else if (relationType === 'child') {
        const data = await graphqlRequest(ADD_CHILD_MUTATION, {
          memberId: targetId,
          role: parentRoleFromGender(targetGender),
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

  const who = targetName || 'this person';
  const isParent = relationType === 'parent';
  const isChild = relationType === 'child';
  // Parent role follows the new parent's gender; child role follows the
  // anchor's gender. Either can be missing when the relevant gender is 'Other'.
  const parentRole = parentRoleFromGender(form.gender);
  const childRole = parentRoleFromGender(targetGender);
  const parentNeedsBinaryGender = isParent && Boolean(form.gender) && !parentRole;
  const childAnchorNotBinary = isChild && !childRole;
  const disableSubmit =
    !form.firstname ||
    !form.lastname ||
    !form.gender ||
    (isParent && !parentRole) ||
    (isChild && !childRole) ||
    submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Add {relationType}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {isChild && childRole && (
            <Alert severity="info">
              {childRole === 'FATHER'
                ? `${who} will be recorded as this child's father.`
                : `${who} will be recorded as this child's mother.`}
            </Alert>
          )}

          {childAnchorNotBinary && (
            <Alert severity="warning">
              {who} has no recorded gender of Male or Female, so they can&apos;t be set as this
              child&apos;s mother or father. Set their gender first.
            </Alert>
          )}

          <MemberFields
            form={form}
            onChange={handleFieldChange}
            withPhoto
            photoPreviewUrl={photoPreviewUrl}
            onPickPhoto={handlePickPhoto}
            onClearPhoto={clearPhoto}
          />

          {parentNeedsBinaryGender && (
            <Alert severity="info">
              Set the gender to Male or Female so this parent can be recorded as a father or mother.
            </Alert>
          )}

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
