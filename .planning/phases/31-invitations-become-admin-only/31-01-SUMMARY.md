---
phase: 31-invitations-become-admin-only
plan: 01
subsystem: auth
tags: [graphql, apollo, sequelize, authorization, tdd]

# Dependency graph
requires:
  - phase: 30-approval-moves-to-the-account
    provides: "approveUser/rejectUser resolvers (approval.resolver.js) and the registeredUserId FK/relationship this plan's narrowed query filters against"
provides:
  - "createInvitation and myInvitations refuse a linked, Active, non-admin member server-side (requireAdmin), not merely hidden in the UI"
  - "pendingRegistrations excludes registrants who are unverified or already Active, while still surfacing orphaned invitations with no account to act on"
affects: [31-02, 31-03, invitations, approvals, admin-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireAdmin(user) as the literal first statement of a resolver body (guard-clause pattern, no middleware)"
    - "Two-step query (findAll then findAll) instead of a Sequelize include-with-where, for filtering a parent collection by a related model's live state"

key-files:
  created: []
  modified:
    - backend/src/resolvers/invitation.resolver.js
    - backend/src/resolvers/createInvitation.test.js
    - backend/src/resolvers/approveReject.test.js

key-decisions:
  - "D-01/D-02: swapped requireFamilyAccess for requireAdmin verbatim in createInvitation and myInvitations; requireFamilyAccess remains exported/used elsewhere (familyMember.resolver.js, user.resolver.js, photo.routes.js) so it was not removed from auth.js"
  - "D-09: pendingRegistrations rewritten as a two-step query (Invitation.findAll then User.findAll on collected registeredUserId values) rather than a Sequelize include-with-where, since no precedent for that shape exists anywhere in this backend"
  - "D-10: orphaned invitations (registeredUserId == null) always pass the filter since there is no account to check eligibility against"
  - "D-08: the rewrite reads Invitation.status but never writes it -- confirmed via acceptance-criteria grep"
  - "'invitations (all) requires admin and resolves the inviter' test: split into two distinct actors (an ADMIN who seeds the invitation, a separate non-admin who exercises the pre-existing denial path) since the prior single-actor pattern could no longer both create an invitation (now admin-only) and be denied by the query in one variable"

patterns-established: []

requirements-completed: [INVITE-01]

# Metrics
duration: 25min
completed: 2026-08-28
---

# Phase 31 Plan 01: Admin-Only Invitation Guards & Narrowed Approval Queue Summary

**`createInvitation`/`myInvitations` now refuse non-admins via `requireAdmin` (server-side, not UI-hidden), and `pendingRegistrations` excludes unverified/already-Active registrants via a two-step query while still surfacing orphaned rows.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-28T16:16:00+02:00 (approx)
- **Completed:** 2026-08-28T16:28:47+02:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `createInvitation` and `myInvitations` both call `requireAdmin(user)` as their first statement; the adversarial F-01 test (a linked, Active, non-admin `activeMember()`) proves the guard is enforced at the resolver layer, not just hidden nav.
- `pendingRegistrations` narrowed to a two-step query: it excludes registrants whose email is unverified or who are already `Active`, while an orphaned invitation (no `registeredUserId`) remains reachable so an admin isn't left with an untraceable gap.
- Zero remaining calls to `requireFamilyAccess` in `invitation.resolver.js`; the import was dropped from that file (the function itself stays exported and used by other resolvers/routes).

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs):

1. **Task 1: admin-only guard on createInvitation/myInvitations**
   - `98754b0` test(31-01): add failing test for admin-only createInvitation/myInvitations
   - `0270072` feat(31-01): make createInvitation and myInvitations admin-only
2. **Task 2: narrow pendingRegistrations**
   - `e978072` test(31-01): add failing tests for narrowed pendingRegistrations filter
   - `028f298` feat(31-01): narrow pendingRegistrations to still-eligible registrants

_Note: both tasks followed the red-green TDD gate — each RED commit's test run confirmed the expected failures before the corresponding GREEN commit landed._

## Files Created/Modified
- `backend/src/resolvers/invitation.resolver.js` - `requireAdmin` swap on `myInvitations`/`createInvitation`; `pendingRegistrations` rewritten as a two-step Invitation→User query; `requireFamilyAccess` dropped from the import line
- `backend/src/resolvers/createInvitation.test.js` - new F-01/SC-1 adversarial test, new D-02 `myInvitations`-denial test, updated actors on 4 existing tests (admin instead of activeMember where the actor now needs to create an invitation)
- `backend/src/resolvers/approveReject.test.js` - 3 new tests in the `pendingRegistrations query` describe block (excludes unverified, excludes already-Active, keeps orphaned)

## Decisions Made
- Kept `requireFamilyAccess` exported in `auth.js` (still used by `familyMember.resolver.js`, `user.resolver.js`, `photo.routes.js`) — only its import/call in `invitation.resolver.js` was removed, per the plan's explicit scope.
- For the `'invitations (all) requires admin and resolves the inviter'` test, split the single `member` actor into two: an ADMIN (`admin`, name `'Ada'`) that seeds the invitation via `createInvitation` (now admin-gated), and a separate non-admin (`activeMember()`) that exercises the pre-existing `invitations`-query denial. A single actor could no longer serve both roles once `createInvitation` became admin-only.
- Two-step query chosen for `pendingRegistrations` over a Sequelize `include`-with-`where`, matching PATTERNS.md's finding that no precedent for the include shape exists anywhere in this backend, and mirroring `approval.resolver.js`'s existing `registeredUserId` standalone-lookup idiom.

## Deviations from Plan

None — plan executed exactly as written. The two-actor split in the `invitations` test and the exact new-test naming were within "Claude's Discretion" per the plan's behavior spec, not deviations from stated acceptance criteria.

## Issues Encountered
- The shared MySQL test database (`portofolio_test`) is used concurrently by sibling worktree agents executing other plans in this phase (31-02, 31-03). Several `npm test` invocations hit transient `SequelizeDatabaseError: Table '...' doesn't exist` / `SequelizeUnknownConstraintError` failures caused by a concurrent `vitest` process's `globalSetup`/`teardown` (`sequelize.sync({ force: true })` / `sequelize.drop()`) racing against this run's own. Resolved by checking `ps aux | grep vitest` before each retry and re-running once no concurrent test process was active — not a code defect, no code changes made in response.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `invitation.resolver.js`'s query-side narrowing (this plan) is ready for Plan 31-03 to safely delete `ApprovalsPage`'s now-unreachable disabled-row UI branch, since the query itself no longer returns those rows.
- Plan 31-02 (frontend route/nav admin-gating) and the `verifyEmail` Pending→Active promotion (also 31-02 per CONTEXT.md's D-04/D-05/D-07) are unaffected by and independent of this plan's backend guard/query changes — both operate on disjoint files.
- No blockers.

---
*Phase: 31-invitations-become-admin-only*
*Completed: 2026-08-28*

## Self-Check: PASSED

All created/modified files verified present; all 5 commits (98754b0, 0270072, e978072, 028f298, e7f53c7) verified present in git log.
