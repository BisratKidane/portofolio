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
