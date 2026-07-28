-- Manual, one-time migration (Invitation milestone, Phase 1).
--
-- Creates the invitations table. Only the sha256 HASH of the invite token is
-- stored (tokenHash) -- never the raw token. Column names are camelCase to
-- match the Sequelize model attributes exactly.

CREATE TABLE IF NOT EXISTS invitations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tokenHash VARCHAR(255) NOT NULL,
  inviterId INT UNSIGNED NOT NULL,
  invitedName VARCHAR(255) NULL DEFAULT NULL,
  invitedEmail VARCHAR(255) NOT NULL,
  relationshipToFamily VARCHAR(255) NULL DEFAULT NULL,
  invitationNote TEXT NULL DEFAULT NULL,
  expiresAt DATETIME NOT NULL,
  registeredAt DATETIME NULL DEFAULT NULL,
  registeredUserId INT UNSIGNED NULL DEFAULT NULL,
  approvedAt DATETIME NULL DEFAULT NULL,
  rejectedAt DATETIME NULL DEFAULT NULL,
  approvedBy INT UNSIGNED NULL DEFAULT NULL,
  rejectionReason TEXT NULL DEFAULT NULL,
  status ENUM('Pending', 'Registered', 'Approved', 'Rejected', 'Expired') NOT NULL DEFAULT 'Pending',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invitations_token_hash (tokenHash),
  KEY idx_invitations_status (status),
  KEY idx_invitations_inviter (inviterId),
  CONSTRAINT fk_invitations_inviter
    FOREIGN KEY (inviterId) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_invitations_registered_user
    FOREIGN KEY (registeredUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_invitations_approved_by
    FOREIGN KEY (approvedBy) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
