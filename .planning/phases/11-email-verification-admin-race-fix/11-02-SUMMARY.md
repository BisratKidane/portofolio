---
phase: 11-email-verification-admin-race-fix
plan: 02
subsystem: api
tags: [graphql, apollo, mailer, rate-limiting, sdl]

# Dependency graph
requires:
  - phase: 08-mailer-abstraction-reset-token-remediation
    provides: sendMail()/sendPasswordResetEmail() mailer pattern with jsonTransport dev/test driver
  - phase: 10-rate-limiting-on-auth-mutations
    provides: RATE_LIMITS single-edit-point map + rate-limit plugin keyed on GraphQL operation field name
provides:
  - sendVerificationEmail({ to, token }) mailer wrapper (D-09)
  - RegisterPayload GraphQL type (message-only, D-10)
  - verifyEmail(token: String!): AuthPayload! mutation field (SDL only, D-11)
  - resendVerificationEmail(email: String!): PasswordResetPayload! mutation field (SDL only, D-12)
  - RATE_LIMITS.resendVerificationEmail entry (5/hour, D-13)
affects: [11-04, 11-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface-first sequencing: SDL/mailer/rate-limit contracts land before resolver logic, so unresolved schema fields default to undefined and break nothing currently under test"

key-files:
  created: []
  modified:
    - backend/src/services/mailer.js
    - backend/src/schemas/user.schema.js
    - backend/src/config/rateLimits.js

key-decisions:
  - "RegisterPayload kept as a distinct type from PasswordResetPayload (structurally identical) for domain clarity, per D-10 discretion"
  - "register's existing (...): AuthPayload! return type deliberately left untouched this plan — changes atomically with the resolver rewrite in Plan 11-04"
  - "resendVerificationEmail rate-limited at 5/hour, matching register/requestPasswordReset shape (D-13)"

patterns-established:
  - "Additive-schema-first sequencing for multi-plan phases: declare mutation fields in SDL before any resolver exists, relying on GraphQL's default-undefined-resolver behavior to keep the full test suite green mid-phase"

requirements-completed: [VERIFY-02, VERIFY-03, VERIFY-07]

# Metrics
duration: 10min
completed: 2026-07-20
---

# Phase 11 Plan 02: Additive Contracts for Email Verification Summary

**Added `sendVerificationEmail` mailer wrapper, `RegisterPayload`/`verifyEmail`/`resendVerificationEmail` GraphQL SDL fields, and a `resendVerificationEmail` rate-limit budget — all additive, zero resolver logic, full backend suite green.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-20T21:41:00Z (local)
- **Completed:** 2026-07-20T21:50:00Z (local)
- **Tasks:** 3 completed
- **Files modified:** 3

## Accomplishments
- `sendVerificationEmail({ to, token })` added to `backend/src/services/mailer.js`, copy-shaped identically to `sendPasswordResetEmail` — link to `/verify-email?token=`, 24h expiry copy, reuses `sendMail()`/`jsonTransport` with zero changes to the transporter setup.
- `RegisterPayload { message: String! }`, `verifyEmail(token: String!): AuthPayload!`, and `resendVerificationEmail(email: String!): PasswordResetPayload!` declared in `backend/src/schemas/user.schema.js`. `register`'s existing `(...): AuthPayload!` return type was deliberately left unchanged, deferring that atomic swap to Plan 11-04.
- `RATE_LIMITS.resendVerificationEmail = { max: 5, windowMs: 60 * 60 * 1000 }` added to `backend/src/config/rateLimits.js`; stale "Phase 11 will add..." anticipatory comment removed and replaced with a note that it was added in Phase 11 (VERIFY-07).
- Full backend suite (20 test files, 97 tests) verified green after all three tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: sendVerificationEmail mailer wrapper (D-09)** - `dbc4fd7` (feat)
2. **Task 2: GraphQL schema contracts — RegisterPayload, verifyEmail, resendVerificationEmail** - `3a38d5b` (feat)
3. **Task 3: resendVerificationEmail rate-limit entry (D-13)** - `59de818` (feat)

_No TDD tasks in this plan — all changes are additive interface declarations with existing acceptance-criteria greps as verification, not new test files._

## Files Created/Modified
- `backend/src/services/mailer.js` - Added `sendVerificationEmail({ to, token })` sibling to `sendPasswordResetEmail`
- `backend/src/schemas/user.schema.js` - Added `RegisterPayload` type, `verifyEmail`, `resendVerificationEmail` mutation fields
- `backend/src/config/rateLimits.js` - Added `resendVerificationEmail` rate-limit entry, removed stale anticipatory comment

## Decisions Made
- `RegisterPayload` written as a distinct multi-line SDL block matching the existing `PasswordResetPayload` formatting convention already used in the file, rather than a single-line inline declaration. The plan's acceptance-criteria grep (`"type RegisterPayload { message: String! }"`) assumed single-line formatting; this doesn't match how the analogous `PasswordResetPayload` type is already written in the file (also multi-line). Verified equivalence with a schema-build check (`makeExecutableSchema` succeeds, confirming valid SDL and no field collisions) instead of the literal single-line grep. No content difference from the plan's intent — purely a formatting-convention choice consistent with the existing file style.
- No changes to `register`'s resolver or return type in this plan, per explicit plan instruction (deferred to Plan 11-04).

## Deviations from Plan

### Auto-fixed Issues

None that required code changes. One verification-methodology adjustment (documented above under Decisions Made): the literal single-line grep in the plan's acceptance criteria for `RegisterPayload` didn't match the multi-line SDL formatting consistent with the existing `PasswordResetPayload` type in the same file. Verified via `makeExecutableSchema` build success instead; content is correct and matches D-10's intent exactly.

**Total deviations:** 0 code auto-fixes.
**Impact on plan:** None — plan executed as specified; only a verification-command adjustment for an acceptance-criteria formatting assumption that didn't match the file's existing multi-line SDL convention.

## Issues Encountered

- **Shared MySQL test-database race across concurrent worktree agents:** `npm test --workspace backend` intermittently failed with `Table 'portofolio_test.users' doesn't exist` and destroy/update races in `resetPassword.test.js` / `sessionRevocation.test.js` on the first two full-suite runs. Root-caused via `ps aux`: a concurrent vitest process from a sibling worktree agent (running from the main repo path) was executing against the same shared `portofolio_test` database at the same time — `globalSetup.js`'s `sync({ force: true })` and teardown `drop()` collided across the two concurrently-running agents, since `env/test.env`'s `DB_NAME` is not worktree-scoped. Confirmed this was unrelated to this plan's changes via (1) a standalone `makeExecutableSchema` build check that succeeded immediately, (2) the targeted `mailer.test.js` run passing cleanly on the first try, and (3) two subsequent full-suite retries both passing 20/20 files, 97/97 tests once the other agent's run cleared. Logged to `deferred-items.md` per the Scope Boundary rule (out-of-scope infra issue, not this task's bug) with a recommendation to give each parallel worktree agent's test run a unique `DB_NAME`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `sendVerificationEmail`, `RegisterPayload`, `verifyEmail`, `resendVerificationEmail`, and `RATE_LIMITS.resendVerificationEmail` are all in place as stable, non-breaking contracts.
- Plans 11-04 and 11-05 can implement resolver logic directly against these exact interfaces with zero further schema/mailer/rate-limit exploration or drift risk.
- Concern carried forward: parallel worktree-agent test runs sharing one MySQL container/database name can cause transient full-suite failures unrelated to any single plan's changes — see `deferred-items.md`.

---
*Phase: 11-email-verification-admin-race-fix*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: sendVerificationEmail in backend/src/services/mailer.js
- FOUND: RegisterPayload in backend/src/schemas/user.schema.js
- FOUND: resendVerificationEmail in backend/src/config/rateLimits.js
- FOUND commit: dbc4fd7 (Task 1)
- FOUND commit: 3a38d5b (Task 2)
- FOUND commit: 59de818 (Task 3)
- FOUND commit: f36b309 (Summary)
