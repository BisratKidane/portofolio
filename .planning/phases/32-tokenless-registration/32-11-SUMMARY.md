---
phase: 32-tokenless-registration
plan: 11
subsystem: auth
tags: [sequelize, mysql, verifyEmail, updateUser, resendVerificationEmail, account-status, defense-in-depth]

# Dependency graph
requires:
  - phase: 32-09
    provides: "the ADMIN_EMAIL zero-admin bootstrap write (role: 'ADMIN' + status: 'Active') whose unscoped `where: { id: user.id }` this plan narrows"
  - phase: 32-10
    provides: "updateUser's runUpdate transaction callback with findByPk(..., { lock: t.LOCK.UPDATE }), the insertion point for this plan's status guard"
provides:
  - "verifyAndPromote's ADMIN_EMAIL bootstrap write is scoped to `status: { [Op.in]: ['Pending', 'Active'] }`, so a Rejected/Disabled account matches zero rows and is never resurrected to Active ADMIN"
  - "updateUser refuses any edit of a Rejected/Disabled target with 'This account is not editable.', before any last-administrator counting runs"
  - "resendVerificationEmail silently no-ops for a Rejected/Disabled account, minting no new verification token"
  - "6 regression tests (2 per guard) proving the invariant at the outcome level, each mutation-tested falsifiable"
affects: [phase-32-verification, phase-32-review, phase-33-admin-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Layered status invariant: a conditional-UPDATE WHERE clause as the structural primary guarantee, plus independent guards on each upstream path that could supply the precondition -- so removing any single layer does not breach the invariant"
    - "Outcome-level security assertion: a denied promotion is proven inert by feeding the mutation's own returned token back through getUserFromRequest and asserting it does not authenticate, not merely by asserting two columns went unwritten"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/verifyEmail.test.js
    - backend/src/resolvers/updateUser.test.js
    - backend/src/resolvers/resendVerificationEmail.test.js

key-decisions:
  - "Scoped the bootstrap write's WHERE clause to ['Pending', 'Active'] rather than adding a pre-read status check, mirroring the invited-registrant auto-activation block's existing conditional-update pattern one status wider (the bootstrap must also accept an already-Active account promoted by a prior deploy)"
  - "Did not branch on the affected-row count: 0 rows already leaves role/status exactly as they were, which is precisely the 'promote nobody' outcome, so a branch would add a path with no distinct behaviour"
  - "Made updateUser's refusal a blanket one regardless of which input fields are touched -- a Rejected/Disabled account can only ever be reached there as an admin's target, since getUserFromRequest already hard-requires status === 'Active' for self-edit, so no legitimate case is blocked"
  - "Kept resendVerificationEmail's refusal a silent return rather than a thrown error, preserving the function's existing enumeration-uniform response shape (SEC-01)"
  - "Rewrote rather than softened the prior 26-line in-code comment: its 'No reachable path' claim was demonstrably false, and both reissue paths it overlooked are now closed and named in the replacement"

patterns-established:
  - "Defence-in-depth for status invariants: guard the write AND every path that can supply its precondition, and state in-code which layers exist so a future reader does not collapse them back to one"

requirements-completed: [REG-02]

# Metrics
duration: ~55min (spanning three host-sleep interruptions)
completed: 2026-09-03
---

# Phase 32 Plan 11: Scope the ADMIN_EMAIL Bootstrap to a Promotable Status Summary

**The ADMIN_EMAIL zero-admin bootstrap can no longer resurrect a Rejected or Disabled account to Active ADMIN: the write's own WHERE clause excludes those statuses, and the two paths that could hand such an account a live verification token in the first place -- `updateUser` and `resendVerificationEmail` -- now independently refuse it.**

## Performance

- **Duration:** ~55 min of working time
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments

- Closed Gap 1 from `32-VERIFICATION.md` (Truth 6, 3rd manifestation): Plan 32-09 fixed the bootstrap's usability by granting `status: 'Active'` alongside `role: 'ADMIN'` but removed the status precondition entirely instead of scoping it, leaving `where: { id: user.id }` to unconditionally promote **any** ADMIN_EMAIL-matching account holding a live token.
- Falsified and replaced the in-code comment that justified the omission. Its claim that "No reachable path" lets a Rejected/Disabled account re-enter `verifyEmail` was wrong: neither `updateUser` nor `resendVerificationEmail` had any account-status guard before reissuing a verification token.
- Built the fix as two independent layers rather than one, so the invariant does not rest on the WHERE clause alone.
- Proved each guard falsifiable by mutation testing: deleting any one of the three reddens exactly its own 2 tests and no others.

## Task Commits

1. **Task 1: RED-then-GREEN — scope the ADMIN_EMAIL bootstrap write to a promotable status** — `61ee9c2` (fix)
2. **Task 2: RED-then-GREEN — independently close the two reissue paths** — `11a97d7` (fix)
3. **Task 3: Self-check regression gate** — no code changes; verification recorded below

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` — re-added `Op` to the sequelize import; scoped the bootstrap write to `status: { [Op.in]: ['Pending', 'Active'] }`; rewrote the comment above it; added the `updateUser` status refusal and the `resendVerificationEmail` silent no-op
- `backend/src/resolvers/verifyEmail.test.js` — 2 tests presenting a Rejected and a Disabled account's live token to the bootstrap
- `backend/src/resolvers/updateUser.test.js` — 2 tests proving `updateUser` refuses a Rejected/Disabled target
- `backend/src/resolvers/resendVerificationEmail.test.js` — 2 tests proving no new token is minted for a Rejected/Disabled account

## Decisions Made

See `key-decisions` in frontmatter. The load-bearing one: the fix is deliberately three guards, not one. The bootstrap's WHERE clause is the structural guarantee, and the two upstream refusals mean the invariant survives the removal of any single layer.

## Verification

**Task 3 cross-checks (confirmed by reading the diff, not assumed):**

- Invited-registrant auto-activation block and its own conditional update (`where: { id: user.id, status: 'Pending' }`) — **unchanged**, no `+`/`-` lines touch it.
- D-12 admin-notification condition and the D-11 `pendingApprovals` query — **unchanged**, no `+`/`-` lines touch them.
- `updateUser`'s new status guard sits at `:678`, **before** `otherVerifiedAdminCount`'s definition (`:684`) and both its call sites (`:697` role-change, `:723` email-change) — a Rejected/Disabled target is refused before any last-administrator counting or locking runs.

**Acceptance greps:** `This account is not editable.` → exactly 1 match; Rejected/Disabled guard sites → 2 (`:567` resend, `:677` updateUser); `[Op.in]: ['Pending', 'Active']` → present at `:473`; `No reachable path` → 0 matches.

**Targeted regression gate:** 79 passed | 2 skipped (81) — matches the plan's predicted count exactly (baseline 73 passed | 2 skipped, +6 new tests, none removed).

**Full backend suite:** 68 files, **517 passed | 3 skipped (520)** — matches the plan's predicted count exactly against `32-VERIFICATION.md`'s documented 511 passed | 3 skipped baseline.

**README:** the ADMIN_EMAIL bootstrap documentation (Features bullet, Authentication-workflow step 1) was checked and is **accurate as-is — no wording change needed**. The documented happy path registers a fresh account (Pending) and verifies it, which this plan does not alter; Rejected/Disabled accounts are not part of any documented flow.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**Host-sleep interruptions (environmental, not code).** The executing agent was terminated three times by `API Error: Your computer went to sleep mid-response`, each time after completing work but before committing. Task 1's commit survived; Task 2's changes sat uncommitted in the worktree across all three interruptions. The orchestrator verified the work independently (diff review, acceptance greps, full test run) and completed the commits.

**Wedged MariaDB blocking all test runs.** A SIGKILLed vitest run left two connections stuck for 48,263s (13.4h) — `TRUNCATE users` holding a table metadata lock and `TRUNCATE family_members` queued behind it — which blocked `globalSetup`'s `sequelize.sync({ force: true })` (a DROP TABLE) indefinitely. Every subsequent test invocation hung after the vitest banner with ~2s of CPU. `KILL <id>` did not clear them: the threads sat in `Killed` state inside an uninterruptible TRUNCATE. Recovery required stopping the brew service, force-terminating the wedged `mariadbd` (which was itself stuck spinning in shutdown for 3d15h and still holding `ibdata1` / `aria_log_control`, causing a newly-spawned instance to respawn-loop on lock acquisition), then a clean start. InnoDB recovered without data loss; the smoke test then ran in 4.47s.

**Worth remembering:** killing a vitest run mid-`resetTables` on this project can wedge the local MariaDB in a way that `KILL` cannot clear and that presents as "tests hang forever with no output" — check `SHOW FULL PROCESSLIST` for long-running TRUNCATEs before assuming a code problem.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Gap 1 is closed at all three sites. Plans 32-12 (admin-count queries omitting `status`) and 32-13 (email pre-validation outside the uniform-response catch) remain, both touching `user.resolver.js`, and run in later waves. Note for 32-12: its `isFunctioningAdmin` alignment work will touch the same `otherVerifiedAdminCount` query this plan's guard now sits above — the guard runs first and is independent of that count, so the two changes do not interact.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-09-03*
