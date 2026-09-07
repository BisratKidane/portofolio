---
phase: 33-public-signup-form-approval-queue
plan: 02
subsystem: ui
tags: [react, mui, graphql, vitest, rtl]

# Dependency graph
requires:
  - phase: 32-tokenless-registration
    provides: "pendingApprovals query (flat User rows), approveUser/rejectUser mutations unchanged"
  - phase: 31-invitations-become-admin-only
    provides: "invited registrants auto-activate on verification, so the queue holds only self-registrants"
provides:
  - "ApprovalsPage.jsx restructured onto pendingApprovals with D-07/D-08 vertical card composition (header/note-panel/divider/footer)"
  - "SC-5 mutually-exclusive loading/failed/empty/populated render states"
  - "D-09 locked reject-dialog copy with test coverage"
  - "SEC-03 UI half: relationship note proven to render as literal text, never markup"
  - "InvitationsPage.test.jsx mock retargeted to pendingApprovals so the wave doesn't land red"
  - "Explicit APPR-06 regression test on Pending.jsx"
affects: [33-03-backend-pendingRegistrations-deletion, 33-04-signup-form]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Card-based admin queue: Paper/Stack/Divider/Typography composed inline, no new abstraction (per UI-SPEC's explicit anti-premature-generalization guidance)"

key-files:
  created: []
  modified:
    - frontend/src/pages/ApprovalsPage.jsx
    - frontend/src/pages/ApprovalsPage.test.jsx
    - frontend/src/pages/InvitationsPage.test.jsx
    - frontend/src/pages/Pending.test.jsx

key-decisions:
  - "Followed 33-UI-SPEC.md's card composition and copy verbatim (Paper/Stack/Divider primitives, no new component abstraction)"
  - "Reject dialog escape hatch relabeled 'Cancel' -> 'Keep pending' per D-09, names the state the account stays in"

patterns-established:
  - "SC-5 state-machine fix: check `error` before `rows === null` in the render ternary -- reused as-is from 33-RESEARCH.md's confirmed fix, no new mechanism"

requirements-completed: [APPR-02, APPR-06, REG-03, SEC-03]

# Metrics
duration: ~20min
completed: 2026-09-07
---

# Phase 33 Plan 02: Approval Queue Restructure Summary

**Restructured `ApprovalsPage.jsx` from a horizontal invitation-shaped row to a vertical `pendingApprovals`-backed card (D-07/D-08), fixed the SC-5 loading/failed state-machine bug, and removed the dead orphaned/Tooltip branch — the admin-facing half of Phase 33.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-07T12:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `ApprovalsPage.jsx` now queries `pendingApprovals` (flat `User` rows: `id name email relationshipNote createdAt`) instead of the old invitation-shaped `pendingRegistrations`
- Relationship note always rendered in full (no truncation/clamp/height-cap) with a "No note provided." empty state — proven by test that an HTML-bearing note renders as literal text and creates no DOM element
- Approve/reject now address `row.id` directly, eliminating the `row.registeredUser` indirection and the dead `orphaned`/`blocked`/`Tooltip` branch entirely (D-10)
- Fixed the SC-5 bug: `error` is now checked before `rows === null` in the render ternary, so a failed fetch can never render an infinite spinner stacked under an error banner
- `InvitationsPage.test.jsx`'s mock updated in the same task as the query swap, preventing the wave from landing red
- Added an explicit APPR-06 regression test to `Pending.test.jsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure ApprovalsPage.jsx onto pendingApprovals + fix InvitationsPage.test.jsx's mock + add the APPR-06 regression case** - `4f6b2f3` (feat)
2. **Task 2: Rewrite ApprovalsPage.test.jsx for the flat pendingApprovals shape + SEC-03/SC-5 coverage** - `4ff4349` (test)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified
- `frontend/src/pages/ApprovalsPage.jsx` - Query swap to `pendingApprovals`, vertical card composition (D-07/D-08), SC-5 state-machine fix, D-09 dialog copy, dead orphaned/Tooltip branch removed
- `frontend/src/pages/ApprovalsPage.test.jsx` - Rewritten end to end against the flat `pendingApprovals` shape: card content, empty note, SEC-03 HTML-safety, approve/reject by id, D-09 dialog copy, SC-5 failed-state case; obsolete orphaned-row test deleted
- `frontend/src/pages/InvitationsPage.test.jsx` - Mock's `query.includes('pendingRegistrations')` branch retargeted to `pendingApprovals`
- `frontend/src/pages/Pending.test.jsx` - New explicit APPR-06 regression `it()` (approved, unlinked self-registrant simulated via `{ role: 'USER', familyMemberId: null }`, same as an invited unlinked user — `Pending.jsx` needed no code change)

## Decisions Made
- Followed `33-UI-SPEC.md`'s card composition and copy verbatim — no deviations from the spec's exact MUI primitives, spacing, or wording.
- Kept the queue card inline in `ApprovalsPage.jsx` rather than extracting an `ApprovalCard.jsx` component — UI-SPEC's Component Inventory explicitly left this to planner/executor discretion, and a single call site does not warrant a new abstraction (per 33-RESEARCH.md's "Don't Hand-Roll" guidance).

## Deviations from Plan

None - plan executed exactly as written. The plan's `<interfaces>` block fully specified the query shape, card composition, state truth table, and dialog copy; no ambiguity required a Rule 1-4 deviation.

## Issues Encountered

None. The worktree branch's base commit had drifted to an unrelated prior commit (`52d044e`, a `/detail` card depth pass) instead of the assigned base (`06955ed`); corrected via `git reset --hard` to the expected base per the `worktree_branch_check` protocol before any file edits began (verified: no uncommitted changes were present, and the expected base was confirmed reachable from `main`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 33-03 (parallel, backend `pendingRegistrations` deletion) is unaffected by this plan's changes — `ApprovalsPage.jsx` never referenced backend resolver/schema files, and this plan tolerates either execution order as instructed.
- Plan 33-04 (signup form, wave 2, depends on 33-01) is unaffected by this plan.
- `npm test --workspace frontend`: 42 files / 445 tests, all green (baseline was 42/441; net +4 new tests: +3 in `ApprovalsPage.test.jsx`, +1 in `Pending.test.jsx`).
- No known stubs, no new threat surface beyond what's already covered by this plan's `<threat_model>` (T-33-02, T-33-02-07, T-33-02-05 accepted per D-01, T-33-02-06).

---
*Phase: 33-public-signup-form-approval-queue*
*Completed: 2026-09-07*

## Self-Check: PASSED

- FOUND: frontend/src/pages/ApprovalsPage.jsx
- FOUND: frontend/src/pages/ApprovalsPage.test.jsx
- FOUND: frontend/src/pages/InvitationsPage.test.jsx
- FOUND: frontend/src/pages/Pending.test.jsx
- FOUND commit: 4f6b2f3 (Task 1)
- FOUND commit: 4ff4349 (Task 2)
