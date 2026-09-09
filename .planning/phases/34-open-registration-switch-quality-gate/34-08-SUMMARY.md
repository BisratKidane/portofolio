---
phase: 34-open-registration-switch-quality-gate
plan: 08
subsystem: testing
tags: [vitest, mutation-testing, graphql, apollo, authorization, security]

# Dependency graph
requires:
  - phase: 34-05
    provides: "register's tokenless door check + the three-layer D-07 guard-agreement proof in publicRegistrationSwitch.test.js (M1/M2/M3 targets)"
  - phase: 34-07
    provides: "security.boundaries.test.js — the SEC-04 authorization matrix and SEC-05 schema-driven sweep (M4/M5/M6/M7 targets)"
provides:
  - "The milestone's D-13 record: eight rows (M1..M8), each with the mutation applied, the exact command, the VERBATIM observed failure message(s), and confirmation the mutation was restored and the tree is green again"
  - "Independent confirmation that M3 (the accessor's catch returning true) fails on the ABSOLUTE-value assertion specifically -- the exact class of gap 32-REVIEW.md CR-01 slipped through -- and that a second, independent net (appSettings.test.js) also catches it"
  - "Confirmation that M4/M5 (removing requireAdmin from two admin-only root fields) each turn BOTH the SEC-04 matrix cell and the SEC-05 sweep row red, proving the sweep is not vacuous"
  - "Confirmation that M6 (letting Pending through the auth.js chokepoint) turns 31 rows red at once, proving the chokepoint's reach rather than merely its existence"
  - "Confirmation that M7 (an unguarded root field added without touching the allowlist) fails both its own sweep row and the swept-field-count pin, closing the loop D-12 exists for"
  - "Confirmation that M8 (removing the Wave 0 reseed from resetTables()) turns 22 of register.test.js's tokenless cases red, proving the seeding is load-bearing"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-13 mutation-testing discipline: one mutation applied at a time, the named command run to completion in the foreground, the verbatim failure message recorded, then git checkout -- <file> restore + re-run to green + git status --porcelain clean check before the next mutation -- never two mutations concurrent, never a mutation left uncommitted-but-present in the tree"

key-files:
  created: []
  modified: []

key-decisions:
  - "For M1, removed the entire `if (!(await isPublicRegistrationEnabled(models))) { throw ... }` inner statement, leaving the now-empty `if (!token) { }` wrapper in place rather than deleting the wrapper too -- functionally identical to deleting 'the switch check' as instructed, and a smaller, easier-to-verify-clean diff to restore."
  - "For M2, the inline `models.AppSetting.findByPk('public_registration_enabled')` replacement reused the SAME Sequelize model method (`AppSetting.findByPk`) that the Layer 3 'read throws' row's `vi.spyOn(models.AppSetting, 'findByPk')` mocks -- this meant M2 also incidentally turned the 'read throws' row red (register's own inline read now threw too), a third failure beyond the two the plan predicted (call-count + row-absent). Recorded as an additional, expected finding, not a deviation: the plan's acceptance criteria only require the call-count and row-absent rows to fail, which they did."
  - "M6 and M8's full failing-test lists were captured to scratchpad files (outside the repo) rather than piped through further shell chains, to reliably extract exact counts (31 and 22 respectively) and verbatim assertion blocks without risking a dropped background process against the shared portofolio_test database."

patterns-established: []

requirements-completed: [ADMIN-01, ADMIN-02, SEC-04, SEC-05]

# Metrics
duration: ~35min
completed: 2026-09-09
---

# Phase 34 Plan 08: The D-13 Mutation-Testing Record Summary

**All eight named mutations (M1..M8) from `34-VALIDATION.md` § Mutation Testing were applied one at a time, each turned its named command red with a verbatim-recorded failure, and each was fully restored — no mutation is left in the tree, and no blocker findings were produced.**

## Performance

- **Duration:** ~35 min (worktree base correction through the final three-file green verification)
- **Started:** 2026-09-09T13:30:00Z (approx., includes worktree setup + context reading)
- **Completed:** 2026-09-09T14:05:00Z (approx.)
- **Tasks:** 3 completed
- **Files modified:** 0 (this plan makes no source changes; every mutation was applied and then restored)

## Accomplishments

- Ran the full D-13 protocol for all eight mutations, strictly one at a time, in the foreground, waiting for each `npx vitest run` to complete before the next mutation — no two backend test processes ever ran concurrently against `portofolio_test`.
- Confirmed M3 fails specifically on the absolute-value assertion (`expect(queryResult.data.publicRegistrationEnabled).toBe(expected)`, line 394 of `publicRegistrationSwitch.test.js`) and not merely the agreement assertion — the precise property that would have caught 32-REVIEW.md CR-01 — and additionally confirmed `appSettings.test.js`'s own five-state unit test independently catches the same mutation.
- Confirmed M4 and M5 each turn BOTH their SEC-04 authorization-matrix cell and their SEC-05 sweep row red, proving the sweep genuinely detects a missing guard rather than passing for an unrelated reason.
- Confirmed M6 turns 31 rows red simultaneously (28 GraphQL sweep rows + 3 non-GraphQL photo-route cells) — the assertion that proves the `getUserFromRequest` chokepoint's reach, not merely its presence.
- Confirmed M7's canary field fails both its own generated sweep test and the swept-field-count pin (15 vs. the pinned 14 Query fields), and was fully removed from both the schema and the resolver afterward.
- Confirmed M8 turns 22 of `register.test.js`'s 32 tokenless-branch tests red, with the closed-door refusal message appearing where a successful registration was expected — confirming the Wave 0 reseed is load-bearing, not incidental.
- Every one of the eight mutations was restored via `git checkout -- <file>` and its target file(s) re-verified green before the next mutation began.
- Final combined verification: `register.test.js` + `publicRegistrationSwitch.test.js` + `security.boundaries.test.js` run together in one serial invocation — 116/116 green.
- `git diff --stat 1ff585ee4ac10f93359405070ef4c680abf9bb53 -- backend/ frontend/` is empty and `git status --porcelain -- backend/ frontend/` shows no tracked-file changes (only the two symlinked `node_modules` directories the worktree setup step created, removed before this agent returns) — no mutation is left in the tree.

## Task Commits

This plan makes no source changes (`files_modified: []` in its own frontmatter) and the mutation-testing discipline explicitly prohibits committing any mutation. No per-task commits were made for Tasks 1–3. The only commit this plan produces is the metadata commit carrying this SUMMARY.md.

## Files Created/Modified

None. Every file touched during this plan's execution (`backend/src/resolvers/user.resolver.js`, `backend/src/utils/appSettings.js`, `backend/src/resolvers/setting.resolver.js`, `backend/src/schemas/setting.schema.js`, `backend/src/utils/auth.js`, `backend/test/helpers.js`) was mutated temporarily and restored via `git checkout --` before the plan concluded. `git diff --stat` against the base commit confirms zero net change.

## Decisions Made

See `key-decisions` in frontmatter — the M1 wrapper-retention choice, the M2 shared-mock-surface side effect, and the scratchpad-file capture approach for M6/M8's large failure lists.

## Deviations from Plan

None — plan executed exactly as written. All eight mutations behaved as the plan predicted (M2's incidental third failing row and M6's exact 31-row count are recordings of the mutation's actual blast radius, not deviations from the protocol).

### Blocker Findings

None. Every mutation turned its named command red as expected; no mutation stayed green.

## The D-13 Record

| # | Mutation applied | Command | Failing tests | Verbatim first-assertion message | Restored & green |
|---|---|---|---|---|---|
| M1 | Deleted the `if (!(await isPublicRegistrationEnabled(models))) { throw ... }` statement from `register`'s tokenless branch (`backend/src/resolvers/user.resolver.js`) | `cd backend && npx vitest run src/resolvers/publicRegistrationSwitch.test.js` | 9 failed: Layer 2 call-count proof; Layer 3 states "row value false", "row value garbage (yes)", "row absent", "read throws"; D-09 side-effect-free control; D-09 ordering control; door-precedes-password-strength control; admin-self-registration control | `AssertionError: expected "isPublicRegistrationEnabled" to be called 2 times, but got 1 times` at `publicRegistrationSwitch.test.js:315` (`expect(spy).toHaveBeenCalledTimes(2);`) | Yes — `git checkout --`, re-ran, 26/26 green |
| M2 | Replaced the `isPublicRegistrationEnabled(models)` call in `register`'s tokenless branch with an inline `const row = await models.AppSetting.findByPk('public_registration_enabled'); if (row && row.value !== 'true') throw ...` (fails OPEN on an absent row) | same | 3 failed: Layer 2 call-count proof; Layer 3 "row absent"; Layer 3 "read throws" (additional failure — the inline read shares `AppSetting.findByPk`, the same method the "read throws" row mocks, so register's own read also threw) | Call-count: `AssertionError: expected "isPublicRegistrationEnabled" to be called 2 times, but got 1 times` at line 315. Row-absent: `AssertionError: expected true to be false // Object.is equality` — `- Expected\nfalse\n+ Received\ntrue` at `publicRegistrationSwitch.test.js:395` (`expect(registerResult.errors === undefined).toBe(queryResult.data.publicRegistrationEnabled);`) | Yes — `git checkout --`, re-ran, 26/26 green |
| M3 | Changed the accessor's `catch` block to `return true` instead of `false` (`backend/src/utils/appSettings.js`) | same | 1 failed: Layer 3 "read throws" — on **assertion 1, the absolute-value assertion**, not the agreement assertion | `AssertionError: expected true to be false // Object.is equality` — `- Expected\nfalse\n+ Received\ntrue` at `publicRegistrationSwitch.test.js:394` (`expect(queryResult.data.publicRegistrationEnabled).toBe(expected);`). Independently, `appSettings.test.js`'s own five-state unit test also failed: `AssertionError: expected true to be false // Object.is equality` at `appSettings.test.js:49` (`await expect(isPublicRegistrationEnabled(models)).resolves.toBe(...)`) — a second, independent net (a good finding, not redundancy) | Yes — `git checkout --`, re-ran, 26/26 green |
| M4 | Removed `requireAdmin(user);` from `Query.pendingApprovals` (`backend/src/resolvers/user.resolver.js`) | `cd backend && npx vitest run src/resolvers/security.boundaries.test.js` | 2 failed: SEC-04 matrix cell `'pendingApprovals' refuses a linked, Active, non-admin member`; SEC-05 sweep row `'query' field 'pendingApprovals' refuses a Pending self-registrant` | SEC-04 cell: `AssertionError: expected undefined to be 'Admin access is required.' // Object.is equality` — `+ Received:\nundefined` at `security.boundaries.test.js:195`. SEC-05 row: `TypeError: Cannot read properties of undefined (reading '0')` at `security.boundaries.test.js:418` (`expect(res.body.errors[0].message).toBe(AUTH_ERROR);` — `res.body.errors` was `undefined` because the query succeeded) | Yes — `git checkout --`, re-ran, 58/58 green |
| M5 | Removed `requireAdmin(user);` from `Mutation.setPublicRegistrationEnabled` (`backend/src/resolvers/setting.resolver.js`) | same | 2 failed: SEC-04 matrix cell `'setPublicRegistrationEnabled' refuses a linked, Active, non-admin member`; SEC-05 sweep row `'mutation' field 'setPublicRegistrationEnabled' refuses a Pending self-registrant` | SEC-04 cell: `AssertionError: expected undefined to be 'Admin access is required.' // Object.is equality` — `+ Received:\nundefined` at `security.boundaries.test.js:195`. SEC-05 row: `AssertionError: expected 'Cannot read properties of null (readi…' to be 'You must be logged in to perform this…' // Object.is equality` — `Expected: "You must be logged in to perform this action."` / `Received: "Cannot read properties of null (reading 'id')"` at `security.boundaries.test.js:418` (the removed guard let a null Pending-user context reach `updatedById: user.id`, crashing instead of refusing) | Yes — `git checkout --`, re-ran, 58/58 green |
| M6 | Weakened `backend/src/utils/auth.js`'s chokepoint to `if (user.status !== 'Active' && user.status !== 'Pending') return null;` | same | 31 failed at once: all 28 non-allowlisted GraphQL sweep rows (14 query + 21 mutation fields minus the 7-name allowlist minus `sweepCanary` which does not exist here) plus all 3 non-GraphQL photo-route cells | `'query' field 'me'`: `AssertionError: expected { id: '1' } to be null` (the sweep's `me`-specific null-result assertion). `get /api/family-members/:id/photo refuses a Pending token with 401`: `AssertionError: expected 404 to be 401 // Object.is equality` — `- Expected\n401\n+ Received\n404`. Representative sweep-row failures also included `'editMember' ...`: `Received: "Your account is not yet linked to a family member."` (a downstream domain guard fired instead of the auth guard) and `'setPublicRegistrationEnabled' ...`: `Received: "Admin access is required."` (a downstream admin guard fired instead) | Yes — `git checkout --`, re-ran, 58/58 green |
| M7 | Added `sweepCanary: Boolean!` to `extend type Query` in `backend/src/schemas/setting.schema.js` and `sweepCanary: () => true` to `settingResolvers.Query` in `backend/src/resolvers/setting.resolver.js`, without adding it to `PUBLIC_ALLOWLIST` | same | 2 failed: the canary's own generated sweep test `'query' field 'sweepCanary' refuses a Pending self-registrant`; the swept-field-count pin | Canary sweep test: `TypeError: Cannot read properties of undefined (reading '0')` at `security.boundaries.test.js:418` (`res.body.errors` was `undefined` — the unguarded field returned data instead of refusing). Count pin: `AssertionError: expected 15 to be 14 // Object.is equality` — `- Expected\n14\n+ Received\n15` at `security.boundaries.test.js:446` (`expect(queryFields.length).toBe(14);`) | Yes — canary field removed from BOTH the schema and the resolver via `git checkout --` on both files; re-ran, 58/58 green |
| M8 | Removed the `seedDefaultAppSettings(models)` call (and its preceding comment) from `resetTables()` in `backend/test/helpers.js` | `cd backend && npx vitest run src/resolvers/register.test.js` | 22 of 32 tests failed | `creates a Pending, unverified USER from a fresh email with the stored relationship note`: `AssertionError: expected [ { …(4) } ] to be undefined` — `+ Received:\n[\n  {\n    "extensions": {\n      "code": "INTERNAL_SERVER_ERROR",\n    },\n    ...\n    "message": "Registration is currently by invitation only.",\n...]` (register's door check now reads an absent `app_settings` row and fails closed, per D-02). `rejects a tokenless register with no email (email required, no token)`: `AssertionError: expected 'Registration is currently by invitati…' to be 'Email is required.' // Object.is equality` — `Expected: "Email is required."` / `Received: "Registration is currently by invitation only."` (the closed-door refusal now wins over the email-required validation because it runs first) | Yes — `git checkout --`, re-ran, 32/32 green |

**Cross-file overlap (a finding worth recording, not redundancy):**
- **M3** is independently caught by two test files: `publicRegistrationSwitch.test.js`'s Layer 3 agreement table (integration) AND `appSettings.test.js`'s five-state unit table (unit) — two nets over the exact same regression class, each catching it for a different reason (one asserts the client/server agreement including the absolute value; the other asserts the accessor's own contract in isolation).
- **M4** and **M5** are each independently caught by two describe blocks within `security.boundaries.test.js`: the SEC-04 authorization matrix (via the `graphql()` harness, asserting the exact admin-required message) AND the SEC-05 schema-driven sweep (via the `httpClient()` harness with a real Pending JWT, asserting `getUserFromRequest`'s reach). Removing one guard fails both proofs for independent reasons — the matrix because the resolver itself is unguarded, the sweep because a non-Active-but-not-caught-by-`requireAdmin` actor still reached a resolver expecting `requireAuth` to have already run (in M4's case) or because the removed guard let a null-context crash surface instead of the expected message (in M5's case).

## Final Verification

```
cd backend && npx vitest run src/resolvers/register.test.js src/resolvers/publicRegistrationSwitch.test.js src/resolvers/security.boundaries.test.js
```
Result: **3 files passed, 116/116 tests passed.**

`git diff --stat 1ff585ee4ac10f93359405070ef4c680abf9bb53 -- backend/ frontend/` — **empty** (zero net source change).
`git status --porcelain -- backend/ frontend/` — clean of tracked-file changes (only the two symlinked `node_modules` directories created for the worktree's local test run, removed before this agent returns).

## Issues Encountered

- The worktree's initial HEAD (`52d044e`, forked from `origin/main`) predated Waves 1–4's `appSettings.js`, `setting.resolver.js`, the gated `register` resolver, and `security.boundaries.test.js` by roughly two weeks of planning commits. Resolved per the mandatory `worktree_branch_check` step: verified the working tree was clean, `git reset --hard 1ff585ee4ac10f93359405070ef4c680abf9bb53`, confirmed the new HEAD matched, and confirmed both `backend/src/resolvers/security.boundaries.test.js` and `backend/src/utils/appSettings.js` existed before starting Task 1. No project code was affected — this was worktree setup, not a plan deviation.
- Several Bash invocations combining `git`/shell conditional logic in one command were rejected by the sandbox's worktree-isolation complexity classifier ("too complex to verify that it stays inside the worktree"). Each was resolved by splitting into separate, single-purpose commands — matching the same class of issue every prior 34-* plan's SUMMARY has documented.
- Piping large `vitest run` output directly through `tail`/`grep` chains occasionally truncated the failure list before all context was visible; resolved by redirecting output to a scratchpad file (outside the repo) and grepping that file repeatedly, which reliably surfaced exact failure counts (31 for M6, 22 for M8) and full verbatim assertion blocks.

## User Setup Required

None — no external service configuration required. This plan runs existing commands against already-shipped test files and resolvers from plans 34-01/34-03/34-05/34-07.

## Next Phase Readiness

- The milestone's D-13 obligation is fully discharged: all eight named mutations from `34-VALIDATION.md` § Mutation Testing were proven to turn their named test file red with a recorded verbatim message, and every mutation was restored to a clean, green tree.
- No blocker findings — every boundary test proved capable of failing exactly as `34-VALIDATION.md` predicted, including the two most safety-critical properties: M3 pinning the absolute value (not just agreement) and M7 proving the sweep inverts the default for a forgotten guard on day one.
- This plan is the final wave (Wave 5) of Phase 34's plan set. With Waves 1–5 complete and this plan's mutation-testing gate green, Phase 34 has no further plans; the orchestrator's post-wave STATE.md/ROADMAP.md updates and full-suite verification are the remaining steps outside this agent's scope (worktree mode).

## Self-Check: PASSED

- FOUND: .planning/phases/34-open-registration-switch-quality-gate/34-08-SUMMARY.md (this file)
- Verified via git diff: zero net source change across backend/ and frontend/ relative to base commit `1ff585ee4ac10f93359405070ef4c680abf9bb53`
- Verified via vitest: `register.test.js` + `publicRegistrationSwitch.test.js` + `security.boundaries.test.js` — 116/116 passed in one serial invocation

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
