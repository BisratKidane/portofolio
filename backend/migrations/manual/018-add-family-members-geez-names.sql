-- Manual, one-time migration (Phase 18 / DATA-01, DATA-02).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the family_members geezFirstname/geezLastname/geezMothersname
-- columns to exist.
--
-- The three columns are nullable with NO backfill and no validation beyond
-- the VARCHAR(255) length (D-05): every existing family_members row
-- legitimately has no Ge'ez name until someone enters one, and a member with
-- no Ge'ez name simply renders its Latin name as today.
--
-- Note: `geezFullname` is a Sequelize VIRTUAL getter (derived from
-- geezFirstname + geezLastname), NOT a stored column -- it needs no DDL here.
--
-- Portability: the columns use `CHARACTER SET utf8mb4` with NO explicit
-- COLLATE and NO ENCRYPTION clause. Both tokens break on MariaDB -- MySQL 8's
-- default `utf8mb4_0900_ai_ci` collation does not exist on MariaDB, and the
-- ENCRYPTION= table option is MySQL-8-only (D-03 / Pitfall 3). This bare form
-- was verified to apply cleanly against local MariaDB and is safe to apply to
-- prod MySQL 8.4 unchanged (each engine supplies its own default utf8mb4
-- collation).

ALTER TABLE family_members
  ADD COLUMN geezFirstname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  ADD COLUMN geezLastname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  ADD COLUMN geezMothersname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL;
