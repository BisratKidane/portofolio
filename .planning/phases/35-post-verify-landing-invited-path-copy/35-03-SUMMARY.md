---
phase: 35-post-verify-landing-invited-path-copy
plan: 03
subsystem: quality-gate
tags: [vitest, grep-sweep, uat, quality-gate]

# Dependency graph
requires:
  - phase: 35-01
    provides: "the /awaiting-approval landing page, the retargeted VerifyEmail navigate, and the retitled Pending page"
  - phase: 35-02
    provides: "the reworded invited-path copy on Register.jsx and both mailer templates"
provides:
  - "SC-5 gate record: 11/11 grep checks, full-workspace suite green, every count delta attributed"
  - "D-10 boundary proven phase-wide (not just per-plan): zero diff across backend/src/resolvers, backend/src/schemas, frontend/src/context/AuthContext.jsx"
  - "Developer sign-off on the one 35-VALIDATION.md Manual-Only Verification row"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline drift caught by static attribution: when a measured suite count exceeded the recorded baseline, the discrepancy was resolved by proving the phase's own delta from the diff rather than by re-recording the new number"

key-files:
  created: []
  modified: []

key-decisions:
  - "Two stale baselines in the plan were corrected rather than accepted: the recorded frontend baseline of 498 measures 499 at the pre-phase base commit, and the recorded backend baseline of 648 is stale by 2 (true base 650). Both drifted from the Phase 34 record; neither is attributable to Phase 35."
  - "The full-workspace run was executed in the foreground with no timeout wrapper, per the project rule that a killed vitest wedges the MariaDB test DB."

patterns-established: []

requirements-completed: [REG-04, REG-06, INVITE-03]

# Metrics
duration: 12min
completed: 2026-09-10
---

# Phase 35 Plan 03: Phase Quality Gate Summary

**Proved by grep that every Do-not-use phrase is gone from its forbidden surface, that the D-10 locked boundary held across the entire phase, that the full workspace suite is green with every count delta attributed, and captured the developer's sign-off on the visual checks jsdom cannot make.**

## Task 1 — Grep sweep (11/11 PASS)

| # | Command | Actual | Expected | Result |
|---|---------|--------|----------|--------|
| 1 | `grep -ci "approval" frontend/src/pages/Pending.jsx` | `0` | `0` | PASS |
| 2 | `grep -c "Waiting to be linked to your family" frontend/src/pages/Pending.jsx` | `1` | `1` | PASS |
| 3 | `grep -c "administrator will review and approve your account" frontend/src/pages/Register.jsx` | `0` | `0` | PASS |
| 4 | `grep -c "review and approve\|reviews and approves" backend/src/services/mailer.js` | `0` | `0` | PASS |
| 5 | `grep -c "activate your account" backend/src/services/mailer.js` | `0` | `0` | PASS |
| 6 | `grep -c "Verify it and you can sign in right away." frontend/src/pages/Register.jsx` | `1` | `1` | PASS |
| 7 | `grep -c "Once you register and verify your email, you can sign in right away." backend/src/services/mailer.js` | `2` | `2` | PASS |
| 8 | `grep -c "Please confirm this is your email address." backend/src/services/mailer.js` | `2` | `2` | PASS |
| 9 | `grep -c "Your email address is verified" frontend/src/pages/AwaitingApproval.jsx` | `1` | `1` | PASS |
| 10 | `grep -c "Registration received. Verify your email to activate your account." backend/src/resolvers/user.resolver.js` | `2` | `2` | PASS |
| 11 | `git diff --stat 876ec38 -- backend/src/resolvers backend/src/schemas frontend/src/context/AuthContext.jsx \| wc -l` | `0` | `0` (empty) | PASS |

Check 11 is the phase-wide D-10 proof: measured against `876ec38` (the last commit before Plan 35-01 started), the entire phase produced zero lines of diff across the resolver, schema, and AuthContext paths.

## Task 2 — `npm test --workspaces` (one foreground run, exit 0)

Run started 11:19:33, backend duration 393.34s, frontend duration 8.40s. No run was killed or retried.

```
 RUN  v4.1.10 /Users/bisrat/Projects/portofolio/backend
 Test Files  72 passed (72)
      Tests  652 passed | 3 skipped (655)
   Duration  393.34s

 RUN  v4.1.10 /Users/bisrat/Projects/portofolio/frontend
 Test Files  45 passed (45)
      Tests  504 passed (504)
   Duration  8.40s
```

### Count reconciliation

**Frontend — measured base, not the recorded base.** The plan carried a Phase 34 baseline of 44 files / 498 passed. The pre-phase base commit `876ec38` was checked out into a throwaway worktree and measured directly: **44 files / 499 passed**. The recorded 498 was stale by one; the drift predates this phase.

| Test file | Change | Net tests |
|---|---|---|
| `frontend/src/pages/verifyLanding.composed.test.jsx` | added | +4 |
| `frontend/src/pages/Register.test.jsx` | modified | +1 |
| `frontend/src/pages/VerifyEmail.test.jsx` | modified (test renamed, destination assertion changed) | 0 |
| `frontend/src/pages/Pending.test.jsx` | modified (body-string assertions only) | 0 |

499 + 5 = **504 measured**. Files 44 + 1 = **45 measured**. Exact match.

**Backend — stale baseline proven by static attribution.** Measured 652 against a recorded baseline of 648, an apparent +4 where the plan attributed +2. Rather than accept the new number, the phase's own delta was proven from the diff:

- `git diff 876ec38..HEAD --stat -- backend/` shows the entire phase touched exactly **two** backend files: `mailer.js` and `mailer.test.js`.
- `mailer.test.js` diff contains **+2** test declarations and **0** removals (`it('promises "verify then sign in"…')` and `it('is path-neutral: confirms the address without promising activation or a review…')`).
- `--diff-filter=AD` over `backend/**/*.test.js` returns nothing — no backend test file was created or deleted. File count is 72 at base and 72 now.

Since no other backend test file was touched, the phase's backend delta cannot exceed +2. The true base is therefore **650**, and the recorded 648 was stale by 2 — the same class of drift as the frontend's 498. Not attributable to Phase 35.

- Skip count: **3**, unchanged from baseline (pre-existing, documented engine-gated skips — no new skips introduced).
- Deleted test files: **0** (`--diff-filter=D` returns nothing).

## Task 3 — Human sign-off (blocking checkpoint)

The four visual checks from `35-UI-SPEC.md` sections 1-5 were presented to the developer verbatim: **A** the `/awaiting-approval` landing page including a direct no-session hit, **B** the retitled `/pending` page, **C** the invitation email (text + HTML) and the invited-path success paragraph, **D** the shared verification email.

**Developer's verbatim response: "Approved — all four pass"** — the landing page, `/pending`, the invitation email and the verification email all match `35-UI-SPEC.md`.

This resolves the single Manual-Only Verification row in `35-VALIDATION.md`. No deviations were named.

## Requirements Closed

- **REG-04** — a verified self-registrant lands on an honest awaiting-approval page instead of a silent bounce to `/login`.
- **REG-06** — `/pending` no longer conflates approval with family-linking.
- **INVITE-03** — nobody on the invited path is promised an admin review that Phase 31 removed.

## Issues Encountered

Two stale test-count baselines inherited from the Phase 34 record (frontend 498 vs measured 499; backend 648 vs proven 650). Both were resolved by attributing this phase's own delta from the diff rather than by silently adopting the new totals. Worth carrying the corrected figures (frontend 45/504, backend 72/652+3) into the next phase's baseline.

## Deviations from Plan

Tasks 1-3 were executed inline by the orchestrator rather than by a spawned executor agent, after two consecutive background executor sessions were cut off mid-run. Scope, commands, and acceptance criteria are unchanged. This also kept the ~6.5-minute backend run under direct foreground control, honoring the project rule that a killed vitest wedges the MariaDB test DB.

---
*Phase: 35-post-verify-landing-invited-path-copy*
*Completed: 2026-09-10*
