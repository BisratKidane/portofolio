# Phase 18: Data Model & Migration - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 3 (1 modified model, 1 new migration, 1 test file to extend)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/models/FamilyMember.js` | model | CRUD | itself (`fullname` VIRTUAL + optional STRING fields, same file) | exact |
| `backend/migrations/manual/018-add-family-members-geez-names.sql` | migration | batch (DDL, applied once by hand) | `backend/migrations/manual/013-add-family-members-profile-picture.sql` (single nullable additive column) + `014-add-family-members-isalive-and-provenance.sql` (multi-column ALTER TABLE) | exact |
| `backend/src/models/FamilyMember.test.js` | test | CRUD (unit, `build()` + `validate()`, no DB) | itself — `fullname VIRTUAL getter` describe block, same file | exact |
| `README.md` § "Manual Database Migrations" | docs | — | the `014` and `015-017` entries (per-migration subsection + boot-and-verify checklist) | exact |

## Pattern Assignments

### `backend/src/models/FamilyMember.js` (model, CRUD)

**Analog:** same file — existing `fullname` VIRTUAL getter and existing nullable `DataTypes.STRING` fields (`mothersname`, `phone`, `address`).

**Imports pattern** (lines 1-1) — no new imports needed, `DataTypes` is already imported:
```javascript
import { DataTypes, Model } from 'sequelize';
```

**Optional nullable STRING field pattern** (lines 26-29, `mothersname`; identical shape at 51-58 for `phone`/`address`):
```javascript
mothersname: {
  type: DataTypes.STRING,
  allowNull: true
},
```
This is the exact shape to copy three times for `geezFirstname`, `geezLastname`, `geezMothersname` (D-05: no `validate`, no length constraint beyond default — unlike `email`, which adds `validate: { isEmail: true }` at lines 30-34 and must NOT be mirrored here).

**Core VIRTUAL getter pattern to mirror — `fullname`** (lines 63-68):
```javascript
fullname: {
  type: DataTypes.VIRTUAL,
  get() {
    return `${this.firstname} ${this.lastname}`;
  }
}
```
This is the field being ported. **Do not copy the join logic verbatim** — `firstname`/`lastname` are `allowNull: false` so the naive template-literal join is safe there; `geezFirstname`/`geezLastname` are both nullable, so `geezFullname`'s getter must use the defensive form specified in CONTEXT.md D-02:
```javascript
geezFullname: {
  type: DataTypes.VIRTUAL,
  get() {
    return [this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null;
  }
}
```

**Field placement:** Insert the three new STRING attrs after `mothersname` (line 29) or near the end of the plain-field block (after `profilePicture`, line 62) — either location is Claude's discretion per CONTEXT.md; place `geezFullname` immediately after the new fields and before the existing `fullname` VIRTUAL, or immediately after `fullname` — order between the two VIRTUALs is not load-bearing since Apollo resolves both by property name independent of declaration order.

**Error handling / validation:** None needed — no `validate` block changes required (D-05 confirms no format validation for Ge'ez fields), and the model-level `validate: { deathAfterBirth(), noFutureDates() }` block (lines 74-89) is untouched — Ge'ez fields introduce no new cross-field invariants.

---

### `backend/migrations/manual/018-add-family-members-geez-names.sql` (migration, batch DDL)

**Primary analog:** `backend/migrations/manual/013-add-family-members-profile-picture.sql` — single nullable additive column, header-comment convention.

**Full analog file (013), lines 1-19:**
```sql
-- Manual, one-time migration (Phase 16 / PHOTO-02).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have this statement run by hand, once, before booting a backend
-- that expects the family_members.profilePicture column to exist.
--
-- The column is nullable with NO backfill: every existing family_members
-- row legitimately has no photo until someone uploads one (D-10 -- the
-- frontend renders a generic person-icon placeholder for a null/missing
-- profilePicture, matching the pattern already established for
-- users.familyMemberId in 012 -- no safe value to backfill with).
--
-- Simpler than 012: no UNIQUE constraint (many members may lack a photo)
-- and no FOREIGN KEY (the column holds a server-generated storage filename,
-- not a reference to another table).

ALTER TABLE family_members ADD COLUMN profilePicture VARCHAR(255) NULL DEFAULT NULL;
```

**Secondary analog for multi-column syntax:** `backend/migrations/manual/014-add-family-members-isalive-and-provenance.sql`, lines 28-35 (comma-joined `ADD COLUMN` clauses under one `ALTER TABLE family_members` statement):
```sql
ALTER TABLE family_members
  ADD COLUMN isAlive TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN createdByUserId INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN updatedByUserId INT UNSIGNED NULL DEFAULT NULL,
  ADD CONSTRAINT fk_family_members_created_by
    FOREIGN KEY (createdByUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_family_members_updated_by
    FOREIGN KEY (updatedByUserId) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE;
```
018 needs no constraints/FKs (all three new columns are plain nullable strings, no backfill, no uniqueness) — the multi-`ADD COLUMN`-in-one-`ALTER TABLE` shape is what to copy, not the constraint clauses.

**Charset precedent:** `CHARSET=utf8mb4` already appears table-wide in `016-create-invitations.sql:35` and `017-create-audit-logs.sql:24` (`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`), confirming `utf8mb4` is the established charset for this project — but neither existing migration uses `CHARACTER SET` on an individual `ADD COLUMN` clause (013/014's `VARCHAR(255)` columns rely on table-level default charset, which is already `utf8mb4mb4`/InnoDB default). Per CONTEXT.md D-03/Pitfall 3, 018 is the **first** migration in this repo to need an explicit **per-column** `CHARACTER SET utf8mb4` (since Ge'ez/Ethiopic text requires it explicitly and the table default should not be silently relied upon) — write it as `VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL`, with **no** `COLLATE` clause and **no** `ENCRYPTION` clause (the two tokens Pitfall 3 flags as MariaDB-breaking).

**Composed shape to write for 018** (following 013's header block, extended to three columns per 014's multi-`ADD COLUMN` syntax):
```sql
-- Manual, one-time migration (Phase 18 / DATA-01, DATA-02).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have this statement run by hand, once, before booting a backend
-- that expects the family_members Ge'ez-script columns to exist.
--
-- Adds three nullable Ge'ez (Ethiopic-script) name columns, mirroring the
-- existing Latin firstname/lastname/mothersname fields but entirely
-- optional -- no backfill, no validation, no length constraint beyond the
-- VARCHAR(255) default (D-05). geezFullname (firstname+lastname only,
-- mothersname excluded to match the existing `fullname` VIRTUAL) is a
-- Sequelize VIRTUAL getter, not a stored column -- no DDL for it here.
--
-- Portability (D-03): CHARACTER SET utf8mb4 with NO explicit COLLATE and
-- NO ENCRYPTION clause -- both break on MariaDB (local dev), which this
-- app straddles alongside MySQL 8.4 (prod). Verified against local
-- MariaDB; safe to apply to MySQL 8.4 unchanged.

ALTER TABLE family_members
  ADD COLUMN geezFirstname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  ADD COLUMN geezLastname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  ADD COLUMN geezMothersname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL;
```

**Error handling:** N/A — DDL scripts in this repo have no error-handling convention (run-once, hand-applied, no transaction wrapper in 013/014/016/017).

---

### `backend/src/models/FamilyMember.test.js` (test, CRUD unit)

**Analog:** same file — the `describe('fullname VIRTUAL getter (MEM-03, D-09)', ...)` block (lines 88-98) and the `describe('optional fields nullable (MEM-02, D-08)', ...)` block (lines 41-56).

**Imports pattern** (lines 1-5, no changes needed):
```javascript
import { describe, it, expect } from 'vitest';
import { DataTypes } from 'sequelize';
import { models } from './index.js';

const { FamilyMember } = models;
```

**Nullable-declaration assertion pattern to extend** (lines 48-55):
```javascript
it('declares mothersname, email, birthdate, deathdate, phone, address as nullable', () => {
  expect(FamilyMember.rawAttributes.mothersname.allowNull).toBe(true);
  expect(FamilyMember.rawAttributes.email.allowNull).toBe(true);
  expect(FamilyMember.rawAttributes.birthdate.allowNull).toBe(true);
  expect(FamilyMember.rawAttributes.deathdate.allowNull).toBe(true);
  expect(FamilyMember.rawAttributes.phone.allowNull).toBe(true);
  expect(FamilyMember.rawAttributes.address.allowNull).toBe(true);
});
```
Add `geezFirstname`/`geezLastname`/`geezMothersname` to this list (either extend the existing assertion or add a new `describe` block scoped to DATA-01/DATA-02).

**VIRTUAL getter test pattern to mirror for the fill-matrix** (lines 88-98):
```javascript
describe('fullname VIRTUAL getter (MEM-03, D-09)', () => {
  it('derives fullname as firstname + lastname on a built (unsaved) instance', () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Female' });

    expect(instance.fullname).toBe('Jane Doe');
  });

  it('declares fullname as a Sequelize VIRTUAL field', () => {
    expect(FamilyMember.rawAttributes.fullname.type).toBeInstanceOf(DataTypes.VIRTUAL);
  });
});
```
New block, same shape, testing the none/first-only/last-only/all-filled matrix required by CONTEXT.md D-02 / Success Criteria #3:
```javascript
describe('geezFullname VIRTUAL getter (DATA-01, DATA-02)', () => {
  it('declares geezFullname as a Sequelize VIRTUAL field', () => {
    expect(FamilyMember.rawAttributes.geezFullname.type).toBeInstanceOf(DataTypes.VIRTUAL);
  });

  it('returns null when neither geezFirstname nor geezLastname is set', () => {
    const instance = FamilyMember.build({ firstname: 'Jane', lastname: 'Doe', gender: 'Female' });

    expect(instance.geezFullname).toBeNull();
  });

  it('returns just geezFirstname when only it is set', () => {
    const instance = FamilyMember.build({
      firstname: 'Jane', lastname: 'Doe', gender: 'Female', geezFirstname: 'ጃነ'
    });

    expect(instance.geezFullname).toBe('ጃነ');
  });

  it('returns just geezLastname when only it is set', () => {
    const instance = FamilyMember.build({
      firstname: 'Jane', lastname: 'Doe', gender: 'Female', geezLastname: 'ዶ'
    });

    expect(instance.geezFullname).toBe('ዶ');
  });

  it('joins geezFirstname and geezLastname with a single space when both are set', () => {
    const instance = FamilyMember.build({
      firstname: 'Jane', lastname: 'Doe', gender: 'Female',
      geezFirstname: 'ጃነ', geezLastname: 'ዶ'
    });

    expect(instance.geezFullname).toBe('ጃነ ዶ');
  });
});
```
Uses `FamilyMember.build()` + property access only — no DB connection, matching the existing file's zero-I/O unit-test style (consistent with `data flow: CRUD` classification but exercised entirely in-memory, same as every other test in this file).

**Test location confirmed:** `backend/src/models/FamilyMember.test.js` is the correct home — do not create a new file. It is a Vitest suite (see `test` script convention already in `backend/package.json`) with no `beforeEach`/DB setup, colocated with the model per this repo's `*.test.js`-next-to-source convention (also seen in `Invitation.test.js`, `User.test.js`, `Spouse.test.js` in the same directory).

---

### `README.md` § "Manual Database Migrations" (docs)

**Analog:** the `014` entry (lines 282-299) — closest in shape (single migration, ALTER TABLE, boot-and-verify checklist referencing `Unknown column` errors).

**Section-header + apply-command pattern** (lines 282-292):
```markdown
### Add isAlive + provenance to family_members (member provenance + isAlive)

This migration adds a living-status boolean (`isAlive`) that supersedes `deathdate`, plus `createdByUserId`/`updatedByUserId` provenance columns. ...

1. Apply the migration against your database, using the `DB_USER`/`DB_PASSWORD`/`DB_NAME` values from the active env file:

   ```bash
   docker compose --env-file env/local.env exec -T mysql mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < backend/migrations/manual/014-add-family-members-isalive-and-provenance.sql
   ```

   Or run the equivalent statements with any MySQL client pointed at your `DB_HOST`/`DB_PORT`/`DB_NAME`.
```

Append a new `### Add Ge'ez-script name columns to family_members (Phase 18 / DATA-01, DATA-02)` subsection following this exact shape: intro paragraph naming the three columns + noting no backfill/no validation, apply-command block referencing `018-add-family-members-geez-names.sql`, boot-and-verify bullets referencing `Unknown column 'geezFirstname'`, and (per D-03) an explicit sentence noting this migration was verified against local MariaDB and is documented as MySQL-8.4-safe by construction (no live MySQL 8.4 run in this phase) — plus a note that D-04 defers the prod apply to the phase that ships the Ge'ez API/UI.

---

## Shared Patterns

### Manual migration header/footer convention
**Source:** `backend/migrations/manual/013-*.sql` (header) + `backend/migrations/manual/014-*.sql` (multi-column ALTER syntax)
**Apply to:** `018-add-family-members-geez-names.sql`
- Header always opens with `-- Manual, one-time migration (<phase/ticket ref>).` then a paragraph on the `sequelize.sync()` never-alters-existing-tables caveat, then a paragraph describing what's added and the backfill/validation stance, then (only when relevant, e.g. Pitfall 3 here) a portability note.
- Multi-column changes use one `ALTER TABLE family_members` statement with comma-joined `ADD COLUMN` clauses (014's shape), not one statement per column (013's shape is single-column only because it adds a single column).

### Optional-STRING-field model convention
**Source:** `backend/src/models/FamilyMember.js` lines 26-29, 51-58
**Apply to:** `geezFirstname`, `geezLastname`, `geezMothersname` attribute definitions
```javascript
fieldName: {
  type: DataTypes.STRING,
  allowNull: true
},
```
No `validate` key — `email` (lines 30-34) is the only optional STRING with a `validate` block, and it should NOT be used as the template here per D-05.

### VIRTUAL getter convention
**Source:** `backend/src/models/FamilyMember.js` lines 63-68
**Apply to:** `geezFullname` attribute definition — same `{ type: DataTypes.VIRTUAL, get() {...} }` shape, but with the defensive `.filter(Boolean).join(' ') || null` body instead of `fullname`'s unconditional template literal, per D-02.

### Colocated unit-test convention
**Source:** `backend/src/models/FamilyMember.test.js`
**Apply to:** New `describe` blocks in the same file for the three new nullable fields and the `geezFullname` fill-matrix — no new test file, no DB fixtures, `FamilyMember.build()` + synchronous property/`validate()` assertions only.

## No Analog Found

None — all files in this phase's scope (model change, migration, test extension, README doc update) have exact same-file or same-directory analogs already identified above.

## Metadata

**Analog search scope:** `backend/src/models/FamilyMember.js`, `backend/src/models/FamilyMember.test.js`, `backend/migrations/manual/*.sql` (all 8 existing files), `README.md` § "Manual Database Migrations"
**Files scanned:** 11 (1 model, 1 test, 8 migrations, 1 README section)
**Pattern extraction date:** 2026-07-30
