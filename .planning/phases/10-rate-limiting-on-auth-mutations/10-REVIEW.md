---
phase: 10-rate-limiting-on-auth-mutations
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - backend/src/config/rateLimits.js
  - backend/src/utils/rateLimitStore.js
  - backend/src/utils/rateLimitStore.test.js
  - backend/src/plugins/rateLimitPlugin.js
  - backend/src/plugins/rateLimitPlugin.test.js
  - backend/src/server.js
  - backend/src/server.trustProxy.test.js
  - backend/src/resolvers/resetPassword.test.js
  - backend/test/helpers.js
  - backend/test/setupRateLimit.js
  - backend/vitest.config.js
  - backend/src/resolvers/rateLimit.test.js
  - README.md
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This phase adds in-memory, fixed-window rate limiting to the three auth mutations
(`login`, `register`, `requestPasswordReset`) via an Apollo plugin that keys off the
AST field name and the trust-proxy-derived client IP. The store, config, enumeration
parity, and the trust-proxy boundary are individually sound and reasonably tested.

However, the security-critical guarantee the phase is built to provide — that these
mutations cannot be invoked unthrottled — is **defeated**. The plugin identifies
rate-limited fields by inspecting only top-level `Field` selections in the operation
AST and never resolves `FragmentSpread` or `InlineFragment` nodes. Wrapping the
mutation in an inline fragment or named fragment bypasses the limiter completely while
the mutation still executes. This was confirmed empirically (both fragment forms yield
an empty `fieldNames` list). Because no test exercises fragment/alias vectors, the
suite reports green while the bypass ships. This is a BLOCKER for a feature whose sole
purpose is brute-force / enumeration resistance.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Fragment and inline-fragment queries bypass rate limiting entirely

**File:** `backend/src/plugins/rateLimitPlugin.js:24-30`

**Issue:** `didResolveOperation` extracts field names with:

```js
const fieldNames = operation.selectionSet.selections
  .filter((selection) => selection.kind === 'Field')
  .map((selection) => selection.name.value);
```

This inspects only the *direct* selections of the operation and only those whose
`kind === 'Field'`. It never descends into `FragmentSpread` or `InlineFragment`
selections. GraphQL execution, by contrast, *does* resolve fragments at the mutation
root, so the wrapped field runs normally. The result is a complete rate-limit bypass
on exactly the mutations this phase is meant to protect.

Confirmed empirically against the installed `graphql` package — both of these forms
produce `fieldNames === []`, so `enforceRateLimit` iterates nothing and never throws,
yet `login` still executes:

```graphql
# Inline fragment (no type condition even needed)
mutation Evade($email: String!, $password: String!) {
  ... { login(email: $email, password: $password) { token } }
}

# Named fragment spread
mutation Evade($email: String!, $password: String!) { ...L }
fragment L on Mutation {
  login(email: $email, password: $password) { token }
}
```

An attacker performing credential stuffing or reset-endpoint enumeration simply sends
the fragment form and the 5/window ceiling never applies. This nullifies RATE-01,
RATE-02, RATE-03, and RATE-05.

**Fix:** Resolve fragments before collecting field names. Walk the operation's
selection set, following `FragmentSpread` (looked up in `document.definitions`) and
`InlineFragment` recursively, collecting every `Field` name encountered. The plugin
callback receives `document` alongside `operation`, so the fragment definitions are
available:

```js
async didResolveOperation({ contextValue, document, operation }) {
  const fragments = Object.fromEntries(
    document.definitions
      .filter((d) => d.kind === 'FragmentDefinition')
      .map((d) => [d.name.value, d])
  );

  const fieldNames = [];
  const visit = (selectionSet) => {
    for (const sel of selectionSet.selections) {
      if (sel.kind === 'Field') {
        fieldNames.push(sel.name.value);
      } else if (sel.kind === 'InlineFragment') {
        visit(sel.selectionSet);
      } else if (sel.kind === 'FragmentSpread') {
        const frag = fragments[sel.name.value];
        if (frag) visit(frag.selectionSet);
      }
    }
  };
  visit(operation.selectionSet);

  enforceRateLimit(contextValue.clientIp, fieldNames);
}
```

Add regression tests covering: inline fragment (with and without type condition),
named fragment spread, and nested fragments, asserting the 6th attempt is throttled.

## Warnings

### WR-01: Unbounded store keyed by client-controlled IP is a memory-exhaustion vector

**File:** `backend/src/utils/rateLimitStore.js:1-17`

**Issue:** `store` is a module-level `Map` that only ever grows. A key is added the
first time an IP hits a rate-limited field and is *never* removed — expired windows are
overwritten in place only if that exact key is seen again, and there is no sweep/TTL
eviction. Because the key is derived from `X-Forwarded-For` (attacker-influenced within
the trusted-proxy contract) and the field name, a distributed attacker rotating source
IPs can insert an unbounded number of entries and exhaust process memory. This is a
correctness/availability concern (DoS), not merely a performance micro-optimization:
the limiter itself becomes the attack surface.

**Fix:** Evict stale entries. Either lazily delete an entry when its window has fully
elapsed inside `checkAndIncrement` (delete-then-recreate rather than leaving it), plus
a periodic sweep (`setInterval` with `.unref()`), or cap the map size with LRU
eviction. At minimum, document the unbounded-growth risk in the store module.

### WR-02: `trustProxy` "isolation" test does not actually test isolation

**File:** `backend/src/server.trustProxy.test.js:37-41`

**Issue:** The test named "isolates budgets correctly per real (trusted) client IP"
sends a single request to a fresh IP and asserts it is not `TOO_MANY_REQUESTS`. A fresh
IP is trivially under budget, so the assertion passes even if per-IP isolation were
broken. It proves nothing about isolation and gives false confidence in the trust-proxy
boundary that this phase flags as security-critical.

**Fix:** Drive one IP to exhaustion, confirm its 6th request throttles, then confirm a
*second, distinct* trusted client IP (different rightmost `X-Forwarded-For` hop) is
still allowed within the same `beforeEach` window — i.e. assert both throttled-A and
allowed-B in one test.

### WR-03: No test covers the fragment/inline-fragment/alias attack surface

**File:** `backend/src/resolvers/rateLimit.test.js:90-111`, `backend/src/plugins/rateLimitPlugin.test.js`

**Issue:** The suite verifies keying by field vs. operation name (the
`RENAMED_LOGIN_MUTATION` case) but never sends a fragment-wrapped or inline-fragment
mutation. That gap is exactly why CR-01 ships green. The phase brief explicitly calls
out AST-based field identification as security-critical, yet the AST traversal's blind
spots are untested.

**Fix:** After fixing CR-01, add tests that submit `login` via (a) a named fragment
spread, (b) an inline fragment with and without type condition, and (c) multiple
aliased `login` selections in one operation, asserting the limiter still enforces the
5/window ceiling.

## Info

### IN-01: `createTestUser` default email can collide within the same millisecond

**File:** `backend/test/helpers.js:30-38`

**Issue:** The default email is `` `test-${Date.now()}@example.com` ``. Two users
created without an explicit `email` override inside the same millisecond (fast tests,
or `Promise.all`) would collide on the unique email constraint and fail
non-deterministically. Current tests mostly pass explicit emails, so this is latent.

**Fix:** Use a monotonic counter or `crypto.randomUUID()` in the default email, e.g.
`` `test-${crypto.randomUUID()}@example.com` ``.

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
