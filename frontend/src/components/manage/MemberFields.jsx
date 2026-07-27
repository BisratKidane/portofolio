import { useRef } from 'react';
import { Avatar, Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import MemberFallbackAvatar from '../MemberFallbackAvatar.jsx';

// Shared, presentational field block for creating/editing a family member.
// Used by AddRelativeDialog, EditMemberDialog and the admin create-and-link form
// so the "at most two columns + calendar date pickers + optional photo" layout
// lives in exactly one place (DRY).
//
// Dates are stored in `form` as 'YYYY-MM-DD' strings (backend DATEONLY). The
// dayjs <-> string conversion happens ONLY at the DatePicker boundary below.
//
// Props:
//   form           - current field values ({ firstname, lastname, gender, ... }).
//   onChange       - onChange(field, value): updates a single field.
//   withPhoto      - when true, renders the optional photo picker control.
//   photoPreviewUrl- object URL of the picked/cropped photo, if any.
//   onPickPhoto    - onPickPhoto(file): a raw file was chosen (route to crop).
//   onClearPhoto   - clears the currently picked photo.
export default function MemberFields({
  form,
  onChange,
  withPhoto = false,
  photoPreviewUrl = null,
  onPickPhoto,
  onClearPhoto
}) {
  const fileInputRef = useRef(null);

  const handleTextChange = (field) => (event) => onChange(field, event.target.value);

  const handleDateChange = (field) => (value) =>
    onChange(field, value && value.isValid() ? value.format('YYYY-MM-DD') : '');

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file && onPickPhoto) onPickPhoto(file);
    event.target.value = '';
  };

  return (
    <Stack spacing={2}>
      {withPhoto && (
        <Stack direction="row" spacing={2} alignItems="center">
          {photoPreviewUrl ? (
            <Avatar src={photoPreviewUrl} alt="New member photo" sx={{ width: 56, height: 56 }} />
          ) : (
            <Avatar sx={{ width: 56, height: 56, '& > svg': { width: '100%', height: '100%' } }}>
              <MemberFallbackAvatar gender={form.gender} />
            </Avatar>
          )}
          <Button
            variant="text"
            startIcon={<PhotoCameraRoundedIcon />}
            onClick={handlePickPhoto}
          >
            {photoPreviewUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {photoPreviewUrl && (
            <Button variant="text" color="error" onClick={onClearPhoto}>
              Remove
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            aria-hidden="true"
            tabIndex={-1}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0
            }}
          />
        </Stack>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="First name"
          required
          value={form.firstname}
          onChange={handleTextChange('firstname')}
          fullWidth
        />
        <TextField
          label="Last name"
          required
          value={form.lastname}
          onChange={handleTextChange('lastname')}
          fullWidth
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label="Gender"
          required
          value={form.gender}
          onChange={handleTextChange('gender')}
          fullWidth
        >
          <MenuItem value="Male">Male</MenuItem>
          <MenuItem value="Female">Female</MenuItem>
          <MenuItem value="Other">Other</MenuItem>
        </TextField>
        <TextField
          label="Mother's name"
          value={form.mothersname}
          onChange={handleTextChange('mothersname')}
          fullWidth
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <DatePicker
          label="Birthdate"
          value={form.birthdate ? dayjs(form.birthdate) : null}
          onChange={handleDateChange('birthdate')}
          slotProps={{ textField: { fullWidth: true } }}
        />
        <DatePicker
          label="Deathdate"
          value={form.deathdate ? dayjs(form.deathdate) : null}
          onChange={handleDateChange('deathdate')}
          slotProps={{ textField: { fullWidth: true } }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Email" value={form.email} onChange={handleTextChange('email')} fullWidth />
        <TextField label="Phone" value={form.phone} onChange={handleTextChange('phone')} fullWidth />
      </Stack>

      <Box>
        <TextField label="Address" value={form.address} onChange={handleTextChange('address')} fullWidth />
      </Box>
    </Stack>
  );
}
