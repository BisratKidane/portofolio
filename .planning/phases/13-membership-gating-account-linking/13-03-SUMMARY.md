---
phase: 13-membership-gating-account-linking
plan: 03
subsystem: frontend-auth
tags: [react-router, mui, auth-context, tdd]

# Dependency graph
requires:
  - phase: 13-02
    provides: "familyMemberId exposed on the User GraphQL type (me query), linkUserToMember mutation, familyMember/familyMembers guarded queries"
provides:
  - "SPA membership gate: ProtectedRoute redirects unlinked, non-admin users to /pending"
  - "/pending static gate screen (D-02 wording), symmetric bounce to /dashboard for linked users/ADMINs, bounce to /login for unauthenticated visitors"
  - "familyMemberId present on ME_QUERY, LOGIN_MUTATION, and VERIFY_EMAIL_MUTATION response payloads, so login/verifyEmail need no follow-up me refetch"
affects: [13-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frontend gate carve-out condition (familyMemberId truthy OR role === 'ADMIN') duplicated identically in ProtectedRoute.jsx and Pending.jsx (inverse directions) per T-13-09 mitigation, each grep-asserted in tests"

key-files:
  created:
    - frontend/src/pages/Pending.jsx
    - frontend/src/pages/Pending.test.jsx
  modified:
    - frontend/src/components/ProtectedRoute.jsx
    - frontend/src/components/ProtectedRoute.test.jsx
    - frontend/src/context/AuthContext.jsx
    - frontend/src/context/AuthContext.test.jsx
    - frontend/src/App.jsx

key-decisions:
  - "ProtectedRoute's pending-gate guard clause is inserted between the !user check and the allowedRoles check, so an unlinked ADMIN or unlinked non-admin's allowedRoles mismatch never masks the pending-gate redirect."
  - "familyMemberId added to all three of ME_QUERY, LOGIN_MUTATION, and VERIFY_EMAIL_MUTATION selection sets (not only ME_QUERY) because authenticate() sets user directly from the login/verifyEmail payload and never re-runs me — this is the exact bug the plan targets (a linked user briefly evaluated as unlinked until a manual refresh)."
  - "Pending.jsx is deliberately static: no useEffect, no polling, no admin-contact link, per D-02 — simpler than the VerifyEmail.jsx analog it borrows AuthShell layout from."
  - "/pending registered as a top-level sibling route in App.jsx (outside the ProtectedRoute-guarded block), since ProtectedRoute would otherwise redirect an authenticated-but-unlinked user away from anything nested under it."

requirements-completed: [ACC-01, ACC-03]

# Metrics
duration: ~12min
completed: 2026-07-21
---

# Phase 13 Plan 03: SPA Membership Gate (/pending) Summary

**ProtectedRoute now redirects any authenticated, non-admin, unlinked user to a static `/pending` screen, and `AuthContext`'s login/verifyEmail/me operations all carry `familyMemberId` so a freshly-linked user is never misrouted there without a page refresh.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-21T21:33:35Z
- **Tasks:** 2 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- `ProtectedRoute.jsx` gained a pending-gate guard clause (`!user.familyMemberId && user.role !== 'ADMIN'` → redirect to `/pending`), TDD'd red-green: 3 new cases (unlinked-redirect, ADMIN carve-out, linked-user unaffected) plus all 4 pre-existing regression cases still green.
- `AuthContext.jsx`'s `ME_QUERY`, `LOGIN_MUTATION`, and `VERIFY_EMAIL_MUTATION` all now select `familyMemberId` on their `me`/`user` field sets — closing the exact bug named in the plan objective: `authenticate()` never re-runs `me` after login/verifyEmail, so without this fix a linked user's `familyMemberId` would be `undefined` until a manual refresh, bouncing them incorrectly to `/pending`.
- `Pending.jsx` shipped as a new static gate screen (D-02 exact wording: "Your account is awaiting an admin to link you to your family member; you'll get access once linked.") with no `useEffect`/polling/admin-contact link — reusing `AuthShell` for visual consistency with the other auth pages.
- `Pending.jsx` implements the symmetric bounce: a linked user or ADMIN visiting `/pending` directly is sent to `/dashboard`; an unauthenticated visitor is sent to `/login`.
- `/pending` registered as a top-level route in `App.jsx`, outside the `ProtectedRoute`-guarded block, so an authenticated-but-unlinked user can actually reach it.
- Full frontend suite green: 29/29 (25 prior + 4 new Pending.test.jsx cases; ProtectedRoute/AuthContext test counts grew in place via extended existing files).

## Task Commits

Each task was committed atomically (TDD tasks split into test/feat commits):

1. **Task 1: Pending-gate redirect in ProtectedRoute + familyMemberId on all three AuthContext operations** - `548b10a` (test: RED — 3 new ProtectedRoute cases + 2 extended AuthContext assertions failing), `badbba2` (feat: GREEN — guard clause + familyMemberId added to all three GraphQL operations, all pass)
2. **Task 2: Pending.jsx static gate screen + /pending route** - `cd10329` (test: RED — Pending.jsx did not exist yet), `8cad066` (feat: GREEN — Pending.jsx + App.jsx route registration, all 4 cases pass, full suite green)

## Files Created/Modified

- `frontend/src/pages/Pending.jsx` - static awaiting-link gate screen; bounces linked/ADMIN users to `/dashboard`, unauthenticated to `/login`
- `frontend/src/pages/Pending.test.jsx` - 4 tests: static message render, linked-user bounce, ADMIN-carve-out bounce, unauthenticated bounce
- `frontend/src/components/ProtectedRoute.jsx` - added the pending-gate guard clause between the `!user` and `allowedRoles` checks
- `frontend/src/components/ProtectedRoute.test.jsx` - added `/pending` sentinel route + 3 new cases; updated the pre-existing no-role-restriction regression fixture to include `familyMemberId: 5` so it isn't itself caught by the new guard
- `frontend/src/context/AuthContext.jsx` - added `familyMemberId` to `ME_QUERY`, `LOGIN_MUTATION`, and `VERIFY_EMAIL_MUTATION` selection sets
- `frontend/src/context/AuthContext.test.jsx` - extended the login and verifyEmail success tests to assert `familyMemberId` is requested and no follow-up `graphqlRequest` call occurs
- `frontend/src/App.jsx` - registered `<Route path="pending" element={<Pending />} />` as a top-level sibling route, outside `ProtectedRoute`

## Decisions Made

- The pending-gate guard clause is placed strictly between the `!user` check and the `allowedRoles` check in `ProtectedRoute`, so the pending redirect always takes priority over an `allowedRoles` mismatch for an unlinked user — a role-restricted route never leaks its `/dashboard` redirect ahead of the pending gate.
- `familyMemberId` was added to all three GraphQL operations (`me`, `login`, `verifyEmail`), not just `me`, per the plan's explicit call-out that `authenticate()` sets `user` directly from the mutation payload with no follow-up `me` refetch — verified via `AuthContext.test.jsx` assertions that `graphqlRequest` is called exactly once per login/verifyEmail flow.
- `Pending.jsx` was kept deliberately minimal (no `useEffect`, no polling, no admin-contact surfacing) per D-02, even though its layout borrows `AuthShell` from the closest structural analog, `VerifyEmail.jsx`.
- `/pending` sits outside the `ProtectedRoute`-guarded route block in `App.jsx` — it needs to be reachable specifically when `ProtectedRoute` would otherwise redirect the user away.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The SPA membership gate (ACC-01's frontend half) and D-02's `/pending` screen are now live; Plan 13-04 (the minimal admin linking UI) can rely on `familyMemberId` already being present on `me`/`login`/`verifyEmail` responses without further `AuthContext` changes.
- No blockers for the next plan in this phase.

---
*Phase: 13-membership-gating-account-linking*
*Completed: 2026-07-21*

## Self-Check: PASSED

All created/modified files and commit hashes verified present (Pending.jsx, Pending.test.jsx, ProtectedRoute.jsx, AuthContext.jsx, App.jsx, and commits 548b10a, badbba2, cd10329, 8cad066).
