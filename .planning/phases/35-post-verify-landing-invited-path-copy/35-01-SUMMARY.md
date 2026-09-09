---
phase: 35-post-verify-landing-invited-path-copy
plan: 01
subsystem: auth
tags: [react, react-router, mui, vitest, react-testing-library, tdd]

# Dependency graph
requires:
  - phase: 34-open-registration-switch-quality-gate
    provides: "Full-stack open-registration flow (AuthContext.verifyEmail withholding token for non-Active users) that this plan's routing fix sits on top of"
provides:
  - "New stateless /awaiting-approval route + AwaitingApproval.jsx page (D-01/D-02) closing v4.1 milestone-audit W-1"
  - "VerifyEmail.jsx retargeted to navigate non-Active verifiers to /awaiting-approval instead of /pending"
  - "Pending.jsx retitled to the linking state (D-07), 'approval' (noun) removed"
  - "verifyLanding.composed.test.jsx: real-AuthProvider + real-routing composed test harness pinning the W-1 fix and 3 regressions"
affects: [35-02, 35-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composed test pattern: real AuthProvider + real react-router-dom Routes, network mocked only at graphqlRequest (D-11) -- distinct from per-page isolated tests that mock useNavigate"
    - "Stateless landing pages: zero hooks, zero props, render identically cold/refresh/navigate (D-02)"

key-files:
  created:
    - frontend/src/pages/AwaitingApproval.jsx
    - frontend/src/pages/verifyLanding.composed.test.jsx
  modified:
    - frontend/src/App.jsx
    - frontend/src/pages/VerifyEmail.jsx
    - frontend/src/pages/VerifyEmail.test.jsx
    - frontend/src/pages/Pending.jsx
    - frontend/src/pages/Pending.test.jsx

key-decisions:
  - "Route path /awaiting-approval and component AwaitingApproval.jsx kept as the working names from CONTEXT.md D-01 (no change needed)"
  - "VerifyEmail.jsx's user.status !== 'Active' predicate left unchanged (not tightened to === 'Pending') per CONTEXT.md's Claude's Discretion -- both are equivalent in practice since Rejected/Disabled rows cannot reach verifyEmail"
  - "AwaitingApproval.jsx body copy uses literal apostrophes (not &apos; HTML entities) matching Pending.jsx's existing convention, not Register.jsx's -- required for the plan's exact-string grep acceptance gates"

patterns-established:
  - "Mutation-and-restore verification recorded as a results table in SUMMARY.md (Phase 34 D-13 convention), not just described as intent"

requirements-completed: [REG-04, REG-06]

# Metrics
duration: 15min
completed: 2026-09-09
---

# Phase 35 Plan 01: Post-Verify Landing Page & VerifyEmail Retargeting Summary

**New stateless `/awaiting-approval` React Router page closes v4.1 W-1 (silent post-verify bounce to `/login`), with a real-`AuthProvider`+real-routing composed test proving the fix red-then-green and `Pending.jsx` retitled to stop conflating "waiting for approval" with "waiting to be linked."**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-09T20:12:38Z
- **Tasks:** 3 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- A verified-but-Pending self-registrant now lands on `/awaiting-approval`, a public, stateless, zero-hook page (`AwaitingApproval.jsx`) stating the full remaining sequence (verified → admin reviews → email on approval → sign in) with exactly one action ("Return to sign in"), surviving refresh and direct URL hits with zero session and zero network calls.
- `VerifyEmail.jsx`'s single `navigate()` call now targets `/awaiting-approval` instead of `/pending` for non-Active verifiers — the one-line fix for W-1, with `AuthContext.jsx`'s token-withholding behavior (locked, D-04) completely untouched.
- `Pending.jsx` is retitled ("Waiting to be linked to your family") and its body no longer uses the noun "approval" — that concept now belongs entirely to the new landing page; its `!user → /login` guard (defence in depth) stays byte-identical.
- A new `verifyLanding.composed.test.jsx` mounts a real `AuthProvider` + real `react-router-dom` `<Routes>` (network mocked only at `graphqlRequest`, no `useNavigate` spy) and reproduces W-1 as an actual red test run before the fix, then pins the fix plus 3 regressions (Active-user session, no-signal `/pending` bounce, direct-hit refresh-safety) after it.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): AwaitingApproval.jsx + App.jsx route + composed test, run and record the W-1 reproduction** - `f7424bb` (test)
2. **Task 2 (GREEN): Retarget VerifyEmail.jsx to /awaiting-approval, update its isolated test, confirm composed suite goes fully green** - `6842f58` (feat)
3. **Task 3: Retitle Pending.jsx (D-07), update its test copy, and mutation-test the new coverage (D-13 item 4)** - `4778ae5` (feat)

_Note: Task 1 is a TDD RED commit per D-12 -- the composed test file is committed alongside the still-unfixed `VerifyEmail.jsx` (destination string untouched until Task 2), so the commit captures the reproduction state, not a passing suite._

## Files Created/Modified

- `frontend/src/pages/AwaitingApproval.jsx` - New stateless landing page (zero hooks, zero props), locked D-05/D-06 copy
- `frontend/src/pages/verifyLanding.composed.test.jsx` - New composed test: real AuthProvider + real routing, 4 test cases (happy path, Active-session, no-signal /pending bounce, direct-hit refresh-safety)
- `frontend/src/App.jsx` - Added `AwaitingApproval` import + public `<Route path="awaiting-approval">`, sibling of `pending`, outside `ProtectedRoute`
- `frontend/src/pages/VerifyEmail.jsx` - Non-Active verifiers now navigate to `/awaiting-approval`; comment updated to explain refresh-safety rationale
- `frontend/src/pages/VerifyEmail.test.jsx` - Destination assertion + test description updated to `/awaiting-approval`
- `frontend/src/pages/Pending.jsx` - Title and body copy retitled per D-07; guard/import lines byte-identical
- `frontend/src/pages/Pending.test.jsx` - Both `screen.getByText(...)` sites (base case + APPR-06 regression) updated to the new body string

## Decisions Made

- Kept the working route path `/awaiting-approval` and file name `AwaitingApproval.jsx` from CONTEXT.md D-01 as-is — no reason to rename.
- Left `VerifyEmail.jsx`'s `user.status !== 'Active'` predicate unchanged (did not tighten to `=== 'Pending'`) per CONTEXT.md's explicit "Claude's Discretion" grant — both predicates are equivalent in practice since Rejected/Disabled rows cannot reach `verifyEmail` today.
- Used literal apostrophes (`'`) rather than `&apos;` HTML entities in `AwaitingApproval.jsx`'s body copy, matching `Pending.jsx`'s existing convention (not `Register.jsx`'s `&apos;` convention) — this also satisfies the plan's exact-string grep acceptance gates, which searched for literal apostrophes.

## Deviations from Plan

None — plan executed exactly as written. All acceptance-criteria greps passed on first attempt (after correcting the apostrophe-encoding choice above during initial authoring, before any commit was made — not a post-hoc fix).

## Test Evidence

### Task 1: W-1 reproduction (RED run, D-12)

Command: `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx` (run BEFORE any change to `VerifyEmail.jsx`)

```
❯ src/pages/verifyLanding.composed.test.jsx (4 tests | 1 failed) 1087ms
     × lands a still-Pending verifier on the awaiting-approval page with no session (W-1 reproduction) 1033ms

FAIL  src/pages/verifyLanding.composed.test.jsx > verify -> landing composed flow (W-1) > lands a still-Pending verifier on the awaiting-approval page with no session (W-1 reproduction)
TestingLibraryElementError: Unable to find an element with the text: /your email address is verified/i.
...
<h4 class="MuiTypography-root MuiTypography-h4 ...">Sign in to Agne</h4>
...
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

The failure rendered the login heading ("Sign in to Agne") where the landing copy was expected — this IS the W-1 bug, reproduced literally by the test harness before the fix existed.

### Task 2: GREEN confirmation

Command: `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx src/pages/VerifyEmail.test.jsx`

```
 Test Files  2 passed (2)
      Tests  9 passed (9)
```

### Task 3: Pending retitle + full verification

Command: `cd frontend && npx vitest run src/pages/Pending.test.jsx src/pages/verifyLanding.composed.test.jsx`

```
 Test Files  2 passed (2)
      Tests  9 passed (9)
```

## Mutation Testing (Phase 34 D-13 convention)

Each mutation was applied, run, confirmed red, then restored and confirmed clean via `git diff --stat` before proceeding to the next.

| # | Mutation | File | Expected Red | Actual Result | Restored & Clean |
|---|----------|------|---------------|----------------|-------------------|
| 1 | Revert `VerifyEmail.jsx` destination back to `'/pending'` | `VerifyEmail.jsx` | Happy-path composed test red; other 3 green | **Confirmed**: `Tests 1 failed \| 3 passed (4)` — happy-path test failed rendering the login heading (identical to Task 1's original red) | Yes — `git diff --stat` empty |
| 2 | Drop "verified" clause from `AwaitingApproval.jsx` paragraph 1 | `AwaitingApproval.jsx` | Happy-path test + direct-hit test (D-13 item 3) both red | **Confirmed**: `Tests 2 failed \| 2 passed (4)` | Yes — `git diff --stat` empty |
| 3 | Drop "as soon as you're approved" clause from `AwaitingApproval.jsx` paragraph 2 | `AwaitingApproval.jsx` | Happy-path test's second-paragraph assertion red | **Confirmed**: `Tests 1 failed \| 3 passed (4)` | Yes — `git diff --stat` empty |
| 4 | Revert `Pending.jsx` body text to the old wording (title untouched) | `Pending.jsx` | Both `Pending.test.jsx` string assertions (base case + APPR-06) red | **Confirmed**: `Tests 2 failed \| 3 passed (5)` | Yes — `git diff --stat` showed only Task 3's own final, not-yet-committed intended change |

All four cycles drove exactly the predicted test(s) red and were fully restored before continuing; `git status --porcelain` confirmed clean of residual mutation before Task 3's commit.

## Final Verification

- `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx src/pages/VerifyEmail.test.jsx src/pages/Pending.test.jsx` → `Test Files 3 passed (3)`, `Tests 14 passed (14)`
- `cd frontend && npx vitest run` (full frontend suite) → `Test Files 45 passed (45)`, `Tests 503 passed (503)`
- Every acceptance-criteria grep gate in all three tasks passed.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `/awaiting-approval` is live, routed, and covered by both the composed harness and its own copy-exactness greps — Plan 02/03 (invited-path copy, mailer templates) can proceed independently; nothing in this plan touches `backend/src/services/mailer.js`, `Register.jsx`, or any resolver.
- `AuthContext.jsx` (D-04, locked) was never opened for editing — confirmed via `git diff` scope of every commit.
- No blockers.

---
*Phase: 35-post-verify-landing-invited-path-copy*
*Completed: 2026-09-09*

## Self-Check: PASSED

- FOUND: frontend/src/pages/AwaitingApproval.jsx
- FOUND: frontend/src/pages/verifyLanding.composed.test.jsx
- FOUND: .planning/phases/35-post-verify-landing-invited-path-copy/35-01-SUMMARY.md
- FOUND commit: f7424bb (Task 1)
- FOUND commit: 6842f58 (Task 2)
- FOUND commit: 4778ae5 (Task 3)
- FOUND commit: d9f907d (SUMMARY.md)
