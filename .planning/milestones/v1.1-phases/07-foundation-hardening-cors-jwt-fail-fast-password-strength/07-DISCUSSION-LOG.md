# Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 7-Foundation Hardening — CORS, JWT Fail-Fast & Password Strength
**Areas discussed:** User-facing error copy, Password check (dependency vs hand-rolled)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Password policy shape | Min 8; max length? composition? blocklist? | |
| User-facing error copy | Password-too-short + CORS rejection wording | ✓ |
| Fail-fast scope & DX | What counts as insecure; warn in dev? | |
| Password check: dep vs hand-rolled | `validator` package vs zero-dep helper | ✓ |

**User's choice:** User-facing error copy + Password check dep vs hand-rolled
**Notes:** Skipped areas fall back to research-locked defaults (documented in CONTEXT.md as D-04, D-05).

---

## User-Facing Error Copy — Password message

| Option | Description | Selected |
|--------|-------------|----------|
| Password must be at least 8 characters. | Plain, specific, matches terse existing messages | ✓ |
| Password must be at least 8 characters long. | Slightly more natural wording | |
| Your password is too short. Use at least 8 characters. | Friendlier two-sentence tone | |

**User's choice:** `Password must be at least 8 characters.`
**Notes:** Surfaced via the existing GraphQL-error → MUI Alert convention.

---

## User-Facing Error Copy — CORS rejection message

| Option | Description | Selected |
|--------|-------------|----------|
| Not allowed by CORS. | De-facto generic constant, no origin echoed | ✓ |
| Origin not allowed. | Equally generic, marginally more descriptive | |
| Request blocked by CORS policy. | More explanatory for a debugging dev | |

**User's choice:** `Not allowed by CORS.` (after reframing)
**Notes:** User pushed back — "why would there be a CORS error to users?" — a correct challenge. Established that legitimate users never trigger CORS rejections (their origin is allowlisted) and the browser blocks the response body from JS regardless, so this string is an internal error constant, not user-facing copy. The actual requirement (CORS-01) is only that the attacker-controlled origin not be reflected back; the real origin is logged server-side via `console.warn`. User then chose to lock the constant `Not allowed by CORS.` rather than leave it to the planner.

---

## Password Check — dependency vs hand-rolled

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled zero-dep helper | Tiny passwordPolicy.js, no dependency, trivially testable | ✓ |
| Use the `validator` package | Adds validator; its strong-password default fights NIST length-only | |

**User's choice:** Hand-rolled zero-dependency helper
**Notes:** Matches the codebase's no-dependency convention; `validator`'s `isStrongPassword` defaults to composition rules already rejected.

---

## Claude's Discretion

- Exact function/file naming (`corsOriginValidator`/`buildCorsOptions`, `assertProductionSecrets`, `passwordPolicy`).
- Throw vs `process.exit(non-zero)` for the fail-fast and its exact placement in the boot sequence.
- Shape of the importable-`app` refactor (separating `app` export from `app.listen()`).
- Whether the 8-char check is one shared helper or inlined in both resolvers, as long as behavior is identical and pre-hash.

## Deferred Ideas

None. Common-password blocklist, maximum length, and composition rules were considered and explicitly declined per NIST length-over-composition guidance — not deferred to a later phase.
