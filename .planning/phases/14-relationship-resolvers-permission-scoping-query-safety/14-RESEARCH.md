# Phase 14: Relationship Resolvers, Permission Scoping & Query Safety - Research

**Researched:** 2026-07-22
**Domain:** GraphQL relationship resolvers, server-side permission scoping over a self-referencing graph, DataLoader batching, GraphQL query-depth validation (Apollo Server 4 + Sequelize 6 + MySQL + Vitest)
**Confidence:** HIGH (DataLoader wiring, depth-limit package choice, scope-computation query shape, test-harness parity finding — all verified against source code/registry) / MEDIUM (exact mutation-surface shape, query-count measurement technique — reasoned recommendations, not externally documented for this exact stack)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

See `.planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-CONTEXT.md` for full prose; key locked decisions (D-01 through D-11) reproduced here for the planner:

- **D-01 — Create-new-only for member-users:** When a member-user adds a relative (parent, spouse, or child), the mutation always creates a NEW bare member node and links it. Attaching to a pre-existing member node is admin-only.
- **D-02 — Existing-node references allowed only within the actor's own scope:** A member may reference an existing node id in a relative-add if and only if that node is already in their computed editable set. Invariant: a member may only wire together nodes they already control; their scope grows only by creating new nodes, never by referencing existing ones.
- **D-03 — Sibling = shares either parent:** A sibling is any other member sharing a non-null `motherId` OR a non-null `fatherId`. Never stored as an edge — always derived. Half-vs-full is not distinguished or exposed this phase.
- **D-04 — Adding a sibling with no parent recorded is rejected, with guidance:** Reject with an actionable message rather than fabricating a placeholder parent.
- **D-05 — Add-only; members may not rewire or remove existing edges:** A member-user may edit plain fields on in-scope members and add new edges, but may not change or remove an existing edge. Members may not delete any member (PERM-03). Admins may add, edit, rewire, and remove anywhere (PERM-04).
- **D-06 — All family fields editable on in-scope relatives EXCEPT relatives who have their own linked user account:** If the target has no linked user, every family field is collaboratively editable by an in-scope relative. If the target has a linked user account, the record is field-locked to that person and to admins. A linked member can always edit their own record.
- **D-07 — Request-scoped DataLoader:** Add the `dataloader` dependency and construct per-request loaders (`memberById`, `childrenByParentId`, `spousesByMemberId`) in the Apollo `context` factory in `backend/src/server.js`. Loaders MUST be created per request (never module-level).
- **D-08 — GraphQL depth limit of 100, rejected at validation:** Register a `graphql-depth-limit`-style validation rule with max depth 100. Implement as a named, env-overridable constant.
- **D-09 — TDD red-green-refactor is mandatory** (carried from P12 D-11 and P13 D-09). Every behaviour-adding task ships a failing test first.
- **D-10 — Phase 12 relationship semantics stand as-is:** one canonical spouse join row per couple, multiple spouse edges allowed, married-in delete rule, two nullable self-FK parent columns. The existing `wouldCreateCycle` guard must be reused, not reimplemented.
- **D-11 — `requireFamilyAccess` = linked member OR ADMIN** (P13 D-06) remains the gate for every family-domain operation.
- **Carried-over defect (WR-04):** the `dashboard` resolver still uses `requireAuth` only, not `requireFamilyAccess` — every new family-domain resolver in this phase must be gated, and the existing `dashboard` resolver must be brought in line.

### Claude's Discretion

The planner and executor decide these — not raised as user preferences:

- Mutation naming and signature shapes (`addParent`/`addChild`/`addSpouse`/`addSibling` as separate mutations vs. one `addRelative` with a relationship-kind enum). **Research recommendation: separate mutations** (see Architecture Patterns / Alternatives Considered).
- Where the editable-scope utility lives (`backend/src/utils/` guard-style vs. `backend/src/services/familyMember.service.js`). **Research recommendation: `familyMember.service.js`** (data-computation/query-shaped logic belongs alongside `wouldCreateCycle`/`getSpouseRows`, not in the synchronous-throw-guard style of `utils/auth.js`).
- The exact SQL/ORM shape of the scope computation (one query with OR-groups vs. several batched lookups). **Research recommendation: ~5 bounded `Promise.all`-parallel queries** (see Pattern 3).
- Whether to expose a read-only `myEditableMembers`-style query. **Research recommendation: yes, ship it** — near-zero marginal cost on top of the required utility (see Open Questions).
- Error message wording and GraphQL error shape conventions — left to planner/executor.
- Test fixture design for the deep-tree/query-count assertion, and how query count is measured. **Research recommendation: a parameterisable N-generation factory + a `sequelize.options.logging` swap** (see Validation Architecture / Code Examples).
- Whether the depth-limit rule comes from `graphql-depth-limit` or an equivalent. **Research recommendation: `@escape.tech/graphql-armor-max-depth`'s `maxDepthRule`** — actively maintained, exact-version peer match, verified plain `ValidationRule` export (see Standard Stack).

### Deferred Ideas (OUT OF SCOPE)

- Member→admin removal-request flow (deferred to v2 per PERM-03).
- Admin-approval queue for attaching to existing nodes (rejected in favor of D-01's create-new-only design).
- Half-vs-full sibling distinction exposed in the schema (deferred with full genealogy).
- Phase 13 WR-02 (`unlinkedUsers` includes admins/unverified users) and the three INFO items — remain deferred; only WR-04 is pulled into this phase.
- The `/family` pan/zoom tree visualisation, the `/manage` self-service UI, photo upload, and any full genealogy modeling — all later phases (15-17) or out of milestone scope.
</user_constraints>

## Summary

Phase 14 has one dominant risk that isn't visible from the roadmap or CONTEXT alone: **this codebase's test harness (`backend/test/helpers.js`) builds its own `ApolloServer` instance and its own `contextValue` object, completely bypassing `backend/src/server.js`'s `context` factory.** Every one of the 195 existing backend tests exercises `graphql()` from `test/helpers.js`, not the real server. Concretely, that means:

1. Whatever the D-07 per-request DataLoaders and D-08 depth-limit `validationRules` get wired into `server.js`, they will have **zero effect on any test** unless the same wiring is duplicated (or, better, extracted into one shared config module) in `test/helpers.js`. This isn't a hypothetical risk — it is already flagged verbatim as Pitfall 13 in this milestone's own prior research (`.planning/research/PITFALLS.md`): *"Extend the existing `backend/test/helpers.js` request-builder to construct the same `context()`... that `backend/src/server.js` builds in production, rather than a simplified test-only stand-in."* The planner MUST create a task that either (a) refactors `server.js` + `test/helpers.js` to share one `{ typeDefs, resolvers, validationRules }` config object and one `createLoaders(models)` factory, or the SC-5 query-safety tests will silently test nothing.
2. The existing `familyMember.resolver.js`/`.schema.js` surface is query-only (list + single-get, admin/family-gated). This phase adds the entire mutation surface, the recursive relationship fields (`mother`, `father`, `spouses`, `children`, `siblings`) that make N+1 and depth-limiting real problems for the first time, and the `dashboard` WR-04 gating fix.
3. `graphql-depth-limit` (the package named in D-08's wording) is unmaintained since 2022 (last publish 2022-05-04) though not broken — it has no hard `graphql@15`-only peer constraint (its `peerDependencies` is the permissive `graphql: '*'`). An actively-maintained, exact-version-matched alternative exists: `@escape.tech/graphql-armor-max-depth@2.4.2`, whose `maxDepthRule` export is a plain graphql-js `ValidationRule` factory — a drop-in for Apollo Server's `validationRules` array, verified by reading its published source directly.
4. The editable-scope computation (PERM-05) is cheap to make correct: self + parents + spouses + children + siblings-via-shared-either-parent is expressible as ~5 bounded Sequelize queries (never O(tree size)), reusing the existing `Op.or` idiom already used in `familyMember.service.js`'s `getSpouseRows`/`isMarriedInOnly`.

**Primary recommendation:** Build one shared Apollo config module (`typeDefs`/`resolvers`/`validationRules`) and one `createLoaders(models)` factory, wire both into `server.js`'s context factory AND `test/helpers.js`'s `graphql()` helper before writing any Phase 14 resolver test; compute editable scope via a single `computeEditableScope()` utility added to `familyMember.service.js`; use `@escape.tech/graphql-armor-max-depth`'s `maxDepthRule` for D-08, not the unmaintained `graphql-depth-limit`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Editable-scope computation (PERM-05) | API / Backend (service layer) | Database | Pure server-side Sequelize queries; must never be client-supplied or duplicated per-resolver (locked: single reused utility) |
| Anti-escalation guard (SC-4) | API / Backend (resolver + service) | Database (transaction) | Validation of referenced ids against scope must happen inside the mutation resolver before any write, inside a transaction |
| Relationship field resolvers (`mother`/`father`/`spouses`/`children`/`siblings`) | API / Backend (GraphQL field resolvers) | Database (via DataLoader) | Recursive schema fields; batching must live at the resolver/DataLoader boundary, not in the DB layer |
| DataLoader instances | API / Backend (Apollo `context` factory) | — | Per-request lifecycle is an Apollo Server concern, not a DB or frontend concern |
| GraphQL depth-limit validation | API / Backend (Apollo Server construction) | — | Runs at the GraphQL validation phase, before any resolver — pure API-layer concern, zero DB cost |
| Sibling derivation (REL-04) | Database / Storage (query shape) | API / Backend (presentation) | Computed via a `WHERE motherId = ? OR fatherId = ?` query; presented as a GraphQL field, never persisted |
| `requireFamilyAccess` gating on `dashboard`/new resolvers (WR-04, D-11) | API / Backend | — | Existing guard-clause convention; no other tier involved |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dataloader` | `^2.2.3` [VERIFIED: npm registry — official `graphql/dataloader` GitHub org, confirmed via `npm view`] | Request-scoped batching/caching for `memberById`/`childrenByParentId`/`spousesByMemberId` | The canonical library for the exact N+1 problem this phase must solve; explicitly named in D-07 |
| `@escape.tech/graphql-armor-max-depth` | `^2.4.2` [VERIFIED: npm registry + direct source inspection via unpkg — exports confirmed] | GraphQL query-depth validation rule (D-08) | Actively maintained (last publish 2025-12-28), `peerDependencies`/`dependencies` pin `graphql: ^16.10.0` — an exact match to this project's `graphql` version; `maxDepthRule` is a plain graphql-js `ValidationRule` factory, verified by reading the published `dist/graphql-armor-max-depth.cjs.dev.js` source directly |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `graphql-depth-limit` | `1.1.0` [VERIFIED: npm registry — exists, but NOT RECOMMENDED] | Same purpose as above | Only if the team specifically wants the smallest possible dependency (50-line, zero-config) and accepts it has had no release since 2022-05-04. Its `peerDependencies` is `graphql: '*'` (no hard graphql-16 conflict, contrary to a common assumption), so it is not *broken* — just unmaintained. See Assumptions Log. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written `dataloader` instances (D-07, locked) | `dataloader-sequelize` (auto-batches all Sequelize `find*` calls via a shared context) | Rejected — D-07 explicitly says "Add the `dataloader` dependency and construct per-request loaders." `dataloader-sequelize` would satisfy the *goal* but not the *locked decision's exact mechanism*; also less precise cache-key control across the permission boundary. |
| `@escape.tech/graphql-armor-max-depth` (recommended) | `graphql-query-complexity` (cost-based, not depth-based) | Rejected for D-08 — the decision is explicitly a **depth** limit (a pathological-recursion backstop), not a cost/complexity budget. Complexity limiting is a reasonable *future* addition but out of this phase's locked scope. |
| One `addRelative(kind: RelationKind!, ...)` mutation | Separate `addParent`/`addSpouse`/`addChild`/`addSibling` mutations (recommended, see Architecture Patterns) | A single mutation needs resolver-level conditional-required-argument validation anyway (GraphQL's type system can't express "required only when kind=CHILD"), so it doesn't actually simplify validation — it just centralizes dispatch. Separate mutations match the project's existing one-capability-per-resolver convention (`familyMember`/`familyMembers`/`linkUserToMember` are each standalone) and make the SC-4 adversarial test target each surface individually. |

**Installation (backend workspace only — do NOT install at the repo root):**
```bash
npm install --workspace backend dataloader @escape.tech/graphql-armor-max-depth
```

**Version verification performed this session:**
- `npm view dataloader version` → `2.2.3` (published 2024-12-03, per `npm view dataloader time.modified`)
- `npm view @escape.tech/graphql-armor-max-depth version` → `2.4.2` (published 2025-12-28)
- `npm view graphql-depth-limit version` → `1.1.0` (published 2017-08-09, last touched 2022-05-04)
- Both recommended packages' `package.json` `dependencies`/`peerDependencies` were fetched directly (via `npm view` and unpkg) — no version conflict with this project's pinned `graphql@^16.10.0`.

⚠️ **Correction to a claim in this phase's own upstream research question wording:** the task brief hypothesized `graphql-depth-limit` "has a known peer/`graphql@15` constraint." This was checked directly (`npm view graphql-depth-limit@1.1.0 peerDependencies`) and found **false** — its `peerDependencies` is the permissive `{ graphql: '*' }`. The real weakness is staleness (unmaintained since 2022), not a version conflict. Documented here so the planner doesn't inherit a false premise.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `dataloader` | npm | ~9 yrs (created 2017 per GitHub org `graphql/dataloader`) | very high (foundational GraphQL ecosystem package) | github.com/graphql/dataloader | [OK] | Approved |
| `@escape.tech/graphql-armor-max-depth` | npm | ~3 yrs, actively released (last publish 2025-12-28) | moderate; backed by Escape Technologies SAS, a known GraphQL-security vendor | github.com/Escape-Technologies/graphql-armor | [OK] | Approved |
| `graphql-depth-limit` | npm | ~9 yrs, unmaintained since 2022-05-04 | high historically, but stagnant | github.com/stems/graphql-depth-limit | [OK] | Not recommended (staleness, not a slop finding) — see Alternatives Considered |

slopcheck ran successfully in this session (`slopcheck install dataloader @escape.tech/graphql-armor-max-depth graphql-depth-limit`) and returned `[OK]` for all three. **Process note:** slopcheck's `install` subcommand performs a real `npm install`; running it against the repo root during this research session added these three packages to the root `package.json`/`package-lock.json` as a side effect. This was caught and reverted (`git checkout -- package.json package-lock.json`) before this document was written — confirmed via `git status` showing a clean working tree for those two files. **The planner must ensure any actual install happens with `--workspace backend`, not at the repo root**, since none of these three packages are used by the root workspace itself.

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

## Architecture Patterns

### System Architecture Diagram

```text
GraphQL request (mutation: addChild / addSpouse / addParent / addSibling / editMember / deleteMember)
        │
        ▼
Apollo Server 4 — validation phase
        │  runs validationRules (incl. maxDepthRule({ n: MAX_QUERY_DEPTH }))  ──▶ over-depth query rejected here, 0 DB cost (D-08)
        ▼
expressMiddleware `context` factory (backend/src/server.js)
        │  builds: { models, user, clientIp, loaders: createLoaders(models) }  ──▶ loaders are PER-REQUEST (D-07)
        ▼
Resolver (backend/src/resolvers/familyMember.resolver.js)
        │  1. requireFamilyAccess(user)                         (D-11, existing gate)
        │  2. scope = await computeEditableScope(user.familyMemberId)   (PERM-05, single reused utility)
        │  3. for every id referenced in the mutation args:
        │       assert scope.ids.has(id)  else throw             (D-02 anti-escalation invariant, SC-4)
        │  4. sequelize.transaction(async (t) => { ... })         (D-05/D-06 write, reusing familyMember.service.js helpers)
        ▼
familyMember.service.js (existing: wouldCreateCycle / linkParent / addChild / setSpouse — REUSED, not reimplemented per D-10)
        ▼
MySQL (family_members, spouses tables)

── Separately, on READ of recursive fields (mother/father/spouses/children/siblings) ──

GraphQL response shape resolution
        │
        ▼
Field resolver on FamilyMember.children / .siblings / .spouses / .mother / .father
        │  calls context.loaders.childrenByParentId.load(member.id)  (batched — NOT one query per node)
        ▼
DataLoader batch function
        │  ONE FamilyMember.findAll({ where: { motherId/fatherId: { [Op.in]: allRequestedParentIds } } })
        ▼
MySQL — query count stays flat as tree depth grows (SC-5)
```

### Recommended Project Structure

```
backend/src/
├── config/
│   └── env.js                       # add MAX_QUERY_DEPTH (env-overridable, D-08)
├── graphql/
│   └── serverConfig.js              # NEW — shared { typeDefs, resolvers, validationRules }, imported by server.js AND test/helpers.js
├── loaders/
│   └── familyMember.loaders.js      # NEW — createLoaders(models): memberById, childrenByParentId, spousesByMemberId
├── services/
│   └── familyMember.service.js      # EXTEND — add computeEditableScope(memberId), reuse wouldCreateCycle/linkParent/addChild/setSpouse
├── resolvers/
│   └── familyMember.resolver.js     # EXTEND — mutation surface + recursive field resolvers, all gated per D-11
├── schemas/
│   └── familyMember.schema.js       # EXTEND — mother/father/spouses/children/siblings fields, mutation defs
└── utils/
    └── auth.js                      # unchanged (requireFamilyAccess already exists, D-11 carried forward)

backend/test/
└── helpers.js                       # UPDATE — graphql() must build contextValue using the SAME serverConfig.js + createLoaders(models) as production (Pitfall 13 parity)
```

### Pattern 1: Shared Apollo config to guarantee test/production parity

**What:** Extract `{ typeDefs, resolvers, validationRules }` into one module, e.g. `backend/src/graphql/serverConfig.js`, and have both `backend/src/server.js` and `backend/test/helpers.js` construct their `ApolloServer` instance from it.

**When to use:** Immediately, as a prerequisite task before any Phase 14 resolver work — every subsequent SC-5 test depends on this.

**Why (verified from this codebase, not assumed):**
```javascript
// CURRENT backend/src/server.js
const apollo = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });
// no validationRules today — safe, because there is no recursive type yet

// CURRENT backend/test/helpers.js — a SEPARATE, independently-constructed instance
const server = new ApolloServer({ typeDefs, resolvers, plugins: [rateLimitPlugin] });
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  return (await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp } }   // <-- no `loaders` key at all today
  )).body.singleResult;
}
```
If `validationRules: [maxDepthRule(...)]` is added only to `server.js`'s instance, and `loaders` is added only inside `server.js`'s `context` factory, **every one of the 195 existing tests plus every new Phase 14 test that goes through `graphql()` will never exercise either mechanism.** The SC-5 depth-limit test would need to hand-roll its own separate ApolloServer/graphql-js call, diverging from every other test in the suite, and any resolver written to call `context.loaders.x.load(...)` will throw `Cannot read properties of undefined` in every test that doesn't manually inject `loaders`.

**Recommended shape:**
```javascript
// backend/src/graphql/serverConfig.js
import { typeDefs } from '../schemas/index.js';
import { resolvers } from '../resolvers/index.js';
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import { env } from '../config/env.js';

export const validationRules = [
  maxDepthRule({ n: env.maxQueryDepth, ignoreIntrospection: false })
  // ignoreIntrospection: false closes the documented introspection-bypass
  // advisory (GHSA-hmfr-rx46-4jx2, fixed upstream in 2.4.2) belt-and-suspenders.
];

export { typeDefs, resolvers };
```
```javascript
// backend/src/server.js
import { typeDefs, resolvers, validationRules } from './graphql/serverConfig.js';
import { createLoaders } from './loaders/familyMember.loaders.js';
const apollo = new ApolloServer({ typeDefs, resolvers, validationRules, plugins: [rateLimitPlugin] });
// ...
context: async ({ req }) => ({
  models,
  user: await getUserFromRequest(req, models),
  clientIp: req.ip,
  loaders: createLoaders(models)
})
```
```javascript
// backend/test/helpers.js
import { typeDefs, resolvers, validationRules } from '../src/graphql/serverConfig.js';
import { createLoaders } from '../src/loaders/familyMember.loaders.js';
const server = new ApolloServer({ typeDefs, resolvers, validationRules, plugins: [rateLimitPlugin] });
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  return (await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp, loaders: createLoaders(models) } }
  )).body.singleResult;
}
```

### Pattern 2: Request-scoped DataLoader with explicit batch-function invariants

**What:** `createLoaders(models)` returns a fresh object of `DataLoader` instances every call; the Apollo `context` factory (which already runs once per request in this codebase) calls it once per request.

**When to use:** Any GraphQL field resolver that loads `FamilyMember`/`Spouse` rows keyed by a parent's id, inside a list context (i.e., resolved once per node while walking a tree).

**Batch-function contract (MUST hold for every loader — this is DataLoader's hard invariant, not a style preference):**
- The array returned by the batch function MUST be the same length as, and positionally aligned with, the input keys array. A missing row is represented as `null`/`undefined` at that position — never filtered out.
- `cacheKeyFn`: DataLoader's default cache key is reference/`===` equality (works for primitives like numbers/strings by value). **Risk specific to this codebase:** GraphQL `ID!` arguments deserialize as **strings**, while Sequelize `INTEGER.UNSIGNED` primary keys are returned as **numbers**. If a resolver sometimes calls `.load(someGraphQLIdString)` and sometimes `.load(memberInstance.motherId)` (a number), DataLoader treats `"5"` and `5` as different cache keys and batches them separately — silently defeating batching for exactly the requests where two different call sites should have hit the same key. **Mitigation:** normalize every loader key to a single type at the call site (recommend: always coerce to `Number(id)` before `.load()`, since internal FK columns are already numbers and GraphQL `ID` args just need `Number()` applied once at the resolver boundary), or set `cacheKeyFn: (key) => String(key)` on each loader as a defensive normalization.

```javascript
// backend/src/loaders/familyMember.loaders.js
import DataLoader from 'dataloader';
import { Op } from 'sequelize';

export function createLoaders(models) {
  return {
    memberById: new DataLoader(async (ids) => {
      const rows = await models.FamilyMember.findAll({ where: { id: ids } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null); // length/order invariant
    }),

    childrenByParentId: new DataLoader(async (parentIds) => {
      const rows = await models.FamilyMember.findAll({
        where: { [Op.or]: [{ motherId: parentIds }, { fatherId: parentIds }] }
      });
      const byParent = new Map(parentIds.map((id) => [id, []]));
      for (const row of rows) {
        if (row.motherId != null && byParent.has(row.motherId)) byParent.get(row.motherId).push(row);
        if (row.fatherId != null && byParent.has(row.fatherId)) byParent.get(row.fatherId).push(row);
      }
      return parentIds.map((id) => byParent.get(id));
    }),

    spousesByMemberId: new DataLoader(async (memberIds) => {
      const rows = await models.Spouse.findAll({
        where: { [Op.or]: [{ memberAId: memberIds }, { memberBId: memberIds }] },
        include: [{ association: 'memberA' }, { association: 'memberB' }]
      });
      const byMember = new Map(memberIds.map((id) => [id, []]));
      for (const row of rows) {
        if (byMember.has(row.memberAId)) byMember.get(row.memberAId).push(row.memberB);
        if (byMember.has(row.memberBId)) byMember.get(row.memberBId).push(row.memberA);
      }
      return memberIds.map((id) => byMember.get(id));
    })
  };
}
```
**Never construct these at module scope** — a module-level `new DataLoader(...)` would cache across every request/user forever, leaking one user's family data into another user's resolved fields (D-07 explicitly calls this out as the reason for per-request construction).

### Pattern 3: Bounded-query editable-scope computation (PERM-05)

**What:** One utility, `computeEditableScope(memberId)` in `backend/src/services/familyMember.service.js`, returning the actor's full editable set in a small, fixed number of queries — never growing with tree depth/size.

**When to use:** At the top of every family-domain mutation resolver, immediately after `requireFamilyAccess(user)`.

```javascript
// backend/src/services/familyMember.service.js (addition)
export async function computeEditableScope(memberId, { transaction } = {}) {
  if (memberId == null) return { ids: new Set(), self: null, mother: null, father: null, spouses: [], children: [], siblings: [] };

  const self = await models.FamilyMember.findByPk(memberId, { transaction });
  if (!self) return { ids: new Set(), self: null, mother: null, father: null, spouses: [], children: [], siblings: [] };

  const parentIds = [self.motherId, self.fatherId].filter((id) => id != null);

  const [parents, spouseRows, children, siblings] = await Promise.all([
    parentIds.length ? models.FamilyMember.findAll({ where: { id: parentIds }, transaction }) : [],
    models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
      include: [{ association: 'memberA' }, { association: 'memberB' }],
      transaction
    }),
    models.FamilyMember.findAll({
      where: { [Op.or]: [{ motherId: memberId }, { fatherId: memberId }] },
      transaction
    }),
    // D-03: shares EITHER parent, excluding self. Only OR-clause on non-null
    // parent ids that self actually has — an empty parentIds means no
    // sibling query fires (correct: no parent recorded => no derivable siblings).
    parentIds.length
      ? models.FamilyMember.findAll({
          where: {
            [Op.and]: [
              { id: { [Op.ne]: memberId } },
              { [Op.or]: parentIds.flatMap((pid) => [{ motherId: pid }, { fatherId: pid }]) }
            ]
          },
          transaction
        })
      : []
  ]);

  const spouses = spouseRows.map((row) => (row.memberAId === memberId ? row.memberB : row.memberA));

  const ids = new Set([
    memberId,
    ...parentIds,
    ...spouses.map((s) => s.id),
    ...children.map((c) => c.id),
    ...siblings.map((s) => s.id)
  ]);

  return { ids, self, mother: null /* resolved from parents by role if needed */, father: null, parents, spouses, children, siblings };
}
```
This is **5 queries total regardless of how deep or wide the tree is** — satisfies "bounded number of queries" and mirrors the `Op.or`/`Promise.all` idioms already present in `familyMember.service.js`.

**Correctness traps this shape must be tested against (SC-3):**
- **Grandparent excluded:** `self.mother.motherId` is never queried — the scope computation only reads `self`'s own `motherId`/`fatherId` once, never recurses upward.
- **Cousin excluded:** a parent's sibling's child is never reached — siblings are computed from `self`'s own parent ids only, not from the parents' own sibling sets.
- **Sibling-of-sibling excluded (the genuinely tricky case, per D-03):** if `self` shares only `fatherId` with sibling S (a half-sibling, S's `motherId` differs from `self.motherId`), then S's *other* sibling (via S's `motherId`, a person S shares with a different parent) must NOT appear in `self`'s scope. This falls out correctly from the shape above **only because** the sibling query's OR-clause is built from `self`'s own `parentIds`, never from a sibling's parentIds — write an explicit fixture for this (three-generation-adjacent construction: `self` and `S` share `fatherId`; `S` and `T` share `motherId` (different from `self`'s); assert `T ∉ scope(self)`).
- **`Op.ne` usage above must be verified in the plan against the actual Sequelize 6.37 operator API** — this is a standard, stable operator, but confirm no regression against the pinned version during implementation.

### Pattern 4: Anti-escalation validation at the mutation boundary (SC-4, D-01/D-02)

**What:** Every mutation argument that references an *existing* member id (as opposed to a `newMember` payload) must be checked against `scope.ids` before any write executes, inside the same transaction as the write.

```javascript
// Sketch — addChild resolver
addChild: async (_parent, { newMember, existingOtherParentId }, { models, user }) => {
  requireFamilyAccess(user);
  const scope = await computeEditableScope(user.familyMemberId);
  if (!scope.self) throw new Error('Your account is not linked to a family member.');

  // D-02 invariant: any REFERENCED existing id must already be in scope.
  if (existingOtherParentId != null && !scope.ids.has(Number(existingOtherParentId))) {
    throw new Error('You may only reference relatives already within your editable scope.');
  }

  return sequelize.transaction(async (t) => {
    // D-01: the child itself is ALWAYS a new node — never accept an existing childId here.
    const child = await addChild({
      ...sanitizeNewMember(newMember),
      motherId: /* derive from self.gender/role + existingOtherParentId */,
      fatherId: /* derive similarly */
    }, { transaction: t });
    return child;
  });
}
```

**TOCTOU consideration:** because D-02's invariant is monotonic in one direction only (a member's scope grows *only* by creating new nodes, never by referencing existing ones — D-05 forbids rewiring, D-01 forbids attaching to existing subtrees), there is no realistic race where computing scope, then writing, admits an edge the actor shouldn't have. The remaining risk is ordinary double-submit (same mutation fired twice concurrently) — mitigate with the same `sequelize.transaction(...)` pattern already established in `linkUserToMember` (Phase 13 WR-01 fix), which this phase should reuse verbatim as the transactional template.

**What the SC-4 adversarial test must assert (already specified in CONTEXT, restated for the plan):** a member-user attempts to reference an existing node **outside** their scope (a stranger's linked member, and a grandparent) as a relative endpoint via each mutation that accepts an existing-id reference, and every one is rejected with the same class of error.

### Pattern 5: Field-locked editing when target has a linked user (D-06)

```graphql
type FamilyMember {
  ...
  linkedUser: User   # already resolvable via the existing FamilyMember.hasOne(User, { as: 'linkedUser' }) association
}
```
```javascript
editMember: async (_parent, { id, fields }, { models, user }) => {
  requireFamilyAccess(user);
  const scope = await computeEditableScope(user.familyMemberId);
  const targetId = Number(id);
  if (!scope.ids.has(targetId) && user.role !== 'ADMIN') {
    throw new Error('This member is outside your editable scope.');
  }

  const target = await models.FamilyMember.findByPk(targetId, { include: [{ association: 'linkedUser' }] });
  if (!target) throw new Error('Family member not found.');

  // D-06: if the target has its OWN linked user, only that user or an admin may edit.
  if (target.linkedUser && target.linkedUser.id !== user.id && user.role !== 'ADMIN') {
    throw new Error('This member manages their own profile and cannot be edited by others.');
  }

  return target.update(fields);
}
```

### Anti-Patterns to Avoid
- **Computing "editable scope" inline, per-resolver:** locked requirement (PERM-05) is a single, reused utility — any resolver that independently re-derives "who can I edit" duplicates the correctness burden and risks silent over-scoping (this is verbatim Pitfall 7 from the milestone's own prior research).
- **Trusting a client-supplied scope/role claim:** never accept a `scope`/`isEditable` boolean from the mutation input — always recompute server-side, fresh, per request.
- **Module-level DataLoader instantiation:** leaks across requests behind a permission boundary — always construct inside the per-request `context` factory.
- **Reusing "sibling" display logic as the permission-scope sibling logic without a dedicated test:** they may coincide today but should remain independently tested so a future display-only relaxation (e.g., showing half-siblings differently) doesn't silently loosen the edit-permission boundary too.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Per-request request-scoped batching cache | A custom `Map`-based memoization keyed by request | `dataloader` | Solves cache-key normalization, batching scheduling (microtask-based), and error-per-key semantics correctly; this is exactly the problem the package exists for |
| GraphQL query-depth counting (including fragment cycles) | A hand-rolled AST walker | `@escape.tech/graphql-armor-max-depth`'s `maxDepthRule` | Already handles fragment-spread cycles (a `visitedFragments` map prevents infinite recursion through recursive fragment definitions) — a hand-rolled walker is exactly the kind of DoS-adjacent code that's easy to get subtly wrong |
| Ancestor-cycle prevention for parent edges | A new cycle-check | `wouldCreateCycle` in `familyMember.service.js` (Phase 12) | D-10 — reuse, don't reimplement; already tested and bounded (`MAX_DEPTH = 100` BFS) |
| Symmetric spouse read/write | A second mirrored write path | `setSpouse`/`getSpouseRows` in `familyMember.service.js` (Phase 12) | D-10 — the canonical-ordering `Spouse` model already guarantees symmetry |
| Blank-string-to-null sanitization for new-member payloads | A second copy of this logic in `familyMember.resolver.js` | Export `sanitizeNewMember`/`OPTIONAL_FAMILY_MEMBER_FIELDS` from `user.resolver.js` (or relocate to `familyMember.service.js`, arguably its more correct home) and import | This exact helper already exists (CR-01 fix, Phase 13) and every Phase-14 mutation accepting a `NewFamilyMemberInput` needs the identical blank→null behavior — duplicating it risks the two copies drifting |

**Key insight:** every hand-roll temptation in this phase (depth counting, batching, cycle detection, symmetric writes, input sanitization) already has either an actively-maintained library or an existing, tested in-repo helper. The actual net-new logic this phase should hand-write is narrow: the scope-computation query shape and the per-mutation scope-membership checks — everything else is wiring/reuse.

## Common Pitfalls

### Pitfall 1: Test harness silently bypasses DataLoader and validationRules (see Pattern 1 above)
**What goes wrong:** Resolvers written to use `context.loaders.x.load(...)` throw in every existing test; the depth-limit rule is never exercised by any test using the `graphql()` helper.
**Why it happens:** `test/helpers.js` predates this phase and constructs its own `ApolloServer`/`contextValue`, which was fine when there was no recursive schema and no loaders — this phase is the first to introduce either.
**How to avoid:** Extract shared `serverConfig.js` + `createLoaders(models)`; update `test/helpers.js` in the SAME task/commit that adds the first loader-using resolver, never after.
**Warning signs:** Any Phase 14 resolver test failing with "Cannot read properties of undefined (reading 'load')"; a depth-limit test that passes only because it constructs its own separate ApolloServer instance instead of using `graphql()`.

### Pitfall 2: DataLoader cache-key type mismatch (string `ID!` vs numeric FK) silently defeats batching
**What goes wrong:** Query-count assertions (SC-5) pass in a naive test (single caller, single id type) but batching quietly fails once GraphQL-string ids and Sequelize-numeric ids both flow into the same loader from different call sites.
**Why it happens:** GraphQL's `ID` scalar serializes as a string on the wire/in resolver args; Sequelize FK columns are numbers. DataLoader's default cache key is value equality, and `"5" !== 5`.
**How to avoid:** Normalize every `.load()` call site to `Number(id)`, or set an explicit `cacheKeyFn: String` on each loader. Test this directly: a query that mixes a GraphQL-arg-supplied id and an internally-resolved FK id for the *same* member must resolve to exactly one batched DB call, not two.
**Warning signs:** Query-count test passes with a single-caller-type fixture but the count creeps up when a mutation echoes back a just-created child alongside a query for an existing sibling in the same request.

### Pitfall 3: `MaxDepthVisitor`'s `ignoreIntrospection` default (`true`) reopens a previously-patched bypass if misconfigured
**What goes wrong:** A GHSA advisory (GHSA-hmfr-rx46-4jx2, fixed in 2.4.2) documented a bypass via naming a fragment/field `__schema` to skip depth counting when `ignoreIntrospection: true` (the default). The library is already patched at `2.4.2`, but the *general pattern* (introspection carve-outs interacting with attacker-controlled naming) is worth being deliberate about.
**Why it happens:** `ignoreIntrospection: true` is a sensible default for legitimate GraphQL tooling (introspection queries can be deep) but widens the trusted surface.
**How to avoid:** Pin the dependency to `^2.4.2` (patched) at minimum; consider `ignoreIntrospection: false` explicitly, since this app's schema is small enough that introspection depth is not a real UX concern, closing the class of bypass entirely rather than relying on the patch alone.
**Warning signs:** A hand-crafted query using a fragment/field literally named `__schema` that manages to exceed `MAX_QUERY_DEPTH` without being rejected.

### Pitfall 4: `Op.ne`/`Op.and` composition for the sibling query is easy to get subtly wrong for the "either parent" rule
**What goes wrong:** A naive implementation might write `WHERE motherId = self.motherId OR fatherId = self.fatherId` without guarding for `self.motherId`/`self.fatherId` being `null` — in MySQL, `column = NULL` is never true (not "IS NULL"), so a null-parent-id branch silently contributes zero rows, which happens to be *correct* here, but any refactor toward an ORM-independent JS null-check must preserve this exactly, and any switch to `Op.eq: null` would break it (`Op.eq: null` compiles to `IS NULL`, which is a completely different — and wrong — query for this rule).
**Why it happens:** SQL NULL semantics ("unknown", not "not equal") are a classic footgun, and this rule specifically depends on getting them right for the half-sibling correctness case.
**How to avoid:** Build the `Op.or` clause array only from parent ids that are non-null (as shown in Pattern 3) — never include a `{ motherId: null }`-style clause meant to represent "and it doesn't matter."
**Warning signs:** A sibling-derivation test that only covers the both-parents-known case; no test where `self` has only one parent recorded.

### Pitfall 5: Forgetting the `dashboard` resolver gating fix (WR-04) because it's not a new resolver
**What goes wrong:** All the adversarial-testing energy this phase goes into the *new* family resolvers; the pre-existing `dashboard` resolver (in `user.resolver.js`, using `requireAuth` only) is easy to overlook since it's not being newly written.
**Why it happens:** It's a one-line diff (`requireAuth` → `requireFamilyAccess`) buried in a file this phase doesn't otherwise touch.
**How to avoid:** Explicit task item: change `backend/src/resolvers/user.resolver.js`'s `dashboard` resolver to call `requireFamilyAccess(user)` instead of `requireAuth(user)`, and update/extend `backend/src/resolvers/dashboard.test.js` to cover a verified-but-unlinked non-admin user being rejected (mirroring the existing `familyMember.resolver.test.js` SC5 test pattern).
**Warning signs:** `dashboard.test.js` still only tests ADMIN vs USER, with no unlinked-user case, after Phase 14 is "done."

## Code Examples

### Registering the depth-limit rule (Apollo Server 4, `validationRules`)
```javascript
// Source: verified by reading @escape.tech/graphql-armor-max-depth@2.4.2's
// published dist/graphql-armor-max-depth.cjs.dev.js directly (unpkg) — the
// exported `maxDepthRule` is `(options) => (context) => new MaxDepthVisitor(context, options)`,
// which is exactly graphql-js's `ValidationRule` signature.
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';

new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [maxDepthRule({ n: 100, ignoreIntrospection: false })]
});
```
Rejections from a `ValidationRule` surface as a standard GraphQL validation error (HTTP 200 body with an `errors[]` array in Apollo Server 4's default `expressMiddleware` setup; extensions default to `code: 'GRAPHQL_VALIDATION_FAILED'`) — no resolver runs, zero DB cost, matching D-08's stated intent exactly.

### Measuring resolved SQL query count in a Vitest integration test (SC-5)
```javascript
// Pattern verified against this project's actual backend/src/config/database.js,
// which currently sets `logging: env.nodeEnv === 'development' ? console.log : false`.
// Sequelize reads `sequelize.options.logging` per-query at execution time, so it
// can be swapped for the duration of a single test and restored afterward.
import { sequelize } from '../../models/index.js';

async function countQueries(fn) {
  const original = sequelize.options.logging;
  let count = 0;
  sequelize.options.logging = () => { count += 1; };
  try {
    await fn();
  } finally {
    sequelize.options.logging = original;
  }
  return count;
}

it('resolves a deep tree query with a flat, bounded query count', async () => {
  const root = await buildGenerationFixture({ depth: 8, childrenPerNode: 2 }); // parameterisable factory, see Wave 0 gap below
  const before = await countQueries(async () => {
    await graphql(DEEP_TREE_QUERY, { id: root.id }, actingUser);
  });
  expect(before).toBeLessThan(15); // bounded, NOT proportional to depth*childrenPerNode
});
```
This is a MEDIUM-confidence recommendation (no official Sequelize/Vitest doc names this exact recipe; it's derived directly from reading `sequelize.options.logging`'s documented behavior and this project's own `database.js`). An alternative considered: `benchmark: true` plus a logging function that receives `(sql, timingMs)` — useful if the plan also wants to assert timing, not just count; not required for SC-5's stated bar.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `graphql-depth-limit` as the default depth-limiting choice | `@escape.tech/graphql-armor-max-depth` (or the broader `graphql-armor` suite) | `graphql-depth-limit`'s last release was 2022-05-04; `graphql-armor`'s max-depth plugin has continued receiving releases through 2025-12-28, including a security patch (GHSA-hmfr-rx46-4jx2) | An unmaintained package can still work correctly (verified: no breaking API changes needed for graphql 16), but a maintained alternative with an exact peer-version match and a patched security advisory is the stronger choice for a phase whose whole point is query-safety |

**Deprecated/outdated:** none of this project's existing patterns (guard-clause auth, barrel aggregation, transaction-wrapped multi-step writes) are outdated — Phase 14 extends them, it does not need to replace them.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended mutation surface shape (separate `addParent`/`addSpouse`/`addChild`/`addSibling`/`editMember`/`deleteMember` mutations rather than one `addRelative`) | Architecture Patterns, Alternatives Considered | Low — explicitly marked "Claude's Discretion" in CONTEXT.md; the planner/executor may choose differently without violating any locked decision, and the underlying scope/anti-escalation logic is identical either way |
| A2 | The exact Vitest query-counting recipe (`sequelize.options.logging` swap) | Code Examples | Low-Medium — if a future Sequelize major version changes how `options.logging` is read internally, this recipe would need revalidation; not externally documented as a named pattern, derived from reading this project's own config and Sequelize's documented `logging`/`benchmark` interface |
| A3 | `computeEditableScope`'s exact query shape (5 bounded queries via `Promise.all`) is correct against all SC-3 exclusion fixtures, including sibling-of-sibling | Architecture Patterns (Pattern 3) | Medium — this is original reasoning verified only by manual trace-through, not by running the actual test fixtures (they don't exist yet); the plan MUST include the sibling-of-sibling fixture as a first-class red test before trusting this shape |
| A4 | `ignoreIntrospection: false` is safe/appropriate given this app's small schema | Common Pitfalls (Pitfall 3) | Low — introspection queries in this app's actual schema size are shallow; setting this to `false` only makes the rule slightly stricter, never looser |

## Open Questions

1. **Exact GraphQL field names for the new recursive relationships (`mother`/`father` singular vs. a `parents: [FamilyMember!]!` list)?**
   - What we know: the model uses two named FK columns (`motherId`/`fatherId`), so singular `mother`/`father` fields (nullable, matching column semantics) are the natural mapping.
   - What's unclear: whether the schema should also expose a combined `parents: [FamilyMember!]!` convenience field for UI consumption (Phase 15's `/manage` dropdowns) — not required by any Phase 14 success criterion.
   - Recommendation: ship `mother`/`father` as separate nullable fields this phase (matches the DB shape exactly, simplest to test); defer any combined `parents` list field to Phase 15 if the UI needs it, since it's pure sugar over the same DataLoader.

2. **Should `myEditableMembers` (a read-only query, Claude's Discretion item) ship this phase?**
   - What we know: it's "useful but not required by any Phase 14 requirement" per CONTEXT.md.
   - What's unclear: whether Phase 15's `/manage` UI work will need it immediately, making it cheaper to add now (while `computeEditableScope` is fresh) than to retrofit later.
   - Recommendation: add it — it's a near-zero-marginal-cost wrapper around the already-required `computeEditableScope` utility (`myEditableMembers: async (_p,_a,{user}) => (await computeEditableScope(user.familyMemberId)).ids`-shaped resolver returning the member rows), and de-risks Phase 15 by proving the utility's output shape against a real query earlier.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Backend runtime | ✓ | v24.15.0 (installed) | — |
| npm workspaces | Package install/build | ✓ | npm 11.12.1 | — |
| MySQL (Docker-composed test DB) | Integration tests (`backend/test/globalSetup.js`) | ✓ (confirmed — full 195-test backend suite ran green this session) | MySQL 8.4 per `docker-compose.yml` | — |
| Vitest | Test runner | ✓ | `^4.1.10` (pinned in `backend/package.json`) | — |
| `dataloader` | D-07 | ✗ (not yet installed) | target `^2.2.3` | none needed — install is a standard `npm install --workspace backend` step in the plan |
| `@escape.tech/graphql-armor-max-depth` | D-08 | ✗ (not yet installed) | target `^2.4.2` | none needed — same as above |

**Missing dependencies with no fallback:** none — both new packages are standard `npm install` additions with no environment prerequisite beyond what already works (Node/npm/MySQL/Vitest all confirmed functional this session).

⚠️ **Node version discrepancy noted, not phase-blocking:** `CLAUDE.md` states "Node 18.x, pinned via `.nvmrc` (`18`)," but this repository's actual `.nvmrc` contains `24`, `backend/package.json`'s `engines` field is `"24.x"`, and the installed/active Node is `v24.15.0`. Both recommended packages declare `engines.node: >=18.0.0`, so this does not block Phase 14 — but CLAUDE.md's own stack-detection text is stale relative to the repository's current state. Not this phase's task to fix, but the planner should not assume CLAUDE.md's "18.x" line reflects reality when reasoning about runtime compatibility.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.10` |
| Config file | `backend/vitest.config.js` (globalSetup creates/drops a fresh `_test`-suffixed DB per run; `pool: 'forks'`, `fileParallelism: false`) |
| Quick run command | `npm test --workspace backend -- <path-to-file>` (or `npx vitest run <path>` from `backend/`) |
| Full suite command | `npm test --workspace backend` (currently 29 files / 195 tests, confirmed green this session, ~42s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| MEM-04 | Member edits fields on an in-scope relative; rejected outside scope | integration (Apollo `executeOperation` via `graphql()`) | `npx vitest run src/resolvers/familyMember.editMember.test.js` | ❌ Wave 0 (new file) |
| REL-04 | Siblings derived from shared-either-parent, never stored | unit (service) + integration (schema field) | `npx vitest run src/services/familyMember.scope.test.js` | ❌ Wave 0 |
| PERM-01 | Member adds parent/spouse/child/sibling (new-node-only, D-01) | integration | `npx vitest run src/resolvers/familyMember.addRelative.test.js` | ❌ Wave 0 |
| PERM-02 | Member edits fields+adds edges on in-scope members only | integration | same file as MEM-04/PERM-01 tests | ❌ Wave 0 |
| PERM-03 | Member cannot delete; admin can, anywhere | integration | `npx vitest run src/resolvers/familyMember.deleteMember.test.js` | ❌ Wave 0 |
| PERM-04 | Admin add/edit/remove anywhere | integration (shared file with PERM-01..03 admin-path assertions) | same files as above | ❌ Wave 0 |
| PERM-05 | Single reused scope utility; grandparent/cousin/sibling-of-sibling excluded | unit (service-level, no GraphQL layer) | `npx vitest run src/services/familyMember.scope.test.js` | ❌ Wave 0 |
| SC-4 (adversarial) | Cross-subtree escalation via existing-id reference is rejected | integration (adversarial, LOCKED per D-09) | same file as PERM-01/02 | ❌ Wave 0 |
| SC-5 (query safety) | Flat query count on deep tree; over-depth query rejected | integration + a raw validation-only test | `npx vitest run src/graphql/queryDepth.test.js` and `src/services/familyMember.queryCount.test.js` | ❌ Wave 0 |
| WR-04 | `dashboard` resolver gated by `requireFamilyAccess`, not `requireAuth` | integration (extend existing file) | `npx vitest run src/resolvers/dashboard.test.js` | ✅ exists, needs a new case added |

### Sampling Rate
- **Per task commit:** run the single new/modified test file (`npx vitest run <file>` from `backend/`).
- **Per wave merge:** full backend suite (`npm test --workspace backend`).
- **Phase gate:** full suite green (this session's baseline: 195/195 passing) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `backend/src/graphql/serverConfig.js` — shared config module (prerequisite for everything else, see Pattern 1)
- [ ] `backend/src/loaders/familyMember.loaders.js` — DataLoader factory
- [ ] `backend/test/helpers.js` — update `graphql()` to build `contextValue` via `serverConfig.js` + `createLoaders(models)` (parity fix, Pitfall 13)
- [ ] `backend/test/familyTreeFactory.js` (or similar) — a parameterisable N-generation fixture builder for the SC-5 query-count test; none exists today (existing tests only hand-author 2-3 node fixtures)
- [ ] `backend/src/services/familyMember.scope.test.js` — new file, service-level tests for `computeEditableScope` incl. the sibling-of-sibling exclusion fixture
- [ ] `backend/src/resolvers/familyMember.addRelative.test.js` (or one file per mutation, per the recommended separate-mutations shape) — new adversarial + happy-path integration tests
- [ ] Framework install: none — Vitest already configured; only the two new npm packages need installing (`npm install --workspace backend dataloader @escape.tech/graphql-armor-max-depth`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | no (unchanged this phase) | existing JWT bearer pattern (`backend/src/utils/auth.js`) |
| V3 Session Management | no (unchanged this phase) | existing stateless JWT, `passwordChangedAt` revocation (Phase 9) |
| V4 Access Control | **yes — the core of this phase** | `requireFamilyAccess` guard (existing) + `computeEditableScope`-backed per-mutation authorization checks (new, PERM-05) |
| V5 Input Validation | yes | GraphQL schema-level typing (existing) + `sanitizeNewMember`-style blank/whitespace normalization (existing helper, reused) + explicit id-membership checks against `scope.ids` (new) |
| V6 Cryptography | no (unchanged this phase) | n/a |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Broken object-level authorization (BOLA) — a member references an id outside their scope to read/write it | Elevation of Privilege | `computeEditableScope` + explicit `scope.ids.has(id)` check on every referenced id, inside every mutation resolver (Pattern 4) |
| GraphQL query-depth/complexity DoS | Denial of Service | `maxDepthRule` validation rule, rejecting before any resolver runs (D-08) |
| N+1 resource-exhaustion DoS (many DB round-trips per single request starving the connection pool) | Denial of Service | Per-request DataLoader batching (D-07); this project's Sequelize pool is untuned (default max 5 per `.planning/research/PITFALLS.md` Performance Traps) — flat query counts matter more here than in a pool-tuned deployment |
| Confused-deputy via cross-subtree relationship edge (member A fabricates a claim of relation to member B to inherit B's subtree into their own scope) | Elevation of Privilege | D-01 (create-new-only) + D-02 (existing-id references restricted to already-in-scope nodes) — closes exactly this vector at the mutation-argument-validation layer |

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| MEM-04 | A user can edit the fields of a family member within their permitted scope | Pattern 5 (field-locked editing) + Pattern 3 (scope computation) |
| REL-04 | Siblings derived from shared parents, never stored, presented as such | Pattern 3 (sibling query shape) + Pitfall 4 (NULL-semantics trap) |
| PERM-01 | Member adds immediate relatives (parents, spouse, children, siblings) | Pattern 4 (mutation shape, D-01/D-02 enforcement) |
| PERM-02 | Member edits fields+relationships within immediate-relative set | Pattern 3 + Pattern 5 |
| PERM-03 | Member cannot remove any member; admin-only | Architecture Patterns (deleteMember gated by `requireAdmin` directly, no scope computation needed since members never get delete rights) |
| PERM-04 | Admin adds/edits/removes anywhere | same resolvers, `user.role === 'ADMIN'` bypass branch throughout Pattern 3-5 |
| PERM-05 | Backend computes editable set; no client-supplied scope trusted | Pattern 3 (`computeEditableScope`, the single reused utility) |

*(MEM-04/REL-04/PERM-01..05 are the phase's locked requirement set per `.planning/REQUIREMENTS.md`; WR-04 from Phase 13's deferred-items is an additional in-scope defect per CONTEXT.md, mapped under Common Pitfalls Pitfall 5 and the Validation Architecture table above.)*

## Sources

### Primary (HIGH confidence — verified via tool this session)
- `npm view dataloader` / `npm view @escape.tech/graphql-armor-max-depth` / `npm view graphql-depth-limit` (version, peerDependencies, time.modified) — run directly this session
- Direct source read of `@escape.tech/graphql-armor-max-depth@2.4.2`'s published `dist/graphql-armor-max-depth.cjs.dev.js` via unpkg — confirms `maxDepthRule`/`maxDepthPlugin` exports and the exact `MaxDepthVisitor` validation-rule shape
- This repository's own source, read directly: `backend/src/server.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/src/config/database.js`, `backend/src/models/index.js`, `backend/src/models/FamilyMember.js`, `backend/src/models/Spouse.js`, `backend/src/services/familyMember.service.js`, `backend/src/utils/auth.js`, `backend/src/resolvers/familyMember.resolver.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/*.test.js`
- `npm test --workspace backend` executed this session — 195/195 tests passing, confirming baseline green state and live MySQL test-DB availability

### Secondary (MEDIUM confidence)
- GitHub Security Advisory GHSA-hmfr-rx46-4jx2 (GraphQL Armor max-depth introspection bypass, fixed in 2.4.2) — found via WebSearch, cross-referenced against the currently-latest npm version (2.4.2) being the fixed version
- `.planning/research/PITFALLS.md` (this milestone's own prior research, 2026-07-21) — Pitfall 13 independently identifies the exact test-harness-parity risk this document leads with; corroborating, not contradicting

### Tertiary (LOW confidence)
- WebSearch results describing general Apollo Server 4 + `validationRules` + DataLoader wiring patterns (used only to confirm the mechanism is standard; the exact code in this document was written against this repo's actual files, not copied from search results)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both recommended packages verified via direct registry/source inspection, not just search
- Architecture: HIGH for the DataLoader/validationRules test-harness-parity finding (verified by reading this repo's actual test helper code); MEDIUM for the exact scope-computation query shape and mutation-surface naming (sound reasoning, not externally validated against a running implementation)
- Pitfalls: HIGH for the harness-parity pitfall (corroborated by both direct code reading and this milestone's own prior PITFALLS.md research); MEDIUM for the DataLoader cache-key type-mismatch pitfall (a known general DataLoader gotcha, applied to this codebase's specific string/number id mismatch by reasoning, not by reproducing the bug)

**Research date:** 2026-07-22
**Valid until:** 30 days (stable stack; no fast-moving dependencies in this phase's core recommendations)
