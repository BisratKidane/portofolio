---
phase: 10-rate-limiting-on-auth-mutations
audited: 2026-07-20
asvs_level: 1
block_on: high
threats_total: 11
threats_closed: 11
threats_open: 0
---

# Phase 10: Rate Limiting on Auth Mutations — Security Audit

**Scope:** Threat register authored at plan time across 10-01-PLAN.md, 10-02-PLAN.md,
10-03-PLAN.md, plus one reviewer-discovered sibling threat (CR-01, fragment/inline-fragment
bypass) confirmed and fixed mid-phase. Verification performed against implementation code only
— documentation and SUMMARY.md claims were not accepted as evidence; every "mitigate" threat was
closed by grepping the actual file and, where practical, independently re-running the relevant
test file.

## Threat Verification

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|--------------|--------|----------|
| T-10-01a | Denial of Service (unbounded store memory growth) | `backend/src/utils/rateLimitStore.js` | accept | CLOSED | Documented as an explicit, locked milestone trade-off (D-02) in 10-01-PLAN.md's `<threat_model>` at plan-authoring time; reaffirmed in 10-REVIEW.md (WR-01) and 10-VERIFICATION.md's anti-pattern table as "explicitly accepted design trade-off... not a silent gap." Logged in this document's Accepted Risks Log below. |
| T-10-01b | Tampering (cross-test counter bleed) | `backend/src/utils/rateLimitStore.js` singleton | mitigate | CLOSED | `export function resetRateLimitStore()` present (`rateLimitStore.js:19-21`), synchronous `store.clear()`. Wired globally via `backend/test/setupRateLimit.js:4` (`beforeEach(() => resetRateLimitStore())`) and `backend/vitest.config.js:12` (`setupFiles: ['./test/setupRateLimit.js']`). `rateLimitStore.test.js` Test 4 proves the clear is immediate, not window-boundary-dependent. |
| T-10-02a | Spoofing (forged X-Forwarded-For) | `backend/src/server.js` | mitigate | CLOSED | `app.set('trust proxy', 1)` at `server.js:15`, before any route/middleware registration. `clientIp: req.ip` at `server.js:37` is the only place `req` is read for identity; `grep -n "req\." backend/src/plugins/rateLimitPlugin.js` returns 0 matches — the plugin never touches `req` directly. Proven live by `server.trustProxy.test.js` test 1 (6 requests, varying forged leftmost prefix, identical trusted rightmost hop → 6th request throttles); full suite run confirms 97/97 green including this file. |
| T-10-02b | Tampering (bypass via renamed/anonymous operationName) | `backend/src/plugins/rateLimitPlugin.js` | mitigate | CLOSED | `grep -c "operationName" backend/src/plugins/rateLimitPlugin.js` = 0 — the client-supplied string is never read. Field identification uses `operation.selectionSet.selections` (AST) via `collectRootFieldNames`. Unit-proven in `rateLimitPlugin.test.js`; full-stack-proven in `rateLimit.test.js` describe block "is keyed by the invoked field, not the client-supplied operation name" (`RENAMED_LOGIN_MUTATION`, still throttled at attempt 6). |
| T-10-02b'/CR-01 | Tampering (rate-limit bypass via GraphQL inline fragment / named fragment spread) | `backend/src/plugins/rateLimitPlugin.js` `collectRootFieldNames` | mitigate | CLOSED | Reviewer-discovered sibling threat, not in the plan-time register. Confirmed fixed by reading the shipped code: `collectRootFieldNames(selections, fragments, visited)` (`rateLimitPlugin.js:21-43`) recursively resolves `InlineFragment` (line 29-30) and `FragmentSpread` (line 31-39, looked up against `document.definitions`-derived `fragments` map built at `rateLimitPlugin.js:49-54`), with a `visited` Set cycle guard (line 33) preventing infinite fragment recursion. Regression tests `describe('fragment bypass resistance (RATE-01 / CR-01)')` in `rateLimit.test.js:136-182` (inline fragment + named fragment spread, both asserting the 6th attempt throttles) independently re-run and pass (`npm test --workspace backend -- rateLimit.test` → 9/9 passed). RED commit `2d14f34` precedes GREEN fix commit `2e56ed7` in `git log`, confirming a genuine TDD proof rather than a documentation-only claim. |
| T-10-02c | Information Disclosure (enumeration oracle via differential 429) | `backend/src/plugins/rateLimitPlugin.js` `enforceRateLimit` | mitigate | CLOSED | Guard throws `GraphQLError('Too many requests. Please try again later.', { extensions: { code: 'TOO_MANY_REQUESTS' } })` (`rateLimitPlugin.js:14-16`) before any resolver executes (thrown from `didResolveOperation`, a pre-execution hook). `rateLimitPlugin.test.js:31-48` asserts `Object.keys(caught.extensions)` has length 1 — no count/timing/existence signal leaked. |
| T-10-02d | Denial of Service (shared NAT/egress IP collectively throttled) | design-level (per-IP limiting choice) | accept | CLOSED | Documented as the explicit, locked milestone choice (D-01) in 10-02-PLAN.md's `<threat_model>`; per-account/CAPTCHA/lockout explicitly deferred. Logged in this document's Accepted Risks Log below. |
| T-10-03a | Information Disclosure (enumeration oracle, full-stack) | `backend/src/resolvers/rateLimit.test.js` + login resolver + plugin | mitigate | CLOSED | `describe('no enumeration oracle (RATE-05)')` (`rateLimit.test.js:259-305`) pins an identical breach-attempt-number (6th call) and identical message/code for a real account (`rl-real@example.com`) and a nonexistent one, on two independent IPs. Independently re-run: passes. |
| T-10-03b | Tampering (limiter bypass via operation renaming, full-stack) | `rateLimit.test.js` + plugin field extraction | mitigate | CLOSED | `describe('login rate limiting (RATE-01)')` second test, `rateLimit.test.js:112-133`, proves `RENAMED_LOGIN_MUTATION` (declared operation name `NotLogin`, invoking the real `login` field) is throttled identically to the real `Login` operation. |
| T-10-03c | Denial of Service (this change breaking test suite/CI) | `backend/test/helpers.js`, `backend/vitest.config.js`, `backend/src/resolvers/resetPassword.test.js` | mitigate | CLOSED | Global `setupFiles` reset (`setupRateLimit.js`) wired via `vitest.config.js:12`, in addition to the pre-existing `globalSetup` (unremoved, `vitest.config.js:11`). The one pre-existing test proven to collide with the now-global plugin (`resetPassword.test.js`'s 10-call timing test) is fixed by fixture isolation only — `sample(email, clientIp)` at line 94, distinct `10.0.0.${i}`/`10.0.1.${i}` IPs at lines 109-110 — with zero assertion changes. Full backend suite independently re-run: 20 files, 97/97 tests passed. |
| T-10-03d | Denial of Service (normal-query starvation) | `me`/`dashboard` sharing IP with exhausted login budget | mitigate | CLOSED | `describe('normal queries are unaffected (RATE-04)')` (`rateLimit.test.js:233-256`) interleaves 5 login-exhaustion attempts with 20 `me`/`dashboard` calls on the identical clientIp; all 20 assert `errors` undefined. Independently re-run: passes. |

**Threats closed: 11/11** (10 from the plan-time register + 1 reviewer-discovered sibling, CR-01).

## Accepted Risks Log

The following risks are **accepted**, not mitigated, per explicit disposition recorded at
plan-authoring time. They do not block phase shipment.

1. **T-10-01a — Unbounded in-memory store growth.** `backend/src/utils/rateLimitStore.js`'s
   module-level `Map` has no TTL/eviction sweep. Accepted per D-02: this is a single-instance,
   in-memory-only design for this milestone; a process restart clears all state. The key space
   is bounded by a small fixed set of rate-limited operations (3 this phase) times the number of
   distinct client IPs seen, which the reviewer (10-REVIEW.md, WR-01) still flagged as a
   theoretical memory-exhaustion vector under a sustained distributed-IP-rotation attack. Left
   open for the maintainer's decision, as recorded in 10-REVIEW.md; revisit if this ships to a
   long-uptime, high-traffic, multi-instance deployment.
2. **T-10-02d — Per-IP (not per-account) limiting collectively throttles shared-NAT/corporate-egress
   users.** Accepted per D-01, the explicit, locked milestone choice; per-account limiting,
   CAPTCHA, and escalating lockout are explicitly deferred (10-CONTEXT.md Deferred Ideas).

## Non-Blocking Warnings (carried forward from 10-REVIEW.md / 10-VERIFICATION.md)

These do not represent an absent mitigation for any registered threat and are not treated as
OPEN_THREATS, per the audit brief's explicit instruction. Surfaced for visibility only.

- **WR-02 — Weak trust-proxy isolation test.** `backend/src/server.trustProxy.test.js`'s second
  test ("isolates budgets correctly per real (trusted) client IP") sends a single request to a
  fresh IP and asserts non-throttling — a trivially-true assertion that does not itself prove
  isolation under load. The underlying security property (per-clientIp counter isolation) IS
  independently proven by a stronger test: `rateLimitPlugin.test.js:50-62`
  ("isolates counters between different clientIp values"), which drives one IP to exhaustion and
  confirms a second IP remains unaffected within the same test. T-10-02a's mitigation (`trust
  proxy = 1` + `req.ip`-only derivation) is therefore still genuinely present in code; this is a
  test-quality gap, not a missing mitigation. Left open for maintainer decision per 10-REVIEW.md.
- **IN-01 — `Date.now()`-based default test email can collide within the same millisecond.**
  `backend/test/helpers.js:33`, `createTestUser`'s default email. Latent test-flakiness risk
  only, not a security control. Left open for maintainer decision per 10-REVIEW.md.

## Verification Method Notes

- All `mitigate` threats were closed by reading the actual implementation file cited in the
  mitigation plan and confirming the grep pattern is present at the correct location (not merely
  present somewhere in the repo) — e.g. `trust proxy` set BEFORE route registration, `operationName`
  absent from the plugin file entirely (0 matches), fragment resolution genuinely recursive with
  a cycle guard.
- Two test suites were independently re-executed rather than trusting SUMMARY.md/VERIFICATION.md
  claims: `npm test --workspace backend -- rateLimit.test` (9/9 passed, including both CR-01
  fragment-bypass regressions) and the full suite `npm test --workspace backend` (20 files, 97/97
  passed).
- `git log` was inspected directly to confirm the CR-01 RED (`2d14f34`) → GREEN (`2e56ed7`)
  sequence exists, rather than accepting the review/verification narrative at face value.
- `accept`-disposition threats were checked against the plan-time `<threat_model>` blocks (which
  constitute the accepted-risk record for this phase, since no prior SECURITY.md existed before
  this audit) and cross-referenced against 10-REVIEW.md/10-VERIFICATION.md for consistency. Both
  are now additionally logged in this document's Accepted Risks Log above, making this SECURITY.md
  the canonical accepted-risk record going forward.

## Implementation Files Audited (read-only)

- `backend/src/config/rateLimits.js`
- `backend/src/utils/rateLimitStore.js`
- `backend/src/plugins/rateLimitPlugin.js`
- `backend/src/server.js`
- `backend/src/server.trustProxy.test.js`
- `backend/src/resolvers/rateLimit.test.js`
- `backend/src/plugins/rateLimitPlugin.test.js`
- `backend/test/helpers.js`
- `backend/test/setupRateLimit.js`
- `backend/vitest.config.js`
- `backend/src/resolvers/resetPassword.test.js`
- `README.md`

No implementation files were modified as part of this audit.
