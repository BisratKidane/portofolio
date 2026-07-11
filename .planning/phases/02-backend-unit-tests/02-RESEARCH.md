# Phase 2: Backend Unit Tests - Research

**Researched:** 2026-07-12
**Domain:** Vitest unit testing of Sequelize model hooks and JWT/auth utility functions (Node.js/ESM backend)
**Confidence:** HIGH

## Summary

This phase adds two co-located spec files (`backend/src/utils/auth.test.js`, `backend/src/models/User.test.js`) on top of the already-working Phase 1 Vitest harness. No new packages, no new tooling, no runtime code changes. The single open technical question from CONTEXT.md — whether Sequelize 6's `beforeCreate` password-hashing hook can be exercised without a live DB — is **resolved definitively and empirically** in this research: it can. `User.build({...})` followed by `await User.runHooks('beforeCreate', user)` runs the *exact* registered hook function (the same one `save()`/`create()` invoke internally) against an unsaved, in-memory instance. This was proven by writing a throwaway spec, running it against the real project dependencies (`sequelize@6.37.8`, `bcryptjs@2.4.3`), observing it pass, then deleting it — not by reasoning from training data alone.

The JWT negative-case tricks specified in CONTEXT.md (D-03) were verified the same way: `expiresIn: '-1s'` produces an immediately-expired token (confirmed via `jsonwebtoken@9.0.3`/`ms` source and empirical test), and both signature-corruption and wrong-secret signing are rejected by `jwt.verify`. `getUserFromRequest`'s exact mock-stub shape (`{ User: { findByPk: fn } }`, called with a single `id` argument, no options object) was also confirmed by direct source read and empirical test.

**Primary recommendation:** Write `backend/src/utils/auth.test.js` and `backend/src/models/User.test.js` using plain Vitest (`describe`/`it`/`expect`, matching `backend/test/guard.test.js`'s existing style), stub `models.User.findByPk` as a hand-rolled object (not `vi.fn()`, though either works — see Code Examples), and resolve D-05 via `User.runHooks('beforeCreate', builtInstance)` — no DB connection needed for any spec in this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JWT sign/verify unit tests | API / Backend (utils) | — | `signToken`/`getUserFromRequest` are pure backend utility functions; no client or DB tier involved when `models` is stubbed |
| Password hashing hook unit test | Database / Storage (model layer) | API / Backend | The `beforeCreate` hook is defined on the Sequelize `User` model but is invoked here via `runHooks` on an unsaved instance — no actual Database/Storage tier is touched, only the model-layer *logic* |
| Role guard unit tests | API / Backend (utils) | — | `requireAuth`/`requireAdmin` operate on plain-object user stubs; no persistence or transport layer involved |
| Reset-token utility unit tests | API / Backend (utils) | — | `createResetToken`/`resetTokenExpiry` are pure functions (crypto + Date math), no I/O |

All four capabilities are backend-tier-only and none require a live database connection to test correctly (see D-05 resolution below). This confirms the CONTEXT.md D-08 "pure in-memory, no DB" posture is achievable for 100% of this phase's scope, including the one item (D-05) that was flagged as a possible exception.

## Standard Stack

### Core (already installed — no new packages this phase)
| Library | Installed Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.10 | Test runner (Phase 1 harness) | `[VERIFIED: local node_modules]` — confirmed via `backend/node_modules` (hoisted to workspace root) `package.json` |
| jsonwebtoken | 9.0.3 | JWT sign/verify — code under test | `[VERIFIED: local node_modules]` |
| bcryptjs | 2.4.3 | Password hashing — code under test | `[VERIFIED: local node_modules]` |
| sequelize | 6.37.8 | ORM, hook mechanism — code under test | `[VERIFIED: local node_modules]` |

**Installation:** None required. `npm test --workspace backend` (already wired in `backend/package.json`) was run during this research and passed (3 files / 6 tests) before any Phase 2 specs were added — confirming the harness is healthy and ready to consume.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (Node built-in) | Node 24.15.0 runtime | Verifying `createResetToken`'s hex output shape in assertions if desired | Optional — plain string/regex assertions on the returned value are sufficient; no need to re-derive via `crypto` in the test |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `User.runHooks('beforeCreate', instance)` for D-05 | `createTestUser()` / `User.create()` against the live test DB (Phase 1 fallback) | Works, but adds a live-DB dependency and `async` teardown/reset concerns to an otherwise pure-unit spec file, contradicting D-08's "no DB" preference. Only fall back to this if `runHooks` behavior is later found to diverge from `save()` semantics (it does not — see below) |
| Reaching into `User.options.hooks.beforeCreate[0](instance)` directly | `User.runHooks('beforeCreate', instance)` | Both work (same underlying array), but `runHooks` is the same method `save()`/`create()` call internally (`this.constructor.runHooks(...)` in `model.js`), so it exercises identical call semantics (multiple registered hooks, `this` binding, async iteration) rather than assuming array shape/ordering |
| `vi.fn()` for the `models.User` stub | Hand-rolled plain object with a function property | CONTEXT.md D-08/discretion leaves this open; both are equivalent for this use case since no call-count/args assertions beyond the single test are needed. `vi.fn()` gives free assertion helpers (`toHaveBeenCalledWith`) if the planner wants to assert exact `findByPk` call args |

## Package Legitimacy Audit

**Not applicable this phase.** No new packages are installed. All libraries exercised (`vitest`, `jsonwebtoken`, `bcryptjs`, `sequelize`) are pre-existing Phase 1/0 dependencies already present in `backend/node_modules` and `backend/package.json`. Versions were confirmed by reading the installed `package.json` files directly (`[VERIFIED: local node_modules]`), not by registry lookup or training data.

## Architecture Patterns

### System Architecture Diagram

```
Spec file (Vitest, ESM import)
        │
        ├── Path A: JWT utilities ─────────────────────────────────────
        │   auth.test.js
        │     → import { signToken, getUserFromRequest, requireAuth, requireAdmin,
        │                 createResetToken, resetTokenExpiry } from '../utils/auth.js'
        │     → signToken(userLike)              → real jsonwebtoken.sign()
        │     → getUserFromRequest(fakeReq, stubModels)
        │         fakeReq = { headers: { authorization: 'Bearer <token>' } }
        │         stubModels = { User: { findByPk: fn(id) => ... } }  ← NO real DB
        │         → jwt.verify() (real) → stubModels.User.findByPk(payload.sub) (fake)
        │     → requireAuth(userStub) / requireAdmin(userStub)  ← plain objects, no model
        │
        └── Path B: Password hashing hook ─────────────────────────────
            User.test.js
              → import { models } from '../models/index.js'  (User class, not instance)
              → User.build({ passwordHash: 'plain', ... })     ← in-memory only, NOT hashed yet
              → await User.runHooks('beforeCreate', builtInstance)
                    (same static method `save()`/`create()` call internally)
              → assert builtInstance.passwordHash !== 'plain'
              → assert bcrypt.compare('plain', builtInstance.passwordHash) === true
              → builtInstance.isNewRecord === true  ← proves nothing was persisted
              → separately: User.build({ passwordHash: knownBcryptHash }).validatePassword(pw)
                    ← instance method, no hook needed, no DB
```

Neither path opens a database connection or an HTTP server. `backend/test/globalSetup.js` still runs once for the whole `vitest run` invocation (see Pitfall 2), but no Phase 2 spec *calls* into the DB helpers (`resetTables`/`createTestUser`) or the live `sequelize` instance.

### Recommended Project Structure
```
backend/src/
├── utils/
│   ├── auth.js
│   └── auth.test.js       # NEW — BE-01, BE-03, D-07 reset-token utils
└── models/
    ├── User.js
    └── User.test.js       # NEW — BE-02
```
Matches the existing co-located convention (`backend/test/guard.test.js` next to `backend/test/guard.js`) and Phase 1 D-06.

### Pattern 1: Stubbed-dependency unit test (JWT verify path)
**What:** Exercise `getUserFromRequest` end-to-end (header parsing → real `jwt.verify` → DB lookup) while replacing only the DB lookup with a stub.
**When to use:** BE-01 — the function's only external dependency is the `models` object passed as a parameter, making this a clean seam for stubbing without a mocking library.
**Example (verified by running this exact code against the installed dependencies, then deleting the file):**
```javascript
// Source: verified empirically in this repo, 2026-07-12 — sequelize@6.37.8, jsonwebtoken@9.0.3
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { signToken, getUserFromRequest } from './auth.js';

it('resolves the user via models.User.findByPk for a valid token', async () => {
  const token = signToken({ id: 42, role: 'ADMIN' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let calledWith;
  const stubModels = { User: { findByPk: (id) => { calledWith = id; return { id, role: 'ADMIN' }; } } };

  const result = await getUserFromRequest(req, stubModels);

  expect(calledWith).toBe(42);           // payload.sub decoded correctly
  expect(result).toEqual({ id: 42, role: 'ADMIN' });
});

it('returns null (never throws) for an expired token — findByPk is never reached', async () => {
  const expired = jwt.sign({ sub: 1, role: 'USER' }, env.jwtSecret, { expiresIn: '-1s' });
  const req = { headers: { authorization: `Bearer ${expired}` } };
  const stubModels = { User: { findByPk: () => { throw new Error('should not be called'); } } };

  const result = await getUserFromRequest(req, stubModels);

  expect(result).toBeNull();
});
```
Both assertions passed when actually executed in this repo.

### Pattern 2: In-memory Sequelize hook invocation (no DB)
**What:** Run a registered Sequelize model hook directly, without `save()`/`create()`, using the same internal mechanism those methods use.
**When to use:** BE-02 / D-05 — proving the `beforeCreate` password-hashing hook actually executes, without opening a DB connection.
**Example (empirically verified in this repo):**
```javascript
// Source: verified empirically in this repo, 2026-07-12 — sequelize@6.37.8
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from '../models/index.js';

const { User } = models;

it('hashes passwordHash via the real beforeCreate hook, without persisting', async () => {
  const plain = 'Password123!';
  const user = User.build({ name: 'Test', email: 'test@example.com', passwordHash: plain, role: 'USER' });

  expect(user.passwordHash).toBe(plain); // build() alone does NOT hash — confirms D-05's premise

  await User.runHooks('beforeCreate', user);

  expect(user.passwordHash).not.toBe(plain);
  expect(await bcrypt.compare(plain, user.passwordHash)).toBe(true);
  expect(user.isNewRecord).toBe(true); // never saved to a DB
});
```
This passed when actually run. **Why `runHooks` is safe to rely on:** `node_modules/sequelize/lib/model.js` shows the instance method that `save()` calls for creation internally does `await this.constructor.runHooks(\`before${hook}\`, this, options)` (model.js:2436) — i.e., `save()`/`create()` call `runHooks('beforeCreate', ...)` on the model constructor exactly the way this test does directly. `runHooks` is mixed onto `Model` (and therefore `User`) via `Hooks.applyTo(Model, true)` (model.js:2743) using Sequelize's `hooks.js` mixin — it is not part of the public TypeScript type definitions (no `.d.ts` entry found), so treat it as an internal-but-stable mechanism tied to this exact hook-registration pattern (`hooks: { beforeCreate(user) {...} }` passed to `User.init()`), not as documented public API. `[VERIFIED: sequelize 6.37.8 source, node_modules/sequelize/lib/hooks.js and model.js]`

### Pattern 3: Plain-object guard tests (no model, no stub library)
**What:** Test `requireAuth`/`requireAdmin` with bare `{ role: '...' }` objects.
**When to use:** BE-03 — these functions only read `user.role`, no model behavior needed.
```javascript
// Source: pattern consistent with backend/test/guard.test.js's existing style
import { describe, it, expect } from 'vitest';
import { requireAuth, requireAdmin } from './auth.js';

describe('requireAdmin', () => {
  it('passes for ADMIN', () => expect(() => requireAdmin({ role: 'ADMIN' })).not.toThrow());
  it('throws for USER', () => expect(() => requireAdmin({ role: 'USER' })).toThrow());
  it('throws for null (via requireAuth)', () => expect(() => requireAdmin(null)).toThrow());
});
```

### Anti-Patterns to Avoid
- **Reaching into `User.options.hooks.beforeCreate[0](...)` directly:** Works today but relies on internal array shape/ordering rather than the sanctioned `runHooks` entry point that `save()` itself uses. Prefer `runHooks`.
- **Using `User.build()` alone and asserting the hash without calling `runHooks`:** This is the exact mistake D-05 warns about — `build()` never fires `beforeCreate`. The empirical test above proves `user.passwordHash` is still plaintext immediately after `build()`.
- **Mutating `process.env.JWT_SECRET` mid-test to test a "wrong secret" scenario:** `backend/src/config/env.js` reads `process.env` once at module-load time (top-level `dotenv.config()` call) and caches the result in the exported `env` object; mutating `process.env` afterward has no effect. If a test needs a different secret, sign directly with a literal different string (`jwt.sign(payload, 'a-different-secret')`) rather than trying to change `env.jwtSecret` via `process.env`. (`backend/test/guard.test.js` demonstrates the correct pattern for tests that DO need to vary env-derived config: mutate `env.nodeEnv`/`env.database.name` directly, then restore in `afterEach`.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying a JWT's claims in a test | A custom base64/JSON decoder for the token | `jwt.verify(token, secret)` / `jwt.decode(token)` (already a dependency) | Handles signature validation, expiry, and claim parsing correctly; hand-rolled decoding wouldn't validate the signature at all |
| Simulating "hashed password" for `validatePassword` tests | A fake/stub hash string | A real `bcrypt.hashSync(plain, 12)` (or `await bcrypt.hash`) value set directly on a built instance | `validatePassword` calls real `bcrypt.compare` — feeding it a non-bcrypt string would make the test meaningless or throw |
| Mocking the whole `models` object with a mocking framework | `jest.mock`/`vi.mock` module-level auto-mocks | A plain hand-rolled object `{ User: { findByPk: (id) => ... } }` passed as the second argument | `getUserFromRequest(req, models)` already takes `models` as a plain parameter — no module-mocking machinery needed for this seam |

**Key insight:** Every function in scope for this phase (`signToken`, `getUserFromRequest`, `requireAuth`, `requireAdmin`, `createResetToken`, `resetTokenExpiry`, `validatePassword`, and the `beforeCreate` hook via `runHooks`) can be exercised with plain Vitest + plain JS objects. No mocking library (`vi.mock`, `sinon`, `proxyquire`) is needed anywhere in this phase.

## Common Pitfalls

### Pitfall 1: `User.build()` does not hash the password
**What goes wrong:** Asserting `passwordHash !== plaintext` immediately after `User.build({ passwordHash: plain, ... })` without calling `runHooks` — the assertion fails because `beforeCreate` never ran.
**Why it happens:** Sequelize only fires `beforeCreate`/`beforeUpdate` from `save()`, `create()`, `bulkCreate()`, and `upsert()` — never from `build()`.
**How to avoid:** Explicitly call `await User.runHooks('beforeCreate', builtInstance)` between `build()` and the assertion (Pattern 2 above).
**Warning signs:** Test asserts on `user.passwordHash` right after `build()` with no intervening hook call or `save()`.

### Pitfall 2: `globalSetup` still runs for a "pure unit, no DB" spec file
**What goes wrong:** Assuming a spec file with zero DB code means `npm test` won't touch MySQL. In reality `backend/vitest.config.js` declares `globalSetup: ['./test/globalSetup.js']` for the *whole run*, not per-file — so `npm test --workspace backend` still calls `assertTestDatabase()`, `sequelize.authenticate()`, `sync({force:true})`, and later `drop()`/`close()`, even if every spec that ran was a pure unit test.
**Why it happens:** Vitest's `globalSetup` is a run-level hook, not a per-file hook.
**How to avoid:** Not something Phase 2 needs to fix (Phase 1's architecture, working as designed) — just don't be surprised that `npm test` still requires a reachable test MySQL instance even when running only Phase 2's new files. If a developer wants to run *only* `auth.test.js`/`User.test.js` in true isolation (e.g., `npx vitest run src/utils/auth.test.js`), the same `vitest.config.js` (and therefore `globalSetup`) still applies unless a separate config is used.
**Warning signs:** CI or local run fails with a DB-connection error even though the failing/target spec file never imports `sequelize` directly.

### Pitfall 3: The `models.User.findByPk` stub must match the real call shape exactly
**What goes wrong:** Stubbing `findByPk` to expect `(id, options)` (Sequelize's real signature supports a second `options` argument) when the actual call site never passes one.
**Why it happens:** `backend/src/utils/auth.js:16` calls `models.User.findByPk(payload.sub)` — single argument only.
**How to avoid:** Stub as `findByPk: (id) => ...` (or `vi.fn()`, asserted with `toHaveBeenCalledWith(42)`, one arg) — confirmed via source read and empirical test above.
**Warning signs:** Stub function destructures a second parameter that's always `undefined`, or an assertion on call args expects 2 arguments and fails.

### Pitfall 4: `env.jwtSecret`/`env.resetTokenExpiresMinutes` are read once, at module import time
**What goes wrong:** Trying to vary `JWT_SECRET`/`RESET_TOKEN_EXPIRES_MINUTES` per-test by setting `process.env.X = ...` inside a test body, expecting `env.jwtSecret` to reflect the new value.
**Why it happens:** `backend/src/config/env.js` runs `dotenv.config(...)` and builds the exported `env` object once, the first time the module is imported (ESM modules are singletons — subsequent imports return the cached module).
**How to avoid:** For BE-01's tests, this doesn't matter — CONTEXT.md D-03's "wrong secret" trick signs with a literal different string, not via `env`. If a future test does need to vary `env.jwtSecret`/`env.resetTokenExpiresMinutes`, mutate the exported `env` object's property directly (as `backend/test/guard.test.js` already does for `env.nodeEnv`/`env.database.name`) and restore it in `afterEach`.
**Warning signs:** A test sets `process.env.JWT_SECRET = '...'` at runtime and the code under test doesn't observe the change.

## Code Examples

All examples below were written as throwaway spec files, executed against this repo's real installed dependencies via `npm test --workspace backend`, observed passing, then deleted — not sourced from documentation or training data alone.

### Deterministic expired-token construction
```javascript
// Source: verified empirically in this repo, 2026-07-12
import jwt from 'jsonwebtoken';
const token = jwt.sign({ sub: 1, role: 'USER' }, secret, { expiresIn: '-1s' });
// jsonwebtoken's timespan() helper computes payload.exp = now + ms('-1s')/1000 = now - 1
// verify.js's expiry check is `if (clockTimestamp >= payload.exp + clockTolerance)` — true immediately.
expect(() => jwt.verify(token, secret)).toThrow(jwt.TokenExpiredError);
```
`[VERIFIED: jsonwebtoken 9.0.3 source (lib/timespan.js, verify.js) + node_modules/ms/index.js regex `^(-?...)` confirms negative durations parse correctly, and by empirical test run]`

### Tampered-signature construction
```javascript
// Source: verified empirically in this repo, 2026-07-12
const parts = token.split('.');
const lastChar = parts[2].slice(-1);
parts[2] = parts[2].slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
const tampered = parts.join('.');
expect(() => jwt.verify(tampered, secret)).toThrow(jwt.JsonWebTokenError);
```

### 64-hex-char reset token + future expiry (code-grounded, no empirical test needed — pure functions read directly)
```javascript
// backend/src/utils/auth.js:31-37 — confirmed by direct source read
export function createResetToken() {
  return crypto.randomBytes(32).toString('hex'); // 32 bytes → 64 hex characters
}
export function resetTokenExpiry() {
  return new Date(Date.now() + env.resetTokenExpiresMinutes * 60 * 1000); // future Date
}
```
Assertions: `expect(createResetToken()).toMatch(/^[0-9a-f]{64}$/)`; call twice and assert inequality for uniqueness (cryptographically random, collision probability negligible); `expect(resetTokenExpiry().getTime()).toBeGreaterThan(Date.now())` and roughly `Date.now() + env.resetTokenExpiresMinutes * 60000` (within a small tolerance for test execution time).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A | N/A | — | This phase adds tests to existing, unchanged runtime code — there is no "old vs. new" approach to compare; the code under test (`auth.js`, `User.js`) is not being modified. |

**Deprecated/outdated:** None relevant — `jsonwebtoken@9.0.3`, `bcryptjs@2.4.3`, `sequelize@6.37.8`, and `vitest@4.1.10` are all current, actively maintained major versions already pinned in this repo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none) | — | Every load-bearing claim in this research (D-05 hook resolution, JWT negative-case tricks, mock stub shape, env module-load timing) was verified either by direct inspection of the exact installed source in `node_modules`, or by writing and running a throwaway spec against the real dependencies in this repo, then deleting it. No claim in this document is tagged `[ASSUMED]`. |

**This table is empty by design** — all claims were verified or cited, not assumed. No user confirmation is needed before planning.

## Open Questions

None remaining. The single open question flagged in CONTEXT.md (D-05's DB boundary) is resolved: use `User.runHooks('beforeCreate', builtInstance)` on a `User.build(...)` instance — no DB connection required for any spec in this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running Vitest | ✓ | v24.15.0 | — |
| npm | `npm test --workspace backend` | ✓ | 11.12.1 | — |
| MySQL/MariaDB (port 3306) | `globalSetup.js` (run-level, applies even to pure-unit specs — see Pitfall 2) | ✓ | MariaDB 10.5.29 (via Homebrew) | — |
| vitest / jsonwebtoken / bcryptjs / sequelize | Code and tests | ✓ | 4.1.10 / 9.0.3 / 2.4.3 / 6.37.8 | — |

**Missing dependencies with no fallback:** None — full backend test suite (`npm test --workspace backend`) was run during this research and passed (3 files / 6 tests) before this phase's specs were added, confirming a fully working environment.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 |
| Config file | `backend/vitest.config.js` (sets `ENV_FILE`/`NODE_ENV`, `pool: 'forks'`, `fileParallelism: false`, `globalSetup: ['./test/globalSetup.js']`) |
| Quick run command | `npx vitest run src/utils/auth.test.js src/models/User.test.js` (run from `backend/`) — still triggers `globalSetup` (Pitfall 2), so a reachable test MySQL instance is required even for this "quick" run |
| Full suite command | `npm test --workspace backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-01 | `signToken` produces a verifiable JWT with expected `sub`/`role` claims | unit | `npx vitest run src/utils/auth.test.js -t signToken` | ❌ Wave 0 |
| BE-01 | `getUserFromRequest` accepts a valid token (round-trip via stubbed `models.User.findByPk`) | unit | `npx vitest run src/utils/auth.test.js -t getUserFromRequest` | ❌ Wave 0 |
| BE-01 | `getUserFromRequest` returns `null` for expired token (`expiresIn: '-1s'`) | unit | `npx vitest run src/utils/auth.test.js -t expired` | ❌ Wave 0 |
| BE-01 | `getUserFromRequest` returns `null` for tampered token (signature corruption or wrong secret) | unit | `npx vitest run src/utils/auth.test.js -t tampered` | ❌ Wave 0 |
| BE-02 | `validatePassword` accepts correct password, rejects incorrect, against a known bcrypt hash on a built (unsaved) instance | unit | `npx vitest run src/models/User.test.js -t validatePassword` | ❌ Wave 0 |
| BE-02 | `beforeCreate` hook hashes `passwordHash` (never plaintext) via `User.runHooks('beforeCreate', builtInstance)` | unit | `npx vitest run src/models/User.test.js -t beforeCreate` | ❌ Wave 0 |
| BE-03 | `requireAuth`/`requireAdmin` matrix (ADMIN passes, USER throws, null throws) | unit | `npx vitest run src/utils/auth.test.js -t require` | ❌ Wave 0 |
| (D-07, opportunistic) | `createResetToken` 64-hex + uniqueness; `resetTokenExpiry` future Date | unit | `npx vitest run src/utils/auth.test.js -t reset` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <the specific new spec file>` (from `backend/`)
- **Per wave merge:** `npm test --workspace backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/utils/auth.test.js` — covers BE-01, BE-03, D-07 (does not exist yet — this phase's own deliverable, not a pre-existing infrastructure gap)
- [ ] `backend/src/models/User.test.js` — covers BE-02 (does not exist yet — same as above)
- Framework install: none — Vitest, jsonwebtoken, bcryptjs, sequelize are already installed and proven working (Phase 1)

*No shared fixtures or additional framework config are needed; `backend/test/helpers.js`/`globalSetup.js` remain available but are not required by any Phase 2 spec per the D-05 resolution above.*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | JWT-based session token (`jsonwebtoken`) — this phase locks in test coverage for sign/verify/expiry/tamper-rejection behavior, does not change the mechanism |
| V3 Session Management | no | No server-side session state exists (stateless JWT); out of scope |
| V4 Access Control | yes | Role guards `requireAuth`/`requireAdmin` — this phase adds the allow/deny matrix tests (BE-03) |
| V5 Input Validation | no | No new input-handling code in this phase (resolver-level validation is Phase 3, BE-04/05) |
| V6 Cryptography | yes | Password hashing via `bcryptjs` (cost factor 12, already implemented) — this phase asserts hashing actually occurs and is never bypassed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JWT signature tampering / forged claims | Tampering, Spoofing | `jwt.verify` with a server-held secret (already implemented); this phase's tests assert tampered/wrong-secret tokens are rejected (D-03) |
| Expired token reuse | Tampering | `jwt.verify`'s built-in `exp` check (already implemented); this phase's tests assert `expiresIn: '-1s'` tokens are rejected immediately, without fake timers |
| Plaintext password storage | Information Disclosure | `beforeCreate`/`beforeUpdate` bcrypt hashing hooks (already implemented); this phase's tests assert `passwordHash !== plaintext` after the hook runs, via `runHooks` (D-05) |
| Privilege escalation via missing role check | Elevation of Privilege | `requireAdmin` throwing for non-ADMIN roles (already implemented); this phase's tests assert the full ADMIN/USER/null matrix (BE-03) |

**Note:** This phase does not add or change any security control — it adds unit-test coverage locking in the *existing* behavior of controls already implemented in `backend/src/utils/auth.js` and `backend/src/models/User.js`. Known security bugs in the surrounding resolver flow (reset-token exposure in the GraphQL response, insecure `JWT_SECRET` fallback default `'change-me'` in `env.js`) are explicitly out of scope for this phase per CONTEXT.md — they are Phase 3 / DOCS-01 concerns, not fixed or asserted-as-bugs here.

## Sources

### Primary (HIGH confidence — direct source inspection and empirical execution in this repo)
- `/Users/bisrat/Projects/portofolio/node_modules/sequelize/lib/hooks.js` — `runHooks`, `addHook`, `_setupHooks`, `applyTo` mixin mechanics (sequelize 6.37.8)
- `/Users/bisrat/Projects/portofolio/node_modules/sequelize/lib/model.js` (lines 660-703 `static init`, line 2436 `this.constructor.runHooks`, line 2743 `Hooks.applyTo(Model, true)`) — confirms `save()` uses the exact same `runHooks` call this research recommends calling directly
- `/Users/bisrat/Projects/portofolio/node_modules/jsonwebtoken/sign.js`, `lib/timespan.js`, `verify.js` (jsonwebtoken 9.0.3) — `expiresIn` string parsing and expiry check logic
- `/Users/bisrat/Projects/portofolio/node_modules/ms/index.js` — confirms negative duration strings (`'-1s'`) parse correctly via regex
- Empirical test runs (`npm test --workspace backend`) executed 3 times during this research: baseline (3 files/6 tests passing), with a scratch `runHooks` verification spec (4 files/7 tests passing), and with a scratch JWT negative-case verification spec (4 files/10 tests passing) — all scratch files were deleted after confirming results, per the "no report files" constraint on this research task
- `backend/src/utils/auth.js`, `backend/src/models/User.js`, `backend/src/config/env.js`, `backend/vitest.config.js`, `backend/test/{helpers,globalSetup,guard,guard.test}.js`, `env/test.env` — all read directly

### Secondary (MEDIUM confidence)
- None needed — every claim was resolvable via direct source inspection or empirical execution in this repo.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read directly from installed `package.json` files, no new packages
- Architecture/D-05 resolution: HIGH — proven by executing real code against the real installed dependency, not by reasoning alone
- Pitfalls: HIGH — Pitfalls 1 and 2 confirmed empirically/by direct config read; Pitfalls 3 and 4 confirmed by direct source read

**Research date:** 2026-07-12
**Valid until:** Valid as long as `backend/package.json`'s pinned dependency versions (sequelize ^6.37.5, jsonwebtoken ^9.0.2, bcryptjs ^2.4.3, vitest ^4.1.10) remain unchanged — re-verify the `runHooks` mechanism if Sequelize is ever upgraded to a new major version (7.x), since it is an internal (non-`.d.ts`-documented) API.
