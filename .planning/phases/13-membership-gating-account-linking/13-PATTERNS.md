# Phase 13: Membership Gating & Account Linking - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 13 (new/modified, backend + frontend, prod + test)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/migrations/manual/012-add-users-family-member-id.sql` | migration | batch (DDL) | `backend/migrations/manual/011-add-email-verification-columns.sql` | exact |
| `backend/src/models/User.js` | model | CRUD | same file (extend), pattern from `passwordChangedAt` field | exact |
| `backend/src/models/index.js` | model (associations) | CRUD | same file (extend) — `FamilyMember.belongsTo(FamilyMember, ...)` block | exact |
| `backend/src/utils/auth.js` | utility (guard) | request-response | same file — `requireAuth`/`requireAdmin` | exact |
| `backend/src/utils/auth.test.js` | test | request-response | same file — `describe('requireAdmin', ...)` block | exact |
| `backend/src/resolvers/user.resolver.js` | resolver | CRUD + request-response | same file — `users` query (admin-only list) + `register`/`verifyEmail` mutations | exact |
| `backend/src/resolvers/linkUserToMember.test.js` (new) | test | request-response | `backend/src/resolvers/dashboard.test.js`, `register.test.js` | exact |
| `backend/src/schemas/user.schema.js` | schema (SDL) | request-response | same file — `User` type, `users` query, mutation block | exact |
| `frontend/src/context/AuthContext.jsx` | provider | request-response | same file — `ME_QUERY` + `loadUser` effect | exact |
| `frontend/src/components/ProtectedRoute.jsx` | component (guard) | request-response | same file — role-check branch | exact |
| `frontend/src/App.jsx` | route table | request-response | same file — route declarations | exact |
| `frontend/src/pages/Pending.jsx` (new) | component (page) | request-response | `frontend/src/pages/VerifyEmail.jsx` (static status card, no form) | role-match |
| `frontend/src/pages/AdminLinkMembers.jsx` (new) | component (page) | CRUD (admin list + link action) | `frontend/src/pages/Dashboard.jsx` (admin user list rendering) + `Login.jsx` (form/mutation call pattern) | role-match |

## Pattern Assignments

### `backend/migrations/manual/012-add-users-family-member-id.sql`

**Analog:** `backend/migrations/manual/011-add-email-verification-columns.sql` (and `009-add-password-changed-at.sql`)

**Full pattern to copy** (`011-add-email-verification-columns.sql:1-27`):
```sql
-- Manual, one-time migration (Phase 11 / VERIFY-01).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the emailVerified/... columns to exist.
--
-- <describe nullability / default / backfill rationale here>

ALTER TABLE users ADD COLUMN emailVerified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN emailVerificationToken VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN emailVerificationExpiresAt DATETIME NULL DEFAULT NULL;
UPDATE users SET emailVerified = true WHERE role = 'ADMIN';
```

**Adaptation for `familyMemberId` (D-07/D-08):**
- File must be the next number after `011-` (confirm no `010-`/`012-` exists elsewhere before picking the number — only `009` and `011` are present, so `012` is the next free slot).
- Column: `ALTER TABLE users ADD COLUMN familyMemberId INT UNSIGNED NULL DEFAULT NULL;` — nullable, no backfill (mirrors the `passwordChangedAt` "no backfill" rationale in `009-add-password-changed-at.sql:9-13`, since every pre-existing row starts unlinked/pending).
- UNIQUE constraint: `ALTER TABLE users ADD CONSTRAINT users_familyMemberId_unique UNIQUE (familyMemberId);` (D-07 — one member ↔ at most one user).
- FK with `ON DELETE SET NULL`: `ALTER TABLE users ADD CONSTRAINT users_familyMemberId_fk FOREIGN KEY (familyMemberId) REFERENCES family_members(id) ON DELETE SET NULL ON UPDATE CASCADE;` — mirrors the `onDelete: 'SET NULL', onUpdate: 'CASCADE'` convention already used for `motherId`/`fatherId` in `backend/src/models/index.js:13-27`.
- Comment block must explain: (a) why sync() can't do this, (b) nullable/no-backfill rationale, (c) the UNIQUE + ON DELETE SET NULL semantics from D-07.
- No `UPDATE users SET ...` backfill line is needed here (unlike `011`'s ADMIN backfill) — there is no "safe default" to backfill; every existing user is legitimately unlinked until an admin links them.

---

### `backend/src/models/User.js` (model, CRUD)

**Analog:** same file — the `passwordChangedAt` field declaration (lines 45-49) and `emailVerified`/`emailVerificationToken` fields (lines 50-52) are the direct template for adding a new nullable column field.

**Field declaration pattern** (`backend/src/models/User.js:45-52`):
```javascript
passwordChangedAt: {
  type: DataTypes.DATE(3),
  allowNull: true,
  defaultValue: null
},
emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
emailVerificationToken: { type: DataTypes.STRING, allowNull: true },
emailVerificationExpiresAt: { type: DataTypes.DATE, allowNull: true }
```

**Adaptation:** add `familyMemberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, unique: true }` to the `User.init()` fields object. NOTE: decide with the planner whether the column is declared here (explicit-field style, like `passwordChangedAt`) **or** solely via the `belongsTo` association in `models/index.js` (auto-column style, like `motherId`/`fatherId` on `FamilyMember`, which are NOT redeclared in `FamilyMember.js` — see `backend/src/models/Spouse.js:12-14` comment: "added by the association... not redeclared here"). CONTEXT.md explicitly names `User.js` as needing the field, so the explicit-declaration style is the safer bet — but declaring it in **both** places will double-declare a column with Sequelize; pick one style per the association pattern below and stay consistent with the codebase's mixed convention (own-table scalar fields in the model, cross-table FK fields via association `foreignKey` option).

**Hooks note:** no hook is needed for `familyMemberId` itself (no hashing/normalization) — unlike `email`/`passwordHash`, it's a plain nullable FK column, closer to `resetPasswordToken` (lines 37-40) which also has no dedicated hook.

---

### `backend/src/models/index.js` (model associations, CRUD)

**Analog:** same file — the `FamilyMember` self-referencing `belongsTo`/`hasMany` pair (lines 13-27) is the direct template for a nullable-FK-with-onDelete association; `Spouse.belongsTo(FamilyMember, ...)` (lines 32-33) is the template for a plain cross-model `belongsTo`.

**Core pattern — nullable belongsTo with onDelete SET NULL** (`backend/src/models/index.js:13-18`):
```javascript
// Parent links: declare onDelete/onUpdate ONLY on the belongsTo side.
FamilyMember.belongsTo(FamilyMember, {
  as: 'mother',
  foreignKey: { name: 'motherId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsMother', foreignKey: 'motherId' });
```

**Adaptation for `User ↔ FamilyMember` (D-06/D-07) — the first association touching the pre-existing `users` table:**
```javascript
User.belongsTo(FamilyMember, {
  as: 'familyMember',
  foreignKey: { name: 'familyMemberId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasOne(User, { as: 'linkedUser', foreignKey: 'familyMemberId' });
```
Note the `hasOne` (not `hasMany`) inverse — D-07's UNIQUE constraint makes this a one-to-one, unlike the one-to-many `mother`/`childrenAsMother` pair. This mirrors how `Spouse` models a strict pairing (`indexes: [{ unique: true, fields: [...] }]` in `backend/src/models/Spouse.js:20`) even though it's a join table, not a belongsTo.

**Placement:** add directly after the existing `FamilyMember`/`Spouse` association block (line 33) and before `export const models = { ... }` (line 35) — add `import { initUser } from './User.js'` is already present (line 2); no new import needed since `User` and `FamilyMember` are both already in scope.

**Existing barrel export** (`backend/src/models/index.js:35-39`) — `User` is already exported in `models`; no change needed there.

---

### `backend/src/utils/auth.js` (utility/guard, request-response)

**Analog:** same file — `requireAuth`/`requireAdmin` (lines 34-41) are the exact thrown-guard template named by D-06/CONTEXT.md.

**Core pattern** (`backend/src/utils/auth.js:34-41`):
```javascript
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}

export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```

**Adaptation for `requireFamilyAccess` (D-06 — linked-member OR ADMIN):**
```javascript
export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
Called at the top of resolver bodies exactly like `requireAuth`/`requireAdmin` are in `user.resolver.js:32,41` — NOT as Express/Apollo middleware (the codebase's established anti-pattern-avoidance: "Auth guards implemented as thrown-error functions rather than middleware").

**Where it plugs in now:** no family resolvers exist yet (Phase 14 owns those). Per CONTEXT.md's "Integration Points", this phase proves the guard via the adversarial test calling it directly (unit-level, like `requireAdmin`'s tests) rather than wiring it into a real resolver — OR stub it against the `linkUserToMember`/unlinked-users query if those are considered "family" operations. Confirm with the planner which operation the adversarial integration test targets.

---

### `backend/src/utils/auth.test.js` (test, request-response)

**Analog:** same file — `describe('requireAdmin', ...)` block (lines 168-180) is the direct template; `describe('requireAuth', ...)` (154-166) too.

**Pattern to copy** (`backend/src/utils/auth.test.js:168-180`):
```javascript
describe('requireAdmin', () => {
  it('does not throw for ADMIN', () => {
    expect(() => requireAdmin({ role: 'ADMIN' })).not.toThrow();
  });

  it('throws for USER', () => {
    expect(() => requireAdmin({ role: 'USER' })).toThrow();
  });

  it('throws for null (via requireAuth)', () => {
    expect(() => requireAdmin(null)).toThrow();
  });
});
```

**Adaptation for `requireFamilyAccess` (RED first per D-09):**
```javascript
describe('requireFamilyAccess', () => {
  it('does not throw for a linked (non-admin) user', () => {
    expect(() => requireFamilyAccess({ role: 'USER', familyMemberId: 1 })).not.toThrow();
  });

  it('does not throw for an ADMIN with no linked member (carve-out, D-06)', () => {
    expect(() => requireFamilyAccess({ role: 'ADMIN', familyMemberId: null })).not.toThrow();
  });

  it('throws for an unlinked, non-admin user', () => {
    expect(() => requireFamilyAccess({ role: 'USER', familyMemberId: null })).toThrow();
  });

  it('throws for null (via requireAuth)', () => {
    expect(() => requireFamilyAccess(null)).toThrow();
  });
});
```

**Adversarial integration-test template** (the locked D-09 success criterion) — follow `dashboard.test.js`'s unauthenticated-rejection shape (`backend/src/resolvers/dashboard.test.js:47-52`):
```javascript
it('rejects an unauthenticated request with the exact API-contract message', async () => {
  const { data, errors } = await graphql(DASHBOARD_QUERY, {}, null);
  expect(errors[0].message).toBe('You must be logged in to perform this action.');
  expect(data).toBeNull();
});
```
Adapt using `createTestUser({ role: 'USER', familyMemberId: null })` (a verified-but-unlinked user, from `backend/test/helpers.js:39-48`) as the `user` context value passed into `graphql(...)`, asserting the family-gated operation is rejected with the `requireFamilyAccess` message.

---

### `backend/src/resolvers/user.resolver.js` (resolver, CRUD + request-response)

**Analog A — admin-only list query** (`backend/src/resolvers/user.resolver.js:40-43`):
```javascript
users: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.User.findAll({ order: [['createdAt', 'DESC']] });
}
```
**Adaptation for "unlinked users" query:**
```javascript
unlinkedUsers: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.User.findAll({ where: { familyMemberId: null }, order: [['createdAt', 'DESC']] });
}
```

**Analog B — admin mutation with existence checks + create** (`register` mutation, lines 46-66, and `resetPassword`'s atomic conditional update, lines 105-123) — for `linkUserToMember`:
```javascript
register: async (_parent, { name, email, password }, { models }) => {
  assertPasswordStrength(password);
  const existingUser = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (existingUser) throw new Error('A user with this email already exists.');
  // ... create + side effects
}
```
**Adaptation for `linkUserToMember(userId, memberId)`:** `requireAdmin(user)` first; look up the target `User` by `userId` (404-style `throw new Error(...)` if missing, matching the "A user with this email already exists." plain-Error convention); look up/validate the `FamilyMember` by `memberId` similarly; guard the UNIQUE constraint pre-emptively with a `findOne({ where: { familyMemberId: memberId } })` check (or let the DB unique constraint reject and translate the Sequelize `UniqueConstraintError` into a plain `Error` — follow whichever error-translation approach the planner picks, but the codebase convention is plain thrown `Error` messages surfaced directly to the client, not error codes).

**Analog C — `me` query extension** (`backend/src/resolvers/user.resolver.js:20-22,30`):
```javascript
function serializeUser(user) {
  return user ? user.get({ plain: true }) : null;
}
// ...
me: (_parent, _args, { user }) => serializeUser(user),
```
No resolver code change needed here beyond the schema exposing `familyMemberId` on `type User` — `serializeUser` already returns the full plain object, so any new column on the `User` model is automatically available to the schema once added to the SDL (same as how `emailVerified` needed no special resolver wiring, only a schema field — confirm `user.schema.js`'s `User` type doesn't already leak `emailVerified`/`passwordHash`; currently it exposes only `id/name/email/role/createdAt/updatedAt`, so `familyMemberId` needs an explicit new field, not automatic exposure).

---

### `backend/src/resolvers/linkUserToMember.test.js` (new test file, request-response)

**Analog:** `backend/src/resolvers/dashboard.test.js` (admin-vs-user branching + unauthenticated-rejection shape) + `backend/src/resolvers/register.test.js` (mutation-with-validation test shape, e.g. duplicate-email rejection at line 78).

**Structure to copy** (`backend/src/resolvers/dashboard.test.js:1-23`):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const LINK_USER_TO_MEMBER_MUTATION = `
  mutation LinkUserToMember($userId: ID!, $memberId: ID!) {
    linkUserToMember(userId: $userId, memberId: $memberId) { id familyMemberId }
  }
`;

beforeEach(resetTables);

describe('linkUserToMember', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await createTestUser({ role: 'USER' });
    const target = await createTestUser({ role: 'USER' });
    const { errors } = await graphql(LINK_USER_TO_MEMBER_MUTATION, { userId: target.id, memberId: 1 }, caller);
    expect(errors[0].message).toBe('Admin access is required.');
  });
  // ... success case, duplicate-link (UNIQUE) rejection, missing-user/member rejection
});
```

---

### `backend/src/schemas/user.schema.js` (schema/SDL, request-response)

**Analog:** same file — existing `User` type (lines 7-14), `Query`/`Mutation` blocks (lines 35-49).

**Pattern to copy and extend:**
```graphql
type User {
  id: ID!
  name: String!
  email: String!
  role: Role!
  createdAt: String!
  updatedAt: String!
}
```
Add `familyMemberId: ID` (nullable — matches D-07's nullable column). Add a `type Query { unlinkedUsers: [User!]! }` entry (admin-gated in the resolver, same as existing `users: [User!]!` at line 38) and a `Mutation` entry `linkUserToMember(userId: ID!, memberId: ID!, ...createMemberInput): User!` (exact shape depends on how the planner models "pick-existing OR create-and-link" from D-04 — likely two separate mutations or one mutation with optional bare-member-creation input fields mirroring `FamilyMember`'s own scalar fields per D-05: `firstname`/`lastname`/`gender`/`email`/`birthdate`/`deathdate`/`phone`/`address`/`mothersname`).

---

### `frontend/src/context/AuthContext.jsx` (provider, request-response)

**Analog:** same file — `ME_QUERY` (lines 6-10) and `loadUser` effect (lines 36-52).

**Pattern to copy** (`frontend/src/context/AuthContext.jsx:6-10`):
```javascript
const ME_QUERY = `
  query Me {
    me { id name email role }
  }
`;
```
**Adaptation:** add `familyMemberId` to the `me` selection set so `ProtectedRoute`/the pending gate can read it: `me { id name email role familyMemberId }`. Also add a derived boolean to the context `value` (line 62-77), e.g. `hasMember: Boolean(user?.familyMemberId) || user?.role === 'ADMIN'` (mirrors D-06's carve-out), exposed alongside the existing `isAuthenticated: Boolean(user)` (line 65).

---

### `frontend/src/components/ProtectedRoute.jsx` (component/guard, request-response)

**Analog:** same file — the existing `loading`/`user`/`allowedRoles` branch chain (lines 8-19).

**Full pattern to copy** (`frontend/src/components/ProtectedRoute.jsx:5-20`):
```javascript
export default function ProtectedRoute({ allowedRoles }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
```
**Adaptation (D-01 — gate-everything-to-`/pending`):** insert a pending-gate branch after the `!user` check and before (or combined with) the `allowedRoles` check:
```javascript
if (!user.familyMemberId && user.role !== 'ADMIN') return <Navigate to="/pending" replace />;
```
Use the same `hasMember` derived value from `AuthContext` if added there, to avoid duplicating the ADMIN-carve-out condition in two places. Also add a matching **inverse** guard so a linked/admin user hitting `/pending` directly is bounced to `/dashboard` (symmetric with the existing `allowedRoles` redirect-to-`/dashboard` behavior) — likely a small separate check inside `Pending.jsx` itself (see below) rather than in `ProtectedRoute`, since `/pending` is NOT behind `ProtectedRoute` (it must be reachable by an authenticated-but-unlinked user, i.e. still needs `user` truthy but should NOT itself redirect unlinked users away).

**Test analog:** `frontend/src/components/ProtectedRoute.test.jsx` — copy the `vi.mock('../context/AuthContext.jsx', ...)` + `useAuthMock` pattern (lines 6-24) for the new pending-gate branch test, e.g. `useAuthMock.mockReturnValue({ loading: false, user: { id: 1, role: 'USER', familyMemberId: null } })` asserting redirect to `/pending`.

---

### `frontend/src/App.jsx` (route table, request-response)

**Analog:** same file — full route declarations (lines 11-27).

**Pattern to copy:**
```javascript
<Route element={<ProtectedRoute />}>
  <Route path="dashboard" element={<Dashboard />} />
</Route>
```
**Adaptation:** add `<Route path="pending" element={<Pending />} />` (likely OUTSIDE `ProtectedRoute`'s role-gated block, but still needs `user` — confirm with planner whether `/pending` needs its own lightweight "authenticated but not necessarily linked" guard, since it's the one route that must be reachable precisely when the standard pending-gate condition is true). Add the admin-only linking screen behind `<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>` (no existing analog route uses `allowedRoles` today, but the prop already exists and is tested in `ProtectedRoute.test.jsx:58-65`), e.g. `<Route path="admin/link-members" element={<AdminLinkMembers />} />`.

---

### `frontend/src/pages/Pending.jsx` (new page, request-response)

**Analog:** `frontend/src/pages/VerifyEmail.jsx` — closest match for a static, mostly-non-interactive status card using `AuthShell`.

**Pattern to copy** (`frontend/src/pages/VerifyEmail.jsx:1-50`, structural skeleton):
```javascript
import { Box, Typography } from '@mui/material';
import AuthShell from '../components/AuthShell.jsx';

export default function Pending() {
  return (
    <AuthShell
      eyebrow="Almost there"
      title="Waiting for admin approval"
    >
      <Box>
        <Typography>
          Your account is awaiting an admin to link you to your family member; you'll get access once linked.
        </Typography>
      </Box>
    </AuthShell>
  );
}
```
Per D-02, this is deliberately static — no `useEffect`/polling/mutation calls (unlike `VerifyEmail.jsx`'s token-verification effect), no admin-contact link. Simpler than the analog, not more complex.

---

### `frontend/src/pages/AdminLinkMembers.jsx` (new page, CRUD)

**Analog A — admin list rendering:** `frontend/src/pages/Dashboard.jsx`'s "Admin: managed users" block (lines 196-259) — the `Stack`/`Paper`/`Avatar` list-row pattern for `users.map(...)`.

**Analog B — form + mutation call + error handling:** `frontend/src/pages/Login.jsx`'s `handleSubmit` (lines 14-26):
```javascript
const handleSubmit = async (event) => {
  event.preventDefault();
  setError('');
  setLoading(true);
  try {
    await login(form.email, form.password);
    navigate('/dashboard');
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

**Adaptation:** fetch `unlinkedUsers` via `graphqlRequest` in a `useEffect` (mirrors `Dashboard.jsx`'s `DASHBOARD_QUERY` fetch, lines 78-82), render each unlinked user as a simple row (reuse the `Avatar`/`Typography` row shape from `Dashboard.jsx:216-256` without the role `Chip`), with a per-row action to either pick an existing member (a search/select — no existing analog component for this; simplest MUI `Autocomplete` or a plain `Select` populated from a member-list query) or open a bare-member-create mini-form (fields per D-05: `firstname`/`lastname`/`gender` required, `email`/`birthdate`/`deathdate`/`phone`/`address`/`mothersname` optional) that submits `linkUserToMember`. Wrap the submit in the same `try/catch/finally` + `Alert severity="error"` shape as `Login.jsx`.

**No existing test analog** for this page (first admin-CRUD-list-with-inline-actions page in the frontend) — closest structural test template is `frontend/src/components/ProtectedRoute.test.jsx`'s `vi.mock` pattern for mocking `graphqlRequest`/`useAuth`, combined with `frontend/src/pages/Register.test.jsx`'s form-submission assertions (not read in full here — flag for the planner to inspect `Register.test.jsx` directly when writing this page's tests, since it is the closest "form submits a GraphQL mutation" test file not covered above).

---

## Shared Patterns

### Thrown-error auth guards (backend)
**Source:** `backend/src/utils/auth.js:34-41`
**Apply to:** `requireFamilyAccess` and any resolver it guards.
```javascript
export function requireAuth(user) {
  if (!user) throw new Error('You must be logged in to perform this action.');
}
export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
Guards are called synchronously at the top of the resolver body — never as Express/Apollo middleware.

### Manual ALTER + boot-verify for existing-table schema changes
**Source:** `backend/migrations/manual/011-add-email-verification-columns.sql`, `009-add-password-changed-at.sql`
**Apply to:** the new `012-add-users-family-member-id.sql` migration.
There is no automated JS boot-verify script in this codebase (verified by grep — none exists); "boot-verify" in practice means (a) `backend/src/models/database.test.js`'s `sequelize.authenticate()` + `models.X.count()` smoke tests, which will fail loudly if the column/table is missing, and (b) a human running the manual SQL before deploy. Follow the `database.test.js` pattern (lines 1-26) — add or extend a similar assertion that querying `familyMemberId` on `User` doesn't throw, as the closest thing to an automated "boot-verify."

### GraphQL resolver test harness
**Source:** `backend/test/helpers.js:16-22,39-48`
**Apply to:** all new/modified resolver tests.
```javascript
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp } }
  );
  return response.body.singleResult;
}
export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    emailVerified: true,
    ...overrides
  });
}
```
`createTestUser({ familyMemberId: null })` (explicit) or default-omitted is the adversarial "verified but unlinked" fixture for the D-09 guard test.

**Caution for the planner:** `resetTables()` (`backend/test/helpers.js:24-35`) truncates `Spouse`, then `FamilyMember`, then `User`, wrapped in `SET FOREIGN_KEY_CHECKS = 0/1`. Once `users.familyMemberId` FKs to `family_members(id)`, this order still works because FK checks are disabled around the truncate — no change needed here, but flag it for the planner to double check after the migration lands (a stray `SET FOREIGN_KEY_CHECKS = 1` failure would surface immediately in CI).

### MUI AuthShell card wrapper (frontend)
**Source:** `frontend/src/components/AuthShell.jsx`
**Apply to:** `Pending.jsx` (and reused by `AdminLinkMembers.jsx` if it wants a consistent card, though a full-width admin table page may prefer `Dashboard.jsx`'s `Paper`/`Stack` layout instead — see per-file notes above).

### Frontend error handling around GraphQL calls
**Source:** `frontend/src/pages/Login.jsx:14-26`, `frontend/src/api/graphqlClient.js`
**Apply to:** `AdminLinkMembers.jsx`'s link/create-and-link submit handlers.
`try { await mutate(...) } catch (err) { setError(err.message) } finally { setLoading(false) }`, error surfaced via `<Alert severity="error">{error}</Alert>`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `frontend/src/pages/AdminLinkMembers.jsx` (member picker/search sub-widget) | component | request-response | No existing "select or search an entity from a list" component in the frontend — Dashboard's admin list is read-only display, not a picker. Planner should design a minimal `Select`/`Autocomplete` from scratch, or defer to Claude's Discretion per CONTEXT.md. |
| `requireFamilyAccess`'s target resolver | resolver | request-response | No family resolvers exist yet (Phase 14 owns them) — this phase either stubs the guard against `linkUserToMember`/`unlinkedUsers` (both admin-only, not really "family access" in the D-06 sense) or documents the contract without a concrete guarded family query. Flag for planner decision. |

## Metadata

**Analog search scope:** `backend/src/{models,resolvers,schemas,utils}`, `backend/migrations/manual/`, `backend/test/`, `frontend/src/{components,pages,context}`
**Files scanned:** ~25 (via Read + Glob directory listings)
**Pattern extraction date:** 2026-07-21
