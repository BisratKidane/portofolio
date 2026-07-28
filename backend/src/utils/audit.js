// Append-only audit trail helper for the invitation lifecycle. Writing an audit
// entry must never break the primary operation, so callers may fire-and-forget
// (with a .catch) or await inside the same transaction — this helper simply
// creates the row and lets the caller decide.
export async function writeAuditLog(
  models,
  { action, actorUserId = null, invitationId = null, targetUserId = null, metadata = null },
  options = {}
) {
  return models.AuditLog.create(
    { action, actorUserId, invitationId, targetUserId, metadata },
    options
  );
}
