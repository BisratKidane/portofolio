-- Manual, one-time migration (Phase 32 / REG-03 / D-04).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have this statement run by hand, once, before booting a backend
-- that expects the users.relationshipNote column to exist.
--
-- A self-registrant (Phase 32+) has no invitation row, so the account
-- itself must carry its own free-text note describing how they relate to
-- the family -- the only context an admin has to judge a stranger on
-- (REG-03/D-03). A synthetic Invitation row was explicitly rejected as an
-- alternative: Phase 31 D-05 auto-activates a registrant the moment an
-- Invitation row exists with a registeredUserId set, so writing a
-- synthetic row for someone nobody actually invited would silently
-- auto-activate an unvouched stranger -- exactly the CR-01 defect Phase 31
-- spent two gap-closure rounds fixing.
--
-- No foreign key needed -- relationshipNote is a plain value column, not a
-- reference to another table.
--
-- Portability: VARCHAR(500) has no cross-engine hazard between local
-- MariaDB and prod MySQL 8.4 (unlike 018's utf8mb4-collation pitfall) --
-- this column type applies unchanged to both engines.

ALTER TABLE users
  ADD COLUMN relationshipNote VARCHAR(500) NULL DEFAULT NULL;
