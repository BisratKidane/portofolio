---
phase: 33-public-signup-form-approval-queue
plan: 03
subsystem: api
tags: [graphql, apollo, sequelize, vitest, dead-code-removal]

# Dependency graph
requires:
  - phase: 31-invitations-become-admin-only
    provides: "Invited registrants auto-activate on email verification, making pendingRegistrations unreachable in normal flow"
  - phase: 32-tokenless-registration
    provides: "D-10 decision — two queue queries coexist for one phase, deliberately, until this plan removes the old one"
provides:
  - "Backend GraphQL schema, resolver, and test suite with pendingRegistrations fully deleted — pendingApprovals is now the only approval-queue query"
affects: [33-02-approvals-page-swap, future-phases-touching-invitation-schema]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - backend/src/schemas/invitation.schema.js
    - backend/src/resolvers/invitation.resolver.js
    - backend/src/resolvers/approveReject.test.js
    - backend/src/resolvers/pendingApprovals.test.js
    - backend/src/resolvers/user.resolver.js

key-decisions:
  - "Deleted pendingRegistrations query (schema field + resolver + test block) per D-10 — pendingApprovals is now the sole approval-queue query"
  - "Also reworded two stale comments (in pendingApprovals.test.js and user.resolver.js) that named the deleted query, to satisfy the plan's own zero-matches-under-backend/ verification criterion"

patterns-established: []

requirements-completed: [APPR-02]

# Metrics
duration: 25min
completed: 2026-09-07
---

# Phase 33 Plan 3: Delete dead pendingRegistrations query Summary

**Removed the pendingRegistrations GraphQL field, resolver, and its 5-test describe block from the backend — pendingApprovals (D-11) is now the only approval-queue query left in the schema.**

## Performance

- **Duration:** ~25 min (includes two full ~6-minute backend suite runs)
- **Started:** 2026-09-07T11:53:00Z
- **Completed:** 2026-09-07T12:15:00Z
- **Tasks:** 2
- **Files modified:** 5 (3 in plan's `files_modified`, 2 additional comment-only cleanups — see Deviations)

## Accomplishments
- Deleted the `pendingRegistrations` field (with its comment) from `invitation.schema.js`'s `extend type Query` block, leaving `myInvitations`/`invitations` untouched
- Deleted the `pendingRegistrations` resolver (with its comment) from `invitation.resolver.js`'s `Query` object, leaving `myInvitations`/`invitations`/the `registeredUser` field resolver untouched
- Deleted the unused `PENDING` query-string constant and the entire `describe('pendingRegistrations query', ...)` block from `approveReject.test.js`, leaving the `pendingRegistration()` test-data helper (used 12+ other places in the file) and every other describe block intact
- Repo-wide grep sweep confirms zero remaining references to `pendingRegistrations` anywhere under `backend/`
- Full backend suite green: 69 files passed, 551 passed + 3 skipped (554 total)

## Task Commits

1. **Task 1: Delete pendingRegistrations — schema field, resolver, test block** - `fad32f2` (fix)
2. **Task 2: Full backend suite green + repo-wide reference sweep** - `474b778` (docs, comment-only cleanup of 2 stale references found by the sweep)

_Note: Task 2's own verification step (the grep sweep) surfaced two additional files needing comment edits; see Deviations below._

## Files Created/Modified
- `backend/src/schemas/invitation.schema.js` - Removed `pendingRegistrations: [Invitation!]!` field and its 2-line comment from `extend type Query`
- `backend/src/resolvers/invitation.resolver.js` - Removed the `pendingRegistrations` resolver (8-line comment + ~22-line body) from `Query`; `myInvitations`, `invitations`, and the unrelated `Invitation.registeredUser` field resolver left untouched per plan's explicit scope note
- `backend/src/resolvers/approveReject.test.js` - Removed the unused `PENDING` GraphQL query-string constant and the entire `describe('pendingRegistrations query', ...)` block (5 `it()`s — see Deviations); `pendingRegistration()` helper and all other describes untouched
- `backend/src/resolvers/pendingApprovals.test.js` - Reworded a comment that named `pendingRegistrations` as "untouched"/"coexisting" (no longer true); now describes it historically without the dead identifier
- `backend/src/resolvers/user.resolver.js` - Reworded a comment on the `pendingApprovals` resolver that named `pendingRegistrations` by identifier; now references it as "the invitation-flow-specific one" without using the dead name

## Decisions Made
- Followed the plan's `<interfaces>` deletion boundaries exactly as specified — all three cited line ranges matched the live files byte-for-byte, no re-location by symbol was needed
- Left the `Invitation.registeredUser` field resolver and schema field in place, per the plan's explicit note that it's now fully orphaned but D-10 scopes deletion to query/resolver/tests only — discretionary cleanup with near-zero risk either way, correctly deferred out of this plan's scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's `<interfaces>` block undercounted the test block's `it()`s (said 4, actually 5)**
- **Found during:** Task 1 verification (`npx vitest run src/resolvers/approveReject.test.js`)
- **Issue:** The plan's done-criteria for Task 2 predicted "68 files/552 passed+3 skipped" (baseline 556 − 4 deleted tests). The deleted `describe('pendingRegistrations query', ...)` block actually contained 5 `it()`s, not 4, and `approveReject.test.js` keeps its other tests so the file count never drops from 69 (the plan's own action text for Task 2 already acknowledged this second point). Full-suite result (69 files, 551 passed + 3 skipped) is internally consistent with 556 − 5 = 551 — confirming the deletion was complete and correct, not that anything was over- or under-deleted.
- **Fix:** No code change needed — the `<interfaces>` line-range deletion (248-326) was followed exactly and was already correct; this is purely a documentation/prediction discrepancy in the plan text, noted here for the record.
- **Files modified:** None (informational only)
- **Verification:** `cd backend && npx vitest run src/resolvers/approveReject.test.js` → 15 passed (was 19 before deletion); full suite → 69 files / 551 passed + 3 skipped
- **Committed in:** `fad32f2`

**2. [Rule 1 - Bug] Two stale comments outside the plan's `files_modified` list named the deleted query**
- **Found during:** Task 2's repo-wide grep sweep (`grep -rn "pendingRegistrations" backend/src`), which the plan's own verification block requires to return zero matches
- **Issue:** `backend/src/resolvers/pendingApprovals.test.js:21` and `backend/src/resolvers/user.resolver.js:157` both had explanatory comments describing `pendingRegistrations` as "untouched"/"coexisting" — accurate historically (D-10, established in Phase 32, deliberately kept both queries alive for one phase) but now stale and misleading since this plan deletes that query. Neither file is in the plan's `files_modified` list.
- **Fix:** Reworded both comments to describe the historical two-query design and its resolution without using the now-dead `pendingRegistrations` identifier, so the grep sweep the plan itself mandates returns truly zero matches. Comment-only changes, no behavior affected.
- **Files modified:** `backend/src/resolvers/pendingApprovals.test.js`, `backend/src/resolvers/user.resolver.js`
- **Verification:** `grep -rn "pendingRegistrations" backend/src` → zero matches (exit code 1); `node --check` on both files passed; `npx vitest run src/resolvers/pendingApprovals.test.js` → 5 passed; final full suite run → 69 files / 551 passed + 3 skipped, green
- **Committed in:** `474b778`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — one informational/no-code-change, one comment-only cleanup driven directly by the plan's own verification criterion)
**Impact on plan:** No scope creep in substance — both deviations trace directly back to satisfying this plan's own stated success criteria (a fully green suite with zero orphaned `pendingRegistrations` references anywhere in `backend/`). No application runtime behavior changed.

## Issues Encountered
None. No auth gates, no architectural questions, no test infrastructure issues. The worktree branch had drifted from the expected phase base commit at startup (unrelated prior commits from a different task); working tree was clean, so it was hard-reset to the plan's declared base commit `06955ed0c4d07a8fe7c24eba61ffe37bb0b465ba` per the mandatory `<worktree_branch_check>` protocol before any plan work began.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `pendingRegistrations` is fully gone from the backend (schema, resolver, tests, and stray comments). `pendingApprovals` (D-11) is the sole approval-queue query the app needs going forward.
- Plan 33-02 (parallel, frontend-only) can land in either order relative to this plan — its `ApprovalsPage.jsx` swap onto `pendingApprovals` and its own test files were not touched here, per this plan's explicit scope boundary.
- Full backend suite verified green at completion: 69 test files passed, 551 tests passed + 3 skipped (554 total). No red or skipped tests left behind by this deletion.
- No blockers for downstream phases.

---
*Phase: 33-public-signup-form-approval-queue*
*Completed: 2026-09-07*

## Self-Check: PASSED

- FOUND: `.planning/phases/33-public-signup-form-approval-queue/33-03-SUMMARY.md`
- FOUND: `backend/src/schemas/invitation.schema.js`
- FOUND: `backend/src/resolvers/invitation.resolver.js`
- FOUND: `backend/src/resolvers/approveReject.test.js`
- FOUND: `backend/src/resolvers/pendingApprovals.test.js`
- FOUND: `backend/src/resolvers/user.resolver.js`
- FOUND: commit `fad32f2` (Task 1)
- FOUND: commit `474b778` (Task 2)
