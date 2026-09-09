---
phase: 34-open-registration-switch-quality-gate
plan: 05
subsystem: api
tags: [graphql, apollo, sequelize, vitest, mutation-testing, admin-settings]

# Dependency graph
requires:
  - phase: 34-01
    provides: "isPublicRegistrationEnabled(models) -- THE shared predicate this plan's guard imports and calls"
  - phase: 34-03
    provides: "publicRegistrationSwitch.test.js (settings-layer half) + the GraphQL schema/resolvers this plan's agreement tests query"
provides:
  - "The server-side enforcement of the registration switch: register's tokenless branch refuses with PUBLIC_REGISTRATION_CLOSED_MESSAGE, checked as the literal first statement for a tokenless call (ADMIN-02 / D-09)"
  - "D-07 Layer 2: a vi.spyOn call-count proof that publicRegistrationEnabled, register, and publicRegistrationSetting all call through the SAME isPublicRegistrationEnabled function object"
  - "D-07 Layer 3: a five-state table (true/false/garbage/absent/throws) asserting the absolute value, the agreement, and the exact refusal message for each"
  - "D-08/D-09/D-10 controls: invitations still work while closed, the refusal is side-effect-free and precedes assertPasswordStrength, admins get no exemption, and the approval queue is untouched"
affects: [34-07, 34-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-layer guard-divergence proof (RESEARCH Pattern 3): (1) grep-verified single import site, (2) vi.spyOn call-count structural proof, (3) five-state table asserting absolute value + agreement + exact message -- not agreement alone, which is the exact gap that let 32-REVIEW.md CR-01 through"
    - "Mutation rehearsal as a required pre-commit step, not optional: M1 (delete the guard), M2 (inline a second row read), M3 (flip the fail-closed catch) are each performed by hand, confirmed red on the intended assertion, then restored to an empty git diff before the task commit"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/publicRegistrationSwitch.test.js

key-decisions:
  - "Reworded the door-check's own import comment mid-task (Rule 1) after its first draft accidentally recreated the acceptance criterion's grep-gated string ('AppSetting', 'PUBLIC_REGISTRATION_KEY', 'getPublicRegistrationSettingRow') -- same class of self-inflicted grep collision 34-03 documented, caught by re-running the gate before commit"
  - "Extended the shared vi.mock('../services/mailer.js', ...) factory (set up in Task 2) with sendAccountApprovedEmail so Task 3's D-10 control could call the real approveUser mutation without a synchronous TypeError on an undefined mailer export -- vi.mock replaces the WHOLE module, so any export a test's resolver call reaches and the factory omits comes back undefined, not a pass-through to the real implementation"
  - "The acceptance criterion `grep -c 'mockRejectedValueOnce' ... outputs 0` cannot be satisfied literally: plan 34-03 already added a legitimate, out-of-scope mockRejectedValueOnce at the file's audit-rollback test (:199), which correctly needs single-shot rejection semantics and is unrelated to this plan's five-state table. This plan's own 'read throws' row correctly uses the repeating mockRejectedValue form (verified red on both accessor-backed calls via the M3 rehearsal); the raw grep count is 1, not 0, because of that unrelated pre-existing test, not because this plan's own code used the wrong form."

patterns-established: []

requirements-completed: [ADMIN-02]

# Metrics
duration: ~20min
completed: 2026-09-09
---

# Phase 34 Plan 05: Server-Side Enforcement + Three-Layer Guard-Agreement Proof Summary

**A ~12-line `if (!token)` door check in `register` gated by the shared `isPublicRegistrationEnabled` predicate, backed by a call-count spy proving three call sites share one function object and a five-state table asserting the absolute value (not just agreement) — the exact shape that would have caught 32-REVIEW.md CR-01.**

## Performance

- **Duration:** ~20 min (worktree base correction through full-suite verification)
- **Started:** 2026-09-09T10:20:00Z (approx., includes worktree setup + context reading)
- **Completed:** 2026-09-09T10:47:27Z
- **Tasks:** 3 completed
- **Files modified:** 2

## Accomplishments

- `register`'s tokenless branch now refuses with `PUBLIC_REGISTRATION_CLOSED_MESSAGE` as the literal first statement it executes for a tokenless call — verified by `awk` gates that the guard precedes `assertPasswordStrength`, `startedAt`, `assertRegistrationEmail`, and `bcrypt.hash` — while importing only `isPublicRegistrationEnabled` from `utils/appSettings.js` (zero occurrences of `AppSetting`/`PUBLIC_REGISTRATION_KEY`/`getPublicRegistrationSettingRow`).
- Rewrote `register`'s header comment: it no longer claims "no environment-gated feature switch guards this branch" — it now names the stored `app_settings` row and reaffirms Phase 32 D-03's ban on an env-var override.
- Built the D-07 Layer 2 structural proof: `vi.spyOn(appSettings, 'isPublicRegistrationEnabled')` across the public query → register → admin query sequence, asserting call counts 1 → 2 → 3, proving all three are the same function object.
- Built the D-07 Layer 3 five-state table (`'true'` / `'false'` / garbage / absent / throwing read), each asserting three things: the absolute value (D-02), the agreement (D-07), and the exact refusal message — the three-assertion shape 32-REVIEW.md CR-01's agreement-only test lacked.
- Built the D-08/D-09/D-10 controls: an invitation still redeems while the door is closed; the refusal makes zero `findOne`/`create` calls and zero mailer sends; the refusal wins over a malformed email/oversized note AND over a too-short password (the positive ordering pin that is this plan's actual blocker fix); an admin gets no self-exemption; and `pendingApprovals`/`approveUser` are unaffected by a closed door.
- Performed all three mandated mutation rehearsals by hand (M1: delete the guard; M2: inline a second row-read that treats an absent row as open; M3: flip the fail-closed `catch` to return `true`), confirmed each turned the intended assertions red, and restored each to a clean (`git diff` empty) state before committing.
- Full backend suite green: 71/71 files, 590 passed + 3 pre-existing skips (baseline 578 after 34-01/34-03, +12 new tests this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: The tokenless door check in register (ADMIN-02 / D-09)** - `d4d0a47` (feat)
2. **Task 2: D-07 Layer 2 (shared-accessor call-count) + Layer 3 (five-state agreement table)** - `af62d37` (test)
3. **Task 3: The D-08 / D-09 / D-10 controls** - `5481241` (test)

**Plan metadata:** committed as part of this SUMMARY (worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally after merge)

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` - added `isPublicRegistrationEnabled` import (the file's only import from `appSettings.js`) and `PUBLIC_REGISTRATION_CLOSED_MESSAGE` export; inserted the `if (!token)` door check as the literal first statement `register` executes for a tokenless call; rewrote the resolver's header comment to name the stored `app_settings` row instead of claiming no switch exists
- `backend/src/resolvers/publicRegistrationSwitch.test.js` - appended the register-agreement half: `vi.mock('../services/mailer.js', ...)` (five senders, including `sendAccountApprovedEmail` for the D-10 control), `REGISTER_MUTATION`/`TOKENLESS_VARS`/`makeInvitation`/`PENDING_APPROVALS_QUERY`/`APPROVE_USER_MUTATION` fixtures, the D-07 Layer 2 call-count test, the D-07 Layer 3 five-state table (5 tests), and the D-08/D-09/D-10 controls (6 tests) — file grew from 14 to 26 tests

## Decisions Made

- **Reworded the door-check import comment mid-task (Rule 1)** — its first draft literally contained the strings `AppSetting`, `PUBLIC_REGISTRATION_KEY`, and `getPublicRegistrationSettingRow` inside a comment explaining what NOT to import, which made the acceptance criterion's own grep gate (`grep -c "AppSetting\|PUBLIC_REGISTRATION_KEY\|getPublicRegistrationSettingRow"` expecting `0`) report `2`. Caught before commit by running the gate; reworded to convey the same constraint without the literal matched substrings (same fix class 34-03's SUMMARY documented for its own comment).
- **Extended the Task-2 mailer mock with `sendAccountApprovedEmail` while writing Task 3 (Rule 3 — blocking issue)** — the D-10 control calls the real `approveUser` mutation, which fires `sendAccountApprovedEmail` fire-and-forget. Since `vi.mock` replaces the *entire* `../services/mailer.js` module, an export the factory doesn't list comes back `undefined`, and calling `undefined(...)` throws synchronously before the resolver's own `.catch` can attach — turning the D-10 control into a crashed mutation instead of a passing one. Fixed by adding `sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined)` to the shared factory.
- **`mockRejectedValueOnce` acceptance-criterion grep gate cannot literally read `0`** — plan 34-03 already added one legitimate, out-of-scope `mockRejectedValueOnce` at the settings-layer audit-rollback test (line ~199 as of this plan), which correctly needs single-shot rejection semantics unrelated to this plan's five-state table. This plan's own "read throws" row correctly uses the repeating `mockRejectedValue` form — verified by the M3 rehearsal, which showed BOTH accessor-backed calls (the public query and the register mutation) observing the throw. The gate's literal count is `1`, not `0`, entirely because of that unrelated, correct, pre-existing test; changing it to satisfy the gate would have weakened an unrelated atomicity test to satisfy a syntactic check, which the deviation rules do not sanction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded the door-check import comment to stop it from tripping its own grep gate**
- **Found during:** Task 1, running the acceptance-criteria grep gates
- **Issue:** The comment above the new `isPublicRegistrationEnabled` import originally spelled out the three forbidden imports by name (`AppSetting`, `PUBLIC_REGISTRATION_KEY`, `getPublicRegistrationSettingRow`), which made `grep -c "AppSetting\|PUBLIC_REGISTRATION_KEY\|getPublicRegistrationSettingRow" backend/src/resolvers/user.resolver.js` report `2` instead of the required `0`.
- **Fix:** Reworded the comment to describe the same constraint ("never the settings model, its key constant, or the bare row accessor") without containing the literal grep-matched strings.
- **Files modified:** `backend/src/resolvers/user.resolver.js`
- **Verification:** Re-ran the grep gate → `0`; re-ran `npx vitest run src/resolvers/register.test.js` → still 32/32 green.
- **Committed in:** `d4d0a47` (Task 1 commit — fixed before commit, not a follow-up)

**2. [Rule 3 - Blocking] Added `sendAccountApprovedEmail` to the shared mailer mock**
- **Found during:** Task 3, first `npx vitest run` after adding the D-10 control
- **Issue:** The D-10 control calls the real `approveUser` mutation, whose resolver fires `sendAccountApprovedEmail(...)` fire-and-forget. Task 2's `vi.mock('../services/mailer.js', ...)` factory only listed the four senders `register.test.js` needs, so `approval.resolver.js`'s import of `sendAccountApprovedEmail` resolved to `undefined`, and the synchronous `undefined(...)` call threw before the resolver's own `.catch(...)` could attach — crashing the mutation instead of returning the expected `{ errors: undefined, data: { approveUser: { status: 'Active' } } }`.
- **Fix:** Added `sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined)` to the shared mock factory.
- **Files modified:** `backend/src/resolvers/publicRegistrationSwitch.test.js`
- **Verification:** Re-ran `npx vitest run src/resolvers/publicRegistrationSwitch.test.js` → 26/26 green, including the D-10 control.
- **Committed in:** `5481241` (Task 3 commit — fixed before commit, not a follow-up)

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3), both caught and fixed before their task's commit — no follow-up commits needed. One additional item (the `mockRejectedValueOnce` grep-gate arithmetic, documented in Decisions Made above) is not a code deviation — it is a note that one acceptance-criterion grep gate's literal expected count (`0`) does not hold against the file's pre-existing (34-03) content, even though this plan's own new code satisfies the gate's intent.

**Impact on plan:** Both fixes were necessary for this plan's own acceptance criteria and test suite to pass as specified. No scope creep — no production behavior changed by either fix; the second fix only affects test-double wiring.

## Issues Encountered

- The worktree's initial HEAD (`52d044e`, forked from `origin/main`) predated Waves 1–2's `appSettings.js`/`setting.resolver.js`/`publicRegistrationSwitch.test.js` by roughly two weeks of planning commits. Resolved per the mandatory `worktree_branch_check` step: verified the working tree was clean, then `git reset --hard 7d27f78fe01dc9c1934f351727d991b497f54c48`, confirmed the new HEAD matched, and confirmed all three prerequisite files existed before starting Task 1. No project code was affected — this was worktree setup, not a plan deviation.
- Several Bash invocations that combined `git rev-parse`/`git symbolic-ref` with conditional shell logic in one command were rejected by the sandbox's worktree-isolation complexity classifier ("too complex to verify that it stays inside the worktree"). Each was resolved by splitting into separate, single-purpose commands — no workaround or alternate command semantics were used, purely a syntactic split, matching the same issue 34-01/34-03 both documented.

## User Setup Required

None — no external service configuration required. This plan is purely resolver logic + test additions on top of the already-migrated `app_settings` table and already-shipped GraphQL surface from plans 34-01/34-03.

## Next Phase Readiness

- `register`'s tokenless branch is now fully server-enforced (ADMIN-02 closed), with all three D-07 layers proven and mutation-tested — plan 34-07's SEC-04 adversarial matrix can build directly on `PUBLIC_REGISTRATION_CLOSED_MESSAGE` (already exported for exactly this purpose, matching the `MIN_REGISTER_RESPONSE_MS` precedent).
- `publicRegistrationSwitch.test.js` is now feature-complete for this phase's TDD/mutation obligations on the switch itself: 26 tests across settings-layer (34-03) and register-agreement (34-05) halves, all mutation-verified (M1/M2/M3/M5 rehearsed across the two plans).
- No blockers. Full backend suite green (71/71 files, 590/593 tests, 3 pre-existing engine-gated skips unrelated to this plan).

## Self-Check: PASSED

- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/resolvers/publicRegistrationSwitch.test.js
- FOUND commit: d4d0a47
- FOUND commit: af62d37
- FOUND commit: 5481241

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
