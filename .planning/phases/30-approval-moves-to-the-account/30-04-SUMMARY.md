---
phase: 30-approval-moves-to-the-account
plan: 04
subsystem: frontend
tags: [react, mui, graphql, approvals, ui-guard]

# Dependency graph
requires:
  - "30-02: approveUser(userId)/rejectUser(userId, reason) account-addressed GraphQL mutations"
provides:
  - "ApprovalsPage.jsx calling approveUser/rejectUser addressed by row.registeredUser.id (the account id), not row.id (the invitation id) (D-10)"
  - "D-11: a queue row whose registrant has not verified their email renders Approve/Reject disabled with an explanatory tooltip, so no admin click can hit the D-08/D-09 server refusal blind"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MUI Tooltip-wraps-disabled-control idiom (span wrapper required so Tooltip still fires on a disabled Button), copied from AdminMemberTable.jsx:142-150"

key-files:
  created: []
  modified:
    - frontend/src/pages/ApprovalsPage.jsx
    - frontend/src/pages/ApprovalsPage.test.jsx

key-decisions:
  - "busyId/rejectTarget UI-bookkeeping state stays keyed on row.id (the invitation id), unchanged -- only the graphqlRequest mutation variables switch to row.registeredUser.id, matching D-10's instruction not to touch UI-internal state keys"
  - "The existing 'Email unverified' Chip is left untouched as the row-level label; the new Tooltip only explains why the buttons are inert -- both driven by the same `unverified` condition"

requirements-completed: [APPR-01, INVITE-04]

# Metrics
duration: ~15min
completed: 2026-08-28
---

# Phase 30 Plan 04: Approval Moves to the Account (ApprovalsPage Rewire) Summary

**Rewired `ApprovalsPage.jsx`'s Approve/Reject actions to call the new account-addressed `approveUser`/`rejectUser` mutations by `row.registeredUser.id`, and added the D-11 disabled/waiting-for-verification state so an admin can never click a button the server is guaranteed to refuse.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-28
- **Tasks:** 2 (both `type="auto"`, `tdd="true"`)
- **Files modified:** 2 (`ApprovalsPage.jsx`, `ApprovalsPage.test.jsx`)

## Accomplishments

- `APPROVE`/`REJECT` mutation string constants changed from `approveInvitation(invitationId: $id)`/`rejectInvitation(invitationId: $id, reason: $reason)` to `approveUser(userId: $id)`/`rejectUser(userId: $id, reason: $reason)`.
- `handleApprove` and `submitReject` now call `graphqlRequest` with `{ id: row.registeredUser.id, ... }` (the account id, `'9'` in the test fixture) instead of `{ id: row.id, ... }` (the invitation id, `'5'`) — the exact D-10 cutover, proven by fixture values that cannot pass coincidentally.
- `busyId`/`rejectTarget` UI-bookkeeping state and the `disabled={busyId === row.id}` checks were left keyed on `row.id` unchanged, per the plan's explicit instruction — D-10 only changes mutation variables, not the component's internal UI keys.
- D-11: added `const unverified = row.registeredUser && !row.registeredUser.emailVerified;` (same condition the pre-existing "Email unverified" `Chip` already checked) and wrapped both the Approve and Reject `Button`s in `<Tooltip><span>...</span></Tooltip>`, extending each `disabled` prop to `busyId === row.id || unverified`. The `<span>` wrapper follows the MUI Tooltip-wraps-disabled-control idiom already established in `AdminMemberTable.jsx`.
- The pre-existing "Email unverified" `Chip` was left completely unchanged — it remains the row-level label; the new `Tooltip` only explains why the buttons are inert.
- `ApprovalsPage.test.jsx`: updated the two mocked resolved values and both `toHaveBeenCalledWith` assertions from `approveInvitation`/`rejectInvitation` + `{ id: '5' }` to `approveUser`/`rejectUser` + `{ id: '9' }`; added a `UNVERIFIED_ROW` fixture (`{ ...ROW, registeredUser: { ...ROW.registeredUser, emailVerified: false } }`) and a new test asserting both Approve and Reject render `.toBeDisabled()` for that row.
- Confirmed `InvitationsPage.test.jsx` is unaffected (it mocks `graphqlRequest` by query substring only, never asserts on the removed mutation literal strings) — RESEARCH.md Assumptions Log A2 holds.
- Full frontend suite: 42 test files, 439 tests, all green after both tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire mutation strings and call sites to the account-based mutations** - `87da995` (feat)
2. **Task 2: Add the D-11 disabled/waiting state for unverified rows** - `ff0222b` (feat)

**Plan metadata:** _(SUMMARY.md only — STATE.md/ROADMAP.md are owned by the orchestrator for this wave)_

## Files Created/Modified

- `frontend/src/pages/ApprovalsPage.jsx` - `APPROVE`/`REJECT` mutations retargeted to `approveUser`/`rejectUser`; call sites pass `row.registeredUser.id`; `Tooltip` added to the `@mui/material` import list; `unverified` computed per-row and used to disable both action `Button`s with an explanatory tooltip
- `frontend/src/pages/ApprovalsPage.test.jsx` - fixtures/assertions retargeted to `approveUser`/`rejectUser` + `{ id: '9' }`; `UNVERIFIED_ROW` fixture and disabled-state test added

## Decisions Made

- Kept `busyId`/`rejectTarget` state keyed on `row.id` (the invitation id) exactly as instructed — only the `graphqlRequest` mutation variables changed to `row.registeredUser.id`. Conflating these two ids would have been an easy mistake since both now flow through the same component; keeping them distinct matches the plan's explicit guidance and preserves existing UI behavior (per-row busy state, dialog targeting) untouched.
- Applied the `Tooltip`+`<span>`-wrapped-`Button` idiom verbatim from `AdminMemberTable.jsx`, rather than inventing a new disabled-state pattern, per the plan's guidance that this is standard MUI usage already established in this codebase's admin surfaces.

## Deviations from Plan

### Auto-fixed Issues

None — both tasks implemented exactly as the plan's `<action>` blocks specified.

### Documentation-only note (not a functional deviation)

**1. Task 2's literal acceptance-criteria grep `grep -c "import.*Tooltip" frontend/src/pages/ApprovalsPage.jsx` returns `0`, not the expected `1`.**
- **Cause:** The plan's grep assumes a single-line import statement. This codebase's established convention (verified identical in `frontend/src/components/manage/AdminMemberTable.jsx:2-14`) is a multi-line destructured `import { ... } from '@mui/material'` block with one named import per line — `Tooltip` is correctly present on its own line inside that block, but `import` and `Tooltip` never co-occur on the same physical line, so a single-line grep can't match it.
- **Verification performed instead:** `node -e "...match(/import \{[^}]*Tooltip[^}]*\} from '@mui\/material'/)"` confirms the multi-line import block does contain `Tooltip`, and all 5 `ApprovalsPage.test.jsx` tests (including the new disabled-state test, which exercises the rendered `Tooltip`-wrapped `Button`s directly) pass.
- **No code change made** — following the codebase's established multi-line import convention over satisfying a single-line grep is the correct choice; the substantive requirement (Tooltip imported and used) is met and proven by the passing tests.
- **Files affected:** none (verification-only finding).

## Known Test Breakage (not this plan's concern)

`backend/src/resolvers/approveReject.test.js` currently fails (5 failures, per the `<shared_database_constraint>` note) because Wave 2 (Plan 30-02) deleted the `approveInvitation`/`rejectInvitation` mutations it calls. This is expected and is Plan 30-03's job — not run or touched by this plan, and not a regression caused by this plan's frontend-only changes.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The live admin UI (`ApprovalsPage.jsx`) now calls the real `approveUser`/`rejectUser` mutations addressed by account id, matching Plan 30-02's backend contract exactly — the UI/backend mismatch flagged in `30-02-SUMMARY.md`'s "Also not yet rewired" note is now resolved.
- D-11's disabled/waiting-for-verification state means an admin browsing `/approvals` can no longer trigger the D-08/D-09 server-side "not verified" error via a UI click — the tooltip explains the wait state instead.
- `pendingRegistrations`'s query shape is completely unchanged (INVITE-04) — no backend or query-shape follow-up needed from this plan.
- Phase 33's real account-shaped approval queue (APPR-02) can build on this rewired mutation-call surface without further frontend cutover work.

---
*Phase: 30-approval-moves-to-the-account*
*Completed: 2026-08-28*

## Self-Check: PASSED

- FOUND: `frontend/src/pages/ApprovalsPage.jsx`
- FOUND: `frontend/src/pages/ApprovalsPage.test.jsx`
- FOUND: commit `87da995`
- FOUND: commit `ff0222b`
