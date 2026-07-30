---
phase: 08-mailer-abstraction-reset-token-remediation
plan: 02
subsystem: auth
tags: [react, react-router-dom, mui, vitest, react-testing-library, graphql]

# Dependency graph
requires:
  - phase: 08-mailer-abstraction-reset-token-remediation (plan 01, in-flight/parallel)
    provides: "backend PasswordResetPayload schema drops resetToken; the frontend query trim in this plan matches that upstream change"
provides:
  - "ForgotPassword.jsx confirmation-panel UX: success unconditionally unmounts the form and shows a static confirmation with a persistent /reset-password link (D-12)"
  - "ForgotPassword.jsx query trimmed to `{ message }`, no resetToken reference anywhere in the file"
  - "ResetPassword.jsx reads ?token= via useSearchParams(), hides the manual paste field when present, falls back to the paste field otherwise (D-09)"
  - "RTL regression coverage for both pages (zero coverage previously) guarding against the exact reset-token-exposure vulnerability this phase closes"
affects: [09-passwordchangedat-session-revocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "react-router-dom useSearchParams() for reading URL query params in a page component (first use in this codebase)"
    - "MemoryRouter initialEntries for seeding URL state in RTL tests (first use in this codebase)"
    - "Ternary-on-result-state to fully unmount a form on success, rather than layering a success Alert alongside the form (structural leak-proofing over conditional-render leak-proofing)"

key-files:
  created:
    - frontend/src/pages/ForgotPassword.test.jsx
    - frontend/src/pages/ResetPassword.test.jsx
  modified:
    - frontend/src/pages/ForgotPassword.jsx
    - frontend/src/pages/ResetPassword.jsx

key-decisions:
  - "Kept the outer <Stack> wrapping the error Alert as a sibling of the result ternary in ForgotPassword.jsx (rather than nesting error inside each branch) so the error Alert always renders regardless of form/confirmation-panel state, matching the plan's explicit instruction"
  - "Used a React Fragment for the confirmation panel's two children (Alert + Button) inside the ternary rather than a nested <Stack>, since the outer Stack's spacing already applies to both"

requirements-completed: [RESET-05]

# Metrics
duration: 11min
completed: 2026-07-13
---

# Phase 08 Plan 02: ForgotPassword Confirmation Panel & ResetPassword URL-Token Read Summary

**ForgotPassword.jsx drops the raw reset-token render path entirely in favor of an unconditional confirmation panel; ResetPassword.jsx reads the token from `?token=` via `useSearchParams()` so the emailed link (delivered by plan 08-03's mailer) is a working one-click flow.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-13T20:01:00+02:00 (approx, first RED test run)
- **Completed:** 2026-07-13T20:07:53Z
- **Tasks:** 2 (both TDD, 2 commits each: test → feat)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `ForgotPassword.jsx` no longer queries or renders `resetToken` anywhere — the success state unmounts the email field and submit button entirely, replacing them with a confirmation panel showing the generic backend message and a persistent (non-token-gated) link to `/reset-password`
- `ResetPassword.jsx` reads the token from the URL via `useSearchParams()`; when `?token=` is present the manual paste field is hidden and the URL token is submitted with the mutation; falls back to the existing paste field unchanged when absent
- Both pages now have RTL regression coverage where none existed before — `ForgotPassword.test.jsx` explicitly asserts no raw token pattern and no token-gated element is ever rendered after a successful submit (direct regression guard on the vulnerability RESET-05 closes)

## Task Commits

Each task was committed atomically (TDD: test → feat per task):

1. **Task 1: ForgotPassword confirmation panel (D-12) + RTL regression test**
   - `b3b3361` (test) - failing RTL test asserting confirmation-panel behavior, no-raw-token guard, and trimmed query selection set
   - `1a80743` (feat) - rewrote ForgotPassword.jsx: query trimmed to `{ message }`, subtitle rewritten, form replaced by unconditional confirmation panel on success
2. **Task 2: ResetPassword reads token from URL (D-09) + RTL coverage**
   - `baba18f` (test) - failing RTL test asserting the token field hides/submits when `?token=` present, and still renders when absent
   - `dedd280` (feat) - added `useSearchParams()`, seeded `form.token` from the URL, wrapped the manual field in `{!tokenFromUrl && (...)}`

**Plan metadata:** (this commit, follows)

## Files Created/Modified
- `frontend/src/pages/ForgotPassword.jsx` - `REQUEST_RESET` selection set trimmed to `{ message }`; subtitle rewritten to drop the internal token mechanic; success state (`result` truthy) unconditionally replaces the form with a confirmation panel (`Alert` + persistent "Continue to reset password" `Button`/link, unconditional — not gated on any token field)
- `frontend/src/pages/ForgotPassword.test.jsx` - 3 RTL tests: confirmation panel replaces form + email field/button unmount; no raw token or token-gated element ever renders; mutation selection set is exactly `{ message }`
- `frontend/src/pages/ResetPassword.jsx` - added `useSearchParams()` import and call; `tokenFromUrl` derived before `useState`; `form.token` seeded from it; manual "Reset token" `TextField` wrapped in `{!tokenFromUrl && (...)}`
- `frontend/src/pages/ResetPassword.test.jsx` - 2 RTL tests using `MemoryRouter initialEntries`: token-in-URL case (field hidden, mutation called with URL token) and no-token fallback case (field present)

## Decisions Made
- Kept the error `Alert` as a sibling of the `result`-ternary inside a single outer `<Stack>` in `ForgotPassword.jsx`, rather than duplicating it inside each ternary branch — matches the plan's explicit instruction that the error line "stays outside both branches of the ternary."
- Used a `<>...</>` Fragment for the confirmation panel's two children rather than a nested `<Stack>`, since the parent `Stack`'s `spacing={2.25}` already applies uniformly across the ternary's rendered children.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The initial `Write`/`Edit` calls targeted `/Users/bisrat/Projects/portofolio/...` (main-repo path) before recognizing this agent is isolated in the worktree at `/Users/bisrat/Projects/portofolio/.claude/worktrees/agent-aa310850b727f9e41/...` — corrected before any file was actually written outside the worktree (the tool itself rejected the first out-of-worktree Write attempt), no wasted work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ForgotPassword.jsx` and `ResetPassword.jsx` are both ready to consume plan 08-01's schema change (drops `resetToken` from `PasswordResetPayload`) and plan 08-03's mailer-driven reset link (`${CLIENT_URL}/reset-password?token=...`) without further frontend changes — the URL-token read contract this plan establishes is exactly what that link needs.
- Full frontend suite is green (6 test files, 17 tests passing) including the two new files.
- No blockers for Phase 9 (`passwordChangedAt` session revocation), which touches the same `resetPassword` resolver next but does not touch these two frontend pages.

---
*Phase: 08-mailer-abstraction-reset-token-remediation*
*Completed: 2026-07-13*

## Self-Check: PASSED

All created files verified present on disk (ForgotPassword.jsx, ForgotPassword.test.jsx, ResetPassword.jsx, ResetPassword.test.jsx, this SUMMARY.md). All 5 task/metadata commits (`b3b3361`, `1a80743`, `baba18f`, `dedd280`, `d28c0bd`) verified present in `git log --all`.
