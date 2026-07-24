import express from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { models } from '../models/index.js';
import { getUserFromRequest, requireFamilyAccess } from '../utils/auth.js';
import { computeEditableScope } from '../services/familyMember.service.js';
import { generatePhotoFilename, writePhotoFile } from '../services/photoStorage.service.js';

// First non-Apollo route in this codebase (PHOTO-01/PHOTO-03). Reuses the
// exact same auth/scope primitives every Phase 14 mutation uses -- no new
// authz logic invented (T-16-11). Accept/reject is decided exclusively by
// magic-byte sniffing (fileTypeFromBuffer) -- the multipart Content-Type
// header and the client-supplied upload filename are never trusted (T-16-08/T-16-09/D-06).

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 } // 5 MB (D-04)
});

const photoRouter = express.Router();

photoRouter.post('/family-members/:id/photo', upload.single('photo'), async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req, models);
    requireFamilyAccess(user);

    const targetId = Number(req.params.id);
    const isAdmin = user.role === 'ADMIN';

    if (!isAdmin) {
      const scope = await computeEditableScope(user.familyMemberId);
      if (!scope.ids.has(targetId)) {
        return res.status(403).json({ error: 'This member is outside your editable scope.' });
      }
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !ACCEPTED_MIME_TYPES.has(detected.mime)) {
      return res.status(400).json({
        error: "That file isn't a JPEG, PNG or WebP image. Choose a photo in one of those formats."
      });
    }

    // Server-generated filename only -- the multer-parsed upload filename is
    // never read past this point (T-16-08). Replaced in Task 2 with the
    // transaction-safe finalizePhotoReplacement orchestration.
    const filename = generatePhotoFilename(detected.ext);
    await writePhotoFile(req.file.buffer, filename);
    await models.FamilyMember.update({ profilePicture: filename }, { where: { id: targetId } });

    return res.status(200).json({ photoUrl: `/api/family-members/${req.params.id}/photo` });
  } catch (err) {
    return next(err);
  }
});

// Pitfall 2: a MulterError (e.g. file-too-large) is raised by Express
// middleware BEFORE the route handler's own try/catch runs, so it needs its
// own dedicated 4-arg error handler mounted immediately after the route.
function multerErrorHandler(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload rejected: ${err.code}` });
  }
  return next(err);
}

photoRouter.use(multerErrorHandler);

export { photoRouter };
