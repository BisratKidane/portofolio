# Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Three independent, low-risk security hardening fixes, plus the test infrastructure two later phases depend on:

1. **CORS-01** — a rejected CORS origin is logged server-side but the client receives a generic error; the attacker-controlled origin value is no longer echoed back.
2. **SECRET-01/02** — the backend refuses to boot when `NODE_ENV=production` and `JWT_SECRET` is unset or the insecure default `'change-me'`; `development` and `test` keep the existing weak fallback so local dev and the 51-test v1.0 suite stay green.
3. **PWD-01/02** — `register` and `resetPassword` reject passwords shorter than 8 characters, server-side, before hashing, via the existing GraphQL-error/MUI `Alert` convention.
4. **HTTP test harness** — an importable Express `app` (decoupled from `app.listen()`) plus `supertest`, so Express-boundary concerns (CORS wiring) can be tested — the in-process `executeOperation()` helper cannot reach them. Reused by Phase 10's coarse rate-limit layer.

Every fix is TDD'd red-green-refactor. Out of scope: anything beyond these five requirements (mailer, reset-token removal, session revocation, rate limiting, email verification — Phases 8–11).

</domain>

<decisions>
## Implementation Decisions

### User-Facing Error Copy
- **D-01:** Password-too-short message is exactly `Password must be at least 8 characters.` — surfaced through the existing GraphQL-error → MUI `<Alert severity="error">` convention (same path as `A user with this email already exists.`). Terse tone matches existing messages.
- **D-02:** CORS rejection returns the fixed constant `Not allowed by CORS.` — no origin value in the client response. The real rejected origin is logged server-side (`console.warn`) for debugging. Rationale confirmed during discussion: legitimate users never trigger a CORS rejection (their origin is allowlisted); the rejection only fires for non-allowlisted origins, and the browser blocks the response body from JS anyway — so this string is an internal error constant, not user-facing UX copy. The security requirement (CORS-01) is solely: do not reflect the attacker-controlled origin.

### Password-Check Implementation
- **D-03:** Hand-rolled zero-dependency helper (e.g. `backend/src/utils/passwordPolicy.js`), NOT the `validator` npm package. Matches the codebase's no-dependency convention and is trivially unit-testable. `validator`'s `isStrongPassword` defaults to composition rules that were explicitly rejected in favor of NIST length-only, so it would fight the policy rather than help.

### Password Policy Shape (defaults — research-locked, not re-discussed)
- **D-04:** 8-character minimum only. No composition rules (no forced uppercase/digit/symbol), no maximum length, no common-password/breach blocklist. NIST 800-63B: length over composition. (User skipped this area; these are the SUMMARY.md defaults and are accepted.)

### JWT Fail-Fast Scope (defaults — research/roadmap-locked, not re-discussed)
- **D-05:** Fail-fast fires **only** when `NODE_ENV === 'production'` AND `JWT_SECRET` is unset or equals `'change-me'`. Must never fire in `test`/`development` (both use the weak/shared secret deliberately). Implement as a pure exported assertion (e.g. `assertProductionSecrets()`) called at startup so it unit-tests with plain arguments — no module-reset gymnastics or HTTP boot.

### Claude's Discretion
- Exact function/file names and signatures (`corsOriginValidator`/`buildCorsOptions`, `assertProductionSecrets`, `passwordPolicy`) — follow the research's extract-pure-functions pattern; planner/executor finalize naming to match codebase conventions.
- Throw vs `process.exit(non-zero)` for the fail-fast, and precisely where the assertion is invoked in the boot sequence.
- The exact shape of the importable-`app` refactor of `server.js` (separating `app` export from `app.listen()`).
- Whether the password check lives in one shared helper called by both resolvers or is inlined — as long as both `register` and `resetPassword` enforce it identically, server-side, before hashing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 7 goal, 5 success criteria (SC-1..SC-5), dependency notes.
- `.planning/REQUIREMENTS.md` — CORS-01, SECRET-01, SECRET-02, PWD-01, PWD-02 (exact acceptance wording).

### Security Research (governing synthesis for this milestone)
- `.planning/research/SUMMARY.md` — **primary**. §"Phase 1: Foundation Hardening" (rationale/delivers/avoids), the in-process-harness constraint, and the extract-pure-functions pattern. Also documents the two non-flips: `register.test.js`'s malformed-email test and all `login`/`dashboard` tests use `createTestUser()` (bypasses the `register` resolver), so the password-strength fix does not touch them.
- `.planning/research/PITFALLS.md` — Pitfall 1 (harness can't reach Express layer → build importable `app` + supertest before red tests) and the JWT fail-fast crash pitfall (must be scoped exactly to `production`).
- `.planning/research/ARCHITECTURE.md` — pure-function extraction pattern for `corsOriginValidator`/`assertProductionSecrets`.
- `.planning/research/STACK.md` — `supertest@^7.2.2` devDependency; the zero-new-dependency status of CORS + JWT fail-fast.

### Code touched this phase
- `backend/src/server.js` — CORS `origin` callback (currently echoes origin); `app.listen()` side-effect at import time must be decoupled to export `app`.
- `backend/src/config/env.js` — `jwtSecret` default `'change-me'`; where the production assertion is wired in.
- `backend/src/resolvers/user.resolver.js` — `register` and `resetPassword` mutations get the 8-char check before hashing.
- `backend/test/helpers.js` — existing in-process `executeOperation()` harness (the one that cannot reach CORS); new supertest harness is additive, not a replacement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/test/helpers.js` (`graphql()`, `resetTables()`, `createTestUser()`) — used by all resolver tests; password-strength red tests for `register`/`resetPassword` reuse `graphql()`.
- Existing resolver-test pattern (`backend/src/resolvers/register.test.js`) — asserts exact error-message strings via `errors[0].message`; the PWD tests follow the same shape asserting `Password must be at least 8 characters.`
- `env.nodeEnv` already exposed from `env.js` — the fail-fast assertion keys on it.

### Established Patterns
- Resolvers `throw new Error('...')`; Apollo surfaces the message; frontend shows it in an MUI `<Alert>`. Both new messages ride this exact path — no schema or frontend change needed.
- Utilities are plain named exports in `backend/src/utils/` (e.g. `auth.js`) — `passwordPolicy.js` fits this convention.
- `env.js` runs at module-import time — the fail-fast assertion must be gated so importing `env` in `test`/`development` never throws.

### Integration Points
- CORS: `app.use(cors({ origin(origin, callback) {...} }))` in `server.js` — swap the echo for a logged-origin + generic-constant callback.
- Boot: `assertProductionSecrets()` invoked during startup (before `app.listen()`), reading `env`.
- New supertest harness imports the exported `app` from `server.js` without triggering `.listen()`.

</code_context>

<specifics>
## Specific Ideas

- Password message verbatim: `Password must be at least 8 characters.`
- CORS client message verbatim: `Not allowed by CORS.` (origin `console.warn`'d server-side).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Common-password blocklist, max length, and composition rules were considered and explicitly declined per NIST length-only guidance, not deferred.)

</deferred>

---

*Phase: 7-Foundation Hardening — CORS, JWT Fail-Fast & Password Strength*
*Context gathered: 2026-07-12*
