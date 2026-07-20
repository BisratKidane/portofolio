---
phase: 10-rate-limiting-on-auth-mutations
plan: 02
subsystem: api
tags: [rate-limiting, apollo-plugin, trust-proxy, graphql-ast, vitest, backend]

# Dependency graph
requires:
  - phase: 10-01
    provides: "RATE_LIMITS config map + checkAndIncrement/resetRateLimitStore fixed-window store"
provides:
  - "enforceRateLimit(clientIp, fieldNames) guard function, TDD-proven"
  - "rateLimitPlugin Apollo plugin using AST-based field extraction (didResolveOperation)"
  - "server.js trust proxy = 1, clientIp on contextValue, plugin registered on the production ApolloServer instance"
  - "HTTP-level proof (server.trustProxy.test.js) that forged X-Forwarded-For prefixes cannot bypass the per-IP budget"
  - "README Rate Limiting section documenting thresholds + the single-trusted-hop boundary"
affects: [10-03-plan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Apollo requestDidStart -> didResolveOperation hook reads operation.selectionSet.selections (parsed AST), never requestContext.operationName — closes the client-controlled-rename bypass vector"
    - "clientIp lifted onto Apollo contextValue in server.js's context() function; the plugin itself never touches req, keeping it HTTP-free/testable"

key-files:
  created:
    - backend/src/plugins/rateLimitPlugin.js
    - backend/src/plugins/rateLimitPlugin.test.js
    - backend/src/server.trustProxy.test.js
  modified:
    - backend/src/server.js
    - README.md

key-decisions:
  - "Field identification uses operation.selectionSet.selections[].name.value (parsed GraphQL AST), never the client-supplied operationName string — verified by a 0-match grep on 'operationName' in rateLimitPlugin.js"
  - "trust proxy = 1 set unconditionally (no env gate), matching the flat, always-on style of the file's other middleware registration"
  - "clientIp derivation happens exactly once, in server.js's context() function, from req.ip — the plugin only ever reads contextValue.clientIp"

patterns-established:
  - "Central pre-resolver guard (enforceRateLimit) mirrors the requireAuth/requireAdmin throw-immediately, single-fixed-message convention in utils/auth.js"

requirements-completed: [RATE-01, RATE-02, RATE-03, RATE-05, RATE-04]

# Metrics
duration: 2min
completed: 2026-07-20
---

# Phase 10 Plan 02: Rate-Limit Enforcement Plugin + Trust-Proxy Wiring Summary

**Apollo `didResolveOperation` plugin enforcing per-IP, per-field rate limits via AST-based field extraction (never the spoofable `operationName` string), wired into `server.js` behind `trust proxy = 1`, with an HTTP-level test proving forged `X-Forwarded-For` prefixes cannot bypass the budget.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-20T20:03:55+02:00
- **Completed:** 2026-07-20T20:06:02+02:00
- **Tasks:** 2 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `enforceRateLimit(clientIp, fieldNames)` TDD-proven: unconfigured fields (e.g. `me`, `dashboard`, `logout`) are never throttled even after 20 calls; configured fields (`login`, max 5) throw on the 6th attempt; the thrown `GraphQLError` has exactly `message: 'Too many requests. Please try again later.'` and `extensions: { code: 'TOO_MANY_REQUESTS' }` with no other extension keys; counters are isolated correctly both per-clientIp and per-field
- `rateLimitPlugin` wraps the guard via `didResolveOperation`, extracting field names from `operation.selectionSet.selections` (the parsed AST) — `operationName` (the client-supplied string) appears zero times in the file, closing the rename/anonymize bypass vector (T-10-02b)
- `server.js` now sets `app.set('trust proxy', 1)` before any middleware, derives `clientIp: req.ip` onto `contextValue` in the Apollo `context()` function, and registers `plugins: [rateLimitPlugin]` on the production `ApolloServer` instance
- `server.trustProxy.test.js` proves over real HTTP (via the existing `httpClient()`/supertest harness) that varying the forged, leftmost `X-Forwarded-For` prefix on 6 consecutive `login` requests cannot reset or bypass the derived clientIp's budget (6th request still throttles), while a request with a genuinely different trusted rightmost IP is correctly treated as a separate, unthrottled client (T-10-02a)
- README gained a `## Rate Limiting` section (between `## Authentication workflow` and `## Email configuration`) documenting the three thresholds, the single edit point (`rateLimits.js`), the in-memory/per-process trade-off (D-02), and the single-trusted-hop `trust proxy = 1` boundary
- Full RED->GREEN TDD cycle observed for Task 1: `test(10-02)` commit (module-resolution failure) precedes `feat(10-02)` implementation commit; full backend suite green at 88 tests (up from 81 pre-plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD enforceRateLimit + build the Apollo plugin wrapper**
   - RED: `d158793` (test) - failing tests, `./rateLimitPlugin.js` module resolution error confirmed
   - GREEN: `74b52fa` (feat) - implementation, all 5 tests pass, full backend suite green
2. **Task 2: Wire trust proxy + clientIp + plugin into server.js; prove IP-spoof resistance over HTTP** - `debe486` (feat)

**Plan metadata:** (this commit, following SUMMARY.md)

_Note: TDD task produced 2 commits (test -> feat); no refactor step was needed._

## Files Created/Modified
- `backend/src/plugins/rateLimitPlugin.js` - `enforceRateLimit(clientIp, fieldNames)` guard + `rateLimitPlugin` Apollo plugin object (AST-based field extraction)
- `backend/src/plugins/rateLimitPlugin.test.js` - 5 Vitest cases: unconfigured-field immunity, threshold breach, generic-error shape, per-clientIp isolation, per-field isolation
- `backend/src/server.trustProxy.test.js` - 2 HTTP-level Vitest cases proving forged X-Forwarded-For prefixes cannot bypass/reset the budget and distinct real clients stay isolated
- `backend/src/server.js` - `trust proxy = 1`, `clientIp: req.ip` on `contextValue`, `plugins: [rateLimitPlugin]` on the production `ApolloServer`
- `README.md` - new `## Rate Limiting` section documenting thresholds, single-edit-point config, in-memory trade-off, and the trust-proxy boundary

## Decisions Made
- Field identification via parsed AST (`operation.selectionSet.selections`), never the client-controlled `operationName` string — deliberate, security-driven, per the plan's stated crux (closes an operation-renaming/anonymizing bypass the naive `operationName`-keyed approach sketched in PATTERNS.md would not have closed)
- `trust proxy = 1` set unconditionally, no env gate — matches the file's existing flat, always-on middleware style; documented in README as a hard deployment constraint (must sit behind exactly one trusted reverse proxy)

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Gate sequence verified in `git log`:
1. RED gate: `d158793 test(10-02): add failing tests for enforceRateLimit` — confirmed failing on `Cannot find module './rateLimitPlugin.js'` before any implementation existed
2. GREEN gate: `74b52fa feat(10-02): implement rate-limit enforcement plugin` — all 5 tests pass after implementation
3. No REFACTOR commit needed — implementation was minimal and clean on first pass

## Issues Encountered

None. One environment-verification step was performed before writing the HTTP-level test: a throwaway script confirmed `trust proxy = 1` resolves `req.ip` to the rightmost `X-Forwarded-For` entry (the "nearest trusted hop"), matching the plan's stated `server.trustProxy.test.js` design (varying the leftmost/forged prefix while holding the rightmost/trusted address constant). No code deviation resulted — this was verification of Express/`proxy-addr` semantics prior to writing the test, not a fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `enforceRateLimit`, `rateLimitPlugin`, and the production `server.js` wiring are ready for Plan 10-03, which per the threat model must add: (a) the end-to-end AST-extraction proof via `executeOperation()`/`test/helpers.js`, and (b) the deferred real-vs-nonexistent-account parity test (T-10-02c) using the real `login`/`register`/`requestPasswordReset` resolvers
- `test/helpers.js`'s `graphql()` wrapper still constructs its own `ApolloServer` without `plugins: [rateLimitPlugin]` and without `clientIp` in its `contextValue` — per 10-CONTEXT.md's Integration Points, Plan 10-03 must extend both, or in-process `executeOperation()` tests will not exercise the limiter
- No blockers for Plan 10-03

---
*Phase: 10-rate-limiting-on-auth-mutations*
*Completed: 2026-07-20*
