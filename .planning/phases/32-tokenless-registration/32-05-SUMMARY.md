---
phase: 32-tokenless-registration
plan: 05
subsystem: auth
tags: [graphql, sequelize, mysql, vitest, enumeration-safety, timing-attack]

# Dependency graph
requires:
  - phase: 32-tokenless-registration (plans 32-01..32-04)
    provides: tokenless register mutation (REG-02), relationshipNote storage/cap, pendingApprovals queue, admin-notification wiring
provides:
  - "namePolicy.js: assertRegistrationName(name) -- trim/require/cap-255 guard, mirroring passwordPolicy.js"
  - "Hardened tokenless register branch: name validated pre-lookup, models.User.create wrapped in try/catch returning the identical success message on any failure, MIN_REGISTER_RESPONSE_MS (400ms) uniform response-time floor via finishTokenlessRegistration"
  - "CR-01/WR-01/WR-02/WR-03(tokenless)/WR-09 regression coverage in register.test.js, proven RED-then-GREEN"
  - "Dedicated unit test files for namePolicy.js and relationshipNotePolicy.js (WR-10)"
affects: [33-admin-approval-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-exit-path timing floor: finishTokenlessRegistration(startedAt) mirrors requestPasswordReset's MIN_RESET_RESPONSE_MS/delay idiom for a second enumeration-silent mutation"
    - "Mutation-testing a guard by call-site stack filtering (new Error().stack.includes('user.resolver.js')) to isolate a resolver's own setTimeout usage from a live Sequelize connection pool's internal timers under a global setTimeout spy"

key-files:
  created:
    - backend/src/utils/namePolicy.js
    - backend/src/utils/namePolicy.test.js
    - backend/src/utils/relationshipNotePolicy.test.js
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/register.test.js

key-decisions:
  - "Filtered the WR-01 timing-floor spy test by call-site (stack.includes('user.resolver.js')) rather than by delay magnitude, after a blanket global.setTimeout mock recursed into the Sequelize connection pool's own internal idle-check timer and blew the call stack"
  - "Gated the duplicate-insert-race test's two concurrent models.User.findOne calls behind a two-arrival barrier instead of a bare Promise.all, because bcrypt's libuv-threadpool timing let the race resolve via the ordinary taken-email branch often enough to make the original RED demonstration flaky"

requirements-completed: [SEC-01]

# Metrics
duration: 32min
completed: 2026-08-31
---

# Phase 32 Plan 05: Close CR-01 Tokenless-Registration Enumeration Oracle Summary

**Validated `name` (trim/require/cap-255) before the tokenless register lookup, wrapped `models.User.create` in try/catch to return the identical success message on any DB failure, and added a 400ms `MIN_REGISTER_RESPONSE_MS` floor -- closing CR-01/WR-01/WR-02/WR-03(tokenless)/WR-09 with a RED-then-GREEN regression suite and two mutation-tested guards.**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-08-31T11:18:00+02:00 (first baseline test run)
- **Completed:** 2026-08-31T11:50:17+02:00 (Task 3 commit)
- **Tasks:** 3
- **Files modified:** 5 (1 created implementation file, 1 modified implementation file, 3 test files created/modified)

## Accomplishments

- Closed CR-01: an unauthenticated caller sending a 300-character `name` used to get a fixed success message against a taken email but a raw `Data too long for column 'name' at row 1` GraphQL error against a free email -- a one-request, deterministic existence oracle. Both outcomes are now byte-identical.
- Closed WR-02: raw ORM/DB error text (unique-constraint violations, missing-column errors) can no longer reach an anonymous `register` caller on the tokenless path.
- Closed WR-01: added a `MIN_REGISTER_RESPONSE_MS` (400ms) floor applied uniformly to every tokenless outcome, closing the measured ~1.3ms residual timing divergence.
- Closed the tokenless half of WR-03 (blank/whitespace-only `name` rejected); the invited branch's own WR-03 half is explicitly left open per the plan's scope.
- Closed WR-09's well-formed-input half (full-response `toEqual`, not just `.message` equality, on the pre-existing taken-email test).
- Closed WR-10 for both `namePolicy.js` (new) and `relationshipNotePolicy.js` (pre-existing, previously untested in isolation).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing regression tests for CR-01, WR-01, WR-02, WR-03, WR-09** - `f69e038` (test)
2. **Task 2 (GREEN): namePolicy.js + hardened tokenless register branch** - `1447cad` (fix)
3. **Task 3: Dedicated unit tests for namePolicy.js and relationshipNotePolicy.js (WR-10)** - `1fbd17d` (test)

_Note: Task 1 and Task 2 form this plan's RED/GREEN TDD gate pair; Task 3 is a follow-on `auto` task, not part of that gate._

## Files Created/Modified

- `backend/src/utils/namePolicy.js` - `assertRegistrationName(name)` + `MAX_NAME_LENGTH = 255`, mirrors `passwordPolicy.js`'s single-guard-clause idiom
- `backend/src/utils/namePolicy.test.js` - boundary (254/255/256), empty/whitespace/null/undefined, trim, non-string coercion, `MAX_NAME_LENGTH` export
- `backend/src/utils/relationshipNotePolicy.test.js` - boundary (499/500/501), null/undefined/empty short-circuit, explicit pin of the current UTF-16-length astral-character over-rejection (WR-08, documented, out of scope)
- `backend/src/resolvers/user.resolver.js` - tokenless `register` branch hardened: `startedAt`/`assertRegistrationName` added before the lookup, `models.User.create` wrapped in `try/catch`, new `TOKENLESS_REGISTER_MESSAGE`/`MIN_REGISTER_RESPONSE_MS`/`finishTokenlessRegistration` added; invited branch (`if (token) { ... }`) untouched
- `backend/src/resolvers/register.test.js` - new nested `describe('enumeration-safety hardening (CR-01, WR-01, WR-02, WR-03, WR-09)', ...)` (6 `it`s across the CR-01/WR-03/boundary/race/WR-02/WR-01 tests) plus a strengthened pre-existing taken-email test

## Decisions Made

- **WR-01 test filtered by call-site, not delay magnitude.** The plan's own suggested mock (`vi.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0; })`) recurses into the Sequelize connection pool's own internal idle-check timer (`sequelize-pool`'s `Pool._scheduleRemoveIdle`, which re-registers itself via `setTimeout` every time it fires) and blows the call stack (`RangeError: Maximum call stack size exceeded`) -- observed twice, once at a 60000ms interval and once at a 1000ms interval, ruling out a delay-magnitude threshold as a reliable filter. Fixed by checking `new Error().stack.includes('user.resolver.js')` inside the mock: only calls originating from the resolver's own `delay()` helper are intercepted; everything else (the connection pool included) passes through to the real `setTimeout` untouched.
- **Duplicate-insert-race test gated on a two-arrival barrier.** A bare `Promise.all` of two concurrent `register` calls against the same fresh email was flaky: bcrypt's libuv-threadpool timing sometimes let the second call's `findOne` run after the first call's row had already committed, resolving the "race" via the ordinary taken-email branch (no DB collision at all) rather than the intended unique-constraint collision. Fixed by spying on `models.User.findOne` and gating both calls behind a shared barrier that only releases once both have arrived, guaranteeing both see no existing user and both attempt `models.User.create` concurrently every run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WR-01 test's blanket `setTimeout` mock crashed the Sequelize connection pool**
- **Found during:** Task 1 (RED)
- **Issue:** The plan's literal mock implementation (`(cb) => { cb(); return 0; }`) fires every `setTimeout` call synchronously and immediately, including the connection pool's own internal idle-check timer, which reschedules itself via `setTimeout` on every fire -- an unbounded synchronous recursion that threw `RangeError: Maximum call stack size exceeded` and aborted the test run.
- **Fix:** Filtered the mock by call-site (`new Error().stack.includes('user.resolver.js')`) instead of intercepting every `setTimeout` call, so only the resolver's own `delay()` invocations are fast-tracked; the connection pool's timers pass through to the real `setTimeout` unaffected.
- **Files modified:** `backend/src/resolvers/register.test.js`
- **Verification:** Re-ran `register.test.js` after the fix; the crash no longer occurs and the test fails cleanly for the predicted reason (`shortDelays.length` is 0, not >= 2) at RED, and passes cleanly at GREEN.
- **Committed in:** `f69e038` (Task 1 commit)

**2. [Rule 1 - Bug] Duplicate-insert-race test was non-deterministic**
- **Found during:** Task 1 (RED)
- **Issue:** A bare `Promise.all` race against a real DB sometimes resolved via the ordinary taken-email branch instead of the unique-constraint collision the test targets, making the RED failure unreliable across runs (observed passing once out of several runs in the full-file context).
- **Fix:** Added a two-arrival barrier on `models.User.findOne` so both concurrent calls are guaranteed to see "no existing user" and both attempt `models.User.create` concurrently, every run.
- **Files modified:** `backend/src/resolvers/register.test.js`
- **Verification:** Re-ran the isolated test 3 times after the fix; failed identically (predicted reason) every time at RED, and passed identically every time at GREEN.
- **Committed in:** `f69e038` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 -- test-construction bugs discovered while driving the RED phase, not implementation-file changes)
**Impact on plan:** Both fixes were necessary to get a reliable, non-flaky RED-then-GREEN signal for the plan's own critical acceptance gates. No scope creep -- both fixes are confined to `register.test.js`; zero implementation files were touched by either fix.

## Issues Encountered

None beyond the two auto-fixed test-construction issues documented above.

## Critical Plan Gates (from this plan's `must_haves.truths`)

### Gate 1: Observed RED-then-GREEN

RED (Task 1, pre-fix code, `npm test -w backend -- src/resolvers/register.test.js`):

```
 ❯ src/resolvers/register.test.js (23 tests | 6 failed) 8477ms
       × returns byte-identical responses for a taken email and a fresh email under a hostile 300-char name payload (CR-01) 674ms
       × rejects a whitespace-only name on a fresh email (WR-03, tokenless half) 245ms
       × rejects a name one character over the 255-character cap (boundary) 244ms
       × returns byte-identical responses when two concurrent registrations race on the same fresh email (duplicate-insert race) 458ms
       × never leaks raw ORM/DB error text when models.User.create fails for any other reason (WR-02) 234ms
       × applies the same minimum response-time floor to every tokenless outcome (WR-01, shape not wall-clock) 710ms

 Test Files  1 failed (1)
      Tests  6 failed | 17 passed (23)
```

Each failure matched its predicted cause:
- CR-01: `freshResult` was `{errors:[{message:"Data too long for column 'name' at row 1", ...}], data:null}` vs. `takenResult`'s success -- not equal.
- WR-03 whitespace: `TypeError: Cannot read properties of undefined (reading '0')` -- no name validation exists, so `errors` was `undefined`.
- 256-char boundary: `errors[0].message` was `"Data too long for column 'name' at row 1"`, not the friendly message.
- Duplicate-insert race (after the barrier fix above): raw `"Validation error"` (Sequelize's default unique-constraint message) leaked to one of the two racers.
- WR-02 simulated failure: the mocked `"Unknown column 'relationshipNote' in 'field list'"` error propagated verbatim as a GraphQL error.
- WR-01 timing floor: `shortDelays.length` was `0` (not >= 2) -- the current tokenless branch never calls `delay()`/`setTimeout` at all.

GREEN (Task 2, post-fix code, same command):

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

Full backend suite after Task 2: `480 passed | 3 skipped (483)`, up from the pre-existing `473 passed | 3 skipped (476)` baseline, 0 failures, 65 files.

### Gate 2: Mutation test (both guards)

**Guard A -- `try`/`catch` around `models.User.create` removed** (temporary edit, restored immediately after): running `register.test.js` turned exactly 2 tests red and no others:
```
 ❯ src/resolvers/register.test.js (23 tests | 2 failed) 9215ms
       × returns byte-identical responses when two concurrent registrations race on the same fresh email (duplicate-insert race) 509ms
       × never leaks raw ORM/DB error text when models.User.create fails for any other reason (WR-02) 262ms

 Tests  2 failed | 21 passed (23)
```
Matches the plan's prediction exactly (Test 4 and Test 5). Restored; re-ran `register.test.js` -- 23/23 passed, `grep -n "MUTATION-TEST-TEMP"` returned no matches (clean restore).

**Guard B -- `const cleanName = assertRegistrationName(name);` removed** (temporary edit, restored immediately after): running `register.test.js` turned exactly 3 tests red and no others:
```
 ❯ src/resolvers/register.test.js (23 tests | 3 failed) 11256ms
       × returns byte-identical responses for a taken email and a fresh email under a hostile 300-char name payload (CR-01) 1080ms
       × rejects a whitespace-only name on a fresh email (WR-03, tokenless half) 419ms
       × rejects a name one character over the 255-character cap (boundary) 421ms

 Tests  3 failed | 20 passed (23)
```
Matches the plan's prediction exactly (Test 1, Test 2, and the 256-char half of Test 3; the 255-char boundary `it` still passed, as expected since a well-formed 255-char name was never invalid). Restored; re-ran `register.test.js` -- 23/23 passed, `grep -n "MUTATION-TEST-TEMP"` returned no matches (clean restore).

Both guards are confirmed load-bearing: removing either one turns on exactly its predicted regression tests and nothing else.

### Gate 3: Invited branch untouched

Extracted the `register: async (_parent, ...` through the tokenless-branch comment marker (i.e. the entire `if (token) { ... }` invited-registration block plus its closing brace) from both the pre-Task-2 commit (`f69e038`) and the post-Task-2 working tree, and diffed the two extracted blocks directly (not by fixed line numbers, since an import line shifted everything by one): **the diff was empty -- byte-identical.** All of this plan's changes (the new import, the two new module-scoped constants, `finishTokenlessRegistration`, `startedAt`/`assertRegistrationName`/the `try/catch` wrap) live strictly after the invited branch's closing brace, inside the tokenless branch only.

`grep -c "Registration received. Verify your email to activate your account." backend/src/resolvers/user.resolver.js` returns exactly `2` -- the invited branch's own untouched inline return, and the new `TOKENLESS_REGISTER_MESSAGE` constant definition (down from the pre-fix baseline of 3, as the plan predicted).

## Known Stubs

None. This plan is backend-only hardening of an existing mutation; no new UI surface, no placeholder data paths.

## Threat Flags

None. All changes stay within the `register` tokenless branch's existing trust boundary (anonymous caller -> `register` -> MySQL) already covered by this plan's own `<threat_model>`; no new endpoints, auth paths, or schema changes were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROADMAP Phase 32 Success Criterion 2 now holds under adversarial input (over-length name, duplicate-insert race, simulated create failure), not just well-formed input.
- No raw ORM/DB error text reaches an anonymous `register` caller on the tokenless path.
- The invited branch is unmodified and its existing test coverage (8 tests in the `register (invitation-only)` describe block) passed unaffected throughout.
- WR-03's invited-branch half (blank/whitespace-only `name` still accepted when a valid invitation token is presented) remains open, deliberately, as documented residual debt -- not an enumeration oracle since reaching that branch requires a secret token. No blocker for Phase 33.
- WR-04, WR-05, WR-06, WR-07, WR-08 (pinned, not fixed), WR-11 remain open per 32-VERIFICATION.md, unrelated to this gap closure's SEC-01/CR-01 scope.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-08-31*

## Self-Check: PASSED

- FOUND: backend/src/utils/namePolicy.js
- FOUND: backend/src/utils/namePolicy.test.js
- FOUND: backend/src/utils/relationshipNotePolicy.test.js
- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/resolvers/register.test.js
- FOUND: f69e038 (Task 1 commit)
- FOUND: 1447cad (Task 2 commit)
- FOUND: 1fbd17d (Task 3 commit)
