# Phase 14: Relationship Resolvers, Permission Scoping & Query Safety - Pattern Map

**Mapped:** 2026-07-22
**Files analyzed:** 16 (new + modified)
**Analogs found:** 16 / 16 (all have at least a role-match; several are exact-match extensions of files already read in full)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/graphql/serverConfig.js` | config | request-response | `backend/src/server.js` (typeDefs/resolvers wiring, lines 1-25) + `backend/test/helpers.js` (lines 1-10) | role-match (new module extracted from both) |
| `backend/src/loaders/familyMember.loaders.js` | utility (DataLoader factory) | batch/request-response | `backend/src/services/familyMember.service.js` `getSpouseRows`/`Op.or` idiom (lines 72-77) | role-match |
| `backend/src/server.js` (MODIFY: context factory) | config | request-response | itself — extend existing `context` factory (lines 30-40) | exact |
| `backend/test/helpers.js` (MODIFY: graphql() + server construction) | test-helper | request-response | itself — extend existing `graphql()` (lines 1-22) | exact |
| `backend/src/config/env.js` (MODIFY: add `maxQueryDepth`) | config | transform | itself — extend existing `env` object (lines 18-38) | exact |
| `backend/src/services/familyMember.service.js` (EXTEND: `computeEditableScope`) | service | CRUD / query | itself — `getSpouseRows`/`deleteMember` (lines 72-133) | exact |
| `backend/src/resolvers/familyMember.resolver.js` (EXTEND: mutations + field resolvers) | resolver | CRUD | itself (Query block, lines 1-14) + `backend/src/resolvers/user.resolver.js` `linkUserToMember` (lines 227-273) for the transaction/guard shape | exact (query half) / role-match (mutation half, borrowing transaction pattern) |
| `backend/src/schemas/familyMember.schema.js` (EXTEND: recursive fields + mutation SDL) | schema (SDL) | transform | itself (lines 1-38) | exact |
| `backend/src/resolvers/user.resolver.js` (MODIFY: `dashboard` gating, WR-04) | resolver | request-response | itself — `dashboard` resolver (lines 52-60) | exact |
| `backend/src/resolvers/dashboard.test.js` (MODIFY: add unlinked-user case) | test | request-response | itself (lines 1-53) | exact |
| `backend/src/services/familyMember.scope.test.js` (NEW) | test | CRUD / query | `backend/src/models/FamilyMember.cycle.test.js` (service-level unit test shape, lines 1-55) | exact |
| `backend/src/resolvers/familyMember.addRelative.test.js` (NEW, or one-per-mutation) | test | CRUD (adversarial) | `backend/src/resolvers/linkUserToMember.test.js` (full file — transaction/guard/adversarial test shape) | exact |
| `backend/src/resolvers/familyMember.editMember.test.js` (NEW) | test | CRUD | `backend/src/resolvers/familyMember.resolver.test.js` (lines 1-56) | exact |
| `backend/src/resolvers/familyMember.deleteMember.test.js` (NEW) | test | CRUD | `backend/src/resolvers/linkUserToMember.test.js` admin-gate tests (lines 17-31) | role-match |
| `backend/src/graphql/queryDepth.test.js` (NEW) | test | validation | `backend/src/resolvers/dashboard.test.js` (unauthenticated-rejection shape, lines 47-52) — closest analog for "rejected before resolver runs" style assertions | role-match (no depth-limit analog exists yet) |
| `backend/test/familyTreeFactory.js` (NEW fixture builder) | utility (test fixture) | batch | `backend/test/helpers.js` `createTestUser` (lines 39-48) | role-match |
| `backend/package.json` (MODIFY: add `dataloader`, `@escape.tech/graphql-armor-max-depth`) | config | — | itself | exact |

## Pattern Assignments

### `backend/src/graphql/serverConfig.js` (config, request-response) — NEW, prerequisite for everything else

**Analog:** `backend/src/server.js` lines 1-25, `backend/test/helpers.js` lines 1-10 (the two places this logic is currently duplicated)

**Current duplication this file must eliminate** (`backend/src/server.js:1-25`):
```javascript
import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schemas/index.js';
import { resolvers } from './resolvers/index.js';
import { rateLimitPlugin } from './plugins/rateLimitPlugin.js';
...
const apollo = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });
```
```javascript
// backend/test/helpers.js:1-10 — a SEPARATE construction of the same server
import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../src/schemas/index.js';
import { resolvers } from '../src/resolvers/index.js';
import { rateLimitPlugin } from '../src/plugins/rateLimitPlugin.js';
const server = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });
```

**Required shape (per RESEARCH.md Pattern 1, verified against this repo's actual imports above):**
```javascript
// backend/src/graphql/serverConfig.js
import { typeDefs } from '../schemas/index.js';
import { resolvers } from '../resolvers/index.js';
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import { env } from '../config/env.js';

export const validationRules = [
  maxDepthRule({ n: env.maxQueryDepth, ignoreIntrospection: false })
];

export { typeDefs, resolvers };
```
Both `backend/src/server.js` and `backend/test/helpers.js` must import from this module instead of constructing `typeDefs`/`resolvers`/`validationRules` independently — this is the RESEARCH.md-flagged Wave 0 blocker (Pitfall 1 / harness-parity).

---

### `backend/src/loaders/familyMember.loaders.js` (utility, batch) — NEW

**Analog:** the `Op.or` / `Promise.all` idiom already established in `backend/src/services/familyMember.service.js`

**Existing idiom to mirror** (`getSpouseRows`, lines 72-77):
```javascript
export async function getSpouseRows(memberId) {
  return models.Spouse.findAll({
    where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
    include: [{ association: 'memberA' }, { association: 'memberB' }]
  });
}
```
This is the exact `Op.or` shape the `childrenByParentId`/`spousesByMemberId` DataLoader batch functions must reuse (batched across many ids at once instead of one id per call — see RESEARCH.md Pattern 2 for the full `createLoaders(models)` implementation, already verified against this repo's model shape: `FamilyMember.motherId`/`fatherId`, `Spouse.memberAId`/`memberBId`).

**Hard invariant to enforce (no in-repo analog exists for this yet — DataLoader-specific, not a codebase convention):** the batch function's returned array must be the same length and order as the input keys array (`ids.map((id) => byId.get(id) ?? null)`), and loaders must be constructed **inside** the per-request `context` factory, never at module scope (see Shared Patterns below).

---

### `backend/src/server.js` (MODIFY: context factory) — role: config, request-response

**Analog:** itself, extend the existing factory in place

**Current** (`backend/src/server.js:30-40`):
```javascript
app.use(
  '/graphql',
  express.json(),
  expressMiddleware(apollo, {
    context: async ({ req }) => ({
      models,
      user: await getUserFromRequest(req, models),
      clientIp: req.ip
    })
  })
);
```
**Pattern to extend:** add `loaders: createLoaders(models)` as a new key in this same returned object — this is the established "single injection point" abstraction noted in the CLAUDE.md Key Abstractions section ("Apollo Server `context` async function, computed per-request"). Also swap the inline `new ApolloServer({ typeDefs, resolvers, plugins })` (line 25) for the shared `serverConfig.js` import, adding `validationRules`.

---

### `backend/test/helpers.js` (MODIFY: graphql() + server construction) — role: test-helper, request-response

**Analog:** itself

**Current** (`backend/test/helpers.js:10-22`):
```javascript
const server = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });

export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp } }
  );
  return response.body.singleResult;
}
```
**Required change:** import `{ typeDefs, resolvers, validationRules }` from `serverConfig.js` (not from `../src/schemas/index.js`/`../src/resolvers/index.js` directly), construct `ApolloServer` with `validationRules` included, and add `loaders: createLoaders(models)` to the `contextValue` object — a **fresh** loader set per `graphql()` call (per-request semantics), matching D-07's "never module-level" requirement even inside the test harness.

---

### `backend/src/config/env.js` (MODIFY: add `maxQueryDepth`) — role: config, transform

**Analog:** itself — the existing pattern of numeric env vars with a fallback default

**Current pattern to mirror** (`backend/src/config/env.js:24-25`):
```javascript
  resetTokenExpiresMinutes: Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 30),
```
**Required addition, same shape:**
```javascript
  maxQueryDepth: Number(process.env.MAX_QUERY_DEPTH || 100),
```
This satisfies D-08's "named, env-overridable constant, not a magic number inline" requirement using the codebase's existing `Number(process.env.X || default)` idiom — no new pattern introduced.

---

### `backend/src/services/familyMember.service.js` (EXTEND: `computeEditableScope`) — role: service, CRUD/query

**Analog:** itself — `deleteMember` (lines 91-133) for the multi-query/transaction shape, `getSpouseRows` (lines 72-77) for the `Op.or` idiom

**Imports pattern already established at top of file (lines 1-2):**
```javascript
import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../models/index.js';
```

**Existing bounded-multi-query shape to mirror** (`deleteMember`, lines 91-133, especially the `Promise.all`-free but structurally similar "gather related rows, then act" shape and the `sequelize.transaction(async (transaction) => { ... })` wrapper):
```javascript
export async function deleteMember(memberId) {
  return sequelize.transaction(async (transaction) => {
    const spouseRows = await models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
      transaction
    });
    const partnerIds = spouseRows.map((row) =>
      row.memberAId === memberId ? row.memberBId : row.memberAId
    );
    // ... one-hop-only related-row gathering ...
  });
}
```
`computeEditableScope(memberId, { transaction } = {})` should follow the same "accept an optional `{ transaction }` option, gather related rows via `Op.or`, no recursion beyond one hop" shape (full recommended implementation in RESEARCH.md Pattern 3, already verified against this file's actual `Op`/`models` imports and the `FamilyMember`/`Spouse` schema read directly from `backend/src/models/FamilyMember.js` and `backend/src/models/Spouse.js`).

**Critical NULL-semantics constraint (Pitfall 4, verified against this file's existing usage):** every `Op.or` clause array element must reference a **non-null** parent id — never add a `{ motherId: null }`-style clause. This file has no existing example of the wrong pattern to avoid (good — don't introduce one).

---

### `backend/src/resolvers/familyMember.resolver.js` (EXTEND: mutations + field resolvers) — role: resolver, CRUD

**Analog for the guard-then-act shape (existing Query resolvers, lines 1-14):**
```javascript
import { requireAdmin, requireFamilyAccess } from '../utils/auth.js';

export const familyMemberResolvers = {
  Query: {
    familyMembers: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
    },
    familyMember: async (_parent, { id }, { models, user }) => {
      requireFamilyAccess(user);
      return models.FamilyMember.findByPk(id);
    }
  }
};
```
Every new mutation must open with the identical `requireFamilyAccess(user)` (or `requireAdmin(user)` for admin-only operations) synchronous-throw-first line, per the established convention (CLAUDE.md: "Auth guard functions ... called at the top of resolver bodies before any other logic").

**Analog for the transaction + guard + friendly-error shape (`linkUserToMember`, `backend/src/resolvers/user.resolver.js:227-273`):**
```javascript
linkUserToMember: async (_parent, { userId, memberId, newMember }, { models, user }) => {
  requireAdmin(user);

  if ((memberId == null) === (newMember == null)) {
    throw new Error('Provide exactly one of memberId or newMember.');
  }

  const targetUser = await models.User.findByPk(userId);
  if (!targetUser) throw new Error('User not found.');

  if (targetUser.familyMemberId != null) {
    throw new Error('This account is already linked to a family member.');
  }

  try {
    await models.User.sequelize.transaction(async (t) => {
      let resolvedMemberId;
      if (memberId != null) {
        const member = await models.FamilyMember.findByPk(memberId, { transaction: t });
        if (!member) throw new Error('Family member not found.');
        resolvedMemberId = memberId;
      } else {
        const createdMember = await models.FamilyMember.create(sanitizeNewMember(newMember), { transaction: t });
        resolvedMemberId = createdMember.id;
      }
      await targetUser.update({ familyMemberId: resolvedMemberId }, { transaction: t });
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new Error('This family member is already linked to another account.');
    }
    throw error;
  }

  return targetUser;
}
```
This is the **exact template** every new relationship mutation (`addParent`/`addSpouse`/`addChild`/`addSibling`/`editMember`/`deleteMember`) should follow: guard clause(s) first, validate arg shape/mutual-exclusivity before any DB call, wrap the multi-step write in `models.User.sequelize.transaction(async (t) => { ... })` (note: accessed via `models.User.sequelize`, not a bare `sequelize` import, in this specific resolver — both are the same singleton per `backend/src/models/index.js:57`), catch `UniqueConstraintError` specifically where a unique constraint (e.g. the `Spouse` pair index) could legitimately collide.

**Sanitization helper to reuse, not duplicate (`backend/src/resolvers/user.resolver.js:16-34`):**
```javascript
const OPTIONAL_FAMILY_MEMBER_FIELDS = ['mothersname', 'email', 'birthdate', 'deathdate', 'phone', 'address'];

function sanitizeNewMember(newMember) {
  const sanitized = { ...newMember };
  for (const key of OPTIONAL_FAMILY_MEMBER_FIELDS) {
    const value = sanitized[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      sanitized[key] = trimmed === '' ? null : trimmed;
    }
  }
  return sanitized;
}
```
Currently module-private in `user.resolver.js`. RESEARCH.md's "Don't Hand-Roll" table recommends exporting this (or relocating it to `familyMember.service.js`) rather than duplicating it — every Phase 14 mutation accepting a `NewFamilyMemberInput` (all the `addX` "create-new-only" mutations per D-01) needs identical blank→null behavior.

**Field resolvers (`mother`/`father`/`spouses`/`children`/`siblings`) — no direct in-repo analog exists yet** (the schema currently exposes zero relationship fields); use RESEARCH.md Pattern 2's `context.loaders.X.load(...)` shape as the template, e.g.:
```javascript
FamilyMember: {
  children: (member, _args, { loaders }) => loaders.childrenByParentId.load(member.id),
  spouses: (member, _args, { loaders }) => loaders.spousesByMemberId.load(member.id)
}
```

---

### `backend/src/schemas/familyMember.schema.js` (EXTEND: recursive fields + mutation SDL) — role: schema, transform

**Analog:** itself (full existing file, 38 lines)

**Current shape to extend:**
```javascript
export const familyMemberTypeDefs = `#graphql
  type FamilyMember {
    id: ID!
    firstname: String!
    lastname: String!
    fullname: String!
    gender: Gender!
    mothersname: String
    email: String
    birthdate: String
    deathdate: String
    phone: String
    address: String
  }

  input NewFamilyMemberInput {
    firstname: String!
    lastname: String!
    gender: Gender!
    mothersname: String
    email: String
    birthdate: String
    deathdate: String
    phone: String
    address: String
  }

  extend type Query {
    familyMembers: [FamilyMember!]!
    familyMember(id: ID!): FamilyMember
  }
`;
```
Add `mother: FamilyMember`, `father: FamilyMember`, `spouses: [FamilyMember!]!`, `children: [FamilyMember!]!`, `siblings: [FamilyMember!]!`, and `linkedUser: User` (association already exists at the model layer, `FamilyMember.hasOne(User, { as: 'linkedUser' })` in `backend/src/models/index.js:44`) to the `FamilyMember` type; add an `extend type Mutation { ... }` block using the exact `#graphql` tagged-template-literal + `extend type` convention already used here (this file only extends `Query`, never `Mutation` yet — the extension syntax is standard SDL and needs no new convention).

---

### `backend/src/resolvers/user.resolver.js` (MODIFY: `dashboard` gating, WR-04) — role: resolver, request-response

**Analog:** itself — a one-line diff on the existing resolver

**Current** (`backend/src/resolvers/user.resolver.js:52-60`):
```javascript
dashboard: async (_parent, _args, { models, user }) => {
  requireAuth(user);
  const users = user.role === 'ADMIN' ? await models.User.findAll({ order: [['createdAt', 'DESC']] }) : null;
  return {
    message: user.role === 'ADMIN' ? 'Welcome to the admin dashboard.' : 'Welcome to your dashboard.',
    user,
    users
  };
},
```
**Required change:** `requireAuth(user)` → `requireFamilyAccess(user)`. `requireFamilyAccess` must be added to the existing import block at the top of this file (currently imports `requireAdmin`, `requireAuth` from `'../utils/auth.js'` at lines 2-12) — `requireFamilyAccess` already exists in `backend/src/utils/auth.js:43-47` and is already imported by `familyMember.resolver.js`, so this is a pure import-and-swap, no new logic.

---

### `backend/src/resolvers/dashboard.test.js` (MODIFY: add unlinked-user case) — role: test, request-response

**Analog:** itself, mirror the existing "rejects an unauthenticated request" test shape and the `familyMember.resolver.test.js` unlinked-user adversarial test

**Existing rejection-test shape to mirror** (`backend/src/resolvers/dashboard.test.js:47-52`):
```javascript
it('rejects an unauthenticated request with the exact API-contract message', async () => {
  const { data, errors } = await graphql(DASHBOARD_QUERY, {}, null);
  expect(errors[0].message).toBe('You must be logged in to perform this action.');
  expect(data).toBeNull();
});
```
**Case to add, cross-referencing the exact assertion already proven correct in `familyMember.resolver.test.js:26-34`:**
```javascript
it('rejects a verified-but-unlinked USER (WR-04)', async () => {
  const user = await createTestUser({ role: 'USER', familyMemberId: null });
  const { data, errors } = await graphql(DASHBOARD_QUERY, {}, user);
  expect(errors[0].message).toBe('Your account is not yet linked to a family member.');
  expect(data.dashboard).toBeNull();
});
```

---

### `backend/src/services/familyMember.scope.test.js` (NEW) — role: test, CRUD/query

**Analog:** `backend/src/models/FamilyMember.cycle.test.js` (full file — service-level unit test, no GraphQL layer, direct import of the service function under test)

**Structure to mirror** (lines 1-6, the import/setup shape):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { models } from './index.js';
import { resetTables } from '../../test/helpers.js';
import { wouldCreateCycle, linkParent, addChild } from '../services/familyMember.service.js';

beforeEach(resetTables);
```
For the new file: `import { computeEditableScope } from './familyMember.service.js';` (co-located in `services/`, so relative path differs slightly), same `beforeEach(resetTables)` pattern, same `describe`/`it` structure with `models.FamilyMember.create({...})` fixture construction per test (as seen throughout `FamilyMember.cycle.test.js:9-17`). Must include the sibling-of-sibling exclusion fixture named explicitly in RESEARCH.md Assumption A3 and CONTEXT.md's Specific Ideas section.

---

### `backend/src/resolvers/familyMember.addRelative.test.js` (NEW, or split per-mutation) — role: test, CRUD (adversarial)

**Analog:** `backend/src/resolvers/linkUserToMember.test.js` (full file, 249 lines) — closest existing analog for an admin/permission-gated mutation test suite with transaction-rollback and adversarial cases

**Structure to mirror** (imports + gate-rejection test, lines 1-31):
```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const LINK_USER_TO_MEMBER_MUTATION = `
  mutation LinkUserToMember($userId: ID!, ...) { ... }
`;

beforeEach(resetTables);
afterEach(() => vi.restoreAllMocks());

describe('linkUserToMember', () => {
  it('rejects a non-admin caller', async () => {
    const caller = await createTestUser({ role: 'USER' });
    ...
    expect(errors[0].message).toBe('Admin access is required.');
    expect(data).toBeNull();
  });
```
**Rollback-test pattern to reuse for any new transactional mutation** (lines 202-228, `vi.spyOn(...).mockRejectedValueOnce(...)`):
```javascript
const updateSpy = vi
  .spyOn(models.User.prototype, 'update')
  .mockRejectedValueOnce(new Error('simulated update failure'));
... 
expect(data).toBeNull();
expect(errors[0].message).toBe('simulated update failure');
const afterCount = await models.FamilyMember.count();
expect(afterCount).toBe(beforeCount);
```
**SC-4 adversarial-test target:** follow the exact assertion shape of `familyMember.resolver.test.js:26-34` (reject-with-specific-message, `data.<field>` is `null`) but asserting the new anti-escalation error message when a member references an id outside `scope.ids`.

---

### `backend/src/resolvers/familyMember.editMember.test.js` (NEW) — role: test, CRUD

**Analog:** `backend/src/resolvers/familyMember.resolver.test.js` (full file, 79 lines) — closest existing analog for a `requireFamilyAccess`-gated resolver test suite

**Structure to mirror in full** (query constant + `beforeEach(resetTables)` + linked/unlinked/admin cases, lines 1-56) — same shape applies directly to `editMember`, substituting a mutation string for the `FAMILY_MEMBER_QUERY` constant.

---

### `backend/src/resolvers/familyMember.deleteMember.test.js` (NEW) — role: test, CRUD

**Analog:** `backend/src/resolvers/linkUserToMember.test.js` admin-gate test (lines 17-31) for the "non-admin rejected" shape; `backend/src/services/familyMember.service.js`'s existing `deleteMember` (lines 91-133, already implemented in Phase 12) is the function under test at the resolver-gating layer — this phase adds the GraphQL mutation wrapper + `requireAdmin` gate, not new deletion logic (D-10: reuse, don't reimplement).

---

### `backend/src/graphql/queryDepth.test.js` (NEW) — role: test, validation

**No close in-repo analog** (first depth-limit test in this codebase). Closest structural analog is the rejection-assertion shape in `backend/src/resolvers/dashboard.test.js:47-52` (assert on `errors[0].message`/`errors[0].extensions.code`, `data` is `null`). Must use the shared `graphql()` helper from `test/helpers.js` (post-Wave-0-fix) so it exercises the real `validationRules`, per RESEARCH.md Pattern 1's explicit warning against hand-rolling a separate ApolloServer instance for this one test.

---

### `backend/test/familyTreeFactory.js` (NEW fixture builder) — role: utility (test fixture), batch

**Analog:** `backend/test/helpers.js` `createTestUser` (lines 39-48) for the "parameterisable fixture factory with sane defaults + overrides" shape:
```javascript
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
The new `buildGenerationFixture({ depth, childrenPerNode })`-style factory (named in RESEARCH.md Code Examples) should follow this same "accept an options object, return created Sequelize instance(s)" convention, extended to build N generations via a loop rather than a single `.create()` call.

---

### `backend/package.json` (MODIFY: add `dataloader`, `@escape.tech/graphql-armor-max-depth`) — role: config

**Analog:** itself — existing `dependencies` block (lines 16-27); install via workspace flag, never at repo root:
```bash
npm install --workspace backend dataloader @escape.tech/graphql-armor-max-depth
```

## Shared Patterns

### Auth guard-then-act (applies to every new/modified resolver)
**Source:** `backend/src/utils/auth.js:34-47`, consumed at `backend/src/resolvers/familyMember.resolver.js:6,10` and `backend/src/resolvers/user.resolver.js:53,228`
```javascript
export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
**Apply to:** every new mutation/query resolver in `familyMember.resolver.js`, and the modified `dashboard` resolver in `user.resolver.js` (WR-04). Called synchronously, first line of the resolver body, before any other work — no exceptions in this codebase's existing resolvers.

### Transaction-wrapped multi-step writes
**Source:** `backend/src/resolvers/user.resolver.js:251-263` (`linkUserToMember`), `backend/src/services/familyMember.service.js:52-70,91-133` (`setSpouse`, `deleteMember`)
```javascript
await models.User.sequelize.transaction(async (t) => {
  // ...multiple dependent writes, all using { transaction: t }...
});
```
**Apply to:** every new mutation that writes more than one row (create-new-node-then-link, in particular — the D-01 "always creates a NEW bare member node and links it" pattern is structurally identical to `linkUserToMember`'s `newMember`-branch).

### Barrel aggregation (unchanged this phase, but every new schema/resolver export must register here)
**Source:** `backend/src/schemas/index.js`, `backend/src/resolvers/index.js`
```javascript
// backend/src/resolvers/index.js
import { userResolvers } from './user.resolver.js';
import { familyMemberResolvers } from './familyMember.resolver.js';
export const resolvers = [userResolvers, familyMemberResolvers];
```
**Apply to:** no new files needed here (both `familyMemberResolvers` and `familyMemberTypeDefs` already registered) — but if any new resolver/schema module is split into a separate file (e.g. a dedicated `familyRelationship.resolver.js`), it must be added to both barrels following this exact merge-into-array shape.

### `Op.or` idiom for either-side/either-parent queries
**Source:** `backend/src/services/familyMember.service.js:72-77,93-96,116-123`
```javascript
where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] }
```
**Apply to:** `computeEditableScope`'s spouse/child/sibling queries, and every DataLoader batch function's `WHERE motherId IN (...) OR fatherId IN (...)` shape. **Critical constraint (Pitfall 4):** only include a clause for a parent id that is actually non-null — `Op.eq: null` compiles to `IS NULL`, a different and wrong query for this rule.

### Error handling — throw plain `Error`, no wrapping
**Source:** CLAUDE.md Error Handling section; verified throughout `user.resolver.js` (e.g. lines 75, 94, 133-135, 230-231, 235, 243) and `familyMember.service.js` (lines 34, 37)
```javascript
throw new Error('This account is already linked to a family member.');
```
**Apply to:** every new rejection path (D-02 anti-escalation, D-04 sibling-with-no-parent, D-06 field-lock, PERM-03 member-delete-forbidden) — plain `Error` with a user-facing message, no custom error classes, no GraphQL error-code extensions beyond Apollo's defaults.

### Test harness construction (`graphql()` + `resetTables` + `createTestUser`)
**Source:** `backend/test/helpers.js` (full file)
**Apply to:** every new/modified `*.test.js` file in this phase — `beforeEach(resetTables)`, `createTestUser({ role, familyMemberId })` for fixtures, `graphql(QUERY_OR_MUTATION, variables, actingUserOrNull)` for execution, destructure `{ data, errors }` and assert on `errors[0].message` / `data.<field>`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/loaders/familyMember.loaders.js` (DataLoader batch-function internals specifically) | utility | batch | No DataLoader usage exists anywhere in this codebase yet — the `Op.or` query shape has an analog (`familyMember.service.js`), but the DataLoader wrapping (batch-key alignment, `cacheKeyFn`) does not. Use RESEARCH.md Pattern 2's verified implementation directly. |
| `backend/src/graphql/queryDepth.test.js` (depth-limit-specific assertions) | test | validation | First GraphQL-validation-layer test in this codebase; existing tests only assert on resolver-level `errors[0].message`, never on validation-phase rejection shape/`extensions.code`. Use RESEARCH.md's Code Examples section (`maxDepthRule` registration + expected Apollo Server 4 validation-error shape). |
| `backend/test/familyTreeFactory.js` (N-generation parameterised builder specifically) | utility | batch | Existing fixtures in every test file hand-author 2-3 nodes inline (`models.FamilyMember.create({...})` called individually); no parameterised/looping fixture factory exists yet. `createTestUser` is the closest structural analog (options-object + defaults) but is single-row, not tree-building. |

## Metadata

**Analog search scope:** `backend/src/{server.js,config,models,schemas,resolvers,services,utils,graphql,loaders}`, `backend/test/`, `backend/package.json`
**Files scanned:** `server.js`, `test/helpers.js`, `config/env.js`, `utils/auth.js`, `services/familyMember.service.js`, `resolvers/familyMember.resolver.js`, `resolvers/user.resolver.js`, `resolvers/index.js`, `schemas/familyMember.schema.js`, `schemas/index.js`, `models/index.js`, `models/FamilyMember.js`, `models/Spouse.js`, `resolvers/familyMember.resolver.test.js`, `resolvers/linkUserToMember.test.js`, `resolvers/dashboard.test.js`, `models/FamilyMember.cycle.test.js`, `backend/package.json` (18 files read in full or targeted excerpt)
**Pattern extraction date:** 2026-07-22
