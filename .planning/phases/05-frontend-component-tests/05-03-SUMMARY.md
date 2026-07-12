---
phase: 05-frontend-component-tests
plan: 03
subsystem: testing
tags: [vitest, react-testing-library, react-router-dom, mui, vi.mock, user-event]

# Dependency graph
requires:
  - phase: 04-frontend-test-tooling
    provides: Vitest + React Testing Library + jsdom harness (frontend/vitest.config.js, frontend/test/setup.js, frontend/src/harness.test.jsx)
provides:
  - Component test coverage for the Login page (FE-03): success navigates to /dashboard, error shows alert without navigating
  - Component test coverage for the Register page (FE-04): success navigates to /dashboard, error shows alert without navigating
  - Reusable vi.mock recipe for the graphqlRequest network seam and the react-router-dom useNavigate seam, usable by later specs in this phase
affects: [05-frontend-component-tests (remaining plans), 06-ci-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() })) — module-replacement mock for the network seam, first use of vi.mock in the repo"
    - "vi.hoisted(() => ({ navigateSpy: vi.fn() })) + partial vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigateSpy })) — keeps MemoryRouter/Link real while stubbing only useNavigate"
    - "screen.getByLabelText(label, { exact: false }) — required for MUI TextField labels, which append a visually-hidden asterisk making the accessible label text 'Label *' rather than an exact match"
    - "beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); }) — mandatory isolation since AuthContext persists authToken to real jsdom localStorage across tests in the same file"

key-files:
  created:
    - frontend/src/pages/Login.test.jsx
    - frontend/src/pages/Register.test.jsx
  modified: []

key-decisions:
  - "Used screen.getByLabelText(label, { exact: false }) instead of the plan's exact-match recipe, because MUI's required-field asterisk is rendered as part of the label's accessible text"
  - "Added localStorage.clear() to beforeEach (alongside vi.clearAllMocks()) so a successful login/register in one test doesn't leave an authToken that triggers AuthProvider's me-on-mount effect in the next test"

patterns-established:
  - "Auth-entry-point page tests render inside a real AuthProvider + MemoryRouter, mocking only graphqlRequest (network) and useNavigate (routing) — highest confidence per line without a second isolation strategy"

requirements-completed: [FE-03, FE-04]

# Metrics
duration: 13min
completed: 2026-07-12
---

# Phase 5 Plan 3: Login & Register Page Component Tests Summary

**Login and Register pages tested end-to-end through the real AuthProvider, with only graphqlRequest and useNavigate mocked — covering both the success-navigates and error-alert-no-navigate paths for each page.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-12T01:12:00Z
- **Completed:** 2026-07-12T01:25:07Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both new)

## Accomplishments
- `Login.test.jsx`: submitting valid credentials (mocked `graphqlRequest` resolving `{ login: {...} }`) navigates to `/dashboard` via the mocked `useNavigate` spy; submitting credentials that reject shows a `role="alert"` element with the backend's error text and does not navigate.
- `Register.test.jsx`: same success/error coverage for registration, reusing the identical recipe with `Full name`/`register` swapped in for `Login`'s fields/mutation.
- Established the first `vi.mock` module-replacement pattern in the repo (for `graphqlClient.js` and a partial mock of `react-router-dom`), available for later Phase 5 specs (`AuthContext.test.jsx`, `ProtectedRoute.test.jsx`).
- Full frontend suite (`cd frontend && npx vitest run`) passes: 3 test files, 6 tests, no regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write Login.test.jsx — success navigates, error shows alert** - `93f8b9f` (test)
2. **Task 2: Write Register.test.jsx — reuse Login recipe, swap fields/mutation** - `3277dce` (test)

**Plan metadata:** (pending — committed separately after this SUMMARY)

_Note: These are test-only additions to already-shipped, working UI components (Login.jsx/Register.jsx are unmodified); there is no production-code RED→GREEN cycle to drive, so each task is a single `test(...)` commit rather than a test→feat pair. See "TDD Gate Compliance" below._

## Files Created/Modified
- `frontend/src/pages/Login.test.jsx` - 2 tests: success (navigate to `/dashboard`), error (alert shown, no navigate)
- `frontend/src/pages/Register.test.jsx` - 2 tests: success (navigate to `/dashboard`), error (alert shown, no navigate)

## Decisions Made
- Switched `getByLabelText` calls to `{ exact: false }` because MUI renders required-field labels as `"Email address *"` (label text + visually-hidden asterisk span), which breaks exact string matching against `'Email address'`/`'Password'`/`'Full name'`. This is a query-mechanics fix, not a behavior change — the plan's field/button copy contract (per `<interfaces>`) is otherwise followed verbatim.
- Added `localStorage.clear()` to each spec's `beforeEach`, in addition to the plan's `vi.clearAllMocks()`. Without it, the first (success) test's real `AuthProvider.authenticate()` call persists an `authToken` to jsdom's real `localStorage`, which survives into the second (error) test and triggers `AuthProvider`'s me-on-mount effect. That mount effect then consumes the `mockRejectedValueOnce` queued for the login/register call, leaving the actual submit call to resolve `undefined` and crash on `data.login`/`data.register` — an isolation bug, not a plan-fidelity issue.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getByLabelText` exact-match query failed against MUI's required-field label markup**
- **Found during:** Task 1 (Login.test.jsx first test run)
- **Issue:** The plan's action block specified `screen.getByLabelText('Email address')` (exact match). MUI's `<InputLabel required>` renders the label text followed by an `aria-hidden` asterisk span, so the computed accessible name is `"Email address *"`, not `"Email address"`. `getByLabelText` with default exact matching threw `Unable to find a label with the text of: Email address`.
- **Fix:** Changed all `getByLabelText` calls in both spec files to pass `{ exact: false }` (substring match).
- **Files modified:** `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Register.test.jsx`
- **Verification:** `cd frontend && npx vitest run src/pages/Login.test.jsx src/pages/Register.test.jsx` — all 4 tests pass.
- **Committed in:** `93f8b9f` (Task 1), `3277dce` (Task 2 — written correctly from the start using the fix learned in Task 1)

**2. [Rule 1 - Bug] Cross-test `localStorage` leakage caused the second (error-path) test in Login.test.jsx to crash instead of asserting the alert**
- **Found during:** Task 1 (Login.test.jsx second test run, after fixing deviation #1)
- **Issue:** Test 1's successful login writes a real `authToken` into jsdom's `localStorage` via `AuthProvider.authenticate()`. `beforeEach` only called `vi.clearAllMocks()`, not `localStorage.clear()`, so Test 2 rendered with a stale token present. `AuthProvider`'s me-on-mount effect then fired a `graphqlRequest(ME_QUERY)` call that consumed the `mockRejectedValueOnce` queued for the submit-time login call, leaving the actual login call to resolve `undefined` and throw `Cannot read properties of undefined (reading 'login')` inside `authenticate()` — surfaced as the wrong error text in the alert.
- **Fix:** Added `localStorage.clear()` to each spec's `beforeEach`, alongside `vi.clearAllMocks()`.
- **Files modified:** `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Register.test.jsx`
- **Verification:** `cd frontend && npx vitest run` — 3 files, 6 tests, all pass.
- **Committed in:** `93f8b9f` (Task 1), `3277dce` (Task 2 — written correctly from the start using the fix learned in Task 1)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in the test recipe surfaced during first execution, not in the application code under test)
**Impact on plan:** Both fixes are test-mechanics corrections required to make the plan's specified behavior assertions pass reliably; no application code (`Login.jsx`, `Register.jsx`, `AuthContext.jsx`) was touched. No scope creep.

## TDD Gate Compliance

Both tasks are marked `tdd="true"` in the plan, but this plan adds characterization tests for already-shipped, unmodified UI components (`Login.jsx`, `Register.jsx`) — there is no new production behavior to drive via a RED→GREEN→REFACTOR cycle. The natural RED state was "test fails due to a bug in the test itself" (deviations #1 and #2 above), which was fixed in place before the first commit, per the shared Rule 1-3 process (fix inline → verify → commit). Each task therefore has one `test(05-03): ...` commit rather than a `test` → `feat` pair. This matches the plan's own framing ("Purpose: ... tested through the real AuthProvider with only the network and navigation mocked") — there was no `<implementation>` block calling for new src changes.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `frontend/src/pages/Login.test.jsx` and `frontend/src/pages/Register.test.jsx` are in place, passing, and require no further action.
- The `vi.mock` recipes for `graphqlClient.js` and the partial `react-router-dom` mock are now proven in the repo and ready to be reused verbatim by the remaining Phase 5 specs (`AuthContext.test.jsx`, `ProtectedRoute.test.jsx`) per `05-PATTERNS.md`.
- Full frontend suite (`cd frontend && npx vitest run`) passes with 3 files / 6 tests — no regressions introduced.

---
*Phase: 05-frontend-component-tests*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: frontend/src/pages/Login.test.jsx
- FOUND: frontend/src/pages/Register.test.jsx
- FOUND: .planning/phases/05-frontend-component-tests/05-03-SUMMARY.md
- FOUND commit: 93f8b9f
- FOUND commit: 3277dce
- FOUND commit: 2342cb7
