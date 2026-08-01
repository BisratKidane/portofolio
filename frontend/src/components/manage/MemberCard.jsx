import { useRef } from 'react';
import { Box, Button, ButtonBase, Chip, Stack, Typography } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { colors } from '../../theme.js';
import { getGeezDisplay } from '../../utils/displayName.js';
import MemberAvatarImage from './MemberAvatarImage.jsx';

// T-15-04 (mitigate): this lock condition is copied verbatim from
// familyMember.resolver.js's editMember check --
// `target.linkedUser && target.linkedUser.id !== user.id` -- using the
// ACTING USER's id (never a FamilyMember id). A component test pins this
// exact comparison so a future refactor cannot silently swap in the wrong
// id. The server's own editMember check remains the actual enforcement
// regardless of what this component renders.
export default function MemberCard({
  member,
  isAdmin,
  actingUserId,
  isSelf,
  isDerived,
  onEdit,
  onDelete,
  onPickPhoto,
  onRemovePhoto
}) {
  const locked = !isAdmin && !isSelf && member.linkedUser && member.linkedUser.id !== actingUserId;
  const geez = getGeezDisplay(member);
  const fileInputRef = useRef(null);

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file && onPickPhoto) onPickPhoto(member, file);
    event.target.value = '';
  };

  const avatarLabel = member.photoUrl
    ? `Change photo for ${member.fullname}`
    : `Add a photo for ${member.fullname}`;

  return (
    <Stack direction="row" alignItems="center" spacing={2}>
      {locked ? (
        <MemberAvatarImage member={member} />
      ) : (
        <>
          {/* T-16-17 (accept): this avatar-click gating is a UX affordance only --
              the server-side computeEditableScope check on the upload/delete photo
              routes is the actual enforcement, matching the Edit/Remove buttons
              below which rely on the same server-side backstop. */}
          <ButtonBase
            aria-label={avatarLabel}
            onClick={handlePickPhoto}
            sx={{
              minWidth: 44,
              minHeight: 44,
              borderRadius: '50%',
              position: 'relative',
              '&:hover .member-card-camera-overlay, &.Mui-focusVisible .member-card-camera-overlay': {
                opacity: 1
              },
              '&.Mui-focusVisible': { outline: `2px solid ${colors.primary}`, outlineOffset: '2px' }
            }}
          >
            <MemberAvatarImage member={member} />
            <Box
              className="member-card-camera-overlay"
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(99,102,241,0.55)',
                opacity: 0,
                transition: 'opacity 0.15s ease',
                pointerEvents: 'none'
              }}
            >
              <PhotoCameraRoundedIcon sx={{ fontSize: 20, color: '#fff' }} aria-hidden="true" />
            </Box>
          </ButtonBase>
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
        </>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontWeight: 600 }} noWrap>
            {member.fullname}
          </Typography>
          {isDerived && (
            <Chip label="Derived" size="small" sx={{ bgcolor: colors.gradientSoft, color: colors.primaryDark }} />
          )}
        </Stack>
        {geez && (
          <Typography sx={{ fontSize: 16, fontWeight: 400, color: colors.secondary }} lang={geez.lang} noWrap>
            {geez.text}
          </Typography>
        )}
        {locked && (
          <Typography variant="body2" color="text.secondary">
            Manages their own profile.
          </Typography>
        )}
      </Box>
      {/* No relink-edge action is rendered here -- no backing mutation exists
          this phase (T-15-05, mitigate). Do not fabricate one. */}
      {!locked && member.photoUrl && (
        <Button variant="text" onClick={() => onRemovePhoto && onRemovePhoto(member)}>
          Remove photo
        </Button>
      )}
      {!locked && (
        <Button variant="text" onClick={() => onEdit(member)}>
          Edit
        </Button>
      )}
      {isAdmin && (
        <Button variant="text" color="error" onClick={() => onDelete(member)}>
          Remove
        </Button>
      )}
    </Stack>
  );
}
