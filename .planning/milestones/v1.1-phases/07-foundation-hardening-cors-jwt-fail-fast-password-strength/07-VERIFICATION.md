---
phase: 07-foundation-hardening-cors-jwt-fail-fast-password-strength
verified: 2026-07-12T23:15:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength Verification Report

**Phase Goal:** "The app refuses insecure configurations and weak passwords before they can cause harm, without ever crashing dev/test — and a new HTTP-level test harness exists for the Express-layer concerns the in-process GraphQL test helper can't reach."
**Verified:** 2026-07-12T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A rejected CORS origin never appears in client-facing response body/headers, only server-side `console.warn`; client gets fixed `Not allowed by CORS.` string (D-02) | VERIFIED | `backend/src/config/corsOptions.js:4-5` logs `CORS rejected origin: ${origin}` via `console.warn` and returns `new Error('Not allowed by CORS.')` to the callback. `backend/src/server.cors.test.js` HTTP-level test asserts `JSON.stringify(res.body) + JSON.stringify(res.headers)` never contains `evil.example`. Old origin-echoing string (`Origin ${origin} is not allowed`) confirmed absent via `grep -n "Origin \${origin} is not allowed" backend/src/server.js` (zero matches). |
| 2 | An allowlisted origin's request still succeeds normally through CORS after the refactor | VERIFIED | `backend/src/server.cors.test.js` second test asserts `res.headers['access-control-allow-origin']` equals the allowed origin and `res.status === 200`. Confirmed passing in live test run. |
| 3 | `assertProductionSecrets` throws ONLY when `nodeEnv === 'production'` with unset/`'change-me'` secret; never throws for test/development | VERIFIED | `backend/src/config/assertProductionSecrets.js:2` — single allowlist-of-one condition `nodeEnv === 'production' && (!jwtSecret \|\| jwtSecret === 'change-me')`. Manually confirmed: `NODE_ENV=production JWT_SECRET=change-me node -e "import('./backend/src/config/env.js')..."` threw with message `JWT_SECRET must be set to a non-default value in production.` (exit 1). `NODE_ENV=production JWT_SECRET=a-real-strong-secret` did NOT throw (exit 0). `env/test.env` sets `NODE_ENV=test` and `JWT_SECRET=change-me-local-jwt-secret` (not the literal `'change-me'` and not production) — confirmed the full backend suite (which loads `env.js` under this config) runs and passes without crashing. |
| 4 | 8-char minimum enforced server-side BEFORE hashing/persistence in BOTH `register` and `resetPassword`, exact message `Password must be at least 8 characters.` (D-01) | VERIFIED | `backend/src/utils/passwordPolicy.js` throws the exact D-01 string, zero imports (confirmed via `grep -n "^import"` — zero matches). `backend/src/resolvers/user.resolver.js:27` calls `assertPasswordStrength(password)` as the first statement in `register`, before the `existingUser` DB lookup. `:72` calls it in `resetPassword` after token-validity check but strictly before `user.passwordHash = password` is assigned (line 74). `register.test.js` asserts the row is `null` in the DB after rejection (no persistence); `resetPassword.test.js` asserts `resetPasswordToken` is unchanged after rejection. `grep -n "Password must be at least 8 characters" backend/src/resolvers/user.resolver.js` returns zero matches, confirming the message is sourced only from the shared `passwordPolicy` module (no duplicate inline copy). |
| 5 | An HTTP-level (supertest) test harness exists that can exercise Express-layer code the in-process `executeOperation()` helper cannot reach | VERIFIED | `backend/src/server.js` exports `app` (`export { app };`, exactly one match) decoupled from `app.listen()`, which is now gated behind `if (env.nodeEnv !== 'test')` (exactly one match for `env.nodeEnv !== 'test'`). `backend/test/helpers.js` adds `export function httpClient() { return request(app); }`, additive to the pre-existing `graphql()`/`resetTables()`/`createTestUser()` (all three left unmodified). `backend/src/server.cors.test.js` uses `httpClient()` and `supertest` to make real HTTP `POST /graphql` requests through the actual Express CORS middleware — something `executeOperation()` structurally cannot reach. `supertest@^7.2.2` present in `backend/package.json` devDependencies. |
| 6 | Full backend suite is green (54 tests) — 10 pre-existing frontend jest-dom failures are out of scope, not a phase-07 regression | VERIFIED | `npm test --workspace backend` → 13 test files, 54 tests, all passed. `git show <phase-07 commits> --stat` confirms zero frontend files touched by any 07-01/07-02 commit. Additionally, a full monorepo `npm test` run at verification time showed the frontend suite passing 12/12 (0 failures) — better than the "10 failing, pre-existing, out of scope" state logged in `deferred-items.md` at execution time; regardless, this does not affect phase 07's own scope or status since phase 07 touched zero frontend files either way. |

**Score:** 6/6 truths verified (mapped from 9 combined must-haves across both plans' frontmatter + ROADMAP Success Criteria, deduplicated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/config/corsOptions.js` | Pure `corsOriginValidator`/`buildCorsOptions`, unit-testable without HTTP | VERIFIED | Both functions exported; zero HTTP dependency; wired into `server.js`. |
| `backend/src/config/corsOptions.test.js` | Pure-function unit tests, min 15 lines | VERIFIED | 33 lines, 3 tests (no-origin, allowlisted, rejected-with-fixed-message) — all passing. |
| `backend/test/helpers.js` | `httpClient()` supertest wrapper, additive | VERIFIED | `httpClient` exported (1 match); `graphql`/`resetTables`/`createTestUser` unchanged. |
| `backend/src/server.cors.test.js` | HTTP-level integration test proving no origin echo | VERIFIED | Uses `supertest` via `httpClient()`; 2 tests, both passing. |
| `backend/src/server.js` | Importable `app` export, decoupled from `app.listen()` | VERIFIED | `export { app };` present (1 match); `app.listen()` gated on `env.nodeEnv !== 'test'` (1 match). |
| `backend/src/config/assertProductionSecrets.js` | Pure, plain-argument fail-fast assertion | VERIFIED | Exports `assertProductionSecrets({ nodeEnv, jwtSecret })`; single allowlist-of-one condition confirmed by grep. |
| `backend/src/config/assertProductionSecrets.test.js` | Unit tests, all 4 nodeEnv x jwtSecret quadrants, min 15 lines | VERIFIED | 26 lines, 5 tests covering all quadrants — all passing. |
| `backend/src/utils/passwordPolicy.js` | Zero-dependency 8-char minimum validator, min 5 lines | VERIFIED (line-count heuristic below spec, behavior fully correct) | 3 lines (plan's `min_lines: 5` heuristic not met by raw line count), but function is complete, correct, zero-import, throws exact D-01 string, and is fully tested (3 passing tests) and wired into both resolvers. This mirrors the intentionally terse `requireAuth`/`requireAdmin` style in `utils/auth.js` the plan explicitly asked it to follow — treated as a heuristic false-positive, not a stub, given full behavioral verification below. |
| `backend/src/utils/passwordPolicy.test.js` | Pure-function unit tests, min 10 lines | VERIFIED | 16 lines, 3 tests (under-length, exact-8-boundary, long/mixed) — all passing. |
| `backend/src/resolvers/user.resolver.js` | `register`/`resetPassword` both call the password validator before hashing | VERIFIED | Confirmed call sites at lines 27 (register, before DB lookup) and 72 (resetPassword, before `passwordHash` reassignment at line 74). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `backend/src/server.js` | `backend/src/config/corsOptions.js` | `buildCorsOptions(env)` wired into `cors()` middleware | WIRED | `import { buildCorsOptions } from './config/corsOptions.js';` + `app.use(cors(buildCorsOptions(env)));` |
| `backend/test/helpers.js` | `backend/src/server.js` | `app` import for `httpClient()` | WIRED | `import { app } from '../src/server.js';` + `return request(app);` |
| `backend/src/config/env.js` | `backend/src/config/assertProductionSecrets.js` | call at bottom of `env.js` after `env` object built | WIRED | `import { assertProductionSecrets } from './assertProductionSecrets.js';` + call at line 34, after `export const env = {...}`. |
| `backend/src/resolvers/user.resolver.js` | `backend/src/utils/passwordPolicy.js` | import + guard call before hashing in `register`/`resetPassword` | WIRED | `import { assertPasswordStrength } from '../utils/passwordPolicy.js';`; called in both resolvers at the documented insertion points. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Production boot fails with insecure secret | `NODE_ENV=production JWT_SECRET=change-me node -e "import('./backend/src/config/env.js')..."` | Threw `JWT_SECRET must be set to a non-default value in production.`, exit 1 | PASS |
| Production boot succeeds with strong secret | `NODE_ENV=production JWT_SECRET=a-real-strong-secret node -e "import('./backend/src/config/env.js')..."` | No throw, exit 0 | PASS |
| Full backend test suite green | `npm test --workspace backend` | 13 test files, 54 tests, all passed | PASS |
| Full monorepo test suite | `npm test` (root, `--workspaces`) | Backend: 54/54 passed. Frontend: 12/12 passed | PASS |
| Old CORS origin-echo string removed | `grep -n "Origin \${origin} is not allowed" backend/src/server.js` | Zero matches | PASS |
| passwordPolicy zero-dependency constraint | `grep -n "^import" backend/src/utils/passwordPolicy.js` | Zero matches | PASS |
| No duplicate inline password message in resolver | `grep -n "Password must be at least 8 characters" backend/src/resolvers/user.resolver.js` | Zero matches | PASS |
| assertProductionSecrets allowlist-of-one | `grep -n "nodeEnv === 'production'" backend/src/config/assertProductionSecrets.js` | Exactly 1 match | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CORS-01 | 07-01 | Rejected CORS origin logged server-side only, generic error to client | SATISFIED | `corsOptions.js` + `server.cors.test.js` (Truth 1) |
| SECRET-01 | 07-02 | Production boot refuses to start with unset/`change-me` `JWT_SECRET` | SATISFIED | `assertProductionSecrets.js` + manual boot test (Truth 3) |
| SECRET-02 | 07-02 | test/development never crash from the fail-fast | SATISFIED | `env/test.env` weak-secret + full test suite green (Truth 3) |
| PWD-01 | 07-02 | `register` rejects sub-8-char passwords, server-side, before hashing | SATISFIED | `user.resolver.js:27` + `register.test.js` (Truth 4) |
| PWD-02 | 07-02 | `resetPassword` enforces the same minimum | SATISFIED | `user.resolver.js:72` + `resetPassword.test.js` (Truth 4) |

No orphaned requirements — REQUIREMENTS.md traceability table maps exactly these 5 IDs to Phase 7, and both plans' frontmatter `requirements:` fields collectively declare all 5.

### Anti-Patterns Found

None. Scanned all files modified/created by both plans (`backend/src/config/corsOptions.js`, `corsOptions.test.js`, `server.cors.test.js`, `server.js`, `test/helpers.js`, `assertProductionSecrets.js`, `assertProductionSecrets.test.js`, `env.js`, `passwordPolicy.js`, `passwordPolicy.test.js`, `user.resolver.js`, `register.test.js`, `resetPassword.test.js`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented|not available` — zero matches across all files.

All 11 documented commit hashes across both SUMMARY.md files (`6a0f644`, `13f6221`, `c1e1b0e`, `6983baf`, `17b3ef5`, `e91cf3f`, `84c4c09`, `e8effbd`, `79b73d4`, `e4f90ed`, `06760e6`) confirmed present in git history via `git cat-file -e`.

### Human Verification Required

None. Every must-have was verifiable programmatically (grep, direct source read, and live test execution), including the manual production-boot smoke test.

### Gaps Summary

No gaps. All observable truths, artifacts, and key links verified against the actual codebase (not SUMMARY.md claims). The one minor deviation — `backend/src/utils/passwordPolicy.js` being 3 lines against a `min_lines: 5` heuristic in the plan's frontmatter — is a heuristic false-positive: the function is complete, zero-dependency (per D-03), throws the exact required message, is fully unit-tested, and is correctly wired into both `register` and `resetPassword` before persistence. It intentionally mirrors the equally terse `requireAuth`/`requireAdmin` pattern in `backend/src/utils/auth.js` that the plan explicitly instructed it to follow. This does not block phase goal achievement.

One informational note: `07-01-SUMMARY.md` and its `deferred-items.md` documented 10 failing frontend tests (jest-dom matcher issue) as pre-existing/out-of-scope at execution time. At verification time, the full frontend suite passes 12/12 with zero failures — this is a positive discrepancy (not a regression) and does not affect phase 07's scope, since phase 07's commits touched zero frontend files either way.

---

*Verified: 2026-07-12T23:15:00Z*
*Verifier: Claude (gsd-verifier)*
