-- Manual, one-time migration (Phase 16 / PHOTO-02).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have this statement run by hand, once, before booting a backend
-- that expects the family_members.profilePicture column to exist.
--
-- The column is nullable with NO backfill: every existing family_members
-- row legitimately has no photo until someone uploads one (D-10 -- the
-- frontend renders a generic person-icon placeholder for a null/missing
-- profilePicture, matching the pattern already established for
-- users.familyMemberId in 012 -- no safe value to backfill with).
--
-- Simpler than 012: no UNIQUE constraint (many members may lack a photo)
-- and no FOREIGN KEY (the column holds a server-generated storage filename,
-- not a reference to another table).

ALTER TABLE family_members ADD COLUMN profilePicture VARCHAR(255) NULL DEFAULT NULL;
