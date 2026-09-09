-- Manual, one-time migration (Phase 34 / ADMIN-01 / D-01).
--
-- This is NOT applied automatically by sequelize.sync() on an existing
-- production box. sync() (non-force, run by initializeDatabase() at real
-- backend boot) DOES create missing tables -- so if this migration is
-- forgotten, app_settings still gets created, empty, at next boot. An empty
-- table with no seeded row is exactly the D-02 fail-closed state (public
-- registration reads as CLOSED), so a forgotten migration fails safe rather
-- than crashing -- but it is still meant to be applied deliberately, once,
-- with the seed below, so an operator gets the intended OPEN starting state
-- rather than relying on the accidental-safe default.
--
-- Domain rationale: this is a generic key/value settings table (D-01),
-- chosen over a typed single-row app_config table so a future flag is a row
-- rather than another migration; the accepted cost is that values are
-- strings, so the read path needs a small typed accessor
-- (backend/src/utils/appSettings.js) rather than reading the column
-- directly.
--
-- The primary key column is named settingKey, not key: KEY is a reserved
-- word in the MySQL 8.4 keyword table, and `CREATE TABLE app_settings (key
-- VARCHAR(64) ...)` is a syntax error in hand-written, unquoted SQL.
--
-- updatedById has no foreign key, matching the users.approvedBy precedent
-- (a plain unassociated INTEGER UNSIGNED column) -- this keeps app_settings
-- out of the test suite's resetTables() FOREIGN_KEY_CHECKS dance entirely.
--
-- Portability: VARCHAR / DATETIME / INT UNSIGNED and a bare
-- ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 footer only -- no COLLATE, no CHECK,
-- no generated columns. Migration 018's cross-engine lesson was that an
-- explicit COLLATE clause (MySQL 8's utf8mb4_0900_ai_ci default) breaks on
-- MariaDB; this migration avoids that class of hazard entirely.

CREATE TABLE IF NOT EXISTS app_settings (
  settingKey VARCHAR(64) NOT NULL,
  value VARCHAR(255) NOT NULL,
  updatedAt DATETIME NOT NULL,
  updatedById INT UNSIGNED NULL DEFAULT NULL,
  PRIMARY KEY (settingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent seed: OPEN by default (D-02 seeds open, fails closed). The
-- no-op ON DUPLICATE KEY UPDATE is what guarantees re-running this migration
-- never clobbers a value an admin has deliberately changed since setup.
INSERT INTO app_settings (settingKey, value, updatedAt, updatedById)
  VALUES ('public_registration_enabled', 'true', UTC_TIMESTAMP(), NULL)
  ON DUPLICATE KEY UPDATE settingKey = settingKey;
