---
phase: 32-tokenless-registration
plan: 12
subsystem: auth
tags: [sequelize, mysql, updateUser, verifyEmail, last-administrator-guard, admin-bootstrap]

# Dependency graph
requires:
  - phase: 32-10
    provides: "updateUser's locking transaction (findByPk with lock: t.LOCK.UPDATE) wrapping the last-administrator guards this plan's counting-predicate fix sits inside"
  - phase: 32-11
    provides: "the Rejected/Disabled status guard inserted immediately after updateUser's not-found check, and the ADMIN_EMAIL bootstrap write's Op.in(['Pending','Active']) WHERE-clause scoping, both left untouched by this plan"
provides:
  - "updateUser's last-administrator guards (role-demotion and email-change) and verifyEmail's ADMIN_EMAIL bootstrap admin-slot count both filter on role = 'ADMIN' AND status = 'Active' AND emailVerified = true, matching isFunctioningAdmin's three-part definition exactly"
  - "updateUser's counting helper renamed otherVerifiedAdminCount -> otherFunctioningAdminCount to match what it counts"
  - "3 sequential (non-concurrent) regression tests proving a Pending ADMIN row can no longer mask a last-administrator violation or block the ADMIN_EMAIL recovery bootstrap"
affects: [phase-32-verification, phase-32-review, phase-33-admin-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predicate-before-locking review: Plan 32-10 locked the last-administrator guard's query but never checked whether the query's own WHERE clause matched the codebase's named functioning-admin definition -- this plan applies that check retroactively to an already-locked guard"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/utils/auth.js
    - backend/src/resolvers/updateUser.test.js
    - backend/src/resolvers/verifyEmail.test.js

key-decisions:
  - "Renamed only updateUser's local counting helper (otherFunctioningAdminCount); left verifyAndPromote's admin-slot count variable named adminCount unchanged -- it has no equivalent 'verified-only' name to correct"
  - "Left the inviter-check comment in verifyAndPromote ('using the same functioning-admin definition...') unchanged -- it claims criteria-sharing, not code-path-sharing, and that claim is now genuinely true"
  - "Corrected utils/auth.js's isFunctioningAdmin comment to cite symbol names (verifyAndPromote's admin-slot COUNT(*), updateUser's otherFunctioningAdminCount) instead of stale line numbers, and to state precisely that the three sites share CRITERIA, not CODE PATH"

patterns-established:
  - "Apply 32-11's opening lesson (check the guard's predicate before its locking) retroactively to a guard already locked in an earlier plan -- locking and correctness are independent properties that both need auditing"

requirements-completed: [REG-02]

# Metrics
duration: ~25min
completed: 2026-09-03
---

# Phase 32 Plan 12: Match Admin-Count Predicates to isFunctioningAdmin's Definition Summary

**Both raw SQL admin-count queries in `user.resolver.js` (updateUser's last-administrator guards and verifyEmail's ADMIN_EMAIL bootstrap admin-slot count) now require `status = 'Active'`, closing a deterministic (no-race-required) gap where a Pending, Rejected, or Disabled ADMIN row could mask a last-administrator violation or permanently block the bootstrap recovery path.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments

- Closed Gap 2 from `32-VERIFICATION.md` (Truth 7, 3rd round / `32-REVIEW.md` CR-03, 2nd-round numbering): Plan 32-10 correctly fixed the TOCTOU concurrency window around `updateUser`'s last-administrator guards, but the counting query itself omitted `status`, while `isFunctioningAdmin` (the codebase's own named definition) requires it. This failed deterministically, no race required — promoting a Pending, verified self-registrant to ADMIN and then demoting the sole real admin let the guard's own query see the Pending ADMIN as "1 other admin" and permitted the demotion, driving functioning admins to zero. The identical omission in `verifyAndPromote`'s bootstrap admin-slot count then also permanently blocked ADMIN_EMAIL recovery, since it never reached `adminCount === 0`.
- Applied Plan 32-11's opening lesson ("check each guard's predicate before its locking") retroactively to the guard Plan 32-10 already locked.
- Corrected the misleading comments claiming these sites already matched `isFunctioningAdmin` and citing stale line numbers.
- Proved the fix falsifiable by mutation testing: reverting both `status = 'Active' AND` insertions reddened exactly the 3 new tests and no others.

## Task Commits

1. **Task 1: RED — sequential (non-concurrent) reproduction tests for both halves of the miscount** — `4e962a0` (test)
2. **Task 2: GREEN — match both admin counts to isFunctioningAdmin's definition, correct stale comments** — `d25358f` (fix)
3. **Task 3: Self-check regression gate, record actual counts** — no code changes; verification recorded below

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` — both raw SQL admin counts now filter on `role = 'ADMIN' AND status = 'Active' AND emailVerified = true`; `updateUser`'s counting helper renamed `otherVerifiedAdminCount` -> `otherFunctioningAdminCount` at its definition and both call sites (role-demotion guard, email-change guard)
- `backend/src/utils/auth.js` — `isFunctioningAdmin`'s comment rewritten: stale line-number citations (`~263-264`, `~425-428`) replaced with symbol references, and the claim precisely restated as "same criteria, different code path"
- `backend/src/resolvers/updateUser.test.js` — 2 new sequential regression tests (demotion, email-change) proving the guard blocks after a Pending admin was promoted
- `backend/src/resolvers/verifyEmail.test.js` — 1 new regression test proving the ADMIN_EMAIL bootstrap still fires when a stranded Pending ADMIN row exists

## Decisions Made

See `key-decisions` in frontmatter. The load-bearing one: only the local `updateUser` helper was renamed to `otherFunctioningAdminCount`; `verifyAndPromote`'s `adminCount` variable and its surrounding comment were left as-is because their claims were already accurate at the criteria level once the fix landed.

## Deviations from Plan

None — plan executed exactly as written. One correction made mid-Task-1: the two `updateUser` RED tests' error-message assertions initially threw a `TypeError` (`Cannot read properties of undefined (reading '0')`) rather than a clean assertion failure, because the pre-fix demotion/email-change calls succeeded with `errors: undefined`. Switched both assertions to optional chaining (`errors?.[0]?.message`) so the RED evidence is a proper `AssertionError` ("expected undefined to be '...'") as the plan's acceptance criteria require, not a `TypeError`. This is a test-authoring correction within Task 1's own RED step, not a Rule 1-4 deviation against the plan's design.

## Verification

**Task 1 RED (pre-fix):** `npm test -w backend -- src/resolvers/updateUser.test.js src/resolvers/verifyEmail.test.js` — 3 failed | 43 passed | 2 skipped (48). All 3 failures are clean assertion failures describing the wrong observed state (demotion/email-change succeeding when blocked was expected; registrant staying `USER` when `ADMIN` was expected), not setup/import errors.

**Task 2 GREEN (post-fix):** same command — 46 passed | 2 skipped (48). All 3 new tests pass; Plan 32-10's 2 pre-existing concurrency tests (`CR-02, gap-closure`) unaffected.

**Acceptance greps:**
- `grep -c "status = 'Active' AND emailVerified = true" backend/src/resolvers/user.resolver.js` → `2`
- `grep -n "otherFunctioningAdminCount" backend/src/resolvers/user.resolver.js` → 3 matches (1 definition + 2 call sites)
- `grep -c "otherVerifiedAdminCount" backend/src/resolvers/user.resolver.js` → `0`
- `grep -n "~263-264\|~425-428" backend/src/utils/auth.js` → no matches

**Mutation-test evidence:** reverted both `status = 'Active' AND ` insertions (restoring the pre-fix SQL strings) via `sed`, re-ran the targeted files — 3 failed | 43 passed | 2 skipped (48), exactly Task 1's 3 new tests and no others. Restored the fix from a pre-edit backup; re-ran — 46 passed | 2 skipped (48) again; `git diff` against the restored state showed the identical fix as before the revert (byte-for-byte, confirmed by comparing the diff hunks).

**Task 3 targeted regression gate:** `npm test -w backend -- src/resolvers/register.test.js src/resolvers/verifyEmail.test.js src/resolvers/updateUser.test.js src/resolvers/resendVerificationEmail.test.js src/config/assertRequiredColumns.test.js` — **82 passed | 2 skipped (84)** — matches the plan's predicted count exactly (baseline 79 passed | 2 skipped post-32-11, +3 new tests, none removed).

**Task 3 full backend suite:** 68 files, **520 passed | 3 skipped (523)** — matches the plan's predicted count exactly against the post-32-11 baseline of 517 passed | 3 skipped (520).

**Gap 1 (Plan 32-11) guards confirmed textually unchanged:** `grep`/diff review confirms the bootstrap `WHERE` clause (`{ [Op.in]: ['Pending', 'Active'] }` at `:473`), `updateUser`'s `'This account is not editable.'` refusal (`:678`), and `resendVerificationEmail`'s `status === 'Rejected' || status === 'Disabled'` silent no-op (`:567`) all still present and untouched by this plan's diff — the diff (see Task 2 commit `d25358f`) only touches the two admin-COUNTING queries, the helper rename, and the two comment blocks.

## Issues Encountered

None beyond the test-assertion correction documented above under Deviations.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Gap 2 is closed at both sites (updateUser's last-administrator guards, verifyEmail's ADMIN_EMAIL bootstrap admin-slot count). Plan 32-13 (email pre-validation outside the uniform-response catch) remains, touching the same `user.resolver.js` file in a different function (`register`'s tokenless branch) with no overlap with this plan's edits.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-09-03*

## Self-Check: PASSED

All claimed files exist (`backend/src/resolvers/user.resolver.js`, `backend/src/utils/auth.js`, `backend/src/resolvers/updateUser.test.js`, `backend/src/resolvers/verifyEmail.test.js`, this SUMMARY.md), and all claimed commit hashes (`4e962a0`, `d25358f`, `ceb3b9d`) are present in `git log`.
