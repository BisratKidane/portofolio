---
phase: 18-data-model-migration
reviewed: 2026-07-30T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - backend/src/models/FamilyMember.js
  - backend/src/models/FamilyMember.test.js
  - backend/migrations/manual/018-add-family-members-geez-names.sql
  - README.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 18 adds three nullable Ge'ez-script name columns (`geezFirstname`, `geezLastname`, `geezMothersname`) plus a derived `geezFullname` VIRTUAL getter to the `FamilyMember` Sequelize model, and a portable manual SQL migration (018) creating the matching `utf8mb4` columns.

The core change is sound. The `geezFullname` getter is genuinely null-safe (`filter(Boolean).join(' ') || null` cannot throw on null/undefined parts and correctly returns `null` when empty), it correctly excludes `geezMothersname` per D-01, and the model/migration column definitions match (`DataTypes.STRING` == `VARCHAR(255)`, camelCase column names align). The migration's bare `CHARACTER SET utf8mb4` with no `COLLATE`/`ENCRYPTION` is the correct portable form for MariaDB + MySQL 8.4. Test coverage of the getter and nullability is good.

**No blockers found.** Cross-referencing confirmed the Ge'ez fields are not yet exposed in the GraphQL schema (only `fullname: String!` is present) and no resolver restricts `attributes`, so the one structural concern below is latent, not active. Findings are quality/robustness and documentation-consistency issues.

## Warnings

### WR-01: VIRTUAL getters declare no source-field dependencies

**File:** `backend/src/models/FamilyMember.js:75-86`
**Issue:** `geezFullname` (and the pre-existing `fullname`) are declared as bare `type: DataTypes.VIRTUAL` with no dependency array. Sequelize only reliably populates a VIRTUAL's source fields when the getter's dependencies are declared. The moment any query restricts columns — e.g. `findAll({ attributes: ['geezFullname'] })`, or a future GraphQL field-selection-to-attribute mapping — `this.geezFirstname` / `this.geezLastname` will be `undefined` and the "defensive" getter will silently return `null` instead of the real name, with no error. Today there is no `attributes` restriction anywhere (verified across resolvers), so this is latent, but it undercuts the stated goal of a defensive getter and is a trap for the later v3.0 phase that wires these into the API.
**Fix:**
```js
geezFullname: {
  type: new DataTypes.VIRTUAL(DataTypes.STRING, ['geezFirstname', 'geezLastname']),
  get() {
    return [this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null;
  }
}
```
(Apply the same `['firstname', 'lastname']` dependency form to `fullname` for consistency.)

### WR-02: Migration comment asserts MySQL 8.4 verification the phase did not perform

**File:** `backend/migrations/manual/018-add-family-members-geez-names.sql:22-24`
**Issue:** The migration header states the DDL "was verified to apply cleanly against local MariaDB and **is safe to apply to prod MySQL 8.4 unchanged**." README line 332 is more honest: "no live MySQL 8.4 container run was performed in this phase." An operator reading only the migration file (the artifact they actually run) is told prod-MySQL safety was verified when only MariaDB was tested. The DDL is in fact valid on both engines, but the comment overstates the evidence and could lead an operator to skip their own dry run before the deferred prod apply (D-04).
**Fix:** Align the comment wording with README's caveat — e.g. "verified against local MariaDB; MySQL 8.4 safety is by-construction (bare utf8mb4 default collation) but was not exercised against a live MySQL 8.4 instance in this phase — dry-run before the prod apply."

## Info

### IN-01: Migration is not idempotent (re-running errors on duplicate column)

**File:** `backend/migrations/manual/018-add-family-members-geez-names.sql:26-29`
**Issue:** `ADD COLUMN` without `IF NOT EXISTS` fails with a duplicate-column error if the file is applied twice. Note this is largely unavoidable here: `ADD COLUMN IF NOT EXISTS` is a MariaDB extension that MySQL 8.4 does not support, so adding it would break the portability this migration is explicitly designed for. This is a by-design constraint — the boot-and-verify runbook already frames it as a one-time apply.
**Fix:** No code change needed; consider a one-line note in the file that it must be applied exactly once (partially covered by lines 1-8).

### IN-02: Getter preserves whitespace-only parts

**File:** `backend/src/models/FamilyMember.js:78`
**Issue:** `filter(Boolean)` treats a whitespace-only string (e.g. `' '`) as truthy, so a stray-space value would surface as a leading/trailing space or a double space in `geezFullname`. Harmless (no crash), but a small hardening opportunity for a getter described as "defensive."
**Fix:** Trim/normalize before joining, e.g. `[this.geezFirstname, this.geezLastname].map(s => s?.trim()).filter(Boolean).join(' ') || null`.

### IN-03: Test gaps — column type and two-part-only path not asserted

**File:** `backend/src/models/FamilyMember.test.js:180-243`
**Issue:** Tests thoroughly cover nullability and the getter's none/first-only/last-only/mothersname-only/all-filled paths, but (a) no test asserts the Ge'ez columns are `STRING`/`VARCHAR(255)` (D-05 length is the migration's only validation), and (b) the `geezFirstname + geezLastname` join is only exercised via the all-three-filled case rather than a two-parts-only case. Both are minor; correctness of the join and mothersname exclusion is already proven by the all-filled assertion.
**Fix:** Optionally add `expect(FamilyMember.rawAttributes.geezFirstname.type).toBeInstanceOf(DataTypes.STRING)` and a first+last-only case asserting `'ጃነ ዶ'` with `geezMothersname` unset.

---

_Reviewed: 2026-07-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
