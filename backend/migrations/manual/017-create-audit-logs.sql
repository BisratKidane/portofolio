-- Manual, one-time migration (Invitation milestone, Phase 1).
--
-- Creates the append-only audit_logs table for invitation lifecycle events
-- (invitation.create / register / approve / reject). Rows are immutable, so
-- there is no updatedAt column. All actor/target FKs SET NULL on delete so the
-- audit trail survives user/invitation removal.

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  action VARCHAR(255) NOT NULL,
  actorUserId INT UNSIGNED NULL DEFAULT NULL,
  invitationId INT UNSIGNED NULL DEFAULT NULL,
  targetUserId INT UNSIGNED NULL DEFAULT NULL,
  metadata JSON NULL DEFAULT NULL,
  createdAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_action (action),
  CONSTRAINT fk_audit_actor
    FOREIGN KEY (actorUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_audit_invitation
    FOREIGN KEY (invitationId) REFERENCES invitations (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_audit_target
    FOREIGN KEY (targetUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
