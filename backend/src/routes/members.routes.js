import express from 'express';
import { models } from '../models/index.js';
import { getUserFromRequest, requireFamilyAccess, requireAuth } from '../utils/auth.js';
import * as membersPdfService from '../services/membersPdf.service.js';

// Same 401/403 mapping as photo.routes.js (duplicated on purpose so the photo
// router is untouched): not logged in -> 401, logged in but unlinked -> 403.
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

const membersRouter = express.Router();

membersRouter.get('/members.pdf', async (req, res) => {
  try {
    const user = await getUserFromRequest(req, models);
    // Auth runs before any member read: unauthorized callers never touch member data.
    const denied = mapAuthFailure(user, res);
    if (denied) return denied;

    const members = await models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
    const pdf = await membersPdfService.buildMembersPdf(members);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="members.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(pdf);
  } catch {
    // Generic body only: never echo the underlying error, which may carry member data.
    return res.status(500).json({ error: 'Could not generate the members PDF.' });
  }
});

export { membersRouter };
