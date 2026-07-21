# Phase 12: Family Data Model Foundation - Research

**Researched:** 2026-07-21
**Domain:** Sequelize 6 self-referencing associations, join-table modeling, cycle-safe tree mutation, model-layer TDD
**Confidence:** HIGH

## Summary

Phase 12 is a pure model-layer phase: one new Sequelize model (`FamilyMember`) with two nullable
self-referencing FKs (`motherId`, `fatherId`), one new join model (`Spouse`) storing a canonical
ordered pair per couple, and a handful of model-layer helper functions (link parent, add child, set
spouse, delete member) that enforce cycle-safety and the "married-in one-hop" cascade rule. This is
the **first** model in the codebase with any Sequelize associations — `User` today is a bare,
unassociated model — so association wiring in `backend/src/models/index.js` is new territory, not an
existing pattern to extend.

The good news: **all test tooling this phase needs already exists**, built in a prior milestone
(v1.1). `backend/package.json` already depends on `vitest@4.1.10`, `supertest@7.2.2`, and
`sequelize@6.37.8`/`mysql2@3.22.3`; `backend/vitest.config.js`, `backend/test/globalSetup.js`,
`backend/test/guard.js`, and `env/test.env` already implement an isolated `_test`-suffixed MySQL
database with a `sequelize.sync({ force: true, match: /_test$/ })` global setup and `sequelize.drop()`
teardown, gated by an `assertTestDatabase()` guard that refuses to run outside `NODE_ENV=test` +
`_test`-suffixed DB. This is **exactly** the "fresh-DB sync smoke test" infrastructure success
criterion #5 needs — Phase 12 does not need to build new test plumbing, only new fixtures/tests for
`FamilyMember`/`Spouse`. Do not re-propose different tooling; use what's here.

**Primary recommendation:** Add `FamilyMember` and `Spouse` as sibling models next to `User`,
following `User.js`'s `init(sequelize)` export pattern exactly; wire associations in
`models/index.js` **after** both `init*` calls, declare `onDelete`/`onUpdate` options on exactly one
side of each association pair (the `belongsTo` side) to avoid Sequelize's documented conflicting-option
bug; implement cycle-prevention and the married-in delete rule as plain async helper functions (not
model hooks) that call `sequelize.transaction()`; write every rule test-first against the existing
Vitest + isolated-MySQL harness.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `FamilyMember` schema (fields, ENUM, VIRTUAL, date validation) | Database / Storage (Sequelize model) | — | Pure persistence-layer concern; no resolver/UI exists yet (later phases) |
| Parent self-references (`motherId`/`fatherId`) + cascade-safety | Database / Storage (Sequelize associations + FK constraints) | — | Enforced at both the Sequelize association layer and the MySQL FK constraint layer (`ON DELETE SET NULL`) |
| Spouse canonical join row + symmetric read | Database / Storage (dedicated `Spouse` model) | — | Needs custom ordering logic (hook) beyond what implicit `belongsToMany` through-table sync gives you |
| Cycle prevention (ancestor-chain walk) | Database / Storage (service/helper function called before mutation) | — | Pure graph-traversal logic over the model's own data; no framework owns this, it's hand-rolled but at the model/service layer, not resolver |
| Married-in one-hop delete rule | Database / Storage (service/helper function, transactional) | — | Business rule over model relationships; belongs beside the model, not in a future resolver |
| Test isolation / fresh-DB sync smoke test | Database / Storage (Vitest global setup) | — | Already implemented in `backend/test/globalSetup.js` from v1.1; Phase 12 extends fixtures only |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Spouse storage shape:** A single canonical join row per couple in a spouses join table,
  stored as an ordered id pair (e.g. `memberAId < memberBId`, unique on the pair). "My spouse" is read
  by querying rows where either column equals me — one source of truth, no two-row sync risk.
- **D-02 — Spouse cardinality:** Multiple spouse edges are allowed. NO single-spouse unique
  constraint. Diverges from REQUIREMENTS.md's "one mother/father + spouse" phrasing and GEN-01's
  deferral — flagged for the planner, implement as chosen.
- **D-03 — Delete behavior (married-in rule):** Deleting a member drops the spouse join row(s); blood
  members always survive. A spouse who is "married-in only" — **no linked mother AND no linked father
  AND no children** — is deleted along with their partner. **ONE HOP ONLY**, no recursion.
- **D-04 — Success-criterion #4 revision:** Deleting a member never cascade-deletes any blood relative
  (children/parents/blood spouse); a married-in-only spouse IS removed with their partner. Proven by
  tests for both (a) mid-tree blood member deletion (descendants + blood spouse survive) and (b)
  married-in-only spouse removal (one hop deep).
- **D-05 — Parent columns:** Two nullable self-referencing FKs, `motherId` and `fatherId`, both
  referencing `FamilyMember`. `ON DELETE` must null these out on children of a deleted member — never
  cascade-delete children.
- **D-06 — `mothersname`:** Optional free-text string, independent of `motherId`, no enforced
  mutual-exclusivity. Covers the "child raised by the family, biological mother not a tree node" case.
- **D-07 — Required fields:** `firstname`, `lastname`, `gender` required. `gender` is
  `ENUM('Male','Female','Other')` mirroring `User.role`.
- **D-08 — Optional fields:** `mothersname`, `email`, `birthdate`, `deathdate`, `phone`, `address` —
  all nullable.
- **D-09 — `fullname` is derived, never stored:** Sequelize VIRTUAL getter (`firstname` + `lastname`),
  not a column, not a separate input.
- **D-10 — Validation strictness:** Light integrity everywhere except dates. `email` format validated
  only when present (mirrors `User`'s `isEmail`). Full date validation: if both present, `deathdate` ≥
  `birthdate`; reject any future date for either field. **No lower bound** on dates — tree spans into
  the 1600s across ~10–23 generations.
- **D-11 — TDD red-green-refactor mandatory** (project standard + QUAL-01). Cycle and cascade rules
  must each be proven by a test that constructs the bad state and asserts rejection/survival.
- **D-12 — Barrel/model conventions:** New model follows `User.js` + `models/index.js` exactly (`init`
  function, `models` object, `initializeDatabase`).
- **D-13 — `sync()` caveat does NOT block Phase 12:** Phase 12 adds only new tables, so
  `sync({ force: true })` on a fresh DB is legitimate and is success criterion #5. The
  `users.familyMemberId` manual-`ALTER` problem is Phase 13's, not this phase's.

### Claude's Discretion

- The cycle-prevention algorithm (e.g. walking the ancestor chain before a parent edit) and its exact
  error message.
- Join-table mechanics / association setup and the canonical-ordering enforcement mechanism (hook vs
  helper).
- Whether link operations are surfaced as model instance methods vs standalone service functions.
- Whether to gender-type parent slots (e.g. require `motherId` → Female) — default to NOT enforcing.
- Test file structure and fixtures.

### Deferred Ideas (OUT OF SCOPE)

- Broader admin removal-flow polish (richer admin-facing removal UX) → backlog, later phases.
- No seed/demo data in Phase 12 — only programmatic test fixtures.
- Multiple-marriage/remarriage-over-time as first-class data (GEN-01) and half-siblings/step/adoption
  (GEN-02) remain deferred to v2 — model permits multiple spouse edges but does not model marriage
  timelines or richer genealogy.
- GraphQL schema/resolvers, permission scoping, `users.familyMemberId`, and all UI — later phases
  (14, 14, 13, 15/17 respectively). Do not build or research these in Phase 12.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | Required `firstname`, `lastname`, `gender` (Male/Female/Other) | See "Field & Validation Rules" — `DataTypes.ENUM` pattern mirrors `User.role` exactly (Code Examples) |
| MEM-02 | Optional `mothersname`, `email`, `birthdate`, `deathdate`, `phone`, `address` | See "Field & Validation Rules" — all `allowNull: true`, `email` uses conditional `isEmail` like `User` |
| MEM-03 | `fullname` derived, not stored | See "VIRTUAL Getter Pattern" — official Sequelize v6 `DataTypes.VIRTUAL` getter |
| MEM-05 | Persisted via new Sequelize model following barrel conventions | See "Standard Stack" + "Recommended Project Structure" — extends `models/index.js` barrel exactly like `User` |
| REL-01 | Set a member's parents (mother/father), linking or creating | See "Self-Referencing Associations" — `motherId`/`fatherId` `belongsTo` with distinct aliases |
| REL-02 | Symmetric spouse link, reads correctly from either side | See "Canonical Spouse Join Table" — ordered-pair model + `Op.or` read helper |
| REL-03 | Add a child to a member, establishing parent→child link | See "Self-Referencing Associations" — `hasMany` inverse of `motherId`/`fatherId` belongsTo |
| REL-05 | Reject any edit that would create a cycle | See "Cycle Prevention" — ancestor-chain walk before committing a parent edit |

## Standard Stack

### Core (already installed — no new packages required)

| Library | Installed Version | Purpose | Why Standard |
|---------|-------------------|---------|---------------|
| `sequelize` | 6.37.8 [VERIFIED: package-lock.json + npm registry] | ORM, associations, validation, transactions | Already the project's ORM (`User` model); Phase 12 extends it, does not replace it |
| `mysql2` | 3.22.3 [VERIFIED: package-lock.json + npm registry] | MySQL driver for Sequelize | Already the project's driver |
| `vitest` | 4.1.10 [VERIFIED: package-lock.json + npm registry] | Test runner (backend + frontend) | Already installed and wired (`backend/vitest.config.js`, `test/globalSetup.js`) from a prior milestone — CLAUDE.md's "test tooling (proposed)" language is stale; this is a decided, shipped choice, not an open question |
| `supertest` | 7.2.2 [VERIFIED: package-lock.json + npm registry] | HTTP-level integration testing (`backend/test/helpers.js`) | Already installed; not directly needed for model-only tests but available if any smoke test exercises the app layer |

**No installation step needed for this phase.** `Package Legitimacy Audit` below is a formality —
zero new packages are added.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `Spouse` model (explicit join model) | `belongsToMany(FamilyMember, { through: 'Spouse' })` implicit-through | `belongsToMany`'s auto-generated composite unique constraint enforces "no duplicate pair" but does **not** give you a hook point to enforce `memberAId < memberBId` ordering before insert, nor lets you query "my spouse from either side" with a natural single-model `findAll`. A dedicated model with explicit columns + a `beforeValidate` ordering hook is more transparent and directly supports D-01's canonical-row requirement. |
| Ancestor-walk cycle check (helper function) | Recursive CTE (`WITH RECURSIVE`) raw SQL query | MySQL 8.4 (the project's pinned image) supports recursive CTEs, so this is viable, but it bypasses Sequelize's validation pipeline and mixes raw SQL into an otherwise ORM-only codebase. For trees up to ~23 generations, an in-process walk (bounded by generation depth, not member count) is simpler, testable without SQL fixtures, and consistent with the codebase's "no raw SQL" convention (grep of `backend/src` shows zero `sequelize.query()` usage today). |
| Married-in delete as a helper function | Sequelize model hook (`beforeDestroy`) | A hook fires on every destroy call including future resolver-driven ones, making the one-hop rule implicit and harder to test in isolation for a case (`Model.destroy()` bulk deletes don't reliably fire instance hooks unless `individualHooks: true`). An explicit `deleteMember(id)` helper function keeps the rule visible, transactional, and independently testable — matches "Claude's Discretion" note that link operations may be instance methods or standalone functions; standalone is recommended for anything transactional. |

**Version verification:** Confirmed via `package-lock.json` (already resolved/installed for this
workspace) cross-checked against `npm view <pkg> version` on the public registry — `sequelize@6.37.8`,
`mysql2@3.22.3` (note: `package.json` pins `^3.11.5`, lockfile resolved `3.22.3` — normal semver-range
resolution, no action needed), `vitest@4.1.10`, `supertest@7.2.2`. All current as of research date;
no breaking Sequelize 7 migration is in play (project stays on Sequelize 6.x).

## Package Legitimacy Audit

**Not applicable — this phase adds zero new packages.** All required libraries (`sequelize`,
`mysql2`, `vitest`, `supertest`) are already installed dependencies of `backend/package.json`,
resolved in `package-lock.json`, and verified against the npm registry above. No `slopcheck` run is
needed; there is nothing new to audit.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────┐
                     │   Test files (Vitest, TDD)   │
                     │  *.test.js next to source     │
                     └──────────────┬────────────────┘
                                    │ imports
                                    ▼
                     ┌─────────────────────────────┐
                     │  models/index.js (barrel)     │
                     │  - initFamilyMember(sequelize)│
                     │  - initSpouse(sequelize)      │
                     │  - initUser(sequelize)        │
                     │  - associate() [NEW step]     │
                     │  - initializeDatabase()        │
                     └──────────────┬────────────────┘
                                    │ registers on
                                    ▼
                     ┌─────────────────────────────┐
                     │   Sequelize instance           │
                     │   (config/database.js)         │
                     └──────────────┬────────────────┘
                                    │ sync() / queries
                                    ▼
                     ┌─────────────────────────────┐
                     │   MySQL (isolated _test DB)    │
                     │   family_members table         │
                     │     - motherId FK → self        │
                     │     - fatherId FK → self         │
                     │   spouses table                 │
                     │     - memberAId FK → family_...  │
                     │     - memberBId FK → family_...  │
                     │     - UNIQUE(memberAId, memberBId)│
                     └─────────────────────────────┘

Helper functions (new, model-adjacent, NOT resolvers):
  linkParent(childId, { motherId, fatherId })  → cycle check → update
  addChild(parentId, childAttrs)               → create with parent FK set
  setSpouse(memberAId, memberBId)               → canonicalize order → find-or-create
  deleteMember(memberId)                        → transaction: find married-in spouse(s) → destroy both
```

### Recommended Project Structure

```
backend/src/models/
├── User.js                    # existing — unchanged
├── FamilyMember.js             # NEW — init function, matches User.js shape
├── Spouse.js                   # NEW — join model, ordered-pair columns + ordering hook
├── index.js                    # EXTENDED — add initFamilyMember/initSpouse calls,
│                                #   associate() step, add both to `models` object
├── FamilyMember.test.js        # NEW — field/validation/VIRTUAL unit tests
├── FamilyMember.associations.test.js  # NEW — parent link, cycle rejection tests
├── Spouse.test.js              # NEW — canonical ordering, symmetric read tests
└── familyMember.service.js     # NEW (or similar name) — linkParent/addChild/setSpouse/
                                 #   deleteMember helper functions + cycle-check + married-in rule
```

### Pattern 1: Model init function (existing convention, extend exactly)

**What:** Every model is a plain class extending `Model`, initialized via an exported `initX(sequelize)`
function that calls `X.init({...fields}, {...options})` and returns the class. `User.js` is the only
existing example.

**When to use:** For both `FamilyMember` and `Spouse`.

**Example:**
```javascript
// Source: backend/src/models/User.js (existing codebase pattern)
import { DataTypes, Model } from 'sequelize';

export class FamilyMember extends Model {}

export function initFamilyMember(sequelize) {
  FamilyMember.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      firstname: { type: DataTypes.STRING, allowNull: false },
      lastname: { type: DataTypes.STRING, allowNull: false },
      gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: false },
      mothersname: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
      birthdate: { type: DataTypes.DATEONLY, allowNull: true },
      deathdate: { type: DataTypes.DATEONLY, allowNull: true },
      phone: { type: DataTypes.STRING, allowNull: true },
      address: { type: DataTypes.STRING, allowNull: true },
      // motherId / fatherId are NOT declared here — Sequelize adds them
      // automatically as columns when the belongsTo association is defined
      // in models/index.js (see Pattern 2). Declaring them here too would
      // create a duplicate/conflicting column definition.
      fullname: {
        type: DataTypes.VIRTUAL,
        get() {
          return `${this.firstname} ${this.lastname}`;
        }
      }
    },
    {
      sequelize,
      modelName: 'FamilyMember',
      tableName: 'family_members',
      validate: {
        deathAfterBirth() {
          if (this.birthdate && this.deathdate && this.deathdate < this.birthdate) {
            throw new Error('deathdate must not be before birthdate.');
          }
        },
        noFutureDates() {
          const today = new Date().toISOString().slice(0, 10);
          if (this.birthdate && this.birthdate > today) {
            throw new Error('birthdate must not be in the future.');
          }
          if (this.deathdate && this.deathdate > today) {
            throw new Error('deathdate must not be in the future.');
          }
        }
      }
    }
  );

  return FamilyMember;
}
```
*Note: `DataTypes.DATEONLY` (not `DATE`) is recommended for `birthdate`/`deathdate` — these are
calendar dates, not timestamps, and `DATEONLY` returns/accepts plain `'YYYY-MM-DD'` strings, which
also sidesteps timezone-shift bugs when comparing dates across the ~1600s–present range. `[ASSUMED —
DATEONLY vs DATE choice not explicitly locked in CONTEXT.md; flag for planner confirmation.]`*

### Pattern 2: Self-referencing parent associations (models/index.js, NEW territory)

**What:** Two `belongsTo` associations from `FamilyMember` to itself with distinct aliases and
foreign keys, each with an inverse `hasMany`. Declare `onDelete`/`onUpdate` on **one side only** (the
`belongsTo` side) — Sequelize has a documented bug where conflicting options declared on both sides of
an association silently resolve to whichever side Sequelize processes last (favors `hasMany` in
observed cases), which is surprising and untested-against. [CITED: github.com/sequelize/sequelize
issue #16526]

**When to use:** In `models/index.js`, after all `init*(sequelize)` calls, before `initializeDatabase`.

**Example:**
```javascript
// Source: Sequelize v6 docs (sequelize.org/docs/v6/core-concepts/assocs) — pattern adapted
// for two self-referencing FKs per the "aliases for multiple associations to the same model" guidance.
import { sequelize } from '../config/database.js';
import { initUser } from './User.js';
import { initFamilyMember, FamilyMember } from './FamilyMember.js';
import { initSpouse, Spouse } from './Spouse.js';

const User = initUser(sequelize);
initFamilyMember(sequelize);
initSpouse(sequelize);

// --- Associations (first use of Sequelize associations in this codebase) ---

// Parent links: declare onDelete/onUpdate ONLY on the belongsTo side.
FamilyMember.belongsTo(FamilyMember, {
  as: 'mother',
  foreignKey: { name: 'motherId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsMother', foreignKey: 'motherId' });

FamilyMember.belongsTo(FamilyMember, {
  as: 'father',
  foreignKey: { name: 'fatherId', allowNull: true },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});
FamilyMember.hasMany(FamilyMember, { as: 'childrenAsFather', foreignKey: 'fatherId' });

// Spouse join model — plain belongsTo pair, no onDelete override needed here
// (spouse-row deletion is handled explicitly by the deleteMember() helper,
// not by DB-level cascade, per D-03's one-hop rule which needs application logic).
Spouse.belongsTo(FamilyMember, { as: 'memberA', foreignKey: { name: 'memberAId', allowNull: false } });
Spouse.belongsTo(FamilyMember, { as: 'memberB', foreignKey: { name: 'memberBId', allowNull: false } });

export const models = { User, FamilyMember, Spouse };

export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
}

export { sequelize };
```

**Pitfall — nullable FK is required for SET NULL to be valid:** MySQL rejects an `ON DELETE SET NULL`
foreign key on a `NOT NULL` column at DDL time. Both `motherId` and `fatherId` must be
`allowNull: true` (they are, per D-05 "nullable") — declaring the foreign key with `allowNull: false`
here would break `sync()`. [CITED: sequelize.org/docs/v6/core-concepts/assocs — "By default, Sequelize
will set SET NULL if the foreign key is nullable, and CASCADE if it is not."]

**Pitfall — self-referencing FK inside `sync({ force: true })`:** MySQL supports an inline
self-referencing `FOREIGN KEY ... REFERENCES <same_table>` clause within a single `CREATE TABLE`
statement (the table name is already known at parse time even though no rows exist yet), so
`family_members` can be created in one `CREATE TABLE` with both FK constraints — no separate
`ALTER TABLE` step is required for this specific case (this differs from *cross-table* circular FKs
between two different tables, which do need a create-then-alter sequence; not applicable here since
Phase 12 has no cross-table cycle). [MEDIUM confidence — inferred from MySQL DDL semantics + Sequelize
sync ordering; not exhaustively tested in this research session. Recommend the fresh-DB smoke test
(success criterion #5) as the actual verification.]

### Pattern 3: Canonical spouse join table with enforced ordering

**What:** A dedicated `Spouse` model with `memberAId`/`memberBId` columns, a composite unique index,
and a `beforeValidate` hook that swaps the two IDs into ascending order before every create — so
"couple (5, 12)" and an attempted "couple (12, 5)" always collapse to the same canonical row.

**When to use:** For the `setSpouse(memberAId, memberBId)` helper (REL-02, D-01).

**Example:**
```javascript
// Source: pattern combines Sequelize v6 model-hooks docs (sequelize.org/docs/v6/core-concepts/hooks)
// with the project's own beforeValidate normalization pattern in backend/src/models/User.js:59-61.
import { DataTypes, Model } from 'sequelize';

export class Spouse extends Model {}

export function initSpouse(sequelize) {
  Spouse.init(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true }
      // memberAId / memberBId added by the belongsTo association definitions
      // in models/index.js (see Pattern 2) — not redeclared here.
    },
    {
      sequelize,
      modelName: 'Spouse',
      tableName: 'spouses',
      indexes: [{ unique: true, fields: ['memberAId', 'memberBId'] }],
      hooks: {
        beforeValidate(spouse) {
          if (spouse.memberAId != null && spouse.memberBId != null && spouse.memberAId > spouse.memberBId) {
            const tmp = spouse.memberAId;
            spouse.memberAId = spouse.memberBId;
            spouse.memberBId = tmp;
          }
        }
      },
      validate: {
        notSelfMarriage() {
          if (this.memberAId != null && this.memberBId != null && this.memberAId === this.memberBId) {
            throw new Error('A member cannot be their own spouse.');
          }
        }
      }
    }
  );

  return Spouse;
}
```

**Reading "my spouse(s)" symmetrically (REL-02):**
```javascript
// Source: standard Sequelize Op.or pattern (sequelize.org/docs/v6/core-concepts/model-querying-basics)
import { Op } from 'sequelize';
import { models } from './index.js';

export async function getSpouseRows(memberId) {
  return models.Spouse.findAll({
    where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
    include: [{ association: 'memberA' }, { association: 'memberB' }]
  });
}
```

**Pitfall — race condition on canonical ordering:** the `beforeValidate` swap is per-instance and
correct, but the *uniqueness* guarantee (no duplicate couple row) still depends on the DB-level unique
index on `(memberAId, memberBId)` catching a duplicate-order insert attempt, since two concurrent
`Spouse.create()` calls with swapped arguments could both pass in-process validation before either
commits. Wrap `setSpouse()` in a transaction and catch `SequelizeUniqueConstraintError` to make it
idempotent (treat "already married" as success, not an error) rather than relying on an
application-level existence check alone (TOCTOU gap). [ASSUMED — no CONTEXT.md decision on concurrent-
write handling; reasonable default given D-11's TDD mandate, flag for planner.]

### Pattern 4: Cycle prevention (ancestor-chain walk)

**What:** Before committing a `motherId`/`fatherId` assignment, walk the *proposed parent's* own
ancestor chain (via its `motherId`/`fatherId`) and reject if the *child being edited* appears anywhere
in that chain — which would make the child its own ancestor.

**When to use:** Inside the `linkParent(childId, { motherId, fatherId })` helper, before the `update()`
call; also inside `addChild`'s parent-assignment path.

**Example:**
```javascript
// Standard graph-traversal technique (general CS knowledge, not framework-specific).
// [ASSUMED — this is elementary graph theory (ancestor-chain DFS), not verified against
// an external source; confidence is HIGH on correctness because family-tree parent edges
// form a bounded-out-degree-2 DAG when acyclic, making a simple iterative walk sufficient.]
import { models } from '../models/index.js';

const MAX_DEPTH = 100; // generous upper bound; tree is documented at ~10-23 generations

export async function wouldCreateCycle(childId, candidateParentId) {
  if (childId === candidateParentId) return true;

  let frontier = [candidateParentId];
  const visited = new Set();

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    if (frontier.includes(childId)) return true;

    const rows = await models.FamilyMember.findAll({
      where: { id: frontier },
      attributes: ['id', 'motherId', 'fatherId']
    });

    const next = new Set();
    for (const row of rows) {
      if (row.motherId && !visited.has(row.motherId)) next.add(row.motherId);
      if (row.fatherId && !visited.has(row.fatherId)) next.add(row.fatherId);
    }
    frontier.forEach((id) => visited.add(id));
    frontier = [...next];
  }

  return false;
}

export async function linkParent(childId, { motherId, fatherId } = {}) {
  if (motherId != null && (await wouldCreateCycle(childId, motherId))) {
    throw new Error('This assignment would make the member their own ancestor (mother).');
  }
  if (fatherId != null && (await wouldCreateCycle(childId, fatherId))) {
    throw new Error('This assignment would make the member their own ancestor (father).');
  }

  const updates = {};
  if (motherId !== undefined) updates.motherId = motherId;
  if (fatherId !== undefined) updates.fatherId = fatherId;

  return models.FamilyMember.update(updates, { where: { id: childId } });
}
```

**Pitfall — self-assignment edge case:** `wouldCreateCycle(childId, candidateParentId)` must
short-circuit `childId === candidateParentId` explicitly (a member cannot be their own parent) —
the chain walk alone would only catch this if it happened to revisit the start node, which a
`visited` set actively prevents (by design, to bound the walk), so the explicit check above is
required, not redundant.

**Pitfall — batched query per depth, not per-node:** the example above batches all frontier nodes
into a single `findAll({ where: { id: frontier } })` per depth level rather than one query per node,
keeping query count bounded by tree *depth* (≤23 per D-05/CONTEXT's stated range) rather than by
subtree *width* — relevant for performance once the real family tree is populated.

### Pattern 5: Married-in one-hop delete (transactional helper)

**What:** Deleting a member must (1) find any spouse(s) who are "married-in only" — no `motherId`, no
`fatherId`, and zero rows where they appear as `motherId`/`fatherId` of another member — and delete
those spouse rows too, in the same transaction, before or alongside deleting the target; (2) let the
FK-level `ON DELETE SET NULL` handle nulling out any children's `motherId`/`fatherId`; (3) delete all
`Spouse` join rows involving the target (and involving any married-in spouse being removed).

**When to use:** `deleteMember(memberId)` helper — the only sanctioned way to remove a `FamilyMember`
in this phase (no resolver exists yet, but the helper is what a future resolver will call).

**Example:**
```javascript
// Source: pattern combines Sequelize v6 transactions docs
// (sequelize.org/docs/v6/core-concepts/transactions) with D-03's precise "married-in only" definition.
import { Op } from 'sequelize';
import { sequelize, models } from '../models/index.js';

async function isMarriedInOnly(memberId, transaction) {
  const member = await models.FamilyMember.findByPk(memberId, { transaction });
  if (!member) return false;
  if (member.motherId != null || member.fatherId != null) return false;

  const childCount = await models.FamilyMember.count({
    where: { [Op.or]: [{ motherId: memberId }, { fatherId: memberId }] },
    transaction
  });
  return childCount === 0;
}

export async function deleteMember(memberId) {
  return sequelize.transaction(async (transaction) => {
    const spouseRows = await models.Spouse.findAll({
      where: { [Op.or]: [{ memberAId: memberId }, { memberBId: memberId }] },
      transaction
    });

    const partnerIds = spouseRows.map((row) =>
      row.memberAId === memberId ? row.memberBId : row.memberAId
    );

    // ONE HOP ONLY: check married-in status using the CURRENT state (before
    // the target is deleted), never recurse into the partner's own spouses.
    const marriedInPartnerIds = [];
    for (const partnerId of partnerIds) {
      if (await isMarriedInOnly(partnerId, transaction)) {
        marriedInPartnerIds.push(partnerId);
      }
    }

    // Delete spouse join rows first (both target's and married-in partner's),
    // then the married-in partner(s), then the target. Order matters: the FK
    // from Spouse -> FamilyMember has no cascade configured, so join rows
    // must be removed explicitly before either FamilyMember row is destroyed.
    await models.Spouse.destroy({
      where: {
        [Op.or]: [
          { memberAId: memberId }, { memberBId: memberId },
          ...marriedInPartnerIds.flatMap((id) => [{ memberAId: id }, { memberBId: id }])
        ]
      },
      transaction
    });

    if (marriedInPartnerIds.length > 0) {
      await models.FamilyMember.destroy({ where: { id: marriedInPartnerIds }, transaction });
    }

    // Deleting this row triggers ON DELETE SET NULL on any children's
    // motherId/fatherId at the DB constraint level automatically.
    await models.FamilyMember.destroy({ where: { id: memberId }, transaction });
  });
}
```

**Pitfall — "children" in the married-in test means children *of the tree*, not children *of this
marriage*:** D-03's definition is "no children" full stop — a married-in spouse who has ANY child
(with anyone) is blood-linked via that child and survives. The `childCount` check above (any row
where they're `motherId` OR `fatherId`) matches this correctly; do not narrow it to "children shared
with the deleted member" — that would be a different, stricter rule the user did not ask for.

**Pitfall — checking married-in status must happen before any deletion in the transaction**, using
the pre-delete graph state, since deleting the target member could itself change whether the partner
"has children" (it doesn't, in this model — children point at the member as an FK, not vice versa —
but get this ordering right regardless, since a future model change could make it matter).

### Anti-Patterns to Avoid

- **Declaring `onDelete`/`onUpdate` on both the `belongsTo` and `hasMany` sides of the same FK:**
  Sequelize does not error on this; it silently picks one side's value, which is exactly the kind of
  bug that passes local testing and fails in a way that's hard to diagnose later. Declare once, on the
  `belongsTo` side.
- **Relying on a Sequelize `beforeDestroy` hook for the married-in rule:** hooks don't reliably run for
  bulk `Model.destroy({ where })` calls unless `individualHooks: true` is passed (a well-known Sequelize
  footgun), and the rule needs a transaction spanning multiple models (`Spouse` + `FamilyMember`) that a
  single-model hook can't cleanly express. Use an explicit helper function instead.
  [CITED: sequelize.org/docs/v6/core-concepts/hooks — bulk operations skip instance hooks by default.]
  [MEDIUM confidence — general Sequelize hooks behavior, cross-verified via WebSearch; recommend
  verifying with a dedicated test if the plan ever does adopt a hook-based approach.]
- **Redeclaring `motherId`/`fatherId`/`memberAId`/`memberBId` as explicit fields in `FamilyMember.init()`
  / `Spouse.init()` AND as association `foreignKey` options:** pick one place. This research recommends
  letting the association definitions in `models/index.js` be the single source of truth for these FK
  columns (Pattern 2/3 above), matching the "aliases for multiple associations to the same model"
  guidance from Sequelize's own docs.
- **Using `DataTypes.DATE` for `birthdate`/`deathdate`:** introduces unnecessary timezone/time-of-day
  noise for what are calendar-date-only fields spanning centuries; use `DataTypes.DATEONLY`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FK-level cascade-null on parent delete | Manual "find all children, set motherId/fatherId to null" cleanup code in the delete helper | Sequelize `belongsTo({ onDelete: 'SET NULL' })` → real MySQL FK constraint | The DB enforces it unconditionally, including for any future direct-SQL or admin-tool deletes that bypass the Sequelize helper entirely — application-level cleanup code could be skipped or forgotten in a code path you don't control later |
| Composite-key deduplication for spouse pairs | Manual "check both orderings exist" query before insert | DB-level `UNIQUE(memberAId, memberBId)` index + canonical ordering hook | Removes the TOCTOU race entirely; the unique index is the actual source of truth, the hook is just what makes lookups cheap |
| Email format validation | Custom regex | Sequelize's built-in `isEmail: true` validator (already used by `User`) | Consistency with the existing codebase pattern; validator.js (Sequelize's dependency) handles edge cases a hand-rolled regex won't |
| Cross-field date validation | Per-field custom validator on `deathdate` alone (can't see `birthdate` from there) | Model-level `validate` option (`options.validate`, not `attributes.deathdate.validate`) | This is the documented, correct place in Sequelize for multi-field validation — field-level validators only receive the single field's value |

**Key insight:** Every piece of cascade/cycle/uniqueness safety this phase needs has a first-class
Sequelize or MySQL mechanism (FK constraints, unique indexes, model-level validators, transactions).
The only genuinely hand-rolled logic is the ancestor-chain cycle walk and the married-in-only
predicate — both are small, pure, and directly testable, which is exactly the surface area D-11's TDD
mandate expects tests to cover.

## Common Pitfalls

### Pitfall 1: Conflicting onDelete options across association pairs
**What goes wrong:** Declaring `onDelete: 'SET NULL'` on `belongsTo` and a different value (or the
Sequelize hasMany default) on the paired `hasMany` produces a single ambiguous FK constraint at
`sync()` time with no error — just silently-wrong behavior.
**Why it happens:** Sequelize merges both association definitions into one physical foreign key
constraint but doesn't validate that both sides agree.
**How to avoid:** Declare `onDelete`/`onUpdate` on exactly one side (Pattern 2 above uses `belongsTo`).
**Warning signs:** A test deletes a parent and asserts children's `motherId` is null, but the test
passes even though you changed `onDelete` on the `hasMany` side to something else — indicates the
`belongsTo` side's declaration is the one actually winning, masking a config mistake.

### Pitfall 2: Forgetting `allowNull: true` breaks `ON DELETE SET NULL` at DDL time
**What goes wrong:** If `motherId`/`fatherId` end up `allowNull: false` (e.g. from a copy-paste of a
different association elsewhere later), MySQL will reject the FK constraint at `CREATE TABLE` time
(SET NULL requires a nullable column), and `sync({ force: true })` fails — which would actually be
caught immediately by the existing fresh-DB smoke test, but wastes a debugging cycle.
**Why it happens:** Easy to default to `allowNull: false` out of habit when required fields (
`firstname`/`lastname`/`gender`) dominate the same model file.
**How to avoid:** Explicitly set `allowNull: true` in the `foreignKey` object for both `motherId` and
`fatherId`.
**Warning signs:** `sync()` throws `ER_CANNOT_ADD_FOREIGN` referencing `motherId`/`fatherId`.

### Pitfall 3: `sync()` (no args) vs `sync({ force: true })` — do not accidentally change the shared path
**What goes wrong:** `models/index.js`'s `initializeDatabase()` calls plain `sequelize.sync()` (used at
real app boot, adds tables but never alters/drops existing ones). The test harness's
`globalSetup.js` separately calls `sync({ force: true, match: /_test$/ })`. Phase 12 must not touch
`initializeDatabase()`'s plain `sync()` call — D-13 explicitly scopes the `force: true` smoke test to
the test harness, not production boot.
**Why it happens:** It's tempting to "test" the new tables by temporarily changing `initializeDatabase`
to `force: true` during development and forgetting to revert.
**How to avoid:** Never modify `initializeDatabase()`'s `sync()` call signature in this phase; the
fresh-DB smoke test IS `backend/test/globalSetup.js`, already wired to run before every Vitest run via
`vitest.config.js`'s `globalSetup` option — verify success criterion #5 by simply running `npm test`
and confirming no errors, not by writing new sync-invocation code.
**Warning signs:** Any diff touching `models/index.js`'s `initializeDatabase` function beyond adding
the two new `init*` calls and the `associate()` step is a scope violation for this phase.

### Pitfall 4: `DataTypes.DATEONLY` returns strings, not `Date` objects
**What goes wrong:** Tests that compare `member.birthdate` to a JS `Date` instance with `toEqual()`
or `<`/`>` will fail unexpectedly — Sequelize returns `DATEONLY` columns as `'YYYY-MM-DD'` strings by
default (not `Date` objects), while `DataTypes.DATE` returns real `Date` objects (matching `User`'s
existing `resetPasswordExpiresAt`/`passwordChangedAt` fields).
**Why it happens:** Mixing mental models between `User`'s existing `DATE` fields and the new
`DATEONLY` fields this phase introduces.
**How to avoid:** Write date-validation tests using string comparison (`'2024-01-01' < '2024-06-01'`
works correctly for ISO date strings) or explicitly `new Date(member.birthdate)` before comparing.
**Warning signs:** A "future date rejected" test that mysteriously passes/fails depending on how the
candidate date was constructed (string literal vs `new Date()` vs `Date.now()`).

### Pitfall 5: The "married-in" check must run before the transaction commits any deletion
**What goes wrong:** If the married-in predicate check for a partner is run *after* the target member
is already deleted, `motherId`/`fatherId` on any of the partner's children may have already been
SET NULL by the just-fired FK constraint — changing what "has children" would evaluate to mid-way
through the same operation.
**Why it happens:** Natural but wrong ordering: "delete target, then clean up loose ends."
**How to avoid:** Compute `isMarriedInOnly()` for all partners **first**, inside the transaction,
before issuing any `destroy()` call (Pattern 5's structure already does this — preserve that order if
refactoring).
**Warning signs:** A test for "delete blood member X, married-in spouse Y survives because Y has
child Z (via X)" — if this test is flaky or order-dependent, the check-then-delete ordering has been
broken.

## Code Examples

### Field & Validation Rules (MEM-01/02/03, D-07/08/09/10)

See Pattern 1 above for the full `FamilyMember.init()` shape. Key excerpts:

```javascript
// gender ENUM — Source: backend/src/models/User.js:32-36 (role ENUM), same pattern
gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: false }

// email — Source: backend/src/models/User.js:22-27, but allowNull:true (User's email is required;
// FamilyMember's is optional per D-08) so isEmail only runs when a value is present.
email: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } }
```

### VIRTUAL Getter Pattern (MEM-03, D-09)

```javascript
// Source: sequelize.org/docs/v6/core-concepts/getters-setters-virtuals
fullname: {
  type: DataTypes.VIRTUAL,
  get() {
    return `${this.firstname} ${this.lastname}`;
  }
}
```
Note: do NOT add a `set()` that throws (as some Sequelize examples do for a stricter "never settable"
guarantee) unless the planner wants that extra strictness — D-09 only requires "never stored," which
`VIRTUAL` alone already guarantees (VIRTUAL fields are never included in INSERT/UPDATE SQL).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Sequelize v5 `Model.init()` chaining, `sequelize.define()` legacy style | Sequelize v6 class-based `Model.init(attrs, options)` (already the codebase's style in `User.js`) | Sequelize 6 (2020+) | No change needed — codebase already on the current pattern |
| Manual raw-SQL self-referencing FK setup | Association-declared FK with `foreignKey` object + `onDelete`/`onUpdate` options, resolved automatically by `sync()` | Stable since Sequelize 5/6 | This IS the current approach used in Pattern 2 |

**Deprecated/outdated:** None relevant — Sequelize 6.x association/validation APIs used throughout
this research are the current, non-deprecated APIs as of the installed `6.37.8`. (Sequelize 7 is in
beta/alpha and not adopted by this project; do not follow Sequelize v7 docs, which have breaking API
differences — this research deliberately cited `sequelize.org/docs/v6/...` URLs throughout, not `v7`.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `DataTypes.DATEONLY` (not `DATE`) is the right choice for `birthdate`/`deathdate` | Pattern 1, Pitfall 4 | Low — easy to change field type before first migration; affects test assertion style (string vs Date comparisons) |
| A2 | `setSpouse()` should be idempotent (treat "already married" as success) under a `SequelizeUniqueConstraintError` race, wrapped in a transaction | Pattern 3 | Low-Medium — if the planner prefers strict error-on-duplicate instead, this only affects one helper function's error-handling branch, not the schema |
| A3 | Self-referencing FK constraints for `motherId`/`fatherId` can be created inline in a single `CREATE TABLE` during `sync({ force: true })` without a separate ALTER step | Pattern 2, "self-referencing FK inside sync" pitfall note | Medium — if wrong, the fresh-DB smoke test (success criterion #5) will simply fail loudly during `npm test`, which is self-correcting (TDD catches it immediately); no silent failure risk |
| A4 | Married-in-only helper functions (not Sequelize hooks) are the right architectural choice for cascade logic | "Alternatives Considered", Anti-Patterns | Low — this is "Claude's Discretion" per CONTEXT.md, explicitly left open; either approach is testable |
| A5 | Ancestor-chain cycle-walk algorithm (iterative BFS with a `visited` set, batched per-depth queries) is correct and sufficiently performant for ~23-generation trees | Pattern 4 | Low — this is standard, well-understood graph theory; the batching detail is a performance optimization, not a correctness requirement — even an unbatched per-node walk would be correct, just slower |

## Open Questions

1. **Should `Spouse` rows be queryable/creatable through `FamilyMember` association methods (e.g.
   `member.getSpouses()`) in addition to the dedicated `Spouse` model, or is direct `Spouse.findAll`
   with `Op.or` sufficient?**
   - What we know: D-01 only requires "read correctly from either side" — the `Op.or` helper in
     Pattern 3 satisfies this without needing a `belongsToMany` shortcut.
   - What's unclear: whether the planner wants a convenience association (e.g.
     `FamilyMember.belongsToMany(FamilyMember, { through: Spouse, as: 'spouses', foreignKey: 'memberAId',
     otherKey: 'memberBId' })`) layered on top for ergonomic `include`-based queries, at the cost of
     that association only capturing the `memberAId → memberBId` direction (an asymmetric
     `belongsToMany` wouldn't be symmetric on its own — you'd still need Pattern 3's helper for full
     symmetry, since `belongsToMany` with distinct `foreignKey`/`otherKey` in Sequelize is directional).
   - Recommendation: skip the `belongsToMany` convenience association for this phase — it adds
     complexity without removing the need for the symmetric helper, and CONTEXT.md's "one source of
     truth" framing favors the simpler, single explicit query path.

2. **Exact error message text for cycle rejection and married-in-only deletion outcomes.**
   - What we know: D-11 requires tests that "construct the bad state and assert rejection/survival" —
     tests can assert on `.rejects.toThrow()` without pinning exact message text, or pin a specific
     message if the planner wants message-stability tests.
   - What's unclear: whether any later phase (14's resolvers) surfaces these messages verbatim to
     end users, which would make wording a product decision, not just an internal implementation
     detail.
   - Recommendation: use clear, specific messages now (as shown in Pattern 4/5 examples); treat as
     non-load-bearing for Phase 12's own tests (assert error is thrown, not exact string), leaving
     Phase 14 free to wrap/translate messages for the API layer without breaking Phase 12's test suite.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| MySQL (Docker Compose `mysql:8.4`, or local install) | Isolated `_test` DB for Vitest integration tests | ✓ (already used by v1.1 test suite) | 8.4 (pinned in `docker-compose.yml`) | — |
| Node.js | Running Vitest, ESM backend | ✓ | 24.x (per `.nvmrc`/`package.json` `engines` — **note:** `CLAUDE.md`'s "Node 18.x" constraint is stale; the repo was bumped to 24.x in commit `2611f27` prior to this phase) | — |
| `sequelize`, `mysql2`, `vitest`, `supertest` | Model layer + tests | ✓ | 6.37.8 / 3.22.3 / 4.1.10 / 7.2.2 (all installed, see Standard Stack) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — everything this phase needs is already present.

**Flag for planner:** `CLAUDE.md`'s "Constraints" section states `"Node 18.x"` and describes test
tooling as "proposed... to be confirmed/version-pinned in the research phase" — both are **stale**.
The actual repo state (verified via `.nvmrc`, `package.json` `engines`, git log) is Node 24.x with
Vitest/Supertest/isolated-test-DB already fully implemented and shipped in the v1.1 milestone. The
planner should treat the *installed, working* configuration as ground truth over the CLAUDE.md text,
and may want to flag a CLAUDE.md documentation-drift cleanup as an unrelated follow-up (out of scope
for Phase 12 itself).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (already configured) |
| Config file | `backend/vitest.config.js` (sets `ENV_FILE=env/test.env`, `NODE_ENV=test`, `globalSetup: ['./test/globalSetup.js']`, `pool: 'forks'`, `fileParallelism: false`) |
| Quick run command | `npx vitest run backend/src/models/FamilyMember.test.js` (from repo root) or `cd backend && npx vitest run src/models/FamilyMember.test.js` |
| Full suite command | `npm test` (root) → `npm test --workspaces`, or `cd backend && npm test` for backend only |

**`fileParallelism: false` is deliberate** — the existing config runs test files serially, not in
parallel, because they share one isolated MySQL database (no per-file DB isolation). Phase 12's new
test files inherit this; do not attempt to parallelize `FamilyMember`/`Spouse` test files against the
shared DB without adding per-test data cleanup (see `resetTables()` pattern in `test/helpers.js` —
extend it to also truncate `family_members`/`spouses`, respecting FK order: `spouses` before
`family_members`, or `TRUNCATE` with FK checks disabled).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| MEM-01 | Rejects create without `firstname`/`lastname`/`gender` | unit | `npx vitest run src/models/FamilyMember.test.js` | ❌ Wave 0 |
| MEM-01 | `gender` rejects values outside `Male/Female/Other` | unit | same file | ❌ Wave 0 |
| MEM-02 | Optional fields (`mothersname`, `email`, `birthdate`, `deathdate`, `phone`, `address`) accept `null` | unit | same file | ❌ Wave 0 |
| MEM-03 | `fullname` VIRTUAL getter returns `firstname + ' ' + lastname`, is absent from `rawAttributes` persistence (not a real column) | unit | same file | ❌ Wave 0 |
| MEM-05 | Model registers on `sequelize`, `sync({force:true})` creates `family_members` table with expected columns | integration | `npx vitest run src/models/database.test.js` (extend existing file) or a new `FamilyMember.sync.test.js` | ❌ Wave 0 (extend existing `database.test.js`) |
| REL-01 | `linkParent()` sets `motherId`/`fatherId`; rejects non-existent parent id (FK constraint violation surfaces as a Sequelize error) | integration | `npx vitest run src/models/FamilyMember.associations.test.js` | ❌ Wave 0 |
| REL-02 | `setSpouse(a, b)` and `setSpouse(b, a)` produce the same single canonical row; `getSpouseRows` returns it from either member's id | integration | `npx vitest run src/models/Spouse.test.js` | ❌ Wave 0 |
| REL-02 | D-02: creating two different spouse edges for the same member both persist (no single-spouse constraint) | integration | same file | ❌ Wave 0 |
| REL-03 | `addChild(parentId, attrs)` creates a new `FamilyMember` with the correct parent FK set | integration | `npx vitest run src/models/FamilyMember.associations.test.js` | ❌ Wave 0 |
| REL-05 | `linkParent()` rejects an edge that would make a member their own ancestor (direct self, and a 3+ generation cycle) | integration | `npx vitest run src/models/FamilyMember.cycle.test.js` | ❌ Wave 0 |
| D-04/D-05 | Deleting a mid-tree blood member: children's `motherId`/`fatherId` become `null` (not deleted), blood spouse survives | integration | `npx vitest run src/models/FamilyMember.delete.test.js` | ❌ Wave 0 |
| D-03/D-04 | Deleting a member whose spouse is married-in-only removes that spouse (one hop); a married-in spouse's OWN married-in spouse (2 hops) is NOT removed | integration | same file | ❌ Wave 0 |
| D-10 | `deathdate < birthdate` rejected; future `birthdate`/`deathdate` rejected; very old dates (e.g. `1650-01-01`) accepted | unit | `npx vitest run src/models/FamilyMember.test.js` | ❌ Wave 0 |
| D-06 | `mothersname` persists independently of `motherId` (both set, only one set, neither set — all valid) | unit | same file | ❌ Wave 0 |
| Success criterion #5 | Fresh-DB `sync({force:true})` boots cleanly (no FK errors) — proven implicitly by every integration test run, since `globalSetup.js` already does this before the suite | smoke | `npm test` (whole suite green = smoke test passed) | ✓ (existing `globalSetup.js`, extended automatically once new models are registered) |

### Sampling Rate

- **Per task commit:** `cd backend && npx vitest run <changed-test-file>` (fast, single-file, still
  pays the shared-DB `globalSetup`/`teardown` cost once per Vitest process invocation, not once per
  file, since `globalSetup` runs once per `vitest run` call).
- **Per wave merge:** `cd backend && npm test` (full backend suite, includes the fresh-DB smoke test
  via `globalSetup.js`).
- **Phase gate:** Full suite green (`npm test` from repo root, exercising both workspaces) before
  `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `backend/src/models/FamilyMember.js` — model source (test files below depend on it existing)
- [ ] `backend/src/models/Spouse.js` — model source
- [ ] `backend/src/models/FamilyMember.test.js` — MEM-01/02/03/D-06/D-10 unit tests
- [ ] `backend/src/models/FamilyMember.associations.test.js` — REL-01/REL-03 integration tests
- [ ] `backend/src/models/Spouse.test.js` — REL-02/D-01/D-02 integration tests
- [ ] `backend/src/models/FamilyMember.cycle.test.js` — REL-05 cycle-rejection tests
- [ ] `backend/src/models/FamilyMember.delete.test.js` — D-03/D-04 married-in one-hop + blood-survival tests
- [ ] Extend `backend/test/helpers.js`'s `resetTables()` to truncate `spouses` then `family_members`
      (FK-safe order) alongside the existing `User` truncate, so each test file starts from a clean
      slate within the shared `_test` database
- [ ] Extend `backend/src/models/database.test.js` (or add a sibling file) to assert
      `models.FamilyMember` and `models.Spouse` are registered and queryable — this is the concrete
      "sync boots cleanly" assertion beyond the implicit pass-through from `globalSetup.js`
- Framework install: none — Vitest/Supertest already installed (see Standard Stack)

## Security Domain

`security_enforcement` is not addressed by `.planning/config.json` inspection in this research
session; treating as enabled per default. However, this phase has **no network-facing surface** — no
resolvers, no HTTP routes, no user input parsing beyond Sequelize model validation. ASVS categories
V2 (Authentication), V3 (Session Management), V4 (Access Control) are **not applicable** at this layer
(they belong to Phase 13/14, which own the request-handling boundary). V5 (Input Validation) is
partially relevant: Sequelize's built-in validators (`isEmail`, ENUM, custom date validators) ARE the
input-validation boundary at this layer, but "input" here means values passed by Node.js test code or
a future resolver, not raw untrusted HTTP payloads (no GraphQL/HTTP layer exists yet in this phase).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Out of scope — no auth surface in this phase |
| V3 Session Management | No | Out of scope |
| V4 Access Control | No | Out of scope — permission scoping is Phase 14 |
| V5 Input Validation | Partial | Sequelize model-level + field-level validators (ENUM, `isEmail`, custom date-range validators) — the only "input boundary" that exists at the model layer |
| V6 Cryptography | No | No secrets/PII handled cryptographically at this layer (no passwords, no tokens on `FamilyMember`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| SQL injection via unparameterized queries | Tampering | Not applicable — no raw `sequelize.query()` calls proposed anywhere in this research; all access goes through Sequelize's parameterized query builder (`where`, `findAll`, etc.), consistent with the existing codebase's zero raw-SQL convention |
| Data integrity violation via missing FK constraints (orphaned/dangling references) | Tampering | DB-level FK constraints (`ON DELETE SET NULL`) — see Pattern 2 |
| Business-logic bypass via direct model manipulation skipping validation (`Model.update()` with `validate: false`, or raw attribute assignment) | Tampering/Elevation of Privilege (in later phases, once resolvers exist) | Not this phase's concern to fully close (no resolver layer exists yet to bypass), but noted for Phase 14: any future resolver must go through the helper functions defined here (`linkParent`, `deleteMember`), not raw `FamilyMember.update()`, to preserve cycle-safety and married-in-only guarantees |

## Sources

### Primary (HIGH confidence)
- `backend/src/models/User.js`, `backend/src/models/index.js`, `backend/src/config/database.js` —
  existing codebase, read directly this session.
- `backend/vitest.config.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`,
  `backend/test/helpers.js`, `backend/test/init/01-create-test-db.sh`, `env/test.env`,
  `.github/workflows/ci.yml`, `docker-compose.yml` — existing test infrastructure, read directly this
  session, confirmed already fully implemented (v1.1 milestone, commits `ce0e143`, `6a0f644`, and
  later).
- `package-lock.json` — installed dependency versions, read directly and cross-checked against
  `npm view <pkg> version` (npm registry, live query this session): `sequelize@6.37.8`,
  `mysql2@3.22.3`, `vitest@4.1.10`, `supertest@7.2.2`.

### Secondary (MEDIUM confidence)
- [Associations | Sequelize v6 docs](https://sequelize.org/docs/v6/core-concepts/assocs/) —
  default `onDelete`/`onUpdate` behavior, self-referencing association pattern with aliases, `sync()`
  interaction with FK constraints.
- [Validations & Constraints | Sequelize v6 docs](https://sequelize.org/docs/v6/core-concepts/validations-and-constraints/) —
  model-level `validate` option syntax for cross-field validation, conditional validator skipping on
  `null`, validation timing (`create`/`update`/`save`).
- [Getters, Setters & Virtuals | Sequelize v6 docs](https://sequelize.org/docs/v6/core-concepts/getters-setters-virtuals/) —
  `DataTypes.VIRTUAL` getter pattern for derived fields.
- [BelongsToMany | Sequelize v7 docs](https://sequelize.org/docs/v7/associations/belongs-to-many/) and
  [Advanced M:N Associations | Sequelize v6 docs](https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/) —
  informed the "Alternatives Considered" analysis of `belongsToMany`-through vs dedicated join model
  (v7 doc referenced for conceptual composite-unique-key behavior only; the project stays on v6 APIs).
- [Conflicting onDelete/onUpdate in associations, sequelize/sequelize#16526](https://github.com/sequelize/sequelize/issues/16526) —
  confirms the both-sides-declared conflict bug driving the "declare once" recommendation.

### Tertiary (LOW confidence)
- General graph-cycle-detection web results (DEV Community, AlgoMaster.io articles on DFS cycle
  detection) — used only to confirm the ancestor-walk approach aligns with standard graph theory;
  the actual algorithm in Pattern 4 is original reasoning tailored to this phase's specific
  bounded-out-degree-2 structure, not copied from any source.
- Sequelize GitHub issues on self-referencing `sync({force:true})` FK ordering (#11583, #742, #5252,
  #7606, #6586) — used to identify the pitfall category (order/constraint issues exist in some
  Sequelize scenarios) but none of these issues exactly match this phase's single-table
  self-referencing case; flagged as MEDIUM confidence in Pattern 2 and recommended the actual fresh-DB
  smoke test as the ground-truth verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all versions verified against `package-lock.json` +
  live npm registry query.
- Architecture (associations, validation, VIRTUAL): HIGH — every pattern cross-verified against
  official Sequelize v6 docs and matches an existing analog in `User.js` where one exists.
- Cascade/cycle/married-in business logic: MEDIUM-HIGH — the mechanisms (FK constraints, transactions,
  graph walk) are HIGH confidence; the exact interaction of self-referencing FK constraints with
  `sync({force:true})` carries MEDIUM confidence pending the actual smoke test run (flagged explicitly
  in Pattern 2 and A3).
- Test tooling: HIGH — fully pre-existing, read directly from the repository, not proposed or assumed.

**Research date:** 2026-07-21
**Valid until:** 30 days (Sequelize 6.x is a stable, slow-moving major version; re-verify if the
planner's implementation window extends past ~2026-08-20 or if `sequelize`/`mysql2` receive a minor
version bump in the interim)
