-- Manual, one-time migration (Invitation milestone, Phase 1).
--
-- NOT applied by sequelize.sync() -- run by hand once BEFORE booting a backend
-- that expects users.status.
--
-- Adds the account-lifecycle status. Only 'Active' users may authenticate.
-- New registrations start 'Pending' (awaiting admin approval); every EXISTING
-- user is an already-approved account, so they are backfilled to 'Active'.

ALTER TABLE users
  ADD COLUMN status ENUM('Pending', 'Active', 'Rejected', 'Disabled') NOT NULL DEFAULT 'Pending';

-- Backfill: all pre-existing accounts are already active.
UPDATE users SET status = 'Active';
