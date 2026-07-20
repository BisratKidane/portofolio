-- Manual, one-time migration (Phase 11 / VERIFY-01).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the emailVerified/emailVerificationToken/emailVerificationExpiresAt
-- columns to exist.
--
-- emailVerificationToken and emailVerificationExpiresAt are nullable with NO
-- default value: they are only ever populated for the lifetime of a single
-- pending verification (register / resendVerificationEmail), then cleared on
-- successful verifyEmail. Leaving them NULL for every row that isn't mid-flow
-- has no other effect on existing behavior.
--
-- emailVerified defaults to false for every row EXCEPT the existing ADMIN
-- row, which is explicitly backfilled to true below (D-03). This is a
-- deliberate, narrow scope boundary -- not an oversight: grandfathering only
-- the sole bootstrap ADMIN protects its role and active session across
-- deploy without reopening the single ADMIN slot (D-04/D-06), while every
-- other pre-existing user keeps the false default and must re-verify via
-- resendVerificationEmail before their next login.

ALTER TABLE users ADD COLUMN emailVerified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN emailVerificationToken VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN emailVerificationExpiresAt DATETIME NULL DEFAULT NULL;
UPDATE users SET emailVerified = true WHERE role = 'ADMIN';
