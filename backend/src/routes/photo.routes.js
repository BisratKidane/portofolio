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

// Maps the shared auth guards' thrown Errors to HTTP status for this router,
// which has no downstream error-status middleware (WR-01). Returns a sent
// response (truthy) when access is denied, or null when the user may proceed:
//   not logged in           -> 401 (requireAuth throws)
//   logged in but unlinked  -> 403 (requireFamilyAccess throws post-auth)
function mapAuthFailure(user, res) {
  try {
    requireAuth(user);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
  try {
    requireFamilyAccess(user);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 } // 5 MB (D-04)
});

const photoRouter = express.Router();

photoRouter.post('/family-members/:id/photo', upload.single('photo'), async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req, models);
    // This router has no downstream error-status middleware (unlike Apollo's
    // GraphQL error formatting), so the auth guards' thrown Errors are mapped
    // to HTTP status here directly (WR-01): not-logged-in -> 401,
    // authenticated-but-not-permitted -> 403.
    const denied = mapAuthFailure(user, res);
    if (denied) return denied;

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
    //
    // An UNMANAGED transaction is required here (CR-01): with a managed
    // transaction, sequelize commits only AFTER this callback returns, so any
    // delete-old inside the callback runs pre-commit and orphans the old blob
    // on a commit failure. By owning commit() explicitly, the `commit` handed
    // to finalizePhotoReplacement is a genuine durable commit, so delete-old
    // provably runs only after the row is persisted.
    const t = await sequelize.transaction();
    try {
      const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
      if (!target) {
        await t.rollback();
        return res.status(404).json({ error: 'Family member not found.' });
      }

      await finalizePhotoReplacement({
        buffer: req.file.buffer,
        ext: detected.ext,
        previousFilename: target.profilePicture,
        commit: async (newFilename) => {
          await target.update({ profilePicture: newFilename }, { transaction: t });
          await t.commit();
        }
      });

      return res.status(200).json({ photoUrl: `/api/family-members/${targetId}/photo` });
    } catch (err) {
      // finalizePhotoReplacement already discarded the new blob on commit
      // failure. Roll back only if the transaction has not already settled
      // (a failed commit leaves it finished).
      if (!t.finished) await t.rollback().catch(() => {});
      throw err;
    }
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
    const denied = mapAuthFailure(user, res); // WR-01: 401/403, not a 500
    if (denied) return denied;

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
      // Null the DB column BEFORE unlinking the file (WR-02): if the column
      // write fails, the file stays and the DB still references it (GET keeps
      // working) rather than leaving a dangling reference to a deleted file.
      const previousFilename = target.profilePicture;
      await target.update({ profilePicture: null });
      await deletePhotoFile(previousFilename);
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
