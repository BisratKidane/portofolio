# Phase 12: Family Data Model Foundation - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 9 (2 model source, 1 barrel edit, 1 service/helper module, 5 test files) + 1 test-helper extension
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/src/models/FamilyMember.js` | model | CRUD | `backend/src/models/User.js` | exact |
| `backend/src/models/Spouse.js` | model | CRUD (join table) | `backend/src/models/User.js` | role-match (no join-table precedent exists; ENUM/hook conventions still transfer) |
| `backend/src/models/index.js` (extended) | config/barrel | CRUD (registration) | `backend/src/models/index.js` (itself, current state) | exact — this is an in-place extension, not a new file |
| `backend/src/services/familyMember.service.js` (or `backend/src/models/familyMember.service.js` — see note) | service | transform/event-driven (graph mutation) | `backend/src/utils/auth.js` | role-match (closest existing "standalone pure/async helper functions, no class" module) |
| `backend/src/models/FamilyMember.test.js` | test | CRUD (unit) | `backend/src/models/User.test.js` | exact |
| `backend/src/models/FamilyMember.associations.test.js` | test | CRUD (integration) | `backend/src/models/database.test.js` + `backend/src/models/User.test.js` | role-match |
| `backend/src/models/Spouse.test.js` | test | CRUD (integration) | `backend/src/models/database.test.js` | role-match |
| `backend/src/models/FamilyMember.cycle.test.js` | test | transform (graph algorithm) | `backend/src/utils/auth.test.js` | role-match (pure-function/async-helper test style) |
| `backend/src/models/FamilyMember.delete.test.js` | test | transform (transactional graph mutation) | `backend/src/utils/auth.test.js` + `backend/src/models/database.test.js` | role-match |
| `backend/test/helpers.js` (extended `resetTables()`) | utility | CRUD (test fixture) | `backend/test/helpers.js` (itself, current state) | exact — in-place extension |

**Note on service file location:** RESEARCH.md's "Recommended Project Structure" places
`familyMember.service.js` inside `backend/src/models/`. The codebase has no `backend/src/services/`
directory today (only `backend/src/services/mailer.js` exists, which is an infra/IO service, not a
domain-logic one) — this is a naming/placement judgment call for the planner. Either location works;
`backend/src/models/familyMember.service.js` keeps it adjacent to the model it mutates, matching
RESEARCH.md's proposed structure. `backend/src/utils/auth.js` is the strongest *pattern* analog
(standalone async functions, no class, imported by name) regardless of which directory is chosen.

## Pattern Assignments

### `backend/src/models/FamilyMember.js` (model, CRUD)

**Analog:** `backend/src/models/User.js` (full file, 77 lines — read in one pass)

**Imports pattern** (lines 1-2):
```javascript
import { DataTypes, Model } from 'sequelize';
```
`FamilyMember.js` needs no `bcrypt` import (no password field) — drop that line relative to `User.js`.

**Class + init export shape** (lines 4, 10-11, 75-76):
```javascript
export class User extends Model {}

export function initUser(sequelize) {
  User.init(
    { /* fields */ },
    { /* options */ }
  );

  return User;
}
```
Copy this exact shape for `FamilyMember`: `export class FamilyMember extends Model {}` and
`export function initFamilyMember(sequelize) { FamilyMember.init({...}, {...}); return FamilyMember; }`.
No instance methods are needed on `FamilyMember` (unlike `User.validatePassword`) — the class body can
be empty (`{}`) unless the planner opts to expose helpers as instance methods per RESEARCH.md's open
"Claude's Discretion" note (standalone functions are recommended instead).

**ENUM field pattern** (lines 32-36, `role`):
```javascript
role: {
  type: DataTypes.ENUM('ADMIN', 'USER'),
  allowNull: false,
  defaultValue: 'USER'
}
```
Adapt directly for `gender` (D-07): `gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: false }`
— no `defaultValue`, since gender is a required user-supplied field, unlike `role` which defaults.

**Optional/conditional-validated field pattern** (lines 22-27, `email` — required in `User`):
```javascript
email: {
  type: DataTypes.STRING,
  allowNull: false,
  unique: true,
  validate: { isEmail: true }
}
```
`FamilyMember.email` (D-08) is optional and NOT unique — drop `allowNull: false` and `unique: true`,
keep `validate: { isEmail: true }` (Sequelize skips validators on `null` automatically, matching D-10's
"only when present" rule).

**Plain optional string/date fields** — no existing analog field is `allowNull: true` with no validator
in `User.js`; `resetPasswordToken` (lines 37-40) is the closest shape:
```javascript
resetPasswordToken: {
  type: DataTypes.STRING,
  allowNull: true
}
```
Use this shape for `mothersname`, `phone`, `address` (all `DataTypes.STRING, allowNull: true`, D-08).

**Options block / hooks / tableName pattern** (lines 54-72):
```javascript
{
  sequelize,
  modelName: 'User',
  tableName: 'users',
  hooks: {
    beforeValidate(user) {
      if (user.email) user.email = user.email.toLowerCase().trim();
    },
    ...
  }
}
```
Copy `sequelize`/`modelName`/`tableName` keys directly. For `FamilyMember`: `modelName: 'FamilyMember'`,
`tableName: 'family_members'`. The `beforeValidate` email-lowercasing hook is directly reusable if
`email` normalization is wanted (RESEARCH.md's Pattern 1 does not include it, but D-10's "matches
`User`'s `isEmail`" phrasing implies the same conditional-validate posture — normalization is the
planner's call). The model-level `validate` object (deathdate/birthdate cross-field + no-future-date
checks, per RESEARCH.md Pattern 1) has **no existing analog in `User.js`** — `User` has zero
model-level (options.validate) rules today; this is new territory, follow RESEARCH.md's Pattern 1
verbatim for the `validate: { deathAfterBirth() {...}, noFutureDates() {...} }` block.

**VIRTUAL getter (`fullname`)** — no analog in `User.js` (no VIRTUAL fields exist in the codebase).
Follow RESEARCH.md Pattern 1 / "VIRTUAL Getter Pattern" verbatim — this is first-of-its-kind but the
official Sequelize v6 API, not a project convention gap.

---

### `backend/src/models/Spouse.js` (model, CRUD / join table)

**Analog:** `backend/src/models/User.js` (same file/lines as above) for the `init(sequelize)` shape and
`beforeValidate` hook mechanics — no join-table analog exists in this codebase (`FamilyMember`/`Spouse`
are the first associated models). Use RESEARCH.md Pattern 3 for the ordering hook and unique index,
since there is nothing to copy from `User.js` for those specifics; only the *shape* of
`init(sequelize) { Model.init({...}, {...}); return Model; }` and the `hooks: { beforeValidate(instance) {...} }`
mechanics (lines 58-61 of `User.js`) are directly reused:
```javascript
hooks: {
  beforeValidate(user) {
    if (user.email) user.email = user.email.toLowerCase().trim();
  },
  ...
}
```
→ becomes, for `Spouse` (per RESEARCH.md Pattern 3):
```javascript
hooks: {
  beforeValidate(spouse) {
    if (spouse.memberAId != null && spouse.memberBId != null && spouse.memberAId > spouse.memberBId) {
      const tmp = spouse.memberAId;
      spouse.memberAId = spouse.memberBId;
      spouse.memberBId = tmp;
    }
  }
}
```
Same `beforeValidate(instance) { ... instance.field = ... }` mutation-in-place idiom as `User.js`.

---

### `backend/src/models/index.js` (barrel, extended in place)

**Analog:** the file's own current state (6-15, full file, 16 lines):
```javascript
import { sequelize } from '../config/database.js';
import { initUser } from './User.js';

const User = initUser(sequelize);

export const models = {
  User
};

export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
}

export { sequelize };
```

**Extension pattern** — add imports/init calls for both new models, add the association block (NEW —
no existing precedent in this file, since `User` has zero associations today), and extend the `models`
object. Do **not** touch `initializeDatabase()`'s body (Pitfall 3 in RESEARCH.md — it must remain plain
`sequelize.sync()`, no `force: true`, per D-13). Full target shape is given verbatim in RESEARCH.md's
"Pattern 2" code block — copy that structure, inserting association declarations **after** all `init*`
calls and **before** the `models` export, per RESEARCH.md's explicit ordering requirement.

**Critical constraint carried from `User.js`'s barrel today:** `models` is a plain object literal
(`{ User }` → `{ User, FamilyMember, Spouse }`), not a class or registry — preserve this flat-object
convention exactly.

---

### `backend/src/services/familyMember.service.js` (service, transform/graph-mutation)

**Analog:** `backend/src/utils/auth.js` (full file, 66 lines — read in one pass)

**Module shape — standalone named async/sync functions, no class, no default export**
(lines 5-7, 9-32, 43-45):
```javascript
export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  // ...
}

export function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}
```
This is the exact shape to follow for `linkParent`, `addChild`, `setSpouse`, `deleteMember`,
`wouldCreateCycle` — each a standalone `export function`/`export async function`, imported by name
elsewhere (never a default export, never a class).

**Guard-clause / early-throw error pattern** (lines 34-41, `requireAuth`/`requireAdmin`):
```javascript
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
Directly reusable idiom for `linkParent`'s cycle-rejection: `if (wouldCreateCycle) throw new Error('...')`
— plain `Error` objects with user-facing messages, thrown synchronously/rejected from an async function,
matching this codebase's project-wide error-handling convention (see CLAUDE.md "Error Handling":
`throw new Error(...)`, no custom error classes).

**Transactional/DB-call pattern** — no exact analog exists in `auth.js` (it has no transactions); for
`deleteMember`'s `sequelize.transaction(async (transaction) => {...})` wrapper and `setSpouse`'s
idempotent-on-unique-violation handling, follow RESEARCH.md Pattern 3/5 verbatim (these are new
territory — first use of `sequelize.transaction()` in the codebase).

---

### `backend/src/models/FamilyMember.test.js` (test, unit)

**Analog:** `backend/src/models/User.test.js` (full file, 104 lines — read in one pass)

**Import + describe/it/expect + models barrel import** (lines 1-5):
```javascript
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from './index.js';

const { User } = models;
```
For `FamilyMember.test.js`: `import { models } from './index.js'; const { FamilyMember } = models;`
(drop the `bcrypt` import — not needed).

**`.build()` for unpersisted-instance unit tests (no DB round-trip)** (lines 25-33):
```javascript
const user = User.build({
  name: 'Test',
  email: 'test@example.com',
  passwordHash: 'Password123!',
  role: 'USER'
});

expect(user.passwordHash).toBe('Password123!');
```
This is the exact pattern for MEM-01/02/03 field tests — `FamilyMember.build({...})` + synchronous
`expect(instance.field).toBe(...)` assertions, no `await instance.save()` needed for pure field/VIRTUAL
checks. For validation-rejection tests (D-10 date rules, MEM-01 required-field rejection), switch to
`await expect(FamilyMember.create({...})).rejects.toThrow()` (the `User.test.js` file doesn't exercise
this exact call, but it is standard Sequelize + Vitest usage consistent with the file's async/await
`it()` style seen in the `beforeCreate` hashing hook tests, lines 35-48).

**`rawAttributes` introspection pattern (schema-shape assertions)** (lines 99-102):
```javascript
it('declares emailVerificationToken and emailVerificationExpiresAt as nullable', () => {
  expect(User.rawAttributes.emailVerificationToken.allowNull).toBe(true);
  expect(User.rawAttributes.emailVerificationExpiresAt.allowNull).toBe(true);
});
```
Directly reusable for asserting `mothersname`/`email`/`birthdate`/`deathdate`/`phone`/`address` are all
`allowNull: true` (D-08), and for asserting `fullname` is `DataTypes.VIRTUAL` (MEM-03) via
`FamilyMember.rawAttributes.fullname.type.constructor.name === 'VIRTUAL'` or equivalent introspection.

**`describe` block naming convention** (lines 7, 23, 51, 87) — `describe('<function or feature name>
(<REQ-ID if applicable>)', ...)`, e.g. `describe('emailVerified / ... columns (VERIFY-01)', ...)`. Mirror
this for `describe('gender field (MEM-01)', ...)`, `describe('fullname VIRTUAL getter (MEM-03)', ...)`,
`describe('date validation (D-10)', ...)`, etc.

---

### `backend/src/models/FamilyMember.associations.test.js` / `Spouse.test.js` (test, integration)

**Analog:** `backend/src/models/database.test.js` (full file, 14 lines) for the DB-round-trip shape, and
`backend/src/models/User.test.js` for the `describe`/`it` structure (see above).

**Real DB round-trip pattern** (lines 1-14 of `database.test.js`):
```javascript
import { describe, it, expect } from 'vitest';
import { sequelize, models } from './index.js';

describe('database connectivity', () => {
  it('authenticates against the isolated test database', async () => {
    await sequelize.authenticate();
    expect(sequelize.config.database).toMatch(/_test$/);
  });

  it('can query the User table', async () => {
    const count = await models.User.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```
For association/cycle/delete integration tests, this is the pattern for actual `models.FamilyMember.create(...)`
+ `models.FamilyMember.findByPk(...)` calls against the real isolated `_test` MySQL DB (not `.build()` —
associations/FK constraints only fire on persisted rows). Use `await models.FamilyMember.create({...})`
to set up fixtures, then assert on reloaded/queried state.

**Test-data cleanup between tests** — no existing per-file `beforeEach`/`afterEach` truncate call exists
in `database.test.js` or `User.test.js` today (both files are read-only or additive against the shared
`_test` DB and don't call `resetTables()`). RESEARCH.md's Wave-0 gap list explicitly calls for extending
`backend/test/helpers.js`'s `resetTables()` (see below) — new association/cycle/delete test files SHOULD
call `resetTables()` in a `beforeEach`, following the exported helper's existing usage pattern in
resolver test files (see `backend/src/resolvers/*.test.js`, not read in full here, but `helpers.js`
exports `resetTables()` specifically for this purpose — grep confirms it is the project's established
per-test-isolation mechanism).

---

### `backend/src/models/FamilyMember.cycle.test.js` / `FamilyMember.delete.test.js` (test, transform / transactional)

**Analog:** `backend/src/utils/auth.test.js` (lines 1-80 read; file continues beyond, pattern fully
captured in what was read) for pure-function/async-helper test structure, combined with
`database.test.js`'s real-DB pattern (above) for the DB-dependent parts (cycle/delete tests need real
persisted rows, unlike `auth.test.js`'s stubbed-`models` unit style).

**Async-function-under-test + descriptive `it()` naming** (lines 16-24, 26-37):
```javascript
describe('signToken', () => {
  it('produces a token whose decoded payload carries the expected sub and role claims', () => {
    const token = signToken({ id: 42, role: 'ADMIN' });
    const payload = jwt.verify(token, env.jwtSecret);

    expect(payload.sub).toBe(42);
    expect(payload.role).toBe('ADMIN');
  });
});

describe('getUserFromRequest', () => {
  it('resolves the stubbed user for a valid Bearer token', async () => {
    // ...
    const result = await getUserFromRequest(req, models);
    expect(result).toEqual({ /* ... */ });
  });
```
Mirror this exactly for `wouldCreateCycle`/`linkParent`/`deleteMember`: import the function by name from
the service module, `describe('<functionName>', () => { it('<precise behavior in plain English>', async () => {...}) })`.

**Rejection-path test pattern** (no direct `.rejects.toThrow()` example in `auth.test.js`'s first 80
lines, but the file's null-return pattern — lines 39-46, 48-56 — is the closest analog for "bad input →
sentinel/rejection" assertions):
```javascript
it('returns null without invoking findByPk when there is no Authorization header', async () => {
  const req = { headers: {} };
  const models = { User: { findByPk: () => { throw new Error('should not be called'); } } };

  const result = await getUserFromRequest(req, models);

  expect(result).toBeNull();
});
```
The "assert the forbidden path is never reached" idiom (stubbing `findByPk` to throw if called) is
directly reusable for cycle-rejection tests: construct a candidate cycle, call `linkParent(...)`, and
assert `await expect(linkParent(childId, { motherId: candidateId })).rejects.toThrow()` — matching
RESEARCH.md's Open Question #2 guidance to assert rejection without pinning exact message text.

**Transactional delete tests** — no direct analog exists anywhere in the test suite (first use of
`sequelize.transaction()` in the codebase per Pattern 5 in RESEARCH.md). Combine `database.test.js`'s
real-DB `create`/`count`/`findByPk` idiom with `auth.test.js`'s `describe(functionName)` / precise
`it()` naming to write `FamilyMember.delete.test.js`: create a real fixture tree via
`models.FamilyMember.create(...)` calls, call `deleteMember(id)`, then assert survivors/removals via
`models.FamilyMember.findByPk(...)` returning `null` or a populated instance.

---

## Shared Patterns

### Error handling — plain `Error` objects, thrown synchronously or via promise rejection
**Source:** `backend/src/utils/auth.js:35,40` (`requireAuth`, `requireAdmin`)
**Apply to:** `familyMember.service.js`'s `linkParent` (cycle rejection), `setSpouse` (self-marriage
rejection, if surfaced outside the model-level validator), and any other guard clause.
```javascript
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}
```
No custom `AppError`/error-code classes exist anywhere in the codebase — do not introduce one for this
phase; match the plain-`Error`-with-message convention exactly (CLAUDE.md "Error Handling" section
confirms this project-wide).

### Model init function signature
**Source:** `backend/src/models/User.js:10-76` (`initUser(sequelize)`)
**Apply to:** `FamilyMember.js` (`initFamilyMember`), `Spouse.js` (`initSpouse`)
```javascript
export function initUser(sequelize) {
  User.init({ /* attributes */ }, { sequelize, modelName: 'User', tableName: 'users', hooks: {...} });
  return User;
}
```

### Barrel/aggregator registration
**Source:** `backend/src/models/index.js:1-15` (current state)
**Apply to:** the extended `index.js` (add `FamilyMember`/`Spouse` to the flat `models` object; wire
associations after all `init*` calls, per RESEARCH.md Pattern 2's explicit ordering requirement).

### Test isolation via shared `_test` DB + `resetTables()`
**Source:** `backend/test/helpers.js:24-26` (existing `resetTables()`), `backend/test/globalSetup.js` (whole file)
**Apply to:** every new integration test file (`FamilyMember.associations.test.js`, `Spouse.test.js`,
`FamilyMember.cycle.test.js`, `FamilyMember.delete.test.js`) — extend `resetTables()` to also truncate
`spouses` then `family_members` (FK-safe order, per RESEARCH.md Wave-0 gap list) rather than writing new
ad hoc cleanup in each test file:
```javascript
export async function resetTables() {
  await models.User.destroy({ where: {}, truncate: true });
}
```
→ extend to:
```javascript
export async function resetTables() {
  await models.Spouse.destroy({ where: {}, truncate: true });
  await models.FamilyMember.destroy({ where: {}, truncate: true });
  await models.User.destroy({ where: {}, truncate: true });
}
```
(Order matters: `Spouse` references `FamilyMember` via FK, so it must be truncated first.)

### Vitest describe/it structure with REQ-ID tagging
**Source:** `backend/src/models/User.test.js:51,87` (`describe('... (SESS-01)', ...)`, `describe('... (VERIFY-01)', ...)`)
**Apply to:** all new test files — tag `describe` blocks with the relevant REQ-ID (MEM-01, MEM-02,
MEM-03, REL-01, REL-02, REL-03, REL-05, or the D-0x decision number) so test intent traces back to
CONTEXT.md/REQUIREMENTS.md.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Association wiring block in `models/index.js` (`belongsTo`/`hasMany`/`onDelete` config) | config | event-driven (FK cascade) | First use of Sequelize associations anywhere in the codebase — `User` has zero associations. Follow RESEARCH.md Pattern 2 verbatim; no in-repo precedent exists. |
| `Spouse.js`'s canonical-ordering `beforeValidate` hook + unique composite index | model | CRUD (join table) | No join-table/many-to-many model exists in the codebase today. The `beforeValidate(instance) {...}` *mechanic* is reused from `User.js`, but the ordering logic itself has no analog — follow RESEARCH.md Pattern 3. |
| `wouldCreateCycle` / ancestor-chain BFS walk | service (transform) | transform (graph traversal) | No graph-traversal code exists anywhere in the codebase (single-model, association-free until this phase). Follow RESEARCH.md Pattern 4 verbatim. |
| `deleteMember`'s `sequelize.transaction(...)` wrapper | service (transform) | event-driven (multi-model transactional mutation) | First use of `sequelize.transaction()` in the codebase — no existing transactional code to pattern-match. Follow RESEARCH.md Pattern 5 verbatim. |

## Metadata

**Analog search scope:** `backend/src/models/`, `backend/src/utils/`, `backend/test/`, `backend/src/resolvers/` (test-helper usage only)
**Files scanned:** `User.js`, `User.test.js`, `models/index.js`, `database.test.js`, `config/database.js`,
`vitest.config.js`, `test/globalSetup.js`, `test/guard.js`, `test/helpers.js`, `utils/auth.js`, `utils/auth.test.js`
**Pattern extraction date:** 2026-07-21
