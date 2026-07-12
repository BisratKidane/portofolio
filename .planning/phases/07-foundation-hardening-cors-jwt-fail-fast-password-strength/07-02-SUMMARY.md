---
phase: 07-foundation-hardening-cors-jwt-fail-fast-password-strength
plan: 02
subsystem: auth
tags: [jwt, security, password-policy, tdd, vitest, express, apollo-server]

# Dependency graph
requires:
  - phase: 07 (plan 01, parallel wave 1)
    provides: CORS-rejection hardening in the same foundation phase (no direct code dependency — independent files)
provides:
  - "assertProductionSecrets(): fail-fast boot guard refusing to start with an insecure JWT_SECRET when NODE_ENV=production"
  - "passwordPolicy.assertPasswordStrength(): zero-dependency 8-char minimum password validator"
  - "register and resetPassword resolvers both reject sub-8-character passwords server-side, before hashing/persisting"
affects: [phase-09-password-changed-at, phase-11-email-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function fail-fast assertion (plain argument object, no live-env mutation) mirroring backend/test/guard.js's assertTestDatabase shape"
    - "Single-argument throwing-guard convention (mirrors requireAuth/requireAdmin in utils/auth.js) applied to passwordPolicy.assertPasswordStrength"

key-files:
  created:
    - backend/src/config/assertProductionSecrets.js
    - backend/src/config/assertProductionSecrets.test.js
    - backend/src/utils/passwordPolicy.js
    - backend/src/utils/passwordPolicy.test.js
  modified:
    - backend/src/config/env.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/register.test.js
    - backend/src/resolvers/resetPassword.test.js

key-decisions:
  - "assertProductionSecrets gated exclusively on the literal nodeEnv === 'production' allowlist-of-one (never inverted to nodeEnv !== 'development'), per D-05/PITFALLS Pitfall 12, so NODE_ENV=test with the shared weak secret never crashes CI"
  - "passwordPolicy.js has zero imports/dependencies — plain .length check only (D-03), no composition/max-length/blocklist rules (D-04)"
  - "assertPasswordStrength runs before any DB query in register (before the existingUser lookup) and before user.passwordHash is reassigned in resetPassword (after token validity is confirmed, so an invalid-token error still takes precedence), so a rejected weak password leaves no side effects"

patterns-established:
  - "New fail-fast config assertions live in backend/src/config/ as pure, plain-argument functions callable without module-reset gymnastics"
  - "New pure-function validators live in backend/src/utils/ following the requireAuth/requireAdmin throwing-guard shape"

requirements-completed: [SECRET-01, SECRET-02, PWD-01, PWD-02]

# Metrics
duration: 5min
completed: 2026-07-12
---

# Phase 7 Plan 02: JWT Fail-Fast & Password Strength Summary

**assertProductionSecrets() fail-fast boot guard (production-only JWT_SECRET check) plus a zero-dependency 8-char password validator wired into register and resetPassword, both delivered via strict RED-GREEN TDD cycles.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-12T20:52:32Z
- **Completed:** 2026-07-12T20:55:00Z
- **Tasks:** 3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- Backend now refuses to boot when `NODE_ENV=production` and `JWT_SECRET` is unset or the insecure `'change-me'` default, closing the forgeable-JWT/auth-bypass vector (SECRET-01)
- The fail-fast is scoped exclusively to the literal `nodeEnv === 'production'` string — verified by grep to be a single allowlist-of-one match, never an inverted `!== 'development'` check — so `test`/`development` boot normally with the existing shared weak secret (SECRET-02)
- `register` and `resetPassword` both reject passwords under 8 characters server-side, before hashing/persisting, via a single shared `passwordPolicy` validator (PWD-01/PWD-02)
- Full backend suite grew from 39 to 49 tests (5 assertProductionSecrets + 3 passwordPolicy + 2 resolver-wiring), all green; all pre-existing tests byte-identical (diff-verified additions-only)

## Task Commits

Each task was committed atomically via RED → GREEN TDD cycles:

1. **Task 1: TDD assertProductionSecrets fail-fast + wire into env.js**
   - `17b3ef5` test(07-02): add failing tests for assertProductionSecrets fail-fast (RED)
   - `e91cf3f` feat(07-02): fail-fast on insecure JWT_SECRET in production (SECRET-01/02) (GREEN)
2. **Task 2: TDD passwordPolicy pure validator (8-char minimum, D-01/D-03/D-04)**
   - `84c4c09` test(07-02): add failing tests for passwordPolicy validator (RED)
   - `e8effbd` feat(07-02): add zero-dependency 8-char minimum password validator (D-01/D-03/D-04) (GREEN)
3. **Task 3: Wire passwordPolicy into register and resetPassword resolvers**
   - `79b73d4` test(07-02): add failing tests for password-length enforcement in register/resetPassword (RED)
   - `e4f90ed` feat(07-02): enforce 8-char minimum password in register and resetPassword (PWD-01/02) (GREEN)

**Plan metadata:** committed separately (this SUMMARY.md, per worktree parallel-executor convention — STATE.md/ROADMAP.md are updated centrally by the orchestrator after merge)

## Files Created/Modified
- `backend/src/config/assertProductionSecrets.js` - Pure `assertProductionSecrets({ nodeEnv, jwtSecret })` throwing only for `production` + insecure secret
- `backend/src/config/assertProductionSecrets.test.js` - 5 tests covering all four nodeEnv x jwtSecret quadrants
- `backend/src/config/env.js` - Imports and calls `assertProductionSecrets` at the bottom, after `env` is fully constructed
- `backend/src/utils/passwordPolicy.js` - Zero-dependency `assertPasswordStrength(password)` throwing the exact D-01 message below 8 chars
- `backend/src/utils/passwordPolicy.test.js` - 3 tests: under-length rejection, exact-8-char boundary, long/mixed-composition acceptance
- `backend/src/resolvers/user.resolver.js` - Imports `assertPasswordStrength`; calls it first in `register` (before any DB query) and after token-validity checks but before `passwordHash` reassignment in `resetPassword`
- `backend/src/resolvers/register.test.js` - New `it` block asserting weak passwords are rejected before `models.User.create` runs
- `backend/src/resolvers/resetPassword.test.js` - New `RESET_PASSWORD_MUTATION` string and `it` block asserting weak passwords leave the reset token untouched

## Decisions Made
- Placed the `assertPasswordStrength` call in `resetPassword` after the token-validity check (not as the very first statement) so an invalid/expired token still produces its existing, more specific error message rather than being masked by a password-length error — this preserves the pre-existing `resetPassword` error-precedence contract while still guaranteeing the check runs before `user.passwordHash`/`resetPasswordToken` are mutated (matches the plan's `<behavior>` Test B requirement exactly: token unchanged after rejection).
- No new npm dependencies for either fix — both are pure-function extractions per RESEARCH.md's extract-pure-functions pattern.

## Deviations from Plan

None - plan executed exactly as written. All three tasks followed RED → GREEN TDD cycles with commits matching the plan's acceptance criteria (allowlist-of-one grep, zero-import grep, exact-string `.toBe()`/`.toThrow()` assertions, additive-only diffs to existing test files).

## Issues Encountered

A transient test-suite failure (`portofolio_test.users doesn't exist`) was observed on the very first baseline run, caused by a concurrent parallel worktree agent racing `globalSetup`'s `sequelize.sync({ force: true })`/`drop()` against the shared MySQL test database. Immediate re-run confirmed all 39 pre-existing tests green — this was pre-existing test-infrastructure behavior unrelated to this plan's changes (out of scope per the deviation-rules scope boundary), not a regression introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `assertProductionSecrets` and `passwordPolicy` are both pure, dependency-free modules ready to be reused/extended by later phases (e.g. Phase 9's `passwordChangedAt` work touches the same `resetPassword` resolver and can build directly on this task's insertion point).
- Full backend suite (49 tests) is green; no blockers for the next parallel-wave plan in Phase 7.

---
*Phase: 07-foundation-hardening-cors-jwt-fail-fast-password-strength*
*Completed: 2026-07-12*
