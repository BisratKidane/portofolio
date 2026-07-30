---
phase: 13-membership-gating-account-linking
plan: 04
subsystem: frontend-admin
tags: [react, mui, autocomplete, graphql, component-test]

# Dependency graph
requires:
  - phase: 13-02
    provides: "linkUserToMember mutation, unlinkedUsers query, familyMembers query (all admin-guarded)"
  - phase: 13-03
    provides: "SPA membership gate + ProtectedRoute allowedRoles pattern reused for the admin-only route"
provides:
  - "The usable admin linking screen ACC-02 requires: list unlinked accounts, pick-existing OR create-and-link a bare member, all wired to the Plan 13-02 mutation"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First MUI Autocomplete usage in the frontend — entity picker (family member) populated from a fetched list, no free-text creation"
    - "Per-row local state (mode/selectedMember/form/submitting/error) inside a row subcomponent, so one row's submit/error never blocks or hides sibling rows"

key-files:
  created:
    - frontend/src/pages/AdminLinkMembers.jsx
    - frontend/src/pages/AdminLinkMembers.test.jsx
  modified:
    - frontend/src/App.jsx

key-decisions:
  - "AdminLinkMembers.jsx fetches unlinkedUsers + familyMembers via Promise.all in a single page-level useEffect (page-level pageLoading/pageError), while each row owns its own submit/error/mode state — matching the plan's explicit requirement that one row's rejected mutation never hides or blocks the rest of the list."
  - "Task 1 (page implementation) was NOT run through a dedicated red-first TDD cycle, per the plan's explicit instruction that the behavior is exercised by Task 2's component tests instead; Task 2 wrote tests against the already-built page and all 5 passed on first run, consistent with that plan design (not a TDD violation — the plan explicitly opted out of red-first for this task pair)."
  - "linkUserToMember variables always send memberId: undefined when creating (and newMember: undefined when picking) rather than omitting the key, matching Jest/Vitest's toEqual-style undefined-property equivalence and keeping both code paths structurally identical."

requirements-completed: [ACC-02, ACC-03]

# Metrics
duration: ~12min
completed: 2026-07-21
---

# Phase 13 Plan 04: Admin Linking UI (AdminLinkMembers) Summary

**The minimal, admin-only `/admin/link-members` screen ACC-02 requires: an admin sees every unlinked account and links each to an existing family member (MUI Autocomplete picker) or creates a bare member and links in one step, backed by the Plan 13-02 `linkUserToMember` mutation.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-21T23:39:23+02:00
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `AdminLinkMembers.jsx` shipped: fetches `unlinkedUsers`/`familyMembers` on mount, renders each unlinked account as a row with a pick-existing (`Autocomplete`) path and a create-and-link (bare-member form: `firstname`/`lastname`/`gender` required, `email`/`phone`/`address`/`birthdate`/`deathdate`/`mothersname` optional) path, both calling `linkUserToMember` and removing the row from the list on success.
- Per-row submit/error/loading state means a rejected mutation on one row surfaces an `Alert` on that row only — the rest of the list stays interactive.
- Empty-state message ("No accounts are waiting to be linked.") renders when the fetched list is empty.
- `/admin/link-members` registered in `App.jsx` behind `<ProtectedRoute allowedRoles={['ADMIN']} />`, reusing the existing role-gate mechanism from Plan 13-03/pre-existing `ProtectedRoute.jsx` unchanged.
- 5 component tests added (`AdminLinkMembers.test.jsx`): list render, pick-existing link + row removal, create-and-link + row removal, rejected-mutation per-row error (row NOT removed), and empty-state message.
- Full frontend suite green: 34/34 (29 prior + 5 new). Production build (`vite build`) succeeds.

## Task Commits

1. **Task 1: AdminLinkMembers page — unlinked-user list + member picker + create-and-link** - `eb7cf73` (feat)
2. **Task 2: Route wiring (admin-only) + component tests** - `9082440` (test — App.jsx route + 5 passing component tests, full suite green)

## Files Created/Modified

- `frontend/src/pages/AdminLinkMembers.jsx` - admin-only linking screen: page-level fetch (unlinkedUsers + familyMembers), per-row `UnlinkedUserRow` subcomponent with pick/create modes, calls `linkUserToMember`
- `frontend/src/pages/AdminLinkMembers.test.jsx` - 5 component tests covering all behaviors from the plan's `<behavior>` block
- `frontend/src/App.jsx` - imported `AdminLinkMembers`, added `<Route path="admin/link-members">` nested under a new `<ProtectedRoute allowedRoles={['ADMIN']} />` block

## Decisions Made

- Page-level `pageLoading`/`pageError` cover the initial `Promise.all` fetch of both queries; each row owns independent `mode`/`selectedMember`/`form`/`submitting`/`error` state so failures are isolated per-row, per the plan's explicit requirement.
- Task 1's page implementation intentionally skipped a dedicated red-first TDD cycle (per the plan's own note that Task 2's tests exercise the behavior instead); Task 2's 5 tests passed immediately against the already-complete implementation — a deliberate plan design, not a TDD-gate miss.
- Mutation call always supplies both `memberId` and `newMember` keys (one populated, one explicitly `undefined`) rather than branching the call shape, keeping the two submit handlers structurally parallel and easy to diff.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None - both threats named in the plan's threat_model (T-13-10 frontend-gate-is-UX-only, T-13-11 minimal-field-selection on `FAMILY_MEMBERS_QUERY`) were implemented exactly as specified; no new surface introduced beyond what the plan anticipated.

## Next Phase Readiness

- Phase 13 (Membership Gating & Account Linking) is now fully complete: backend guard (13-01), familyMember/linkUserToMember resolvers (13-02), SPA `/pending` gate (13-03), and this admin linking UI (13-04) are all shipped and tested.
- ACC-01 through ACC-05 are all satisfied. Phase 14 (permission-scoping + relationship resolvers) can proceed — `linkUserToMember`'s bare-member creation and this UI's pick/create flow are the exact surfaces Phase 14/15 will extend with relationship wiring.
- No blockers for the next phase.

---
*Phase: 13-membership-gating-account-linking*
*Completed: 2026-07-21*

## Self-Check: PASSED

All created/modified files and commit hashes verified present (AdminLinkMembers.jsx, AdminLinkMembers.test.jsx, App.jsx, and commits eb7cf73, 9082440).
