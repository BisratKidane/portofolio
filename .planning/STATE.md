---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Security Remediation
status: executing
stopped_at: 11-07 Tasks 1-2 complete (Register confirmation panel, VerifyEmail page/route); paused at Task 3 human-action checkpoint (apply Plan 11-03 migration + manual flow verification)
last_updated: "2026-07-21T11:00:00.000Z"
last_activity: 2026-07-21 -- Phase 11 planning complete
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 19
  completed_plans: 18
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-12)

**Core value:** Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.
**Current focus:** Phase 11 — email-verification-admin-race-fix

## Current Position

Phase: 11 (email-verification-admin-race-fix) — EXECUTING
Plan: 11-08 complete (VERIFY-04 gap closed)
Status: 11-08 done; 11-07 Task 3 human checkpoint (migration boot-and-verify) still pending for phase close
Last activity: 2026-07-21 -- 11-08 verifyEmail race fix executed (atomic transaction + FOR UPDATE + deadlock retry)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 24 (all v1.0)
- Average duration: - min
- Total execution time: 0 hours (v1.1)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2 | - | - |
| 02 | 2 | - | - |
| 03 | 3 | - | - |
| 04 | 1 | - | - |
| 05 | 3 | - | - |
| 06 | 2 | - | - |
| 07 | 2 | - | - |
| 08 | 3 | - | - |
| 09 | 3 | - | - |
| 10 | 3 | - | - |
| 11 | TBD | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 09 P02 | 20min | 1 tasks | 3 files |
| Phase 09 P01 | 3min | 3 tasks | 4 files |
| Phase 09 P03 | 49min | 2 tasks | 3 files |
| Phase 10 P01 | 2min | 2 tasks | 3 files |
| Phase 10 P02 | 2min | 2 tasks | 5 files |
| Phase 10 P03 | 2min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.1: Remediate all 7 documented security issues, not just the flagship reset-token bug — v1.0's suite makes wholesale auth changes safe
- v1.1: Reset token delivered via a pluggable mailer (console-logs in dev, wired for a provider in prod); same mailer backs email verification
- v1.1: Each fix is TDD'd test-first; v1.0 tests documenting bugs are flipped to assert fixed behavior; CI must stay green throughout
- Roadmap: Phases 7–11 sequenced dependency-first per research — (7) CORS + JWT fail-fast + password strength share one low-risk foundation phase; (8) mailer built once, consumed by reset-token fix; (9) passwordChangedAt sequenced right after Phase 8 since it touches the same resetPassword resolver; (10) rate limiting built after auth resolvers reach final v1.1 shape; (11) email verification last — largest blast radius, changes register's contract
- Roadmap: Phases 9 and 11 each carry an explicit manual boot-and-verify acceptance criterion (non-force-synced dev DB) because sequelize.sync() won't alter existing tables and CI/test DB force-recreation can't catch missing columns
- Roadmap: Phase 7 must stand up an HTTP-level (supertest) test harness — the existing in-process executeOperation() helper can't reach CORS/Express-layer code
- [Phase 09]: RESET-06: password-reset tokens hashed at rest (sha256) — requestPasswordReset stores hashResetToken(resetToken) while still emailing the raw token; resetPassword looks up by hashResetToken(token), closing 08-REVIEW.md WR-08
- [Phase 09]: Plan 1: passwordChangedAt uses DATE(3)/DATETIME(3) millisecond precision to avoid MySQL rounding fractional-second writes up into the next whole second
- [Phase 09]: Plan 1: passwordChangedAt is nullable with no default and no backfill so no pre-existing session is force-evicted at deploy time
- [Phase 09]: Plan 1: SC-4 manually verified by a human against a real pre-existing dev database (migration applied cleanly, zero Unknown column errors, pre-migration token still valid, reset+relogin succeeded)
- [Phase 09]: Phase 09 Plan 03: getUserFromRequest rejects JWTs whose iat predates passwordChangedAt's floored second; same-second boundary and NULL-never-revokes proven by direct unit test, full wiring proven end-to-end via httpClient() — Closes the phase's core threat (T-09-07): a stolen/leaked JWT must stop being honored after a legitimate password reset
- [Phase 10]: Phase 10 Plan 01: fixed-window algorithm chosen for rateLimitStore (not sliding-window) — simplest option satisfying per-key isolation + correct expiry, left to Claude's Discretion in the plan
- [Phase 10]: [Phase 10]: Plan 02: rate-limit field identification uses the parsed GraphQL operation AST (operation.selectionSet.selections), never the client-supplied operationName string — Closes an operation-renaming/anonymizing bypass vector; verified by a 0-match grep on 'operationName' in rateLimitPlugin.js
- [Phase 10]: Plan 02: server.js sets trust proxy = 1 unconditionally and derives clientIp: req.ip onto contextValue; the rate-limit plugin never reads req directly — Matches the file's flat, always-on middleware style; keeps the plugin HTTP-free/testable; documented in README as a hard single-reverse-proxy deployment constraint (D-04)
- [Phase 10]: Plan 03: rate-limit test-harness bypass-resistance and enumeration-parity proofs (RATE-01..05) all driven via executeOperation(), zero HTTP boot — Closes T-10-03a (enumeration oracle) and T-10-03b (operation-rename bypass) with dedicated tests
- [Phase 11]: Plan 07 Task 1: Register.jsx removes useNavigate entirely and renders a check-your-email confirmation Alert instead of navigating (D-15) — closes the client-side half of the ADMIN-race elevation-of-privilege threat (T-11-07a)
- [Phase 11]: Plan 07 Task 2: /verify-email is registered as a ProtectedRoute sibling (not nested inside it), reads ?token= via useSearchParams, and auto-calls verifyEmail(token) on mount — establishes the session and redirects to /dashboard on success, shows a recoverable error + Return to sign in link on failure or missing token (D-14)
- [Phase 11]: Plan 08 (VERIFY-04 gap closure, CR-01 Option B): verifyEmail now wraps token-consumption + admin-count check + ADMIN promotion in ONE sequelize.transaction; the admin-count read is a locking `SELECT COUNT(*) ... FOR UPDATE` so concurrent verifiers serialize on the single ADMIN slot structurally instead of relying on autocommit statement timing — replacing the prior two-statement UPDATE...JOIN that empirically deadlocked 28/30 under real MySQL 8.4 concurrency (11-VERIFICATION.md)
- [Phase 11]: Plan 08: added retry-once-on-`ER_LOCK_DEADLOCK` around the transaction — a losing racer rolls back cleanly (single-use token NOT consumed) and re-runs once, so it still receives a valid AuthPayload instead of a burned token + raw SQL error; second deadlock or any non-deadlock error propagates unchanged
- [Phase 11]: Plan 08: the ADMIN-race concurrency test was rewritten (WR-03) from a bare Promise.all (which passes regardless of fix status) into a deterministic two-connection harness — a raw mysql2 connection holds an exclusive lock on a shared non-admin anchor row to pin two real verifiers at their admin-count read, then releases so both promotions fire simultaneously; proven to FAIL against the pre-fix resolver (one racer hits ER_LOCK_DEADLOCK) and pass 5/5 against the fix
- [Phase 11]: Plan 08: the plan's flake-check verify command used `npx vitest run --reporter=basic`, which is not a valid reporter in Vitest 4 (ERR_LOAD_URL); ran the 5x check with the default reporter instead — the reporter flag is a tooling incompatibility, not a test result

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 7's JWT fail-fast check must be gated exclusively on `NODE_ENV === 'production'` — an ungated check would crash the entire test/CI suite (env/test.env uses a deliberately weak shared secret).
- Phase 9/11 column additions are invisible-safe in CI (globalSetup force-recreates tables) but will break any real, already-provisioned dev/prod database via `sequelize.sync()` not altering existing tables — each phase's plan must include the manual boot-and-verify step, not rely on green tests alone.
- Phase 11 (email verification) breaks several v1.0 tests by design (`register.test.js` JWT-usability assertions, `Register.test.jsx` auto-navigate assertion, `createTestUser()` default) — these flips are expected TDD red steps, not regressions.
- Plan 11-07 Task 3 (checkpoint:human-action, gate=blocking) is unresolved: human must apply backend/migrations/manual/011-add-email-verification-columns.sql to their real, pre-existing, non-force-synced local dev database and manually verify the 8-step register -> verify -> dashboard flow before Plan 11-07 / Phase 11 can be marked complete (ROADMAP SC-5).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Quality | Coverage reporting/thresholds (QUAL-01), linter/formatter + CI gate (QUAL-02) | Deferred to v2 | Milestone init |
| Testing | Full browser E2E tests (E2E-01) | Deferred to v2 | Milestone init |
| Rate limiting | Coarse whole-`/graphql` `express-rate-limit` guard (RATE-F1), operation-aware graduated limits | Deferred to v2 | v1.1 requirements |
| Admin bootstrap | Env-seeded initial admin `ADMIN_EMAIL` as belt-and-suspenders (VERIFY-F1) | Deferred to v2 | v1.1 requirements |
| UX | Frontend-specific 429 message, password-strength meter (UX-F1) | Deferred to v2 | v1.1 requirements |

## Session Continuity

Last session: 2026-07-21
Stopped at: 11-08 complete — verifyEmail VERIFY-04 race fix (atomic transaction + FOR UPDATE + deadlock retry) executed, full backend suite 121/121 green, concurrency test stable 5/5. Phase close still gated on 11-07 Task 3 human checkpoint (apply migration to pre-existing dev DB + manual 8-step flow verification).
Resume file: .planning/phases/11-email-verification-admin-race-fix/11-07-PLAN.md

## Operator Next Steps

- Review and approve the v1.1 roadmap, then run `/gsd:plan-phase 7` to begin Foundation Hardening.
