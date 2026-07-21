# Architecture Research

**Domain:** Collaborative family-tree domain grafted onto an existing Express + Apollo + Sequelize/MySQL + React app (v2.0 Collaborative Family Tree milestone)
**Researched:** 2026-07-21
**Confidence:** HIGH (grounded in the actual codebase files read below; MEDIUM/LOW flagged inline where training-data/websearch patterns are extrapolated)

This is a **subsequent-milestone** research file. It does not re-derive the existing architecture (see `.planning/codebase/ARCHITECTURE.md` / `STRUCTURE.md`) — it maps exactly where the new family-tree domain plugs into it, what's new vs modified, and what the `sequelize.sync()`-no-migrations reality makes risky.

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Frontend (React SPA) — MODIFIED + NEW                                     │
│  Pages: [EXISTING] Login/Register/Dashboard/...                          │
│         [NEW] FamilyTree.jsx (/family)  ManageFamily.jsx (/manage)        │
│         [NEW] Pending.jsx (/pending)                                      │
│  Components: [EXISTING] ProtectedRoute → [MODIFIED] adds requireFamily    │
│              [NEW] FamilyTreeCanvas (pan/zoom lib wrapper)                │
│              [NEW] MemberForm, RelativePicker, PhotoUploader              │
│  Context: [MODIFIED] AuthContext — user now carries familyMemberId/role   │
└───────────────┬─────────────────────────────────┬─────────────────────────┘
                │ POST /graphql (axios, existing)  │ POST /uploads/family-photo (NEW, multipart)
                ▼                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Backend (Express + Apollo) — MODIFIED + NEW                               │
│  server.js [MODIFIED]: context now also resolves familyMember;            │
│            mounts NEW express.static('/uploads') + NEW multer upload route│
│  schemas/  [NEW] familyMember.schema.js → merged into schemas/index.js    │
│  resolvers/[NEW] familyMember.resolver.js → merged into resolvers/index.js│
│  utils/auth.js [MODIFIED]: NEW requireFamilyAccess() guard                │
│  utils/family.js [NEW]: computeEditableRelatives(), sibling lookup helper │
└───────────────┬─────────────────────────────────┬─────────────────────────┘
                │                                  │
                ▼                                  ▼
┌───────────────────────────────┐   ┌───────────────────────────────────────┐
│ Data Layer — MODIFIED + NEW    │   │ Filesystem — NEW                      │
│ models/FamilyMember.js  [NEW]  │   │ Docker named volume (family_photos)   │
│ models/FamilySpouse.js  [NEW]  │   │ mounted into backend container,       │
│  (self-ref M:N join table)     │   │ served at /uploads/*                  │
│ models/User.js  [MODIFIED]     │   └───────────────────────────────────────┘
│  (+familyMemberId FK — REQUIRES│
│   manual ALTER, sync() will    │
│   NOT add it — see Pitfalls)   │
└───────────────┬─────────────────┘
                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MySQL 8.4 (Docker volume) — unchanged engine, new tables + 1 altered col  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `backend/src/models/FamilyMember.js` | Sequelize model: person fields + self-referential `motherId`/`fatherId` FKs | NEW |
| `backend/src/models/FamilySpouse.js` | Join table model for self-referential spouse many-to-many | NEW |
| `backend/src/models/User.js` | Adds nullable, unique `familyMemberId` FK | MODIFIED |
| `backend/src/models/index.js` | Registers new models, wires associations (`belongsTo`/`hasMany`/`belongsToMany`) | MODIFIED |
| `backend/src/schemas/familyMember.schema.js` | SDL: `FamilyMember`, `FamilyTree`, CRUD + linking mutations | NEW |
| `backend/src/schemas/index.js` | Appends `familyMemberTypeDefs` to the aggregator array | MODIFIED |
| `backend/src/resolvers/familyMember.resolver.js` | CRUD, relationship mutations, `familyTree` flat-fetch query, linking mutations | NEW |
| `backend/src/resolvers/index.js` | Appends `familyMemberResolvers` to the aggregator array | MODIFIED |
| `backend/src/utils/auth.js` | Adds `requireFamilyAccess(user)` guard (linked-member-or-ADMIN) | MODIFIED |
| `backend/src/utils/family.js` | `computeEditableRelatives(member, allMembers)` — parents/spouse/children/siblings set builder | NEW |
| `backend/src/server.js` | Apollo `context` also resolves `familyMember`; mounts `express.static('/uploads')` + a small multer route | MODIFIED |
| `backend/uploads/` (Docker volume) | Stores uploaded photo files on disk | NEW |
| `frontend/src/pages/FamilyTree.jsx` (`/family`) | Fetches `familyTree`, hands adjacency list to a pan/zoom canvas library | NEW |
| `frontend/src/pages/ManageFamily.jsx` (`/manage`) | CRUD form for own scoped relatives (or whole tree for ADMIN) + admin account-linking UI | NEW |
| `frontend/src/pages/Pending.jsx` (`/pending`) | Shown to verified-but-unlinked non-admin users | NEW |
| `frontend/src/components/ProtectedRoute.jsx` | Adds a `requireFamilyAccess` prop/variant redirecting unlinked users to `/pending` | MODIFIED |
| `frontend/src/context/AuthContext.jsx` | `me` query extended to include `familyMemberId`; exposes it in `user` | MODIFIED |

## Recommended Project Structure

```
backend/src/
├── models/
│   ├── User.js                 # MODIFIED: + familyMemberId FK (manual ALTER, see Pitfalls)
│   ├── FamilyMember.js          # NEW: person fields + motherId/fatherId self-ref FKs
│   ├── FamilySpouse.js          # NEW: self-referential belongsToMany join table
│   └── index.js                 # MODIFIED: registers models + defines associations
├── schemas/
│   ├── user.schema.js           # MODIFIED: User type gains familyMemberId/familyMember
│   ├── familyMember.schema.js   # NEW: FamilyMember, FamilyTree, CRUD/link mutations
│   └── index.js                 # MODIFIED
├── resolvers/
│   ├── user.resolver.js         # MODIFIED: me/dashboard expose familyMemberId
│   ├── familyMember.resolver.js # NEW: CRUD, relationships, familyTree, linking
│   └── index.js                 # MODIFIED
├── utils/
│   ├── auth.js                  # MODIFIED: + requireFamilyAccess()
│   └── family.js                # NEW: computeEditableRelatives(), sibling helpers
├── uploads/                      # NEW: gitignored, Docker-volume-mounted photo storage
└── server.js                     # MODIFIED: static route + upload route + context change
frontend/src/
├── pages/
│   ├── FamilyTree.jsx            # NEW (/family)
│   ├── ManageFamily.jsx          # NEW (/manage)
│   └── Pending.jsx               # NEW (/pending)
├── components/
│   ├── FamilyTreeCanvas.jsx      # NEW: wraps chosen pan/zoom tree library
│   ├── MemberForm.jsx            # NEW: create/edit FamilyMember form
│   ├── RelativePicker.jsx        # NEW: select existing member as parent/spouse
│   └── PhotoUploader.jsx         # NEW: multipart upload widget → /uploads/family-photo
└── api/
    └── graphqlClient.js          # unchanged; a second small helper for the upload POST
```

### Structure Rationale

- New backend domain files follow the **existing** `user.*` naming/aggregator convention exactly (`familyMember.schema.js`, `familyMember.resolver.js`, `FamilyMember.js`) — no new architectural pattern introduced, just a second domain filled into the barrels the codebase already anticipates (`STRUCTURE.md`: "the aggregator pattern anticipates multiple feature modules").
- `utils/family.js` is new because the permission-scoping logic (immediate-relatives set) is reused by both the `myEditableRelatives` query and every mutation guard — it doesn't belong inside the resolver file (mirrors how `auth.js` already centralizes cross-cutting guard logic separately from `user.resolver.js`).
- `backend/uploads/` sits outside `src/` (parallel to how `frontend/dist/` sits outside `src/`) because it's runtime-generated data, not source — must be gitignored and Docker-volume-mounted, never baked into the image.

## Architectural Patterns

### Pattern 1: Self-referential adjacency FKs for parent/child (not a join table)

**What:** `FamilyMember` gets two nullable, self-referencing foreign keys — `motherId` and `fatherId` — both `belongsTo(FamilyMember)`. This is the standard adjacency-list pattern for trees where each node has a small, fixed number of parents (Percona/MySQL tutorials confirm this is the idiomatic MySQL 8 approach for hierarchical/genealogy data — MEDIUM confidence, WebSearch-verified against multiple independent sources).
**When to use:** Every person has at most one mother and one father in this milestone's scope (full genealogy with multiple biological parent sets is explicitly deferred). A join table would be over-engineering for a 1-parent/1-parent relationship that never needs cardinality above 1 each.
**Trade-offs:** Cheap to query (`WHERE motherId = ? OR fatherId = ?` for children, single indexed lookup for parents), sync()-friendly (new table, no existing-column ALTER), and matches the deferred-scope note about deferring "full genealogy (multiple marriages / half-siblings / adoptions)" — if that lands later, motherId/fatherId graduate to a join table without touching this milestone's schema.

**Example:**
```javascript
// backend/src/models/FamilyMember.js
export function initFamilyMember(sequelize) {
  FamilyMember.init({
    firstname: { type: DataTypes.STRING, allowNull: false },
    lastname: { type: DataTypes.STRING, allowNull: false },
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: false },
    mothersname: { type: DataTypes.STRING, allowNull: true }, // free-text, distinct from motherId FK
    email: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
    birthdate: { type: DataTypes.DATEONLY, allowNull: true },
    deathdate: { type: DataTypes.DATEONLY, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    profilePicture: { type: DataTypes.STRING, allowNull: true } // stores '/uploads/<file>', not binary
  }, { sequelize, modelName: 'FamilyMember', tableName: 'family_members',
       hooks: { beforeSave(m) { m.fullname = `${m.firstname} ${m.lastname}`.trim(); } } });
  return FamilyMember;
}

// backend/src/models/index.js — association wiring
FamilyMember.belongsTo(FamilyMember, { as: 'mother', foreignKey: 'motherId' });
FamilyMember.belongsTo(FamilyMember, { as: 'father', foreignKey: 'fatherId' });
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsMother', foreignKey: 'motherId' });
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsFather', foreignKey: 'fatherId' });
```
`fullname` is stored (derived-but-persisted via hook) rather than computed in every resolver, matching the existing `beforeCreate`/`beforeUpdate` hook convention in `User.js` — cheaper to sort/filter/search on in SQL than a GraphQL-layer computed field.

### Pattern 2: Self-referential many-to-many join table for spouse

**What:** A `FamilySpouse` join model (`memberId`, `spouseId`) backing a self-referential `belongsToMany` on `FamilyMember`. Sequelize supports this pattern (`Person.belongsToMany(Person, { as: 'Spouses', through: 'FamilySpouse', foreignKey: 'memberId', otherKey: 'spouseId' })`) — MEDIUM confidence, verified against Sequelize's own advanced-associations docs and multiple community write-ups, though several GitHub issues note self-referential M:N through-table querying has historically had rough edges (explicit `foreignKey`/`otherKey` on both sides avoids most of them).
**When to use:** Even though this milestone only needs "current spouse" (single, present-tense), use a join table now rather than a `spouseId` column on `FamilyMember`. A single-column FK can't represent a future second marriage without an ALTER — and this codebase's `sync()`-no-migrations reality (see Pitfalls) makes future ALTERs to an **existing** table exactly the kind of work you want to avoid triggering twice. Build the join table now; enforce "one active spouse" as an **application-level** rule in the resolver (reject `addSpouse` if the member already has a spouse row), not a schema constraint. When "multiple marriages" is unlocked in a later milestone, only the resolver rule changes — no data-model migration needed.
**Trade-offs:** Slightly more query complexity than a column (two-row insert per pairing — insert `(A,B)` and `(B,A)` symmetric rows so either side's `belongsToMany` include resolves without an OR-query) but it's the only representation that survives the deferred multi-marriage feature without a future manual ALTER.

### Pattern 3: Flat adjacency-list GraphQL response for the deep tree (not nested recursive resolvers)

**What:** The `/family` deep pan/zoom tree does **not** ask GraphQL to resolve a recursively-nested `children { children { children ... } } }` shape. Instead, one query — `familyTree: FamilyTree!` returning `{ members: [FamilyMember!]! }` — fetches **every** `FamilyMember` row (plus every `FamilySpouse` pair) in a small, fixed number of SQL statements (2: one `SELECT * FROM family_members`, one `SELECT * FROM family_spouses`), regardless of tree depth. The frontend's pan/zoom library assembles the graph/tree layout client-side from this flat list (`id, motherId, fatherId` + a `spouseIds: [ID!]!` array attached in the resolver via one JS-side grouping pass over the spouse rows).
**When to use:** Always, for this domain. This is the direct fix for the architecture's documented constraint — "no query complexity/depth limiting… no batching (no DataLoader), so N+1 risk exists once cross-entity resolvers are added" (`.planning/codebase/ARCHITECTURE.md`). A naive nested-resolver tree (`FamilyMember.mother` and `FamilyMember.children` each independently hitting the DB per node) would be exactly the N+1 this codebase has no DataLoader to absorb. A flat, whole-graph fetch sidesteps the problem entirely rather than solving it with batching machinery this project doesn't have.
**Trade-offs:** This only works because a family tree is bounded in size (dozens–low hundreds of rows for a personal/portfolio app) — "fetch everything, assemble client-side" would be the wrong call at a scale where the tree itself is too large to ship in one response (see Scaling Considerations). MySQL 8's `WITH RECURSIVE` CTEs (confirmed available since 8.0, HIGH confidence — Percona/MySQL docs) are the right tool if a future milestone needs a scoped "ancestors of X" or "descendants of X" query instead of the whole tree, but they are **not needed** for rendering the full `/family` view, and are **not needed** for the permission-scoping "immediate relatives" set either (that's a 1-hop lookup, not a recursive one — see Pattern 4).

**Example:**
```javascript
// backend/src/resolvers/familyMember.resolver.js
familyTree: async (_parent, _args, { models, user }) => {
  requireFamilyAccess(user);
  const members = await models.FamilyMember.findAll({ raw: true }); // 1 query, whole tree
  const spousePairs = await models.FamilySpouse.findAll({ raw: true }); // 1 query
  const spouseMap = groupSpousesByMemberId(spousePairs); // in-memory grouping, no per-row query
  return { members: members.map((m) => ({ ...m, spouseIds: spouseMap[m.id] ?? [] })) };
}
```

### Pattern 4: Immediate-relatives permission scoping as a pure in-memory set builder

**What:** `computeEditableRelatives(currentMember, allMembers)` in `backend/src/utils/family.js` takes the linked member row plus the **already-fetched** flat member list (same data `familyTree` uses — reuse the query, don't re-query) and returns a `Set` of member IDs: `{ motherId, fatherId, ...spouseIds, ...childIds, ...siblingIds }`. Mutation resolvers (`updateFamilyMember`, `deleteFamilyMember`, `setParents`, `addSpouse`, etc.) call `requireEditableRelative(user, targetId, allMembers)` — which is `requireFamilyAccess(user)` followed by an ADMIN bypass, else a `set.has(targetId)` check — before writing.
**When to use:** Every family-domain mutation except account-linking (which is ADMIN-only via the existing `requireAdmin`).
**Trade-offs:** Recomputing the set per-mutation via a fresh `findAll` is simplest to reason about and cheap at this data scale (see Pattern 3) — do not introduce caching/memoization here; it adds staleness risk (a relative added mid-session) for no measurable performance gain on a dataset this small.

**Sibling derivation:** siblings = other members sharing the **same non-null `motherId` AND `fatherId`** as the current member (full-siblings only, matching the "half-siblings deferred" scope note). This is where the **sibling `firstname` uniqueness check** ("dedup guard") belongs too: when creating/updating a child under a given `(motherId, fatherId)` pair, the resolver (not a model hook — see below) queries existing children of that same parent pair and rejects a duplicate `firstname` (case-insensitive), mirroring the existing email-uniqueness check pattern already used in `register` (`backend/src/resolvers/user.resolver.js:49-50` — `findOne` before `create`, checked in the **resolver**, not a Sequelize hook). Keep it in the resolver, not a model hook, for two reasons: (1) it's the codebase's existing convention for uniqueness checks, and (2) the check needs the *parent pair*, which may be set in the same mutation call as the name — a `beforeValidate` hook would run before the parent association is necessarily resolved/attached in all mutation shapes (e.g. `setParents` called separately from `createFamilyMember`).

## Data Flow

### Request Flow — `/family` deep tree view

```
User navigates to /family
    ↓
ProtectedRoute (requireFamilyAccess variant) checks user.familyMemberId || user.role === 'ADMIN'
    ↓ (pass)
FamilyTree.jsx fires graphqlRequest(FAMILY_TREE_QUERY) on mount
    ↓
axios → /graphql → Apollo context: { models, user, familyMember, clientIp }
    ↓
familyTree resolver: requireFamilyAccess(user) → 2 flat SQL queries (members, spouse pairs) → in-memory group
    ↓
Response: { members: [{ id, motherId, fatherId, spouseIds, ... }, ...] }  (flat adjacency list)
    ↓
FamilyTreeCanvas (pan/zoom library) builds the graph layout client-side from the flat list
```

### Request Flow — `/manage` scoped edit

```
ManageFamily.jsx fires myEditableRelatives query
    ↓
Resolver: requireFamilyAccess(user) → findAll (same flat query as familyTree, cached per-request only)
    ↓ computeEditableRelatives(user.familyMember, allMembers) → filtered FamilyMember[] returned
    ↓
UI renders editable-members list; user submits updateFamilyMember(id, input)
    ↓
Resolver: requireFamilyAccess(user) → requireEditableRelative(user, id, allMembers) → ADMIN bypass or set.has(id) check
    ↓ (pass) Sequelize update, sibling-firstname-uniqueness re-checked if motherId/fatherId/firstname changed
```

### Request Flow — photo upload (deliberately NOT through GraphQL)

```
PhotoUploader.jsx: <input type="file"> → POST multipart/form-data to /uploads/family-photo (NOT /graphql)
    ↓
Express route (multer middleware, mounted before the Apollo /graphql middleware, same auth-guard logic
  reused from getUserFromRequest since this route sits outside Apollo's context function)
    ↓
File written to the Docker-volume-mounted uploads/ dir with a generated filename (avoid using user input in the path)
    ↓
Route responds { profilePicture: '/uploads/<generated-name>.jpg' }
    ↓
Frontend then calls the existing updateFamilyMember(id, { profilePicture }) GraphQL mutation to persist the
  reference — GraphQL/Sequelize stays the single source of truth for the DB row; the REST route only does file I/O.
```
This intentionally breaks the "single GraphQL endpoint" characteristic already documented in `.planning/codebase/ARCHITECTURE.md` ("no REST endpoints besides `/health`") — see Anti-Patterns below for why that's the correct call here, not scope creep.

### State Management

- Frontend: no new state library. `AuthContext`'s `user` object gains `familyMemberId` (and optionally an embedded `familyMember` summary) — same "re-derived via `me` query on load" pattern already in place (`frontend/src/context/AuthContext.jsx:30-46`), no new global store needed for the tree itself: `FamilyTree.jsx` and `ManageFamily.jsx` hold their fetched member list in local component state, matching `Dashboard.jsx`'s existing pattern.
- Backend: still stateless. The only new "state" is filesystem-resident photo files, which live outside the request/response cycle entirely (served by `express.static`, not re-fetched through Apollo context).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single family, dozens–low hundreds of members (this milestone's realistic ceiling) | Flat whole-tree fetch (Pattern 3) is correct and simplest; no CTE, no DataLoader needed |
| Thousands of members / multiple large extended families sharing one app instance | Flat `familyTree` payload becomes too large to ship on every `/family` load; switch to a scoped "descendants/ancestors of root X" query using MySQL `WITH RECURSIVE` CTEs, with the frontend requesting a bounded subgraph instead of everything |
| Many concurrent editors on `/manage` | `computeEditableRelatives` recomputed per-mutation (Pattern 4) avoids stale-cache correctness bugs; if write contention becomes real, consider optimistic-locking (a `version`/`updatedAt` check) on `updateFamilyMember`, not a bigger architectural change |

### Scaling Priorities

1. **First bottleneck:** shipping the entire `family_members` table on every `/family` page load. Bounded and fine at personal/portfolio scale; the fix when it stops being fine is a CTE-scoped subgraph query, not DataLoader (DataLoader solves repeated-key N+1 across many small requests in one GraphQL operation — it doesn't help a single "give me everyone" query, which is already O(1) queries).
2. **Second bottleneck:** photo storage on a single Docker named volume tied to one host. Deferred per milestone scope ("object-storage photos" is explicitly out of scope) — flag as the next infra item if the app ever needs multi-host deployment.

## Anti-Patterns

### Anti-Pattern 1: Nested recursive GraphQL resolvers for the tree

**What people do:** Model `FamilyMember.children` and `FamilyMember.mother` as GraphQL fields with their own resolvers, then let the client query a deeply nested tree shape (`children { children { children } } }`).
**Why it's wrong:** With no DataLoader in this codebase (explicitly documented as an existing architectural constraint), every nested level re-triggers a resolver-per-node DB call — classic N+1, and it gets worse the deeper the tree/pan-zoom view goes, exactly inverse to what a "deep tree" feature needs.
**Do this instead:** Pattern 3 — one flat `familyTree` query, whole graph, assembled client-side.

### Anti-Pattern 2: Uploading photo binaries through a GraphQL mutation

**What people do:** Add a GraphQL `Upload` scalar (via `graphql-upload`) and accept the file as a mutation argument.
**Why it's wrong:** Apollo's own guidance advises against multipart file uploads through GraphQL mutations in favor of a dedicated upload path (MEDIUM confidence — Apollo community guidance, WebSearch-verified); it also fights this specific server's `expressMiddleware(apollo)` + `express.json()` pipeline, which isn't multipart-aware, and would require inserting upload-parsing middleware ahead of Apollo just to special-case one mutation.
**Do this instead:** A small, explicit REST-style route (`POST /uploads/family-photo`, multer-backed) that does only file I/O and hands back a path string for a normal GraphQL mutation to persist — Pattern in Data Flow above. This is a deliberate, narrow, documented exception to "single GraphQL endpoint," not scope creep.

### Anti-Pattern 3: Relying on `sequelize.sync()` to add `familyMemberId` to the existing `users` table

**What people do:** Add `familyMemberId: { type: DataTypes.INTEGER, allowNull: true }` to `User.init(...)` and assume the next `sync()` on boot picks it up in dev/prod alike.
**Why it's wrong:** `sequelize.sync()` without `{ alter: true }` only creates tables that don't yet exist — it does **not** add columns to tables that already exist (HIGH confidence, confirmed against Sequelize's own docs/GitHub issue discussion). `family_members` and `family_spouses` are brand-new tables, so `sync()` handles those fine. `users` already exists, so the new `familyMemberId` column will silently **not appear** on any environment whose DB already has a `users` table — including any existing dev/CI/prod database — until a human runs a manual `ALTER TABLE users ADD COLUMN familyMemberId ...` (this project's documented, accepted infra debt: "schema changes need manual ALTER + human boot-verify on real DBs").
**Do this instead:** Treat the `User.familyMemberId` FK as the one schema change in this milestone that needs an explicit, tracked manual migration step + boot-verify (same category of manual step this project already used for the v1.1 `passwordChangedAt`/email-verification columns). New tables (`FamilyMember`, `FamilySpouse`) need no such step — flag this clearly to the roadmap so it isn't missed as "just another new model."

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Docker named volume for photos | `docker-compose.yml`: new volume (e.g. `family_photos:/app/uploads`) mounted into the `backend` service, alongside the existing `mysql_data` volume | Mirrors the existing `mysql_data` volume pattern already in `docker-compose.yml`; no new service, no new image |
| Pan/zoom tree rendering library | Frontend-only dependency, wrapped in a single `FamilyTreeCanvas.jsx` component | Library selection is a **STACK-research** concern (not covered here); this file only fixes the *data shape* it must consume — a flat member list, not a GraphQL-nested tree |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `familyMember.resolver.js` ↔ `models.User` | Direct Sequelize query (`User.findByPk(userId)`, `User.update({ familyMemberId })`) inside `linkAccountToMember`/`unlinkAccountFromMember` mutations, ADMIN-only via existing `requireAdmin` | No new cross-domain abstraction needed — same "resolver touches whatever models it needs via `{ models }` context" pattern already used everywhere |
| Apollo `context` fn ↔ `getUserFromRequest` | `server.js`'s context function grows a second lookup: after resolving `user`, also resolve `familyMember: user?.familyMemberId ? await models.FamilyMember.findByPk(user.familyMemberId) : null` | Keeps the existing "resolve everything the resolvers need up front, once per request" convention (`.planning/codebase/ARCHITECTURE.md`'s "GraphQL context object `{ models, user }`" abstraction, now `{ models, user, familyMember }`) |
| `express.static('/uploads')` / multer route ↔ Apollo `/graphql` middleware | Both mounted on the same Express `app`, in sequence, ahead of or alongside `expressMiddleware(apollo)` | The multer route needs its **own** lightweight JWT check (reusing `getUserFromRequest`'s token-parsing logic) since it lives outside Apollo's `context` function entirely — do not assume Apollo's auth guard covers it |
| First-admin bootstrap ↔ `requireFamilyAccess` | The v1.1 atomic "first verified user becomes ADMIN" transaction (`verifyEmail` resolver) is untouched; `requireFamilyAccess(user)` bypasses the "must be linked" check whenever `user.role === 'ADMIN'`, so the freshly-promoted first ADMIN can immediately create the root `FamilyMember` node and self-link via the same ADMIN-only `linkAccountToMember(userId: <self>, familyMemberId: <new node>)` mutation — no separate "self-link" mutation or special-cased bootstrap code path needed | This is the cleanest integration: reuse the existing role check, don't invent a second gate |

## Build Order (dependency-ordered)

1. **`FamilyMember` + `FamilySpouse` Sequelize models**, registered in `models/index.js` with associations (Pattern 1 + 2). New tables — `sync()` handles creation with no manual step.
2. **`User.familyMemberId` FK** added to the `User` model + **manual `ALTER TABLE users ADD COLUMN`** step + boot-verify against a real dev DB (Anti-Pattern 3). Must land before anything that reads/writes `user.familyMemberId`.
3. **Auth/context extension**: `getUserFromRequest`/Apollo `context` also resolves `familyMember`; new `requireFamilyAccess()` guard in `utils/auth.js`. Depends on (2).
4. **GraphQL schema + CRUD resolvers** for `FamilyMember` (create/update/delete, parent/spouse relationship mutations). Depends on (1).
5. **Permission-scoping** (`utils/family.js` — `computeEditableRelatives`, `requireEditableRelative`) wired into every mutation from (4). Depends on (4).
6. **Sibling-firstname-uniqueness check** in the create/update resolvers (resolver-level, not a hook — see Pattern 4). Depends on (4).
7. **Account↔member linking mutations** (`linkAccountToMember`, `unlinkAccountFromMember`, ADMIN-only) + bootstrap path validated. Depends on (2), (3).
8. **Photo upload**: Docker volume mount, `express.static` route, multer upload route, `profilePicture` referenced by `updateFamilyMember`. Depends on (1); independent of (4)–(7), can parallelize.
9. **`familyTree` flat query** (Pattern 3) + `myEditableRelatives` query. Depends on (4), (5).
10. **Frontend auth wiring**: `AuthContext`/`me` query exposes `familyMemberId`; `ProtectedRoute` gains the `requireFamilyAccess` variant; new `/pending` route + `Pending.jsx`. Depends on (3), (7).
11. **`/manage` page**: relative-scoped CRUD form, photo uploader, admin account-linking UI. Depends on (5), (6), (8), (9), (10).
12. **`/family` page**: pan/zoom canvas consuming the flat `familyTree` payload. Depends on (9), (10).

Steps 8 and steps 4–7 can run in parallel once (1) lands; everything downstream of (10) (the two new pages) needs the auth/gating wiring finished first, since both routes are gated on `requireFamilyAccess`.

## Sources

- [Sequelize Advanced Many-to-Many Associations](https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/) — self-referential `belongsToMany` through table pattern (MEDIUM confidence, cross-referenced with community write-ups)
- [Sequelize self-referential M:N GitHub issue #1724](https://github.com/sequelize/sequelize/issues/1724) — confirms pattern and known query rough edges
- [Sequelize Model Basics — sync/alter](https://sequelize.org/docs/v6/core-concepts/model-basics/) and [GitHub issue #9731](https://github.com/sequelize/sequelize/issues/9731) — confirms `sync()` without `alter: true` does not add columns to existing tables (HIGH confidence)
- [Percona: Introduction to MySQL 8.0 Recursive CTE (Part 2)](https://www.percona.com/blog/introduction-to-mysql-8-0-recursive-common-table-expression-part-2/) — recursive CTE availability/use cases including genealogy trees (HIGH confidence)
- [MySQL Tutorial: Adjacency List Model](https://www.mysqltutorial.org/mysql-basics/mysql-adjacency-list-tree/) — adjacency-list pattern for hierarchical data
- [Apollo GraphOS: Handling the N+1 Problem](https://www.apollographql.com/docs/graphos/schema-design/guides/handling-n-plus-one) — confirms batching/DataLoader is the standard fix for repeated-key N+1, and that a single bulk fetch is the correct alternative when there's no repeated-key pattern (MEDIUM confidence)
- [Apollo Server file uploads discussion](https://github.com/apollographql/apollo-server/issues/301) and community write-ups on `graphql-upload` vs REST upload routes — informs the recommendation against GraphQL-mutation file uploads (MEDIUM confidence)
- Direct reads of this repository: `backend/src/server.js`, `backend/src/models/{index.js,User.js}`, `backend/src/resolvers/user.resolver.js`, `backend/src/schemas/user.schema.js`, `backend/src/utils/auth.js`, `backend/src/config/database.js`, `docker-compose.yml`, `frontend/src/App.jsx`, `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md` (HIGH confidence — ground truth)

---
*Architecture research for: v2.0 Collaborative Family Tree (subsequent milestone integration)*
*Researched: 2026-07-21*
