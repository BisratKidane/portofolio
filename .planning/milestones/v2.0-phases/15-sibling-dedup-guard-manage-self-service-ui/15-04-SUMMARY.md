---
phase: 15-sibling-dedup-guard-manage-self-service-ui
plan: 04
subsystem: ui
tags: [react, mui, table-pagination, admin]

# Dependency graph
requires:
  - phase: 14-permission-scoping-relationship-resolvers
    provides: familyMembers query (requireAdmin-gated) returning id/firstname/lastname/fullname/gender/linkedUser
provides:
  - AdminMemberTable component — searchable, client-side-paginated table over the full familyMembers list
  - onSelect(member) callback contract for a later ManagePage wiring plan to focus a member into the shared grouped panel
affects: [manage-page-wiring, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First MUI Table/TableContainer/TablePagination composition in the codebase (every prior list used an unpaginated Stack of rows)"
    - "Client-side search filter applied before client-side pagination slice, both reset page to 0 on search/rowsPerPage change"

key-files:
  created:
    - frontend/src/components/manage/AdminMemberTable.jsx
    - frontend/src/components/manage/AdminMemberTable.test.jsx
  modified: []

key-decisions:
  - "Client-side TablePagination over the full familyMembers result, per 15-RESEARCH.md Open Question 2 — sufficient at hundreds-of-nodes scale, zero backend change"
  - "Component performs no fetch and no role check of its own; the requireAdmin-gated familyMembers query and future caller's role check are the only guards (documented in threat_model as intentional, mirrors D-03/T-15-08 disposition)"

patterns-established:
  - "AdminMemberTable({ members, onSelect }) is a pure data-in/callback-out presentational component — same convention as other /manage components this phase"

requirements-completed: [MNG-03]

# Metrics
duration: 18min
completed: 2026-07-23
---

# Phase 15 Plan 04: AdminMemberTable Summary

**Searchable, client-side-paginated MUI Table over the full familyMembers list, with row-click handing the selected member to a callback for a later ManagePage wiring plan.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-23T20:22:33+02:00
- **Completed:** 2026-07-23T20:36:43+02:00
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `AdminMemberTable` filters the full `familyMembers` array by case-insensitive substring match on `fullname`, showing "No members match your search." when nothing matches (including the empty-list case)
- MUI `Table`/`TableContainer`/`TablePagination` composition (Name / Gender / Linked account columns, `rowsPerPage` default 10, options 10/25/50) — the first paginated-table precedent in this codebase
- Row click calls `onSelect(member)` with the exact clicked row's full member object, ready for a later plan to wire into the shared grouped panel

## Task Commits

Each task followed the TDD RED → GREEN cycle, committed atomically:

1. **Task 1: search + empty state**
   - `5628d92` (test) — failing RTL tests for empty-state text, search filtering, empty-state-on-no-match, labelled search field
   - `c807569` (feat) — filtering + empty-state implementation with a minimal placeholder row-render
2. **Task 2: Table columns, TablePagination, row-select**
   - `f6b4d7f` (test) — failing tests for Table columns, TablePagination navigation controls, 15-fixture pagination boundary, onSelect-with-exact-object
   - `570c4ae` (feat) — full Table/TablePagination/row-select implementation; full frontend suite green (42/42)

**Plan metadata:** committed alongside this SUMMARY.md (worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally)

## Files Created/Modified
- `frontend/src/components/manage/AdminMemberTable.jsx` - Searchable, paginated, callback-driven admin member table (new `manage/` component directory)
- `frontend/src/components/manage/AdminMemberTable.test.jsx` - 8 RTL tests covering empty state, search filtering, columns, pagination boundary, and row-select

## Decisions Made
- Followed 15-RESEARCH.md's Open Question 2 recommendation: client-side `TablePagination` over the full `familyMembers` result, no backend `limit`/`offset` change, since "hundreds of nodes" scale doesn't warrant server-side pagination this phase.
- Kept the component strictly presentational (no `graphqlRequest` call, no role check) per the interface contract and the threat model's T-15-08 disposition — the `requireAdmin`-gated `familyMembers` query and the future caller's admin-only render decision are the sole guards; this component adds no new query and performs no client-side gating of its own by design.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Worktree setup issue (infrastructure, not plan-related): the worktree's initial HEAD did not match the expected merge-base with the phase-15 commit range (it was on an earlier commit predating the test tooling and family-tree work). Corrected per the `worktree_branch_check` protocol via `git reset --hard` to the expected commit before any task work began; `node_modules` was symlinked from the main checkout (identical `package-lock.json`, confirmed via `diff`) since the worktree had none installed. No plan files were affected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `AdminMemberTable` is ready to be imported and wired by the `ManagePage` plan that owns the admin branch of `/manage` — it expects the caller to already hold the fetched `familyMembers` array and to handle `onSelect(member)` by fetching that member's deep relations and rendering the shared `RelationshipGroupedPanel`.
- No blockers or concerns.

---
*Phase: 15-sibling-dedup-guard-manage-self-service-ui*
*Completed: 2026-07-23*
