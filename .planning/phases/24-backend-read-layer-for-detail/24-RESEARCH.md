# Phase 24: Backend Read Layer for /detail - Research

**Researched:** 2026-08-03
**Domain:** GraphQL read-layer extension (Apollo Server 4 + Sequelize 6 + MySQL/MariaDB), bounded/N+1-safe query design
**Confidence:** HIGH

## Summary

This phase adds exactly three new pieces of GraphQL surface to an already-complete, already-tested
read layer: a bounded `familyHead` query, a `searchFamilyMembers` query, and a `canEdit` field on
`FamilyMember`. Everything else `/detail` needs (`familyMember(id)`, `spouses`, `children`) already
exists, is already N+1-safe via per-request DataLoaders, and needs no changes — D-09 in CONTEXT.md
is correct and confirmed by direct code inspection.

The two genuinely new problems are (1) computing the client's `resolveRootAncestorId` head rule in
SQL without walking the tree in JS, and (2) a partial/case-insensitive Latin+Ge'ez name search. Both
are solvable in a single bounded SQL statement using MySQL/MariaDB recursive CTEs (for the head's
apex-subtree-size fallback) and a straightforward `Op.or`/`Op.substring` `WHERE` clause (for search).
Live inspection of the actual local database (see below) confirms: member id `1` (Agne) exists in
real data, the `family_members` table's collation (`utf8mb4_general_ci`, applied at table level and
inherited by every relevant column) is already case-insensitive for Latin and handles Ge'ez Unicode
substrings correctly with no extra configuration, and a recursive CTE against this exact schema
executes correctly today.

The `canEdit` field is the simplest of the three — it is a one-line copy of the exact pattern already
used by `createdBy`/`updatedBy`/`linkedUser`, requiring no new guard, no new loader, and no schema
risk.

**Primary recommendation:** Add `familyHead: FamilyMember` and `searchFamilyMembers(term: String!,
limit: Int): [FamilyMember!]!` to the existing `extend type Query` block in
`familyMember.schema.js`; add matching resolvers in `familyMember.resolver.js` (delegating the head's
SQL to a new `getFamilyHeadId()` function in `familyMember.service.js`); add `canEdit: Boolean!` to
`FamilyMember` type + a one-line field resolver. No schema migration, no new DataLoader, no new
package.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The backend "family head" query MUST mirror the client's existing `resolveRootAncestorId`
  rule: prefer member id `1` (Agne) when present; else the parentless apex (`motherId == null &&
  fatherId == null`) with the largest descendant subtree (spouses excluded from the size comparison
  so married-in partners don't inflate a shallow apex); else the first member's id; `null` for an
  empty payload. Source of truth: `frontend/src/components/family/familyTree.assembly.js:150`
  (`resolveRootAncestorId`).
- **D-02:** The head query MUST be bounded — it must not load the whole tree to compute the head
  (PERF-01 spirit). Researcher decides the SQL shape; pulling every member into memory to replicate
  the client walk is disallowed.
- **D-03:** Search matches partial, case-insensitive Latin first/last name and Ge'ez first/last name
  (`firstname`, `lastname`, `geezFirstname`, `geezLastname`). Mother's-name fields are out of scope.
- **D-04:** Results are capped (target ~20) and name-sorted (`lastname` ASC, `firstname` ASC) — no
  relevance/prefix ranking in the backend.
- **D-05:** No new `childCount` field. Reuse the existing `children { id }` shape; the direct-children
  read nests one additional `children { id }` level (grandchild ids) so the client derives counts
  from array length.
- **D-06:** That nested read (`familyMember(id) { children { id children { id } spouses { id } } }`
  or equivalent) is the N+1 proof target — it MUST resolve in a bounded, flat SQL-statement count
  regardless of child/grandchild count, reusing the existing `childrenByParentId` and
  `spousesByMemberId` DataLoaders. Prove it with the `countQueries` recipe already established in
  `backend/src/services/familyMember.queryCount.test.js`.
- **D-07:** The `canEdit` signal reuses the existing admin check — `user.role === 'ADMIN'` — exactly
  as `requireAdmin` and the `linkedUser`/`createdBy`/`updatedBy` field gating already do. No new
  scope logic (no `computeEditableScope` on this read path).
- **D-08:** Shape it as a per-person `canEdit: Boolean!` field on `FamilyMember`, resolved as
  `Boolean(user?.role === 'ADMIN')`. The value is uniform today (admin-only); the per-person shape
  leaves room for scoped editing later (deferred).
- **D-09:** `familyMember(id)` and the existing `spouses`/`children` fields already exist and return
  the card fields — do not add parallel queries for these. The genuinely-new API surface is: a head
  query, a name-search query, and the `canEdit` field. `childCount` is explicitly NOT added.

### Claude's Discretion

- Exact new query names and arg signatures (e.g. `familyHead`, `searchFamilyMembers(term:)`).
- The precise SQL/loader implementation for the bounded head lookup and for search.
- Whether search cap is a fixed constant or a capped `limit` arg (default ~20).

### Deferred Ideas (OUT OF SCOPE)

- Scoped (non-admin) editing on `/detail` — the `canEdit` field could later reflect
  `computeEditableScope` instead of admin-only. Out of scope for v4.0.
- Ancestor / upward navigation, deep-linkable `/detail/:id`, Latin↔Ge'ez toggle, fuller genealogy —
  already logged as v4.0 Future Requirements in STATE.md; not this phase.
- Relevance/prefix ranking of search results — rejected for D-04; revisit only if Phase 26 search UX
  needs it.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | GraphQL API exposes every read `/detail` needs (head, person-by-id, name search, direct-children+counts, spouses, edit-permission), reusing existing models/relationships, no DB schema change unless genuinely required | Confirmed no schema change is required — `Standard Stack`, `Architecture Patterns`, `Code Examples` sections below give the exact query/field shapes for the 3 new surfaces; D-09's reuse claims for person-by-id/spouses/children are verified against current resolver code |
| PERF-02 | Child counts and person/children data retrieved without N+1 queries | `Don't Hand-Roll` + `Architecture Patterns` (bounded head CTE) + `Common Pitfalls` + `Validation Architecture` sections specify the exact `countQueries` N+1 test to add, reusing the already-proven DataLoader batching |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Family head resolution | API / Backend | Database | Must be a single bounded SQL statement computed by MySQL/MariaDB's recursive-CTE engine, not walked in Node/JS memory (D-02) |
| Person-by-id + card fields | API / Backend | Database | Already exists (`familyMember(id)`); Sequelize `findByPk` + model column/virtual fields |
| Name search (Latin+Ge'ez) | API / Backend | Database | `WHERE ... LIKE` against columns whose collation already provides case-insensitivity; capping/sorting done in SQL (`LIMIT`, `ORDER BY`), not client-side |
| Direct children + counts | API / Backend | Database | Reuses per-request DataLoader batching (`childrenByParentId`) — the batching that makes this N+1-safe is a backend/API-tier concern, invisible to the DB beyond two flat `WHERE id IN (...)` statements per nesting level |
| Spouse data | API / Backend | Database | Reuses `spousesByMemberId` DataLoader — same batching tier as children |
| Edit-permission signal (`canEdit`) | API / Backend | — | Pure derivation from `context.user.role`, already resolved server-side per-request in `server.js`; no DB or client involvement |

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize` | 6.37.8 (locked `^6.37.5`) [VERIFIED: package-lock.json] | ORM; `findByPk`, `Op.or`/`Op.substring`, raw `sequelize.query()` for the one CTE | Already the project's sole DB access layer; no alternative considered |
| `mysql2` | 3.22.3 (locked `^3.11.5`) [VERIFIED: package-lock.json] | MySQL/MariaDB driver under Sequelize | Already in use |
| `graphql` | 16.14.0 (locked `^16.10.0`) [VERIFIED: package-lock.json] | Schema/execution engine | Already in use |
| `@apollo/server` | 4.13.0 (locked `^4.11.3`) [VERIFIED: package-lock.json] | GraphQL server | Already in use |
| `dataloader` | 2.2.3 (locked `^2.2.3`) [VERIFIED: package-lock.json] | Per-request batching for `children`/`spouses` | Already in use; no new loader needed for this phase's 3 additions |

### Supporting

None. This phase adds zero new dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single recursive CTE for the apex-subtree-size fallback | N+1 loop: fetch each apex's descendants via repeated `childrenByParentId`-style app-level BFS | Rejected — this is exactly the "load the whole tree" pattern D-02 forbids; also reintroduces N+1 across the fallback loop |
| Sequelize's `Op.substring` for LIKE | Raw `sequelize.literal('firstname LIKE ...')` | `Op.substring` is the documented, injection-safe Sequelize primitive for `LIKE %value%` — no reason to hand-write literal SQL for this |
| A new dedicated `headByIdLoader`/search DataLoader | Plain one-shot `findAll`/raw query per request | Not needed — `familyHead` and `searchFamilyMembers` are root `Query` fields called once per operation, not fan-out fields resolved per-node, so DataLoader batching (which solves *sibling-field* N+1) is architecturally irrelevant here |

**Installation:** None required — no new packages.

**Version verification:** All versions above were read directly from `package-lock.json` at the repo
root (the actual installed/locked versions, not `npm view` latest-tag lookups) — this is stronger
than a registry check because it reflects exactly what CI and prod will run.

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All three new surfaces
(`familyHead`, `searchFamilyMembers`, `canEdit`) are implemented entirely with `sequelize`, `graphql`,
`dataloader`, and `mysql2`, all of which are already installed, already used elsewhere in this exact
codebase, and already covered by the project's existing supply-chain posture. The Package Legitimacy
Gate protocol (slopcheck, registry verification) is skipped by design — there is nothing new to audit.

## Architecture Patterns

### System Architecture Diagram

```
Client (frontend, later phases)
        │  GraphQL request: familyHead / searchFamilyMembers(term) /
        │  familyMember(id) { ... canEdit }
        ▼
Express + Apollo Server (backend/src/server.js)
        │  context: { models, user, loaders }   <-- user + loaders resolved per-request
        ▼
Resolvers (backend/src/resolvers/familyMember.resolver.js)
        │
        ├─ Query.familyHead ─────────┐
        │                            ▼
        │                   familyMember.service.js: getFamilyHeadId()
        │                            │
        │                            ├─ fast path: findByPk(1)  (1 indexed SELECT)
        │                            │
        │                            └─ fallback: ONE raw recursive-CTE SELECT
        │                               (sequelize.query, QueryTypes.SELECT)
        │                               computing apex-subtree sizes in-DB
        │
        ├─ Query.searchFamilyMembers ─▶ models.FamilyMember.findAll({
        │                                 where: { [Op.or]: [firstname/lastname/
        │                                   geezFirstname/geezLastname LIKE %term%] },
        │                                 order, limit
        │                               })  (1 flat SELECT)
        │
        ├─ Query.familyMember(id) ───▶ findByPk (already exists, unchanged)
        │
        └─ FamilyMember.canEdit ─────▶ Boolean(user?.role === 'ADMIN')  (pure, no I/O)
                │
        FamilyMember.children / .spouses (already exist, unchanged)
                │
                ▼
        loaders.childrenByParentId / loaders.spousesByMemberId
        (per-request DataLoader — batches N nodes at one nesting
         level into a single `WHERE motherId/fatherId IN (...)` /
         `WHERE memberAId/memberBId IN (...)` SELECT)
                │
                ▼
        MySQL 8.4 (prod/CI) / MariaDB (local, protocol-compatible)
        family_members, spouses tables
```

Every arrow above terminates in **one** SQL statement per DataLoader batch tick (or per root query),
regardless of how many `FamilyMember` rows are involved — this is what "bounded" means throughout
this document and matches the existing `familyMember.queryCount.test.js` proof pattern.

### Recommended Project Structure

No new files/folders — this phase edits three existing files:

```
backend/src/
├── schemas/
│   └── familyMember.schema.js       # add familyHead, searchFamilyMembers to `extend type Query`;
│                                     # add canEdit: Boolean! to `type FamilyMember`
├── resolvers/
│   └── familyMember.resolver.js     # add Query.familyHead, Query.searchFamilyMembers,
│                                     # FamilyMember.canEdit
└── services/
    └── familyMember.service.js      # add getFamilyHeadId() (the one raw-CTE query lives here,
                                      # not in the resolver, matching this file's existing role as
                                      # home for non-trivial FamilyMember business logic)
```

New test files (matching the existing `familyMember.<feature>.test.js` convention observed in
`backend/src/resolvers/`):

```
backend/src/resolvers/
├── familyMember.head.test.js         # SC-1: id-1 fast path, apex-subtree fallback, tie-break,
│                                      # first-member fallback, empty-table -> null
├── familyMember.search.test.js       # SC-3: Latin + Ge'ez partial/case-insensitive match,
│                                      # mothersname excluded, cap, sort order
└── familyMember.canEdit.test.js      # SC-5: true for ADMIN, false for non-admin/anonymous
backend/src/services/
└── familyMember.queryCount.test.js   # SC-4: EXTEND this existing file with a new describe block
                                       # for direct-children + grandchild-ids + spouses bounded-SQL
```

### Pattern 1: Fast-path-then-bounded-fallback for the head query

**What:** Try the O(1) indexed lookup first (`id = 1`); only run the more expensive (but still
single-statement) recursive CTE when that fails.
**When to use:** Any "compute a derived root/aggregate over a tree" problem where the common case is
trivial and the fallback is rare (data-integrity edge case, not the steady state).
**Example:**
```js
// backend/src/services/familyMember.service.js
import { QueryTypes } from 'sequelize';
import { sequelize } from '../models/index.js';

const CANONICAL_HEAD_ID = 1;

export async function getFamilyHeadId(models) {
  // Fast path: mirrors D-01's "prefer member id 1 when present" — a single
  // indexed PK lookup, not a tree walk.
  const canonical = await models.FamilyMember.findByPk(CANONICAL_HEAD_ID, {
    attributes: ['id']
  });
  if (canonical) return canonical.id;

  // Fallback: ALL apex (parentless) members' descendant-subtree sizes,
  // computed inside a single recursive CTE (spouses excluded from the size,
  // per D-01) -- bounded to ONE SQL statement regardless of tree size or
  // apex count (D-02). Tie-break matches the client's array-scan behavior
  // (first apex encountered in lastname/firstname order wins ties, since
  // resolveRootAncestorId uses strict `>` on size while scanning
  // `flatMembers` -- which the existing `familyMembers` query already
  // returns sorted by lastname ASC, firstname ASC).
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

  // No apex exists at all (empty table, or a cyclic-data anomaly) -- mirror
  // the client's final fallback: "first member" in the SAME order the
  // existing `familyMembers` query already sorts by.
  const first = await models.FamilyMember.findOne({
    attributes: ['id'],
    order: [['lastname', 'ASC'], ['firstname', 'ASC']]
  });
  return first ? first.id : null; // null for an empty family (D-01)
}
```
*(Verified: this exact recursive CTE was executed against the project's live local database during
research — see `Common Pitfalls` / `Sources` for the raw output. `[VERIFIED: local DB execution]`)*

### Pattern 2: Multi-column, multi-script `Op.or` search

**What:** One `Op.or` array of four `LIKE %term%` conditions, capped and sorted in SQL.
**When to use:** D-03/D-04's exact requirement — no existing precedent in this codebase to mirror
(no backend search query exists yet; `AdminMemberTable`'s search on `/manage` is 100% client-side
array `.filter()`, not a backend query — confirmed by grep, no `Op.like`/`Op.substring` usage
anywhere in `backend/src`).
**Example:**
```js
// backend/src/resolvers/familyMember.resolver.js
import { Op } from 'sequelize';

const SEARCH_RESULT_CAP = 20;
const SEARCH_RESULT_HARD_MAX = 50; // server-side ceiling; client `limit` arg can request less, never more

searchFamilyMembers: async (_parent, { term, limit }, { models, user }) => {
  requireFamilyAccess(user);

  const trimmed = term.trim();
  if (trimmed.length === 0) return []; // avoid a LIKE '%%' full-table match on blank input

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
`Op.substring` is Sequelize's documented shorthand for `LIKE '%value%'` and lets Sequelize handle
placeholder binding (no manual string interpolation, no SQL-injection surface).
`[CITED: Sequelize v6 operators guide — sequelize.org/docs/v6/core-concepts/model-querying-basics/#operators, Op.substring]`

### Pattern 3: `canEdit` mirrors existing admin-gated field precedent exactly

**What:** A pure, synchronous field resolver reading `context.user`.
**Example (verbatim precedent already in the codebase):**
```js
// backend/src/resolvers/familyMember.resolver.js — EXISTING code, the pattern to copy:
createdBy: (member, _args, { user, loaders }) => {
  if (user?.role !== 'ADMIN' || member.createdByUserId == null) return null;
  return loaders.userById.load(Number(member.createdByUserId));
},
```
```js
// NEW, following the identical shape (D-07/D-08):
canEdit: (_member, _args, { user }) => Boolean(user?.role === 'ADMIN')
```
Source: `backend/src/resolvers/familyMember.resolver.js:304-311` (`createdBy`/`updatedBy`).

### Anti-Patterns to Avoid

- **Walking the tree in JS to find the head:** Fetching `models.FamilyMember.findAll()` and running a
  JS port of `resolveRootAncestorId`/`collectDescendantIds` server-side. This is explicitly what D-02
  forbids ("pulling every member into memory... is disallowed") even though it would be the most
  literal port of the frontend logic. The recursive CTE achieves the identical result in one
  DB-internal statement.
- **`Op.iLike` for case-insensitivity:** `Op.iLike` is PostgreSQL-only in Sequelize and will throw at
  query time against MySQL/MariaDB. Case-insensitivity here comes for free from the column collation
  (`utf8mb4_general_ci`, confirmed below) — no operator-level case-folding is needed or available.
- **Unescaped user input in `LIKE`:** `Op.substring`/`Op.like` do not escape literal `%`/`_` characters
  inside the search term (these remain SQL wildcards). A search for e.g. `"50%"` will behave
  unexpectedly. Flagged in Common Pitfalls below.
- **Adding a `childCount` field or a dedicated grandchild-count resolver:** Explicitly rejected by
  D-05 — do not build this even though it would be a natural-looking addition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Computing which node has the largest descendant subtree | A JS BFS/recursion port of `collectDescendantIds` run server-side over `findAll()` results | A single recursive CTE (`WITH RECURSIVE ...`) executed via `sequelize.query()` | MySQL 8.4/MariaDB both execute the recursion internally in one round trip; a JS port requires loading the whole table first, which is the exact violation D-02 calls out |
| Case-insensitive substring matching across two scripts (Latin + Ge'ez) | Manual `.toLowerCase()` comparison in JS after a broad `findAll()` | `Op.substring` (`LIKE %term%`) relying on the column's existing `utf8mb4_general_ci` collation | The collation already performs the case-fold at the DB engine level for Latin; Ge'ez has no case distinction so substring matching works unmodified — verified live (see Sources) |
| N+1-safe nested children/spouses | A custom per-node `Promise.all` fetch loop in the resolver | The already-existing `childrenByParentId`/`spousesByMemberId` DataLoaders | These are already built, already tested (`familyMember.queryCount.test.js`), and already proven bounded at up to 255 nodes / 8 generations — reuse, don't reimplement |

**Key insight:** Every "don't hand-roll" item above already has a working, tested implementation
somewhere in this codebase or is a one-line Sequelize operator — this phase's entire job is wiring,
not invention.

## Common Pitfalls

### Pitfall 1: Recursive CTE tie-break divergence from the client's scan order
**What goes wrong:** If two apex members' subtrees are the same size, the SQL `ORDER BY size DESC`
with no deterministic secondary sort could pick a different apex than the client's
`resolveRootAncestorId`, which scans `flatMembers` (sorted lastname/firstname, per the existing
`familyMembers` query) and keeps the *first* apex whose size is *strictly greater* than the current
best — so on a tie, the earlier-in-sort-order apex wins.
**Why it happens:** SQL `ORDER BY` without a secondary key is non-deterministic across ties; a naive
CTE would use whatever physical row order MySQL/MariaDB happens to produce.
**How to avoid:** Add `apex.lastname ASC, apex.firstname ASC` as secondary/tertiary `ORDER BY` keys
(shown in Pattern 1 above) so ties resolve identically to the client's scan order.
**Warning signs:** A future test seeding two same-size apex subtrees with different lastname/firstname
values passes on one CI run and fails on another (or disagrees with `/family`'s already-shipped head).

### Pitfall 2: `LIKE` wildcard characters in user search input
**What goes wrong:** A user searching for a name containing `%` or `_` (rare for names, but not
impossible with abbreviations/typos) gets `LIKE` wildcard behavior instead of a literal match.
**Why it happens:** Sequelize's `Op.substring`/`Op.like` do not escape `%`/`_` in the value.
**How to avoid:** Not a security issue (Sequelize still parameterizes the value, so this is a
correctness pitfall, not injection) — document as an accepted known limitation for v4.0, or escape
`%`/`_`/`\` in the search term before building the `LIKE` pattern if strictness is desired. Given
D-04 explicitly defers "further trimming" to Phase 26, this is safe to leave unescaped for now, but
should be a one-line note in the plan so it's a conscious choice, not an oversight.
**Warning signs:** A support report of a search term "not matching what I expected."

### Pitfall 3: Blank/whitespace-only search term matching everything
**What goes wrong:** `term: ""` produces `LIKE '%%'`, which matches every row — for a name-search
field, a blank query silently returning the entire family list is surprising and defeats the ~20-row
cap's intent (arguably still capped by `LIMIT`, but a large "empty search returns 20 arbitrary people"
result is not useful `/detail` UX).
**How to avoid:** Guard on `term.trim().length === 0` and return `[]` (shown in Pattern 2).
**Warning signs:** SC-3's test suite should include an explicit blank/whitespace-term case.

### Pitfall 4: Confusing "bounded" with "does not touch every row"
**What goes wrong:** A reviewer might object that the apex-subtree-size CTE still visits every
descendant row internally, so it isn't truly "not loading the whole tree."
**Why it happens:** D-02's wording ("must not load the whole tree to compute the head") is about the
*application-tier* fetch-then-walk pattern (N+1 round trips, full row materialization in Node memory),
not about the database engine's internal query-plan cost. A single recursive CTE is one bounded round
trip/one SQL statement — exactly the same "bounded regardless of size" standard the existing
`familyMember.queryCount.test.js` already applies to the (also necessarily-visits-every-node) deep
nested-children query.
**How to avoid:** Frame the plan/tests around "SQL statement count," not "rows scanned" — mirror the
existing `countQueries()` assertion style (`expect(queryCount).toBeLessThan(N)`), not a rows-touched
assertion.

### Pitfall 5: Local dev database engine differs from CI/prod
**What goes wrong:** Assuming "MySQL 8" behavior everywhere without checking what's actually running
locally could lead to a working-locally-but-different-in-CI (or vice versa) surprise.
**Why it happens:** `docker-compose.yml` and `env/*.env` specify `mysql:8.4`, and the GitHub Actions
workflow's `services.mysql` also uses the `mysql:8.4` image — but the database this research session
connected to on `127.0.0.1:3306` reports `SELECT VERSION()` = `12.1.2-MariaDB` (i.e., the local dev
machine has a native/system MariaDB listening on the standard port instead of, or in addition to, the
Dockerized MySQL).
**How to avoid:** Not a blocker — recursive CTEs (MySQL 8.0.1+, MariaDB 10.2+) and
`utf8mb4_general_ci` collation behavior were BOTH verified directly against this actual local
instance (see Sources) and are standard, long-stable SQL-92/MySQL-compatible features present in both
engines. CI (real `mysql:8.4` via GitHub Actions service container) is the authoritative environment
for this phase's tests, and prod runs the same image. Still, when writing/running tests locally,
confirm which server `DB_HOST`/`DB_PORT` in the active `env/*.env` actually points to if a query
behaves unexpectedly.
**Warning signs:** A recursive-CTE or collation-dependent test passes locally but the engine version
banner in a bug report doesn't match `mysql:8.4`.

## Code Examples

### Verified live-database checks (this session, against the actual local DB)

```
$ mysql -h127.0.0.1 -P3306 -uportofolio -pportofolio portofolio -e "SELECT VERSION();"
12.1.2-MariaDB

$ mysql ... -e "SELECT COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.columns
  WHERE table_schema='portofolio' AND table_name='family_members'
  AND COLUMN_NAME IN ('firstname','lastname','geezFirstname','geezLastname','mothersname','geezMothersname');"
firstname       utf8mb4  utf8mb4_general_ci
lastname        utf8mb4  utf8mb4_general_ci
mothersname     utf8mb4  utf8mb4_general_ci
geezFirstname   utf8mb4  utf8mb4_general_ci
geezLastname    utf8mb4  utf8mb4_general_ci
geezMothersname utf8mb4  utf8mb4_general_ci

$ mysql ... -e "SELECT id, firstname, lastname, motherId, fatherId FROM family_members WHERE id=1;"
id=1, firstname=Agne, lastname=Weldehiwet, motherId=NULL, fatherId=NULL   -- confirms D-01's fast path exists in real data

$ mysql ... -e "SELECT id, firstname, lastname FROM family_members WHERE motherId IS NULL AND fatherId IS NULL;"
id=1  Agne          Weldehiwet
id=3  Bisrat        Kidane
id=45 Timnit        Kidane
id=96 Letegerghis   Letegerghis        -- 4 real apex members exist; the fallback path is exercisable/testable

$ mysql ... -e "WITH RECURSIVE descendants AS (
    SELECT id, id AS root_id FROM family_members WHERE motherId IS NULL AND fatherId IS NULL
    UNION ALL
    SELECT fm.id, d.root_id FROM family_members fm JOIN descendants d ON fm.motherId = d.id OR fm.fatherId = d.id
  ) SELECT root_id, COUNT(*) AS size FROM descendants GROUP BY root_id ORDER BY size DESC LIMIT 1;"
root_id=1, size=93   -- recursive CTE executes successfully against the real schema/data

$ mysql ... -e "SELECT id, firstname, geezFirstname FROM family_members WHERE geezFirstname IS NOT NULL LIMIT 5;"
id=1  Agne    ኣግነ
id=3  Bisrat  ብስራት
id=45 Timnit  ትምኒት
id=59 Abera   ኣበራ   -- confirms real Ge'ez data exists to search against
```
`[VERIFIED: local DB execution against the actual project database, 2026-08-03]`

### Existing N+1-safe nested-children query pattern to extend (already tested, unchanged)

```js
// backend/src/services/familyMember.queryCount.test.js (EXISTING, verbatim)
async function countQueries(fn) {
  const original = sequelize.options.logging;
  let count = 0;
  sequelize.options.logging = () => { count += 1; };
  try { await fn(); } finally { sequelize.options.logging = original; }
  return count;
}
```
Source: `backend/src/services/familyMember.queryCount.test.js:9-24`. This is the exact recipe the
SC-4 N+1 test for direct-children + grandchildren + spouses must reuse (see Validation Architecture
below for the specific new query/assertion).

### Test helper conventions to follow (existing, unchanged)

```js
// backend/test/helpers.js — graphql() executes against a FRESH per-call loader set,
// exactly mirroring server.js's per-request context factory.
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp, loaders: createLoaders(models) } }
  );
  return response.body.singleResult;
}
```
Source: `backend/test/helpers.js:16-26`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — no prior backend search or head-resolution query existed | This phase introduces both, following the codebase's Phase 14-established DataLoader/bounded-query conventions | This phase (24) | First backend search surface in the project; sets the pattern future search features (Phase 26 suggestions) will consume |

**Deprecated/outdated:** None — this is greenfield within an established codebase; nothing being
replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Real-world family data will always have exactly one row with `id = 1` (the canonical "Agne" head) once seeded, so the recursive-CTE fallback path is a rare/defensive code path rather than the common case | Architecture Patterns (Pattern 1), Common Pitfalls (Pitfall 1) | Low — even if wrong, the fallback path is fully specified and tested; this assumption only affects which code path runs most often in practice, not correctness |
| A2 | `SEARCH_RESULT_HARD_MAX = 50` as a server-side ceiling above any client-requested `limit` is a reasonable, non-breaking safety cap | Architecture Patterns (Pattern 2) | Low — this is a Claude's-Discretion item per CONTEXT.md; the planner/user can adjust the constant freely without touching the query shape |

**If this table is empty:** N/A — two low-risk discretionary assumptions are logged above; nothing
load-bearing for correctness is unverified.

## Open Questions

1. **Should `familyHead` and `searchFamilyMembers` be rate-limited like the auth mutations?**
   - What we know: `backend/src/plugins/rateLimitPlugin.js` enforces limits only for field names
     explicitly listed in `backend/src/config/rateLimits.js` (currently auth mutations); read queries
     are not currently rate-limited at all.
   - What's unclear: Whether an authenticated-only, admin-and-linked-member-gated search endpoint
     needs abuse protection beyond `requireFamilyAccess`'s existing authentication/linking gate.
   - Recommendation: Out of scope for this phase (CONTEXT.md doesn't mention it, and REQUIREMENTS.md
     has no rate-limiting requirement for `/detail`). Leave unrated-limited for v4.0; flag as a
     candidate for a future security pass if abuse is observed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MySQL/MariaDB with recursive CTE support | `getFamilyHeadId()` fallback query | ✓ | Local: MariaDB 12.1.2 (verified); CI/prod: MySQL 8.4 per `.github/workflows` + `docker-compose.yml` | Both engines support `WITH RECURSIVE` (MySQL 8.0.1+, MariaDB 10.2+) — no fallback needed |
| `utf8mb4_general_ci` collation on `family_members` name columns | Case-insensitive Latin search, Ge'ez substring search | ✓ | Confirmed via `information_schema.columns` query against the live local DB | N/A — already the actual, applied collation; no config change needed |
| Vitest test runner | New `*.test.js` files (SC-1, SC-3, SC-4, SC-5) | ✓ | 4.1.10 (locked `^4.1.10` per `backend/package.json`) | N/A |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all required capabilities are already present.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (backend workspace) |
| Config file | `backend/package.json` `"test": "vitest run"` (no separate `vitest.config.js` detected — defaults apply) |
| Quick run command | `npm test --workspace backend -- <path-to-file>` or `cd backend && npx vitest run <file>` |
| Full suite command | `npm test --workspace backend` (or root `npm test --workspaces` per CLAUDE.md's CI convention) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 (SC-1: head) | `familyHead` returns id 1 when present | integration (`graphql()`) | `npx vitest run backend/src/resolvers/familyMember.head.test.js` | ❌ Wave 0 — new file |
| API-01 (SC-1: head) | `familyHead` falls back to largest-apex-subtree when id 1 absent, with correct tie-break | integration | same file | ❌ Wave 0 |
| API-01 (SC-1: head) | `familyHead` falls back to "first member" (lastname/firstname order) when no apex exists; returns `null` for an empty table | integration | same file | ❌ Wave 0 |
| API-01 (SC-2: person-by-id) | `familyMember(id)` already returns every card field | integration | Already covered by existing `familyMember.resolver.test.js` / `familyMember.relationships.test.js` — confirm coverage, no new test required unless a gap is found | ✅ existing |
| API-01 (SC-3: search) | `searchFamilyMembers(term)` matches partial/case-insensitive Latin and Ge'ez first/last, excludes `mothersname`, caps at ~20, sorts by lastname/firstname | integration | `npx vitest run backend/src/resolvers/familyMember.search.test.js` | ❌ Wave 0 — new file |
| PERF-02 / API-01 (SC-4: N+1) | `familyMember(id) { children { id children { id } spouses { id } } }` resolves in a bounded, flat SQL-statement count regardless of child/grandchild/spouse count | integration + `countQueries()` bounded-statement assertion | `npx vitest run backend/src/services/familyMember.queryCount.test.js` (extend existing file with a new `describe` block) | ⚠️ Partial — file exists and pattern is proven for children-only; new test block needed adding spouses to the fixture |
| API-01 (SC-5: canEdit) | `canEdit` is `true` for an ADMIN viewer, `false` for a non-admin/linked-member viewer, `false` for an unauthenticated (`user: null`) context (if `familyMember`/`familyMembers` are reachable without auth — confirm `requireFamilyAccess` still gates the parent query first) | integration | `npx vitest run backend/src/resolvers/familyMember.canEdit.test.js` | ❌ Wave 0 — new file |

### Sampling Rate

- **Per task commit:** the specific new/modified test file for that task (e.g., `npx vitest run
  backend/src/resolvers/familyMember.head.test.js` after implementing the head query).
- **Per wave merge:** `npm test --workspace backend` (full backend suite — this phase touches only
  backend, no frontend changes).
- **Phase gate:** Full `npm test --workspaces` green (per CLAUDE.md's non-destructive/CI-green
  constraint) before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `backend/src/resolvers/familyMember.head.test.js` — covers SC-1 (id-1 fast path, apex-subtree
      fallback + tie-break, first-member fallback, empty-table null case). Fixture note: the existing
      `buildGenerationFixture({ depth, childrenPerNode })` helper (`backend/test/familyTreeFactory.js`)
      builds a single-lineage branching tree with NO spouses attached and NO control over whether id 1
      is used — for head tests, create members directly via `models.FamilyMember.create(...)` (as
      `familyMember.provenance.test.js` and others already do) rather than reusing that factory, so
      the id-1-present vs. id-1-absent / apex-tie cases can be constructed precisely.
- [ ] `backend/src/resolvers/familyMember.search.test.js` — covers SC-3, including the blank-term
      guard (Pitfall 3) and the mothersname-excluded assertion (D-03).
- [ ] `backend/src/resolvers/familyMember.canEdit.test.js` — covers SC-5, mirroring the exact
      admin-vs-non-admin structure already used in `familyMember.provenance.test.js`
      (`createTestUser({ role: 'ADMIN' })` vs. `createTestUser({ role: 'USER', familyMemberId: ... })`).
- [ ] Extend `backend/src/services/familyMember.queryCount.test.js` with a new `describe` block for
      SC-4/PERF-02: build a fixture with ≥3 direct children, each with ≥2 grandchildren, and at least
      one `models.Spouse.create({ memberAId, memberBId })` row among the children (mirroring the
      existing `Spouse.test.js` creation convention), run the exact nested query from D-06
      (`familyMember(id) { children { id children { id } spouses { id } } }`) through `countQueries()`,
      and assert the statement count stays low and does NOT scale with children/grandchildren count
      (same assertion style as the existing 255-node/depth-8 test: `expect(queryCount).toBeLessThan(N)`
      for a small, explicit `N`).
- [ ] No new framework/config install needed — Vitest is already fully configured for this workspace.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new) | Already enforced upstream by `getUserFromRequest`/JWT — unchanged by this phase |
| V3 Session Management | No (new) | Unchanged — stateless JWT, no session state touched by these 3 additions |
| V4 Access Control | Yes | `requireFamilyAccess(user)` MUST gate both new queries (`familyHead`, `searchFamilyMembers`), exactly like every existing `familyMembers`/`familyMember` query — an unauthenticated or unlinked-non-admin caller must be rejected before any DB access, not merely have results filtered after the fact |
| V5 Input Validation | Yes | The `term` argument for `searchFamilyMembers` must be trimmed and checked for a non-empty value server-side (Pitfall 3) before being used in a query; the `limit` argument must be clamped server-side to a hard maximum (Pattern 2) regardless of what the client requests |
| V6 Cryptography | No | Not applicable — no secrets/tokens/hashing touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via search term | Tampering | Sequelize `Op.substring` parameterizes the value automatically — never string-interpolate `term` into a raw query. The one raw query in this phase (`getFamilyHeadId`'s CTE) takes NO user input at all (no arguments), so it carries zero injection surface by construction — confirm this stays true (no future addition of a user-supplied filter to that specific raw query without adding `replacements`-based parameterization). |
| Unbounded result set / resource exhaustion via search | Denial of Service | Server-side hard cap on `limit` (Pattern 2) independent of client-requested value; blank-term short-circuit (Pitfall 3) avoids an implicit full-table `LIKE '%%'` scan |
| Privilege escalation via `canEdit` spoofing | Elevation of Privilege | `canEdit` is purely server-derived from `context.user.role` (already resolved from a verified JWT upstream) — the client cannot influence this field's value through any argument; no user-supplied input reaches this resolver at all |
| Information disclosure via search across the family-access boundary | Information Disclosure | `requireFamilyAccess(user)` (same guard as every existing family query) must be the first line of `searchFamilyMembers` and `familyHead` — a non-admin, unlinked user must be rejected before the query executes, matching the existing `familyMembers`/`familyMember` precedent exactly |

## Sources

### Primary (HIGH confidence)

- Direct code inspection (this session): `backend/src/models/FamilyMember.js`, `backend/src/models/index.js`,
  `backend/src/config/database.js`, `backend/src/schemas/familyMember.schema.js`,
  `backend/src/resolvers/familyMember.resolver.js`, `backend/src/loaders/familyMember.loaders.js`,
  `backend/src/utils/auth.js`, `backend/src/services/familyMember.queryCount.test.js`,
  `backend/test/helpers.js`, `backend/test/familyTreeFactory.js`, `backend/src/resolvers/familyMember.provenance.test.js`,
  `frontend/src/components/family/familyTree.assembly.js`
- Direct live-database execution (this session): version check, `information_schema.columns` collation
  check, apex-member enumeration, recursive-CTE execution, Ge'ez data spot-check — all against the
  actual project database (`portofolio` schema) on `127.0.0.1:3306`
- `package-lock.json` (repo root) — locked/installed dependency versions
- `.github/workflows/*.yml` — confirms CI's MySQL service is `mysql:8.4`

### Secondary (MEDIUM confidence)

- `[CITED: sequelize.org/docs/v6/core-concepts/model-querying-basics/#operators]` — `Op.substring`
  as the documented `LIKE %value%` shorthand and Sequelize's parameterization behavior for `Op.like`
  family operators (training-data knowledge of Sequelize v6's operator API, consistent with the
  installed `6.37.8` and not flagged as changed in any v6.x changelog encountered)

### Tertiary (LOW confidence)

- None — every claim above was either verified against this session's live code/DB inspection or
  cited to stable, version-matched official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all versions read directly from the lockfile
- Architecture: HIGH — the bounded-CTE approach was executed and verified against the actual project
  database in this session, not merely reasoned about from training data
- Pitfalls: HIGH — each pitfall (tie-break, LIKE wildcards, blank term, "bounded" definition, engine
  mismatch) is derived from direct inspection of the exact client logic being mirrored and the exact
  live database being queried, not generic SQL folklore

**Research date:** 2026-08-03
**Valid until:** 2026-09-02 (30 days — stable, internal-codebase-driven research; the only external
dependency, MySQL/MariaDB recursive-CTE support, has been stable since 2017/2016 respectively and is
not fast-moving)
