---
phase: 34-open-registration-switch-quality-gate
plan: 02
subsystem: testing
tags: [vitest, react-testing-library, mocking, register, frontend]

# Dependency graph
requires: []
provides:
  - "Register.test.jsx migrated off order-sensitive mockResolvedValueOnce/mockRejectedValueOnce chains onto a query-dispatching mockImplementation (matching InvitationsPage.test.jsx's idiom)"
  - "All four tokenless Register.test.jsx tests await their first post-render assertion, so they survive a future loading gate above `if (!token)`"
  - "A structural D-08 pin: an invited-token render asserts synchronously and never queries publicRegistrationEnabled"
affects: [34-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Query-text dispatch mock (graphqlRequest.mockImplementation branching on query.includes(...)) replaces call-order-dependent Once chains in frontend test files"

key-files:
  created: []
  modified:
    - frontend/src/pages/Register.test.jsx

key-decisions:
  - "Migrated the whole file, not just the four affected tests (RESEARCH Open Question 4), per plan 34-02's explicit resolution — zero mockResolvedValueOnce/mockRejectedValueOnce occurrences remain"
  - "New D-08 test kept synchronous by design, with a comment warning that making it await-tolerant would hide the regression it guards"

requirements-completed: [ADMIN-02]

# Metrics
duration: 9min
completed: 2026-09-09
---

# Phase 34 Plan 02: Register.test.jsx Query-Dispatch Migration Summary

**Migrated Register.test.jsx off order-sensitive `Once` mock chains onto a query-dispatching `mockImplementation`, made all four tokenless tests await first paint, and added a synchronous D-08 pin for the invited path — all landing green against the current un-gated `Register.jsx`, ready for plan 34-06's loading gate.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-09T11:35:31+02:00
- **Completed:** 2026-09-09T11:44:21+02:00
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced all three `mockResolvedValueOnce`/`mockRejectedValueOnce` call sites with a shared `beforeEach` query-dispatching mock (defaulting the door OPEN) plus three narrowed per-test `mockImplementation` overrides — zero call-order dependence remains.
- All four `renderRegister(null)` tests now `await screen.findBy*` their first post-render assertion, so they will survive plan 34-06's `publicRegistrationEnabled` loading gate instead of breaking on it.
- Narrowed the empty-form negative assertion from "graphqlRequest was never called" to "the `register` mutation specifically was never called" — a legitimate mount-time `publicRegistrationEnabled` read can no longer make this test fail for the wrong reason.
- Added a new synchronous test pinning D-08: the invited branch renders `Full name` with zero added latency and never queries `publicRegistrationEnabled`, with an explicit comment that making the assertion `await`-tolerant would make the regression it guards invisible.
- Full frontend suite green: 43 files / 483 tests (baseline 482 + 1 new D-08 test).

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace the Once-chains with a query-dispatching mockImplementation** - `258ef1d` (test)
2. **Task 2: Make the four tokenless tests survive the loading gate; pin the invited path as ungated** - `cfb4151` (test)

**Plan metadata:** (this SUMMARY.md commit)

## Files Created/Modified
- `frontend/src/pages/Register.test.jsx` - Query-dispatching mock harness replaces Once-chains; four tokenless tests await first paint; empty-form assertion narrowed to the mutation; new D-08 synchronous pin added

## Decisions Made
- Migrated the whole file rather than only the four tests plan 34-06 will break, per RESEARCH Open Question 4's resolution — prevents future contributors from mixing `Once` chains and dispatching mocks in the same file.
- Placed the new D-08 test between the two existing invited tests and the tokenless blur-error test, keeping all invited-path tests grouped together in the describe block.
- Kept the D-08 assertion's `not.toHaveBeenCalledWith(...)` call on a single line (matching the register-mutation negative assertion's style) so both remain grep-matchable by the plan's literal acceptance-criteria patterns.

## Deviations from Plan

None - plan executed exactly as written. One micro self-correction during execution: an early draft of the D-08 test wrapped its `not.toHaveBeenCalledWith` call across three lines for readability; this was reformatted to a single line before committing to satisfy the plan's exact grep-based acceptance criterion (`grep -c "not.toHaveBeenCalledWith(expect.stringContaining('publicRegistrationEnabled')"`). No behavior change, caught before the task commit, so not logged as a numbered deviation.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`Register.test.jsx` is now structurally ready for plan 34-06's `publicRegistrationEnabled` loading gate: inserting that query ahead of `register` in `Register.jsx` cannot shift any assertion (dispatch is by query text, not call order), the four tokenless tests already tolerate the added round-trip via `await screen.findBy*`, and the new D-08 test will catch any future regression that accidentally hoists a loading gate above the invited (`if (!token)`) branch. No blockers for plan 34-06.

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
