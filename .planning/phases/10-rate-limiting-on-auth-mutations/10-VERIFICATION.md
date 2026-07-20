---
phase: 10-rate-limiting-on-auth-mutations
verified: 2026-07-20T18:22:59Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 10: Rate Limiting on Auth Mutations Verification Report

**Phase Goal:** Brute-force, enumeration, and reset-token-guessing attempts against `login`, `register`, and `requestPasswordReset` are throttled per client IP, without affecting normal app usage.
**Verified:** 2026-07-20T18:22:59Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `login` rejected with `TOO_MANY_REQUESTS` after 5 attempts/15min per IP, regardless of credential validity (ROADMAP SC-1) | VERIFIED | `backend/src/resolvers/rateLimit.test.js:88-110` — 6-call sequence; live run passed (see below). `backend/src/config/rateLimits.js:7` sets `login: { max: 5, windowMs: 15*60*1000 }`. |
| 2 | `register` and `requestPasswordReset` each rejected after 5 attempts/hour per IP (ROADMAP SC-2) | VERIFIED | `rateLimit.test.js:184-231`; DB count assertion (`models.User.count`) proves the 6th `register` attempt never reached the resolver. |
| 3 | Mechanism enforced at a layer the in-process `executeOperation()` harness exercises, keyed by IP + selected field, not the client string operationName (ROADMAP SC-3, RATE-04) | VERIFIED | `backend/test/helpers.js` constructs its `ApolloServer` with `plugins: [rateLimitPlugin]` (same plugin module `server.js` uses); `rateLimit.test.js` runs entirely via `graphql()` (no supertest/HTTP). Field identification is AST-based (`operation.selectionSet.selections`), confirmed by `grep -c operationName backend/src/plugins/rateLimitPlugin.js` = 0. Note: this is a deliberate, documented improvement on the literal ROADMAP text (`${clientIp}:${operationName}`) — the plan explicitly argues AST-based field extraction is the security-correct choice, closing an operation-rename bypass the literal roadmap wording would not have closed. Verified via `RENAMED_LOGIN_MUTATION` test (still throttled at attempt 6). |
| 4 | Interleaved `me`/`dashboard` burst sharing an IP with an exhausted `login` budget is never throttled (ROADMAP SC-4) | VERIFIED | `rateLimit.test.js:233-257` — 20 me/dashboard calls interleaved with 5 exhausting login attempts on the same IP, all 20 assert `errors` undefined. Test passed live. |
| 5 | Breach returns generic message; identical trigger-attempt-number for real vs. nonexistent account (ROADMAP SC-5) | VERIFIED | `rateLimit.test.js:259-305` — dedicated parity test, both sequences' 6th call assert identical message + code. Test passed live. |
| 6 | RATE-01 resists fragment-wrapped bypass (CR-01 fix holds) | VERIFIED | Independently re-derived `collectRootFieldNames` from the shipped `rateLimitPlugin.js` and ran it against both attack payloads from `10-REVIEW.md` outside the test harness — both now resolve to `["login"]` (previously `[]`). Regression tests `describe('fragment bypass resistance (RATE-01 / CR-01)')` (inline fragment + named fragment spread) pass live. |
| 7 | A per-key attempt counter enforces max/window and rejects overflow, with independent counters per key, an injectable clock for window-reset, and a synchronous full-clear reset hook (10-01 must-haves) | VERIFIED | `backend/src/utils/rateLimitStore.js` implements `checkAndIncrement(key, max, windowMs, now = Date.now())` and `resetRateLimitStore()`; `rateLimitStore.test.js` proves all 5 behaviors (threshold, isolation, window-reset, full-clear, default clock). |
| 8 | Thrown error is a generic `GraphQLError`, exact message, `extensions.code = TOO_MANY_REQUESTS`, nothing else leaked (D-08/RATE-05) | VERIFIED | `rateLimitPlugin.js:14-16`; `rateLimitPlugin.test.js:31-48` asserts `Object.keys(caught.extensions)` has length 1. |
| 9 | `server.js` trusts exactly one reverse-proxy hop, derives `clientIp` from `req.ip`, plugin never touches `req` directly | VERIFIED | `server.js:15` (`app.set('trust proxy', 1)`), `server.js:37` (`clientIp: req.ip`); `grep -n "req\." backend/src/plugins/rateLimitPlugin.js` = 0 matches. |
| 10 | Forging extra `X-Forwarded-For` prefix entries does not let an attacker escape or reset their budget (HTTP-level proof) | VERIFIED (with a test-quality caveat) | `server.trustProxy.test.js` — test 1 (6 requests, varying forged prefix, identical trusted rightmost hop) live-passes and asserts the 6th throttles. Test 2 ("isolates budgets... per real IP") only sends a single request to a fresh IP, which is a weak assertion (flagged as WR-02 in code review, still open) — but IP isolation itself is independently proven by the stronger unit test in `rateLimitPlugin.test.js:50-62` ("isolates counters between different clientIp values"), so the underlying security property holds even though this one HTTP test is weakly written. |
| 11 | README documents the in-memory/per-process trade-off and the trust-proxy=1 boundary | VERIFIED | `README.md:144-158`, `## Rate Limiting` section present between `## Authentication workflow` and `## Email configuration`, covers thresholds, single-edit-point, in-memory/restart-resets trade-off, and trust-proxy boundary. |
| 12 | Frontend surfaces the throttle error via the existing `<Alert>` with zero frontend code changes (D-09) | VERIFIED | `git diff --stat` across the phase's commit range shows no files under `frontend/` touched. `frontend/src/api/graphqlClient.js:24-27` already extracts and joins `response.data.errors[].message` into a thrown `Error`, which existing auth pages render via `<Alert severity="error">`. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/config/rateLimits.js` | Centralized, hardcoded threshold map | VERIFIED | 3 keys (`login`, `register`, `requestPasswordReset`), no `process.env` reads, matches ROADMAP thresholds exactly. |
| `backend/src/utils/rateLimitStore.js` | Fixed-window store + reset hook | VERIFIED | `checkAndIncrement`, `resetRateLimitStore` exported; internal `Map` not exported directly. |
| `backend/src/utils/rateLimitStore.test.js` | RED→GREEN TDD proof | VERIFIED | RED commit `7a3b79d` precedes GREEN commit `07c448c`; 5 behaviors covered. |
| `backend/src/plugins/rateLimitPlugin.js` | `enforceRateLimit` + Apollo plugin, AST-based, fragment-resolving | VERIFIED (post-fix) | Originally shipped with a CR-01 bypass (top-level `Field`-only filter); fixed in commit `2e56ed7` via `collectRootFieldNames`, which recursively resolves `InlineFragment` and `FragmentSpread` nodes. Independently re-derived and probed outside the test harness — confirmed fixed. |
| `backend/src/plugins/rateLimitPlugin.test.js` | Isolated TDD proof of `enforceRateLimit` | VERIFIED | 5 tests, all passing live; covers threshold, generic-error shape, field/IP isolation. |
| `backend/src/server.js` | trust proxy=1, clientIp wiring, plugin registered | VERIFIED | All three wiring points present and correctly ordered (trust proxy set before any route). |
| `backend/src/server.trustProxy.test.js` | HTTP-level IP-spoof resistance proof | VERIFIED (weak 2nd assertion, see truth #10) | Test 1 (forged-prefix resistance) is a solid proof; Test 2 (cross-IP isolation) is weakly written per WR-02, but the isolation property itself is proven elsewhere. |
| `backend/test/helpers.js` | Plugin wired into test-harness ApolloServer, `clientIp` param, `resetRateLimitStore` re-export | VERIFIED | `grep -n "plugins: \[rateLimitPlugin\]"`, `clientIp = '127.0.0.1'`, `export { resetRateLimitStore }` all present exactly once. |
| `backend/test/setupRateLimit.js` | Global per-test reset hook | VERIFIED | `beforeEach(() => resetRateLimitStore())` present; wired via `vitest.config.js` `setupFiles`. |
| `backend/src/resolvers/rateLimit.test.js` | RATE-01..05 + bypass-resistance proof suite | VERIFIED | 9 tests covering all 5 ROADMAP success criteria plus renamed-operation and both fragment-bypass regressions; all passing live. |
| `README.md` | Rate-limiting documentation section | VERIFIED | Present, correctly placed, covers all required content. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `rateLimitPlugin.js` (`didResolveOperation`) | `rateLimitStore.js` (`checkAndIncrement`) + `rateLimits.js` (`RATE_LIMITS`) | `enforceRateLimit` loop | WIRED | Confirmed by direct read and passing tests. |
| `server.js` (`context()`) | `rateLimitPlugin.js` | `contextValue.clientIp` derived from `req.ip` under `trust proxy=1` | WIRED | Only channel the plugin reads client identity from; no `req` reference inside the plugin file. |
| `test/helpers.js` (`graphql()`) | `rateLimitPlugin.js` (`rateLimitPlugin`) | Same plugin instance/module registered on the test-harness `ApolloServer` | WIRED | Confirmed — this is the integration point that makes `executeOperation()`-only proof of RATE-01..05 possible; without it, the whole `rateLimit.test.js` suite would be testing an unregistered plugin. |
| `vitest.config.js` (`setupFiles`) | `test/setupRateLimit.js` | Global `beforeEach` reset | WIRED | `setupFiles` key present, `globalSetup` untouched. |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green | `npm test --workspace backend` | 20 files, 97/97 tests passed | PASS |
| RATE-01..05 + bypass proof suite | `npm test --workspace backend -- rateLimit.test` | 1 file, 9/9 tests passed | PASS |
| Trust-proxy HTTP-level suite | `npm test --workspace backend -- server.trustProxy` | 1 file, 2/2 tests passed | PASS |
| Independent re-derivation of fragment-resolution logic against both CR-01 attack payloads (executed standalone, outside the vitest harness, using the exact function currently shipped in `rateLimitPlugin.js`) | `node probe-fragment.mjs` (parses both payloads from 10-REVIEW.md, runs `collectRootFieldNames`) | `["login"]`, `["login"]` (both attack forms now correctly attribute the field) | PASS — confirms CR-01 fix holds independent of the checked-in test file |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|--------------|----------------|--------------|--------|----------|
| RATE-01 | 10-02, 10-03 | `login` rate-limited per IP, 5/15min | SATISFIED | `rateLimit.test.js` login + renamed-operation + both fragment-bypass tests pass; CR-01 fix independently confirmed. |
| RATE-02 | 10-02, 10-03 | `register` rate-limited per IP, 5/hour | SATISFIED | `rateLimit.test.js` register test + DB count assertion. |
| RATE-03 | 10-02, 10-03 | `requestPasswordReset` rate-limited per IP, 5/hour | SATISFIED | `rateLimit.test.js` requestPasswordReset test. |
| RATE-04 | 10-01, 10-02, 10-03 | Enforced at a layer `executeOperation()` exercises, keyed by IP+operation, `me`/`dashboard` unaffected | SATISFIED | Entire `rateLimit.test.js` suite runs via `graphql()`; interleaved me/dashboard test passes. |
| RATE-05 | 10-02, 10-03 | Breach returns generic error, no enumeration oracle | SATISFIED | Dedicated parity test passes; `enforceRateLimit` error shape has exactly `{ code }` in extensions. |

No orphaned requirements — REQUIREMENTS.md maps exactly RATE-01..05 to Phase 10, and all 5 appear in at least one plan's `requirements:` frontmatter field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/utils/rateLimitStore.js` | 1 | Unbounded `Map`, no TTL sweep/eviction (WR-01) | WARNING | Explicitly accepted design trade-off (STRIDE threat register T-10-01a, disposition "accept"); documented, not a silent gap. Left open for maintainer decision per 10-REVIEW.md. |
| `backend/src/server.trustProxy.test.js` | 37-41 | Weak isolation assertion — single request to a fresh IP proves nothing about isolation under load (WR-02) | WARNING | Test-quality issue only; the underlying isolation property is proven by a stronger unit test elsewhere (`rateLimitPlugin.test.js`). Left open for maintainer decision per 10-REVIEW.md. |
| `backend/test/helpers.js` | 101 | `Date.now()`-based default test email can collide within the same millisecond (IN-01) | INFO | Latent risk only; current tests mostly pass explicit emails. Left open for maintainer decision per 10-REVIEW.md. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase.

### Human Verification Required

None. All must-haves are mechanically verifiable via test execution, static analysis of the shipped guard logic, and independent re-derivation of the fragment-resolution function outside the test harness.

### Gaps Summary

No blocking gaps. The phase goal — throttling brute-force/enumeration/reset-guessing attempts against `login`, `register`, and `requestPasswordReset` per client IP without affecting normal usage — is achieved and holds under independent re-verification, including against the fragment/inline-fragment bypass vector (CR-01) that was found and fixed mid-phase via a genuine TDD red→green cycle (`test(10)` commit `2d14f14` fails on missing throttling, `fix(10)` commit `2e56ed7` implements recursive fragment resolution and passes). The full backend suite is 97/97 green, independently re-run, not merely quoted from SUMMARY.md.

Three pre-existing warnings from `10-REVIEW.md` (WR-01 unbounded store, WR-02 weak isolation test, IN-01 email collision risk) remain open by the maintainer's own explicit decision recorded in that review — they do not block the phase goal (WR-01 is an explicitly accepted STRIDE trade-off; WR-02's underlying security property is proven by a different, stronger test; IN-01 is a latent test-flakiness risk only). These are carried forward here as WARNING-level anti-pattern findings for visibility, not as gaps.

---

_Verified: 2026-07-20T18:22:59Z_
_Verifier: Claude (gsd-verifier)_
