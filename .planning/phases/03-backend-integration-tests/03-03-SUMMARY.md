---
phase: 03-backend-integration-tests
plan: 03
subsystem: testing
tags: [vitest, apollo-server, graphql, sequelize, security-documentation]

# Dependency graph
requires:
  - phase: 03-backend-integration-tests
    plan: 01
    provides: "graphql()/resetTables()/createTestUser() helpers in backend/test/helpers.js"
provides:
  - "requestPasswordReset integration spec (BE-07) documenting the happy-path generic message + DB persistence, without asserting the token leak as expected behavior"
  - "Repo-root KNOWN-ISSUES.md (DOCS-01) — first tracked, portfolio-visible security bug: reset-token exposure in requestPasswordReset"
affects: ["future phases/milestones remediating FIX-01 (reset-token leak fix)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KNOWN-ISSUES.md per-issue shape: Location (file:line), Expected vs. Actual, Severity, Documented-by-test pointer, with a top-of-file pointer to .planning/codebase/CONCERNS.md for the full audit"

key-files:
  created:
    - backend/src/resolvers/resetPassword.test.js
    - KNOWN-ISSUES.md
  modified: []

key-decisions:
  - "Test suite asserts only the happy path (generic message for both existing/non-existing email, DB persistence of resetPasswordToken/resetPasswordExpiresAt) per D-09 — the resetToken leak itself is not asserted as expected behavior anywhere in the spec"
  - "KNOWN-ISSUES.md contains exactly one entry (reset-token exposure) per D-08 scope — no password-strength or account-enumeration entries added since no test in this phase directly asserts those as bugs"

patterns-established:
  - "Security bugs surfaced by tests are tracked in a portfolio-visible KNOWN-ISSUES.md at repo root, not silently fixed or left undocumented — future phases should append entries here only when a new test directly surfaces a bug"

requirements-completed: [BE-07, DOCS-01]

# Metrics
duration: ~1min
completed: 2026-07-12
---

# Phase 3 Plan 3: Reset-Password Integration Tests + Known-Issues Doc Summary

**Added the requestPasswordReset integration spec (happy-path only, per D-09) and the repo-root KNOWN-ISSUES.md tracking the reset-token exposure as a documented, unfixed High-severity bug.**

## Performance

- **Duration:** ~1 min (2026-07-12T01:46:06Z - 2026-07-12T01:47:13+02:00)
- **Started:** 2026-07-12T01:46:06Z
- **Completed:** 2026-07-12T01:47:13+02:00
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `backend/src/resolvers/resetPassword.test.js` delivers 2 passing tests: existing-email happy path (generic message + DB-persisted `resetPasswordToken`/`resetPasswordExpiresAt` after `user.reload()`) and non-existing-email happy path (identical generic message, `resetToken: null`) — neither test treats the token leak as expected/desired behavior
- Repo-root `KNOWN-ISSUES.md` created with one entry documenting the `requestPasswordReset` reset-token exposure (Location, Expected vs. Actual, Severity: High, Documented-by-test pointer), plus a top-of-file pointer to `.planning/codebase/CONCERNS.md` for the full security audit
- Full backend suite remains green: 31/31 tests across 7 files (up from 29/29 across 6 files after Plan 03-01; Plan 03-02's login spec landed in this worktree in parallel)
- Closes out the four required GraphQL flows (register, login, dashboard, password reset) for BE-04 through BE-07, plus the phase's DOCS-01 documentation deliverable

## Task Commits

Each task was committed atomically:

1. **Task 1: Write requestPasswordReset integration tests (BE-07)** - `d7ac1e9` (test)
2. **Task 2: Create repo-root KNOWN-ISSUES.md documenting the reset-token exposure (DOCS-01)** - `403619e` (docs)

**Plan metadata:** committed separately after this summary is written.

## Files Created/Modified
- `backend/src/resolvers/resetPassword.test.js` - new integration spec, 2 tests covering `requestPasswordReset`'s happy-path behavior (generic message + DB persistence), explicitly not asserting the token leak as expected
- `KNOWN-ISSUES.md` - new repo-root doc, one entry (reset-token exposure), Severity High, pointer to the documenting test and to `.planning/codebase/CONCERNS.md`

## Decisions Made
- Followed D-09 exactly: the suite is happy-path-only; a one-line comment above the `describe` block notes that the token exposure is documented in `KNOWN-ISSUES.md`, not asserted here as expected behavior
- Followed D-08 scope: only the reset-token exposure entry was added to `KNOWN-ISSUES.md` — no password-strength or account-enumeration entries, since no test in this phase directly asserts those as bugs

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (Vitest run, grep checks) passed on the first attempt with no auto-fixes required.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BE-07 and DOCS-01 are fully satisfied; all of BE-04 through BE-07 are now covered across the three plans in this phase
- Full backend suite (`npm test --workspace backend -- --run`) is green: 31/31 tests across 7 files
- `KNOWN-ISSUES.md` is portfolio-visible at the repo root, ready to accumulate future tracked bugs without needing structural changes
- No application runtime source file was modified in this plan — only a test file and a new doc, consistent with the milestone's non-destructive constraint
- No blockers for phase completion or the next phase (frontend test tooling)

---
*Phase: 03-backend-integration-tests*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created files and task commit hashes verified to exist:
- `backend/src/resolvers/resetPassword.test.js` — FOUND
- `KNOWN-ISSUES.md` — FOUND
- `d7ac1e9` (Task 1) — FOUND
- `403619e` (Task 2) — FOUND
