# Phase 24: Backend Read Layer for /detail - Pattern Map

**Mapped:** 2026-08-03
**Files analyzed:** 3 modified + up to 4 new test files (no new production files, no schema change)
**Analogs found:** 7 / 7 (every touch point has an exact, verbatim in-repo precedent — this phase is 100% wiring against existing patterns, confirmed by direct code inspection, not RESEARCH.md inference alone)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/schemas/familyMember.schema.js` (extend) | schema (GraphQL SDL) | request-response | itself — extend existing `extend type Query` block + `type FamilyMember` | exact (same file, additive) |
| `backend/src/resolvers/familyMember.resolver.js` (extend) | resolver | request-response / CRUD-read | itself — `Query.familyMembers`/`Query.familyMember` (query pattern), `FamilyMember.createdBy`/`updatedBy` (canEdit pattern) | exact |
| `backend/src/services/familyMember.service.js` (extend) | service | transform / raw-SQL | itself — existing exported functions (`computeEditableScope`, `wouldCreateCycle`) for raw-query and Sequelize-instance-import conventions | exact |
| `backend/src/resolvers/familyMember.head.test.js` (new) | test (integration) | request-response | `backend/src/resolvers/familyMember.provenance.test.js` | exact (structure: `graphql()` + `createTestUser` + `resetTables`) |
| `backend/src/resolvers/familyMember.search.test.js` (new) | test (integration) | request-response | `backend/src/resolvers/familyMember.provenance.test.js` | exact |
| `backend/src/resolvers/familyMember.canEdit.test.js` (new) | test (integration) | request-response | `backend/src/resolvers/familyMember.provenance.test.js` (its own `createdBy`/`updatedBy` admin-vs-non-admin tests are the closest possible analog for `canEdit`) | exact |
| `backend/src/services/familyMember.queryCount.test.js` (extend, new `describe` block) | test (integration, perf/N+1) | request-response | itself — existing `SC-5: FamilyMember relationship query safety` describe block, `countQueries()` helper | exact (same file, additive) |

No files fall into "No Analog Found" — every touch point is either the same file being extended or has a verbatim same-file/sibling-file precedent.

## Pattern Assignments

### `backend/src/schemas/familyMember.schema.js` (schema, extend)

**Analog:** itself (lines 76-80, 13-41)

**Existing `extend type Query` block to extend** (lines 76-80):
```graphql
extend type Query {
  familyMembers: [FamilyMember!]!
  familyMember(id: ID!): FamilyMember
  myEditableMembers: [FamilyMember!]!
}
```
Add `familyHead: FamilyMember` and `searchFamilyMembers(term: String!, limit: Int): [FamilyMember!]!` inside this same block — do not create a second `extend type Query` block.

**Existing `FamilyMember` type to extend** (lines 13-41, note the existing provenance-field comment style at line 36):
```graphql
type FamilyMember {
  id: ID!
  ...
  linkedUser: User
  # Provenance — resolved to the user only for an ADMIN viewer, else null.
  createdBy: User
  updatedBy: User
  createdAt: String
  updatedAt: String
}
```
Add `canEdit: Boolean!` as a new field, following the same one-line-comment-above-field convention used for `createdBy`/`updatedBy` (e.g. `# Admin-only edit signal — true for an ADMIN viewer, else false.`).

**No barrel change needed:** `backend/src/schemas/index.js` merges `familyMemberTypeDefs` into an array (`export const typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs];`) — editing the string template in `familyMember.schema.js` is sufficient; the array wiring is untouched.

---

### `backend/src/resolvers/familyMember.resolver.js` (resolver, extend)

**Analog:** itself — `Query.familyMembers`/`Query.familyMember` for the two new Query resolvers; `FamilyMember.createdBy`/`updatedBy` for `canEdit`.

**Imports pattern** (lines 1-9, current):
```javascript
import { requireAdmin, requireFamilyAccess } from '../utils/auth.js';
import { sanitizeNewMember } from './user.resolver.js';
import {
  computeEditableScope,
  linkParent,
  setSpouse,
  addChild,
  deleteMember as deleteFamilyMember
} from '../services/familyMember.service.js';
```
Add `getFamilyHeadId` to the `familyMember.service.js` named-import list; add `import { Op } from 'sequelize';` for the search resolver's `Op.or`/`Op.substring` clause (not currently imported in this file — it IS imported in `familyMember.service.js` and `familyMember.loaders.js`, so the convention of importing `Op` directly from `'sequelize'` is already established, just not yet in this specific file).

**Core Query pattern to copy exactly** (lines 12-20, existing `familyMembers`/`familyMember`):
```javascript
Query: {
  familyMembers: async (_parent, _args, { models, user }) => {
    requireFamilyAccess(user);
    return models.FamilyMember.findAll({ order: [['lastname', 'ASC'], ['firstname', 'ASC']] });
  },
  familyMember: async (_parent, { id }, { models, user }) => {
    requireFamilyAccess(user);
    return models.FamilyMember.findByPk(id);
  },
  ...
}
```
`requireFamilyAccess(user)` is the FIRST line of every existing read query in this file (V4 Access Control per RESEARCH.md's Security Domain) — `familyHead` and `searchFamilyMembers` MUST follow this exact same first-line-guard shape, no exceptions.

**`canEdit` field resolver — the exact admin-gating precedent to copy verbatim** (lines 304-311):
```javascript
createdBy: (member, _args, { user, loaders }) => {
  if (user?.role !== 'ADMIN' || member.createdByUserId == null) return null;
  return loaders.userById.load(Number(member.createdByUserId));
},
updatedBy: (member, _args, { user, loaders }) => {
  if (user?.role !== 'ADMIN' || member.updatedByUserId == null) return null;
  return loaders.userById.load(Number(member.updatedByUserId));
}
```
New field, following the identical shape (per D-07/D-08), added to the same `FamilyMember:` field-resolver map (which starts at line 250):
```javascript
canEdit: (_member, _args, { user }) => Boolean(user?.role === 'ADMIN')
```
No loader, no I/O, no `Number()` coercion needed — this is the simplest field resolver in the whole map because it ignores its `member` argument entirely (leading underscore, matching the file's own `_parent`/`_args` unused-param convention).

**Error handling pattern:** No try/catch anywhere in this file — resolvers `throw new Error('...')` directly (e.g. `Family member not found.`) and let Apollo Server's default error formatting surface it. No new error-handling pattern needed for the three additions; `searchFamilyMembers` only needs a guard-clause early return (`if (trimmed.length === 0) return [];`), not a thrown error.

---

### `backend/src/services/familyMember.service.js` (service, extend)

**Analog:** itself — existing module-level imports and the raw-SQL/instance-import convention already used by `wouldCreateCycle`/`computeEditableScope`.

**Imports pattern** (line 1-2, current):
```javascript
import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../models/index.js';
```
`sequelize` is already imported at module scope here — the new `getFamilyHeadId(models)` function's raw CTE query (`sequelize.query(..., { type: QueryTypes.SELECT })`) needs `QueryTypes` added to the sequelize import line: `import { Op, QueryTypes, UniqueConstraintError } from 'sequelize';`.

**Core pattern — fast path + bounded fallback** (RESEARCH.md's `getFamilyHeadId`, verified executable against live DB, to be added as a new exported function in this file, mirroring `computeEditableScope`'s "single exported async function taking an id, returning a result shape" convention at lines 180-232):
```javascript
const CANONICAL_HEAD_ID = 1;

export async function getFamilyHeadId(models) {
  const canonical = await models.FamilyMember.findByPk(CANONICAL_HEAD_ID, { attributes: ['id'] });
  if (canonical) return canonical.id;

  const [best] = await sequelize.query(
    `
    WITH RECURSIVE descendants AS (
      SELECT id, id AS root_id
      FROM family_members
      WHERE motherId IS NULL AND fatherId IS NULL
      UNION ALL
      SELECT fm.id, d.root_id
      FROM family_members fm
      JOIN descendants d ON fm.motherId = d.id OR fm.fatherId = d.id
    )
    SELECT d.root_id AS id, COUNT(*) AS size
    FROM descendants d
    JOIN family_members apex ON apex.id = d.root_id
    GROUP BY d.root_id, apex.lastname, apex.firstname
    ORDER BY size DESC, apex.lastname ASC, apex.firstname ASC
    LIMIT 1
    `,
    { type: QueryTypes.SELECT }
  );
  if (best) return best.id;

  const first = await models.FamilyMember.findOne({
    attributes: ['id'],
    order: [['lastname', 'ASC'], ['firstname', 'ASC']]
  });
  return first ? first.id : null;
}
```
Table name in the raw SQL is `family_members` (verified: `backend/src/models/FamilyMember.js` / live DB inspection in RESEARCH.md) — do not use the model name `FamilyMember`; raw `sequelize.query` bypasses Sequelize's automatic table-name mapping.

**No transaction param needed:** unlike every other exported function in this file (`linkParent`, `addChild`, `setSpouse`, `deleteMember`, `computeEditableScope` all accept `{ transaction }`), `getFamilyHeadId` is a pure read with no caller-supplied transaction context in either RESEARCH.md's design or any resolver call site — do not add one speculatively.

---

### `searchFamilyMembers` resolver (new Query resolver in `familyMember.resolver.js`)

**Analog:** No existing backend search precedent (confirmed by RESEARCH.md grep — `/manage`'s `AdminMemberTable` search is 100% client-side `.filter()`). Closest structural analog is `Query.familyMembers`'s `order` array shape (line 15) combined with `familyMember.loaders.js`'s `Op.or` usage (lines 29, 48) for the multi-column pattern.

**Pattern to implement** (RESEARCH.md Pattern 2, verified against installed `sequelize` 6.37.8):
```javascript
const SEARCH_RESULT_CAP = 20;
const SEARCH_RESULT_HARD_MAX = 50;

searchFamilyMembers: async (_parent, { term, limit }, { models, user }) => {
  requireFamilyAccess(user);

  const trimmed = term.trim();
  if (trimmed.length === 0) return [];

  const cap = Math.min(limit ?? SEARCH_RESULT_CAP, SEARCH_RESULT_HARD_MAX);

  return models.FamilyMember.findAll({
    where: {
      [Op.or]: [
        { firstname: { [Op.substring]: trimmed } },
        { lastname: { [Op.substring]: trimmed } },
        { geezFirstname: { [Op.substring]: trimmed } },
        { geezLastname: { [Op.substring]: trimmed } }
      ]
    },
    order: [['lastname', 'ASC'], ['firstname', 'ASC']],
    limit: cap
  });
}
```
`order: [['lastname', 'ASC'], ['firstname', 'ASC']]` is copied verbatim from the existing `familyMembers` query (line 15) — keep result ordering consistent across every list-returning query in this file.

---

### `backend/src/resolvers/familyMember.head.test.js`, `familyMember.search.test.js`, `familyMember.canEdit.test.js` (new integration tests)

**Analog:** `backend/src/resolvers/familyMember.provenance.test.js` (full file read, 139 lines)

**Imports pattern** (lines 1-3):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';

beforeEach(resetTables);
```

**Query-string-as-const pattern** (lines 5-34) — define each GraphQL operation as a top-level `const` above the `describe` block:
```javascript
const PROVENANCE_QUERY = `
  query Member($id: ID!) {
    familyMember(id: $id) {
      id
      isAlive
      createdBy { id name }
      updatedBy { id name }
      createdAt
      updatedAt
    }
  }
`;
```
For `canEdit`, mirror this exactly with a query selecting `canEdit` alongside `id`.

**Admin vs. non-admin test-pair pattern — the exact precedent for `canEdit`'s SC-5 test** (lines 104-138):
```javascript
it('exposes createdBy/updatedBy to an ADMIN viewer', async () => {
  const base = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com', name: 'Root Admin' });
  ...
  const { data, errors } = await graphql(PROVENANCE_QUERY, { id: addData.addParent.id }, admin);
  expect(errors).toBeUndefined();
  expect(data.familyMember.createdBy).toEqual({ id: String(admin.id), name: 'Root Admin' });
});

it('hides createdBy/updatedBy from a non-admin viewer', async () => {
  ...
  const viewer = await createTestUser({ role: 'USER', email: 'viewer@example.com', familyMemberId: base.id });
  const { data, errors } = await graphql(PROVENANCE_QUERY, { id: addData.addParent.id }, viewer);
  expect(errors).toBeUndefined();
  expect(data.familyMember.createdBy).toBeNull();
});
```
`familyMember.canEdit.test.js` should follow this exact `createTestUser({ role: 'ADMIN', ... })` vs. `createTestUser({ role: 'USER', familyMemberId: ... })` two-case structure, plus a third case passing `user = null` (unauthenticated) through `graphql(query, vars, null)` to confirm `requireFamilyAccess` on the parent `familyMember`/`familyMembers` query rejects before `canEdit` is ever reached (per RESEARCH.md's SC-5 test-map row).

**`graphql()` third-arg-is-the-acting-user calling convention** (used throughout, e.g. line 43-47):
```javascript
const { data, errors } = await graphql(
  ADD_PARENT,
  { memberId: String(base.id), role: 'MOTHER', newMember: { firstname: 'Grace', lastname: 'Hopper', gender: 'Female' } },
  admin
);
```
Note `memberId: String(base.id)` — GraphQL `ID!` variables must be passed as strings from the test even though the Sequelize `.id` is numeric (matches the `cacheKeyFn: String` convention in the loaders).

**`familyMember.head.test.js` fixture note (from RESEARCH.md Wave 0 Gaps, do NOT reuse `buildGenerationFixture`):** build members directly via `models.FamilyMember.create(...)` (as this analog file does at line 40, 54, 87, 105) rather than `buildGenerationFixture` from `familyTreeFactory.js`, because head tests need precise control over whether id `1` exists and over apex-tie scenarios — `buildGenerationFixture` has no id-1 control and produces a single-lineage tree with no spouses.

---

### `backend/src/services/familyMember.queryCount.test.js` (extend, new `describe` block for SC-4/PERF-02)

**Analog:** itself — the existing `SC-5: FamilyMember relationship query safety` describe block (lines 52-93) and its `countQueries()` helper (lines 12-24).

**`countQueries()` helper — reuse verbatim, do not duplicate** (lines 12-24, already imported/available in this file):
```javascript
async function countQueries(fn) {
  const original = sequelize.options.logging;
  let count = 0;
  sequelize.options.logging = () => {
    count += 1;
  };
  try {
    await fn();
  } finally {
    sequelize.options.logging = original;
  }
  return count;
}
```

**Bounded-SQL assertion pattern to copy** (lines 64-79):
```javascript
it('resolves the same nested deep-tree query with a flat, bounded SQL query count (not proportional to the 255-node fixture size)', async () => {
  const { root } = await buildGenerationFixture({ depth: 8, childrenPerNode: 2 });
  const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

  let result;
  const queryCount = await countQueries(async () => {
    result = await graphql(buildDeepChildrenQuery(7), { id: root.id }, admin);
  });

  expect(result.errors).toBeUndefined();
  expect(countNodes(result.data.familyMember)).toBe(255);
  expect(queryCount).toBeLessThan(20);
});
```
New `describe` block for SC-4 should build a small fixture (≥3 direct children, each with ≥2 grandchildren, plus ≥1 `models.Spouse.create({ memberAId, memberBId })` row among the children — mirroring `models.Spouse.create` usage conventions found in the Spouse test suite, not present in this file, so create the rows with plain `models.FamilyMember.create`/`models.Spouse.create` calls directly, following the `familyMember.head.test.js` guidance above rather than `buildGenerationFixture`), then run the D-06 query `familyMember(id) { children { id children { id } spouses { id } } }` through `countQueries()`, asserting `expect(queryCount).toBeLessThan(N)` for a small explicit `N` (this codebase's existing convention is a generous headroom constant like `20`, not a tight exact count — do not assert exact equality against the query count, which is an implementation-detail risk this file's own author already avoided).

---

## Shared Patterns

### Access control guard (`requireFamilyAccess`)
**Source:** `backend/src/utils/auth.js:47-51`
```javascript
export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
**Apply to:** Both new Query resolvers (`familyHead`, `searchFamilyMembers`) — must be the first line of the resolver body, exactly matching every existing Query resolver in `familyMember.resolver.js` (`familyMembers`, `familyMember`, `myEditableMembers` all call this first). `canEdit` itself needs NO separate guard — it's a pure field resolver on an already-access-controlled parent query, reading `context.user` directly.

### Admin role check (`user?.role === 'ADMIN'`)
**Source:** `backend/src/resolvers/familyMember.resolver.js:304-309` (`createdBy`/`updatedBy`)
```javascript
createdBy: (member, _args, { user, loaders }) => {
  if (user?.role !== 'ADMIN' || member.createdByUserId == null) return null;
  return loaders.userById.load(Number(member.createdByUserId));
},
```
**Apply to:** `canEdit` field resolver — the single-line derivation `Boolean(user?.role === 'ADMIN')` is the exact same boolean condition, just returned instead of gating a loader call.

### Per-request DataLoader construction (no changes required, but must NOT be broken)
**Source:** `backend/src/loaders/familyMember.loaders.js:15-72`, wired at `backend/src/server.js:35-39`
```javascript
context: async ({ req }) => ({
  models,
  user: await getUserFromRequest(req, models),
  loaders: createLoaders(models)
})
```
**Apply to:** No new loader is needed this phase (RESEARCH.md confirms `familyHead`/`searchFamilyMembers` are root Query fields called once per operation, not fan-out fields — DataLoader batching is architecturally irrelevant here). The existing `childrenByParentId`/`spousesByMemberId` loaders (lines 26-59) are reused unmodified by the D-06 nested-children N+1 test — do not add a `headByIdLoader` or `searchLoader`.

### Barrel aggregation (passive array merge, confirm no edit needed)
**Source:** `backend/src/schemas/index.js`, `backend/src/resolvers/index.js`
```javascript
// schemas/index.js
export const typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs];
// resolvers/index.js
export const resolvers = [userResolvers, familyMemberResolvers, invitationResolvers];
```
**Apply to:** Nothing — both barrels already import the whole `familyMemberTypeDefs`/`familyMemberResolvers` object/string, so editing `familyMember.schema.js`/`familyMember.resolver.js` in place is sufficient. Do not touch these two barrel files.

### `sequelize.query()` raw-SQL convention (for the one new raw query this phase adds)
**Source:** `backend/src/services/familyMember.service.js:1-2` (import), no existing raw `sequelize.query()` call currently in this file to copy verbatim — the closest sibling-file precedent for `type: QueryTypes.SELECT` usage is RESEARCH.md's own verified-against-live-DB CTE (see service section above). Table name convention: use the actual DB table name (`family_members`, snake_ish per Sequelize's default pluralization — verified via live `information_schema` query in RESEARCH.md), never the Sequelize model name (`FamilyMember`), inside raw SQL.

## No Analog Found

None — every file/change in this phase's touch set has a same-file or sibling-file exact precedent (see Pattern Assignments above). This is expected: RESEARCH.md and CONTEXT.md both establish D-09 ("do not add parallel queries" for anything that already exists) and confirm zero new dependencies/files beyond 3 edited files + up to 4 test files, all of which sit directly next to files this phase already reads.

## Metadata

**Analog search scope:** `backend/src/schemas/`, `backend/src/resolvers/`, `backend/src/services/`, `backend/src/loaders/`, `backend/src/utils/`, `backend/test/`, `backend/src/models/`, `frontend/src/components/family/familyTree.assembly.js` (D-01 source of truth only, read-only reference — no frontend file is created/modified this phase).
**Files scanned:** `familyMember.schema.js`, `familyMember.resolver.js`, `familyMember.loaders.js`, `familyMember.service.js`, `auth.js`, `familyMember.queryCount.test.js`, `familyMember.provenance.test.js`, `test/helpers.js`, `test/familyTreeFactory.js`, `schemas/index.js`, `resolvers/index.js`, `server.js` (context wiring), `models/index.js` (sequelize/models export), `familyTree.assembly.js` (`resolveRootAncestorId`).
**Pattern extraction date:** 2026-08-03
