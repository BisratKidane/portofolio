# Phase 9: Session Revocation via passwordChangedAt - Research

**Researched:** 2026-07-20
**Domain:** JWT session revocation (stateless, timestamp-comparison based) + hash-at-rest secret storage, on an Express/Apollo/Sequelize/MySQL stack
**Confidence:** HIGH — every code-shape recommendation below is verified against the actual files in this repo (not a hypothetical stack) plus official docs for the two behaviors that are not obvious from reading the code (JWT `iat` semantics, MySQL fractional-second rounding).

## Summary

This phase is small in surface area (one nullable column, one hook branch, one comparison in `getUserFromRequest`, one hash function reused across two resolvers) but has three non-obvious correctness traps that are easy to get wrong on the first pass, and this research exists specifically to close them before planning:

1. **The existing GraphQL test helper (`graphql()` in `test/helpers.js`) bypasses `getUserFromRequest` entirely** — it injects `user` directly via Apollo's `contextValue`, never building a `req` object or calling the real context function. A plan that tries to prove SC-3 (the mandatory same-second boundary test) using `graphql()` alone will pass even if the revocation check is deleted, because the check under test is never executed. The correct, already-established pattern for testing `getUserFromRequest` is the direct unit test in `backend/src/utils/auth.test.js` (mocked `req` + mocked `models.User.findByPk`) — this is fast, deterministic, and exactly matches how the phase's own root-cause note describes the bug.

2. **`jsonwebtoken`'s `iat` is deterministic and mockable without fake timers.** `jwt.sign()` accepts an explicit `iat` in the payload, which overrides the automatic `Math.floor(Date.now()/1000)` insertion `[VERIFIED: npm jsonwebtoken README]`. This means the same-second boundary test does not need `vi.useFakeTimers()`/`vi.setSystemTime()` at all for the unit-level test — construct the token with a literal `iat` value and assert directly. Fake-timer control is only needed for an optional end-to-end (HTTP) version of the same test.

3. **MySQL silently rounds (not truncates) fractional seconds when inserting into a column with fewer fractional digits than the JS `Date` provides** `[VERIFIED: MySQL 8.4 Reference Manual §13.2.6]`. If `passwordChangedAt` is declared as plain `DataTypes.DATE` (MySQL `DATETIME`, 0 fractional digits), a value like `12:00:00.900` can be **rounded up** to `12:00:01.000` on write. Since `getUserFromRequest` reads this value back fresh from the DB on every request (`findByPk`), a rounded-up `passwordChangedAt` can retroactively revoke a token that was legitimately issued in the same wall-clock second, directly violating D-01. The fix is to declare the column with fractional-second precision (`DataTypes.DATE(3)`) so the DB never rounds it, and to do the seconds-flooring only in the JS comparison (as D-01 already specifies) — not rely on DB-level truncation.

RESET-06 (fold-in) needs no schema change at all: it reuses the existing `resetPasswordToken` STRING column (already sized for a 64-char hex value, whether raw or `sha256` digest — both are 64 hex chars). Only SESS-01's new `passwordChangedAt` column requires the manual `ALTER TABLE` + boot-verify step.

**Primary recommendation:** Add `passwordChangedAt` as `DataTypes.DATE(3)` (nullable, no default), stamp it inside the existing `changed('passwordHash')` guard in `User.beforeUpdate`, add a floor-to-seconds null-safe comparison in `getUserFromRequest` right after `findByPk`, hash reset tokens with `crypto.createHash('sha256')` (already imported in `auth.js`) across both `requestPasswordReset` and `resetPassword`, and prove SC-3 with a direct unit test of `getUserFromRequest` using an explicit `iat` payload override — not through the `graphql()` helper.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | `User` model gains a `passwordChangedAt` timestamp column | Column type/precision resolved (`DATE(3)`), manual `ALTER TABLE` statement provided, D-03/D-04 manual-migration pattern confirmed against current `models/index.js` sync behavior |
| SESS-02 | `resetPassword` sets `passwordChangedAt = now()` when the password actually changes | Confirmed the existing `beforeUpdate` hook (guarded on `changed('passwordHash')`) is the correct and only place to stamp it — `resetPassword`'s `user.save()` already triggers this hook (proven today by the existing bcrypt-rehash behavior in the same branch) |
| SESS-03 | A JWT whose `iat` predates `passwordChangedAt` is treated as unauthenticated, second-vs-ms precision handled, same-second boundary test mandatory | Exact comparison code shape provided; MySQL rounding pitfall identified and mitigated; test-harness bypass identified; deterministic `iat`-override test pattern provided |
| RESET-06 | Reset tokens hashed at rest (`sha256`), raw token emailed, `resetPassword` looks up by hash | Confirmed no schema change needed (reuses `resetPasswordToken` column); exact code diff for both resolvers provided; existing test-seed data (`createTestUser({ resetPasswordToken: 'plaintext...' })`) identified as needing updates to store the hash while submitting the raw string as the mutation argument |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `passwordChangedAt` persistence | Database / Storage | API / Backend (Sequelize model) | Column lives in `users` table; Sequelize model owns the shape, hook owns *when* it's written |
| Password-change stamping | API / Backend | — | Belongs in the `User` model hook (data-layer invariant: this must be true regardless of which resolver changes the password), not resolver-level logic — keeps `resetPassword` (and any future admin password-change path) automatically correct |
| JWT revocation check | API / Backend | — | `getUserFromRequest` runs once per request in the Apollo `context` function (`server.js`); this is the single per-request auth gate — no separate middleware/tier exists in this codebase and none should be introduced |
| Reset-token hashing | API / Backend | Database / Storage | Hashing happens in resolver code (`auth.js` helper); only the digest reaches storage — this is a data-protection concern owned by the backend, not the DB (no application-level encryption-at-rest exists elsewhere in this schema) |
| Manual DB migration (ALTER TABLE) | Database / Storage | — | Sequelize's `sync()` (ORM tier) intentionally does not own schema alteration for existing tables in this project (D-03/D-04) — the DB tier is modified out-of-band by a documented manual step |

## Standard Stack

No new runtime dependencies are required for this phase. Every primitive needed is already installed and imported in the codebase.

### Core (already present — no install needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `jsonwebtoken` | 9.0.3 (confirmed installed) `[VERIFIED: package-lock via npm ls]` | JWT sign/verify, `iat` claim | Already the project's sole JWT library (`backend/src/utils/auth.js`) |
| `sequelize` | 6.37.8 (confirmed installed) `[VERIFIED: npm ls]` | ORM, model hooks, `DataTypes.DATE(n)` | Already the project's sole ORM |
| `mysql2` | 3.11.x (per `backend/package.json`) | MySQL driver | Already wired via Sequelize's `mysql` dialect |
| Node built-in `node:crypto` | Node 24.x runtime (per `backend/package.json` engines) | `crypto.createHash('sha256')` for RESET-06 | Already imported in `auth.js` for `createResetToken()`'s `randomBytes` call — zero new imports needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual seconds-floor comparison in `getUserFromRequest` | `tokenVersion` integer column + JWT claim (raised in 08-REVIEW.md WR-06 as a general suggestion) | Rejected by CONTEXT.md/ROADMAP — `passwordChangedAt` is the locked mechanism; `tokenVersion` is a different (also valid) design but out of scope this phase |
| `sha256` (no work factor) for reset-token hashing | `bcrypt`/`argon2` (like the password itself) | Rejected implicitly by D-06/08-REVIEW.md WR-08's own fix suggestion: the token has 256 bits of CSPRNG entropy (`crypto.randomBytes(32)`), so it is not brute-forceable even undigested by a slow hash — a fast digest is the correct tool here, unlike a human-chosen password |
| Manual `ALTER TABLE` | `sequelize.sync({ alter: true })` | Explicitly rejected in CONTEXT.md D-04 as risky against real data (table reorder/rebuild) |
| Manual `ALTER TABLE` | A migration framework (umzug/sequelize-cli) | Explicitly deferred to v2 in CONTEXT.md/STATE.md deferred-items list |

**Installation:** None. No `npm install` step for this phase.

**Version verification:**
```bash
npm ls jsonwebtoken sequelize --workspace backend
# jsonwebtoken@9.0.3, sequelize@6.37.8 — both already in package-lock.json, confirmed installed
```

## Package Legitimacy Audit

**Not applicable — this phase installs zero new packages.** All primitives (`crypto.createHash`, `jsonwebtoken`, `sequelize` `DataTypes.DATE(n)`) are Node built-ins or already-installed dependencies used elsewhere in the codebase. The Package Legitimacy Gate protocol (slopcheck, registry verification) is skipped per its own scope condition ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────┐
                     │  resetPassword(token, password) mutation │
                     └───────────────────┬───────────────────────┘
                                          │
                     1. hash incoming token (sha256) ──────────┐
                                          │                    │
                     2. findOne({ resetPasswordToken: hash }) ─┴─► users table
                                          │                       (resetPasswordToken = HASH, at rest)
                     3. user.passwordHash = newPassword
                     4. user.save() ─────────────────────────► beforeUpdate hook fires
                                          │                       (Sequelize, model-level)
                                          │                       ├─ changed('passwordHash')? YES
                                          │                       ├─ bcrypt.hash(newPassword)
                                          │                       └─ passwordChangedAt = new Date()
                                          │                              │
                                          ▼                              ▼
                                  users.passwordHash            users.passwordChangedAt
                                  (bcrypt digest)                (DATETIME(3), now persisted)

  ── separately, on EVERY subsequent authenticated request ──

  Incoming request
        │
        ▼
  Apollo context() fn (server.js) ──► getUserFromRequest(req, models)
        │                                    │
        │                          1. jwt.verify(token) → payload { sub, role, iat }
        │                          2. models.User.findByPk(payload.sub) ─────► users table
        │                                    │                        (fresh read — sees the
        │                                    │                         persisted passwordChangedAt)
        │                          3. if user.passwordChangedAt is NULL → skip check (D-05)
        │                          4. else: floor(passwordChangedAt/1000s) vs payload.iat (whole seconds)
        │                                    │
        │                          5. iat < changedAtSeconds  → return null (revoked)
        │                             iat >= changedAtSeconds → return user (valid)
        ▼
  resolver sees `user` (or null) in context
```

### Recommended Project Structure

No new files. Existing files touched:
```
backend/src/
├── models/User.js              # + passwordChangedAt column, stamp in beforeUpdate
├── utils/auth.js                # + hashResetToken(), + revocation check in getUserFromRequest
├── resolvers/user.resolver.js   # requestPasswordReset stores hash; resetPassword looks up by hash
├── utils/auth.test.js           # + revocation unit tests (iat vs passwordChangedAt)
├── resolvers/resetPassword.test.js  # update seed data + mailer-arg assertions for hashing
└── models/User.test.js          # (optional) + passwordChangedAt hook stamping unit test
```

### Pattern 1: Seconds-floor, null-safe revocation check

**What:** A single comparison inserted into `getUserFromRequest` immediately after the user is loaded, before it is returned to the resolver context.

**When to use:** Every authenticated request — this is the sole per-request auth gate in this codebase (no middleware chain exists for this).

**Example:**
```js
// backend/src/utils/auth.js — MODIFIED
export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await models.User.findByPk(payload.sub);
    if (!user) return null;

    if (user.passwordChangedAt) {
      const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < changedAtSeconds) return null; // D-01: strict `<`, whole-second floor
    }

    return user;
  } catch {
    return null;
  }
}
```
Notes:
- `payload.iat` from `jsonwebtoken` is already a whole-second integer — no flooring needed on that side `[VERIFIED: jsonwebtoken README — NumericDate]`.
- `user.passwordChangedAt.getTime() / 1000` is explicitly floored in JS regardless of the DB column's fractional precision — this is defense-in-depth against the MySQL rounding pitfall below, not a substitute for using `DATE(3)`.
- NULL check preserves D-05 (no backfill; existing users' tokens are unaffected until their first reset).
- Failure mode stays consistent with the existing pattern in this function: `null`, never a thrown error (matches the established "auth failures degrade to null" convention).

### Pattern 2: Stamping `passwordChangedAt` inside the existing guarded hook

**What:** Reuse the `beforeUpdate` hook's existing `changed('passwordHash')` branch — do not add a new hook or a resolver-level `user.passwordChangedAt = new Date()` assignment.

**When to use:** Any code path that changes `passwordHash` via `user.save()` (currently only `resetPassword`, but this makes any future password-change path — e.g. a hypothetical "change my password while logged in" mutation — correct automatically).

**Example:**
```js
// backend/src/models/User.js — MODIFIED beforeUpdate hook
async beforeUpdate(user) {
  if (user.changed('passwordHash')) {
    user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
    user.passwordChangedAt = new Date();
  }
}
```
Column definition (added to the `User.init` attributes object, alongside `resetPasswordToken`/`resetPasswordExpiresAt`):
```js
passwordChangedAt: {
  type: DataTypes.DATE(3),   // MySQL DATETIME(3) — millisecond precision, avoids rounding (see pitfall below)
  allowNull: true,
  defaultValue: null
}
```
**Why this satisfies SC-1 for free:** `register`'s `beforeCreate` hook only hashes `passwordHash`; it never touches `beforeUpdate`. Unrelated updates to `role` or `name` (e.g. an admin promoting a user) do not trip `changed('passwordHash')`, so `passwordChangedAt` is untouched — this is the existing guard, already proven correct by the current bcrypt-rehash behavior (same branch, same trigger condition).

**Confirmed:** `resetPassword`'s `await user.save()` (after `user.passwordHash = password`) does trigger this `beforeUpdate` hook today — this is not a new assumption, it's the same code path that already rehashes the password via bcrypt in this branch, proven by the passing `resetPassword.test.js` suite from Phase 8. `[VERIFIED: Sequelize docs — instance.save() triggers model-level beforeUpdate hooks]`

### Pattern 3: Hash-at-rest reset tokens (RESET-06)

**What:** Store `sha256(token)` instead of the raw token; email the raw token; look up by hash.

**Example:**
```js
// backend/src/utils/auth.js — ADDED (crypto already imported for randomBytes)
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```
```js
// backend/src/resolvers/user.resolver.js — requestPasswordReset, MODIFIED
const resetToken = createResetToken();               // raw, CSPRNG, unchanged
user.resetPasswordToken = hashResetToken(resetToken); // digest persisted, NOT raw
user.resetPasswordExpiresAt = resetTokenExpiry();
await user.save();

sendPasswordResetEmail({ to: user.email, token: resetToken }).catch(...); // raw token still emailed
```
```js
// backend/src/resolvers/user.resolver.js — resetPassword, MODIFIED
const user = await models.User.findOne({
  where: { resetPasswordToken: hashResetToken(token) }  // look up by digest
});
```
No schema change: `resetPasswordToken` is already `DataTypes.STRING` with no explicit length cap (Sequelize defaults `STRING` to `VARCHAR(255)`), and both a 32-byte-hex raw token (64 chars) and a sha256 hex digest (64 chars) fit comfortably.

### Anti-Patterns to Avoid
- **Stamping `passwordChangedAt` inside the resolver instead of the hook:** Bypasses the model-level invariant, risks drift if a second password-change path is added later without remembering the stamp.
- **Relying on MySQL's default `DATETIME` (no fractional precision) and assuming it "just floors":** It rounds, not truncates — verified against the MySQL 8.4 manual. This is the opposite of D-01's required direction in the worst case (see Pitfall 1).
- **Testing SC-3 exclusively through the `graphql()` test helper:** That helper bypasses `getUserFromRequest` — see Pitfall 3.
- **Awaiting the mailer call or adding new DB work to `resetPassword`/`requestPasswordReset` without re-checking CR-01's 250ms timing floor:** RESET-06's hash lookup is a `findOne` — same shape and cost as today's plaintext lookup, so it does not reopen CR-01, but any future change to these resolvers should re-verify the timing-floor test still passes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comparing JWT issue time to a revocation point | A custom time-parsing/normalization utility | `Math.floor(date.getTime() / 1000)` vs. `payload.iat` (both already integers in the right unit) | `jsonwebtoken` already guarantees `iat` is a whole-second Unix timestamp; no library or parsing needed beyond one division |
| Reset-token digesting | A custom string-comparison/timing-safe-equal wrapper | `crypto.createHash('sha256').update(token).digest('hex')` + Sequelize `findOne` equality (DB-side, not app-side, comparison) | The lookup is a DB index equality check, not an app-level string compare — no timing-safe-equal is needed here (that concern applies to secret *verification*, not to looking a hash up as a primary/indexed value) |
| Schema migration for a nullable, backfill-free column | A migration framework or `sync({ alter: true })` | A hand-written, documented `ALTER TABLE` statement (see below) + boot-and-verify | Explicitly locked by D-03/D-04 — proportionate for a single nullable column with no backfill; a full framework is deferred to v2 |

**Key insight:** Every capability this phase needs already has a built-in, already-imported primitive in this codebase (`jsonwebtoken`'s `iat`, Node's `crypto`, Sequelize's `changed()`/hooks). The risk in this phase is not "which library to add" — it's "which existing, already-verified capability applies," and getting the units/precision (seconds vs. ms) and hook-triggering pathway (`.save()` vs. bulk `.update()`) right.

## Common Pitfalls

### Pitfall 1: MySQL rounds (not truncates) fractional seconds on insert into an under-precision `DATETIME` column
**What goes wrong:** Declaring `passwordChangedAt` as plain `DataTypes.DATE` (→ MySQL `DATETIME`, 0 fractional digits) and assigning a JS `Date` with milliseconds (e.g. `new Date()` at `12:00:00.900`) causes MySQL to round the stored value up to `12:00:01.000` — not down.
**Why it happens:** Per the MySQL 8.4 Reference Manual §13.2.6 ("Fractional Seconds in Time Values"): inserting a value with more fractional digits than the column supports **rounds** it to the column's precision by default (SQL-standard behavior); truncation instead requires opting into the non-default `TIME_TRUNCATE_FRACTIONAL` SQL mode. `[VERIFIED: MySQL 8.4 Reference Manual]`
**How to avoid:** Declare the column with explicit fractional precision — `DataTypes.DATE(3)` (→ `DATETIME(3)`, millisecond precision, supported since MySQL 5.6.4; this project runs MySQL 8.4 per `docker-compose.yml`) — so no rounding occurs at write time, and do the seconds-flooring only in the JS comparison in `getUserFromRequest` (as D-01 already specifies). Do not depend on DB column precision to do the flooring for you.
**Warning signs:** A same-second boundary test that is flaky (passes most runs, fails ~1-in-10 depending on which millisecond within the second the reset happens to land on) is the signature of this bug — it only manifests when the reset happens to occur at ≥500ms into a second.

### Pitfall 2: The existing `graphql()` test helper bypasses the code path under test
**What goes wrong:** `backend/test/helpers.js`'s `graphql(query, variables, user)` calls `server.executeOperation(..., { contextValue: { models, user } })` — it injects `user` directly and never constructs a `req` object or invokes the real Apollo `context` function from `server.js` (which is where `getUserFromRequest` is actually called). Every existing resolver test (`login.test.js`, `resetPassword.test.js`, etc.) uses this helper. A plan that writes the mandatory SC-3 boundary test as "call `login` via `graphql()`, then call `dashboard` via `graphql()` with the returned token" will not exercise `getUserFromRequest` at all if it reuses this helper's default pattern of passing `user` directly — it only proves something if the test is written to pass the token via a constructed `req`/header and call `getUserFromRequest` (or the real HTTP path) directly.
**Why it happens:** The helper was built for convenience (Phase 2/3, before this revocation concern existed) — it deliberately short-circuits authentication for resolver-focused tests.
**How to avoid:** Write the mandatory test as a **direct unit test of `getUserFromRequest`** in `backend/src/utils/auth.test.js`, mirroring the file's existing pattern exactly (mocked `req.headers.authorization`, mocked `models.User.findByPk` returning a stub user with a specific `passwordChangedAt`). This is the fastest, most deterministic option and needs no DB. Optionally supplement with an HTTP-level integration test via the Phase-7-established `httpClient()` (supertest against the real `app`) to prove the full resolver→hook→DB→context wiring end-to-end — see Code Examples below.
**Warning signs:** A "boundary test" that never fails even when the revocation check is deleted from `getUserFromRequest` is proof the test isn't exercising the real code path.

### Pitfall 3: `sequelize.sync()` will not add the new column to any already-provisioned database
**What goes wrong:** The CI/test database is force-recreated every run (`backend/test/globalSetup.js`: `sequelize.sync({ force: true, match: /_test$/ })`), so the new column silently appears there — masking that a real dev/prod database (created before this phase, using non-force `sync()` per `backend/src/models/index.js`'s `initializeDatabase()`) will throw `Unknown column 'passwordChangedAt' in 'field list'` the first time any query touches it.
**Why it happens:** This is the same class of gap the phase's own success criterion #4 and ROADMAP/STATE.md's "Blockers/Concerns" section already call out — it repeats for Phase 11 too. Locked as D-03/D-04: manual `ALTER TABLE`, not `sync({ alter: true })`, not a migration framework.
**How to avoid:** Include the manual migration statement and a documented boot-and-verify step in the plan (see below) — do not rely on green CI as proof this is safe.
**Warning signs:** Green CI/test suite + first production/dev boot against a real, pre-existing DB throwing `Unknown column` — exactly what SC-4 is designed to catch.

### Pitfall 4: Existing hard-coded plaintext reset-token test fixtures will silently stop matching after RESET-06
**What goes wrong:** `resetPassword.test.js` currently seeds users directly via `createTestUser({ resetPasswordToken: 'a-valid-reset-token', ... })` (a literal plaintext string) and then submits `token: 'a-valid-reset-token'` as the GraphQL mutation argument, expecting the resolver's `findOne({ where: { resetPasswordToken: token } })` to match by exact plaintext equality. After RESET-06, the resolver looks up by `hashResetToken(token)`, so these tests must seed `resetPasswordToken: hashResetToken('a-valid-reset-token')` instead — while still submitting the raw literal (`'a-valid-reset-token'`) as the mutation's `token` argument. Failing to update every such fixture (there are at least 3: `'a-valid-reset-token'`, `'single-use-token'`, `'expired-token'`) leaves those tests red for a reason unrelated to the actual bug they were written to catch (single-use/expiry), obscuring real regressions.
**Why it happens:** These fixtures were written in Phase 8 against a plaintext-storage assumption that RESET-06 explicitly overturns.
**How to avoid:** Import `hashResetToken` in the test file and wrap every seeded `resetPasswordToken` value with it; leave the mutation-argument (raw) values unchanged.
**Warning signs:** `resetPassword.test.js`'s single-use and expiry tests failing with "invalid or has expired" even though the token/expiry logic itself is correct — the tell is that the *lookup* fails, not the expiry/single-use branch.

### Pitfall 5: `requestPasswordReset`'s existing test asserts the mailer was called with the *stored* value — that assumption breaks under hashing
**What goes wrong:** `resetPassword.test.js`'s first test does `await user.reload(); ... expect(sendPasswordResetEmail).toHaveBeenCalledWith({ to: user.email, token: user.resetPasswordToken })` — asserting the emailed token equals the reloaded DB column value. After RESET-06 these values intentionally diverge (DB holds the hash, email gets the raw token), so this specific assertion must change to compare `hashResetToken(<captured raw token from the mock call>)` against the reloaded DB value, not equality between the two directly.
**Why it happens:** Same root cause as Pitfall 4 — a Phase 8 test fixture built on a plaintext-storage assumption.
**How to avoid:** Capture the mailer's call argument (`sendPasswordResetEmail.mock.calls[0][0].token`) as the raw token, then assert `hashResetToken(rawToken) === (await user.reload()).resetPasswordToken`.

## Code Examples

### Direct unit test proving the same-second boundary (SC-3, mandatory) — no fake timers needed
```js
// backend/src/utils/auth.test.js — new describe block, mirrors the file's existing pattern
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getUserFromRequest } from './auth.js';

describe('getUserFromRequest — passwordChangedAt revocation (SESS-03)', () => {
  it('accepts a token whose iat lands in the same whole second as passwordChangedAt', async () => {
    const changedAt = new Date('2026-01-01T12:00:00.900Z');           // .900s into the second
    const iatSameSecond = Math.floor(changedAt.getTime() / 1000);      // floor(...) === 12:00:00

    // jwt.sign accepts an explicit `iat` in the payload, overriding the automatic timestamp
    // Source: https://github.com/auth0/node-jsonwebtoken#usage — "If iat is inserted in the
    // payload, it will be used instead of the real timestamp"
    const token = jwt.sign({ sub: 7, role: 'USER', iat: iatSameSecond }, env.jwtSecret, { expiresIn: '1d' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', passwordChangedAt: changedAt }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).not.toBeNull(); // D-01: same-second re-login stays valid
  });

  it('revokes a token whose iat is in the second immediately before passwordChangedAt', async () => {
    const changedAt = new Date('2026-01-01T12:00:01.100Z');
    const iatPriorSecond = Math.floor(changedAt.getTime() / 1000) - 1; // 12:00:00, strictly before

    const token = jwt.sign({ sub: 7, role: 'USER', iat: iatPriorSecond }, env.jwtSecret, { expiresIn: '1d' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', passwordChangedAt: changedAt }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).toBeNull();
  });

  it('does not revoke when passwordChangedAt is NULL (D-05 — no backfill)', async () => {
    const token = jwt.sign({ sub: 7, role: 'USER' }, env.jwtSecret, { expiresIn: '1d' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const models = { User: { findByPk: async () => ({ id: 7, role: 'USER', passwordChangedAt: null }) } };

    const result = await getUserFromRequest(req, models);

    expect(result).not.toBeNull();
  });
});
```

### Optional supplementary end-to-end test (proves real wiring + catches the MySQL rounding pitfall)
```js
// Uses the Phase-7 httpClient() (supertest against the real app) — this is the only harness
// that exercises the REAL Apollo context() function → getUserFromRequest → real DB row.
// vi.setSystemTime() WITHOUT vi.useFakeTimers() only mocks Date — setTimeout/DB I/O stay real,
// so it will not hang requestPasswordReset's 250ms anti-enumeration floor (CR-01).
// Source: https://vitest.dev/api/vi.html#vi-setsystemtime
import { httpClient } from '../../test/helpers.js';

it('a token issued in the same second as a reset remains valid end-to-end', async () => {
  // ... create user, request reset, capture raw token from mailer mock ...
  vi.setSystemTime(new Date('2026-01-01T12:00:00.900Z'));
  await httpClient().post('/graphql').send({ query: RESET_PASSWORD_MUTATION, variables: { token: rawToken, password: 'NewPass123' } });

  vi.setSystemTime(new Date('2026-01-01T12:00:00.950Z')); // same whole second, later ms
  const loginRes = await httpClient().post('/graphql').send({ query: LOGIN_MUTATION, variables: { email, password: 'NewPass123' } });
  const newToken = loginRes.body.data.login.token;

  vi.useRealTimers();
  const meRes = await httpClient().post('/graphql').set('Authorization', `Bearer ${newToken}`).send({ query: '{ me { id } }' });
  expect(meRes.body.data.me).not.toBeNull();
});
```

### Manual migration statement (SC-4)
```sql
-- Run manually against the pre-existing dev/prod `users` table.
-- NOT applied by sequelize.sync() — see Pitfall 3.
ALTER TABLE users ADD COLUMN passwordChangedAt DATETIME(3) NULL DEFAULT NULL;
```
**Boot-and-verify procedure:**
1. Apply the `ALTER TABLE` above against the target MySQL database (`mysql -h <host> -u <user> -p <db> < migration.sql`, or via a MySQL client/GUI).
2. Boot the backend against that database (`NODE_ENV=development npm run dev`, or `NODE_ENV=production` per the deploy path) — confirm no `Unknown column` error appears and the existing `/health` and `login`/`me` queries succeed.
3. Confirm an existing user's token (issued before the migration) still authenticates (`passwordChangedAt` is NULL for them — D-05).
4. Confirm a password reset for that same user, followed by immediate re-login, both succeed and the *previous* token now fails `me`/`dashboard`.

## Runtime State Inventory

> Not a rename/refactor/migration-in-the-GSD-sense phase (no renamed identifiers, no data migration of existing values). Included briefly because SESS-01 does add a column to a live table.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.resetPasswordToken` currently holds plaintext tokens for any account with a pending, unexpired reset request at deploy time. RESET-06 changes the *comparison* method (hash lookup) but does **not** rehash pre-existing plaintext rows — any reset request issued before this phase ships and not yet consumed will fail to match post-deploy (`resetPasswordToken` in DB is plaintext, lookup now hashes the incoming token). | Acceptable, low-blast-radius: worst case is a stale in-flight reset link (≤30 min TTL per RESET-04) silently fails and the user re-requests. No backfill needed — flag as expected, not a regression, in the plan's verification notes. |
| Live service config | None — no external service (n8n, Datadog, etc.) references this schema. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — no new env var introduced by this phase. | None. |
| Build artifacts | None — no package/build-artifact renames. | None. |

## Package Legitimacy Audit

(See above — not applicable, zero new packages.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Reset token stored plaintext (`users.resetPasswordToken` = raw CSPRNG hex) | Reset token stored as `sha256` digest; raw token only ever transiting the response/email, never persisted | This phase (RESET-06, closing 08-REVIEW.md WR-08) | Removes a direct DB-read → account-takeover vector (SQLi read, leaked backup, over-privileged replica) |
| JWTs valid until natural expiry regardless of password change | JWTs issued before a password reset are rejected on next request | This phase (SESS-01/02/03) | Closes the "attacker's stolen session survives a password reset" gap explicitly named as the phase's stated core value |

**Deprecated/outdated:** None — this phase does not remove or replace any previously-shipped v1.1 behavior; it's additive to Phase 8's mailer/reset-token work.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | An HTTP-level end-to-end test using `vi.setSystemTime()` (without full `useFakeTimers()`) is a reasonable *supplementary* (not mandatory) way to prove full-stack wiring for SC-3, on top of the mandatory unit test. This is original synthesis, not documented anywhere in the project or Vitest's own guides as a named pattern for this exact use case. | Code Examples — "Optional supplementary end-to-end test" | If wrong/flaky in practice (e.g. an unforeseen internal `Date.now()` call elsewhere in the request path), the planner should treat this as optional/discretionary, not block phase completion on it — the unit test in `auth.test.js` is the one the roadmap actually mandates and it does not depend on this technique |
| A2 | `crypto.createHash('sha256')` without a work factor is an appropriate choice for hashing a 256-bit CSPRNG reset token (vs. `bcrypt`/`argon2`). This mirrors the fix already proposed in `08-REVIEW.md` WR-08's own suggested code, so it is not a novel claim by this research, but it has not been independently re-verified against current (2026) guidance beyond that review note. | Standard Stack — Alternatives Considered | Low risk: the reasoning (token entropy is already very high, unlike human-chosen passwords) is standard cryptographic practice and matches the locked D-06 decision text verbatim |

## Open Questions

1. **Should the end-to-end HTTP test (Code Examples, supplementary) be a required deliverable of the phase, or purely optional?**
   - What we know: The roadmap's SC-3 wording ("proven by a mandatory same-second boundary test") is satisfied by the deterministic unit test in `auth.test.js` alone — it does not name a specific harness.
   - What's unclear: Whether the planner/user wants additional confidence that the full resolver→hook→DB round-trip also respects the MySQL `DATETIME(3)` precision choice (Pitfall 1) under real I/O, not just mocked.
   - Recommendation: Treat the unit test as the mandatory deliverable satisfying SC-3 literally; offer the HTTP-level test as an optional Wave 2/stretch task, not a blocking one — it exercises the same logic through a slower, more fragile path.

2. **Does any other code path besides `resetPassword` currently call `user.save()` after mutating `passwordHash`?**
   - What we know: A repo-wide read of `backend/src/resolvers/user.resolver.js` shows only `resetPassword` sets `passwordHash` post-creation; `register`'s `beforeCreate` is the only other write path, and it does not trigger `beforeUpdate`.
   - What's unclear: Nothing outstanding — this was verified directly by reading the full resolver file, not assumed.
   - Recommendation: No action needed; noted for completeness.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| MySQL (via Docker) | SC-4 manual boot-and-verify, integration tests | Yes — `portofolio-mysql-1` container running `mysql:8.4` | 8.4 `[VERIFIED: docker ps]` | — |
| Node.js | Backend runtime | Yes | Local Node via project tooling; `backend/package.json` declares `engines.node: "24.x"` — note this diverges from the root `CLAUDE.md`/`.nvmrc` (`18.x`); pre-existing inconsistency, not introduced by this phase | — |
| `jsonwebtoken`, `sequelize`, `mysql2` | All three requirements | Yes — already installed, confirmed via `npm ls` | 9.0.3 / 6.37.8 / 3.11.x | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

*Note the Node engine version inconsistency (`backend/package.json` says `24.x`, `CLAUDE.md`/`.nvmrc` say `18.x`) is pre-existing and out of scope for this phase — flagged here only for visibility, not as a blocking finding.*

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (backend workspace) |
| Config file | `backend/vitest.config.js` (globalSetup force-recreates the `_test`-suffixed DB per run; `pool: 'forks'`, `fileParallelism: false`) |
| Quick run command | `npm test --workspace backend -- src/utils/auth.test.js` |
| Full suite command | `npm test --workspace backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| SESS-01 | `passwordChangedAt` column exists, nullable, untouched by non-password updates | unit | `npm test --workspace backend -- src/models/User.test.js` | ❌ Wave 0 (extend existing file) |
| SESS-02 | `resetPassword` stamps `passwordChangedAt = now()` on actual password change | integration | `npm test --workspace backend -- src/resolvers/resetPassword.test.js` | ✅ (extend existing file) |
| SESS-03 | Revoked token (`iat` < `passwordChangedAt` second) rejected; same-second token accepted; NULL never revokes | unit | `npm test --workspace backend -- src/utils/auth.test.js` | ✅ (extend existing file, new describe block) |
| RESET-06 | Reset token hashed at rest; raw emailed; lookup by hash; single-use/expiry/anti-enumeration preserved | integration | `npm test --workspace backend -- src/resolvers/resetPassword.test.js` | ✅ (extend existing file — update seeded fixtures per Pitfall 4/5) |

### Sampling Rate
- **Per task commit:** `npm test --workspace backend -- src/utils/auth.test.js src/resolvers/resetPassword.test.js src/models/User.test.js`
- **Per wave merge:** `npm test --workspace backend` (full 67+ test backend suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`, **plus** the manual SC-4 boot-and-verify step (not test-catchable — see Pitfall 3).

### Wave 0 Gaps
- [ ] `backend/src/models/User.test.js` — add a test asserting `passwordChangedAt` is stamped only when `changed('passwordHash')` is true (mirror the existing `beforeCreate hashing hook` describe block's `User.runHooks('beforeUpdate', user)` pattern).
- [ ] `backend/src/utils/auth.test.js` — add the three-test `describe` block from Code Examples above (this is the mandatory SC-3 pin).
- [ ] `backend/src/resolvers/resetPassword.test.js` — update all `resetPasswordToken` fixture seeds to store `hashResetToken(...)` (Pitfall 4), and rework the mailer-argument assertion in the first `requestPasswordReset` test (Pitfall 5).
- [ ] Framework install: none — Vitest and all fixtures already exist.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | Yes | JWT-based, unchanged mechanism this phase; this phase strengthens V2.10 (session/token invalidation on credential change) specifically |
| V3 Session Management | Yes | This phase directly implements ASVS V3.3.1-class control: "invalidate active sessions upon logout/password change" — `passwordChangedAt` is the chosen mechanism (server-side timestamp comparison in lieu of a session store, appropriate for this stateless-JWT architecture) |
| V4 Access Control | No | Unaffected — `role`/`requireAdmin` logic untouched |
| V5 Input Validation | Partial | `resetPassword`'s `token`/`password` inputs unchanged in shape; `assertPasswordStrength` (Phase 7) already validates password length before this phase's code runs |
| V6 Cryptography | Yes | `sha256` for reset-token digesting (RESET-06) — appropriate given token is high-entropy CSPRNG output, not a low-entropy secret needing a slow KDF (bcrypt remains correctly reserved for the actual password) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Stolen/leaked JWT remains valid after victim resets password (session fixation via stale token) | Elevation of Privilege | `passwordChangedAt` + `iat` comparison (this phase, SESS-03) |
| Reset token readable at rest by anyone with DB read access (SQLi, backup leak, over-privileged replica) | Information Disclosure → Elevation of Privilege | `sha256(token)` hash-at-rest (this phase, RESET-06) |
| MySQL fractional-second rounding silently shifting a revocation boundary | Tampering (unintentional, not adversarial) — but security-relevant since it can either over-revoke (UX bug) or under-revoke (security bug, if rounding happened to go the other direction under a different MySQL config) | `DATETIME(3)` explicit column precision (this phase, Pitfall 1) |

## Sources

### Primary (HIGH confidence)
- `MySQL 8.4 Reference Manual §13.2.6 "Fractional Seconds in Time Values"` — https://dev.mysql.com/doc/refman/8.4/en/fractional-seconds.html — confirmed default rounding (not truncation) behavior for under-precision DATETIME columns.
- `auth0/node-jsonwebtoken README` — https://github.com/auth0/node-jsonwebtoken — confirmed `iat` NumericDate semantics and the explicit-`iat`-in-payload override behavior.
- `Sequelize v6 Hooks docs` — https://sequelize.org/docs/v6/other-topics/hooks/ — confirmed `instance.save()` triggers model-level `beforeUpdate`/`afterUpdate` hooks (vs. bulk operations needing `individualHooks: true`).
- `Vitest `vi` API docs` — https://vitest.dev/api/vi.html — confirmed `vi.setSystemTime()` without `vi.useFakeTimers()` mocks only `Date`, leaving timers/I/O real.
- Direct repository inspection: `backend/src/utils/auth.js`, `backend/src/models/User.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/server.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/src/utils/auth.test.js`, `backend/src/resolvers/resetPassword.test.js`, `backend/src/models/User.test.js`, `backend/src/models/database.test.js`, `backend/vitest.config.js`, `backend/package.json` — all code-shape claims above are grounded in the actual current file contents, not assumed.

### Secondary (MEDIUM confidence)
- `08-REVIEW.md` (WR-08, CR-01) and `08-VERIFICATION.md` — internal project artifacts, treated as authoritative for what Phase 8 actually shipped and what must be preserved.

### Tertiary (LOW confidence)
- None — every claim in this document is grounded in either official documentation or direct repository inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all versions confirmed installed via `npm ls`.
- Architecture: HIGH — every code shape traced against the actual current file contents, not inferred from training data alone.
- Pitfalls: HIGH — MySQL rounding behavior and `jsonwebtoken` `iat` semantics both confirmed against current official documentation (not solely training-data recall); test-helper-bypass and fixture-drift pitfalls found by direct code reading.

**Research date:** 2026-07-20
**Valid until:** 30 days (stable stack, no fast-moving dependencies; revisit if `mysql:8.4` image, `jsonwebtoken`, or `sequelize` versions change)
