---
phase: 13-membership-gating-account-linking
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - backend/migrations/manual/012-add-users-family-member-id.sql
  - backend/src/models/User.js
  - backend/src/models/index.js
  - backend/src/resolvers/familyMember.resolver.js
  - backend/src/resolvers/index.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/schemas/familyMember.schema.js
  - backend/src/schemas/index.js
  - backend/src/schemas/user.schema.js
  - backend/src/utils/auth.js
  - frontend/src/App.jsx
  - frontend/src/components/ProtectedRoute.jsx
  - frontend/src/context/AuthContext.jsx
  - frontend/src/pages/AdminLinkMembers.jsx
  - frontend/src/pages/Pending.jsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the membership-gating / account-linking implementation with emphasis on the authorization boundary. The core authz design is sound: `linkUserToMember` is admin-gated, `requireFamilyAccess` correctly special-cases ADMIN, family-data resolvers (`familyMember`, `familyMembers`) are server-side gated, and there is no self-linking or privilege-escalation path for regular users. The XOR guard on `memberId`/`newMember`, the `UniqueConstraintError` handling, and the one-member-per-user UNIQUE constraint are all correct.

However, the primary "create a new family member and link" happy path is broken: the frontend submits empty strings for every optional field, and the backend forwards them unsanitized into `FamilyMember.create()`, where `email: ''` fails the model's `isEmail` validator (and blank DATEONLY fields risk failure under MySQL strict mode). This is a BLOCKER for the create-and-link flow. Several correctness/robustness gaps around the linking mutation and the client-only gate are documented below.

## Critical Issues

### CR-01: Create-and-link fails validation for members with blank optional fields

**File:** `frontend/src/pages/AdminLinkMembers.jsx:36-46,76-91` and `backend/src/resolvers/user.resolver.js:222-225`
**Issue:** `EMPTY_FORM` initializes every optional field to the empty string, and `handleCreateAndLink` sends `newMember: form` verbatim. The resolver passes this straight into `models.FamilyMember.create(newMember)` with no sanitization. The `FamilyMember` model declares `email` as `allowNull: true` **with** `validate: { isEmail: true }` (`backend/src/models/FamilyMember.js:30-34`). Sequelize skips validators only when a value is `null`/`undefined`; an empty string is a real value, so `isEmail('')` runs and fails, raising a `ValidationError`. Result: creating a new member with the email field left blank (the common case, since email is not a required field in the UI) always fails. The same class of problem affects `birthdate`/`deathdate`, which are `DATEONLY` columns receiving `''` — under MySQL strict mode this is rejected as an invalid date. The create-and-link path is therefore broken for typical input.
**Fix:** Strip empty optional fields to `null` (or omit them) before creating. Do it server-side so the invariant holds regardless of client, e.g. in `linkUserToMember`:
```js
} else {
  const OPTIONAL = ['mothersname', 'email', 'birthdate', 'deathdate', 'phone', 'address'];
  const sanitized = { ...newMember };
  for (const key of OPTIONAL) {
    if (sanitized[key] === '' || sanitized[key] == null) delete sanitized[key];
  }
  const createdMember = await models.FamilyMember.create(sanitized);
  resolvedMemberId = createdMember.id;
}
```
(Optionally also trim/blank-out empty strings in the frontend before submit for a cleaner request.)

## Warnings

### WR-01: Member creation and user link are not atomic — orphaned FamilyMember rows

**File:** `backend/src/resolvers/user.resolver.js:222-234`
**Issue:** In the `newMember` branch, `FamilyMember.create()` and `targetUser.update({ familyMemberId })` run as two separate statements with no transaction. If the `update` throws (e.g., the DB error surfaced by CR-01, a connection blip, or any non-unique error), the freshly created `family_members` row is left orphaned with no linked user. Retrying then creates a second duplicate member.
**Fix:** Wrap both writes in a single `sequelize.transaction`, passing `{ transaction: t }` to both `create` and `update`, so a failed link rolls back the member creation.

### WR-02: `unlinkedUsers` returns ADMIN and unverified accounts

**File:** `backend/src/resolvers/user.resolver.js:45-48`
**Issue:** The query filters only on `familyMemberId: null`. The bootstrap ADMIN (and any admin) has `familyMemberId = null` because the migration performs no backfill, so admins appear in the "accounts waiting to be linked" list even though `requireFamilyAccess` already bypasses the gate for ADMIN. This is confusing and lets an admin accidentally link themselves to a member (semantically meaningless). Unverified users (who cannot log in) also appear.
**Fix:** Narrow the filter, e.g. `where: { familyMemberId: null, role: 'USER', emailVerified: true }`, so only linkable accounts are surfaced.

### WR-03: `linkUserToMember` does not assert the target user is currently unlinked

**File:** `backend/src/resolvers/user.resolver.js:214-228`
**Issue:** The mutation looks up `targetUser` but never checks whether it already has a `familyMemberId`. Calling it with an already-linked user silently overwrites the existing link (re-pointing the user to a different member and orphaning the previous member's `linkedUser`), with no guard, confirmation, or audit trail. The UI only lists unlinked users, but the mutation is the security boundary and should enforce the invariant itself.
**Fix:** After loading `targetUser`, reject if already linked: `if (targetUser.familyMemberId) throw new Error('This account is already linked to a family member.');` (or require an explicit re-link flag).

### WR-04: Membership gate is enforced client-side only for non-family resolvers

**File:** `frontend/src/components/ProtectedRoute.jsx:17` and `backend/src/resolvers/user.resolver.js:32-40`
**Issue:** The pending redirect (`!user.familyMemberId && role !== 'ADMIN' → /pending`) lives only in the SPA. Server-side, only `familyMember(id)`/`familyMembers` use `requireFamilyAccess`; `dashboard` uses `requireAuth` only. A pending (verified, unlinked) user can still call the `dashboard` query directly and receive a response. No sensitive family data leaks today (the non-admin dashboard returns only a greeting and the caller's own record), but the server does not actually gate "pending" users out of app resolvers — the gate is presentational. Any future resolver added without `requireFamilyAccess` will be reachable by pending users.
**Fix:** Treat `requireFamilyAccess` as the canonical membership gate on every resolver that serves post-linking app data (apply it to `dashboard` if pending users should be blocked there), and keep the client redirect purely as UX. Document that new member-facing resolvers must call `requireFamilyAccess`.

## Info

### IN-01: `familyMembers` list is not refreshed after create-and-link

**File:** `frontend/src/pages/AdminLinkMembers.jsx:205-216,76-91`
**Issue:** After a successful link, only `unlinkedUsers` is updated (`handleLinked`). The `familyMembers` list is never re-fetched, so a member created via "Create & link" won't appear for other rows, and an already-linked member remains selectable in every row's Autocomplete. Attempting to link a second user to it fails server-side with the `UniqueConstraintError` message, so it's a UX rough edge rather than a data problem.
**Fix:** Re-fetch `familyMembers` (or optimistically remove/add) inside `onLinked`, and consider filtering out already-linked members from the options.

### IN-02: Just-linked user stays on `/pending` until reload

**File:** `frontend/src/context/AuthContext.jsx:36-52` and `frontend/src/components/ProtectedRoute.jsx:17`
**Issue:** The gate reads `user.familyMemberId` from cached auth state, which is only refreshed by the `me` query on mount. After an admin links a pending user, that user's live session still holds `familyMemberId: null` and remains bounced to `/pending` until they reload or re-authenticate. The server already accepts their existing JWT once linked, so this is purely a stale-client concern.
**Fix:** Provide a "refresh status" action on the Pending page that re-runs the `me` query and updates context, or poll periodically.

### IN-03: Autocomplete missing `isOptionEqualToValue`

**File:** `frontend/src/pages/AdminLinkMembers.jsx:113-120`
**Issue:** The MUI `Autocomplete` compares options/value by reference. Since `value` is selected directly from `options` it works, but MUI logs a console warning and it will break if options are ever re-fetched (new object identities). 
**Fix:** Add `isOptionEqualToValue={(option, value) => option.id === value.id}`.

---

_Reviewed: 2026-07-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
