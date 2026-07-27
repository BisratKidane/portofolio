-- Manual, one-time migration (quick task: member provenance + isAlive).
--
-- NOT applied by sequelize.sync() -- sync() creates tables on brand-new
-- databases but never alters an existing table's columns. Any already-
-- provisioned database (local dev, staging, prod) must run this by hand,
-- once, BEFORE booting a backend that expects these columns to exist.
--
-- Adds:
--   * isAlive          -- living-status boolean that supersedes the deathdate
--                         column. The legacy `deathdate` column is intentionally
--                         KEPT (not dropped) so historical death dates are not
--                         lost; the app no longer reads or writes it.
--   * createdByUserId  -- who added the member (provenance, admin-visible)
--   * updatedByUserId  -- who last edited the member (provenance, admin-visible)
--
-- createdAt/updatedAt already exist (Sequelize timestamps from the initial
-- table creation), so "when added / when changed" needs no new column.
--
-- Backfill: existing rows are assumed living unless they already carry a
-- deathdate (isAlive = deathdate IS NULL). createdByUserId/updatedByUserId are
-- left NULL for pre-existing rows (no safe attribution exists) -- the admin
-- provenance UI renders a "—" placeholder for a null creator/editor.
--
-- FKs use ON DELETE SET NULL so removing a user never cascades into deleting
-- the members they created or edited. users.id is INT UNSIGNED, so the FK
-- columns must match that type exactly.

ALTER TABLE family_members
  ADD COLUMN isAlive TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN createdByUserId INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN updatedByUserId INT UNSIGNED NULL DEFAULT NULL,
  ADD CONSTRAINT fk_family_members_created_by
    FOREIGN KEY (createdByUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_family_members_updated_by
    FOREIGN KEY (updatedByUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill living status from any historical death date.
UPDATE family_members SET isAlive = (deathdate IS NULL);
