import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { models, sequelize } from '../models/index.js';
import { getUserFromRequest, requireFamilyAccess, requireAuth } from '../utils/auth.js';
import { computeEditableScope } from '../services/familyMember.service.js';
import { finalizePhotoReplacement, deletePhotoFile, resolvePhotoPath } from '../services/photoStorage.service.js';

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
    // never read past this point (T-16-08). Transaction-safe replace
    // (T-16-12/D-11): write-new -> DB commit -> delete-old, discarding the
    // new file on commit failure -- no photo is ever orphaned.
    const photoUrl = await sequelize.transaction(async (t) => {
      const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
      if (!target) throw new Error('Family member not found.');

      await finalizePhotoReplacement({
        buffer: req.file.buffer,
        ext: detected.ext,
        previousFilename: target.profilePicture,
        commit: (newFilename) => target.update({ profilePicture: newFilename }, { transaction: t })
      });

      return `/api/family-members/${targetId}/photo`;
    });

    return res.status(200).json({ photoUrl });
  } catch (err) {
    return next(err);
  }
});

// Remove (D-11): scope-gated identically to upload -- reuses the exact same
// requireFamilyAccess/computeEditableScope shape, never re-derives authz.
// Idempotent by design: whether or not a photo currently exists, an in-scope
// request always resolves to `{ photoUrl: null }`.
photoRouter.delete('/family-members/:id/photo', async (req, res, next) => {
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

    const target = await models.FamilyMember.findByPk(targetId);
    if (!target) {
      return res.status(404).json({ error: 'Family member not found.' });
    }

    if (target.profilePicture) {
      await deletePhotoFile(target.profilePicture);
      await target.update({ profilePicture: null });
    }

    return res.status(200).json({ photoUrl: null });
  } catch (err) {
    return next(err);
  }
});

// Serve (D-07): deliberately the ONE place in this route module where
// computeEditableScope must NOT appear -- any valid JWT holder can view any
// member's photo, no per-member scope check. Broad by design (T-16-15,
// accepted risk): write paths (upload/remove above) stay scope-gated.
photoRouter.get('/family-members/:id/photo', async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req, models);
    // No downstream error-status middleware exists on this router (unlike
    // Apollo's GraphQL error formatting), so requireAuth's thrown Error is
    // mapped to 401 here directly rather than falling through to next(err)
    // and Express's default 500 handler.
    try {
      requireAuth(user);
    } catch (authErr) {
      return res.status(401).json({ error: authErr.message });
    }

    const target = await models.FamilyMember.findByPk(Number(req.params.id));
    if (!target || !target.profilePicture) {
      return res.status(404).json({ error: 'This member has no photo.' });
    }

    res.type(path.extname(target.profilePicture).slice(1));
    return res.sendFile(resolvePhotoPath(target.profilePicture));
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
