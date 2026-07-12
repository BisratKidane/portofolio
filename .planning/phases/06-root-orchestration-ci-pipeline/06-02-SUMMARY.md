---
phase: 06-root-orchestration-ci-pipeline
plan: 02
subsystem: infra
tags: [github-actions, ci, live-verification, vitest]

# Dependency graph
requires:
  - phase: 06-root-orchestration-ci-pipeline
    provides: "06-01: root npm test fan-out and .github/workflows/ci.yml, never yet executed on real GitHub infrastructure"
provides:
  - "Live confirmation that a real push to origin triggers .github/workflows/ci.yml and reaches a success conclusion, with visible backend (9 files/39 tests) and frontend (4 files/12 tests) pass output"
  - "Live confirmation that a push carrying a deliberately failing test reaches a failure conclusion, with the log naming backend/src/smoke.test.js's specific assertion as the cause"
  - "Proof that a scratch branch and its broken commit can be fully removed (local + remote) leaving no trace on any long-lived branch"
affects: [ci-pipeline, deployment, branch-protection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gh run watch <id> / gh run view <id> --json conclusion used to poll a live Actions run to terminal status autonomously, without relying on a human to check the Actions UI"

key-files:
  created: []
  modified: []

key-decisions:
  - "Task 1 required no file changes -- family's existing 06-01 commits (d6882ad, 62b5b04, 04fd308, e7413ea) were pushed as-is via `git push origin family`, since they were already committed and just needed to reach origin for the first time"
  - "Task 2's break-and-revert cycle was done entirely on a throwaway scratch branch (ci-smoke-check); the broken assertion was never committed to family, so no revert commit was needed on family itself -- deleting the scratch branch (local + remote) was sufficient cleanup"

patterns-established: []

requirements-completed: [CI-01, CI-02, CI-03]

# Metrics
duration: 10min
completed: 2026-07-12
---

# Phase 6 Plan 2: Root Orchestration & CI Pipeline -- Live Verification Summary

**Pushed `family` to GitHub and watched .github/workflows/ci.yml go green (run 29196084093, conclusion `success`, backend 39/39 + frontend 12/12 tests passing), then pushed a scratch branch with a deliberately broken assertion and watched the same workflow go red (run 29196296939, conclusion `failure`, log naming `src/smoke.test.js:5:19 AssertionError: expected 2 to be 3`), before fully reverting and deleting the scratch branch.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-12T14:21:00Z (approx.)
- **Completed:** 2026-07-12T14:31:07Z
- **Tasks:** 2
- **Files modified:** 0 net (smoke.test.js was modified then reverted; final diff against family is empty)

## Accomplishments

- Confirmed live, not just structurally: a real `git push origin family` triggers `.github/workflows/ci.yml` on GitHub's infrastructure and the run reaches a `success` conclusion end-to-end -- services.mysql health check passed, `npm ci` succeeded, `npm test` succeeded.
- Confirmed the run's own test log shows both workspaces passing: backend `9 passed (9)` test files / `39 passed (39)` tests, frontend `4 passed (4)` test files / `12 passed (12)` tests.
- Confirmed live: a push carrying an intentionally-broken `backend/src/smoke.test.js` (`expect(1 + 1).toBe(3)`) produces a `failure` conclusion on the same workflow, and the failure log names the exact file, assertion, and line (`src/smoke.test.js:5:19`, `AssertionError: expected 2 to be 3`) rather than an unrelated infrastructure error -- proving CI-03's "red build is visible" is genuinely wired end-to-end.
- Confirmed cleanup: `backend/src/smoke.test.js` is byte-identical to its original content on `family`, and the `ci-smoke-check` scratch branch exists neither locally nor on origin.

## Task Commits

Task 1 required no source file changes (git/CI operations only) -- it pushed the four pre-existing 06-01 commits (`d6882ad`, `62b5b04`, `04fd308`, `e7413ea`) to origin for the first time. No new commit was created for Task 1.

Task 2's one commit lived exclusively on the deleted scratch branch and is intentionally not part of `family`'s history:

1. **Task 2: Prove CI-03** - `90fdc49` (test) - committed on `ci-smoke-check`, pushed to origin, confirmed red, then the branch (and therefore the commit) was deleted both locally (`git branch -D`) and on origin (`git push origin --delete`). This is expected per the plan's threat mitigation (T-06-05): the broken test must never persist on any branch, including as unreachable history behind a still-existing ref.

**Plan metadata:** (pending -- see final commit below)

## Files Created/Modified

- `backend/src/smoke.test.js` - Temporarily changed to `expect(1 + 1).toBe(3)` on the `ci-smoke-check` scratch branch only, then reverted to `expect(1 + 1).toBe(2)`. Confirmed via `git diff -- backend/src/smoke.test.js` on `family` showing no difference.

## Decisions Made

See `key-decisions` above -- no file changes were needed for Task 1 (push-only), and Task 2's revert required no commit on `family` since the breakage never touched that branch.

## Deviations from Plan

None - plan executed exactly as written. Both tasks completed autonomously via `gh` (authenticated as `BisratKidane`, scopes include `repo`) without hitting the dynamic-auth-gate fallback described in Task 1's `<action>`.

## Issues Encountered

None. Both Actions runs completed within the polling window (~1m19s for the green run, ~1m for the red run) with no flakiness, image-pull delays, or health-check timeouts.

## Live Verification Evidence

| Task | Run ID | Branch | Head SHA | Conclusion | URL |
|------|--------|--------|----------|------------|-----|
| 1 (green) | 29196084093 | family | e7413eadb83206d1820f0a15fcb63990fa2a2611 | success | https://github.com/BisratKidane/portofolio/actions/runs/29196084093 |
| 2 (red) | 29196296939 | ci-smoke-check (deleted) | 90fdc496e34e53987d46f1c5b51365c60a45ea85 | failure | https://github.com/BisratKidane/portofolio/actions/runs/29196296939 |

Green run test log excerpt:
```
Test Files  9 passed (9)
     Tests  39 passed (39)
...
Test Files  4 passed (4)
     Tests  12 passed (12)
```

Red run test log excerpt:
```
FAIL src/smoke.test.js > smoke > runs a trivial passing assertion
AssertionError: expected 2 to be 3 // Object.is equality
 ❯ src/smoke.test.js:5:19
Test Files  1 failed | 8 passed (9)
     Tests  1 failed | 38 passed (39)
```

## User Setup Required

None - no new environment variables or dashboard configuration required by this plan. The one-time branch-protection step documented in 06-01's README section remains a separately-tracked manual action, unaffected by this plan.

## Next Phase Readiness

- CI-01, CI-02, CI-03 are now fully satisfied with live, GitHub-hosted evidence (not just structural/local reasoning) -- Phase 6 (root-orchestration-ci-pipeline) is complete.
- This was the final plan (2 of 2) in Phase 6, which is the last phase of the milestone per ROADMAP.md.
- No blockers carried forward. The one remaining manual step (enabling branch-protection required-status-check on the `test` job) is documented in README.md and does not block this plan's or phase's completion.

---
*Phase: 06-root-orchestration-ci-pipeline*
*Completed: 2026-07-12*
