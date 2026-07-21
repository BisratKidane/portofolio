---
phase: 12-family-data-model-foundation
reviewed: 2026-07-21T19:35:51Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - backend/src/models/FamilyMember.js
  - backend/src/models/FamilyMember.test.js
  - backend/src/models/FamilyMember.associations.test.js
  - backend/src/models/FamilyMember.cycle.test.js
  - backend/src/models/FamilyMember.delete.test.js
  - backend/src/models/Spouse.js
  - backend/src/models/Spouse.test.js
  - backend/src/models/database.test.js
  - backend/src/models/index.js
  - backend/src/services/familyMember.service.js
  - backend/test/helpers.js
findings:
  critical: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-21T19:35:51Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the first family-data-model slice: `FamilyMember` and `Spouse` Sequelize models, the association wiring in `models/index.js`, the `familyMember.service.js` graph/transaction logic, and the accompanying test suite plus `test/helpers.js`.

The core algorithms are largely correct. The cycle-detection ancestor walk (`wouldCreateCycle`) correctly walks *up* from the candidate parent looking for the child, which is the right direction to prove an ancestor cycle; the transactional `deleteMember` orders spouse-join deletion before member deletion so the non-cascading `Spouse` FK never violates, and it correctly bounds married-in cleanup to one hop. The Spouse canonical-ordering hook plus the `(memberAId, memberBId)` unique index and `notSelfMarriage` validator form a coherent, well-tested edge model.

No BLOCKER-severity defects were found — nothing breaks the behavior this phase ships or the tests exercising it. However, several WARNINGs represent latent correctness and reliability risks that will bite as soon as GraphQL resolvers (string `ID` scalars), deeper trees, or concurrent writes are wired on top of this foundation, plus one genuine data-loss footgun in the married-in deletion heuristic. Fix these before the resolver layer lands on top.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: ID strict-equality/`includes` breaks silently when called with string IDs

**File:** `backend/src/services/familyMember.service.js:6-13, 98-100`
**Issue:** The service compares IDs with `===` and `Array.prototype.includes`, both of which are type-strict. DB primary keys are `INTEGER.UNSIGNED` and come back as JS numbers, but GraphQL's `ID` scalar serializes/deserializes as a **string**. When resolvers (next phase) pass `args.id` straight through:
- `wouldCreateCycle("5", "5")` → `childId === candidateParentId` is `true` (string==string, fine), but the graph walk uses `frontier.includes(childId)` where `frontier` holds numeric IDs from the DB. `[5].includes("5") === false`, so **a real cycle is not detected** and the invalid parent link is allowed — a data-integrity failure.
- In `deleteMember`, `row.memberAId === memberId` (number `=== "5"`) is always `false`, so the "partner" is mis-selected (always `memberAId`), corrupting the partner set and potentially deleting/keeping the wrong member.

The current tests pass only because they call these functions with numeric `.id` values directly. This is latent but concrete.
**Fix:** Coerce IDs to numbers at the service boundary, e.g. at the top of each exported function:
```js
export async function wouldCreateCycle(childId, candidateParentId) {
  childId = Number(childId);
  candidateParentId = Number(candidateParentId);
  ...
}
```
Apply the same normalization in `linkParent`, `setSpouse`, `getSpouseRows`, and `deleteMember`, or add a shared `toId()` helper.

### WR-02: `deleteMember` married-in heuristic can silently delete a childless blood root ("founder couple" data loss)

**File:** `backend/src/services/familyMember.service.js:79-89, 104-127`
**Issue:** `isMarriedInOnly` classifies a member as married-in (and therefore eligible for cascade deletion) using only "no parents **and** no children." A blood-line **root** who simply has no children *yet* satisfies this exact condition. Concretely: two founding ancestors are created as roots and married to each other; before any child is added, deleting one root will classify the other root as "married-in only" and **delete it too**. This is silent, unrecoverable data loss of a legitimate blood member. (The test at `FamilyMember.delete.test.js:60-82` actually encodes this behavior as intended, so it will not be caught.)
**Fix:** The "no parents" signal is insufficient to distinguish a married-in spouse from a not-yet-connected root. Track lineage membership explicitly (e.g., a `isBloodline`/`rootAncestor` flag, or require confirmation) rather than inferring it, or at minimum require that a married-in candidate have *zero other structural connections and* be flagged non-root. If the current semantics are truly intended, document the destructive edge prominently and gate it behind an explicit confirmation at the resolver layer.

### WR-03: `resetTables` sets `FOREIGN_KEY_CHECKS=0` on one pooled connection but truncates on possibly different ones

**File:** `backend/test/helpers.js:24-35`
**Issue:** `SET FOREIGN_KEY_CHECKS = 0` is **session-scoped** (per MySQL connection). It is issued via `sequelize.query(...)`, which acquires one connection from the pool; the following `models.Spouse/FamilyMember/User.destroy({ truncate: true })` calls each independently acquire a connection from the pool (default `pool.max = 5`, `config/database.js` sets no pool override). If a `TRUNCATE` runs on a connection where FK checks are still enabled, it fails because `family_members` is self-referenced and referenced by `spouses`. This makes the shared test-reset primitive order/pool-dependent and flaky — directly undermining the milestone's "tests fail loudly and reliably" goal. It currently passes largely by luck of MRU connection reuse under serial (`fileParallelism: false`) execution.
**Fix:** Run the whole reset on a single connection/transaction, e.g.:
```js
export async function resetTables() {
  await sequelize.transaction(async (t) => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
    await models.Spouse.destroy({ where: {}, truncate: true, transaction: t });
    await models.FamilyMember.destroy({ where: {}, truncate: true, transaction: t });
    await models.User.destroy({ where: {}, truncate: true, transaction: t });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
  });
}
```
(Note: `TRUNCATE` auto-commits in MySQL, so also consider plain `DELETE` inside the transaction, or pin the test pool to `max: 1`.)

### WR-04: `MAX_DEPTH` bound can produce a false-negative cycle result; boundary frontier is never checked

**File:** `backend/src/services/familyMember.service.js:4, 12-13`
**Issue:** The `visited` set already guarantees termination on any DAG (and even on already-corrupt cyclic data), so `MAX_DEPTH` adds no safety — it only introduces a way to **miss a cycle**. If an ancestor chain exceeds `MAX_DEPTH` (100) generations, `wouldCreateCycle` returns `false` (no cycle) and permits an invalid ancestor link. Additionally there is a boundary off-by-one: `frontier.includes(childId)` is checked at the *start* of each iteration, so the frontier built on the final iteration (`depth === MAX_DEPTH - 1`) is populated but never tested — the deepest reachable ancestors are effectively skipped. For the documented 10–23 generation tree this is currently harmless, but it is silent incorrectness with no compensating benefit.
**Fix:** Since `visited` already bounds the walk, either drop `MAX_DEPTH` entirely, or convert an exceeded-depth condition into a thrown error (fail-closed) rather than a silent `return false`. Move/duplicate the `frontier.includes(childId)` check so the final frontier is also inspected before returning `false`.

### WR-05: `linkParent` cycle check and update are not atomic (TOCTOU)

**File:** `backend/src/services/familyMember.service.js:32-45`
**Issue:** `wouldCreateCycle` performs several `SELECT`s against committed state, then `linkParent` issues a separate `UPDATE`, all outside a transaction. A concurrent write that alters ancestry between the check and the update can let a cycle slip through, or make the check read stale data. Even single-request, the two-phase read-then-write has no locking. Given this is the sole guardrail against cyclic ancestry, the check should share a transaction/lock with the write it protects.
**Fix:** Wrap the check + update in one `sequelize.transaction`, pass the `transaction` into `wouldCreateCycle`'s queries, and consider `SELECT ... FOR UPDATE` (or a row lock on the child) so the ancestry snapshot the check relied on cannot change before the write commits.

### WR-06: Required name fields accept empty strings

**File:** `backend/src/models/FamilyMember.js:13-20`
**Issue:** `firstname` and `lastname` use `allowNull: false` but no `notEmpty` validator. Sequelize's `allowNull` only rejects `null`/`undefined`, not `''`. A member created with `firstname: '', lastname: ''` passes validation, yielding a blank record whose `fullname` VIRTUAL is `" "` (a single space). The `required fields` tests only assert presence, not non-emptiness, so this gap is uncovered.
**Fix:** Add validators to both required string fields:
```js
firstname: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
lastname:  { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
```

## Info

### IN-01: Redundant `isIn` validator duplicates the ENUM constraint

**File:** `backend/src/models/FamilyMember.js:21-25`
**Issue:** `gender` is `DataTypes.ENUM('Male','Female','Other')` and *also* carries `validate: { isIn: [['Male','Female','Other']] }`. The ENUM already rejects out-of-set values at the DB and instance level; the `isIn` list is a second source of truth that must be kept in sync manually.
**Fix:** Drop the `isIn` validator, or factor the allowed list into a shared constant referenced by both the ENUM and any validator to avoid drift.

### IN-02: `noFutureDates` uses UTC "today", which can reject a locally-valid date

**File:** `backend/src/models/FamilyMember.js:68-76`
**Issue:** `new Date().toISOString().slice(0, 10)` yields the current **UTC** date. For users in timezones ahead of UTC, a birthdate/deathdate set to their local "today" may be one calendar day ahead of UTC "today" and get rejected as "in the future." Low impact but a real off-by-one-day edge.
**Fix:** Acceptable to defer, but consider computing "today" in the app's intended timezone, or allowing a one-day tolerance, if user-entered dates near the current day are expected.

### IN-03: Redundant first-iteration `frontier.includes(childId)` check

**File:** `backend/src/services/familyMember.service.js:9-13`
**Issue:** The self-assignment case (`childId === candidateParentId`) is already handled by the early return on line 7, so on the first loop iteration `frontier` is `[candidateParentId]` and the `includes(childId)` check is always false — dead on the first pass. Harmless, but slightly obscures intent.
**Fix:** No action required; noted for clarity. If addressed alongside WR-04's boundary fix, restructure so the check unambiguously covers every generated frontier.

---

_Reviewed: 2026-07-21T19:35:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
