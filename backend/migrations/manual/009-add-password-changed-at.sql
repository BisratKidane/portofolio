-- Manual, one-time migration (Phase 9 / SESS-01).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have this statement run by hand, once, before booting a backend
-- that expects the passwordChangedAt column to exist.
--
-- The column is nullable with NO backfill and NO default value: existing
-- rows get NULL, which means no pre-existing user's current session is
-- force-evicted at deploy time. A user's passwordChangedAt is only set the
-- next time they actually change their password (see the User model's
-- beforeUpdate hook).
--
-- DATETIME(3) (millisecond precision) is used instead of plain DATETIME
-- (whole-second precision) so MySQL never rounds a fractional-second write
-- up into the next whole second, which would otherwise let a token issued
-- in the same second as a password change race the revocation check.

ALTER TABLE users ADD COLUMN passwordChangedAt DATETIME(3) NULL DEFAULT NULL;
