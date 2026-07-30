---
phase: 10-rate-limiting-on-auth-mutations
plan: 03
subsystem: testing
tags: [rate-limiting, apollo-plugin, vitest, executeOperation, backend, enumeration-oracle]

# Dependency graph
requires:
  - phase: 10-02
    provides: "rateLimitPlugin (AST-based field extraction) + server.js production wiring (trust proxy, clientIp on contextValue)"
provides:
  - "test/helpers.js's in-process executeOperation() harness now exercises the SAME rateLimitPlugin instance production traffic does, with an injectable clientIp per graphql() call"
  - "global per-test rate-limit reset (test/setupRateLimit.js via vitest.config.js setupFiles), independent of any one file's own beforeEach"
  - "rateLimit.test.js — the mandatory RATE-01..05 + operation-rename bypass-resistance proof suite, all driven via graphql()/executeOperation(), zero HTTP boot"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vitest setupFiles module for cross-file, per-test global state reset (test/setupRateLimit.js) — belt-and-suspenders isolation independent of individual test files' own beforeEach hooks"
    - "graphql() test helper accepts an explicit, scenario-unique clientIp per call so rate-limit-sensitive tests never share a budget with each other or with unrelated tests"

key-files:
  created:
    - backend/test/setupRateLimit.js
    - backend/src/resolvers/rateLimit.test.js
  modified:
    - backend/test/helpers.js
    - backend/vitest.config.js
    - backend/src/resolvers/resetPassword.test.js

key-decisions:
  - "test/helpers.js's ApolloServer is constructed with plugins: [rateLimitPlugin] — the identical plugin module server.js uses — so executeOperation() tests actually exercise the limiter instead of a plugin-less shadow instance"
  - "Rate-limit store reset happens twice, deliberately redundant: globally via vitest.config.js setupFiles (belt-and-suspenders, file-order-independent) and explicitly in rateLimit.test.js's own beforeEach (self-documenting, matches sessionRevocation.test.js's explicit multi-statement beforeEach convention)"
  - "resetPassword.test.js's one pre-existing collision (10 sequential requestPasswordReset calls in one it block, vs. the resolver's 5/hour limit) fixed by fixture isolation only — 10 distinct clientIps — with zero assertion changes"

patterns-established:
  - "Every rate-limit-sensitive test call passes an explicit, scenario-unique clientIp as graphql()'s 4th argument rather than relying on the shared '127.0.0.1' default"

requirements-completed: [RATE-01, RATE-02, RATE-03, RATE-04, RATE-05]

# Metrics
duration: 2min
completed: 2026-07-20
---

# Phase 10 Plan 03: Test-Harness Wiring + RATE-01..05 Proof Suite Summary

**rateLimitPlugin wired into test/helpers.js's ApolloServer with an injectable clientIp and a global per-test store reset, proven end-to-end by a dedicated rateLimit.test.js covering all five ROADMAP success criteria plus operation-rename bypass resistance — zero HTTP boot required.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-20T20:09:55+02:00
- **Completed:** 2026-07-20T20:11:24+02:00
- **Tasks:** 2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `test/helpers.js`'s `graphql()` now constructs its `ApolloServer` with `plugins: [rateLimitPlugin]` — the same plugin instance `server.js` registers in production — and accepts an injectable `clientIp` (default `'127.0.0.1'`) as its 4th argument, so every `executeOperation()`-driven test can exercise or avoid the limiter deliberately
- New `test/setupRateLimit.js`, wired via `vitest.config.js`'s new `setupFiles` key, resets the rate-limit store before every single test in every file — a global, order-independent isolation guarantee that doesn't rely on any one file remembering to reset it
- The one pre-existing test proven to collide with the newly-global plugin (`resetPassword.test.js`'s 10-call timing test) is fixed by giving each call a distinct `clientIp` (`10.0.0.0-4`, `10.0.1.0-4`) — zero assertion changes, pure fixture isolation
- New `backend/src/resolvers/rateLimit.test.js` (7 tests) proves, entirely via `graphql()`:
  - RATE-01: `login` rejected on the 6th attempt/15min per IP regardless of credential validity, AND a renamed operation (`NotLogin` invoking the same `login` field) is throttled identically — closing T-10-02b's bypass vector with a full-stack proof
  - RATE-02: `register` rejected on the 6th attempt/hour per IP; DB confirms exactly 5 users were persisted, never 6
  - RATE-03: `requestPasswordReset` rejected on the 6th attempt/hour per IP, same generic message on calls 1-5
  - RATE-04: 20 interleaved `me`/`dashboard` calls sharing an IP with an exhausted `login` budget are never throttled
  - RATE-05: a real account and a nonexistent account both breach on the identical 6th call with the identical `'Too many requests. Please try again later.'` message and `TOO_MANY_REQUESTS` code — no enumeration oracle
  - Window expiry: faked-clock proof that the 15-minute login budget genuinely resets at the full-stack level, not just the Plan 10-01 unit test
- Full backend suite: 95 tests passing (up from 88 pre-plan), 20 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire the plugin into test/helpers.js's ApolloServer + global per-test reset + fix the one pre-existing collision** - `547bcae` (feat)
2. **Task 2: Mandatory RATE-01..05 + bypass-resistance proof suite via executeOperation()** - `0035d76` (test)

**Plan metadata:** (this commit, following SUMMARY.md)

_Note: both tasks were plain `auto` tasks (not TDD), one commit each._

## Files Created/Modified

- `backend/test/helpers.js` - `rateLimitPlugin` registered on the test-harness `ApolloServer`; `graphql()` gains an injectable `clientIp` 4th param; `resetRateLimitStore` re-exported
- `backend/test/setupRateLimit.js` - new Vitest `setupFiles` module, global `beforeEach(() => resetRateLimitStore())`
- `backend/vitest.config.js` - added `setupFiles: ['./test/setupRateLimit.js']` alongside the existing `globalSetup`
- `backend/src/resolvers/resetPassword.test.js` - the 10-call timing test's `sample` helper now takes a `clientIp` param; each of the 10 calls in the loop gets a distinct IP
- `backend/src/resolvers/rateLimit.test.js` - new file, the mandatory RATE-01..05 + bypass-resistance proof suite

## Decisions Made

- Field-AST bypass resistance (T-10-02b) is proven full-stack here, not just at the Plan 10-02 unit level: a mutation declared as `NotLogin` but invoking the `login` field is throttled identically to the real `Login` operation
- Redundant double-reset of the rate-limit store (global `setupFiles` hook + `rateLimit.test.js`'s own explicit `beforeEach`) is intentional — matches `sessionRevocation.test.js`'s convention of self-documenting, independently-correct `beforeEach` blocks rather than relying solely on implicit global state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 10 (rate-limiting-on-auth-mutations) is now fully proven: production wiring (10-02) + in-process harness wiring and the full RATE-01..05 + bypass-resistance suite (10-03)
- D-09 (frontend surfaces the throttle error via the existing error `<Alert>`) required zero frontend changes — verified by inspection only, not re-tested here, since `graphqlRequest`/`Login.jsx`/`Register.jsx`/`ForgotPassword.jsx` were untouched by this phase
- No blockers for the next phase (11 — email verification)

---
*Phase: 10-rate-limiting-on-auth-mutations*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created/modified files verified present on disk; commit hashes `547bcae` and `0035d76` verified present in `git log`.
