---
quick_id: 260727-rvt
slug: dashboard-user-management
status: in-progress
date: 2026-07-27
---

# Quick Task 260727-rvt: Dashboard user management

## Goal

Add self-service + admin account management to the Dashboard, test-first (TDD):
1. Show more user info in the system users list (last updated + verification state).
2. Edit button → form to edit editable fields (name, email; role admin-only).
3. Change password without an email (user already verified).

Authorization: Admin manages all users; a normal user sees and edits only their
own account (dashboard already returns `users: null` for non-admins).

## Decisions (from user)

- Editable fields: **name, email, role** (role admin-only; block demoting the last verified admin).
- Email change → **re-verification**: set `emailVerified=false`, issue token, send verification link.
- Self password change **requires the current password**. Admin setting another user's password does not.
- Non-admin controls live **on the dashboard hero card**.

## Tasks

### Task 1 — Backend: schema + resolvers (TDD)
- `schemas/user.schema.js`: add `emailVerified: Boolean!` to `User`; add
  `input UpdateUserInput { name, email, role }`; add mutations
  `updateUser(id!, input!): User!`, `changePassword(currentPassword!, newPassword!): AuthPayload!`,
  `setUserPassword(userId!, newPassword!): Boolean!`.
- `resolvers/user.resolver.js`: implement the three mutations per Decisions.
- Tests (write first): `resolvers/updateUser.test.js`, `resolvers/changePassword.test.js`,
  `resolvers/setUserPassword.test.js` — self-vs-admin authz, non-admin can't change role,
  last-admin demotion blocked, email change flips `emailVerified`=false + sends verification +
  uniqueness error, wrong current password rejected, strength, token rotation + session
  revocation via `passwordChangedAt`.
- **verify:** `npm test --workspace backend` green.

### Task 2 — Frontend: dialogs + Dashboard wiring (TDD)
- New `components/dashboard/`: `EditUserDialog.jsx`, `ChangePasswordDialog.jsx`, `SetPasswordDialog.jsx`.
- `Dashboard.jsx`: query adds `updatedAt`, `emailVerified`; users list shows "last updated" +
  "Unverified" chip + Edit / Set-password actions (admin); hero card gets Edit account +
  Change password buttons.
- `context/AuthContext.jsx`: `changePassword(current,new)` that rotates the stored token.
- Tests (write first): one spec per dialog + Dashboard wiring + AuthContext.
- **verify:** `npm test --workspace frontend` green.

## Must-haves
- A normal user cannot edit another account (server-enforced `requireAdmin`).
- Last verified admin cannot be demoted.
- Changing email forces re-verification and emails a link.
- Self password change verifies the current password and keeps the user logged in (rotated token).
- Non-destructive to existing behavior; full backend + frontend suites green.
