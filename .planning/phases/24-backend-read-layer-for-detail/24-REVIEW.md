---
phase: 24-backend-read-layer-for-detail
reviewed: 2026-08-03T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - backend/src/resolvers/familyMember.canEdit.test.js
  - backend/src/resolvers/familyMember.cardFieldCoverage.test.js
  - backend/src/resolvers/familyMember.head.test.js
  - backend/src/resolvers/familyMember.resolver.js
  - backend/src/resolvers/familyMember.search.test.js
  - backend/src/schemas/familyMember.schema.js
  - backend/src/services/familyMember.queryCount.test.js
  - backend/src/services/familyMember.service.js
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-08-03
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase adds the backend read layer for the `/detail` view: a `familyHead`
query (`getFamilyHeadId` service), a `searchFamilyMembers` query, and a
per-member `canEdit` boolean field. The diff was scoped to exactly these
additions (`git diff 6364de2..HEAD`); the surrounding mutation resolvers and
scope logic are pre-existing and were read only as context.

No security vulnerabilities were found. The new search resolver correctly
parameterizes user input via `Op.substring` (no injection), and the recursive
CTE in `getFamilyHeadId` uses a static, non-interpolated SQL string. Auth
guards (`requireFamilyAccess` / `requireAdmin`) are consistently applied at the
top of every new resolver.

However, four correctness/robustness defects warrant attention before ship: an
unvalidated lower bound on the search `limit`, a subtree double-count in the
head-selection CTE, an unescaped `LIKE` wildcard in search terms, and a
`canEdit` field that under-reports edit capability for in-scope non-admin users.

## Warnings

### WR-01: `searchFamilyMembers` has no lower-bound validation on client `limit`

**File:** `backend/src/resolvers/familyMember.resolver.js:59`
**Issue:** `const cap = Math.min(limit ?? SEARCH_RESULT_CAP, SEARCH_RESULT_HARD_MAX);`
only clamps the *upper* bound. A client-supplied `limit` of `0` yields
`Math.min(0, 50) === 0` (nullish coalescing does not replace `0`), silently
returning an empty array for a non-empty search. A negative `limit` (e.g.
`-5`) passes through as `limit: -5` into `findAll`, producing `LIMIT -5`, which
is a MySQL syntax error and surfaces as an unhandled resolver error to the
client. The D-04 comment only documents the ceiling, not the floor.
**Fix:**
```js
const requested = limit ?? SEARCH_RESULT_CAP;
const cap = Math.min(Math.max(1, requested), SEARCH_RESULT_HARD_MAX);
```

### WR-02: `getFamilyHeadId` CTE double-counts descendants reachable through both parents

**File:** `backend/src/services/familyMember.service.js:20-40`
**Issue:** The recursive member joins on
`fm.motherId = d.id OR fm.fatherId = d.id`, so any descendant whose mother
*and* father both trace back to the same apex is inserted into `descendants`
once per path. `COUNT(*)` then inflates that apex's subtree size (and, on
data where many nodes share ancestry, path count multiplies per generation).
This skews the "largest-subtree apex" selection and its tie-break, so
`familyHead` can return the wrong root. This path only runs when id 1 is
absent, limiting real-world exposure, but the selection is still incorrect
when it does run.
**Fix:** De-duplicate nodes per root before counting, e.g. count distinct
descendant ids:
```sql
SELECT d.root_id AS id, COUNT(DISTINCT d.id) AS size
FROM descendants d
JOIN family_members apex ON apex.id = d.root_id
GROUP BY d.root_id, apex.lastname, apex.firstname
ORDER BY size DESC, apex.lastname ASC, apex.firstname ASC
LIMIT 1
```
(Note: `COUNT(DISTINCT)` de-dups the result, but the recursive term can still
enqueue a node multiple times; consider guarding path growth if shared-ancestry
data is expected.)

### WR-03: `canEdit` reports `false` for non-admin users who can actually edit the member

**File:** `backend/src/resolvers/familyMember.resolver.js:353`, `backend/src/schemas/familyMember.schema.js:44`
**Issue:** `canEdit` returns `Boolean(user?.role === 'ADMIN')` for *every*
member. But the `editMember` mutation (same file, lines 245-268) permits a
non-admin USER to edit any member inside their `computeEditableScope` (self,
parents, spouses, children, siblings). A linked USER viewing their own profile
— which they demonstrably can edit — receives `canEdit: false`. A field named
`canEdit` on a member is naturally read by the client as "can the current
viewer edit *this* member", so a scope-aware frontend will hide edit controls
the user is entitled to (or, conversely, mislead about capability). The
canEdit test only asserts admin=true / linked-non-admin=false, so this gap is
uncovered. This may be an intentional D-07/D-08 scoping decision, but the
name/behavior mismatch against the actual `editMember` authorization is a
latent correctness/UX defect and should be reconciled (either make `canEdit`
scope-aware or rename/document it as "admin edit").
**Fix:** Make the field reflect the real authorization the `editMember`
resolver enforces, e.g. reuse `computeEditableScope` for non-admins, or rename
the field to convey admin-only semantics if that is the deliberate contract.

### WR-04: `searchFamilyMembers` does not escape `LIKE` wildcards in the term

**File:** `backend/src/resolvers/familyMember.resolver.js:64-67`
**Issue:** `Op.substring` compiles to `LIKE '%term%'`. The user-supplied
`trimmed` is parameterized (no SQL injection), but `%` and `_` inside the term
are still interpreted as `LIKE` wildcards. Searching for `a_b` matches `axb`,
and a term of a single `%` matches every row up to the cap. This produces
incorrect, surprising matches for any name containing those characters.
**Fix:** Escape LIKE metacharacters before the substring match, e.g.:
```js
const escaped = trimmed.replace(/[\\%_]/g, '\\$&');
// then use { [Op.like]: `%${escaped}%` } with an explicit ESCAPE clause,
// or sanitize the term before Op.substring.
```

## Info

### IN-01: `getFamilyHeadId(models)` parameter shadows the module-level `models` import

**File:** `backend/src/services/familyMember.service.js:12`
**Issue:** The function accepts a `models` argument (used for `findByPk` /
`findOne`) while the same module already imports the `models` singleton at the
top (line 2) and uses the module-level `sequelize` directly for the raw CTE.
The mixed sourcing is inconsistent and the parameter is redundant given every
caller passes the same singleton. Minor maintainability smell.
**Fix:** Drop the parameter and use the imported `models`, or consistently
thread both `models` and `sequelize` as arguments for testability.

### IN-02: `familyHead` issues two round-trips for one row

**File:** `backend/src/resolvers/familyMember.resolver.js:45-49`
**Issue:** `getFamilyHeadId` already performs a `findByPk`/`findOne` to obtain
the id, then the resolver performs a second `findByPk` to materialize the full
row. Correct but redundant; also opens a small TOCTOU window (the row could be
deleted between the two reads, yielding `null`, which is acceptable since the
field is nullable). Not a performance finding per v1 scope — noted for
maintainability only.
**Fix:** Have `getFamilyHeadId` return the model instance directly (or accept
`attributes`) so the id fast-path can reuse the already-fetched row.

---

_Reviewed: 2026-08-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
