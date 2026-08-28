-- Manual, one-time migration (Phase 30 / APPR-01 / D-04).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the users.approvedAt/approvedBy/rejectedAt/rejectionReason
-- columns to exist.
--
-- These four columns mirror invitations' equivalent decision columns
-- (approvedAt/approvedBy/rejectedAt/rejectionReason) because a
-- self-registrant (Phase 32+) has no invitation row -- the account itself
-- must be able to carry its own approval/rejection decision.
--
-- approvedBy is a plain nullable unsigned int with NO foreign-key
-- constraint. This matches the ALTER-TABLE-on-an-existing-table precedent
-- (015, 018 -- both add zero FKs), not invitations.approvedBy's FK, which
-- was added at CREATE TABLE time (016) -- a different situation.
--
-- Portability: DATETIME / INT UNSIGNED / TEXT have no cross-engine hazard
-- the way 018's utf8mb4 collation choice did -- these column types apply
-- unchanged to both local MariaDB and prod MySQL 8.4.

ALTER TABLE users
  ADD COLUMN approvedAt DATETIME NULL DEFAULT NULL,
  ADD COLUMN approvedBy INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN rejectedAt DATETIME NULL DEFAULT NULL,
  ADD COLUMN rejectionReason TEXT NULL DEFAULT NULL;
