---
phase: 14-relationship-resolvers-permission-scoping-query-safety
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - backend/package.json
  - backend/src/config/env.js
  - backend/src/graphql/queryDepth.test.js
  - backend/src/graphql/serverConfig.js
  - backend/src/loaders/familyMember.loaders.js
  - backend/src/loaders/familyMember.loaders.test.js
  - backend/src/resolvers/dashboard.test.js
  - backend/src/resolvers/familyMember.addChild.test.js
  - backend/src/resolvers/familyMember.addParent.test.js
  - backend/src/resolvers/familyMember.addSibling.test.js
  - backend/src/resolvers/familyMember.addSpouse.test.js
  - backend/src/resolvers/familyMember.deleteMember.test.js
  - backend/src/resolvers/familyMember.editMember.test.js
  - backend/src/resolvers/familyMember.myEditableMembers.test.js
  - backend/src/resolvers/familyMember.relationships.test.js
  - backend/src/resolvers/familyMember.resolver.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/schemas/familyMember.schema.js
  - backend/src/server.js
  - backend/src/services/familyMember.queryCount.test.js
  - backend/src/services/familyMember.scope.test.js
  - backend/src/services/familyMember.service.js
  - backend/test/familyTreeFactory.js
  - backend/test/helpers.js
findings:
  critical: 4
  warning: 12
  info: 0
  total: 16
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-22
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

The scope-computation core (`computeEditableScope`) is well-factored and its unit
tests cover the intended inclusion/exclusion boundaries thoroughly. The DataLoader
layer is correctly request-scoped, and `deleteMember` is correctly admin-gated by
construction rather than by a scope check.

However, the phase's two headline guarantees do not hold as stated:

1. **The SC-4 "may only reference relatives already within your editable scope"
   control is bypassable.** `addSibling` never validates the *inherited* parent
   ids, only the target's id — so a member-user can attach a new child row to
   parents that are provably outside their scope (CR-02). `addChild` guards this
   exact case with an explicit check; `addSibling` reaches the same write through
   a different door with no check at all.
2. **The query-safety objective is not met.** The effective max depth is 100
   (`MAX_QUERY_DEPTH` is set in no env file), on a schema where `mother`,
   `father`, `children`, `spouses` and `siblings` are mutually recursive. A ~50-
   level alternating selection amplifies a handful of rows into an exponentially
   large response (CR-03), and the limit itself fails *open* on a malformed env
   value (CR-04). The tests prove the rule is *wired up*; they do not prove it
   *limits* anything.

Separately, `FamilyMember.linkedUser` punches a hole through the admin-only
`users`/`unlinkedUsers` guards (CR-01) — every relationship test uses an ADMIN
actor, so the non-admin read path that contains the bug is entirely untested.

Transaction discipline is also weaker than the phase contract implies:
`computeEditableScope` exposes a `{ transaction }` option that **no caller ever
passes**, so every permission check runs on a different connection than the write
it authorizes (WR-01), and `editMember` uses no transaction at all (WR-02).

---

## Critical Issues

### CR-01: `linkedUser` traversal exposes every User account to any linked member-user

**File:** `backend/src/resolvers/familyMember.resolver.js:17-20, 264`; `backend/src/schemas/familyMember.schema.js:30`
**Issue:**
`Query.familyMember(id: ID!)` is guarded only by `requireFamilyAccess(user)`,
which admits any verified USER with a `familyMemberId` (`backend/src/utils/auth.js:43-47`).
The returned `FamilyMember` exposes `linkedUser: User`, resolved unconditionally
via `member.getLinkedUser()` with **no authorization check**:

```js
familyMember: async (_parent, { id }, { models, user }) => {
  requireFamilyAccess(user);        // any linked USER passes
  return models.FamilyMember.findByPk(id);
},
...
linkedUser: (member) => member.getLinkedUser()   // no guard
```

`User` exposes `id`, `name`, `email`, `role`, `familyMemberId`, `createdAt`,
`updatedAt` (`backend/src/schemas/user.schema.js:7-15`). Family member ids are
sequential `INTEGER.UNSIGNED` primary keys, so a non-admin can enumerate
`familyMember(id: 1..N) { linkedUser { id name email role } }` and dump the
entire user table — precisely the data that `Query.users` and
`Query.unlinkedUsers` protect with `requireAdmin` (`user.resolver.js:65-72`).
The same hole is reachable through `myEditableMembers`, `mother`, `father`,
`children`, `spouses`, and `siblings`.

`familyMember.relationships.test.js` only ever acts as an ADMIN (`makeAdmin()`
at lines 22-24, used in every case), so this path has zero coverage.

**Fix:** Gate the field, and prefer a non-identifying shape for non-admins:

```js
linkedUser: (member, _args, { user }) => {
  if (user?.role !== 'ADMIN' && user?.familyMemberId !== member.id) return null;
  return member.getLinkedUser();
}
```

If the UI only needs "is this member self-managed?", replace the `linkedUser: User`
field with a boolean `isSelfManaged: Boolean!` so no User row is ever reachable
from the family-tree graph, and add a regression test with a non-admin actor.

---

### CR-02: `addSibling` bypasses the SC-4 out-of-scope-relative control

**File:** `backend/src/resolvers/familyMember.resolver.js:151-178`
**Issue:**
`addChild` explicitly rejects an `otherParentId` outside the actor's scope
(lines 120-126) — the documented SC-4 control preventing a member from attaching
new descendants to people they may not edit. `addSibling` performs the *same
class of write* while validating **only the target's id**, never the parent ids
it copies:

```js
if (!isAdmin) {
  const scope = await computeEditableScope(user.familyMemberId);
  if (!scope.ids.has(targetId)) throw new Error('This member is outside your editable scope.');
}
...
if (target.motherId != null) attrs.motherId = target.motherId;   // never scope-checked
if (target.fatherId != null) attrs.fatherId = target.fatherId;   // never scope-checked
```

`computeEditableScope` is one hop: it includes children and spouses, but **not**
a child's other parent, nor a spouse's parents (proved by
`familyMember.scope.test.js:137-187`). So:

- Actor `A` has child `C` with `motherId = A`, `fatherId = X` (a co-parent who is
  not A's spouse, therefore not in A's scope). `C` **is** in A's scope.
  `addSibling(memberId: C)` creates a new member with `fatherId = X` — a new
  child attached to X. `addChild(memberId: C, otherParentId: X)` would have been
  rejected with *"You may only reference relatives already within your editable
  scope."*
- Actor `A` has spouse `S`. `S` is in A's scope; `S`'s parents `P1`/`P2` are not.
  `addSibling(memberId: S)` writes a new child row onto `P1`/`P2`.

This is an authorization bypass, not a data-modelling nuance: it mutates the
child set of members the actor is explicitly forbidden from referencing.
`familyMember.addSibling.test.js` never covers a target whose parents lie
outside the actor's scope.

**Fix:** Validate the inherited parent ids against the same scope, mirroring
`addChild`:

```js
return models.User.sequelize.transaction(async (t) => {
  const target = await models.FamilyMember.findByPk(targetId, { transaction: t });
  if (!target) throw new Error('Family member not found.');
  if (target.motherId == null && target.fatherId == null) {
    throw new Error('Add a parent first — siblings are derived from a shared parent.');
  }

  if (!isAdmin) {
    const inherited = [target.motherId, target.fatherId].filter((id) => id != null);
    if (!inherited.every((id) => scope.ids.has(Number(id)))) {
      throw new Error('You may only reference relatives already within your editable scope.');
    }
  }
  ...
});
```

(`scope` must be hoisted out of the `if (!isAdmin)` block, as `addChild` already
does.) Add tests for both the co-parent case and the spouse's-parents case.

---

### CR-03: Effective max query depth of 100 provides no protection on a mutually recursive schema

**File:** `backend/src/config/env.js:26`; `backend/src/graphql/serverConfig.js:24-29`
**Issue:**
`MAX_QUERY_DEPTH` is set in **none** of `env/local.env`, `env/local.container.env`,
`env/remote.env`, `env/test.env`, so `env.maxQueryDepth` is always the fallback
`100` — in production included.

`FamilyMember` is mutually recursive across five fields
(`familyMember.schema.js:25-30`): `mother`, `father`, `children`, `spouses`,
`siblings`. A single 100-level alternating selection —

```graphql
query { familyMember(id: 1) { mother { children { mother { children { ... } } } } } }
```

— amplifies a handful of rows into an exponentially large response and an
exponential number of resolver invocations. DataLoader bounds the *SQL query*
count per level (as `familyMember.queryCount.test.js` proves), but it does not
bound response materialization, which is the actual amplification vector. There
is no cost analysis, no alias limit, no breadth limit, and `familyMember` is
absent from `RATE_LIMITS` (`backend/src/config/rateLimits.js`), so the request is
unauthenticated-adjacent-cheap and infinitely repeatable by any linked user.

The tests confirm the rule is *installed* (`queryDepth.test.js:46-53`,
`queryCount.test.js:81-92` both probe `maxQueryDepth + 10`), but by construction
they can never fail regardless of how permissive the limit is.

**Fix:** Set a limit that reflects the documented tree shape (~10-23 generations,
so ~8-12 selection levels is generous for a UI), and pin it explicitly rather than
relying on a fallback:

```js
maxQueryDepth: Number(process.env.MAX_QUERY_DEPTH ?? 12),
```

Add `MAX_QUERY_DEPTH=12` to every `env/*.env`. Rewrite the depth tests to assert
against a fixed literal (e.g. reject at 13, accept at 12) instead of
`env.maxQueryDepth + 10`, so a future loosening of the limit fails the suite. Also
add `familyMember`/`familyMembers` to `RATE_LIMITS`, and consider a
breadth/complexity rule (`@escape.tech/graphql-armor-max-aliases`,
`-max-directives`, or a cost-limit rule) alongside max-depth.

---

### CR-04: Depth limit fails open on a malformed `MAX_QUERY_DEPTH`, and silently ignores `0`

**File:** `backend/src/config/env.js:26`
**Issue:**

```js
maxQueryDepth: Number(process.env.MAX_QUERY_DEPTH || 100),
```

Two defects in one line:

- `MAX_QUERY_DEPTH="unlimited"` (or any typo, or a trailing space in a `.env`
  value that the parser preserves) yields `NaN`. `maxDepthRule({ n: NaN })`
  compares `depth > NaN`, which is always `false` — **the depth limit is silently
  and completely disabled**, with no startup error and no log line. A security
  control that fails open on a config typo is worse than none, because it looks
  configured.
- `MAX_QUERY_DEPTH=0` is falsy, so `||` discards it and substitutes `100`. The
  operator's intent (reject everything) is silently inverted into the most
  permissive setting.

This directly contradicts the codebase's own fail-fast convention for
security-relevant config (`assertProductionSecrets`, `assertProductionMailConfig`,
invoked at `env.js:41-47`).

**Fix:** Parse strictly and fail fast:

```js
function requiredPositiveInt(raw, fallback, name) {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, received: ${JSON.stringify(raw)}`);
  }
  return value;
}
...
maxQueryDepth: requiredPositiveInt(process.env.MAX_QUERY_DEPTH, 12, 'MAX_QUERY_DEPTH'),
```

Add a unit test asserting that `MAX_QUERY_DEPTH=abc` throws at config load.

---

## Warnings

### WR-01: The permission check never shares a transaction with the write it authorizes

**File:** `backend/src/services/familyMember.service.js:108`; `backend/src/resolvers/familyMember.resolver.js:51, 83, 114, 158, 194`
**Issue:** `computeEditableScope(memberId, { transaction } = {})` threads a
transaction into all five of its reads — but **no caller anywhere passes one**.
Every resolver computes the scope on the autocommit connection *before* opening
`models.User.sequelize.transaction(...)`:

```js
const scope = await computeEditableScope(user.familyMemberId);  // no transaction
if (!scope.ids.has(targetId)) throw ...
return models.User.sequelize.transaction(async (t) => { ... });  // separate snapshot
```

The `{ transaction }` parameter is therefore dead code, and the check-then-write
window is a genuine TOCTOU: a concurrent admin `deleteMember` or `addParent`
(which rewrites a parent FK, line 63-68) can remove a member from the scope
between the check and the write, and the write still lands.

**Fix:** Open the transaction first and pass it through:

```js
return models.User.sequelize.transaction(async (t) => {
  if (!isAdmin) {
    const scope = await computeEditableScope(user.familyMemberId, { transaction: t });
    if (!scope.ids.has(targetId)) throw new Error('This member is outside your editable scope.');
  }
  ...
});
```

If the option is genuinely never going to be used, delete it rather than leaving a
parameter that implies a guarantee the code does not provide.

### WR-02: `editMember` performs no transaction at all; the D-06 field-lock is a racy read

**File:** `backend/src/resolvers/familyMember.resolver.js:187-210`
**Issue:** Unlike the other four mutations, `editMember` never opens a
transaction. Three separate round-trips run under autocommit: the scope
computation (line 194), the `findByPk` with `linkedUser` include (line 200), and
`target.update(...)` (line 209). The D-06 field-lock decision — the whole point of
line 205 — is evaluated against a snapshot that can be stale by the time the
update executes (e.g. an admin runs `linkUserToMember` concurrently). The
mutation can also partially observe a member that another mutation is
concurrently rewriting.

**Fix:** Wrap the read, the lock check and the update in one transaction, and take
a row lock on the target:

```js
return models.User.sequelize.transaction(async (t) => {
  const target = await models.FamilyMember.findByPk(targetId, {
    include: [{ association: 'linkedUser' }],
    lock: t.LOCK.UPDATE,
    transaction: t
  });
  ...
  return target.update(sanitizeNewMember(fields), { transaction: t });
});
```

### WR-03: `addChild` permits the same member as both mother and father

**File:** `backend/src/resolvers/familyMember.resolver.js:106-146`
**Issue:** Nothing rejects `otherParentId === memberId`. `slot` and `otherSlot`
are always different keys, so the resulting row gets
`motherId === fatherId === targetId`. That member then appears as their own
child's mother *and* father, and — via `computeEditableScope`'s either-parent
sibling rule (`familyMember.service.js:136-146`) and the `siblings` field resolver
(`familyMember.resolver.js:241-258`) — corrupts sibling derivation for every
other child of that member. The `Spouse` model has an explicit
`notSelfMarriage` validator (`backend/src/models/Spouse.js`); the parent path has
no equivalent.

**Fix:** Reject early, alongside the existing scope check:

```js
if (otherId != null && otherId === targetId) {
  throw new Error('A member cannot be recorded as both parents of the same child.');
}
```

### WR-04: Admin `addParent` silently orphans the previously linked parent

**File:** `backend/src/resolvers/familyMember.resolver.js:63-68`; `backend/src/services/familyMember.service.js:41-45`
**Issue:** The already-filled-slot guard is `if (target[slot] != null && !isAdmin)`.
For an admin, `linkParent` overwrites the FK unconditionally. The previously
linked parent row is **not** deleted and **not** reported — it silently becomes an
unreachable orphan (no children, possibly no parents), invisible in the tree UI
but still present in `Query.familyMembers`. `familyMember.addParent.test.js:127-148`
asserts the overwrite succeeds but never checks what happened to `existingMother`.
Over time this accumulates undetectable garbage rows and, because such orphans
have no parents and no children, they satisfy `isMarriedInOnly` and can be
cascade-deleted later by an unrelated `deleteMember`.

**Fix:** Either require an explicit `replace: Boolean` argument and return/report
the displaced member id, or reject the overwrite for admins too and require an
explicit unlink mutation. At minimum, extend the admin test to assert the intended
fate of the displaced row so the behaviour is pinned rather than incidental.

### WR-05: `wouldCreateCycle` fails open past 100 levels and re-visits frontier nodes

**File:** `backend/src/services/familyMember.service.js:4-31`
**Issue:** Two defects:

- The loop terminates at `MAX_DEPTH = 100` and then `return false` — i.e.
  "no cycle" — even though the search was truncated. A cycle deeper than 100
  ancestor levels (reachable if a cycle already exists in the data, since
  traversal then never terminates naturally) is reported as safe. A truncated
  safety check must fail closed, not open.
- `visited` is populated from `frontier` *after* `next` has already been built
  (lines 21-27), so a node in the current frontier can be re-added to `next` and
  re-queried on the following iteration. With an existing cycle this burns all
  100 iterations on repeated queries.

Note also that in this phase the function is effectively unreachable: `linkParent`
is only ever called from `addParent` with a **freshly created** parent
(`familyMember.resolver.js:67-68`), which can never be an ancestor. The protection
is untested by any Phase 14 test.

**Fix:**

```js
for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
  if (frontier.includes(childId)) return true;
  frontier.forEach((id) => visited.add(id));   // mark BEFORE computing next
  const rows = await models.FamilyMember.findAll({ ... });
  const next = new Set();
  for (const row of rows) { ...only if !visited.has(...) }
  frontier = [...next];
}
if (frontier.length > 0) {
  throw new Error('Ancestry check exceeded the maximum supported depth.');  // fail closed
}
return false;
```

### WR-06: `computeEditableScope` resolves the wrong spouse if `memberId` is a string

**File:** `backend/src/services/familyMember.service.js:149`
**Issue:**

```js
const spouses = spouseRows.map((row) => (row.memberAId === memberId ? row.memberB : row.memberA));
```

`===` against a Sequelize `INTEGER.UNSIGNED` column. Every resolver in this phase
defensively normalizes ids with `Number(...)` (lines 47, 79, 109, 154, 190, 220 of
`familyMember.resolver.js`), and the loaders normalize with
`cacheKeyFn: String(key)` — but `computeEditableScope` normalizes nothing. If
`memberId` ever arrives as a string, `"5" === 5` is `false`, the map silently
returns `row.memberA` (which *is* self), and the actual spouse drops out of
`scope.ids` — a permission check that fails **closed but wrongly**, denying
legitimate edits with a confusing message. Today it is latent (callers pass
`user.familyMemberId`), but it is the exact class of bug the rest of the phase
guards against.

**Fix:**

```js
export async function computeEditableScope(rawMemberId, { transaction } = {}) {
  if (rawMemberId == null) return { ids: new Set(), self: null, parents: [], spouses: [], children: [], siblings: [] };
  const memberId = Number(rawMemberId);
  if (!Number.isInteger(memberId)) return { ids: new Set(), ... };
  ...
```

Add a scope test that passes `String(self.id)` and asserts the same result.

### WR-07: Non-numeric `ID` arguments surface a raw driver error to admins

**File:** `backend/src/resolvers/familyMember.resolver.js:47, 79, 109, 122, 154, 190, 220`
**Issue:** GraphQL `ID` accepts arbitrary strings, so `Number(memberId)` yields
`NaN` for `memberId: "abc"`. Non-admins are shielded incidentally
(`scope.ids.has(NaN)` is `false` → clean scope error), but for an ADMIN the `NaN`
flows straight into `models.FamilyMember.findByPk(NaN)`, producing a raw
mysql2/Sequelize error rather than the intended `'Family member not found.'`.
Apollo surfaces the message, leaking SQL/driver internals.

**Fix:** Add a shared coercion helper used by every id argument:

```js
function toMemberId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error('Family member not found.');
  return id;
}
```

### WR-08: All member PII is readable by any linked user, over an enumerable id space

**File:** `backend/src/schemas/familyMember.schema.js:13-31`; `backend/src/resolvers/familyMember.resolver.js:17-20`
**Issue:** Separately from CR-01, `FamilyMember` exposes `email`, `phone`,
`address`, `birthdate` and `deathdate`, and `Query.familyMember(id: ID!)` admits
any linked USER for **any** id. Ids are sequential integers, so one user can walk
the entire directory of contact details, including for members far outside their
editable scope. The phase carefully bounds *write* scope but leaves *read* scope
completely unbounded — if that asymmetry is intentional it is undocumented in the
schema and untested for the non-admin actor.

**Fix:** Decide and encode the read policy explicitly. Either document the tree as
intentionally readable family-wide (and add a non-admin regression test asserting
that), or restrict contact fields to `scope.ids` members plus admins.

### WR-09: The service layer binds module-scope `models`, diverging from the resolver convention

**File:** `backend/src/services/familyMember.service.js:2` (used at 15, 45, 49, 54, 57, 83, 90, 94, 113, 122, 124, 129, 137, 164, 186, 197, 202)
**Issue:** Resolvers consistently take `models` from the Apollo context
(`(_parent, args, { models, user })`), while every service function reaches for
the module-level singleton import. The two happen to be the same object today, so
the divergence is invisible — until someone swaps the context's `models` (for
multi-tenancy, a read replica, or test injection) and the service silently keeps
using the singleton. It also makes the service untestable without hitting the real
database.

**Fix:** Accept `models` as an explicit parameter (or pass it in the options
object alongside `transaction`) and have resolvers forward `context.models`.

### WR-10: `deleteMember` existence check races with the delete; a no-op still returns `true`

**File:** `backend/src/resolvers/familyMember.resolver.js:218-227`; `backend/src/services/familyMember.service.js:162-204`
**Issue:** The resolver's `findByPk` runs outside the service's transaction, and
`deleteFamilyMember` never inspects the destroy result:

```js
const target = await models.FamilyMember.findByPk(targetId);   // outside the txn
if (!target) throw new Error('Family member not found.');
await deleteFamilyMember(targetId);                             // opens its own txn
return true;                                                     // always
```

Two concurrent admin deletes both pass the existence check; the second destroys
0 rows and still returns `true`. `target` is also fetched purely to be
null-checked and then discarded — a redundant query.

**Fix:** Move the existence check inside the service transaction and return the
affected-row count:

```js
const destroyed = await models.FamilyMember.destroy({ where: { id: memberId }, transaction });
if (destroyed === 0) throw new Error('Family member not found.');
```

### WR-11: `familyMember.resolver.js` imports a shared utility from `user.resolver.js`

**File:** `backend/src/resolvers/familyMember.resolver.js:2`
**Issue:** `sanitizeNewMember` is imported from a *sibling resolver module*. Two
resolver modules are now coupled purely to share an input-normalization helper,
and importing `user.resolver.js` transitively pulls in the mailer, password
policy, and token utilities. The codebase's own convention (per CLAUDE.md) puts
shared helpers in `utils/` or `services/`, not in resolver files. It also
constrains `sanitizeNewMember`'s naming: it is applied to `EditFamilyMemberInput`
in `editMember` (line 209) despite the "NewMember" name.

**Fix:** Move `sanitizeNewMember` and `OPTIONAL_FAMILY_MEMBER_FIELDS` to
`backend/src/utils/familyMemberInput.js` (or
`services/familyMember.service.js`), rename to `sanitizeMemberInput`, and import
it from both resolvers.

### WR-12: Test-harness defects: duplicated helper, un-stopped server, ADMIN-only relationship coverage

**File:** `backend/src/loaders/familyMember.loaders.test.js:8-20`; `backend/src/services/familyMember.queryCount.test.js:12-24`; `backend/test/helpers.js:10`; `backend/src/resolvers/familyMember.relationships.test.js:22-24`
**Issue:**

- `countQueries` is duplicated **verbatim** across two test files. It also mutates
  global `sequelize.options.logging`, which is unsafe under any future parallel
  execution (currently masked by `fileParallelism: false` in `vitest.config.js`).
- `backend/test/helpers.js:10` constructs a module-level `ApolloServer` that is
  never `stop()`ed, and line 6 imports `src/server.js`, whose top-level
  `await initializeDatabase()` runs as an import side effect and duplicates
  `globalSetup.js`'s sync. Leaked handles here surface as flaky teardown.
- `familyMember.relationships.test.js` acts as ADMIN in every single case
  (`makeAdmin()`), so the non-admin read path — where CR-01 and WR-08 live — has
  no coverage at all.

**Fix:** Extract `countQueries` into `backend/test/countQueries.js` and import it
from both files; add `afterAll(() => server.stop())` in `helpers.js`; add
non-admin cases to `familyMember.relationships.test.js` covering `familyMember`
and `linkedUser`.

---

_Reviewed: 2026-07-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
