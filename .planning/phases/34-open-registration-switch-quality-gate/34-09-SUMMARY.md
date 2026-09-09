---
phase: 34-open-registration-switch-quality-gate
plan: 09
subsystem: testing

tags: [vitest, quality-gate, ci, workspaces, sc-5]

# Dependency graph
requires:
  - phase: 34-04
    provides: "PublicSignupSwitch component wired as the first region of InvitationsPage (ADMIN-01/ADMIN-03), plus PublicSignupSwitch.test.jsx"
  - phase: 34-06
    provides: "Register.jsx's !token branch gated behind publicRegistrationEnabled with a re-query-on-refusal swap (ADMIN-02, D-07)"
  - phase: 34-07
    provides: "security.boundaries.test.js — the SEC-04 authorization matrix and the SEC-05 schema-driven sweep"
  - phase: 34-08
    provides: "The D-13 mutation-testing record (M1..M8), confirming every new boundary test is genuinely load-bearing, with the tree restored clean"
provides:
  - "SC-5 gate record: npm test --workspaces green in one serial run, backend 72 files/648 passed+3 skipped, frontend 44 files/498 passed, fully reconciled against the measured baseline with every test-count delta attributed to a named file"
  - "Confirmation the pre-existing 3-skip backend count is unchanged, and no pre-existing test file lost coverage"
  - "Task 2 human sign-off recorded: all three manual verifications (A migration 021, B UI-SPEC visual match, C the genuine mid-form race) APPROVED by the developer; production apply of migration 021 to Hetzner explicitly DEFERRED to a separate operator step"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SC-5 reconciliation without a second test run: git diff against the pre-phase-34 base commit (2f33d2f) isolates exactly which test files were added vs. modified, and static it()/it.each() counts against each new/modified file arithmetically reconcile the full workspace delta — avoids a second ~6.5-minute backend run just to explain a number."

key-files:
  created:
    - ".planning/phases/34-open-registration-switch-quality-gate/34-09-SUMMARY.md"
  modified: []

key-decisions:
  - "Reconciled the full per-file test-count delta via git diff --stat --diff-filter against the pre-phase-34 base commit plus static it()/it.each() counts, rather than re-running vitest a second time with a verbose per-file reporter — the plan's ~6.5-minute single-serial-run constraint is honored while still satisfying the 'compare file-by-file if totals do not reconcile' acceptance bar (they reconciled exactly, to the test)."
  - "Task 2 is a blocking human-verify checkpoint (gate=\"blocking\"); per the executor's explicit instruction, no part of verifications A, B, or C was attempted, simulated, or marked complete from automated evidence. The checkpoint was presented verbatim; the developer replied \"approved\" for all three, and separately selected \"Deferred\" for the production apply of migration 021 to Hetzner — the same treatment Phase 30 gave its 019 production apply (F-03)."
  - "34-VALIDATION.md § Manual-Only Verifications has no status/outcome columns (Behavior / Requirement / Why Manual / Test Instructions only) — left untouched rather than force-fitting an outcome into a table not shaped to record one; the outcome is recorded here instead."

patterns-established: []

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, SEC-04, SEC-05]

# Metrics
duration: ~30min (Task 1 ~25min + Task 2 sign-off recording ~5min)
completed: 2026-09-09
---

# Phase 34 Plan 09: SC-5 Full-Suite Gate — Green, Reconciled to the Test, Human Sign-Off Recorded Summary

**`npm test --workspaces` is green in one serial run (72 backend files / 648 passed + 3 skipped, 44 frontend files / 498 passed), with every test-count delta since the measured baseline attributed to a specific named file — no pre-existing test lost, backend skips unchanged at 3. All three manual verifications (A: migration 021, B: UI-SPEC visual match, C: the genuine mid-form race) were APPROVED by the developer; production apply of migration 021 to Hetzner is explicitly DEFERRED.**

## Performance

- **Duration:** ~30 min (Task 1: file reads, one ~6.6-minute foreground `npm test --workspaces` run, plus git-diff-based reconciliation, ~25 min; Task 2: checkpoint presentation and recording the developer's response, ~5 min)
- **Started:** 2026-09-09T13:56:00Z (approx.)
- **Task 1 completed:** 2026-09-09T14:04:00Z (approx.)
- **Task 2 completed:** 2026-09-09 (developer sign-off recorded)
- **Tasks:** 2 of 2 completed
- **Files modified:** 0 source files (this plan makes no source changes); 1 file created (this SUMMARY)

## Accomplishments

- Confirmed the working tree was clean before running the gate (`git status --porcelain` showed only the pre-existing, untouched `.vscode/` untracked entry — no leftover mutation from plan 34-08).
- Ran `npm test --workspaces` from the repository root exactly once, in the foreground, to completion (~6.6 min backend + ~9.3s frontend). Exit code 0.
- Reconciled every count against the measured baseline (see table below) using `git diff <pre-phase-34-base> --stat --diff-filter=A/D/M` plus static `it()`/`it.each()` counts in each touched file — confirmed the full delta is accounted for without a second full-suite run.
- Confirmed the backend skip count is exactly 3 (unchanged from baseline).
- Confirmed via `git diff --diff-filter=D` that zero test files were deleted, and via per-file diff inspection that no pre-existing test was removed without a same-named replacement.
- Confirmed `git status --porcelain` remained clean (only `.vscode/`) after the full suite run — no source modification was introduced by running tests.

## Task Commits

1. **Task 1: SC-5 — npm test --workspaces green, with counts recorded against the baseline** — `f914b77` (docs; no source files touched, per `files_modified: []` in the plan frontmatter).
2. **Task 2: Human sign-off — migration 021 on a real database, the switch region's visuals, and the genuine mid-form race** — committed with this SUMMARY.md update (docs commit; no source files touched). The checkpoint (`checkpoint:human-verify`, `gate="blocking"`) was presented verbatim to the developer, who responded "approved" and separately selected "Deferred" for the production-apply decision. See "Task 2: human sign-off recorded" below.

**Plan metadata:** committed together with Task 1 (`f914b77`) and this Task 2 recording commit.

## SC-5 Gate Record

**Full run:** `npm test --workspaces`, single foreground invocation, exit code `0`.

| Workspace | Baseline (34-VALIDATION.md) | This run | Delta |
|-----------|------------------------------|----------|-------|
| Backend   | 69 files / 551 passed + 3 skipped (348s) | **72 files / 648 passed + 3 skipped** (396.46s) | +3 files, +97 passed, skips unchanged (3) |
| Frontend  | 43 files / 482 passed (8.5s) | **44 files / 498 passed** (9.27s) | +1 file, +16 passed |
| **Total** | 112 files / 1033 passed + 3 skipped | **116 files / 1146 passed + 3 skipped** | +4 files, +113 passed |

### Backend delta (+97 passed), fully attributed

| File | Status | Tests | Evidence |
|------|--------|-------|----------|
| `backend/src/utils/appSettings.test.js` | new | 13 | 9 static `it()` + 1 `it.each(['yes','TRUE','1',''])` (4 cases) = 13 |
| `backend/src/resolvers/publicRegistrationSwitch.test.js` | new | 26 | Independently confirmed at 26/26 by 34-08-SUMMARY.md's M1 restore-and-rerun |
| `backend/src/resolvers/security.boundaries.test.js` | new | 58 | Independently confirmed at 58/58 by 34-08-SUMMARY.md's M4 restore-and-rerun (dynamically generates one test per schema field via a `for` loop — static grep undercounts this file) |
| **Sum** | | **97** | Matches the measured backend delta exactly (551 + 97 = 648) |

`git diff 2f33d2f --diff-filter=A -- 'backend/**/*.test.js'` confirms these are the *only* three backend test files added since the pre-phase-34 base commit — no other new backend test file exists. `register.test.js` (32 tests, pre-existing) is byte-identical to baseline (absent from the modified-files diff) — it was not touched by this phase at all, consistent with 34-08-SUMMARY's record that plan 34-08 restored the tree exactly.

### Frontend delta (+16 passed), fully attributed

| File | Status | Net test delta | Evidence |
|------|--------|-----------------|----------|
| `frontend/src/components/PublicSignupSwitch.test.jsx` | new | +8 | 8 static `it()` calls (one `describe` block) |
| `frontend/src/pages/Register.test.jsx` | pre-existing, modified | +8 | `git diff 2f33d2f` shows 9 `it(` lines added, 1 `it(` line changed only by adding `async` to an existing test's signature (same test title, not a new or lost test) — net +8 genuinely new tests |
| `frontend/src/pages/InvitationsPage.test.jsx` | pre-existing, modified | 0 | 2 existing tests renamed/re-asserted to cover the new switch region ("shows the invite section but NOT approvals **or the public signup switch**..." / "...**and the public signup switch**...") — same 2 tests, updated titles and assertions, no count change |
| **Sum** | | **+16** | Matches the measured frontend delta exactly (482 + 16 = 498) |

`git diff 2f33d2f --diff-filter=A -- 'frontend/**/*.test.jsx' 'frontend/**/*.test.js'` confirms `PublicSignupSwitch.test.jsx` is the *only* new frontend test file. `git diff 2f33d2f --diff-filter=M -- '**/*.test.js' '**/*.test.jsx'` confirms `InvitationsPage.test.jsx` and `Register.test.jsx` are the *only* two pre-existing test files touched anywhere in the workspace this phase — both accounted for above, with zero net loss.

### The two required checks, verified explicitly (not assumed from exit code 0)

- **Backend skip count still exactly 3:** confirmed in the run output (`Tests 648 passed | 3 skipped (651)`) — unchanged from the measured baseline. No fourth skip appeared.
- **No pre-existing test file lost tests:** confirmed via `git diff <base> --diff-filter=D` (zero test files deleted) and per-file diff inspection of every modified test file (`Register.test.jsx`, `InvitationsPage.test.jsx`) — every `-it(...)` line in the diff pairs with an identical-title `+it(...)` line (a signature-only edit) or is offset by new tests added in the same file. No test disappeared without a same-named replacement.

**Method note:** reconciliation was done via `git diff` against the pre-phase-34 base commit (`2f33d2f`, the last commit of Phase 33) plus static test counts, rather than a second full-suite run — this both avoids the ~6.5-minute cost of re-running the backend suite and avoids any risk of a second process touching the shared `portofolio_test` database while satisfying the plan's "compare file-by-file if totals do not reconcile" instruction. The totals reconciled exactly, down to the individual test.

## Files Created/Modified

- `.planning/phases/34-open-registration-switch-quality-gate/34-09-SUMMARY.md` — this file (created).
- No source files were created or modified by this plan (`files_modified: []` per the plan frontmatter — verification only).

## Decisions Made

See `key-decisions` in frontmatter:
- Used `git diff`-based reconciliation instead of a second full-suite run to explain the per-file test-count delta.
- Did not attempt any part of Task 2's three manual verifications; staged them for the developer per the executor's explicit instruction.

## Deviations from Plan

None — plan executed exactly as written for Task 1. `npm test --workspaces` was run exactly once, in the foreground, and no source file was touched.

## Issues Encountered

None. The suite was green on the single run; no red test, no flake, no need to re-run any file in isolation.

## User Setup Required

None for Task 1. Task 2 required the developer to run the backend/frontend dev servers and sign in as an ADMIN locally against the checkpoint's exact commands and credentials — completed by the developer as part of the sign-off below.

## Task 2: human sign-off recorded

Task 2 (`checkpoint:human-verify`, `gate="blocking"`) was presented verbatim to the developer — prerequisites, verifications A, B and C, and the production-apply question — and this executor did not attempt, simulate, or infer the outcome of any of A/B/C itself.

**Developer's verbatim response to verifications A, B and C:**

> approved

All three manual verifications from `34-VALIDATION.md` § Manual-Only Verifications are recorded as **APPROVED**:

- **A. Migration 021 against a real database (ADMIN-01).** APPROVED. `backend/migrations/manual/021-create-app-settings.sql` was applied to the real local dev database (`portofolio`, not `portofolio_test`); the seeded row, idempotent re-apply (no clobber on a second run), backend boot, and the admin `/invitations` surface reading "Public signup is open" / "Not changed since setup." were all confirmed by the developer.
- **B. Visual sign-off of the switch region against `34-UI-SPEC.md` (ADMIN-01 / ADMIN-03).** APPROVED. The `PublicSignupSwitch` region — icon tint, headline text, `Switch` state, hover/tooltip text, the instant no-dialog close, the confirm-to-open dialog on re-opening, the narrow-viewport column stack, and state persistence across reload — matches the UI-SPEC in both OPEN and CLOSED states, confirmed in a real browser where jsdom cannot observe layout or computed colour.
- **C. The genuine mid-form race (ADMIN-02 / D-07).** APPROVED. The two-browser-session race (anonymous visitor mid-form on `/register`, admin closes the door, visitor submits) swapped to the identical invitation-only view — same eyebrow, title, and info-alert copy as a direct-closed-state load, with no leftover error alert and no timing-leak wording — confirmed by the developer.

**Production-apply decision for migration 021 (asked separately from A/B/C):**

> Deferred

The production apply of `backend/migrations/manual/021-create-app-settings.sql` to the Hetzner deployment is explicitly **DEFERRED** to a separate operator step before the v4.1 milestone closes — not performed as part of this phase. This is the same treatment Phase 30 gave its 019 production apply, recorded there as F-03.

**34-VALIDATION.md § Manual-Only Verifications:** left untouched. That table has four columns (Behavior / Requirement / Why Manual / Test Instructions) with no status or outcome column to fill in — the sign-off outcome is recorded in this SUMMARY instead, per the executor's resume instructions.

## Deferred / follow-ups

- Apply `backend/migrations/manual/021-create-app-settings.sql` to the production (Hetzner) database before the v4.1 milestone closes — deferred by the developer on 2026-09-09.

## Next Phase Readiness

- SC-5's automated half (the full workspace suite) is proven green and fully reconciled.
- All three manual verifications (A, B, C) are APPROVED — Task 2 is fully resolved.
- Requirements ADMIN-01, ADMIN-02, ADMIN-03, SEC-04 and SEC-05 are delivered by this plan.
- Phase 34's only remaining open item is the deferred production apply of migration 021 to Hetzner, tracked above as a follow-up, not a blocker to closing this plan.
- No blockers.

## Self-Check: PASSED

- FOUND: `.planning/phases/34-open-registration-switch-quality-gate/34-09-SUMMARY.md` (this file)
- Verified via `npm test --workspaces` output (captured to scratchpad log): backend 72 files/648 passed+3 skipped, frontend 44 files/498 passed, exit code 0
- Verified via `git diff 2f33d2f --diff-filter=A/D/M`: exactly 4 new test files (3 backend, 1 frontend), exactly 2 pre-existing test files modified (`Register.test.jsx`, `InvitationsPage.test.jsx`), 0 test files deleted
- Verified via `git status --porcelain`: clean before and after the full suite run (only pre-existing, untouched `.vscode/`)
- Verified Task 1 commit `f914b77` exists via `git log --oneline -1`
- Task 2 outcome recorded verbatim from the developer's response as provided by the orchestrator; no automated evidence was substituted for any of A/B/C

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
