---
phase: 14-relationship-resolvers-permission-scoping-query-safety
plan: 02
subsystem: api
tags: [graphql, sequelize, permissions, apollo, backend]

# Dependency graph
requires:
  - phase: 12-family-data-model-foundation
    provides: FamilyMember/Spouse models, self-referencing motherId/fatherId, canonical-ordered Spouse join table
  - phase: 13-membership-gating-account-linking
    provides: requireFamilyAccess guard, User.familyMemberId linkage
provides:
  - "computeEditableScope(memberId, { transaction }) — the single, reused server-side computation of a member's editable relative set (self, parents, spouses, children, either-parent-derived siblings)"
  - "dashboard resolver gated by requireFamilyAccess instead of requireAuth (WR-04 closed)"
affects: [14-03, 14-04, 14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computeEditableScope: bounded one-hop scope computation via Promise.all-parallel Op.or queries, never recursing beyond self's own parentIds"
    - "Sibling Op.or query is skipped entirely (returns []) rather than defaulted to an always-false clause when parentIds is empty — avoids the Op.eq:null IS NULL pitfall"

key-files:
  created:
    - backend/src/services/familyMember.scope.test.js
    - .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/deferred-items.md
  modified:
    - backend/src/services/familyMember.service.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/dashboard.test.js

key-decisions:
  - "computeEditableScope returns raw Sequelize instances for parents/spouses/children/siblings (not serialized), matching the existing familyMember/familyMembers resolver convention of returning raw instances so fullname VIRTUAL resolves via default GraphQL field resolution"
  - "Pre-existing 'returns the user dashboard with a null users list for a USER' test fixture updated to use a linked FamilyMember, since requireFamilyAccess now legitimately rejects an unlinked USER on dashboard (Rule 1 auto-fix — the fixture predates WR-04's fix and no longer reflects intended behavior)"

patterns-established:
  - "Every Phase 14 mutation resolver importing computeEditableScope from familyMember.service.js rather than re-deriving scope inline (PERM-05 single-source-of-truth requirement)"

requirements-completed: [PERM-05, REL-04, PERM-01]

# Metrics
duration: 6min
completed: 2026-07-22
---

# Phase 14 Plan 02: computeEditableScope + WR-04 Dashboard Gate Summary

**Single reused `computeEditableScope` service utility (self/parents/spouses/children/either-parent-siblings, bounded to one hop) proven against all three SC-3 exclusion fixtures, plus the dashboard resolver now gated by `requireFamilyAccess` closing WR-04.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-22T21:03:06+02:00
- **Completed:** 2026-07-22T21:08:35+02:00
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created, 2 modified) + 1 phase-level deferred-items note

## Accomplishments
- `computeEditableScope(memberId, { transaction })` exported from `familyMember.service.js`, the single reused editable-set computation every later Phase 14 mutation resolver will depend on
- All SC-3 inclusion cases proven (self, mother, father, spouse from either canonical Spouse-row side, children via motherId/fatherId, full sibling, half-sibling) and all three named SC-3 exclusion cases proven with dedicated fixtures (grandparent, cousin, sibling-of-sibling)
- WR-04 closed: `dashboard` resolver now calls `requireFamilyAccess(user)` instead of `requireAuth(user)`, rejecting a verified-but-unlinked USER exactly like every other family-domain resolver

## Task Commits

Each task followed TDD red-green:

1. **Task 1: computeEditableScope service utility (PERM-05, REL-04)**
   - `3eadc75` (test) — add failing tests for computeEditableScope, confirmed RED (import error) against all 10 cases
   - `77541fc` (feat) — implement computeEditableScope, confirmed GREEN (10/10 passing)
2. **Task 2: WR-04 — gate the dashboard resolver with requireFamilyAccess**
   - `d832ea5` (test) — add WR-04 unlinked-user rejection case to dashboard.test.js, confirmed RED (1 new failure; also updated the pre-existing linked-USER fixture ahead of the resolver change)
   - `4ee5fab` (feat) — swap requireAuth for requireFamilyAccess in the dashboard resolver, confirmed GREEN (6/6 passing)

_TDD: both tasks followed test → feat, no refactor step needed._

## Files Created/Modified
- `backend/src/services/familyMember.service.js` - added `computeEditableScope(memberId, { transaction })`
- `backend/src/services/familyMember.scope.test.js` - 10 unit tests: 7 inclusion cases + 3 SC-3 exclusion fixtures
- `backend/src/resolvers/user.resolver.js` - `dashboard` resolver: `requireAuth` → `requireFamilyAccess`; import added
- `backend/src/resolvers/dashboard.test.js` - new WR-04 rejection case; pre-existing USER fixture updated to a linked member
- `.planning/phases/14-relationship-resolvers-permission-scoping-query-safety/deferred-items.md` - documents observed full-suite flakiness (out of scope, see below)

## Decisions Made
- `computeEditableScope`'s spouse query reuses the existing `getSpouseRows` `Op.or`/`memberA`/`memberB`-include idiom, then maps each row to "the other side" via `row.memberAId === memberId ? row.memberB : row.memberA` — this correctly returns the FamilyMember instance for the actor's spouse regardless of which side of the canonical (lower-id-first) Spouse row the actor landed on after the model's `beforeValidate` reordering hook.
- The sibling query is entirely skipped (not run with a no-op/always-false clause) when `parentIds.length === 0`, per the plan's explicit Pitfall-4 NULL-semantics constraint — confirmed via a zero-match grep for `motherId: null`/`fatherId: null` in the file.
- Pre-existing dashboard test fixture (`returns the user dashboard with a null users list for a USER`) required a linked `familyMemberId` once `requireFamilyAccess` replaced `requireAuth` — auto-fixed per Rule 1, since the fixture no longer reflected the resolver's newly-intended (and now-correct) behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated the pre-existing dashboard USER fixture to use a linked member**
- **Found during:** Task 2
- **Issue:** The pre-existing test `returns the user dashboard with a null users list for a USER` created a USER with no `familyMemberId`. Once `requireAuth` was swapped for `requireFamilyAccess`, this fixture legitimately failed (the test's premise — an unlinked USER should see the dashboard — is exactly the WR-04 bug being fixed).
- **Fix:** Created a `FamilyMember` row and passed its id as `familyMemberId` on the test's `createTestUser` call, mirroring the existing "succeeds for a linked USER" pattern already used in `familyMember.resolver.test.js`.
- **Files modified:** `backend/src/resolvers/dashboard.test.js`
- **Verification:** `npm test --workspace backend -- src/resolvers/dashboard.test.js` → 6/6 passing
- **Committed in:** `d832ea5` (Task 2 test commit)

**2. [Rule 1 - Bug] The WR-04 test assertion targets `data` (not `data.dashboard`) as null**
- **Found during:** Task 2
- **Issue:** The plan's `<behavior>` text described the rejection assertion as `data.dashboard` being `null`. The GraphQL schema declares `dashboard: Dashboard!` (non-null), so when the resolver throws, Apollo Server's non-null propagation nulls the entire top-level `data` object, not just the `dashboard` field — matching the exact pattern already used by the pre-existing "rejects an unauthenticated request" test in the same file.
- **Fix:** Asserted `expect(data).toBeNull()`, consistent with the existing unauthenticated-rejection test in the same file.
- **Files modified:** `backend/src/resolvers/dashboard.test.js`
- **Verification:** Test passes; assertion shape matches the established convention for this non-null field.
- **Committed in:** `d832ea5` (Task 2 test commit)

**3. [Rule 1 - Bug] Reworded an in-code comment to avoid a literal grep false-positive**
- **Found during:** Task 1
- **Issue:** The plan's acceptance criteria runs `grep -n "motherId: null\|fatherId: null"` against the whole file expecting zero matches. My first draft of the NULL-semantics comment explaining the pitfall literally contained the string `{ motherId: null }`, causing the grep to (correctly, but unintentionally) flag a false positive.
- **Fix:** Reworded the comment to describe the pitfall without using the literal disallowed string.
- **Files modified:** `backend/src/services/familyMember.service.js`
- **Verification:** `grep -n "motherId: null\|fatherId: null" backend/src/services/familyMember.service.js` returns no matches.
- **Committed in:** `77541fc` (Task 1 feat commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bug/correctness fixes required to make the plan's own acceptance criteria and TDD gates pass cleanly)
**Impact on plan:** All three fixes were necessary to land the plan's own stated behavior correctly; no scope creep beyond the plan's two named tasks.

## Issues Encountered

**Full backend suite (`npm test --workspace backend`) shows intermittent unrelated failures — NOT caused by this plan's changes.** During verification, `ps aux` revealed a second, sibling worktree agent (`agent-a340e5535e2a4fbe9`) concurrently running `vitest` against the same shared MySQL test database while executing a different Phase 14 plan in parallel. This produced real cross-agent races: `resetTables()` truncating tables mid-run, `SequelizeForeignKeyConstraintError` on inserts, and one transient "Table 'portofolio_test.spouses' doesn't exist" (a concurrent `sequelize.sync({ force: true })`/`.drop()` from the other agent's own globalSetup/teardown lifecycle colliding with this run). The specific failing test names changed across repeated runs, which is the signature of external contention, not a deterministic regression. This plan's two owned files — `backend/src/services/familyMember.scope.test.js` (10/10) and `backend/src/resolvers/dashboard.test.js` (6/6) — pass reliably and repeatably in isolation, and neither modified file overlaps with any of the files that intermittently failed in the full-suite run (`linkUserToMember.test.js`, `rateLimit.test.js`, `resendVerificationEmail.test.js`, `resetPassword.test.js`, `sessionRevocation.test.js`, `verifyEmail.test.js`, `database.test.js`, `familyMember.resolver.test.js`'s ordering case). Logged to `deferred-items.md` per the scope-boundary rule; not fixed, since it is a parallel-worktree test-database contention issue, not a defect in this plan's code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`computeEditableScope` is exported and ready for every Phase 14 mutation resolver (14-04, 14-05, 14-06) to import directly rather than re-deriving scope inline, satisfying PERM-05's single-source-of-truth requirement. WR-04 is closed; the `dashboard` resolver now matches every other family-domain-adjacent resolver's `requireFamilyAccess` gate. No blockers for subsequent plans in this phase. Recommend re-running the full backend suite once all parallel Phase 14 worktree agents have completed (serialized, single-writer against the shared test DB) to get a clean full-suite signal.

---
*Phase: 14-relationship-resolvers-permission-scoping-query-safety*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: backend/src/services/familyMember.scope.test.js
- FOUND: .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/deferred-items.md
- FOUND: .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-02-SUMMARY.md
- FOUND commit: 3eadc75 (test: computeEditableScope failing tests)
- FOUND commit: 77541fc (feat: computeEditableScope implementation)
- FOUND commit: d832ea5 (test: WR-04 dashboard rejection case)
- FOUND commit: 4ee5fab (feat: dashboard requireFamilyAccess gate)
