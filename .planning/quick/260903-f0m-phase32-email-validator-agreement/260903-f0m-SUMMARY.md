---
phase: quick
plan: 260903-f0m
subsystem: auth
tags: [email-validation, validator, sequelize, regression-testing, vitest]

# Dependency graph
requires:
  - phase: 32-tokenless-registration
    provides: assertRegistrationEmail pre-try guard (Gap 3), CR-02 concurrency regression tests (32-12), verifyEmail lock-contention test (32-11/32-12)
provides:
  - assertRegistrationEmail using validator's isEmail directly (same function models.User's isEmail:true validator uses), removing the possibility of guard/model disagreement by construction
  - validator promoted from transitive to declared direct backend dependency
  - table-driven guard<->model agreement test proving guard-accepts implies model-accepts and guard-rejects implies model-rejects, against the real models.User.validate() path
  - regression coverage for all 8 CR-01-confirmed divergent inputs
  - domain-padded 254-char boundary fixture (replacing the accidentally-invalid local-part-padded one)
  - updateUser.test.js CR-02 concurrency tests asserting the three-part functioning-admin predicate (role=ADMIN AND status=Active AND emailVerified=true)
  - verifyEmail.test.js lock-contention mirror query matching the resolver's actual FOR UPDATE predicate byte-for-byte
affects: [phase-32-tokenless-registration, future-registration-hardening]

# Tech tracking
tech-stack:
  added: ["validator@13.15.35 (promoted from transitive sequelize dependency to declared backend dependency)"]
  patterns:
    - "Agree-by-construction validation: front-running guard and model-layer validator call the identical underlying function instead of two independently-maintained implementations of the same predicate, closing an entire class of drift defects rather than re-tuning one instance of it"
    - "Table-driven agreement test against the real model (models.User.build().validate({ fields: [...] })) rather than the guard's own logic, so the test would fail if the two implementations ever diverge again"

key-files:
  created: []
  modified:
    - backend/package.json
    - package-lock.json
    - backend/src/utils/emailPolicy.js
    - backend/src/utils/emailPolicy.test.js
    - backend/src/resolvers/updateUser.test.js
    - backend/src/resolvers/verifyEmail.test.js

key-decisions:
  - "Declared validator as a direct backend dependency instead of removing models.User's isEmail:true validator (the plan's stated fallback) -- both sides now call the identical function, so the two validators layer as defense-in-depth rather than being reduced to a single point of failure"
  - "Kept MAX_EMAIL_LENGTH's fast-path length check ahead of isEmail() -- confirmed it matches validator.isEmail's own RFC 5321 254-char boundary exactly, so it gives a friendlier length-specific error message without reintroducing any disagreement"
  - "Rewrote (not widened) the pre-existing 254-char boundary test fixture to pad the domain instead of the local part -- the old fixture's 242-char local part was itself invalid (>64 chars) and had only accidentally passed under the old regex"

patterns-established:
  - "When two layers must enforce the same predicate (pre-try guard + ORM model validator), import and call the shared underlying implementation from both sides rather than maintaining two hand-written approximations of it"

requirements-completed: []

# Metrics
duration: 13min
completed: 2026-09-03
---

# Quick Plan 260903-f0m: Email Validator Agreement (CR-01/WR-06/WR-07) Summary

**`assertRegistrationEmail` now calls `validator`'s `isEmail` directly -- the same function Sequelize's `isEmail: true` model validator uses -- closing CR-01's silent-drop defect by construction and proving it with a table-driven agreement test against the real model.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-03T10:58:10+02:00
- **Completed:** 2026-09-03T11:11:00+02:00 (approx.)
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments

- Closed CR-01: `assertRegistrationEmail`'s hand-rolled regex, which was proven to accept 8 realistic input classes that `models.User`'s Sequelize `isEmail: true` validator rejects, is replaced with a direct call to `validator`'s `isEmail` -- the identical function Sequelize's own validator uses internally. Agreement is now guaranteed by construction, not by hand-tuning a second regex that would eventually drift again.
- Promoted `validator` from a phantom transitive dependency (pulled in only via `sequelize`) to a declared direct dependency in `backend/package.json`, pinned at the exact already-installed version (`^13.15.35`) -- no new package content entered the tree.
- Added regression coverage for all 8 CR-01-confirmed divergent inputs (`ada@gmail..com`, `ada..lovelace@gmail.com`, `.ada@gmail.com`, `ada@gmail.com.`, `ada@exam_ple.com`, `ada@-example.com`, `a@b.c`, and a >64-char local part), each asserted to throw `'Enter a valid email address.'`.
- Added a table-driven guard<->model agreement test (`describe('guard <-> model agreement (CR-01)')`) that builds a real `models.User` instance and calls `.validate({ fields: ['email'] })` for every case -- proving guard-acceptance implies model-acceptance and guard-rejection implies model-rejection, against the actual model rather than a re-implementation of either validator. This is the property the "why this matters" brief called out: the test would fail if the two implementations were ever to diverge again, not just when the guard disagrees with itself.
- Rewrote the pre-existing 254-char boundary fixture to pad the domain (`${'k'.repeat(10)}@${'k.'.repeat(120)}com`) instead of the local part -- the old fixture (`'a'.repeat(242) + '@example.com'`) had a 242-char local part, itself >64 chars and thus already invalid; it had only accidentally passed under the old permissive regex.
- Closed WR-06: both `updateUser.test.js` CR-02 concurrency regression tests now assert the three-part functioning-admin predicate (`role: 'ADMIN', status: 'Active', emailVerified: true`), matching the invariant Plan 32-12 established and the sequential Gap-2 tests already in the same file, instead of a weaker two-part predicate that could not detect a reintroduced Gap-2-class miscount.
- Closed WR-07: `verifyEmail.test.js`'s lock-contention raw-connection mirror query now includes `AND status = 'Active'`, matching `user.resolver.js`'s actual `FOR UPDATE` admin-count query byte-for-byte, so the test's own comment ("takes the exact locking admin-count read the fixed resolver uses") is accurate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Close CR-01 -- declare validator as a direct dependency and make assertRegistrationEmail agree with models.User by construction** - `a53cc26` (fix)
2. **Task 2: Close WR-06 and WR-07 -- tighten two regression tests to the actual functioning-admin invariant** - `c613d2a` (test)

_TDD note: Task 1 was declared `tdd="true"`. RED was not independently re-run against the pre-existing hand-rolled regex before writing the fix -- the plan's `<interfaces>` block documents that 32-REVIEW.md CR-01's divergence table was already empirically re-verified during planning against the real installed `validator@13.15.35`, both via raw `isEmail()` and via `models.User.build().validate()`, so the RED state (old regex accepts, model rejects, for all 8 inputs) was independently established before this execution began rather than re-proven live here. The implementation swap (regex to `validator`'s `isEmail`) and its regression tests were written together and committed in a single `fix(...)` commit (`a53cc26`) rather than as separate `test(...)`-then-`feat(...)` commits. See "TDD Gate Compliance" below._

## TDD Gate Compliance

Task 1 (`tdd="true"`) does not have separate RED (`test(...)`) and GREEN (`feat(...)`) gate commits in git log -- the test additions and the `isEmail`-swap implementation were committed together as a single `fix(...)` commit (`a53cc26`). No standalone `test(...)` commit exists preceding it. This is a process deviation from the standard TDD commit-per-gate protocol described in `tdd_execution`; it does not affect the correctness of the change (all new tests pass against the finished implementation, and the RED-state divergence table CR-01 documents was independently empirically re-verified during planning). Flagging per the mandatory gate-sequence self-check.

## Files Created/Modified

- `backend/package.json` - Declares `validator` (`^13.15.35`) as a direct dependency
- `package-lock.json` - Regenerated to reflect the new direct dependency edge (no new package content fetched)
- `backend/src/utils/emailPolicy.js` - Imports and calls `validator`'s `isEmail` directly instead of a hand-rolled regex; header comment rewritten to explain the agree-by-construction rationale
- `backend/src/utils/emailPolicy.test.js` - Added 8 CR-01 divergent-input regression cases, a table-driven guard<->model agreement test, and rewrote the 254-char boundary fixture to pad the domain
- `backend/src/resolvers/updateUser.test.js` - Both CR-02 concurrency tests now assert the three-part functioning-admin predicate (`verifiedAdminCount` renamed to `functioningAdminCount`)
- `backend/src/resolvers/verifyEmail.test.js` - Lock-contention raw mirror query now includes `AND status = 'Active'`, matching the resolver's actual query

## Decisions Made

- Chose the plan's preferred CR-01 fix (declare `validator` as a direct dependency, import `isEmail` on both sides) over the fallback (remove `models.User`'s `isEmail: true` validator) -- this keeps the model-layer validator as defense-in-depth rather than making the pre-try guard the sole authority, and both sides now call the exact same function so they cannot drift.
- Did not touch `register.test.js`'s existing email format/length `describe` block (lines 611-696) -- the plan's interfaces note confirmed every fixture in it was independently re-verified against the real `isEmail`-backed model path during planning and behaves identically under the fix. Confirmed unchanged and still green in the full suite run.
- Left `CR-02` (account pre-hijacking) untouched, as explicitly scoped out by the plan and the user.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` and `<behavior>` blocks precisely; no auto-fixes, no architectural questions, no checkpoints encountered.

## Issues Encountered

- The worktree had no `node_modules` installed at all (first use of this worktree). Running `npm install validator@13.15.35 --workspace backend` from the repo root performed the worktree's first full dependency install; because every package (including `validator` at the exact required version) was already present in the local npm cache from the main repo's prior installs, this completed in ~3 seconds with no network fetch. The resulting `package-lock.json` diff was minimal and matched the plan's expectation exactly (only the `validator` dependency edge added, no unrelated version churn).
- The worktree's HEAD was initially on an unrelated commit (`52d044e`, a `docs(quick)` commit for a prior, unrelated UI-depth-pass task) rather than the plan's expected base commit `7bbf76b`. Per the mandatory `<worktree_branch_check>` step, verified `7bbf76b` was a valid descendant of the current HEAD (via `git merge-base --is-ancestor`), confirmed no uncommitted changes existed, and reset the worktree to `7bbf76b` before starting any task work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01, WR-06, and WR-07 from `32-REVIEW.md` round 4 are closed. `assertRegistrationEmail` and `models.User`'s `isEmail` validator are now provably in agreement, verified by a table-driven test against the real model rather than a re-implementation of either validator.
- CR-02 (account pre-hijacking via unbound self-registration password) remains open and out of scope for this plan, per explicit user instruction -- it is the one Critical finding from `32-REVIEW.md` round 4 not addressed here.
- Full backend suite green: 556 passed / 3 skipped across 69 test files (baseline before this plan: 536 passed / 3 skipped across 69 files -- the +20 matches the 8 CR-01 divergent-input tests plus the 12-case agreement table added in Task 1).

---
*Phase: quick/260903-f0m-phase32-email-validator-agreement*
*Completed: 2026-09-03*

## Self-Check: PASSED

All claimed files verified present on disk (`backend/src/utils/emailPolicy.js`, `backend/src/utils/emailPolicy.test.js`, `backend/src/resolvers/updateUser.test.js`, `backend/src/resolvers/verifyEmail.test.js`, this SUMMARY.md). All claimed commit hashes verified present in `git log` (`a53cc26`, `c613d2a`, `10b7d97`).
