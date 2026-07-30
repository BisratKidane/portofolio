---
phase: 09-session-revocation-via-passwordchangedat
plan: 03
subsystem: auth
tags: [jwt, jsonwebtoken, sequelize, mysql, vitest, session-revocation]

# Dependency graph
requires:
  - phase: 09-session-revocation-via-passwordchangedat (plan 01)
    provides: "passwordChangedAt DATETIME(3) column on User model, stamped by the beforeUpdate hook"
  - phase: 09-session-revocation-via-passwordchangedat (plan 02)
    provides: "hashResetToken() and hash-at-rest reset tokens (RESET-06), reused unmodified by this plan's resolvers"
provides:
  - "Seconds-floor, null-safe passwordChangedAt revocation check inside getUserFromRequest (SESS-03)"
  - "Mandatory direct unit test proving the same-second boundary (ROADMAP SC-3 pin), independent of the graphql() test helper"
  - "Supplementary HTTP-level end-to-end test proving the real resolver -> hook -> DB -> Apollo context() wiring in both directions"
affects: [10-rate-limiting, 11-email-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getUserFromRequest loads the user first, then applies a strict `<` comparison of payload.iat against Math.floor(user.passwordChangedAt.getTime()/1000), guarded by a truthy passwordChangedAt check — every branch still degrades to null, never throws"
    - "Direct unit testing of getUserFromRequest with mocked req/models, using an explicit iat override in jwt.sign() to pin the same-second boundary deterministically without fake timers"
    - "vi.setSystemTime (without vi.useFakeTimers) to control only Date for HTTP-level revocation tests, keeping setTimeout/DB I/O real so CR-01's 250ms anti-enumeration floor still elapses in real time"

key-files:
  created:
    - backend/src/resolvers/sessionRevocation.test.js
  modified:
    - backend/src/utils/auth.js
    - backend/src/utils/auth.test.js

key-decisions:
  - "Fixed the plan's literal 2026-01-01 iat/passwordChangedAt values to use a 10-year jwt expiresIn in the unit tests, and to keep the faked system clock active through the `me` assertions in the HTTP-level test — both to prevent JWT `exp` expiry (computed against the real wall clock, now 2026-07-20) from masking the revocation check under test"

requirements-completed: [SESS-03]

# Metrics
duration: 49min
completed: 2026-07-20
---

# Phase 09 Plan 03: JWT Session Revocation Enforcement Summary

**Seconds-floor, null-safe passwordChangedAt revocation check added to getUserFromRequest, proven by a mandatory same-second-boundary unit test and a supplementary HTTP-level test against the real resolver/DB/Apollo-context stack.**

## Performance

- **Duration:** 49 min
- **Started:** 2026-07-20T15:13:32+02:00
- **Completed:** 2026-07-20T16:02:05+02:00
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `getUserFromRequest` now rejects any JWT whose `iat` (whole seconds) is strictly before `passwordChangedAt`'s floored second, closing the "stolen token survives a password reset" gap this phase exists to fix (T-09-07)
- The mandatory same-second boundary is pinned by a deterministic unit test (`jwt.sign` with an explicit `iat` override, no fake timers) — proving D-01/D-02's precision direction is correct
- `passwordChangedAt === NULL` never revokes (D-05, no backfill), preserved for every pre-existing test in `auth.test.js`
- A supplementary HTTP-level test proves the full `resolver -> beforeUpdate hook -> DATETIME(3) column -> real Apollo context() -> getUserFromRequest` wiring in both directions against a real test-DB row, not mocks

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests for passwordChangedAt revocation** - `135b58f` (test)
2. **Task 1 (GREEN): Reject JWTs issued before passwordChangedAt (SESS-03)** - `ceabfb8` (feat)
3. **Task 2: Add HTTP-level end-to-end proof of session revocation wiring** - `675abc5` (test)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified
- `backend/src/utils/auth.js` - `getUserFromRequest` loads the user via `findByPk`, then applies the seconds-floor `passwordChangedAt` vs. `payload.iat` comparison before returning; still degrades every failure path to `null`
- `backend/src/utils/auth.test.js` - New `describe('getUserFromRequest — passwordChangedAt revocation (SESS-03)', ...)` block with the mandatory 3-test pin (same-second accept, prior-second reject, NULL-never-revokes)
- `backend/src/resolvers/sessionRevocation.test.js` - New file; one end-to-end test driving login -> requestPasswordReset -> resetPassword -> re-login -> two `me` queries through `httpClient()`, asserting the pre-reset token is revoked and the same-second post-reset token is honored

## Decisions Made
- Test dates in the plan's code examples were fixed literals (`2026-01-01T...`). Since the real system clock is now 2026-07-20, JWTs signed with a 1-day `expiresIn` and a Jan-1 `iat` would appear expired to `jwt.verify` once real time is restored — this would mask the revocation check with an unrelated expiry failure (in the unit test, it made Test 2 pass "by accident" pre-implementation, tripping the RED-gate sanity check on the first run). Fixed by (a) using a 10-year `expiresIn` in the two `auth.test.js` iat-override tests, and (b) keeping `vi.setSystemTime` active through both `me` assertions in the HTTP-level test rather than calling `vi.useRealTimers()` beforehand, so `exp` checks stay within the token's real validity window relative to the faked clock.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed literal test dates that would produce falsely-expired JWTs against the real wall clock**
- **Found during:** Task 1 RED gate — the mandatory sanity check ("if Test 2 passes before implementation, STOP and investigate") tripped on the first run, but the actual cause was JWT expiry (real "now" is 2026-07-20, months after the test's hardcoded `2026-01-01` `iat` + `1d` expiresIn), not a broken test. Re-running with the fix in place confirmed the correct RED failure (revocation logic missing) and the correct GREEN pass.
- **Issue:** `jwt.sign({ ..., iat: <fixed 2026-01-01 timestamp> }, secret, { expiresIn: '1d' })` produces a token whose `exp` is in the past relative to the real system clock, so `jwt.verify` throws "jwt expired" regardless of whether the revocation check exists — silently invalidating the test's ability to prove anything.
- **Fix:** Changed `expiresIn` to `'3650d'` (10 years) in both iat-override unit tests in `auth.test.js`. In `sessionRevocation.test.js`, kept `vi.setSystemTime` active (rather than switching to `vi.useRealTimers()`) through both `me` query assertions, so the tokens' real 1-day expiry window is evaluated against the same faked clock they were issued under.
- **Files modified:** `backend/src/utils/auth.test.js`, `backend/src/resolvers/sessionRevocation.test.js`
- **Verification:** RED gate re-run confirmed Test 2 failed for the correct reason (returned the stubbed user instead of `null`) before the `auth.js` fix; GREEN gate and full backend suite (74/74) passed after.
- **Committed in:** `135b58f` (Task 1 RED commit), `675abc5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, test-only, no production code affected beyond the planned change)
**Impact on plan:** Necessary to make the mandatory RED-gate sanity check and the HTTP-level test valid given the real system date; no scope creep — the revocation logic in `auth.js` matches the plan's specified shape exactly (confirmed via the plan's own grep-based acceptance criteria, all passing).

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SESS-03 (the core threat this phase exists to close) is now enforced and proven at both the unit and HTTP-integration level; full backend suite green (74/74)
- Phase 09 (session-revocation-via-passwordchangedat) is now complete across all 3 plans (09-01 column, 09-02 reset-token hashing, 09-03 revocation enforcement)
- No blockers for Phase 10 (rate limiting) or Phase 11 (email verification)

---
*Phase: 09-session-revocation-via-passwordchangedat*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commits (`135b58f`, `ceabfb8`, `675abc5`) confirmed present in `git log`.
