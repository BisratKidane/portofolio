---
quick_id: 260727-rvt
slug: dashboard-user-management
status: complete
date: 2026-07-27
---

# Quick Task 260727-rvt: Dashboard user management — Summary

Test-first (TDD) addition of self-service + admin account management to the Dashboard.

## What shipped

### Backend (`8a6cb03`)
- `User.emailVerified` exposed on the GraphQL type; new `input UpdateUserInput { name, email, role }`.
- `updateUser(id, input)` — self-or-admin authorization (editing anyone else needs
  `requireAdmin`); role changes are admin-only and **cannot demote the last verified
  admin**; an email change de-verifies the account, issues a token, and emails a fresh
  verification link; unique-email collisions surface `A user with this email already exists.`
- `changePassword(currentPassword, newPassword)` — self-service; verifies the current
  password, enforces strength, must differ, and **rotates the JWT** (so the session
  survives the `passwordChangedAt` revocation).
- `setUserPassword(userId, newPassword)` — admin-only; no email, no current password;
  the target's sessions are revoked via `passwordChangedAt`.

### Frontend (`45fbfa8`, `9a56fe3`)
- System users list: joined + last-updated timestamps, an **Unverified** chip, and
  per-row **Edit** / **Set password** actions (hidden on the admin's own row — self is
  managed from the hero card so an admin can't silently revoke their own session).
- Hero card: **Edit account** + **Change password** for the signed-in user (admin and
  normal alike). Non-admins still see only their own account (`dashboard.users` is null).
- New dialogs: `EditUserDialog` (name/email, role admin-only, re-verify warning on email
  change), `ChangePasswordDialog` (current+new+confirm), `SetPasswordDialog`.
- `AuthContext.changePassword` persists the rotated token; a self email change signs the
  user out (`onRequireReverify` → `logout`) so they can re-verify.

## Tests
- Backend: `updateUser.test.js`, `changePassword.test.js`, `setUserPassword.test.js` —
  **24 new**, covering self-vs-admin authz, non-admin role block, last-admin demotion
  block (incl. unverified-admin exclusion), email re-verification + mailer + uniqueness,
  wrong current password, strength, token rotation, session revocation.
- Frontend: three dialog specs + Dashboard wiring + AuthContext rotation — **22 new**.
- Full frontend suite green (226). Full backend suite green **except two pre-existing
  MariaDB-only concurrency tests** (`verifyEmail` VERIFY-04 race, `familyMember.dedup`
  TOCTOU) that also fail on `main` locally — CI runs MySQL 8.4 where they pass.

## Notes / decisions
- Editable fields, email→re-verification, self-change requires current password, and
  hero-card placement were confirmed with the user before implementation.
- Non-destructive: no existing runtime behavior changed; only additive schema/mutations
  and UI.

## Not deployed
Work is on branch `dashboard-user-management`. Awaiting the user's review before
merge-to-main + deploy.
