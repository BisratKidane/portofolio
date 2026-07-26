import { useEffect, useRef, useState } from 'react';
import { Avatar, Skeleton } from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import { colors } from '../../theme.js';
import { fetchMemberPhotoBlob } from '../../api/photoClient.js';

// `variant` maps to MUI Avatar's shape: 'circular' (default, keeps the /manage
// and detail-panel avatars round) | 'rounded' | 'square'. The /family tree node
// passes 'rounded' so the portrait reads as a picture, not a circular avatar.
// `fill` makes the avatar stretch to 100% of its container (width AND height)
// instead of a fixed `size` box — the photo covers/zooms via MUI Avatar's
// default `object-fit: cover`. The container must have a definite height.
export default function MemberAvatarImage({ member, size = 42, variant = 'circular', fill = false }) {
  const dims = fill ? { width: '100%', height: '100%' } : { width: size, height: size };
  const [fetching, setFetching] = useState(false);
  const [objectUrl, setObjectUrl] = useState(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    const photoUrl = member.photoUrl;

    // Revoke any previously created object URL before starting a new fetch
    // (or skipping the fetch for a now-photo-less member).
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);

    if (!photoUrl) {
      setFetching(false);
      return undefined;
    }

    let cancelled = false;
    setFetching(true);

    fetchMemberPhotoBlob(photoUrl)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setObjectUrl(url);
      })
      .catch(() => {
        // Silent fallback to the placeholder state -- a broken decorative
        // image must never produce a visible error.
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [member.photoUrl]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    },
    []
  );

  if (!member.photoUrl) {
    return (
      <Avatar variant={variant} alt={member.fullname} sx={{ ...dims, bgcolor: '#eef1f8', color: colors.slate }}>
        <PersonRoundedIcon aria-hidden="true" />
      </Avatar>
    );
  }

  if (fetching) {
    return (
      <Skeleton
        variant={variant === 'circular' ? 'circular' : 'rounded'}
        width={fill ? '100%' : size}
        height={fill ? '100%' : size}
      />
    );
  }

  if (objectUrl) {
    return <Avatar variant={variant} src={objectUrl} alt={member.fullname} sx={dims} />;
  }

  return (
    <Avatar variant={variant} alt={member.fullname} sx={{ ...dims, bgcolor: '#eef1f8', color: colors.slate }}>
      <PersonRoundedIcon aria-hidden="true" />
    </Avatar>
  );
}
