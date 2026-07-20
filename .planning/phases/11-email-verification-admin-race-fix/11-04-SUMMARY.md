---
phase: 11-email-verification-admin-race-fix
plan: 04
subsystem: auth
tags: [graphql, apollo, sequelize, vitest, tdd, email-verification]

# Dependency graph
requires:
  - phase: 11-01
    provides: "createVerificationToken/hashVerificationToken/verificationTokenExpiry in backend/src/utils/auth.js, emailVerified/emailVerificationToken/emailVerificationExpiresAt columns on the User model, createTestUser() defaulting to emailVerified:true"
  - phase: 11-02
    provides: "sendVerificationEmail({ to, token }) in backend/src/services/mailer.js, RegisterPayload/verifyEmail/resendVerificationEmail already declared in the GraphQL SDL"
provides:
  - "register creates a genuinely unverified user (emailVerified:false), never signs a JWT, never assigns ADMIN, and returns only { message }"
  - "register persists only the sha256 hash of a fresh single-use verification token (~24h expiry) and emails the raw token via the pluggable mailer, fire-and-forget"
  - "login rejects a correct-password, unverified account with a distinct message, only after password validation succeeds (no enumeration signal via error-ordering)"
  - "register's schema contract change propagated in lockstep to Phase 10's rateLimit.test.js RATE-02 block"
affects: [11-05, 11-06, 11-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "register no longer computes role at all — relies on the User model's defaultValue: 'USER', moving the ADMIN decision entirely out of registration"
    - "fire-and-forget mailer call pattern (requestPasswordReset's .catch(console.error) style) reused verbatim for sendVerificationEmail"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/schemas/user.schema.js
    - backend/src/resolvers/register.test.js
    - backend/src/resolvers/login.test.js
    - backend/src/resolvers/rateLimit.test.js

key-decisions:
  - "register's return type flipped from AuthPayload! to RegisterPayload! (breaking contract change per D-10) — every backend test file querying register was updated in the same plan so the suite never sits in an inconsistent intermediate state"
  - "The isEmail-validator regression test (malformed email) was retained unchanged from the pre-plan suite, since it exercises model-level validation untouched by this plan"

patterns-established:
  - "Breaking GraphQL contract changes must audit and update every test file that queries the changed field in the same plan/commit pair, not just the primary test file"

requirements-completed: [VERIFY-02, VERIFY-05, VERIFY-06]

# Metrics
duration: 12min
completed: 2026-07-20
---

# Phase 11 Plan 04: Unverified Register + Login Verification Gate Summary

**register now creates a genuinely unverified account (no JWT, no ADMIN grant, hashed verification token emailed via mailer) and login rejects unverified accounts only after password validation succeeds**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-20T21:59:00Z
- **Completed:** 2026-07-20T20:11:33Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- Closed the registration-time half of the ADMIN land-grab race (VERIFY-02, VERIFY-04 negative-space proof) — the first-ever registrant now gets `role: 'USER'`, not `'ADMIN'`; the actual race-safe ADMIN assignment is deferred to Plan 11-05's `verifyEmail`
- `register` persists only the sha256 hash of a fresh, single-purpose verification token with a ~24h expiry, and emails the raw token via the mocked/pluggable mailer (VERIFY-06)
- `login` rejects a correct-password, unverified account with `'Please verify your email before signing in.'`, and only after password validation succeeds — proven by a dedicated ordering test (VERIFY-05)
- Phase 10's `rateLimit.test.js` RATE-02 block updated to the new `register` contract in the same plan, keeping the full suite green throughout

## Task Commits

Each task was committed atomically (TDD red/green pairs):

1. **Task 1: register creates an unverified user, emails a hashed token, returns message-only (VERIFY-02, VERIFY-06)**
   - `6154516` - test(11-04): add failing tests for unverified register (VERIFY-02/06)
   - `c6dc1e4` - feat(11-04): register creates an unverified user and returns a message-only payload (VERIFY-02/06)
2. **Task 2: login rejects unverified accounts after password validation (VERIFY-05)**
   - `9d31c66` - test(11-04): add failing test for login unverified-account gate (VERIFY-05)
   - `bd347bc` - feat(11-04): login rejects unverified accounts after password validation (VERIFY-05)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `backend/src/resolvers/user.resolver.js` - register rewritten (no signToken/role assignment, generates+hashes verification token, fire-and-forget mailer call, message-only return); login gains the `emailVerified` gate after password validation
- `backend/src/schemas/user.schema.js` - `register`'s return type changed from `AuthPayload!` to `RegisterPayload!`
- `backend/src/resolvers/register.test.js` - fully rewritten: 7 tests covering message-only payload, unverified row shape, hashed-token/raw-token-emailed proof, duplicate-email/weak-password/malformed-email regressions, and the first-registrant-is-USER proof
- `backend/src/resolvers/login.test.js` - 2 new tests added (unverified-account rejection, wrong-password ordering proof); 1 existing regression test untouched
- `backend/src/resolvers/rateLimit.test.js` - local `REGISTER_MUTATION` constant's selection set changed from `{ token user { id name email role } }` to `{ message }`; no assertion changes needed (RATE-02 block only checks `.errors` and a DB row count)

## Decisions Made
None beyond what the plan specified — plan executed as written, including the exact resolver rewrite, token/mailer wiring, and gate placement.

## Deviations from Plan

None - plan executed exactly as written.

One minor note (not a deviation, just a clarification of expected test output): the plan's Step 2 RED-gate instruction described running `rateLimit.test.js` at that point as "a sanity check, not expected to fail." In practice it did fail at that intermediate point (RATE-02's `register` call returns null for the now-non-nullable `message` field because the resolver hadn't been updated yet) — this is inherent to any RED step where the schema changes before the resolver does, and resolved itself immediately in the GREEN step. No action was needed; documented here only for traceability.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 11-05 (verifyEmail resolver, race-safe first-verified-user-becomes-ADMIN) can now build directly on `emailVerificationToken`/`emailVerificationExpiresAt` being populated correctly at registration time.
- Plan 11-06 (frontend AuthContext update) can now build against `register`'s new `{ message }`-only contract — the old `{ token, user }` assumption is fully gone from every backend test file.
- Full backend suite green: 109 tests, 20 files (`npm test --workspace backend`).

---
*Phase: 11-email-verification-admin-race-fix*
*Completed: 2026-07-20*

## Self-Check: PASSED

All modified files verified present; all task/summary commit hashes (6154516, c6dc1e4, 9d31c66, bd347bc, cf4a03b) verified in git log.
