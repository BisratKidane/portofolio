---
phase: 15-sibling-dedup-guard-manage-self-service-ui
reviewed: 2026-07-23T20:16:08Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - backend/src/services/familyMember.service.js
  - frontend/src/App.jsx
  - frontend/src/components/manage/AddRelativeDialog.jsx
  - frontend/src/components/manage/AdminMemberTable.jsx
  - frontend/src/components/manage/EditMemberDialog.jsx
  - frontend/src/components/manage/MemberCard.jsx
  - frontend/src/components/manage/RelationshipGroupedPanel.jsx
  - frontend/src/pages/AdminLinkMembers.jsx
  - frontend/src/pages/ManagePage.jsx
findings:
  critical: 1
  critical_resolved: 1
  warning: 4
  info: 4
  total: 9
status: critical_resolved
resolved:
  - CR-01
---

# Phase 15: Code Review Report

**Reviewed:** 2026-07-23T20:16:08Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the REL-06 dedup guard in `familyMember.service.js` and the eight `/manage`
frontend files. The dedup guard's row-locking and comparison logic (D-08/D-09) are
correctly implemented in isolation, and the service-level test suite
(`familyMember.dedup.test.js`) proves the guard is race-safe *when the transaction's
first statement is the guard's own locking read*. However, tracing the guard's actual
callers (`familyMember.resolver.js`'s `addChild`/`addSibling` mutations — imported by
and directly relevant to the reviewed service file) shows every real GraphQL call
performs a plain, non-locking `findByPk` read *before* handing the same transaction to
the guard. Under MySQL's default REPEATABLE READ isolation, that earlier plain read
fixes the transaction's consistent-read snapshot before the guard's row lock is even
acquired, so the guard's own duplicate-check query can still read stale data despite
the lock working correctly. This reopens the exact TOCTOU race D-10 was written to
close, and it is invisible to the current test suite because the service-level test
calls `addChild()` directly (with no leading plain read), not through the resolver
path production traffic actually uses.

The `/manage` UI is otherwise solid: route gating, scope computation, and the
member/admin branch split match the locked decisions in `15-CONTEXT.md`. Several
warnings remain around a reachable "self not found" crash path, a proactively-missing
D-05 inline message, admin self-delete exposure, and pagination staleness — none of
these are security-critical but they degrade robustness/UX and should be fixed.

## Critical Issues

### CR-01: REL-06's TOCTOU guard is defeated by a plain read earlier in the same transaction on the real GraphQL call path

> **✅ RESOLVED (2026-07-23, test-first).** The guard's duplicate-check `findOne` now
> uses `lock: t.LOCK.UPDATE`, so it reads the latest-committed rows regardless of any
> plain read that fixed the transaction snapshot earlier (as the addChild/addSibling
> resolvers do via `findByPk`). A deterministic regression test reproducing the exact
> resolver-path race was added to `familyMember.dedup.test.js` (RED before the fix,
> GREEN after). The `mother`/`father` `include` was dropped from the check (FOR UPDATE +
> outer join would lock parent rows); the shared parent's name is fetched separately
> only when a conflict exists. Commits: `test(15-01): reproduce CR-01 …` → `fix(15-01):
> make REL-06 dedup check a locking read (CR-01)`. Full backend suite: 281/281 green.

**File:** `backend/src/services/familyMember.service.js:52-94` (the `run` function implementing the guard), read together with the call sites in `backend/src/resolvers/familyMember.resolver.js:131-145` (`addChild` mutation) and `:165-192` (`addSibling` mutation).

**Issue:**

The guard's locking strategy (lines 60-64) is:
```js
await models.FamilyMember.findAll({
  where: { id: parentIds },
  lock: t.LOCK.UPDATE,
  transaction: t
});
```
followed by a **plain** (non-locking) `findOne` for the duplicate-name check (lines 70-82). The design intent (per the code's own comment, lines 55-59, and D-10) is that this locking read is what "closes the TOCTOU race a bare SELECT-then-INSERT would leave open," and the service-level test
(`familyMember.dedup.test.js`, "D-10 TOCTOU proof") confirms this — but only because in that test, `addChild()` is called directly with no caller-supplied transaction, so `run()`'s own `FOR UPDATE` read is the *first* statement executed inside the freshly-opened transaction.

That is not what happens on the real GraphQL mutation path. `familyMember.resolver.js`'s `addChild` resolver does:
```js
return models.User.sequelize.transaction(async (t) => {
  const target = await models.FamilyMember.findByPk(targetId, { transaction: t }); // plain read, no lock
  ...
  return addChild(attrs, { transaction: t }); // -> run(attrs, t) directly, since a transaction was supplied
});
```
(same pattern in `addSibling`, resolver.js:166,191). `models.User.sequelize` and the `sequelize` instance imported into `familyMember.service.js` are the same singleton (`backend/src/models/index.js:1,57`), so this is genuinely the same transaction/connection.

Under MySQL's default REPEATABLE READ isolation (not overridden anywhere — `backend/src/config/database.js` sets no isolation level), a transaction's consistent-read snapshot is established at the **first plain (non-locking) read**, not at BEGIN and not by locking reads. Here, `findByPk(targetId)` is that first plain read, and it executes *before* the guard's row lock is even attempted. The subsequent `FOR UPDATE` lock in `run()` still works correctly as a lock (it blocks a second concurrent transaction targeting the same parent), but once unblocked, the guard's own duplicate-check `findOne` (also a plain read, line 70) reuses the snapshot that was already fixed by the earlier `findByPk` — a snapshot taken *before* the lock wait, which can predate the concurrent transaction's commit. The guard can therefore still miss a sibling row a concurrent request just committed, and two duplicate children can be created by two genuinely concurrent GraphQL `addChild`/`addSibling` calls — exactly the scenario D-10 exists to prevent.

This is not caught by any existing test: `familyMember.dedup.test.js` only exercises the service function directly (no leading plain read in the same transaction), and neither `familyMember.addChild.test.js` nor `familyMember.addSibling.test.js` contains a concurrency test through the resolver/GraphQL layer (confirmed: no `Promise.all`/`allSettled`/`concurrent` in either file).

**Fix:** Make the guard's locking read the transaction's first statement regardless of caller, or upgrade every plain pre-read that shares the guard's transaction to a locking read. Two viable approaches:
1. Move the row-lock acquisition to the very top of the resolver, before any other read in the same transaction:
```js
// familyMember.resolver.js addChild/addSibling, before `findByPk(targetId)`:
await models.FamilyMember.findAll({
  where: { id: [targetId, otherId].filter((v) => v != null) },
  lock: t.LOCK.UPDATE,
  transaction: t
});
```
2. Or, simpler and self-contained to the reviewed file: have every plain read in `run()`'s call chain that precedes the guard use `lock: t.LOCK.UPDATE` too (i.e. have the resolver call a service-exported "lock and load" helper instead of `findByPk` directly), so no plain/consistent read occurs before the guard's own lock in any code path.
Add a resolver-level (or `executeOperation`-level) concurrency test analogous to the existing service-level "D-10 TOCTOU proof" test, calling the `addChild` GraphQL mutation twice concurrently through the same code path production traffic uses, to catch regressions here.

## Warnings

### WR-01: `groupByRelation` crashes with a non-actionable error if the acting user's own record is momentarily absent from `myEditableMembers`

**File:** `frontend/src/pages/ManagePage.jsx:90-91, 134-136`

**Issue:** `refetch()`'s `.then()` callback does:
```js
const self = fetchedRows.find((row) => row.id === user.familyMemberId);
setRows(fetchedRows);
setScope(groupByRelation(fetchedRows, self));
```
and `groupByRelation(rows, self)` immediately does `self.mother?.id` (line 91) — note `self` itself is accessed unguarded (only `.mother` is optional-chained). If `self` is `undefined` — which happens whenever `myEditableMembers` doesn't include a row matching `user.familyMemberId` (e.g. a stale client-side `AuthContext.user` still carries a `familyMemberId` for a record an admin has since deleted via the new admin delete flow in this same phase, which nulls the DB column via ON DELETE SET NULL but does not proactively refresh the in-memory `user` object) — this throws a raw `TypeError` inside the `.then()` callback. It is caught by the chained `.catch((err) => setPageError(err.message))`, so the page does not hard-crash, but the user sees a confusing raw JS error message (e.g. "Cannot read properties of undefined (reading 'mother')") instead of a clear "you're no longer linked to a family record" message or a redirect to `/pending`.

**Fix:** Guard against a missing self row explicitly and surface an actionable message:
```js
const self = fetchedRows.find((row) => row.id === user.familyMemberId);
if (!self) {
  setPageError('Your family record could not be found. Please refresh or contact an administrator.');
  return;
}
setRows(fetchedRows);
setScope(groupByRelation(fetchedRows, self));
```

### WR-02: D-05's "add a parent first" rejection is only ever surfaced reactively, after a full form submission, not proactively

**File:** `frontend/src/components/manage/RelationshipGroupedPanel.jsx:86-95`, `frontend/src/components/manage/AddRelativeDialog.jsx` (entire file has no awareness of the target's parent state)

**Issue:** 15-CONTEXT.md D-05 states: "Surface Phase 14 D-04's 'add a parent first' rejection as an inline message when the actor has no parent recorded." The Siblings section unconditionally renders `+ Add sibling` (line 87) regardless of whether `scope.parents.length === 0`, and `AddRelativeDialog` has no `parents`/`scope` prop at all — the only way the "add a parent first" message reaches the user is by opening the dialog, filling in every required field (first name, last name, gender), clicking submit, and receiving the backend's rejection inside the dialog's error `Alert`. This is confirmed by `AddRelativeDialog.test.jsx:307-308`, which only tests the reactive (post-submit) path. This technically satisfies "surface ... as an inline message" but not the proactive intent — a member with no recorded parent has no indication until after completing the whole form that the action is impossible.

**Fix:** Pass `scope.parents.length === 0` (or equivalent) down to `RelationshipGroupedPanel`/the Siblings `SectionHeading`, and either disable the `+ Add sibling` button with a tooltip, or render the inline message directly in the Siblings section (as D-01's "derived" framing already does for the empty-siblings case at lines 88-91) instead of only inside the dialog after a wasted submission.

### WR-03: Admin table pagination is not reset/clamped when the underlying `members` list shrinks or grows

**File:** `frontend/src/components/manage/AdminMemberTable.jsx:16-24`

**Issue:** `page` is local `useState` that is only reset to `0` on search change (`handleSearchChange`, line 28) or rows-per-page change (line 37). It is never reset when the `members` prop itself changes size — which now happens routinely in this phase, since `ManagePage.jsx`'s `AdminBranch` calls `refetchMembers()` after every add/delete (lines 400, 480, 490). If an admin is on, say, page 3 of a filtered/paginated table and then deletes a member (or the list otherwise shrinks below the current page's row range), `paginated` (line 24) computes an out-of-range slice and the table silently renders as empty/short with no indication why, until the admin manually navigates back a page.

**Fix:** Clamp `page` when `filtered.length` no longer supports it, e.g. via a `useEffect`:
```js
useEffect(() => {
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  if (page > maxPage) setPage(maxPage);
}, [filtered.length, rowsPerPage]); // eslint-disable-line
```

### WR-04: Admin can delete their own linked FamilyMember record from the new table with only a generic confirmation

**File:** `frontend/src/components/manage/MemberCard.jsx:41-45`, `frontend/src/pages/ManagePage.jsx:495-513`

**Issue:** `MemberCard`'s delete/"Remove" button is gated solely on `isAdmin` (line 41: `{isAdmin && (<Button ... onClick={() => onDelete(member)}>Remove</Button>)}`), with no `isSelf` exclusion — unlike the Edit button, which correctly skips rendering for `locked` cards. This phase is the first surface that lets an admin browse the whole tree (`AdminMemberTable`) and focus any row, including their own, into the same panel with delete power. If an admin who is also a linked family member searches/selects themselves, they can click "Remove" and get only the generic confirmation copy ("Remove {name} from the family tree? ... This can't be undone.") with no mention that this will also unlink their own account (`ON DELETE SET NULL` on `User.familyMemberId`). The backend's `deleteMember` resolver (`familyMember.resolver.js:233-242`) enforces no self-delete guard either — `requireAdmin(user)` is the only check.

**Fix:** In `MemberCard`, suppress the Remove button (or require an extra confirmation step) when `isSelf` is true for the acting admin, and/or have the delete-confirmation dialog in `ManagePage.jsx` special-case `deleteTarget.id === user.familyMemberId` with an explicit warning about self-unlinking.

## Info

### IN-01: Relation-type string literals (`'parent'`, `'spouse'`, `'child'`, `'sibling'`) are duplicated across three files with no shared constant

**File:** `frontend/src/components/manage/RelationshipGroupedPanel.jsx:72,77,82,87`, `frontend/src/components/manage/AddRelativeDialog.jsx:51,82-95,106,174`, `frontend/src/pages/ManagePage.jsx:174,441`

**Issue:** These four literal strings form an implicit enum consumed across component boundaries (`onAddRelative(relationType)` → `dialogState.relationType` → `AddRelativeDialog`'s `if/else if` chain and `NEEDS_ROLE` set). A typo in any one of them (e.g. `'sibiling'`) would silently fall through `AddRelativeDialog`'s `handleSubmit` `if/else if` chain without calling any mutation, and `submitting`/`onCreated`/`onClose` would still fire as if it succeeded.

**Fix:** Extract a shared `RELATION_TYPES = { PARENT: 'parent', SPOUSE: 'spouse', CHILD: 'child', SIBLING: 'sibling' }` constant (or add a final `else` branch in `handleSubmit` that throws/logs on an unrecognized `relationType`) so a typo fails loudly instead of silently no-op-succeeding.

### IN-02: Near-identical empty-form shape objects duplicated across three files

**File:** `frontend/src/pages/ManagePage.jsx:78-88` (`EMPTY_LINK_FORM`), `frontend/src/components/manage/AddRelativeDialog.jsx:39-49` (`EMPTY_FORM`), `frontend/src/components/manage/EditMemberDialog.jsx:13-23` (`EMPTY_FORM`)

**Issue:** Three separate modules independently declare the same nine-key shape (`firstname, lastname, gender, mothersname, email, birthdate, deathdate, phone, address`) as a literal object. Any future field addition to `NewFamilyMemberInput`/`EditFamilyMemberInput` requires remembering to update all three in lockstep.

**Fix:** Extract a single shared `EMPTY_FAMILY_MEMBER_FORM` constant/helper (e.g. in a small `frontend/src/components/manage/formDefaults.js`) and import it in all three call sites.

### IN-03: "Other parent" picker for `addChild` offers the entire in-scope set, not just plausible co-parent candidates

**File:** `frontend/src/components/manage/AddRelativeDialog.jsx:176-182`, sourced from `frontend/src/pages/ManagePage.jsx:156-158` (member view) and `:420-422` (admin view)

**Issue:** `inScopeMembers` is built from the full flattened scope (self excluded, but parents/spouses/children/siblings all included), so the "or pick someone already in your family" picker for a new child's "other parent" lets a user select their own child, sibling, or parent as the new child's other parent. The backend (`familyMember.resolver.js` `addChild`) only checks `scope.ids.has(otherId)`, not relationship plausibility, so this would succeed and create a structurally nonsensical tree edge (e.g. a person and their own child jointly parenting a new record). This mirrors an already-accepted permissiveness in the Phase 14 backend design, but this phase is what puts a picker UI in front of it for the first time.

**Fix:** Consider restricting the picker's `options` to `scope.spouses` (the only relationship type that makes semantic sense as "other parent"), falling back to the full in-scope list only if no spouse exists, rather than offering every relative unfiltered.

### IN-04: Row lock in the dedup guard does not canonicalize `parentIds` ordering

**File:** `backend/src/services/familyMember.service.js:53,60-64`

**Issue:** `parentIds = [attrs.motherId, attrs.fatherId].filter((id) => id != null)` preserves caller-supplied order before being passed to the `FOR UPDATE` lock query. Two concurrent `addChild` calls that reference the same two parent ids in reversed slot order (one call's `motherId`/`fatherId` swapped relative to the other's) could theoretically request row locks in different orders. In practice MySQL's primary-key equality-list lookup plan typically acquires such locks in ascending index order regardless of the `IN (...)` list's literal order, which likely avoids a deadlock here, but this is implementation-defined behavior rather than something the code enforces.

**Fix:** Sort `parentIds` before the lock query (e.g. `parentIds.slice().sort((a, b) => a - b)`) to make lock-acquisition order deterministic and independent of query-planner behavior.

---

_Reviewed: 2026-07-23T20:16:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
