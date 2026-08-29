---
phase: 31-invitations-become-admin-only
plan: 03
subsystem: ui
tags: [react, react-router, mui, vitest, testing-library]

# Dependency graph
requires:
  - phase: 31-invitations-become-admin-only (31-01)
    provides: "requireAdmin server-side guards on createInvitation/myInvitations, and pendingRegistrations narrowed so an unverified registrant never reaches ApprovalsPage (D-09)"
  - phase: 31-invitations-become-admin-only (31-02)
    provides: "verifyEmail auto-promotes an invited Pending registrant to Active inside its transaction, which is what makes VerifyEmail's existing status-based navigate() branch actually reachable for the Active case"
provides:
  - "/invitations, /invite, /approvals routes and the Invitations nav button are ADMIN-only (D-03) -- a non-admin sees neither, redirected to /dashboard by the existing ProtectedRoute guard"
  - "ApprovalsPage no longer renders or checks emailVerified anywhere; the orphaned-account disabled-row branch (WR-01) is preserved untouched"
  - "VerifyEmail's Active-vs-Pending post-verification routing is pinned by an actual test on both branches, closing a pre-existing coverage gap"
affects: [invitations, approvals, admin-nav]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frontend ADMIN-only nav/route gating: one `{user.role === 'ADMIN' && (...)}` wrapper / `allowedRoles={['ADMIN']}` route group reused for a second feature, same shape as the existing /link-accounts gating"

key-files:
  created: []
  modified:
    - frontend/src/App.jsx
    - frontend/src/components/AppLayout.jsx
    - frontend/src/pages/ApprovalsPage.jsx
    - frontend/src/pages/ApprovalsPage.test.jsx
    - frontend/src/pages/VerifyEmail.test.jsx

key-decisions:
  - "D-03: mechanical cut-and-paste of the three invitations/invite/approvals <Route> lines from the unrestricted ProtectedRoute group into the existing allowedRoles={['ADMIN']} group in App.jsx; same wrapper conditional copied onto the Invitations nav button in AppLayout.jsx, matching the pre-existing Link accounts button exactly"
  - "D-10: only the `unverified` half of ApprovalsPage's row computation was removed (blocked is now exactly `orphaned`); the orphaned branch, its blockedReason copy, and the Tooltip/disabled-Button structure were left untouched, preserving the WR-01 regression test unmodified"
  - "Task 2 (tdd=true) is a dead-code + obsolete-test removal, not new-behavior addition, so literal RED-must-fail-first doesn't map cleanly onto it. Adapted: committed the test-only removal first (verified 5/5 green against the still-unmodified component), then the source removal (verified 5/5 green again) -- both commits keep the suite green throughout rather than committing an intentionally broken intermediate state. Correctness of the removal is proven by the acceptance-criteria grep (zero `unverified`/`emailVerified` references) plus the untouched WR-01 test staying green."
  - "Also removed the now-unused `emailVerified` field from ApprovalsPage's PENDING_QUERY and the now-unused `Chip` import -- direct consequence of deleting the branch that was their only consumer, required by the plan's own acceptance criterion ('no reference to emailVerified anywhere in the file'), not a separate deviation"
  - "F-02: VerifyEmail.jsx required zero code changes, exactly as PATTERNS.md predicted -- the existing `navigate(user.status !== 'Active' ? '/pending' : '/dashboard')` branch already does the right thing; only test coverage was added for both the Active and Pending arms"

requirements-completed: [INVITE-02]

# Metrics
duration: 5min
completed: 2026-08-29
---

# Phase 31 Plan 03: /invitations Route ADMIN-Gating & ApprovalsPage Dead-Branch Removal Summary

**Moved `/invitations`+`/invite`+`/approvals` under the existing ADMIN route guard and nav wrapper, deleted ApprovalsPage's now-unreachable "unverified" disabled-row branch while preserving its orphaned-account branch, and closed a pre-existing VerifyEmail test gap for both Active and Pending post-verification routing.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-29T11:36:50Z
- **Completed:** 2026-08-29T11:41:42Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- A non-admin visiting `/invitations`, `/invite`, or `/approvals` is now redirected to `/dashboard` by the pre-existing `ProtectedRoute allowedRoles` guard, and no longer sees an Invitations nav button; an admin's experience is byte-identical to before.
- `ApprovalsPage.jsx` contains zero references to `emailVerified`/`unverified` anywhere in the file (component logic, JSX, and the GraphQL query field selection); the orphaned-account (`fk_invitations_registered_user` `ON DELETE SET NULL`) disabled-row branch and its WR-01 regression test survive completely untouched.
- `VerifyEmail.test.jsx` now has real coverage for both branches of its post-verification `navigate()` call — a mocked `status: 'Active'` response asserting `/dashboard` (the case an invited registrant now actually hits, per Plan 31-02's auto-promotion) and a mocked `status: 'Pending'` response asserting `/pending` — with zero changes to `VerifyEmail.jsx` itself.
- Full frontend suite: 42 test files, 441/441 tests passing.

## Task Commits

1. **Task 1: Move /invitations under the ADMIN route guard and gate the nav button (D-03)** — `b64ab64` (feat)
2. **Task 2: Remove ApprovalsPage's unreachable unverified branch, keep the orphaned branch (D-10)** — `f3b0c3b` (test, obsolete-test removal, verified green), `f34ce1a` (feat, component change, verified green)
3. **Task 3: Pin VerifyEmail's post-activation routing for both Active and Pending statuses (F-02, test-only)** — `b8e510b` (test)

**Plan metadata:** this SUMMARY.md commit (STATE/ROADMAP are handled by the orchestrator after merge, per worktree isolation)

## Files Created/Modified
- `frontend/src/App.jsx` — moved `invitations`/`invite`/`approvals` `<Route>` entries from the unrestricted `<ProtectedRoute />` group into the `<ProtectedRoute allowedRoles={['ADMIN']} />` group, alongside `link-accounts`/`admin/link-members`
- `frontend/src/components/AppLayout.jsx` — wrapped the Invitations nav `<Button>` in `{user.role === 'ADMIN' && (...)}`, matching the Link accounts button's wrapper exactly
- `frontend/src/pages/ApprovalsPage.jsx` — removed the `unverified` computation, the `"Email unverified"` `Chip`, the now-unused `emailVerified` GraphQL field and `Chip` import; `blocked` is now exactly `orphaned`, `blockedReason` lost its `unverified` ternary arm
- `frontend/src/pages/ApprovalsPage.test.jsx` — removed `UNVERIFIED_ROW` and its now-obsolete test; the `ORPHANED_ROW`-based WR-01 test and all other tests are unchanged
- `frontend/src/pages/VerifyEmail.test.jsx` — added two new `it(...)` cases pinning the Active→`/dashboard` and Pending→`/pending` branches

## Decisions Made
See `key-decisions` in frontmatter above — most notably the TDD adaptation for Task 2 (a removal task, not an addition, so each commit was kept green rather than committing an intentionally-broken RED state) and the extra `emailVerified`/`Chip` cleanup required by the plan's own acceptance criteria.

## Deviations from Plan

None beyond the two already captured as key-decisions above (both within the plan's own acceptance criteria / Rule 1 scope, not scope creep):
- Removing the now-dead `emailVerified` GraphQL query field and unused `Chip` import from `ApprovalsPage.jsx` — direct, required consequence of Task 2's own acceptance criterion ("no reference to emailVerified anywhere in the file").
- Task 2's TDD execution order adapted for a removal task (see key-decisions) — the plan's own `<behavior>` block already described this as "Test (REMOVE)" / "Test (KEEP, unchanged)", not a new-feature RED/GREEN pair, so this is an interpretation of an inherently non-standard TDD task shape, not a deviation from stated acceptance criteria.

## Issues Encountered

The worktree was initially based on a stale commit (pre-Wave-1). Fast-forwarded to `e748a629` (the Wave 1 merge commit containing Plans 31-01/31-02) before starting any work, per the plan prompt's explicit instruction. No other issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SC-2 is true: a non-admin sees neither the Invitations nav entry nor a working `/invitations` route (redirected to `/dashboard`); an admin's experience is unchanged.
- SC-4's UI half is true: `ApprovalsPage` no longer renders a state D-09's narrowed query can never produce, while still correctly handling the one dead-account state it can still produce (orphaned).
- SC-3 is now provably true one layer further: the frontend redirects a freshly-promoted Active account to `/dashboard`, not `/pending`, pinned by an actual test rather than inferred from the resolver alone.
- This was the last plan in Phase 31 (wave 2, depends on 31-01/31-02). Phase 31's INVITE-01/02/03 requirements are now fully delivered across all three plans.
- No blockers.

---
*Phase: 31-invitations-become-admin-only*
*Completed: 2026-08-29*
