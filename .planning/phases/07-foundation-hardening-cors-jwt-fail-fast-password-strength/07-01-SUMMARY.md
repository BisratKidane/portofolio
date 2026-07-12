---
phase: 07-foundation-hardening-cors-jwt-fail-fast-password-strength
plan: 01
subsystem: api
tags: [express, cors, supertest, vitest, security]

# Dependency graph
requires:
  - phase: 06-root-orchestration-ci-pipeline
    provides: single root `npm test` + GitHub Actions CI enforcing the full workspace suite
provides:
  - Importable Express `app` export from backend/src/server.js, decoupled from app.listen()
  - HTTP-level test harness (httpClient() via supertest) additive to the existing graphql()/resetTables()/createTestUser() helpers
  - Pure, unit-tested CORS origin validator (corsOriginValidator/buildCorsOptions) in backend/src/config/corsOptions.js
  - CORS-01 fix: rejected origins are never echoed to the client (body or headers), only logged server-side via console.warn
affects: [10-rate-limiting]

# Tech tracking
tech-stack:
  added: ["supertest@^7.2.2 (backend devDependency)"]
  patterns:
    - "Importable Express app + supertest for HTTP-level integration tests (app.listen() gated behind env.nodeEnv !== 'test')"
    - "Pure-function extraction for middleware config (corsOriginValidator/buildCorsOptions) — unit-testable without spinning up HTTP"

key-files:
  created:
    - backend/src/config/corsOptions.js
    - backend/src/config/corsOptions.test.js
    - backend/src/server.cors.test.js
  modified:
    - backend/src/server.js
    - backend/test/helpers.js
    - backend/package.json

key-decisions:
  - "D-02 (from 07-CONTEXT.md) governs the exact client-facing CORS rejection message 'Not allowed by CORS.' over ARCHITECTURE.md's illustrative wording"
  - "app.listen() gated on env.nodeEnv !== 'test' rather than removed entirely, preserving dev/prod boot behavior unchanged"

patterns-established:
  - "HTTP-level Vitest suite pattern: `httpClient()` from test/helpers.js wraps supertest(app) for tests that need real Express middleware (CORS, future rate-limiting) that executeOperation() can't reach"

requirements-completed: [CORS-01]

# Metrics
duration: ~15min
completed: 2026-07-12
---

# Phase 7 Plan 1: HTTP Test Harness + CORS Origin-Echo Fix Summary

**Stood up the codebase's first HTTP-level (supertest) test harness and used it to fix CORS-01: a rejected `Origin` header is now logged server-side only, never echoed to the client in the response body or headers.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-12T22:51:18+02:00 (baseline test run)
- **Completed:** 2026-07-12T22:54:22+02:00
- **Tasks:** 3 (Task 1 checkpoint pre-approved, Tasks 2-3 executed)
- **Files modified:** 6 (3 created, 3 modified) + package-lock.json

## Accomplishments
- `supertest@^7.2.2` installed as a backend devDependency (package legitimacy pre-approved per dispatch context)
- `backend/src/server.js` now exports `app` as a named export, with `app.listen()` gated behind `env.nodeEnv !== 'test'` so importing it under Vitest never binds a real port
- `backend/test/helpers.js` gained an additive `httpClient()` export wrapping `supertest(app)`, leaving `graphql()`/`resetTables()`/`createTestUser()` untouched
- CORS-01 fixed via TDD: `corsOriginValidator`/`buildCorsOptions` extracted to `backend/src/config/corsOptions.js` as pure, unit-tested functions; wired into `server.js`'s `cors()` middleware
- Rejected origins are logged server-side (`console.warn`) only; the client always receives the fixed D-02 string `'Not allowed by CORS.'`
- New HTTP-level regression test (`server.cors.test.js`) proves the rejected origin string never appears in the response body or headers, and that an allowlisted origin still succeeds
- Full backend suite grew from 39 to 44 tests, all green; zero regressions

## Task Commits

Each task was committed atomically (Task 3 is TDD, split into RED/GREEN commits per the TDD gate protocol):

1. **Task 1: Verify supertest package legitimacy** — no commit (checkpoint, pre-approved before dispatch per orchestrator instructions; see `<checkpoint_preapproved>` evidence below)
2. **Task 2: HTTP test harness — importable app export + httpClient()** - `6a0f644` (feat)
3. **Task 3a: RED — failing corsOriginValidator test** - `13f6221` (test)
4. **Task 3b: GREEN — corsOptions.js + server.js wiring + server.cors.test.js** - `c1e1b0e` (feat)
5. **Out-of-scope discovery logged** - `6983baf` (docs)

_Note: no separate "plan metadata" commit — orchestrator owns STATE.md/ROADMAP.md updates centrally after all wave agents merge (worktree mode)._

## TDD Gate Compliance

Task 3 (`tdd="true"`) followed the mandatory RED → GREEN sequence:
- RED gate: `13f6221` — `corsOptions.test.js` written and confirmed failing (module `./corsOptions.js` did not exist) before any implementation.
- GREEN gate: `c1e1b0e` — `corsOptions.js` implemented, test confirmed passing, then wired into `server.js` and covered by an HTTP-level regression test.
- No REFACTOR commit was needed — the initial implementation was minimal and required no cleanup pass.

## Files Created/Modified
- `backend/src/config/corsOptions.js` - Pure `corsOriginValidator(origin, callback, { clientOrigins })` and `buildCorsOptions(env)`; rejects with the fixed D-02 message, logs the real origin via `console.warn` server-side only
- `backend/src/config/corsOptions.test.js` - 3 unit tests: no-origin allowed, allowlisted-origin allowed, rejected-origin gets fixed message with zero leakage of the real origin
- `backend/src/server.js` - Added `export { app }`; replaced inline `cors({...})` block with `cors(buildCorsOptions(env))`; gated `app.listen()` behind `env.nodeEnv !== 'test'`
- `backend/src/server.cors.test.js` - HTTP-level (via `httpClient()`) test proving a rejected `Origin` header never appears in the response body/headers, and an allowlisted origin still gets `access-control-allow-origin` set and a 200 response
- `backend/test/helpers.js` - Added `httpClient()` export (imports `request` from `supertest` and `app` from `../src/server.js`), additive only
- `backend/package.json` - Added `supertest@^7.2.2` devDependency

## Decisions Made
- Followed D-02 from `07-CONTEXT.md` for the exact client-facing message (`'Not allowed by CORS.'`), which takes precedence over `ARCHITECTURE.md`'s slightly different illustrative wording, per the plan's explicit instruction.
- Placed `export { app }` immediately after `const app = express();` for readability (plan allowed executor discretion on placement).

## Deviations from Plan

None — plan executed exactly as written. Task 1's checkpoint was pre-approved per the orchestrator's dispatch context (`<checkpoint_preapproved>`), with evidence already reviewed: supertest@7.2.2 matches STACK.md's `^7.2.2` recommendation, MIT license, `niftylettuce` maintainer (ladjs/visionmedia lineage), no `peerDependencies` conflicting with Express 4.21, no known critical advisories.

## Issues Encountered

None during this plan's own scope. One out-of-scope discovery was made and logged (not fixed, per the executor's scope-boundary rule):

- **Pre-existing frontend test failures** — `npm test` at the repo root surfaces 10 failing tests across 4 frontend files (`Login.test.jsx`, `Register.test.jsx`, and 2 others) with `Error: Invalid Chai property: toHaveTextContent`, indicating jest-dom matchers aren't registered with Vitest's `expect` in the frontend setup. Confirmed unrelated: this plan touched zero frontend files (`git diff --name-only` against the plan's base commit shows only `backend/**` and `package-lock.json`). Logged in `.planning/phases/07-foundation-hardening-cors-jwt-fail-fast-password-strength/deferred-items.md` for separate follow-up.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The `httpClient()` / importable-`app` harness established here is explicitly reused by Phase 10's coarse rate-limiting layer (per `07-CONTEXT.md`/`STATE.md` decisions) — no further harness work needed there.
- Backend suite is green at 44/44 tests; CORS-01 requirement is fully satisfied.
- **Blocker/concern carried forward (not this plan's scope):** the pre-existing frontend jest-dom matcher failures (see Issues Encountered) should be triaged before or during a phase that touches frontend test files, so they don't get conflated with new regressions.

---
*Phase: 07-foundation-hardening-cors-jwt-fail-fast-password-strength*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created/modified files verified present on disk; all 4 task commit hashes (`6a0f644`, `13f6221`, `c1e1b0e`, `6983baf`) verified present in git log.
