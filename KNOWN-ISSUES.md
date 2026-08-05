# Known Issues

> For the full security/architecture audit, see .planning/codebase/CONCERNS.md.

This document tracks security bugs surfaced by the automated test suite during the backend
integration testing milestone. Each entry is backed by a test that documents the current
behavior. These issues are intentionally **not fixed** in this milestone — remediation is
deferred to a dedicated follow-up (see `.planning/PROJECT.md` Out of Scope, FIX-01).

## Reset-token exposure in `requestPasswordReset` response

- **Location:** `backend/src/resolvers/user.resolver.js:48-61`
- **Expected:** The password reset token is delivered only via a verified email channel, never included in the API response.
- **Actual:** The `requestPasswordReset` mutation returns `resetToken` directly in the `PasswordResetPayload` — any caller who knows a user's email address can retrieve the token and call `resetPassword` to take over that account.
- **Severity:** High
- **Documented by test:** `backend/src/resolvers/resetPassword.test.js` — `requestPasswordReset` suite

## MariaDB-only skip on two concurrency-locking tests

- **Location:** `backend/src/resolvers/verifyEmail.test.js` (VERIFY-04), `backend/src/services/familyMember.dedup.test.js` (REL-06)
- **Expected:** Both tests pass on any supported MySQL-compatible engine.
- **Actual:** Both tests assert `SELECT ... FOR UPDATE` lock-wait interleaving that holds under MySQL 8.4 (CI's engine) but not under local MariaDB, which surfaces a Sequelize optimistic-version "Record has changed since last read" error instead. Both tests auto-detect the engine via `SELECT VERSION()` (`backend/test/dbEngine.js`) and skip themselves, with a visible reason, when running on MariaDB — they still run and pass on CI (MySQL 8.4).
- **Severity:** N/A — not a product defect, a test-infrastructure limitation.
- **Documented by test:** `backend/src/resolvers/verifyEmail.test.js` (VERIFY-04), `backend/src/services/familyMember.dedup.test.js` (REL-06)
