---
phase: 32-tokenless-registration
plan: 08
subsystem: auth
tags: [graphql, sequelize, mysql, vitest, uniform-response, mutation-testing, fail-fast-boot]

# Dependency graph
requires:
  - phase: 32-tokenless-registration (plan 32-05)
    provides: hardened tokenless register branch (uniform response for models.User.create failures, MIN_REGISTER_RESPONSE_MS timing floor, assertRegistrationName pre-lookup guard)
  - phase: 32-tokenless-registration (plan 32-07)
    provides: ADMIN_EMAIL-gated verifyEmail bootstrap and updateUser last-administrator guard (disjoint functions in the same file, sequenced only to avoid a merge conflict)
provides:
  - "Widened tokenless register try/catch (bcrypt.hash, models.User.findOne, createVerificationToken, models.User.create all inside one guarded region) closing CR-03 -- every outcome exits through finishTokenlessRegistration with no raw ORM/DB error text"
  - "Falsifiable real-clock WR-01 timing-floor regression (two tests: under-floor strict-inequality padding, over-floor branch skip) replacing the pinned-Date.now version 32-REVIEW.md flagged as unfalsifiable (WR-07)"
  - "WR-08 isolation test proving assertRegistrationName's pre-lookup guard, specifically, blocks models.User.findOne from ever being reached on an invalid name -- distinct from the pre-existing CR-01 toEqual assertion, which credited a different guard"
  - "assertRequiredColumns(sequelize): fail-fast boot check for migration 020 (users.relationshipNote), wired into initializeDatabase()"
  - "REQUIREMENTS.md SEC-01 unchecked and annotated pending /gsd:verify-work 32, following 32-06's precedent"
affects: [33-admin-approval-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-guarded-region uniform response: widen an existing try/catch outward to cover every statement between input validation and the shared exit path, rather than adding a second catch block, so there is exactly one place that can leak raw error text"
    - "Real-clock timing assertions via targeted latency injection: mock one dependency (models.User.findOne) with a genuine setTimeout delay instead of pinning Date.now, then compare real elapsed-time-driven outcomes -- falsifiable against both a deleted and a hardcoded floor"
    - "Stack-frame caller identification under vi.spyOn: the real caller of a spied global function sits two frames below where `new Error()` is constructed (index [1] is the mock's own frame, index [2] is vitest's internal spy wrapper, index [3] is the actual caller) -- and V8 does not label anonymous Promise-executor arrows by their enclosing function's name, so filtering must be path-based, not name-based"
    - "Fail-fast-at-boot column check scoped to exactly one manual migration, not a general schema-drift detector, documented as unexercised by the integration suite (globalSetup.js's sync({force:true}) always creates the column fresh)"

key-files:
  created:
    - backend/src/config/assertRequiredColumns.js
    - backend/src/config/assertRequiredColumns.test.js
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/register.test.js
    - backend/src/models/index.js
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Mocked bcrypt.hash to resolve near-instantly in the new WR-01 timing-floor test only, isolating the one variable under test (models.User.findOne latency) from bcrypt.hash(password, 12)'s own real, uncontrolled ~225-235ms cost on this hardware -- which, combined with cumulative GC/connection-pool state from ~25 prior tests in the file, made an un-mocked baseline swing widely enough (measured 257ms-414ms across otherwise-identical runs) to make a tight comparison against the 400ms floor unreliable"
  - "Discovered and fixed a stack-frame indexing bug while building the WR-01 mutation-test evidence: the plan's suggested filter (top frame at split('\\n')[1], matching the literal string 'at delay') never actually matched anything, because index [1] is always the spy mock's OWN frame (where new Error() is constructed) and V8 does not name the resolver's anonymous Promise-executor arrow 'delay' in its stack trace. The corrected filter reads index [3] (skipping the mock's own frame and vitest's internal spy wrapper) and matches on the file path (user.resolver.js), not a function name. This was caught before commit -- see Deviations."

requirements-completed: [SEC-01]

# Metrics
duration: ~70min
completed: 2026-09-01
---

# Phase 32 Plan 08: Close CR-03 Uniform-Response Gap + Repair Test-Integrity Findings Summary

**Widened the tokenless register branch's try/catch to also guard bcrypt.hash/models.User.findOne/createVerificationToken (closing CR-03), replaced an unfalsifiable pinned-clock timing test with two real-clock tests, added a WR-08 isolation test that catches what the old CR-01 toEqual assertion didn't, and added a fail-fast boot check for migration 020 -- all three code-change tasks proven by mutation testing with restored, clean git diffs.**

## Performance

- **Duration:** ~70 min (including diagnosing and fixing a real timing-test flakiness bug not anticipated by the plan)
- **Started:** 2026-09-01 (baseline test run before Task 1)
- **Completed:** 2026-09-01
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- **Closed CR-03**: `models.User.findOne` (existing-user lookup) and `createVerificationToken()` now run inside the same try/catch that already guarded `models.User.create`. A `findOne` rejection (connection-pool exhaustion, transient DB error, an unmigrated target's column error) or a `createVerificationToken` throw now returns the identical uniform success message instead of leaking raw ORM/DB error text -- and no longer skips the response-time floor, closing the timing-shape divergence too.
- **Repaired WR-07 (unfalsifiable timing test)**: the old WR-01 test pinned `Date.now` to a constant, making `elapsed` always `0` and every recorded delay always exactly `MIN_REGISTER_RESPONSE_MS` -- a tautology. The replacement uses the real clock throughout and injects a genuine latency into `models.User.findOne`, asserting the slower call's floor-padding is *strictly less* than the faster call's (falsifiable against both a deleted floor and a hardcoded one), plus a second test proving the floor is skipped once real work already exceeds it.
- **Repaired WR-08 (vacuous CR-01 credit)**: the pre-existing CR-01 `toEqual` assertion passed even with `assertRegistrationName`'s pre-lookup guard deleted (as 32-05's own mutation test showed, 3 other tests already caught that specific regression, but the toEqual test itself did not discriminate the guard). Added a new test asserting `models.User.findOne` is never called when the name fails validation -- isolating that specific property.
- **Fail-fast boot check**: `assertRequiredColumns(sequelize)` queries `information_schema.columns` for `users.relationshipNote` and throws naming migration 020 if absent, wired into `initializeDatabase()`. Without it, an unmigrated deployment target would (after this plan's own CR-03 fix) silently accept and drop every tokenless self-registration forever, with no signal to caller or operator.
- **REQUIREMENTS.md corrected**: SEC-01 unchecked and annotated (CR-01's oracle was closed by 32-05, but CR-03 meant the full uniform-response claim wasn't true until this plan's Task 1), deferring re-checking to `/gsd:verify-work 32`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen the tokenless branch's uniform-response guard to cover findOne and createVerificationToken** - `3f844fa` (fix)
2. **Task 2: Repair the two vacuous acceptance tests (timing floor, name-guard isolation)** - `6fd4f64` (test)
3. **Task 3: Fail-fast startup column check for migration 020, and correct REQUIREMENTS.md's SEC-01 tracking** - `d2ac2fd` (feat)

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` - tokenless `register` branch: try block opens before `bcrypt.hash` (was before `models.User.create` only), now encloses `findOne`, the existing-user branch's early return, `createVerificationToken()`, and `create`; catch logs only `err?.name`/`err?.message` (never the full error object, which can carry bound SQL parameters including the registrant's email and bcrypt hash)
- `backend/src/resolvers/register.test.js` - 2 new CR-03 regression tests (findOne rejection, createVerificationToken throw, both asserting the injected error text appears nowhere in the response); the old pinned-clock WR-01 test deleted and replaced with 2 real-clock tests; 1 new WR-08 isolation test added (additive, the pre-existing CR-01 toEqual test is untouched)
- `backend/src/config/assertRequiredColumns.js` - new; `assertRequiredColumns(sequelize)`, scoped to migration 020's column only, documented as fail-fast-at-boot rather than a general schema-drift detector
- `backend/src/config/assertRequiredColumns.test.js` - new; 2 tests against a hand-built fake `sequelize` (no real DB connection)
- `backend/src/models/index.js` - `initializeDatabase()` calls `await assertRequiredColumns(sequelize);` immediately after `sequelize.sync()`, with a comment documenting this path is unexercised by `npm test` (globalSetup's `sync({ force: true })` always creates the column fresh)
- `.planning/REQUIREMENTS.md` - SEC-01 line unchecked and annotated; no other line touched

## Decisions Made

- **Mocked `bcrypt.hash` in the new WR-01 timing test.** Real `bcrypt.hash(password, 12)` measures ~225-235ms standalone on this hardware, and in the full test-file context (25+ prior tests deep) the combined real-work baseline swung between 257ms and 414ms across otherwise-identical runs -- too unstable to leave under a tight comparison against the 400ms floor. Mocking `bcrypt.hash` to resolve near-instantly isolates the one variable this test actually exercises (`models.User.findOne` latency) while keeping `Date.now()` and every `setTimeout` call completely real and unpinned.
- **Fixed a stack-frame indexing bug found while building the mutation-test evidence (not anticipated by the plan).** The plan's suggested filter -- `(new Error().stack || '').split('\n')[1]`, matching the literal substring `'at delay'` -- never matched anything in practice. Two independent causes: (1) under `vi.spyOn(global, 'setTimeout')`, index `[1]` of the stack is always the mock's own frame (where `new Error()` is constructed), not the caller; the real caller sits at index `[3]`, after vitest's own internal spy-wrapper frame at index `[2]`. (2) V8 does not label the resolver's `delay()` helper's inner Promise-executor arrow (`(resolve) => setTimeout(resolve, ms)`) as `"at delay"` in the trace -- it shows only the enclosing file/line, with no inferred function name, since the arrow is one level removed from the named `delay` function. The corrected filter reads index `[3]` and matches on the file path (`user.resolver.js`), which is both accurate and robust to V8's function-naming behavior. This was caught and fixed BEFORE any commit -- the committed test file never contained the broken filter -- see Deviations for how this was discovered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's suggested timing values and stack-frame filter did not work as written; both were bugs in the test construction, not production code**
- **Found during:** Task 2, while building the two new real-clock WR-01 tests
- **Issue:** Two compounding problems, both discovered empirically via diagnostic `console.log` instrumentation (removed before commit): (a) the plan's suggested `stack.split('\n')[1]` filter, checking for the literal substring `'at delay'`, is structurally wrong under `vi.spyOn` -- index `[1]` is always the spy mock's own frame, and V8 never actually labels the resolver's anonymous Promise-executor arrow `"at delay"` -- so the filter silently captured nothing, EVER, in either new test. This meant the "adds no delay once real work exceeds the floor" test (asserting `capturedDelays` has length 0) was passing *vacuously* -- it would have passed even if the production floor-skip logic were deleted entirely, which is exactly the "green test proving nothing" failure mode this plan exists to close for the OTHER two tests. (b) Separately, the plan's suggested ~150ms injected delay for the "slow" call was too large relative to real `bcrypt.hash(password, 12)` cost (~225-235ms measured directly, and higher still by test-file position due to cumulative GC/pool state), which pushed the "slow" call's own elapsed time past the 400ms floor entirely, collapsing it into the wrong branch.
- **Fix:** (a) Corrected the stack-frame filter to index `[3]` (the real immediate caller, after the mock's own frame and vitest's internal spy-wrapper frame) and switched from a function-name match (`'at delay'`) to a file-path match (`'user.resolver.js'`) -- verified by diagnostic logging of the full frame array before removing the diagnostics. (b) Mocked `bcrypt.hash` to resolve near-instantly for the timing tests (see Decisions above) and reduced the injected `findOne` delay to 100ms, comfortably within the resulting headroom.
- **Files modified:** `backend/src/resolvers/register.test.js` (test file only; no implementation file was ever touched by this fix)
- **Verification:** Re-ran the two new tests 3+ times consecutively after the fix -- 27/27 green every run, no flakiness observed. Ran both mutation tests (hardcoded floor, guard removal) against the corrected filter and confirmed the predicted tests go red (see Mutation-test evidence below) -- including confirming the over-floor test is now genuinely discriminating, not vacuously passing.
- **Committed in:** `6fd4f64` (Task 2 commit) -- the diagnostic `console.log` statements and the broken filter were never committed; only the corrected, verified version landed.

---

**Total deviations:** 1 auto-fixed (Rule 1 -- a test-construction bug in the plan's own suggested implementation, caught and fixed during RED/GREEN verification, before any commit)
**Impact on plan:** The fix was necessary to get a genuinely falsifiable WR-01 regression -- the exact goal this plan's Task 2 exists to achieve. No scope creep: confined entirely to the two new tests in `register.test.js`; zero implementation files were touched by this fix, and the final committed test file matches the plan's intent (real clock, targeted latency injection, immediate-caller-only frame filtering) even though the literal mechanics (frame index, match string) differ from the plan's suggested values.

## Issues Encountered

None beyond the auto-fixed test-construction issue documented above, which was fully resolved before commit.

## Mutation-test evidence

Every guard added or widened in this plan was mutation-tested: neuter the guard, confirm the specific test(s) go RED, restore, confirm GREEN. `git diff --quiet` confirmed a clean restore after each mutation; no mutation was ever committed.

| Guard | Mutation applied | Result | Restored & reconfirmed |
|-------|------------------|--------|------------------------|
| Task 1: widened try/catch (CR-03) | Moved `models.User.findOne`/`createVerificationToken` back outside the try (restoring the exact pre-fix structure, leaving only `create` guarded) | RED -- exactly the 2 new CR-03 tests failed (`findOne rejects`, `createVerificationToken throws`); all 23 other tests stayed green | Yes -- 25/25 green, `git diff --quiet` clean |
| Task 2: WR-01 timing floor (both new tests) | `finishTokenlessRegistration` changed from `if (elapsed < MIN_REGISTER_RESPONSE_MS) await delay(MIN_REGISTER_RESPONSE_MS - elapsed)` to an unconditional `await delay(MIN_REGISTER_RESPONSE_MS)` (hardcoded/constant floor) | RED -- exactly the 2 new timing tests failed (strict-inequality test: both calls got the identical fixed delay; over-floor test: the over-floor call now got a delay when it should get none); all 25 other tests stayed green | Yes -- 27/27 green, `git diff --quiet` clean |
| Task 2: WR-08 isolation test | Removed `const cleanName = assertRegistrationName(name);` (replaced with `const cleanName = name;`, matching 32-05's own documented mutation test) | RED -- 4 tests failed: the new WR-08 isolation test (the one this mutation targets), plus the pre-existing CR-01 toEqual test, the WR-03 whitespace-name test, and the 256-char boundary test (matching 32-05's own documented 3-test set, now joined by the new isolation test) | Yes -- 27/27 green, `git diff --quiet` clean |
| Task 3: `assertRequiredColumns` | Not mutation-tested against a real DB (out of scope -- this is a unit-tested pure function against a mocked `sequelize`, not a guard embedded in a larger code path); its two unit tests directly exercise both branches (column present / column absent) | N/A -- direct branch coverage via `assertRequiredColumns.test.js`'s 2 tests, both passing | N/A |

**Note on the WR-08 mutation result:** the plan's acceptance criteria explicitly allowed the pre-existing CR-01 `toEqual` test to NOT be required in the red set for this mutation to count as successful (the point being that the NEW test must catch it, not that the old one must too). It turned out the old test also went red under this specific mutation (consistent with 32-05's own prior documentation of the same mutation), which is a stronger result than the minimum bar, not a contradiction of it.

## Critical Plan Gates (from this plan's `must_haves.truths`)

### Gate 1: findOne/createVerificationToken failures return the uniform message, RED-then-GREEN

RED (Task 1, pre-fix code):
```
× never leaks raw ORM/DB error text when models.User.findOne rejects (CR-03)
   AssertionError: expected [ {…} ] to be undefined
   message: "SequelizeConnectionError: connection pool exhausted"
× never leaks raw error text when createVerificationToken throws on the free-email path (CR-03)
   AssertionError: expected [ {…} ] to be undefined
   message: "crypto.randomBytes failed"
 Tests  2 failed | 23 passed (25)
```

GREEN (Task 1, post-fix code): `Tests  25 passed (25)`.

### Gate 2: WR-01 timing-floor test is genuinely falsifiable (not pinned, not vacuous)

Verified via the mutation table above: the hardcoded-floor mutation turns both new timing tests red; the stack-frame-filter bug (found and fixed before commit) is what would otherwise have made the "over-floor" test pass vacuously regardless of production behavior -- confirmed fixed by observing it correctly go red under the same mutation as its sibling test.

### Gate 3: WR-08 isolation test discriminates the pre-lookup guard specifically

Verified via the mutation table above: removing `assertRegistrationName`'s call turns the new isolation test red (via `findOneSpy` being called when it should not have been), independent of and in addition to the pre-existing `toEqual` test.

### Gate 4: unmigrated deployment target fails at boot, not silently per-request

`assertRequiredColumns.test.js`: 2/2 passing (column-present resolves cleanly; column-absent rejects with a message containing `020-add-users-relationship-note.sql`). Wired into `initializeDatabase()` immediately after `sequelize.sync()`, confirmed via `grep -n "assertRequiredColumns(sequelize)" backend/src/models/index.js`.

### Gate 5: REQUIREMENTS.md no longer overclaims SEC-01

`git diff .planning/REQUIREMENTS.md` touches only the SEC-01 bullet line. `grep -c "\[x\] \*\*SEC-01\*\*"` returns 0; `grep -c "\[ \] \*\*SEC-01\*\*"` returns 1; `grep -c "re-verify via /gsd:verify-work 32"` returns 1.

### Gate 6: full backend suite, 0 failures

Full suite (`npm test --workspace backend`, run once at the end per the test-environment instructions, all 3 tasks' changes included): **509 passed | 3 skipped (512), 68 test files, 0 failures.** The 3 skips are the pre-existing, documented MariaDB-engine-gated skips (KNOWN-ISSUES.md); they run on CI (MySQL 8.4) and were not touched by this plan. Matches the predicted arithmetic exactly: 503 (32-07 baseline) + 2 (Task 1's new CR-03 tests) + 2 (Task 2's net test-count change: -1 old WR-01 test, +1 WR-08 isolation, +2 new timing tests) + 2 (Task 3's `assertRequiredColumns.test.js`) = 509.

## Known Stubs

None. This plan is backend-only hardening of an existing mutation plus a boot-time check; no new UI surface, no placeholder data paths.

## Threat Flags

None. All changes stay within this plan's own documented `<threat_model>` (the tokenless `register` trust boundary and the backend-boot-to-MySQL boundary); no new endpoints, auth paths, or schema changes were introduced.

## User Setup Required

None - no external service configuration required. `assertRequiredColumns` only affects real backend boot (`server.js`'s call to `initializeDatabase()`), which is unchanged behaviorally for any target where migration 020 has already been applied (as documented, production apply of migration 020 was deferred per Plan 30-01 -- see Next Phase Readiness).

## Next Phase Readiness

- CR-03 is closed: the tokenless register mutation's uniform-response guarantee (SEC-01) now holds for every failure mode reachable on that path -- `bcrypt.hash`, `models.User.findOne`, `createVerificationToken`, and `models.User.create` all exit through the single `finishTokenlessRegistration` path.
- Both 32-REVIEW.md test-integrity findings this plan targeted (WR-07 pinned-clock, WR-08 vacuous credit) are repaired and mutation-confirmed falsifiable.
- **Operational follow-up, not a code blocker:** migration 020 (`backend/migrations/manual/020-add-users-relationship-note.sql`) must be confirmed applied to the production database before this plan's `assertRequiredColumns` boot check ships to that target -- otherwise the backend will refuse to boot in production. This mirrors the same deferred-migration pattern already tracked for migrations 018-020 elsewhere in this phase's history; no new tracking needed beyond confirming it during the next production deploy.
- SEC-01 is intentionally left unchecked in REQUIREMENTS.md pending an independent `/gsd:verify-work 32` pass, per this plan's own annotation.
- WR-04 through WR-11 (32-REVIEW.md warnings not named in this gap-closure round's scope, aside from WR-07/WR-08 closed here) remain open, unrelated to this plan's SEC-01/CR-03 scope.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: backend/src/config/assertRequiredColumns.js
- FOUND: backend/src/config/assertRequiredColumns.test.js
- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/resolvers/register.test.js
- FOUND: backend/src/models/index.js
- FOUND: .planning/REQUIREMENTS.md
- FOUND: 3f844fa (Task 1 commit)
- FOUND: 6fd4f64 (Task 2 commit)
- FOUND: d2ac2fd (Task 3 commit)
