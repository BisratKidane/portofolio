import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, Slider, Stack, Typography } from '@mui/material';
import Cropper from 'react-easy-crop';
import { uploadMemberPhoto } from '../../api/photoClient.js';

const CROP_OUTPUT_SIZE = 512;

function cropFileToJpegBlob(imageUrl, croppedAreaPixels) {
  return new Promise((resolve, reject) => {
    if (!croppedAreaPixels) {
      reject(new Error("Couldn't crop that photo. Try again."));
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUTPUT_SIZE;
      canvas.height = CROP_OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        CROP_OUTPUT_SIZE,
        CROP_OUTPUT_SIZE
      );
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Couldn't crop that photo. Try again."));
        },
        'image/jpeg',
        0.9
      );
    };
    image.onerror = () => reject(new Error("Couldn't load that photo. Try again."));
    image.src = imageUrl;
  });
}

// Two modes:
//   upload-now  (default): `member` + `onUploaded` — crops then immediately
//                uploads via uploadMemberPhoto(member.id, blob). Used by
//                MemberCard / edit where the member already exists.
//   deferred    (return-blob): pass `onCropped` — crops to the same 512x512 JPEG
//                blob and hands it back via onCropped(blob) WITHOUT uploading, so
//                create-a-member forms can attach a photo before an id exists.
export default function PhotoCropDialog({ open, file, member, onClose, onUploaded, onCropped }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState(null);
  const croppedAreaPixelsRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setError('');
      croppedAreaPixelsRef.current = null;
    }
  }, [open, file]);

  const handleCropComplete = (_croppedArea, croppedAreaPixels) => {
    croppedAreaPixelsRef.current = croppedAreaPixels;
  };

  const handleCancel = () => {
    setError('');
    onClose();
  };

  const handleClose = () => {
    if (submitting) return;
    handleCancel();
  };

  const deferred = Boolean(onCropped);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const blob = await cropFileToJpegBlob(imageUrl, croppedAreaPixelsRef.current);
      if (deferred) {
        onCropped(blob);
      } else {
        await uploadMemberPhoto(member.id, blob);
        onUploaded();
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Crop photo</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Typography variant="body2" color="text.secondary">
            Drag to reposition, zoom to frame. JPEG, PNG or WebP · max 5 MB.
          </Typography>

          <Box sx={{ position: 'relative', height: { xs: 320, sm: 360 }, bgcolor: '#0f172a' }}>
            {imageUrl && (
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            )}
          </Box>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              Zoom
            </Typography>
            <Slider
              aria-label="Zoom"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(_event, value) => setZoom(value)}
              disabled={submitting}
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button variant="contained" disabled={submitting} onClick={handleSubmit}>
              {submitting ? (deferred ? 'Saving…' : 'Uploading…') : 'Save photo'}
            </Button>
            <Button variant="text" disabled={submitting} onClick={handleCancel}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
