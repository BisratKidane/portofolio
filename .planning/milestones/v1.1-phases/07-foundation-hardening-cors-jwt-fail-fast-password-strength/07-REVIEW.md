---
phase: 07-foundation-hardening-cors-jwt-fail-fast-password-strength
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - backend/package.json
  - backend/src/config/assertProductionSecrets.js
  - backend/src/config/assertProductionSecrets.test.js
  - backend/src/config/corsOptions.js
  - backend/src/config/corsOptions.test.js
  - backend/src/config/env.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/resetPassword.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/server.cors.test.js
  - backend/src/server.js
  - backend/src/utils/passwordPolicy.js
  - backend/src/utils/passwordPolicy.test.js
  - backend/test/helpers.js
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-07-12
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This phase implements three security hardenings: a CORS validator that no longer echoes the rejected origin, a production-only JWT-secret fail-fast, and an 8-character password minimum enforced before persistence. I reviewed all three focus areas adversarially and traced them against the schema, model hooks, auth utils, and the test suite.

The three headline behaviors are implemented correctly:

- **CORS no-leak:** `corsOriginValidator` returns a fixed `'Not allowed by CORS.'` error; the rejected origin appears only in a server-side `console.warn`. This is a genuine fix — the pre-phase code (confirmed via diff) threw `Origin ${origin} is not allowed by CORS.`, which echoed the attacker-controlled origin into the 500 response body. The regression test (`server.cors.test.js`) asserts the origin never appears in body or headers.
- **Fail-fast scoped to production:** `assertProductionSecrets` only throws when `nodeEnv === 'production'`; unit tests explicitly cover `test` and `development` not throwing. Because Vitest defaults `NODE_ENV=test`, the module-load assertion in `env.js:34` will not crash the test/dev suites.
- **Password-before-persistence:** `register` calls `assertPasswordStrength` as its first statement (before lookup/count/create); `resetPassword` calls it after token validation but before `user.save()`. Neither writes to the DB when the password is rejected, and both resolver tests confirm no row/mutation is persisted.

No blockers were found. The findings below are hardening gaps and quality/test-reliability issues.

## Warnings

### WR-01: JWT fail-fast only rejects the literal `change-me` and empty values

**File:** `backend/src/config/assertProductionSecrets.js:2`
**Issue:** The guard is `(!jwtSecret || jwtSecret === 'change-me')`. In production it blocks only an unset/empty secret and the exact default string. Any other trivially weak secret — `'secret'`, `'x'`, `'jwt'`, a 3-char value — passes the check and is accepted as a production signing key. Because `env.js` also assigns `jwtSecret: process.env.JWT_SECRET || 'change-me'`, the `!jwtSecret` branch is never reachable from the real config path (it is only exercised by the direct unit test), so the effective production protection is "not literally `change-me`." The stated goal ("non-default value") is met narrowly, but the fail-fast provides weaker assurance than it appears to.
**Fix:** Add a minimum-entropy/length floor so short or obviously weak secrets also fail in production:
```js
export function assertProductionSecrets({ nodeEnv, jwtSecret }) {
  if (nodeEnv !== 'production') return;
  if (!jwtSecret || jwtSecret === 'change-me' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong (>=32 char) non-default value in production.');
  }
}
```

### WR-02: CORS rejection surfaces as a 500 with a stack trace outside production

**File:** `backend/src/config/corsOptions.js:5`, `backend/src/server.js:20`
**Issue:** Rejection is signalled by `callback(new Error('Not allowed by CORS.'))`. The `cors` middleware forwards this via `next(err)`, and because `server.js` registers no error-handling middleware, Express's default handler responds with HTTP 500. Two consequences: (1) a policy/client condition is reported as a server fault (403 would be correct), and (2) Express's finalhandler includes `err.stack` in the response body whenever `app.get('env') !== 'production'` — i.e. in `test` and `development`, the response leaks server file paths (`.../config/corsOptions.js:5`). The rejected origin itself is not leaked (the WR/CR-01 goal holds), so this is a lower-severity information-exposure/semantics issue, but it is a real quality/security gap in the rejection path.
**Fix:** Add a dedicated error handler after the middleware that maps the CORS error to a generic 403 with no stack, e.g.:
```js
app.use((err, _req, res, next) => {
  if (err && err.message === 'Not allowed by CORS.') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next(err);
});
```

## Info

### IN-01: `assertPasswordStrength` throws a raw TypeError on a non-string argument

**File:** `backend/src/utils/passwordPolicy.js:2`
**Issue:** `password.length` dereferences `password` with no guard. Today both call sites are GraphQL resolvers whose `password` arg is declared `String!`, so a null/undefined value cannot reach the function and the risk is only latent. If this helper is ever reused outside a `String!`-typed boundary, a `null`/`undefined` input produces an opaque `Cannot read properties of undefined (reading 'length')` instead of the intended validation error.
**Fix:** Guard the type/emptiness explicitly: `if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters.');`

### IN-02: Test-user email generator can collide under fast execution

**File:** `backend/test/helpers.js:29`
**Issue:** `createTestUser` derives its default email from `test-${Date.now()}@example.com`. Two `createTestUser()` calls (without an `email` override) within the same millisecond generate an identical address and hit the `unique` email constraint, producing an intermittent, hard-to-diagnose test failure. Current suites mostly override `email` or create a single user per test, so the collision is latent, but the pattern is a flaky-test smell.
**Fix:** Use a monotonically increasing counter or a random suffix, e.g. `email: \`test-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com\``, or accept an explicit counter.

### IN-03: Integration tests exercise resolvers through a second, divergent Apollo instance

**File:** `backend/test/helpers.js:8`, `backend/test/helpers.js:14-20`
**Issue:** `helpers.js` instantiates its own `ApolloServer` and drives resolvers via `executeOperation`, while `httpClient()` hits the separate `ApolloServer` created in `server.js`. The two paths build `contextValue` differently: the helper injects `{ models, user }` directly (defaulting `user` to `null`), whereas the HTTP path computes `user` from the request via `getUserFromRequest`. Resolver-level tests therefore never traverse the real auth-context wiring, and the duplicated server construction can silently drift from production config (e.g. plugins, formatError). This is acceptable for unit-style resolver tests but worth noting as a coverage gap for the context layer.
**Fix:** Consider routing resolver integration tests through the real server/app (or sharing a single Apollo factory) so the production context function is exercised, or add an explicit HTTP-level authenticated test.

### IN-04: `/health` is registered before the CORS middleware

**File:** `backend/src/server.js:16-20`
**Issue:** The `/health` GET handler is mounted at line 16, before `app.use(cors(...))` at line 20, so health responses carry no CORS headers and bypass origin enforcement. This is harmless for a public, unauthenticated liveness probe, but it is an inconsistency in middleware ordering worth being deliberate about (any route added above line 20 in future would also silently skip CORS).
**Fix:** If health should share the app's CORS policy, move the `cors(...)` registration above the `/health` route; otherwise leave a brief comment documenting the intentional bypass.

---

_Reviewed: 2026-07-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
