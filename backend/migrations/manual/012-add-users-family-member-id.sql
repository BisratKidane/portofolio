-- Manual, one-time migration (Phase 13 / ACC-05).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the users.familyMemberId column to exist.
--
-- The column is nullable with NO backfill: every pre-existing user row is
-- legitimately unlinked/pending until an admin links it to a family member
-- (D-07) -- there is no safe default to backfill, unlike emailVerified's
-- single-ADMIN backfill in 011.
--
-- The UNIQUE constraint enforces the one-member-per-user invariant (D-07:
-- a family member may be linked to at most one user account), and
-- ON DELETE SET NULL automatically re-pends a user (nulls their
-- familyMemberId, dropping them back to the pending gate) if their linked
-- family_members row is ever deleted -- mirroring the onDelete: 'SET NULL'
-- convention already used for motherId/fatherId in models/index.js.

ALTER TABLE users ADD COLUMN familyMemberId INT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE users ADD CONSTRAINT users_familyMemberId_unique UNIQUE (familyMemberId);
ALTER TABLE users ADD CONSTRAINT users_familyMemberId_fk FOREIGN KEY (familyMemberId) REFERENCES family_members(id) ON DELETE SET NULL ON UPDATE CASCADE;
