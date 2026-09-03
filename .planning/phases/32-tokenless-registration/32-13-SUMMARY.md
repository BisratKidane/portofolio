---
phase: 32-tokenless-registration
plan: 13
subsystem: auth
tags: [graphql, sequelize, mysql, vitest, enumeration-safety, input-validation, gap-closure]

# Dependency graph
requires:
  - phase: 32-tokenless-registration (plans 32-01..32-12)
    provides: tokenless register mutation (REG-02), pre-try name/relationshipNote guards, hardened catch-all (CR-03), the enumeration-silence + timing-floor pattern this plan extends to email
provides:
  - "emailPolicy.js: assertRegistrationEmail(email) -- normalize (lowercase+trim), length-cap at 254, format-check guard, mirroring namePolicy.js's shape"
  - "Tokenless register branch now validates email format/length BEFORE the guarded try/catch, alongside name and relationshipNote, closing 32-VERIFICATION.md's Gap 3 (Truth 8)"
  - "Discovered and fixed: MAX_EMAIL_LENGTH must be 254, not the users.email column's VARCHAR(255) width -- Sequelize's own isEmail model validator enforces RFC 5321's practical 254-char limit regardless of column width"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone regex format-check instead of importing `validator` directly (a transitive-only dependency via sequelize) -- avoids a phantom direct dependency"
    - "Boundary-length integration tests must use a short local-part + long domain construction so the DB-layer isEmail validator, not just the pre-try guard, actually accepts the row -- a naive same-total-length local-part-heavy email can pass the pre-try guard but still fail Sequelize's own isEmail at create() time"

key-files:
  created:
    - backend/src/utils/emailPolicy.js
    - backend/src/utils/emailPolicy.test.js
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/register.test.js

key-decisions:
  - "MAX_EMAIL_LENGTH set to 254, not 255, after empirically confirming (against the installed `validator` package version, which backs Sequelize's `isEmail: true` model validator) that a 255-character email is rejected by the model layer regardless of the VARCHAR(255) column's storage capacity -- a naive 255 cap would have reopened a narrow silent-drop gap for exactly-255-char emails, the exact class of bug this plan exists to close"
  - "Format regex `/^[^\\s@]+@[^\\s@.]+\\.[^\\s@]+$/` implemented standalone rather than importing `validator` (only a transitive dependency today, not declared in backend/package.json)"

requirements-completed: [REG-02]

# Metrics
duration: 17min
completed: 2026-09-03
---

# Phase 32 Plan 13: Close Gap 3 -- Tokenless Register Email Format/Length Pre-Validation Summary

**Added `emailPolicy.js` (`assertRegistrationEmail`) mirroring `namePolicy.js`'s shape and wired it into the tokenless register branch before the guarded try/catch, closing 32-VERIFICATION.md's Gap 3 (Truth 8) -- a malformed or over-length email now produces an actionable error and creates zero rows instead of the uniform success message; discovered and fixed a real off-by-one (254 vs 255) in the length cap along the way, confirmed by mutation testing and the full regression gate (536 passed / 3 skipped, 0 failures).**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-09-03T09:28:00+02:00 (first file read)
- **Completed:** 2026-09-03T09:44:26+02:00 (Task 3 full-suite verification)
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Closed Gap 3 (32-VERIFICATION.md Truth 8 / 32-REVIEW.md CR-02 second-round numbering): registering with a malformed email (`ada@exmaple`, missing TLD) used to reach the model layer inside the guarded try/catch, throw a Sequelize validation error, and get swallowed into the uniform success message -- zero rows created, zero signal to the registrant. It now throws `'Enter a valid email address.'` before the try block, exactly like the existing `name`/`relationshipNote` guards.
- Closed the equivalent whitespace-only-email gap (`'   '` used to slip past the old `if (!email)` truthiness check, normalize to `''`, and fail the same silent way).
- Closed the over-length-email gap with a length cap, and discovered during Task 2's own boundary test that the cap must be 254, not 255 -- Sequelize's `isEmail: true` model validator enforces RFC 5321's practical 254-character total-length limit independent of the `VARCHAR(255)` column width, so a naive 255 cap would have left exactly-255-char emails falling through to the same silent-drop failure mode this plan exists to close.
- SEC-01/D-08 enumeration-silence for well-formed emails is unaffected: `assertRegistrationEmail` is a pure function of the caller-supplied `email` string alone (no `models` parameter) and runs structurally before `models.User.findOne` is ever called, so none of its three error messages can depend on whether an account already exists at that address.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create emailPolicy.js and its unit tests** - `c944437` (test)
2. **Deviation fix (Rule 1): correct MAX_EMAIL_LENGTH off-by-one to 254** - `0d86d0e` (fix)
3. **Task 2: Wire assertRegistrationEmail into the tokenless register branch, add integration regression tests** - `56cf994` (fix)
4. **Task 3: Self-check enumeration-safety non-regression, full regression gate** - no code changes; verification-only, results recorded below

_Note: the deviation fix commit (`0d86d0e`) sits between Task 1's and Task 2's plan-numbered commits because the off-by-one was discovered while writing Task 2's own integration boundary test, against Task 1's already-committed implementation._

## Files Created/Modified

- `backend/src/utils/emailPolicy.js` - `assertRegistrationEmail(email)` + `MAX_EMAIL_LENGTH = 254`, mirrors `namePolicy.js`'s single-guard-clause idiom (required -> length -> format)
- `backend/src/utils/emailPolicy.test.js` - 11 unit tests: well-formed normalize/lowercase/trim, subdomain acceptance, required (empty/whitespace/null/undefined), 254/255-char boundary pair, missing-TLD, no-@, `MAX_EMAIL_LENGTH` export
- `backend/src/resolvers/user.resolver.js` - tokenless `register` branch: added `assertRegistrationEmail` import, replaced the old 4-line `if (!email) throw ...; normalizedEmail = email.toLowerCase().trim();` block with a single `assertRegistrationEmail(email)` call, same source position (before the guarded try block)
- `backend/src/resolvers/register.test.js` - new nested `describe('email format/length validation before the guarded try/catch (Gap 3, 3rd round, gap-closure)', ...)` with 5 tests (missing-TLD, whitespace-only, over-254-cap, at-254-cap boundary, findOne-isolation)

## Decisions Made

- **MAX_EMAIL_LENGTH is 254, not 255 (deviation from the plan's literal text, corrected for correctness).** The plan's `<behavior>` section explicitly said "mirrors `MAX_NAME_LENGTH`'s pattern, capped at the `users.email` column's `VARCHAR(255)` default" and both Task 1's and Task 2's boundary tests were specified at 255. Empirically confirmed against the installed `validator` package (which backs Sequelize's `isEmail: true` validator) that it hard-rejects any email over 254 characters total, regardless of column width -- a 255-character, format-valid email fails `models.User.create()`'s own `isEmail` check *inside* the guarded try/catch and would have been silently swallowed into the uniform success message, reopening exactly the class of bug this plan exists to close, just for one specific length. Fixed `MAX_EMAIL_LENGTH` to 254 and updated both the unit and integration boundary tests to match (243→242/243 char local-part construction for the unit tests; a short 10-char local part + long domain for the integration "accepts" test, since a 254-char email built entirely from a long local part still fails `validator.isEmail`'s separate 64-char local-part limit).
- Standalone format regex (`/^[^\s@]+@[^\s@.]+\.[^\s@]+$/`) rather than importing `validator` directly, per the plan's own read_first note that `validator` is only a transitive dependency (via `sequelize`), not declared in `backend/package.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MAX_EMAIL_LENGTH off-by-one: 255 does not match what the DB layer actually accepts**
- **Found during:** Task 2 (writing the integration boundary test "accepts an email exactly at the 255-character cap")
- **Issue:** `assertRegistrationEmail`'s own length check permitted up to 255 characters (mirroring `MAX_NAME_LENGTH`'s pattern and the `users.email` column's `VARCHAR(255)` width, per the plan's explicit instruction). But Sequelize's `isEmail: true` model validator is backed by the `validator` npm package, which enforces RFC 5321's practical 254-character *total* email length limit independent of column width. A 255-character, format-valid email passed the pre-try guard, then threw `SequelizeValidationError: Validation isEmail on email failed` inside the guarded try/catch on `models.User.create()`, which the existing catch-all (CR-03) swallows into the identical uniform success message -- reproducing, for exactly-255-char emails, the exact silent-drop bug this whole plan exists to close.
- **Fix:** Changed `MAX_EMAIL_LENGTH` to 254 and the error message to `'Email must be 254 characters or fewer.'`; updated `emailPolicy.test.js`'s boundary pair to 254 (does not throw) / 255 (throws); updated `register.test.js`'s over-cap test to 255 chars and its "accepts at boundary" test to a 254-char email built with a short (10-char) local part and a long domain, so the constructed email is genuinely accepted by both the pre-try guard AND Sequelize's downstream `isEmail` validator (a 254-char email with a long local part alone still fails `validator.isEmail`'s separate 64-character local-part cap).
- **Files modified:** `backend/src/utils/emailPolicy.js`, `backend/src/utils/emailPolicy.test.js`, `backend/src/resolvers/register.test.js`
- **Verification:** Re-ran `emailPolicy.test.js` (11/11 green) and `register.test.js` (32/32 green) after the fix; confirmed empirically via a standalone Node script against the installed `validator` package that 254 chars is accepted and 255 chars is rejected, independent of local-part length (local part itself capped separately at 64 chars by the same validator).
- **Committed in:** `0d86d0e` (standalone fix commit, between Task 1's and Task 2's commits)

---

**Total deviations:** 1 auto-fixed (Rule 1 -- a genuine bug in this plan's own new code, caught by its own integration test before merge, not a pre-existing issue)
**Impact on plan:** The fix was necessary for the plan's own stated goal (no malformed/over-length email is ever silently dropped) to actually hold; without it, exactly-255-character emails would have reopened the silent-drop gap this plan exists to close. No scope creep -- confined to the two files this plan already owns (`emailPolicy.js`, `emailPolicy.test.js`) plus the one integration test file Task 2 already modifies.

## Issues Encountered

None beyond the one auto-fixed off-by-one documented above.

## Critical Plan Gates (from this plan's `must_haves.truths`)

### Gate 1: Malformed/over-length email rejected pre-try, zero rows, actionable error

Confirmed via `register.test.js`'s new `describe` block (5/5 tests green): missing-TLD (`ada@exmaple`) throws `'Enter a valid email address.'`; whitespace-only throws `'Email is required.'`; a 255-char email throws `'Email must be 254 characters or fewer.'`; all three assert `models.User.count()` is unchanged. A well-formed, available 254-char email still succeeds and creates exactly one row.

### Gate 2: Mutation test

Temporarily reverted the resolver's `assertRegistrationEmail(email)` call to the pre-fix 2-line shape (`if (!email) throw ...; normalizedEmail = email.toLowerCase().trim();`) and re-ran `register.test.js`:

```
 ❯ src/resolvers/register.test.js (32 tests | 4 failed)
       × rejects a missing-TLD email and creates no row (32-VERIFICATION.md Truth 8 reproduction)
       × rejects a whitespace-only email with an actionable error, not the uniform success message
       × rejects an email one character over the 254-character cap and creates no row
       × never reads models.User.findOne when the email fails format validation, isolating the pre-lookup guard from the catch-all

 Tests  4 failed | 28 passed (32)
```

Matches the plan's prediction exactly: the same 4 tests turned red (missing-TLD, whitespace-only, over-cap, findOne-isolation); the exact-254-cap boundary test stayed green in both states (a well-formed email was never invalid under either implementation). Restored the fix; re-ran `register.test.js` -- 32/32 passed; `grep -n "MUTATION-TEST-TEMP"` returned no matches (clean restore); `git diff --stat` on `user.resolver.js` showed only the intended 2-insertion/3-deletion net change.

### Gate 3: Enumeration-safety (SEC-01/D-08) unaffected

Explicit code-path check (Task 3): `assertRegistrationEmail(email)` (user.resolver.js line 263) is a pure function of the caller-supplied `email` argument alone -- its signature takes no `models` parameter -- and executes structurally before the `try` block opens (line 275), where `models.User.findOne` (line 277) is later called. Since the guard cannot read a database result that has not yet been queried by the time it throws or returns, none of its three failure messages (`'Email is required.'`, `'Email must be 254 characters or fewer.'`, `'Enter a valid email address.'`) can depend on whether an account already exists at that address. The two named SEC-01/D-08 regression tests -- `'returns the identical success message and creates no second row when the email is already taken...'` and `'returns byte-identical responses when two concurrent registrations race on the same fresh email...'` -- both passed unmodified in every full run of `register.test.js` (32/32 green throughout).

### Gate 4: Regression gates, actual counts recorded

Targeted 5-file gate (`register.test.js`, `verifyEmail.test.js`, `updateUser.test.js`, `resendVerificationEmail.test.js`, `assertRequiredColumns.test.js`):

```
 Test Files  5 passed (5)
      Tests  87 passed | 2 skipped (89)
```

Matches the plan's exact prediction (82 passed / 2 skipped pre-plan baseline + 5 new `register.test.js` tests = 87 passed / 2 skipped).

Full backend suite (`npm test -w backend`):

```
 Test Files  69 passed (69)
      Tests  536 passed | 3 skipped (539)
```

Plan's stated post-32-12 baseline was 520 passed / 3 skipped; expected after this plan was 525 (+5 from `register.test.js`), with any excess attributed to `emailPolicy.test.js`'s own 11 new tests. Actual delta is +16 (536 − 520), which decomposes exactly as 5 (`register.test.js`) + 11 (`emailPolicy.test.js`) = 16 -- matching the plan's own explicit accounting instruction with no unexplained discrepancy. Zero failures across all 69 files.

## Known Stubs

None. This plan is backend-only validation hardening of an existing mutation; no new UI surface, no placeholder data paths.

## Threat Flags

None. `assertRegistrationEmail` adds no new endpoint, auth path, or schema change -- it is a pre-existing-boundary validation guard on an already-anonymous, already-covered mutation argument, matching this plan's own `<threat_model>` (T-32-13-01 mitigate, T-32-13-02 accept, both confirmed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 32-VERIFICATION.md's Gap 3 (Truth 8) is closed: the tokenless register branch validates `email` format/length before the guarded try/catch, matching the treatment `name` and `relationshipNote` already had.
- The full backend suite is green (536/536 passing, 3 skipped for documented reasons, 0 failures) after this plan's changes.
- No new open items were introduced by this plan; the one deviation (MAX_EMAIL_LENGTH off-by-one) was caught and fixed within this same plan's execution, before merge.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-09-03*

## Self-Check: PASSED

- FOUND: backend/src/utils/emailPolicy.js
- FOUND: backend/src/utils/emailPolicy.test.js
- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/resolvers/register.test.js
- FOUND: .planning/phases/32-tokenless-registration/32-13-SUMMARY.md
- FOUND: c944437 (Task 1 commit)
- FOUND: 0d86d0e (deviation fix commit)
- FOUND: 56cf994 (Task 2 commit)
