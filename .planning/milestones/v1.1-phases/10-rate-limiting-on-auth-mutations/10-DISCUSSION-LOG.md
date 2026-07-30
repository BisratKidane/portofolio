# Phase 10: Rate Limiting on Auth Mutations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 10-rate-limiting-on-auth-mutations
**Areas discussed:** Counter store & scope, Client-IP trust / proxy, Limits: fixed vs configurable, 429 error detail (UX vs security)

---

## Counter store & scope

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory Map | Module-level Map keyed by clientIp:operationName, count + window-start; zero deps; test-reset hook. Resets on restart, per-process. | ✓ |
| Redis / persistent store | Shared, restart-durable, multi-instance — but adds a dependency + infra and test mocking. | |

**User's choice:** In-memory Map
**Notes:** Matches the minimal-dependency ethos; single-instance v1.1 app. Per-process / restart-reset trade-offs accepted and to be documented. Requires a `resetRateLimitStore()` test hook mirroring `resetTables()`.

---

## Client-IP trust / proxy

| Option | Description | Selected |
|--------|-------------|----------|
| trust proxy = 1 + document | Express `trust proxy` one hop so req.ip reads real client from X-Forwarded-For behind the single reverse proxy; clientIp lifted onto contextValue for HTTP-free tests. | ✓ |
| Defer proxy trust to deploy docs | Key on req.ip as-is; note prod must configure trust proxy. | |

**User's choice:** trust proxy = 1 + document
**Notes:** Security-remediation milestone — ships a correct prod default rather than a subtly-wrong one (all clients sharing one bucket). Trust boundary documented in README.

---

## Limits: fixed vs configurable

| Option | Description | Selected |
|--------|-------------|----------|
| Constants map in code | Central per-operation config object (login 5/15min, register 5/hr, requestPasswordReset 5/hr); one-line edits; Phase 11 adds one entry. | ✓ |
| Env-configurable knobs | Read max/window from env with ROADMAP defaults; tunable without redeploy but more config surface + validation. | |

**User's choice:** Constants map in code
**Notes:** No env surface this milestone. Operations absent from the map are unlimited (normal queries never keyed).

---

## 429 error detail (UX vs security)

| Option | Description | Selected |
|--------|-------------|----------|
| Generic + reuse existing Alert | Generic "Too many requests" GraphQLError (code TOO_MANY_REQUESTS); no timing/count leaked; identical for real vs nonexistent account; frontend reuses existing error Alert. | ✓ |
| Include Retry-After hint | Add seconds-until-reset for UX; leaks window timing / small attacker signal. | |

**User's choice:** Generic + reuse existing Alert
**Notes:** On-theme for a security milestone. No-enumeration parity pinned by a dedicated test; rejection fires before credential check.

---

## Claude's Discretion

- Window algorithm (fixed vs sliding) and store data-shape — left to research/planning, given per-IP+operation isolation, correct expiry, and deterministic time control in tests are preserved.
- Mechanism for sharing the plugin between `server.js` and `test/helpers.js` Apollo instances — planner's call, but both instances must carry it.

## Deferred Ideas

- Persistent / shared (Redis) rate-limit store — multi-instance / restart-durable limits.
- Env-configurable thresholds — if ops need redeploy-free tuning.
- Per-account or escalating lockout / CAPTCHA — heavier anti-abuse, own phase.
- `resendVerificationEmail` throttling — Phase 11 (adds one entry to this config map).
