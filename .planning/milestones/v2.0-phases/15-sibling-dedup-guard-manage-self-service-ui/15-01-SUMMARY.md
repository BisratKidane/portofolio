---
phase: 15-sibling-dedup-guard-manage-self-service-ui
plan: 01
subsystem: api
tags: [sequelize, mysql, graphql, tdd, concurrency, row-locking]

requires:
  - phase: 14-relationship-resolvers-permission-scoping-query-safety
    provides: addChild/addSibling resolvers, computeEditableScope, the shared FamilyMember write path both mutations route through
provides:
  - REL-06 duplicate-child/sibling-name guard inside familyMember.service.js's addChild, applying unconditionally to every caller
  - A row-locked (SELECT ... FOR UPDATE), transaction-scoped TOCTOU-safe dedup check, proven by a genuinely concurrent test
affects: [15-02, 15-03, 15-04, 15-05, 15-06]

tech-stack:
  added: []
  patterns:
    - "Guard-then-create inside a single transaction: lock parent rows first (t.LOCK.UPDATE), then run the duplicate-name read, then create -- all three steps in the same transaction, never split across separate calls"
    - "addChild opens its own transaction only when the caller supplies none (mirrors setSpouse's transaction-or-fresh convention), guaranteeing the guard is never silently skipped"
    - "Sequelize sequelize.where(sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col(...))), value) for case/whitespace-insensitive comparisons, with the base table explicitly qualified (FamilyMember.firstname) to avoid column ambiguity once mother/father associations are included in the same query"

key-files:
  created:
    - backend/src/services/familyMember.dedup.test.js
  modified:
    - backend/src/services/familyMember.service.js
    - backend/src/resolvers/familyMember.addChild.test.js
    - backend/src/resolvers/familyMember.addSibling.test.js

key-decisions:
  - "Guard lives inside addChild itself (not duplicated in resolvers) so addSibling and any future caller inherit it for free, per D-11"
  - "No admin/role parameter added to addChild -- the guard is unconditional, proven by an adversarial admin test (D-08, Pitfall 4)"
  - "Row lock (t.LOCK.UPDATE) on the shared-parent FamilyMember row(s) taken BEFORE the duplicate-name read, closing the TOCTOU window a bare SELECT-then-INSERT would leave open (D-10)"

patterns-established:
  - "Pattern: dedup/uniqueness guards spanning nullable-FK OR semantics are enforced in the service layer via row locking + in-transaction read, not a DB unique constraint (too heavy for either-parent semantics) and not an admin-overridable soft check"

requirements-completed: [REL-06]

duration: 6min
completed: 2026-07-23
---

# Phase 15 Plan 01: Sibling Dedup Guard Summary

**Row-locked REL-06 duplicate-child guard added to `addChild` in `familyMember.service.js`, closing the TOCTOU race with a `SELECT ... FOR UPDATE` on the shared-parent row(s) before the duplicate-name check, proven safe under genuine concurrency and unconditional for admins and members alike.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-23T20:35:00+02:00 (approx, first RED commit)
- **Completed:** 2026-07-23T20:38:43+02:00
- **Tasks:** 3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- REL-06's either-parent, trimmed/case-folded duplicate-firstname guard implemented inside `addChild`, the single write path both `addChild` and `addSibling` resolvers already route through
- Genuinely concurrent TOCTOU proof (`Promise.allSettled`, no sequential `await`s) demonstrates exactly one of two racing inserts succeeds, with the row lock serializing the pair
- No admin override exists anywhere in the guard — proven by an adversarial test where an ADMIN's duplicate-name `addChild` call is rejected identically to a member's
- Both public doors (`addChild` mutation, `addSibling` mutation) extended with resolver-level regression tests asserting the exact REL-06 error copy and no-partial-insert
- Full backend suite: 280/280 green

## Task Commits

Each task was committed atomically (TDD red-green):

1. **Task 1: RED — failing tests for the REL-06 guard, including the concurrent-race proof** - `a39819c` (test)
2. **Task 2: GREEN — implement the row-locked REL-06 guard inside addChild** - `98dbcd3` (feat)
3. **Task 3: extend both public doors (addChild, addSibling resolver tests) + full backend gate** - `a2f5f7f` (test)

## Files Created/Modified
- `backend/src/services/familyMember.dedup.test.js` - New file: 6 tests covering motherId-only, fatherId-only, no-false-positive, the concurrent TOCTOU proof, admin-not-bypassed, and no-transaction-supplied
- `backend/src/services/familyMember.service.js` - `addChild` rewritten with an inner `run(attrs, t)` guard-then-create; row-locks shared-parent row(s) via `t.LOCK.UPDATE` before the duplicate-name read; opens its own transaction when none is supplied
- `backend/src/resolvers/familyMember.addChild.test.js` - 3 new tests: motherId-only, fatherId-only, admin-not-bypassed REL-06 rejections via the mutation
- `backend/src/resolvers/familyMember.addSibling.test.js` - 1 new test: REL-06 rejection via the `addSibling` door, proving D-11 (both doors share the guard by construction)

## Decisions Made
- Guard placed exclusively inside `addChild` (service layer), not duplicated in either resolver — `addSibling` already routes through `addChild(attrs, { transaction: t })`, so it inherits the guard automatically (D-11)
- Comparison semantics: duplicate = another child sharing a non-null `motherId` OR non-null `fatherId` with the candidate, `firstname` matching trimmed + case-folded (D-09) — deliberately does NOT distinguish half-siblings from full siblings for the purpose of the block, a documented known limitation
- No new DB unique constraint — the either-parent OR semantics aren't a simple column-tuple UNIQUE and would need a trigger/generated column; row-locking inside the existing transaction was judged sufficient and lighter-weight (per 15-CONTEXT.md D-08)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ambiguous `firstname` column reference in the duplicate-check query**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** The plan's suggested query used `sequelize.col('firstname')` unqualified; once `include: [{ association: 'mother' }, { association: 'father' }]` is added, MySQL raises `Column 'firstname' in where clause is ambiguous` because the joined `mother`/`father` aliases (also `FamilyMember` rows) each have their own `firstname` column.
- **Fix:** Qualified the column reference as `sequelize.col('FamilyMember.firstname')`, targeting the base table's default Sequelize alias explicitly.
- **Files modified:** `backend/src/services/familyMember.service.js`
- **Verification:** All 6 Task 1 tests pass after the fix; full backend suite green.
- **Committed in:** `98dbcd3` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary correctness fix surfaced immediately by the RED tests; no scope creep, no plan deviation beyond the exact column-qualification needed to make the specified query work against MySQL.

## Issues Encountered
- **Local test-database infrastructure:** The host's port 3306 was occupied by an unrelated pre-existing `mariadb` Homebrew service (not this project's), blocking the project's own `docker compose up -d mysql` (which the repo's own tooling and `env/test.env` assume runs on 3306). Resolved by starting this worktree's own `mysql:8.4` container via `docker compose --env-file env/local.env up -d mysql` on host port 3307 instead, and pointing this worktree's local, uncommitted `env/test.env` at `DB_PORT=3307` for the duration of test execution. This is a local environment workaround, not a plan or application change — `env/test.env`'s port edit was deliberately left unstaged/uncommitted (verify with `git status --short env/test.env`) so it does not enter the plan's commit history; the underlying `env/test.env` file in the repo is unaffected once this worktree is discarded.

## User Setup Required

None - no external service configuration required. (The port-3307 MySQL container is a local, worktree-scoped test-execution detail, not a deployment or user-facing configuration change.)

## Next Phase Readiness
- REL-06 guard is live and covers every current and future caller of `addChild` (member add, admin add, `addSibling`) by construction — no resolver or schema changes were needed
- Plans 15-02 through 15-06 (the `/manage` self-service UI) can safely surface this guard's exact error copy (already locked in 15-UI-SPEC.md's Copywriting Contract) without any further backend changes
- No blockers identified for subsequent plans in this phase

---
*Phase: 15-sibling-dedup-guard-manage-self-service-ui*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: backend/src/services/familyMember.dedup.test.js
- FOUND: backend/src/services/familyMember.service.js
- FOUND: .planning/phases/15-sibling-dedup-guard-manage-self-service-ui/15-01-SUMMARY.md
- FOUND: a39819c (test commit)
- FOUND: 98dbcd3 (feat commit)
- FOUND: a2f5f7f (test commit)
