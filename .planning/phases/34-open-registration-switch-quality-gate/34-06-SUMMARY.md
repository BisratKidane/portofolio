---
phase: 34-open-registration-switch-quality-gate
plan: 06
subsystem: ui
tags: [react, mui, register, graphql, vitest, react-testing-library]

# Dependency graph
requires:
  - phase: 34-02
    provides: "Register.test.jsx migrated onto a query-dispatching mockImplementation, all four tokenless tests await first paint, and a synchronous D-08 pin for the invited path"
  - phase: 34-03
    provides: "The publicRegistrationEnabled query contract (PUBLIC_REGISTRATION_ENABLED_QUERY resolves { publicRegistrationEnabled: true | false }, unauthenticated, no attribution)"
provides:
  - "Register.jsx's !token branch gated behind publicRegistrationEnabled: a bare-spinner loading state, the untouched signup form when open, and a single-definition invitation-only view when closed"
  - "A mid-form refusal handler that re-queries publicRegistrationEnabled instead of string-matching the server's refusal message, and swaps to the same invitation-only view only when the server now says closed"
  - "14 Register.test.jsx tests covering all four /register states, the mid-form swap in both directions, and a refusal-message-rewording-is-irrelevant structural pin"
affects: [34-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single renderInvitationOnly() definition called from both the initial-closed branch and the mid-form-refusal swap, so a security-adjacent copy string can only exist once in the file"
    - "Fail-closed network read: a rejected publicRegistrationEnabled query sets state to false, matching the server's own D-02 default"
    - "Re-query-on-refusal instead of message-string-matching to decide client-side UI state at a trust boundary"

key-files:
  created: []
  modified:
    - frontend/src/pages/Register.jsx
    - frontend/src/pages/Register.test.jsx

key-decisions:
  - "renderInvitationOnly() is a plain nested function (not memoized/hoisted to module scope) so it closes over component state (publicOpen setter is not needed inside it, but keeping it as a component-scoped function matches the plan's single-definition, two-call-site requirement without introducing a second component)"
  - "The mid-form-refusal catch re-query failure path leaves the original error alert rendered untouched -- a network failure on the re-query must not silently swap the surface, matching the plan's explicit instruction"
  - "Test 5's 'no leftover error alert' assertion checks for the absence of .MuiAlert-standardError specifically, not role='alert' generally, because renderInvitationOnly()'s own <Alert severity=\"info\"> also carries role=\"alert\" (MUI's behavior for every severity) and a naive queryByRole('alert') check produced a false failure"

requirements-completed: [ADMIN-02]

# Metrics
duration: 15min
completed: 2026-09-09
---

# Phase 34 Plan 06: Register Public-Signup Gate & Mid-Form Refusal Swap Summary

**Register.jsx's tokenless branch now gates behind a `publicRegistrationEnabled` read (bare spinner -> signup form or single-definition invitation-only view), and a refused submit re-queries the server rather than string-matching its refusal message to decide whether to swap -- 14 new/adjusted Register.test.jsx tests including a structural pin proving the swap survives an unseen rejection message.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-09T12:24:56+02:00
- **Completed:** 2026-09-09T12:39:31+02:00
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Added `PUBLIC_REGISTRATION_ENABLED_QUERY` and a mount effect guarded on `!token` (invited path never issues it, zero added latency, D-08), driving a new `publicOpen` (`null` = unresolved) state.
- Restructured the `!token` branch into three ordered returns: bare centred spinner (no chrome, matching `AuthShell.jsx:11`'s outer `Box` exactly) while unresolved, the untouched Phase-33 signup form when open, and a single `renderInvitationOnly()` when closed.
- `renderInvitationOnly()` is defined exactly once, carrying the exact D-07 copy contract (eyebrow/title/subtitle/body/footer), and is the only place those strings exist in the file.
- `handlePublicSubmit`'s catch re-runs `publicRegistrationEnabled` on a refused submit and swaps to the closed view (clearing the error) only if the server now says closed; a still-open or re-query-failed result leaves the original error rendered untouched -- no code path inspects `err.message` to decide door state.
- Added 7 new tests (14 total in the file) covering Loading / Open / Closed / read-failure-fails-closed, the mid-form swap in both directions, and a rewording-irrelevance structural pin (`'zzz unrelated server text'` still triggers the swap because the decision comes from the re-query, not the string).
- Ran both plan-specified rehearsal mutations (string-match instead of re-query; hoisting the loading gate above `if (!token)`) confirming the intended tests go RED, then restored -- verified via `git diff` showing zero residual diff against the prior commit.
- Full frontend suite green: 44 files / 498 tests (was 44 files / 491 tests going into this plan -- this plan added 7 tests to the existing `Register.test.jsx`, no new files).

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate the !token branch behind publicRegistrationEnabled, with one renderInvitationOnly()** - `7c435ce` (feat)
2. **Task 2: Mid-form refusal — re-query and swap, never string-match** - `fe23195` (feat)
3. **Task 3: Tests for all four /register states and the mid-form swap** - `059d36f` (test)

**Plan metadata:** (this SUMMARY.md commit)

## Files Created/Modified
- `frontend/src/pages/Register.jsx` - Added the `publicRegistrationEnabled` gate, `publicOpen` state, single `renderInvitationOnly()` definition, bare-spinner loading state, and the re-query-on-refusal swap in `handlePublicSubmit`'s catch
- `frontend/src/pages/Register.test.jsx` - Added a new `describe('/register public-registration gate (ADMIN-02 / D-07)')` block with 7 tests covering all four states, the mid-form swap (both outcomes), and the rewording-irrelevance pin

## Decisions Made
- Kept `renderInvitationOnly()` as a component-scoped nested function rather than extracting it to a separate component or module-level render helper -- the plan's single-definition requirement is satisfied by having exactly one function body, and nesting it avoids threading `token`/state through prop plumbing for a view with no reactive dependencies of its own.
- Test 5's assertion for "no leftover error alert" was changed from a bare `queryByRole('alert')` check to a `.MuiAlert-standardError` class check after discovering MUI's `<Alert severity="info">` (rendered by `renderInvitationOnly()`) also carries `role="alert"` -- the naive check produced a false failure by matching the wrong alert. This is a test-correctness fix caught during Task 3's own execution, not a deviation from the plan's intent (the plan's acceptance criterion is "no error Alert remains", which the corrected assertion actually verifies).

## Deviations from Plan

None — plan executed exactly as written. One in-flight self-correction during Task 3 (test 5's alert-role assertion, described above) was caught and fixed before the task commit, so it is not logged as a numbered deviation per the shared Rule 1-3 process (fix inline, verify, continue task).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`Register.jsx` now fully implements ADMIN-02's `/register` clause: the door state is read from the server, never string-matched, and the invited path remains completely ungated (D-08) with zero added latency. Plan 34-07 (SEC-04 adversarial matrix) can proceed independently -- this plan touches only the frontend surface and starts no backend test process, so it was safe to run concurrently with plan 34-05's backend work per the plan's own `<verification>` note. No blockers for 34-07.

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
