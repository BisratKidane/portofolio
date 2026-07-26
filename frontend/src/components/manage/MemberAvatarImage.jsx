import { useEffect, useRef, useState } from 'react';
import { Avatar, Skeleton } from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import { colors } from '../../theme.js';
import { fetchMemberPhotoBlob } from '../../api/photoClient.js';

export default function MemberAvatarImage({ member, size = 42 }) {
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
      <Avatar alt={member.fullname} sx={{ width: size, height: size, bgcolor: '#eef1f8', color: colors.slate }}>
        <PersonRoundedIcon aria-hidden="true" />
      </Avatar>
    );
  }

  if (fetching) {
    return <Skeleton variant="circular" width={size} height={size} />;
  }

  if (objectUrl) {
    return <Avatar src={objectUrl} alt={member.fullname} sx={{ width: size, height: size }} />;
  }

  return (
    <Avatar alt={member.fullname} sx={{ width: size, height: size, bgcolor: '#eef1f8', color: colors.slate }}>
      <PersonRoundedIcon aria-hidden="true" />
    </Avatar>
  );
}
