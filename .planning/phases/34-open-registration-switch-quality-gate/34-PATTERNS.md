# Phase 34: Open-Registration Switch & Quality Gate - Pattern Map

**Mapped:** 2026-09-09
**Files analyzed:** 21 (8 backend new, 7 backend modified, 2 frontend new, 4 frontend modified)
**Analogs found:** 21 / 21 (4 *sub-patterns* inside those files have no in-repo precedent — see § No Analog Found)

> Every excerpt below was read from the working tree this pass. Line numbers are current as of commit `9d21c71`.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `backend/src/models/AppSetting.js` | NEW | model | CRUD (single-row read, upsert) | `backend/src/models/AuditLog.js` | exact |
| `backend/src/utils/appSettings.js` | NEW | utility (shared predicate) | request-response read + seed | `backend/src/utils/audit.js` + `backend/src/utils/emailPolicy.js` | role-match (composite) |
| `backend/src/utils/appSettings.test.js` | NEW | test (unit) | — | `backend/src/utils/emailPolicy.test.js` | exact |
| `backend/src/schemas/setting.schema.js` | NEW | schema (SDL module) | — | `backend/src/schemas/invitation.schema.js` (type + `extend`) / `approval.schema.js` (minimal) | exact |
| `backend/src/resolvers/setting.resolver.js` | NEW | resolver | CRUD + transaction + audit | `backend/src/resolvers/approval.resolver.js` | exact |
| `backend/migrations/manual/021-create-app-settings.sql` | NEW | migration | schema DDL + seed | `017-create-audit-logs.sql` (shape) + `020-add-users-relationship-note.sql` (header style) | exact |
| `backend/src/resolvers/publicRegistrationSwitch.test.js` | NEW | test (integration) | request-response, `graphql()` harness | `backend/src/resolvers/register.test.js` | exact |
| `backend/src/resolvers/security.boundaries.test.js` | NEW | test (integration) | **two** harnesses: `graphql()` + `httpClient()` | `createInvitation.test.js:89-110` (SEC-04) + `photo.serve.test.js:1-22` / `sessionRevocation.test.js:92-103` (SEC-05) | role-match (dual) |
| `backend/src/models/index.js` | EDIT | barrel | — | itself (`AuditLog` registration at `:6,:13,:116`) | exact |
| `backend/src/schemas/index.js` | EDIT | barrel | — | itself (`approvalTypeDefs` at `:4,:6`) | exact |
| `backend/src/resolvers/index.js` | EDIT | barrel | — | itself (`approvalResolvers` at `:4,:6`) | exact |
| `backend/src/resolvers/user.resolver.js` | EDIT | resolver | request-response guard insertion | itself (`assertRegistrationEmail` guard at `:263`) | exact |
| `backend/test/globalSetup.js` | EDIT | test config | — | itself (`:9-11`) | exact |
| `backend/test/helpers.js` | EDIT | test utility | — | itself (`resetTables` at `:28-41`) | exact |
| `README.md` § Manual Database Migrations | EDIT | docs | — | `README.md:319-337` (018 section) | exact |
| `frontend/src/components/PublicSignupSwitch.jsx` | NEW | component | CRUD (read + mutate + confirm) | `frontend/src/pages/ApprovalsPage.jsx` | exact (UI-SPEC-mandated verbatim carry) |
| `frontend/src/components/PublicSignupSwitch.test.jsx` | NEW | test (component) | — | `frontend/src/pages/ApprovalsPage.test.jsx` + `AdminMemberTable.test.jsx:145-164` | exact |
| `frontend/src/pages/InvitationsPage.jsx` | EDIT | page (composition) | — | itself (`:18-23`) | exact |
| `frontend/src/pages/InvitationsPage.test.jsx` | EDIT | test (component) | — | itself (`:18-22`) | exact |
| `frontend/src/pages/Register.jsx` | EDIT | page | request-response gate | itself (`:89-105`) + `AuthShell.jsx:9-52` | exact |
| `frontend/src/pages/Register.test.jsx` | EDIT | test (component) | — | `InvitationsPage.test.jsx:18-22` (dispatching mock) | role-match |

---

## Pattern Assignments

### `backend/src/models/AppSetting.js` (model, CRUD)

**Analog:** `backend/src/models/AuditLog.js` — the only other "simple table, no hooks, no associations declared in-file, one non-default timestamp" model.

**Whole-file pattern** (`AuditLog.js:1-25`) — copy this structure verbatim, swapping the fields:

```js
import { DataTypes, Model } from 'sequelize';

export class AuditLog extends Model {}

// Append-only audit trail for invitation lifecycle events (create / register /
// approve / reject). Rows are immutable, so only createdAt is tracked.
// actorUserId / invitationId / targetUserId are added by the associations in
// models/index.js.
export function initAuditLog(sequelize) {
  AuditLog.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      action: { type: DataTypes.STRING, allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true }
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      updatedAt: false
    }
  );

  return AuditLog;
}
```

**What to carry:**
- Named class export + named `initX(sequelize)` factory that returns the model (both are imported by `models/index.js`).
- A block comment above the factory explaining *why* the timestamp config is non-default. `AppSetting` inverts it: `createdAt: false`, `updatedAt` kept (RESEARCH Pattern 1).
- `DataTypes.INTEGER.UNSIGNED` for `updatedById` — matches `audit_logs.actorUserId INT UNSIGNED` (`017-create-audit-logs.sql:11`) and the `users.id` column type.

**Explicit column widths (Pitfall 6, E-8):** `AuditLog.js:13` uses a bare `DataTypes.STRING` because `audit_logs.action` is genuinely `VARCHAR(255)` (`017:10`). `AppSetting` must **not** copy the bare form — write `DataTypes.STRING(64)` / `DataTypes.STRING(255)` so the model matches migration 021 exactly.

**No-FK precedent for `updatedById`** — `backend/src/models/User.js` `approvedBy` is a plain unassociated `INTEGER.UNSIGNED`. Do **not** add an `AppSetting.belongsTo(User, …)` in `models/index.js`; that is what keeps `app_settings` out of `resetTables`' FK dance (`helpers.js:34-40`).

---

### `backend/src/utils/appSettings.js` (utility — THE shared predicate, D-07)

This is the phase's load-bearing file. Two in-repo analogs combine into it.

**Analog A — thin helper over a model:** `backend/src/utils/audit.js:1-14` (whole file)

```js
// Append-only audit trail helper for the invitation lifecycle. Writing an audit
// entry must never break the primary operation, so callers may fire-and-forget
// (with a .catch) or await inside the same transaction — this helper simply
// creates the row and lets the caller decide.
export async function writeAuditLog(
  models,
  { action, actorUserId = null, invitationId = null, targetUserId = null, metadata = null },
  options = {}
) {
  return models.AuditLog.create(
    { action, actorUserId, invitationId, targetUserId, metadata },
    options
  );
}
```

Carry: takes `models` as its **first parameter** (never imports the model directly — this is what makes `vi.spyOn` on the namespace work and keeps the helper testable); named export; a header comment that states the contract for callers.

**Analog B — named constant + exported function that multiple call sites share:** `backend/src/utils/emailPolicy.js:48-56`

```js
export const MAX_EMAIL_LENGTH = 254;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 254 characters or fewer.');
  if (!isEmail(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
```

**This file is the closest in-repo precedent for the D-07 constraint itself.** Its 45-line header comment (`emailPolicy.js:3-47`) documents the exact same remedy Phase 34 needs, applied to the email-validator divergence:

> "this guard front-runs `models/User.js`'s `validate: { isEmail: true }` … It **imports and calls the identical `isEmail` function the model uses**, with default options, so the two can never disagree — **agreement is guaranteed by construction, not approximated by a hand-rolled regex**."

Copy that *documentation shape* into `appSettings.js`'s header: name the callers, name the bug class, and state that agreement is structural. `passwordPolicy.js:1-3` is the minimal version of the same "one exported predicate, many callers" shape.

**Call-site contract to enforce:** `Query.publicRegistrationEnabled`, `Query.publicRegistrationSetting`, and `Mutation.register`'s tokenless branch all import `isPublicRegistrationEnabled` from this module. `user.resolver.js` must never import `AppSetting` or `PUBLIC_REGISTRATION_KEY`.

**Seeding function placement:** `seedDefaultAppSettings(models)` lives in this same module (RESEARCH Pattern 8) and is called from `test/globalSetup.js` and `test/helpers.js` only — **never** from `models/index.js`'s `initializeDatabase()` (E-9).

---

### `backend/src/utils/appSettings.test.js` (test, unit)

**Analog:** `backend/src/utils/emailPolicy.test.js:1-53`

```js
import { describe, it, expect } from 'vitest';
import { assertRegistrationEmail, MAX_EMAIL_LENGTH } from './emailPolicy.js';
import { models } from '../models/index.js';

describe('assertRegistrationEmail', () => {
  it('does not throw for a well-formed email and returns it normalized (lowercased, trimmed)', () => {
    expect(assertRegistrationEmail(' ADA@Example.com ')).toBe('ada@example.com');
  });
  …
  it('exports MAX_EMAIL_LENGTH as 254, matching validator.isEmail\'s RFC 5321 practical length limit rather than the wider VARCHAR(255) column', () => {
    expect(MAX_EMAIL_LENGTH).toBe(254);
  });
});
```

**Carry:** util tests live **beside the util** (`src/utils/x.test.js`), import from `'./x.js'` (relative, same dir), and the exported constant gets its own pinning assertion. Long, explanatory `it(...)` titles that name the decision/finding are the house style throughout this repo.

Note this file imports `models` even in a "unit" test — `appSettings.test.js` will need `resetTables` + real rows for the absent/garbage/throw cases, so it is a DB-touching unit test like the rest of the suite.

---

### `backend/src/schemas/setting.schema.js` (schema module)

**Analog A — minimal `extend` module:** `backend/src/schemas/approval.schema.js:1-6` (whole file)

```js
export const approvalTypeDefs = `#graphql
  extend type Mutation {
    approveUser(userId: ID!): User!
    rejectUser(userId: ID!, reason: String): User!
  }
`;
```

**Analog B — module that declares its own types *and* extends both roots:** `backend/src/schemas/invitation.schema.js:34-48`

```js
  # The raw registration URL is returned ONCE here at creation — the token
  # behind it is never stored or returned again.
  type CreateInvitationResult {
    invitation: Invitation!
    registrationUrl: String!
  }

  extend type Query {
    myInvitations: [Invitation!]!
    invitations: [Invitation!]!
  }

  extend type Mutation {
    createInvitation(input: CreateInvitationInput!): CreateInvitationResult!
  }
```

`setting.schema.js` needs Analog B's shape (a `PublicRegistrationSetting` type + `extend type Query` + `extend type Mutation`). Carry the `#graphql` pragma on line 1, the `settingTypeDefs` naming, and the `#` comment above a type that needs a rationale.

**Base roots for reference** (`user.schema.js:52-72`) — this is the SDL the D-12 sweep enumerates:

```graphql
  type Query {
    me: User
    dashboard: Dashboard!
    users: [User!]!
    unlinkedUsers: [User!]!
    pendingApprovals: [User!]!
  }

  type Mutation {
    register(token: String, name: String!, email: String, password: String!, relationshipNote: String): RegisterPayload!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    …
  }
```

---

### `backend/src/resolvers/setting.resolver.js` (resolver, CRUD + transaction + audit)

**Analog:** `backend/src/resolvers/approval.resolver.js` — the only resolver module that combines `requireAdmin` + a `sequelize.transaction` + `writeAuditLog`.

**Imports** (`approval.resolver.js:1-3`):

```js
import { requireAdmin } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';
```

**Module shape + guard-first ordering** (`:14-26`):

```js
export const approvalResolvers = {
  Mutation: {
    // Admin approves an account directly: activate the user and stamp the
    // decision onto the User row itself (D-04), whether or not an Invitation
    // row exists. …
    approveUser: async (_parent, { userId }, { models, user }) => {
      requireAdmin(user);

      const sequelize = models.User.sequelize;
      let target;
      let invitation;
      await sequelize.transaction(async (t) => {
```

**Carry:** `export const xResolvers = { Query: {...}, Mutation: {...} }`; `requireAdmin(user)` as the literal first statement of the body; `const sequelize = models.X.sequelize` (never import the sequelize instance); `let` declared outside the transaction callback and assigned inside so the value survives for the return.

**Write-inside-transaction** (`:44-47`):

```js
        await target.update({ status: 'Active', approvedAt: now, approvedBy: user.id }, { transaction: t });
        if (invitation) {
          await invitation.update({ status: 'Approved', approvedAt: now, approvedBy: user.id }, { transaction: t });
        }
```

**Audit write — the ONE place Phase 34 deliberately diverges** (`:53-58`):

```js
      writeAuditLog(models, {
        action: 'user.approved',
        actorUserId: user.id,
        invitationId: invitation?.id ?? null,
        targetUserId: target.id
      }).catch((err) => console.error('Failed to write audit log:', err));
```

All five production call sites (`approval.resolver.js:53,:95`, `invitation.resolver.js:62`, `user.resolver.js:233,:313,:535`) are fire-and-forget with `.catch()`. RESEARCH Pattern 4 / E-10 requires the flip mutation to be the **first in-transaction, awaited** caller: `await writeAuditLog(models, {...}, { transaction: t })`. `audit.js:8` already accepts and forwards `options`, so no helper change. **Annotate this divergence in a comment** so a reviewer does not read it as an inconsistency.

**Action-string naming** (`:54`, `:96`, `user.resolver.js:314`): dot-namespaced lowercase — `'user.approved'`, `'user.rejected'`, `'user.self_registered'`. The flip's action follows: `'setting.public_registration_changed'`.

**Guard-message reuse** — `requireAdmin` (`auth.js:42-45`) already throws the exact string the SEC-04 matrix asserts:

```js
export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```

---

### `backend/migrations/manual/021-create-app-settings.sql` (migration)

**Analog A — CREATE TABLE shape:** `017-create-audit-logs.sql:1-24` (whole file)

```sql
-- Manual, one-time migration (Invitation milestone, Phase 1).
--
-- Creates the append-only audit_logs table for invitation lifecycle events
-- (invitation.create / register / approve / reject). Rows are immutable, so
-- there is no updatedAt column. All actor/target FKs SET NULL on delete so the
-- audit trail survives user/invitation removal.

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  action VARCHAR(255) NOT NULL,
  actorUserId INT UNSIGNED NULL DEFAULT NULL,
  …
  createdAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_action (action),
  …
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Carry:** `CREATE TABLE IF NOT EXISTS`; `INT UNSIGNED NULL DEFAULT NULL` for optional id columns; `DATETIME NOT NULL` for timestamps; `PRIMARY KEY (...)` declared at the bottom, not inline; the closing `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;` with **no** `COLLATE` (Pitfall 7).

**Analog B — header-comment house style:** `020-add-users-relationship-note.sql:1-27` — the most recent migration and the closest to Phase 34's tone. Its header has five distinct paragraphs the 021 header should mirror one-for-one:

1. `-- Manual, one-time migration (Phase 32 / REG-03 / D-04).` — phase + requirement + decision IDs on line 1.
2. Why `sequelize.sync()` does not do this automatically.
3. The domain rationale, naming the rejected alternative (`A synthetic Invitation row was explicitly rejected as an alternative: …`).
4. `-- No foreign key needed -- relationshipNote is a plain value column, not a reference to another table.`
5. `-- Portability: VARCHAR(500) has no cross-engine hazard between local MariaDB and prod MySQL 8.4 (unlike 018's utf8mb4-collation pitfall) -- this column type applies unchanged to both engines.`

RESEARCH's § Code Examples "Migration 021 skeleton" is already written to this template — use it as-is.

**README section** — analog `README.md:319-337` (the 018 section), the most complete of the five:

```markdown
### Add Ge'ez-script name columns to family_members (Phase 18 / DATA-01, DATA-02)

<one paragraph: what it adds, what it does NOT do, and the failure symptom on an un-migrated DB>

1. Apply the migration against your database, using the `DB_USER`/`DB_PASSWORD`/`DB_NAME` values from the active env file:

   ```bash
   docker compose --env-file env/local.env exec -T mysql mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < backend/migrations/manual/018-add-family-members-geez-names.sql
   ```

   Or run the equivalent statements with any MySQL client pointed at your `DB_HOST`/`DB_PORT`/`DB_NAME`.

2. Boot the backend against that same database and confirm:
   - No `Unknown column 'geezFirstname'` … error appears in the startup/request logs.
   - `curl http://localhost:4000/health` returns `{"status":"ok"}`.

**Portability (D-03):** …
```

For 021 the step-2 verification is different in kind (the table is auto-created by `sync()`, so there is no error to look for): assert instead that `SELECT * FROM app_settings` returns the seeded `public_registration_enabled = 'true'` row, and that `/invitations` reads **open** rather than "Public signup is closed — Not changed since setup." (E-8 recommendation 4).

---

### `backend/src/resolvers/user.resolver.js` (EDIT — one guard in the tokenless branch)

**Analog: the file itself.** The guard-import + guard-call idiom already exists three times in the same branch.

**Import block to extend** (`user.resolver.js:18-22`):

```js
import { assertPasswordStrength } from '../utils/passwordPolicy.js';
import { assertRegistrationName } from '../utils/namePolicy.js';
import { assertRegistrationEmail } from '../utils/emailPolicy.js';
import { assertRelationshipNoteLength } from '../utils/relationshipNotePolicy.js';
import { writeAuditLog } from '../utils/audit.js';
```

Add `import { isPublicRegistrationEnabled } from '../utils/appSettings.js';` here — and **nothing else** from that module.

**Insertion point** (`user.resolver.js:246-263`) — insert immediately before `const startedAt = Date.now();` at `:260`:

```js
      // Tokenless self-registration (REG-02). Enumeration-silent and
      // timing-safe (SEC-01, D-08, D-09): the taken/free/create-failure
      // outcomes below all return the byte-identical message via the shared
      // finishTokenlessRegistration exit path, the bcrypt hash is computed
      // BEFORE the existing-user lookup so every outcome pays the same base
      // cost, …
      const startedAt = Date.now();
      assertRelationshipNoteLength(relationshipNote);
      const cleanName = assertRegistrationName(name);
      const normalizedEmail = assertRegistrationEmail(email);
```

**Carry:** the guard is a bare statement (`assertX(...)` / `if (!(await …)) throw new Error(...)`), placed above the `try {` at `:275`, with a comment block above it explaining the ordering constraint. This matches how `:261-263`'s three validators are already positioned outside the guarded try/catch, and CLAUDE.md § Error Handling ("Guards throw, they don't return").

**Header comment that must be updated** (`:168-177`) — the register resolver's own doc comment currently ends:

```js
    // works (the invited branch does not -- see verifyEmail's
    // auto-activation logic). No environment-gated feature switch guards
    // this branch: it is live the moment this code deploys (D-03).
```

That last sentence becomes false. Rewrite it to say the branch is gated by the **stored** `app_settings` row (34 D-01/D-02), and that Phase 32 D-03's *env-var* ban still stands.

**Branch structure that makes D-08 free** (`:181`, `:241-244`): the `if (token) { … return { message: … }; }` block always returns, so any statement after `:244` is reachable only when `token` is falsy. No second `!token` condition is needed — and adding one would create a second predicate that can drift.

---

### `backend/src/resolvers/publicRegistrationSwitch.test.js` (test, integration — D-02 states + D-07 agreement)

**Analog:** `backend/src/resolvers/register.test.js`

**File preamble** (`register.test.js:1-24`) — copy verbatim, including the `vi.mock` placement *above* the import of the mocked module and the separate `import * as authUtils` namespace import:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { MIN_REGISTER_RESPONSE_MS } from './user.resolver.js';

vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationAttemptEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendVerificationEmail, sendPendingRegistrationEmail, sendRegistrationAttemptEmail } from '../services/mailer.js';
import { createInvitationToken, hashInvitationToken, hashVerificationToken } from '../utils/auth.js';
import * as authUtils from '../utils/auth.js';

const REGISTER_MUTATION = `
  mutation Register($token: String, $name: String!, $email: String, $password: String!, $relationshipNote: String) {
    register(token: $token, name: $name, email: $email, password: $password, relationshipNote: $relationshipNote) { message }
  }
`;

const SUCCESS_MESSAGE = 'Registration received. Verify your email to activate your account.';
```

`register.test.js:27-40`'s `makeInvitation(overrides)` helper is the fixture the D-08 control ("invited register still works while closed") should reuse.

**★ The ESM-namespace `vi.spyOn` idiom the D-07 call-count assertion depends on — VERIFIED** (`register.test.js:459-479`):

```js
    it('never leaks raw error text when createVerificationToken throws on the free-email path (CR-03)', async () => {
      const injectedMessage = 'crypto.randomBytes failed';
      const tokenSpy = vi.spyOn(authUtils, 'createVerificationToken').mockImplementationOnce(() => {
        throw new Error(injectedMessage);
      });

      try {
        const result = await graphql(REGISTER_MUTATION, {
          name: 'CR03 Token',
          email: 'cr03-token@example.com',
          password: 'Password123!'
        });

        expect(result.errors).toBeUndefined();
        …
      } finally {
        tokenSpy.mockRestore();
      }
    });
```

This is proof the idiom works in this repo: `authUtils` is a `import * as` namespace of a live ESM module, `user.resolver.js` imports `createVerificationToken` by name from it, and replacing it via `vi.spyOn` **changes the resolver's observable behaviour**. Phase 34's D-07 call-count assertion (`vi.spyOn(appSettings, 'isPublicRegistrationEnabled')` → `toHaveBeenCalledTimes(1|2|3)`) rides on exactly this mechanism. Carry the `try { … } finally { spy.mockRestore(); }` bracketing — every spy in this repo is restored in a `finally`.

**Injecting a throwing read** (`register.test.js:436-457`):

```js
    it('never leaks raw ORM/DB error text when models.User.findOne rejects (CR-03)', async () => {
      const injectedMessage = 'SequelizeConnectionError: connection pool exhausted';
      const findOneSpy = vi.spyOn(models.User, 'findOne').mockRejectedValueOnce(new Error(injectedMessage));
      try {
        …
      } finally {
        findOneSpy.mockRestore();
      }
    });
```

For D-02's "read throws" agreement row, use `mockRejectedValue` (**no** `Once`) on `models.AppSetting.findByPk` — the test makes two calls and both must see the throw (RESEARCH Pattern 3).

**Password must be strong in every case** (Pitfall 3): `assertPasswordStrength(password)` at `user.resolver.js:179` runs *above* the `if (token)` branch. Every refusal case must use `'Password123!'` (the repo-wide fixture password, `helpers.js:49`) and assert the **exact** closed-door message — otherwise the test passes for the wrong reason and stays green when the switch check is deleted.

**Small-matrix file layout:** `accountStatus.test.js:1-13` is the readable template for a file made of short `describe` blocks with `beforeEach(resetTables)` at module scope:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
…
beforeEach(resetTables);
```

---

### `backend/src/resolvers/security.boundaries.test.js` (test, integration — **two harnesses, one file**)

**★ The harness split is the single most important thing in this file.** Both harness definitions live in `backend/test/helpers.js`:

```js
// backend/test/helpers.js:12-14  — SEC-05 MUST use this one
export function httpClient() {
  return request(app);
}

// backend/test/helpers.js:16-26  — SEC-04 uses this one; SEC-05 MUST NOT
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  // A fresh createLoaders(models) call per graphql() invocation -- never
  // hoisted to module scope -- gives every test call the same per-request
  // loader isolation a real request would get through server.js's context
  // factory (D-07).
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp, loaders: createLoaders(models) } }
  );
  return response.body.singleResult;
}
```

`graphql()` puts `user` **straight into `contextValue`**. `getUserFromRequest` never runs — and `getUserFromRequest` (`auth.js:29-33`) *is* the gate SEC-05 exists to prove:

```js
  if (!user.emailVerified) return null;

  // Only Active accounts may authenticate. A Pending (awaiting-approval),
  // Rejected, or Disabled user's token is treated as not-logged-in.
  if (user.status !== 'Active') return null;
```

**SEC-04 cell template — `graphql()` with a non-admin actor** (`createInvitation.test.js:99-110`):

```js
  // F-01/SC-1: the adversarial actor INVITE-01 names -- linked, Active,
  // non-admin. Proves the guard is enforced server-side, not merely hidden in
  // the UI (D-01).
  it('refuses a linked, Active, non-admin member (F-01/SC-1)', async () => {
    const member = await activeMember();
    const { errors } = await graphql(
      CREATE_INVITATION,
      { input: { invitedEmail: 'x@example.com' } },
      member
    );
    expect(errors[0].message).toBe('Admin access is required.');
  });
```

Carry: destructure `{ errors }` from `graphql()`; assert `errors[0].message` against the **exact** string; name the requirement/decision ID in the `it()` title.

**★ SEC-05 sweep template — `httpClient()` + a real `signToken` Bearer header. WORKING IN-REPO EXAMPLE:** `photo.serve.test.js:1-22` — the only file that combines `httpClient()`, `signToken()`, and `createTestUser()`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { signToken } from '../utils/auth.js';
import { validJpegBuffer } from '../../test/fixtures/images.js';

beforeEach(resetTables);

async function createLinkedActor() {
  const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  const user = await createTestUser({ role: 'USER', familyMemberId: member.id });
  const token = signToken(user);
  return { member, user, token };
}

async function uploadPhoto(member, token) {
  const res = await httpClient()
    .post(`/api/family-members/${member.id}/photo`)
    .set('Authorization', `Bearer ${token}`)
    .attach('photo', validJpegBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  expect(res.status).toBe(200);
}
```

…and its 401 assertion shape (`photo.serve.test.js:44-57`), which is exactly the shape RESEARCH Pattern 7's three photo-route cells need:

```js
  it('rejects a request with no or an invalid JWT with 401', async () => {
    …
    const invalidAuthRes = await httpClient()
      .get(`/api/family-members/${member.id}/photo`)
      .set('Authorization', 'Bearer not-a-real-token');
    expect(invalidAuthRes.status).toBe(401);
    expect(invalidAuthRes.body.error).toBe('You must be logged in to perform this action.');
  });
```

**HTTP POST to `/graphql` with a Bearer header** (`sessionRevocation.test.js:92-103`) — the response-shape difference the sweep must respect (`res.body.data` / `res.body.errors`, **not** the destructured `{ data, errors }` that `graphql()` returns):

```js
    // Negative case: the pre-reset token (iat floor 11:59:59) must now be rejected.
    const meWithPreResetToken = await httpClient()
      .post('/graphql')
      .set('Authorization', `Bearer ${preResetToken}`)
      .send({ query: ME_QUERY });
    expect(meWithPreResetToken.body.data.me).toBeNull();
```

That line is also the pre-existing proof of E-1's `me`-is-not-public claim: over HTTP, a revoked token makes `me` resolve to `null` with no error. `NULL_RESULT_FIELDS` gets the same assertion.

**Pending-actor construction** (`accountStatus.test.js:48-53`) — the existing chokepoint test, and the exact fixture the sweep's actor copies:

```js
describe('getUserFromRequest account-status gating', () => {
  it('returns null for a non-Active user even with an otherwise-valid token', async () => {
    const user = await createTestUser({ email: 'pending2@example.com', status: 'Pending', emailVerified: true });
    const req = { headers: { authorization: `Bearer ${signToken(user)}` } };
    expect(await getUserFromRequest(req, models)).toBeNull();
  });
```

**Schema source for the enumeration** (`backend/src/graphql/serverConfig.js:1-2,:32`):

```js
import { typeDefs } from '../schemas/index.js';
import { resolvers } from '../resolvers/index.js';
…
export { typeDefs, resolvers };
```

`typeDefs` is an **array** of four template strings (`schemas/index.js:6`), so `buildSchema(typeDefs.join('\n'))` is the call. Import from `'../schemas/index.js'` directly (as `helpers.js:4` does via `serverConfig.js`) — do not reach into the ApolloServer instance.

**Mailer mock for the SEC-04 admin positive controls** (`sessionRevocation.test.js:1-8` shows the minimal form; `register.test.js:7-12` the full one):

```js
vi.mock('../services/mailer.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendPasswordResetEmail } from '../services/mailer.js';
```

---

### `backend/src/models/index.js` (EDIT — barrel)

**Analog: the file itself**, `AuditLog`'s registration. Three edits, all mirroring `AuditLog`:

```js
// :6   import
import { initAuditLog, AuditLog } from './AuditLog.js';
// :13  init (order matters only for associations; AppSetting has none)
initAuditLog(sequelize);
// :111-117 export
export const models = {
  User,
  FamilyMember,
  Spouse,
  Invitation,
  AuditLog
};
```

**Do NOT add an `AppSetting.belongsTo(User, …)` block** in the `// --- Audit log associations ---` region (`:91-109`). `updatedById` is FK-less by design (E-5 / Pattern 1).

**Do NOT touch `initializeDatabase()`** (`:119-135`):

```js
export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
  // Fail fast at boot if a manual migration was never applied to this target
  // (Plan 32-08 / CR-03 follow-on) -- see assertRequiredColumns.js for why.
  //
  // NOTE: this wiring is exercised at real backend boot (server.js) but is
  // NOT exercised by `npm test`'s integration suite -- backend/test/globalSetup.js
  // calls sequelize.sync({ force: true, ... }) directly, bypassing
  // initializeDatabase() entirely …
  await assertRequiredColumns(sequelize);
}
```

E-9: no `seedDefaultAppSettings` call here. E-8: no new `assertRequiredColumns` entry for `app_settings` — `sync()` at `:121` runs first and would have already created the table, making the assert dead code.

---

### `backend/src/schemas/index.js` and `backend/src/resolvers/index.js` (EDIT — barrels)

**Analog: the files themselves.** Both are 6 lines, same shape, and both take exactly two new lines:

```js
// schemas/index.js:1-6
import { userTypeDefs } from './user.schema.js';
import { familyMemberTypeDefs } from './familyMember.schema.js';
import { invitationTypeDefs } from './invitation.schema.js';
import { approvalTypeDefs } from './approval.schema.js';

export const typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs, approvalTypeDefs];
```

```js
// resolvers/index.js:1-6
import { userResolvers } from './user.resolver.js';
import { familyMemberResolvers } from './familyMember.resolver.js';
import { invitationResolvers } from './invitation.resolver.js';
import { approvalResolvers } from './approval.resolver.js';

export const resolvers = [userResolvers, familyMemberResolvers, invitationResolvers, approvalResolvers];
```

Append `settingTypeDefs` / `settingResolvers` last in both, matching the import order. The `user.*` module must stay **first** in `typeDefs` — it declares the base `type Query` / `type Mutation` that every other module `extend`s.

---

### `backend/test/globalSetup.js` and `backend/test/helpers.js` (EDIT — Wave 0, shared)

**Analog: the files themselves.**

`globalSetup.js:1-17` (whole file) — the seed goes after `sync`, before the returned teardown:

```js
import { assertTestDatabase } from './guard.js';

export default async function setup() {
  assertTestDatabase();

  // Import the models aggregator (not config/database.js directly) so the
  // User model is registered on the sequelize instance before sync() runs
  // — sync() only creates tables for models already attached to the instance.
  const { sequelize } = await import('../src/models/index.js');
  await sequelize.authenticate();
  await sequelize.sync({ force: true, match: /_test$/ });

  return async function teardown() { … };
}
```

Note the dynamic `await import(...)` — this file deliberately does **not** static-import models. `seedDefaultAppSettings` must be pulled from the same dynamic import (`const { models } = await import('../src/models/index.js')`), not added as a top-level static import.

`helpers.js:28-41` — `resetTables`, called in a `beforeEach` by 44 backend test files:

```js
export async function resetTables() {
  // MySQL forbids TRUNCATE on any table still referenced by a foreign key
  // (family_members self-references itself via motherId/fatherId, and
  // spouses references family_members), even once the referencing rows are
  // gone. Disabling FK checks around the truncate sequence is the standard
  // pattern for FK-constrained test resets.
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await models.AuditLog.destroy({ where: {}, truncate: true });
  await models.Invitation.destroy({ where: {}, truncate: true });
  await models.Spouse.destroy({ where: {}, truncate: true });
  await models.FamilyMember.destroy({ where: {}, truncate: true });
  await models.User.destroy({ where: {}, truncate: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

**Carry:** `models.X.destroy({ where: {}, truncate: true })`, ordered child→parent, all inside the FK-checks-off block. The **re-seed** goes *after* `SET FOREIGN_KEY_CHECKS = 1` (Pattern 8) so it commits against a normal FK-checked connection.

`createTestUser` (`helpers.js:45-57`) is the actor factory every new test uses — note `passwordHash: 'Password123!'` is a plaintext value re-hashed by the model hook, and `status: 'Active'` is the default that Pending actors must override:

```js
export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    emailVerified: true,
    // Existing/seed users represent already-approved accounts; invitation-flow
    // tests opt into 'Pending'/'Rejected'/'Disabled' explicitly.
    status: 'Active',
    ...overrides
  });
}
```

---

### `frontend/src/components/PublicSignupSwitch.jsx` (component, CRUD)

**Analog:** `frontend/src/pages/ApprovalsPage.jsx` — 34-UI-SPEC.md cites it at `:46-47`, `:70-74`, `:98`, `:125`, `:126`, `:146`, `:176-198` and requires several shapes be carried **verbatim**.

**Imports** (`ApprovalsPage.jsx:1-20`) — multi-line named MUI import, alphabetized; one icon per line from `@mui/icons-material/X`; relative `.js`/`.jsx` extensions on every local import:

```js
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, TextField, Typography
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import { graphqlRequest } from '../api/graphqlClient.js';
import { colors } from '../theme.js';
```

(For a file under `components/`, `../api/graphqlClient.js` and `../theme.js` resolve identically — `AuthShell.jsx:1-3` confirms.)

**Query/mutation constants** (`ApprovalsPage.jsx:22-35`) — SCREAMING_SNAKE_CASE module constants, multi-line template literal for the query, one-liners for mutations:

```js
const PENDING_APPROVALS_QUERY = `
  query PendingApprovals {
    pendingApprovals {
      id
      name
      …
    }
  }
`;

const APPROVE = `mutation Approve($id: ID!) { approveUser(userId: $id) { id status } }`;
const REJECT = `mutation Reject($id: ID!, $reason: String) { rejectUser(userId: $id, reason: $reason) { id status } }`;
```

**★ State split + `load` callback + effect** (`ApprovalsPage.jsx:44-60`) — 34-UI-SPEC.md's States table mandates carrying the `loadError`/`actionError` split (introduced by Phase 33 WR-01 precisely so one failed action cannot blank the whole surface):

```js
export default function ApprovalsPage() {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  …
  const load = useCallback(() => {
    return graphqlRequest(PENDING_APPROVALS_QUERY)
      .then((data) => setRows(data.pendingApprovals))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
```

`useState(null)` as the "not yet resolved" sentinel is what drives the Loading state (`:108`). `PublicSignupSwitch` uses the same `null`-means-loading convention for `enabled` — which is why UI-SPEC forbids rendering the `Switch` at all until it resolves.

**★ Action handler + re-read-on-failure** (`ApprovalsPage.jsx:62-78`) — carry this exactly, including the comment:

```js
  const handleApprove = async (row) => {
    setActionError('');
    setBusyId(row.id);
    try {
      await graphqlRequest(APPROVE, { id: row.id });
      await load();
    } catch (err) {
      setActionError(err.message);
      // WR-01 (33-REVIEW.md): re-run load() on failure so a row left stale
      // by a lost concurrent-admin race (approveReject.test.js documents
      // this exact scenario) is refreshed away rather than left clickable
      // behind the error banner.
      await load();
    } finally {
      setBusyId(null);
    }
  };
```

The `setError('')` → `setBusy(true)` → `try/await/await load()` → `catch { setError; await load(); }` → `finally { setBusy(false) }` skeleton is the whole flip handler. UI-SPEC's "Failed to flip → Switch returns to its last server-confirmed position, then re-read the setting" is precisely `await load()` in the catch.

**Region header + surface** (`ApprovalsPage.jsx:97-104` and `:125`; peer shape at `InvitePage.jsx:102-112`):

```jsx
    <Stack spacing={4} sx={{ maxWidth: 820, mx: 'auto' }}>
      <Box>
        <Typography variant="h4">Pending approvals</Typography>
        <Typography color="text.secondary">
          People who signed up on their own and verified their email, waiting for a decision on whether they're family.
        </Typography>
      </Box>
      …
        <Paper key={row.id} elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, border: `1px solid ${colors.line}` }}>
          <Stack spacing={0.5}>
            <Typography variant="h6">{row.name}</Typography>
            <Typography variant="body2" color="text.secondary">{row.email}</Typography>
          </Stack>
```

`sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, border: \`1px solid ${colors.line}\` }}` is the exact `Paper` treatment UI-SPEC says to carry verbatim, and `Stack spacing={0.5}` + `h6` over `body2 text.secondary` is the exact headline/attribution pair.

**Split row** (`ApprovalsPage.jsx:146`) — the shape UI-SPEC cites for the state-block-vs-Switch row (change `spacing={1.5}` → `spacing={2}` per its Spacing table):

```jsx
<Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5}>
```

**Confirmation dialog** (`ApprovalsPage.jsx:176-198`) — the "opening asks for confirmation" dialog copies this structure; note `Boolean(x)` for `open`, `fullWidth maxWidth="xs"`, the plain-text escape-hatch button naming the state you stay in ("Keep pending" → "Keep it closed"), and `variant="contained"` on the confirm:

```jsx
      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reject this request?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            They'll be notified they weren't approved. …
          </Typography>
          …
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>Keep pending</Button>
          <Button color="error" variant="contained" onClick={submitReject}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
```

**Drop `color="error"`** on the confirm button — UI-SPEC § Destructive is explicit that opening is reversible and must be default primary.

**★ Tooltip-wrapped Switch** — `frontend/src/components/manage/AdminMemberTable.jsx:142-151`:

```jsx
                  <TableCell onClick={(e) => e.stopPropagation()} sx={{ cursor: 'default' }}>
                    <Tooltip title={member.isAlive !== false ? 'Living — click to mark deceased' : 'Deceased — click to mark living'}>
                      <Switch
                        size="small"
                        checked={member.isAlive !== false}
                        onChange={() => onToggleAlive && onToggleAlive(member)}
                        inputProps={{ 'aria-label': `Toggle living status for ${member.fullname}` }}
                      />
                    </Tooltip>
                  </TableCell>
```

Carry: the `Tooltip title={state ? 'X — click to Y' : 'Y — click to X'}` ternary, the `inputProps={{ 'aria-label': … }}` accessible name, and the controlled `checked` + `onChange` pair. **Drop `size="small"`** — UI-SPEC § Switch sizing mandates the default (medium) here and explains why this is a deliberate deviation from `AdminMemberTable.jsx:145`.

**Error + Retry pair** (`DetailPage.jsx:198-207`) — the load-failure state, verbatim except for `minHeight: 44` on the button:

```jsx
  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <Alert severity="error">{error}</Alert>
        <Button variant="contained" onClick={loadInitial}>
          Retry
        </Button>
      </Box>
    );
  }
```

**Date formatting** (`AdminMemberTable.jsx:21-26`) — UI-SPEC § Date formatting names *this* helper, not `ApprovalsPage.jsx:37-42`'s `toLocaleString` variant:

```js
function formatWhen(value) {
  if (!value) return null;
  const ms = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
```

The `Number.isNaN(Number(value)) ? Date.parse(value) : Number(value)` dance is required — GraphQL `String` timestamps arrive as epoch-ms strings from this backend.

**Theme tokens** (`theme.js:7-30`) — every color UI-SPEC names is already exported; import `colors` and use `colors.primaryDark`, `colors.slate`, `colors.line`. Do not add tokens.

---

### `frontend/src/components/PublicSignupSwitch.test.jsx` (test, component)

**Analog A — mock + render + async-find:** `ApprovalsPage.test.jsx:1-41,:82-97`

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from './ApprovalsPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const ROW = { id: '9', name: 'Joseph Q', … };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ApprovalsPage', () => {
  …
  it('approves a registration by row.id directly and refetches', async () => {
    graphqlRequest
      .mockResolvedValueOnce({ pendingApprovals: [ROW] })
      .mockResolvedValueOnce({ approveUser: { id: '9', status: 'Active' } })
      .mockResolvedValueOnce({ pendingApprovals: [] });

    render(<ApprovalsPage />);
    await screen.findByText('Joseph Q');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveUser'), { id: '9' });
    });
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });
```

Carry: `vi.mock` of `graphqlClient.js` at module top, `import { graphqlRequest }` *after* it, module-scope fixture constants with a comment naming the review finding they regress-test, `await screen.findByText(...)` for the first paint, `waitFor` around the call assertion, and `expect.stringContaining('<fieldName>')` to identify which operation was sent.

**Use `mockImplementation` dispatching (not `Once` chains) for this file** — see the `Register.test.jsx` entry below; the component fires a read then a mutation then a re-read, and an order-sensitive chain will break the moment the plan adds a state.

**Analog B — asserting a MUI Switch:** `AdminMemberTable.test.jsx:145-164`

```js
    const toggle = screen.getByLabelText('Toggle living status for Ada Lovelace');
    expect(toggle).toBeChecked(); // undefined isAlive treated as living
    await userEvent.click(toggle);

    expect(onToggleAlive).toHaveBeenCalledWith(MEMBERS[0]);
    …
  it('reflects a deceased member as an unchecked toggle', () => {
    …
    expect(screen.getByLabelText('Toggle living status for Ada Lovelace')).not.toBeChecked();
  });
```

`getByLabelText(<the inputProps aria-label>)` + `toBeChecked()` / `not.toBeChecked()` is the house idiom. UI-SPEC sets the label to `'Public signup'`.

---

### `frontend/src/pages/InvitationsPage.jsx` + `.test.jsx` (EDIT)

**Analog: the files themselves.**

`InvitationsPage.jsx:1-26` (whole file) — the switch becomes a fourth-and-first region, reusing the `isAdmin &&` + `Divider` fragment already at `:18-23`:

```jsx
import { Divider, Stack } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { colors } from '../theme.js';
import InvitePage from './InvitePage.jsx';
import ApprovalsPage from './ApprovalsPage.jsx';

// One page for the whole invitation lifecycle: anyone can invite a family
// member (top), and admins additionally review pending registrations (bottom).
// Composed from the two previously-separate pages so each keeps its own data
// loading and tests.
export default function InvitationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Stack spacing={6} sx={{ maxWidth: 820, mx: 'auto' }}>
      <InvitePage />
      {isAdmin && (
        <>
          <Divider sx={{ borderColor: colors.line }} />
          <ApprovalsPage />
        </>
      )}
    </Stack>
  );
}
```

The `Divider sx={{ borderColor: colors.line }}` at `:20` is the exact element UI-SPEC says to copy verbatim after the new switch region. The file's header comment ("each keeps its own data loading and tests") is the stated justification for `PublicSignupSwitch` owning its own query/mutation/test.

`InvitationsPage.test.jsx:16-23` — **the dispatching-mock pattern**, which is also the pattern `Register.test.jsx` must adopt:

```js
beforeEach(() => {
  vi.clearAllMocks();
  graphqlRequest.mockImplementation((query) => {
    if (query.includes('myInvitations')) return Promise.resolve({ myInvitations: [] });
    if (query.includes('pendingApprovals')) return Promise.resolve({ pendingApprovals: [] });
    return Promise.resolve({});
  });
});
```

Add one `if (query.includes('publicRegistrationSetting')) …` branch. Because the mock dispatches on query text rather than call order, no existing assertion in this file shifts.

Its `useAuth` mock (`:5-8`) is how a component that reads auth context is tested:

```js
const useAuthMock = vi.fn();
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock()
}));
```

---

### `frontend/src/pages/Register.jsx` (EDIT — gate the `!token` branch)

**Analog: the file itself + `AuthShell.jsx`.**

**The branch to gate** (`Register.jsx:89-105`):

```jsx
  if (!token) {
    return (
      <AuthShell
        eyebrow="Request access"
        title="Create your account"
        subtitle="Tell us how you're related to the family — an administrator reviews every request."
        footer={
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        }
      >
        <Stack spacing={2.25}>
          {error && <Alert severity="error">{error}</Alert>}
```

The `footer` prop is identical across both branches (UI-SPEC keeps it unchanged), so `renderInvitationOnly()` reuses it. `AuthShell` (`AuthShell.jsx:9-52`) takes `eyebrow`/`title`/`subtitle`/`children`/`footer` and its outer wrapper is `<Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 1, md: 3 } }}>` (`:11`) — the exact `Box` UI-SPEC says to reuse for the Loading spinner so the layout does not jump.

**Existing "single definition, no drift" precedent in this very file** (`Register.jsx:106-116`) — the codebase already writes comments of exactly the kind D-07 needs:

```jsx
          {result ? (
            <>
              {/*
                D-06 / SEC-01 (Phase 32 D-08): this copy is generated
                entirely from the form's own `form.email` state and never
                reads `result.message` -- the same text renders whether or
                not that address already has an account, which is what
                keeps this branch enumeration-silent. Any future edit that
                varies this copy by server response would break SEC-01.
              */}
              <Alert severity="success">Check {form.email} for a verification link.</Alert>
```

`renderInvitationOnly()` gets an equivalent JSX comment stating that it is the single definition called from both the initial-closed branch and the mid-form-refusal swap.

**Submit handler to extend** (`Register.jsx:61-87`) — the mid-form-refusal re-query goes in `handlePublicSubmit`'s `catch`, replacing the bare `setError(err.message)`:

```js
    setLoading(true);
    try {
      const data = await register({ name: form.name, email: form.email, password: form.password, relationshipNote: form.relationshipNote });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
```

This is structurally the same `catch { setError } + re-read` shape as `ApprovalsPage.jsx:68-74`. **Never** inspect `err.message` to decide the door state — `graphqlClient.js:26-28` flattens GraphQL errors to a joined string, so `extensions.code` is unreachable, and UI-SPEC forbids string-matching outright.

**Client transport** (`graphqlClient.js:23-36`) — the only GraphQL call path; the new query is a string constant passed to it, exactly like `AuthContext.jsx`'s `ME_QUERY`:

```js
export async function graphqlRequest(query, variables = {}) {
  try {
    const response = await graphqlClient.post('', { query, variables });
    if (response.data.errors?.length) {
      throw new Error(response.data.errors.map((error) => error.message).join('\n'));
    }
    return response.data.data;
  } catch (error) {
    if (error.message === 'Network Error') { … }
    throw error;
  }
}
```

---

### `frontend/src/pages/Register.test.jsx` (EDIT — Wave 0)

**Analog:** `InvitationsPage.test.jsx:18-22` (the dispatching mock, quoted above). This file currently uses order-sensitive `Once` chains, which inserting a leading query breaks.

**Current shape that must change** (`Register.test.jsx:14-17,:31-34`):

```js
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
…
  it('renders the public signup form with all four fields, locked AuthShell chrome, and no invitation-only copy', () => {
    renderRegister(null);

    expect(screen.getByText('Request access')).toBeInTheDocument();
```

Two mechanical migrations, applied to the whole file (RESEARCH Open Question 4 — do not mix idioms):
1. `beforeEach` gains the query-dispatching `graphqlRequest.mockImplementation(...)`; the four `mockResolvedValueOnce` / `mockRejectedValueOnce` chains at `:49`, `:70`, `:110` are rewritten as dispatch branches or per-test overrides.
2. The four tokenless tests (`:31`, `:82`, `:96`, `:109`) switch from synchronous `screen.getByText(...)` to `await screen.findBy…` for the first assertion after render, because the form now paints behind the `publicRegistrationEnabled` round-trip.

`renderRegister` (`:19-28`) needs no change — it already parameterizes token vs tokenless:

```js
function renderRegister(token = 'invite-token-123') {
  const path = token ? `/register?token=${token}` : '/register';
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Register />
      </MemoryRouter>
    </AuthProvider>
  );
}
```

**The invited tests at `:48` and `:69` must stay synchronous-on-first-paint** — that is the assertion that proves D-08's "no query gate above `if (!token)`". If they are made `await`-tolerant, the regression they guard becomes invisible.

---

## Shared Patterns

### Auth / guard
**Source:** `backend/src/utils/auth.js:38-45`
**Apply to:** `setting.resolver.js` (both admin fields + the mutation); asserted by `security.boundaries.test.js`
```js
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
Guards throw, are called as the first statement of a resolver body, and reuse the existing messages verbatim. `requireAdmin` → `requireAuth` chaining (`:43`) is why every guarded field yields the identical `'You must be logged in…'` string for a `null` user — the sweep's expected value is one string, not a set.

### The chokepoint SEC-05 proves
**Source:** `backend/src/utils/auth.js:9,:21-33`
**Apply to:** `security.boundaries.test.js`'s harness choice; the D-13 mutation test targets `:33`
```js
export async function getUserFromRequest(req, models) {
  …
  const user = await models.User.findByPk(payload.sub); // DB errors propagate as real errors
  if (!user) return null;
  …
  if (!user.emailVerified) return null;

  // Only Active accounts may authenticate. A Pending (awaiting-approval),
  // Rejected, or Disabled user's token is treated as not-logged-in.
  if (user.status !== 'Active') return null;

  return user;
}
```

### Audit logging
**Source:** `backend/src/utils/audit.js:5-13`; call sites `approval.resolver.js:53-58`, `user.resolver.js:313-318`
**Apply to:** `setting.resolver.js` (in-transaction, awaited — the divergence)
```js
      writeAuditLog(models, {
        action: 'user.self_registered',
        actorUserId: createdUser.id,
        targetUserId: createdUser.id,
        metadata: { email: normalizedEmail }
      }).catch((err) => console.error('Failed to write audit log:', err));
```

### Error handling (backend)
**Source:** `backend/src/resolvers/user.resolver.js:321-332`
**Apply to:** `appSettings.js`'s fail-closed catch
```js
      } catch (err) {
        // WR-02/CR-01/CR-03: never surface raw ORM/DB error text to an
        // unauthenticated caller. …
        console.error('Tokenless registration failed:', err?.name, err?.message);
        return await finishTokenlessRegistration(startedAt);
      }
```
`console.error('<context>:', err?.name, err?.message)` — **never** the whole error object — is the house form, for exactly the reason stated at `:328-330` (a Sequelize `DatabaseError`'s `.sql`/`.parameters` can carry secrets). `appSettings.js`'s catch uses the same call before `return false`.

### Error handling (frontend)
**Source:** `frontend/src/pages/ApprovalsPage.jsx:106-114` + `DetailPage.jsx:198-207`
**Apply to:** `PublicSignupSwitch.jsx`, `Register.jsx`
```jsx
      {loadError ? (
        <Alert severity="error">{loadError}</Alert>
      ) : rows === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
```
`err.message` is rendered verbatim inside `<Alert severity="error">`; never wrapped, never replaced.

### Test bootstrap
**Source:** `backend/src/resolvers/accountStatus.test.js:1-13`; `backend/src/routes/photo.serve.test.js:1-7`
**Apply to:** every new backend test file
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
…
beforeEach(resetTables);
```
`beforeEach(resetTables)` at module scope (bare reference, not a wrapper lambda) when nothing else is needed; the `vi.clearAllMocks()` form (`sessionRevocation.test.js:40-43`) when a `vi.mock` is present.

### Frontend test bootstrap
**Source:** `frontend/src/pages/ApprovalsPage.test.jsx:1-10`
**Apply to:** every new/edited frontend test file
```js
vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';
```

### Code style (verified, repo-wide)
2-space indent · single quotes · semicolons · named exports for utils/config · `export default function ComponentName()` for React · explicit `.js`/`.jsx` extensions on every relative import · no path aliases · comments explain *why*, cite decision/review IDs (`D-04`, `WR-01`, `CR-03`, `SEC-01`), and name rejected alternatives.

---

## No Analog Found

No *whole file* in this phase lacks an analog. Four **sub-patterns** inside those files have no in-repo precedent — the planner should take these from RESEARCH.md rather than searching the codebase:

| Sub-pattern | Where it lands | Why no analog | Use instead |
|-------------|----------------|---------------|-------------|
| GraphQL query synthesizer (`buildOperation`, `selectionFor`, `dummyValue`) | `security.boundaries.test.js` | No test in this repo builds operations from the SDL; nothing imports `buildSchema`/`validate` from `graphql` outside `serverConfig.js`'s depth rule | 34-RESEARCH.md § Code Examples "The verified query synthesizer" — a prototype already executed against the real SDL, 32/32 valid |
| `Model.upsert(...)` | `setting.resolver.js` | `upsert` is not called anywhere in `backend/src`. Existing writes use `instance.update(...)` (`approval.resolver.js:44`) or `Model.create(...)` | RESEARCH Pattern 4 + Assumption A1 — verify the `[instance, created]` return shape during implementation; re-read the row after upsert if it differs |
| `writeAuditLog(..., { transaction: t })` | `setting.resolver.js` | All five production call sites are fire-and-forget with `.catch()`. This is the codebase's first in-transaction, awaited caller | `audit.js:1-4`'s header explicitly anticipates it and `:8-12` already forwards `options`. RESEARCH Pattern 4 / E-10 — annotate the divergence in a comment |
| `Dialog` + `Switch` in one confirmation flow | `PublicSignupSwitch.jsx` | The `Dialog` analog (`ApprovalsPage.jsx:176-198`) is triggered by a `Button`; the `Switch` analog (`AdminMemberTable.jsx:142-151`) fires immediately with no dialog. No file combines them | Compose the two excerpts. UI-SPEC § Confirmation dialog resolves the asymmetry: close fires directly from `onChange`, open sets a `pendingOpen` state that renders the `Dialog` |

Also note two documents that are stale and must **not** be used as pattern sources (RESEARCH § State of the Art):
- `.planning/codebase/TESTING.md` (dated 2026-07-11) still says "No test runner is installed or configured." There are now 69 backend + 43 frontend test files.
- `CLAUDE.md` § Technology Stack pins Node 18.x and says no test framework exists. The manifests say `"node": "24.x"` and the runtime is v24.15.0. Do not "fix" anything toward 18.

---

## Metadata

**Analog search scope:** `backend/src/{models,utils,schemas,resolvers,routes,graphql,config}`, `backend/test/`, `backend/migrations/manual/`, `frontend/src/{pages,components,api,context}`, `README.md`
**Files read this pass:** 30 (all read once; no range re-read)
**Analog files quoted with line numbers:** `AuditLog.js`, `models/index.js`, `utils/audit.js`, `utils/emailPolicy.js`, `utils/passwordPolicy.js`, `utils/auth.js`, `utils/emailPolicy.test.js`, `schemas/index.js`, `schemas/approval.schema.js`, `schemas/invitation.schema.js`, `schemas/user.schema.js`, `resolvers/index.js`, `resolvers/approval.resolver.js`, `resolvers/user.resolver.js`, `resolvers/register.test.js`, `resolvers/accountStatus.test.js`, `resolvers/createInvitation.test.js`, `resolvers/sessionRevocation.test.js`, `routes/photo.serve.test.js`, `graphql/serverConfig.js`, `test/helpers.js`, `test/globalSetup.js`, `migrations/manual/017-create-audit-logs.sql`, `migrations/manual/020-add-users-relationship-note.sql`, `README.md`, `pages/ApprovalsPage.jsx`, `pages/ApprovalsPage.test.jsx`, `pages/InvitationsPage.jsx`, `pages/InvitationsPage.test.jsx`, `pages/InvitePage.jsx`, `pages/Register.jsx`, `pages/Register.test.jsx`, `pages/DetailPage.jsx`, `components/AuthShell.jsx`, `components/manage/AdminMemberTable.jsx`, `components/manage/AdminMemberTable.test.jsx`, `api/graphqlClient.js`, `theme.js`
**Pattern extraction date:** 2026-09-09
**Source of truth for the file list:** 34-CONTEXT.md § Decisions + § Integration Points, 34-RESEARCH.md § Recommended Project Structure + § Phase Requirements → Test Map, 34-UI-SPEC.md § Component Inventory

---

*Phase: 34-open-registration-switch-quality-gate*
