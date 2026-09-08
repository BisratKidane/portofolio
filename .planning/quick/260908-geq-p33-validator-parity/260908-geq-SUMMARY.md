---
phase: quick
plan: 01
subsystem: auth
tags: [validation, validator, email, react, mui, testing, vitest]

# Dependency graph
requires:
  - phase: 33-public-signup-form-approval-queue
    provides: Register.validation.js's D-04 agreement test scaffold and ApprovalsPage.jsx's load/error handling, both of which this plan corrects
provides:
  - Register.validation.js's validateEmail agrees with backend/src/utils/emailPolicy.js's assertRegistrationEmail by construction (identical validator.isEmail import), not by fixture approximation
  - Register.validation.test.js's D-04 agreement table broadened with all 9 empirically-confirmed CR-01 divergent inputs plus a CR-02 raw/trimmed relationship-note regression case
  - validateRelationshipNote's 500-char cap check now runs on the raw (untrimmed) value, matching relationshipNotePolicy.js and Register.jsx's actual submission
  - ApprovalsPage.jsx separates loadError from actionError state; a failed row action no longer hides the populated queue and triggers a recovery reload
affects: [33-public-signup-form-approval-queue, future-quick-fixes-touching-client-validation]

# Tech tracking
tech-stack:
  added: ["validator@13.15.35 as a direct frontend production dependency (frontend/package.json)"]
  patterns:
    - "Client-side guard agreement-by-construction: import the identical function the server uses (validator/lib/isEmail.js) instead of a hand-rolled regex approximation"
    - "Split load-failure state from action-failure state in list/detail admin pages so a transient per-row mutation error never blanks unrelated, already-fetched data"

key-files:
  created: []
  modified:
    - frontend/package.json
    - package-lock.json
    - frontend/src/pages/Register.validation.js
    - frontend/src/pages/Register.validation.test.js
    - frontend/src/pages/ApprovalsPage.jsx
    - frontend/src/pages/ApprovalsPage.test.jsx

key-decisions:
  - "Per user's explicit locked decision (superseding 33-RESEARCH.md's test-only-import recommendation), validator is now a real frontend production dependency, imported directly in Register.validation.js -- not test-only"
  - "validateFullName/validateEmail's trim-order was checked for the same raw/trimmed mismatch class as CR-02 and found NOT to apply (both namePolicy.js and emailPolicy.js trim before their own length checks and before storage) -- documented in-code, not re-litigated"

requirements-completed: []

# Metrics
duration: ~12min
completed: 2026-09-08
---

# Phase quick-01: CR-01/CR-02/WR-01 gap closure Summary

**Register.validation.js's email check now imports the same `validator.isEmail` function the backend uses (agreement by construction, proven by a 9-input regression table); its relationship-note cap now checks the raw value; ApprovalsPage.jsx splits load/action error state so a failed approve never blanks the queue.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-08T11:58:00Z (approx, worktree base correction + plan read)
- **Completed:** 2026-09-08T12:05:00Z
- **Tasks:** 2 (both TDD, 4 commits total: test/feat x2)
- **Files modified:** 6

## Accomplishments
- Closed CR-01 (33-REVIEW.md): `validateEmail` now calls `validator/lib/isEmail.js` directly instead of a hand-rolled `EMAIL_FORMAT` regex; the regex and its "only needs to agree on the fixture values" comment are both gone
- Closed CR-02 (33-REVIEW.md): `validateRelationshipNote`'s 500-char cap now checks `raw.length`, not `trimmed.length`, matching `relationshipNotePolicy.js`'s own raw check and `Register.jsx`'s actual raw submission
- Closed WR-01 (33-REVIEW.md): `ApprovalsPage.jsx` now has separate `loadError`/`actionError` state; a failed `approveUser`/`rejectUser` call shows a distinct banner without hiding other pending rows, and triggers a recovery `load()` to refresh a row that lost a concurrent-admin race
- Broadened `Register.validation.test.js`'s D-04 agreement table with all 9 empirically-confirmed CR-01 divergent inputs and the CR-02 raw-note regression case, all asserted against the real backend `assert*` functions
- Added a WR-01 regression test in `ApprovalsPage.test.jsx` proving an unrelated row ("Ada L") survives a failed action on another row ("Joseph Q")

## Task Commits

Each task followed RED -> GREEN (TDD):

1. **Task 1: Close CR-01/CR-02 in Register.validation.js**
   - `f2c05dd` (test) - add failing D-04 agreement fixtures for CR-01/CR-02 divergence
   - `b0d9b08` (feat) - close CR-01/CR-02: Register.validation.js matches backend by construction
2. **Task 2: Close WR-01 in ApprovalsPage.jsx**
   - `e5d6d78` (test) - add failing WR-01 regression: action failure blanks the queue
   - `edc2e4a` (feat) - close WR-01: separate ApprovalsPage load/action error state

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `frontend/package.json` - declares `validator: ^13.15.35` as a direct dependency (matches `backend/package.json`'s exact caret range)
- `package-lock.json` - minimal 2-line update reflecting the new declared dependency (package already hoisted from `backend`, no new content fetched)
- `frontend/src/pages/Register.validation.js` - `validateEmail` imports and calls `validator/lib/isEmail.js`; hand-rolled `EMAIL_FORMAT` regex deleted; `validateRelationshipNote`'s cap check runs on `raw.length` instead of `trimmed.length`; header comment rewritten to drop the "zero dependencies" claim and state the one intentional dependency; `validateFullName` annotated as checked-and-clean for the same bug class
- `frontend/src/pages/Register.validation.test.js` - D-04 agreement table's email fixtures expanded from 3 to 12 rows (9 new CR-01 divergent inputs, all `[input, false]`); relationship-note fixtures expanded from 2 to 3 rows (new CR-02 raw-vs-trimmed case)
- `frontend/src/pages/ApprovalsPage.jsx` - single `error`/`setError` state split into `loadError`/`setLoadError` and `actionError`/`setActionError`; `handleApprove`/`submitReject` catch blocks now call `await load()` after setting `actionError`; render ternary gates only on `loadError`, with `actionError` rendered as a banner above the still-populated queue
- `frontend/src/pages/ApprovalsPage.test.jsx` - added `ROW2` fixture and a new WR-01 regression test

## Decisions Made
- Implemented the user's locked decision (recorded in the plan's `<user_decision_note>`) to declare `validator` as a real frontend production dependency, mirroring `backend/src/utils/emailPolicy.js` exactly -- did not re-open the test-only-import alternative 33-RESEARCH.md originally recommended
- Confirmed and documented in-code (not just in this summary) that `validateFullName` has no CR-02-class raw/trimmed divergence, so a future reader doesn't re-open that investigation

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the plan's exact RED/GREEN behavior spec, and the target code shapes in the plan's `<interfaces>` block were reproduced verbatim (with one cosmetic ordering fix: the plan's target-shape snippet showed the `import` statement without the surrounding header comment, but the action text explicitly said "Add `import isEmail...` as the first line of the file" — the header comment was correctly placed after the import, not before it, matching `backend/src/utils/emailPolicy.js`'s own file structure).

## Verification: old-regex-would-fail check

Per this quick task's `<why_this_matters>` requirement, explicitly confirmed the new test suite is not still fixture-approximating by temporarily reintroducing the exact old `EMAIL_FORMAT` regex into `validateEmail` (renamed to avoid confusion, same pattern `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), running `npm test --workspace frontend -- src/pages/Register.validation.test.js`, observing 9 of the 31 tests fail (all 9 CR-01 fixture rows), and then reverting to the fixed version and re-confirming 31/31 green. This proves the broadened fixture table is a real regression gate, not a fixture set that happens to pass either implementation.

Also ran the plan's own empirical check from `<verification>`:
```
node -e "import('validator/lib/isEmail.js').then(({default:isEmail}) => console.log(isEmail('ada@gmail..com'), isEmail('ada@example.com')))"
```
from `frontend/` — printed `false true`, matching the broadened agreement table exactly.

## Issues Encountered

**Worktree spawned on wrong base.** This worktree's HEAD was on an unrelated v4.0 commit (`52d044e`, UI card-depth work) rather than the Phase 33 code-review commit (`ba76f291`) the plan targets. The prompt's `<worktree_branch_check>` anticipated this exact failure mode ("worktrees in this project have repeatedly spawned on an unrelated v4.0 commit"). Verified the working tree was clean, confirmed `ba76f291` was an ancestor-unrelated commit via `git merge-base`, then ran the prescribed `git reset --hard ba76f2916bc0073c5dea402f745de3874357a44d` to correct the base before any file edits. No work was lost (working tree was clean at the time).

**Plan file lived outside this worktree.** `.planning/quick/260908-geq-p33-validator-parity/260908-geq-PLAN.md` existed only in the main repo checkout (uncommitted, created there by the orchestrator before spawning this worktree) — not reachable via the worktree's own git history. Read it directly via its absolute path in the main repo, since worktrees share the same filesystem even though they have separate git checkouts. All other referenced files (33-REVIEW.md, 33-CONTEXT.md, backend policy files, etc.) existed normally in the worktree's own committed history once the base was corrected.

**`node_modules` did not exist in this worktree.** Ran a full `npm install` from the repo root before any test run to populate `node_modules` for both workspaces; `git status` was clean afterward (lockfile unaffected by the base install), confirming the environment setup didn't introduce any unintended lockfile drift. `validator@13.15.35` was confirmed present at the hoisted root `node_modules` after this install, consistent with the plan's expectation that no new package content would be fetched by the subsequent `npm install validator@13.15.35 --workspace frontend` (Task 1 Step 1) -- and indeed that command completed in under a second with only a 2-line lockfile diff.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three Phase 33 code-review findings (CR-01, CR-02, WR-01) are closed and covered by regression tests that were verified RED before the fix and GREEN after.
- `npm test --workspace frontend` passes in full: 43 files / 482 tests (baseline 471 + 10 CR-01/CR-02 fixture rows + 1 WR-01 regression test).
- `git diff --stat -- backend` is empty for the full plan range (`ba76f291..HEAD`) -- no backend file touched, server-side validation unchanged.
- D-04 (client-side-first validation), D-06 (success copy unaffected), and D-08 (note always shown in full, never truncated) from `33-CONTEXT.md` all remain intact; no locked `33-UI-SPEC.md` copy string was altered.
- No new stubs, placeholders, or unwired data paths were introduced by this plan.
- No new security-relevant surface beyond what the plan's own `<threat_model>` already disposed of (T-quick-SC: `validator` now bundled client-side, accepted as an already-audited, already-approved package per the user's explicit locked decision).

---
*Phase: quick (260908-geq-p33-validator-parity)*
*Completed: 2026-09-08*
