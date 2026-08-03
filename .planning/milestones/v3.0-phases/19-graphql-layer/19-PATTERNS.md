# Phase 19: GraphQL Layer - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 4 (3 modified, 1 new)
**Analogs found:** 4 / 4 (all in-file or sibling analogs — this is an extend-existing phase, not a greenfield one)

## Orientation

This is a **backend-only, extend-existing** phase. Every file in scope already exists except the new test. The "analog" for each modified file is a pattern **already present inside the same file** (or a sibling test), so the planner's job is pattern-continuation, not net-new construction. Excerpts below are the exact lines new code must mirror.

## File Classification

| File | New/Modified | Role | Data Flow | Closest Analog | Match Quality |
|------|--------------|------|-----------|----------------|---------------|
| `backend/src/schemas/familyMember.schema.js` | modified | schema (SDL) | transform (contract) | `fullname: String!` field + `mothersname: String` input field, same file | exact (in-file) |
| `backend/src/resolvers/user.resolver.js` | modified | resolver (shared util) | transform (blank→null) | `OPTIONAL_FAMILY_MEMBER_FIELDS` array, same file line 41 | exact (in-file) |
| `backend/src/models/FamilyMember.js` | modified | model | transform (VIRTUAL getter) | existing `geezFullname` VIRTUAL, same file lines 75-80 | exact (in-file) |
| `backend/src/resolvers/familyMember.geez.test.js` (new — name at planner discretion) | new | test (integration) | CRUD round-trip | `familyMember.editMember.test.js` + `familyMember.addChild.test.js` | exact (sibling) |

## Pattern Assignments

### `backend/src/schemas/familyMember.schema.js` (schema, contract)

**Analog:** in-file — the read-only derived `fullname` field and the optional `mothersname` input field.

**Read-only derived field on `type FamilyMember`** (line 17). This is the analog for exposing `geezFullname`. Note the difference: `fullname` is `String!` (required — its Latin parts are required), but `geezFullname` must be nullable `String` because it returns `null` when no Ge'ez parts are set (Phase 18 D-02, CONTEXT D-02/specifics):
```graphql
  type FamilyMember {
    id: ID!
    firstname: String!
    lastname: String!
    fullname: String!          # <- analog; add geezFullname: String (nullable) near here
    ...
    mothersname: String        # <- analog for the 3 Ge'ez data fields on the type
```
The 4 fields to add to `type FamilyMember`: `geezFirstname: String`, `geezLastname: String`, `geezMothersname: String`, `geezFullname: String` (all nullable; `geezFullname` read-only derived).

**Optional data field on both input types** (lines 39-49 `NewFamilyMemberInput`, 54-64 `EditFamilyMemberInput`). `mothersname: String` is the exact analog — plain nullable String, no `@constraint` (D-04 no validation):
```graphql
  input NewFamilyMemberInput {
    firstname: String!
    lastname: String!
    gender: Gender!
    mothersname: String        # <- analog; add geezFirstname/geezLastname/geezMothersname alongside
    ...
  }
```
Add the **3 writable** fields (`geezFirstname`, `geezLastname`, `geezMothersname` — all `String`) to **both** `NewFamilyMemberInput` and `EditFamilyMemberInput`. Do NOT add `geezFullname` to any input (it is read-only/derived, mirroring how `fullname` is absent from the inputs). The `EditFamilyMemberInput` structural comment (lines 51-53) about excluding edge-mutating fields still holds — the Ge'ez fields are plain data fields and belong there.

---

### `backend/src/resolvers/user.resolver.js` (resolver, shared blank→null util)

**Analog:** in-file — the `OPTIONAL_FAMILY_MEMBER_FIELDS` array and its `sanitizeNewMember` consumer.

**The single edit that delivers SC3** (line 41). Add the 3 writable Ge'ez fields to this array — this is the entire mechanism for blank-string→null on both create and edit paths (`sanitizeNewMember` is applied to `newMember` on create AND to `fields` on `editMember`):
```javascript
export const OPTIONAL_FAMILY_MEMBER_FIELDS = ['mothersname', 'email', 'birthdate', 'deathdate', 'phone', 'address'];
// -> add 'geezFirstname', 'geezLastname', 'geezMothersname'
```

**Why nothing else changes** (lines 52-62) — the shared sanitizer already trims and blanks any key it is given; no per-field or per-mutation code:
```javascript
export function sanitizeNewMember(newMember) {
  const sanitized = { ...newMember };
  for (const key of OPTIONAL_FAMILY_MEMBER_FIELDS) {
    const value = sanitized[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      sanitized[key] = trimmed === '' ? null : trimmed;
    }
  }
  return sanitized;
}
```

**Spread-passthrough confirmation** — no resolver body edits needed. Every create mutation spreads `...sanitizeNewMember(newMember)` and `editMember` spreads `...sanitizeNewMember(fields)`:
- `backend/src/resolvers/familyMember.resolver.js:68,97,147,193` — create paths (`addParent`/`addSpouse`/`addChild`/`addSibling`)
- `backend/src/resolvers/familyMember.resolver.js:230` — `editMember` → `target.update({ ...sanitizeNewMember(fields), updatedByUserId: user.id })`
- `backend/src/resolvers/user.resolver.js:342` — `linkUserToMember` create path

---

### `backend/src/models/FamilyMember.js` (model, VIRTUAL hardening — D-02, closes 18-REVIEW WR-01)

**Analog:** in-file — the existing `geezFullname` VIRTUAL declaration.

**Current declaration** (lines 75-80). Redeclare the `type` to name the source-field dependencies; the `get()` body stays byte-for-byte identical (D-03: output unchanged, Phase 18 fill-matrix tests must stay green):
```javascript
      geezFullname: {
        type: DataTypes.VIRTUAL,          // <- change to: new DataTypes.VIRTUAL(DataTypes.STRING, ['geezFirstname', 'geezLastname'])
        get() {
          return [this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null;
        }
      },
```
Target:
```javascript
      geezFullname: {
        type: new DataTypes.VIRTUAL(DataTypes.STRING, ['geezFirstname', 'geezLastname']),
        get() {
          return [this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null;
        }
      },
```
Rationale (D-02): exposing `geezFullname` over GraphQL is exactly the scenario where an undeclared dependency bites — a future query restricting Sequelize `attributes` would otherwise silently return `null`. Only `geezFirstname`/`geezLastname` are listed (mothersname is excluded from the join per Phase 18 D-01).

**Discretion note (D-03 / Deferred):** the sibling Latin `fullname` VIRTUAL (lines 81-86) uses the same bare `DataTypes.VIRTUAL`. Optionally apply the same dependency declaration `new DataTypes.VIRTUAL(DataTypes.STRING, ['firstname', 'lastname'])` for consistency. Lean = skip unless trivial (its parts are required and it is not newly exposed → lower latent risk); if skipped, record as a follow-up.

**Tests that must remain green after this change** — `backend/src/models/FamilyMember.test.js` lines 187-243 (the `geezFullname VIRTUAL getter` fill-matrix: none/first-only/last-only/mothersname-only/all-filled). Line 189 asserts `rawAttributes.geezFullname.type` is still `instanceOf(DataTypes.VIRTUAL)` — `new DataTypes.VIRTUAL(...)` still satisfies `instanceof`, so this stays green.

---

### `backend/src/resolvers/familyMember.geez.test.js` (new integration test — D-05)

**Analog:** `backend/src/resolvers/familyMember.editMember.test.js` (edit round-trip) + `backend/src/resolvers/familyMember.addChild.test.js` (create round-trip). Both are exact structural templates.

**Test harness / imports** (identical across every `familyMember.*.test.js`):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

beforeEach(resetTables);
```

**Shared test helpers** (`backend/test/helpers.js`):
- `graphql(query, variables, user, clientIp?)` — runs `server.executeOperation` with a real per-request context (`{ models, user, clientIp, loaders: createLoaders(models) }`), returns `response.body.singleResult` → destructure `{ data, errors }`. Lines 16-26.
- `resetTables` — FK-safe truncate of all tables, wired to `beforeEach`. Lines 28-41.
- `createTestUser({ role, familyMemberId?, email? })` — Active/verified user; defaults role USER. Lines 45-57. For ADMIN-authored create paths use `createTestUser({ role: 'ADMIN' })`; for a member-user use `{ role: 'USER', familyMemberId: self.id }`.

**Create-path round-trip pattern** — from `familyMember.addChild.test.js:20-41`. `addChild` is the cleanest low-scaffolding create mutation (a member-user adding a child to themselves needs only one pre-created `self` member); this is the recommended pick for the D-05 create proof (Claude's Discretion). Extend the selection set + `newMember` payload with the Ge'ez fields:
```javascript
const ADD_CHILD_MUTATION = `
  mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
    addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) {
      id
      firstname
      lastname
      # add: geezFirstname geezLastname geezMothersname geezFullname
    }
  }
`;
// self = FamilyMember.create({...}); actor = createTestUser({ role: 'USER', familyMemberId: self.id });
// newMember: { firstname, lastname, gender, geezFirstname: 'ጃነ', geezLastname: 'ዶ', geezMothersname: 'ኣለም' }
// assert data.addChild.geezFirstname === 'ጃነ' ... and data.addChild.geezFullname === 'ጃነ ዶ' (excludes mothersname)
```

**Edit round-trip + clear-to-null pattern (SC3, load-bearing)** — from `familyMember.editMember.test.js:6-33`. The edit-then-clear assertion is the whole point of the `OPTIONAL_FAMILY_MEMBER_FIELDS` addition:
```javascript
const EDIT_MEMBER_MUTATION = `
  mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
    editMember(id: $id, fields: $fields) {
      id
      geezFirstname
      geezLastname
      geezMothersname
      geezFullname
    }
  }
`;
// (a) set: fields: { geezFirstname: 'ጃነ', geezLastname: 'ዶ' } -> read back, assert geezFullname === 'ጃነ ዶ'
// (b) clear: fields: { geezFirstname: '' } -> assert data.editMember.geezFirstname === null (NOT ''), the SC3 proof
//     back it with a DB check: await member.reload(); expect(member.geezFirstname).toBeNull();
```

**Ge'ez string literals** — use the same Ethiopic samples already in the model fill-matrix tests (`FamilyMember.test.js:203,214,236-238`): first `'ጃነ'`, last `'ዶ'`, mothersname `'ኣለም'` → derived `geezFullname` `'ጃነ ዶ'`.

**D-05 scope** — one create-path proof (do NOT duplicate across all five create mutations; the passthrough is shared) + the three editMember assertions (set/clear/derive). Four focused cases total.

## Shared Patterns

### Integration-test harness
**Source:** `backend/test/helpers.js` (`graphql`, `resetTables`, `createTestUser`)
**Apply to:** the new test file.
Every `familyMember.*.test.js` imports these three, wires `beforeEach(resetTables)`, and destructures `{ data, errors }` from `graphql(...)`. Success asserts `expect(errors).toBeUndefined()`; DB-persistence asserts via `models.FamilyMember.findByPk(...)` / `instance.reload()`.

### Read-only-derived vs writable field separation
**Source:** `familyMember.schema.js` (`fullname` on type, absent from inputs) + `FamilyMember.js` (`fullname`/`geezFullname` VIRTUALs)
**Apply to:** schema + model edits.
Derived names (`fullname`, `geezFullname`) appear only on `type FamilyMember`, never in an input; their values come from model VIRTUAL getters. Persisted names appear in both the type and the two input types.

### Blank-string→null passthrough
**Source:** `user.resolver.js:41,52` (`OPTIONAL_FAMILY_MEMBER_FIELDS` + `sanitizeNewMember`)
**Apply to:** the resolver edit (adding 3 keys) — automatically covers all create mutations and `editMember` with zero body changes.

## No Analog Found

None. Every file has an exact in-file or sibling analog; this phase is pure pattern-continuation of Phase 18's data-model work.

## Metadata

**Analog search scope:** `backend/src/schemas/`, `backend/src/resolvers/`, `backend/src/models/`, `backend/test/`
**Files scanned:** familyMember.schema.js, user.resolver.js, familyMember.resolver.js, FamilyMember.js, FamilyMember.test.js, familyMember.editMember.test.js, familyMember.addChild.test.js, test/helpers.js
**Pattern extraction date:** 2026-07-30
