# Architecture Research

**Domain:** Brownfield integration — optional Ge'ez (ግዕዝ) native-script name fields + self-hosted Ge'ez webfont, layered onto the existing v2.0 FamilyMember/GraphQL/React stack
**Researched:** 2026-07-30
**Confidence:** HIGH (all integration points verified against real files in this repo, not general framework docs)

This is a **subsequent-milestone** research file (v3.0 Ge'ez Native-Script Names). It supersedes the prior v2.0 `ARCHITECTURE.md` content — it does not re-derive the existing collaborative-family-tree architecture (see `.planning/codebase/ARCHITECTURE.md`), it maps exactly where the new Ge'ez name fields + font plug into the app that v2.0 already built.

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                             │
│  backend/migrations/manual/018-*.sql  (NEW, hand-applied, not sync())  │
│    ALTER TABLE family_members ADD geezFirstname/geezLastname/          │
│    geezMothersname VARCHAR(255) NULL  -- utf8mb4, MariaDB-safe DDL     │
│         │                                                              │
│         ▼                                                              │
│  backend/src/models/FamilyMember.js (MODIFIED)                         │
│    + 3 real columns + geezFullname VIRTUAL getter (mirrors fullname)   │
├────────────────────────────────────────────────────────────────────────┤
│ API LAYER (thin passthrough — no new resolver logic)                   │
│  backend/src/schemas/familyMember.schema.js (MODIFIED)                 │
│    FamilyMember type + NewFamilyMemberInput + EditFamilyMemberInput    │
│         │                                                              │
│         ▼                                                              │
│  backend/src/resolvers/user.resolver.js (MODIFIED)                     │
│    OPTIONAL_FAMILY_MEMBER_FIELDS += geez* (blank-string→null trim)     │
│  backend/src/resolvers/familyMember.resolver.js -- NO CHANGE           │
│    (create/update spread already carries any input-type field;         │
│    geezFullname resolves via Apollo's default property resolver,       │
│    exactly like fullname does today — no FamilyMember.geezFullname     │
│    resolver fn needed, no DataLoader touches name fields)              │
├────────────────────────────────────────────────────────────────────────┤
│ FRONTEND — QUERIES (inline strings; MODIFIED selection sets)           │
│  ManagePage.jsx / FamilyTreePage.jsx / EditMemberDialog.jsx             │
│    add geezFirstname geezLastname geezMothersname geezFullname         │
│    to whichever field-list constant/selection each already uses        │
│         │                                                              │
│         ▼                                                              │
│ FRONTEND — SHARED HELPER (NEW — single precedence rule, DRY)           │
│  frontend/src/utils/displayName.js                                     │
│    getGeezName(member) → geezFullname || null                          │
│    (every render surface below calls this instead of re-deriving)      │
│         │                                                              │
│         ▼                                                              │
│ FRONTEND — RENDER SURFACES (MODIFIED, all consume the helper)          │
│  MemberNode.jsx · MemberCard.jsx · AdminMemberTable.jsx ·               │
│  AddRelativeDialog.jsx Autocomplete option/label                        │
│  RelationshipGroupedPanel.jsx -- NO CHANGE (pure layout, never          │
│    renders a name string itself, only forwards `member` to MemberCard) │
├────────────────────────────────────────────────────────────────────────┤
│ FRONTEND — FORMS (MODIFIED)                                            │
│  MemberFields.jsx (+3 TextFields) → AddRelativeDialog.jsx /             │
│  EditMemberDialog.jsx (EMPTY_FORM + formFromMember() + mutation         │
│  selection sets)                                                       │
├────────────────────────────────────────────────────────────────────────┤
│ FONT (NEW, self-hosted — no external CDN, unlike the existing           │
│  Google-Fonts-CDN Inter/Sora <link> in index.html)                     │
│  @fontsource/noto-sans-ethiopic (npm dep, bundled by Vite)              │
│    imported once in frontend/src/main.jsx                              │
│         │                                                              │
│         ▼                                                              │
│  frontend/src/theme.js (MODIFIED) — FONT_SANS/FONT_DISPLAY chains       │
│    append "Noto Sans Ethiopic" so MUI's global typography.fontFamily   │
│    resolves Ge'ez glyphs everywhere, with zero per-component styling   │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | File | New / Modified |
|-----------|----------------|------|-----------------|
| Manual migration 018 | Adds 3 nullable Ge'ez columns to `family_members`, MariaDB/MySQL-8-portable DDL | `backend/migrations/manual/018-add-family-members-geez-names.sql` | **NEW** |
| FamilyMember model | Declares the 3 new attrs + `geezFullname` VIRTUAL getter | `backend/src/models/FamilyMember.js` | Modified |
| FamilyMember GraphQL SDL | Exposes geez fields on the type + both input types | `backend/src/schemas/familyMember.schema.js` | Modified |
| Blank-string sanitizer | Trims/nulls geez fields exactly like `mothersname`/`email` today | `backend/src/resolvers/user.resolver.js` (`OPTIONAL_FAMILY_MEMBER_FIELDS`) | Modified |
| familyMember resolvers | No behavior change — plain scalar passthrough + default property resolver for `geezFullname` | `backend/src/resolvers/familyMember.resolver.js` | **NO CHANGE** |
| DataLoader factory | No behavior change — loaders batch relation *edges* (mother/father/spouses/children/siblings/userById), never name fields | `backend/src/services/familyMember.service.js` (loaders) | **NO CHANGE** |
| Shared display-name helper | Single place deciding "does this member have a Ge'ez name, what's the string" | `frontend/src/utils/displayName.js` | **NEW** |
| Self-hosted font asset | Bundled Ge'ez-capable webfont, no CDN | `@fontsource/noto-sans-ethiopic` (npm dep) + one import in `main.jsx` | **NEW** |
| Theme font stack | Global fallback chain so Ge'ez resolves app-wide | `frontend/src/theme.js` | Modified |
| Tree card | Renders Ge'ez name on `/family` | `frontend/src/components/family/MemberNode.jsx` | Modified |
| Manage row card | Renders Ge'ez name in relationship panels | `frontend/src/components/manage/MemberCard.jsx` | Modified |
| Relationship grouping | Pure layout — forwards `member`, renders no name string itself | `frontend/src/components/manage/RelationshipGroupedPanel.jsx` | **NO CHANGE** |
| Admin member table | Renders Ge'ez name under/beside Latin name in Name column | `frontend/src/components/manage/AdminMemberTable.jsx` | Modified |
| Relative form fields | Adds the 3 Ge'ez text inputs (shared by both dialogs) | `frontend/src/components/manage/MemberFields.jsx` | Modified |
| Add-relative dialog | EMPTY_FORM + Autocomplete option/label + `inScopeMembers` shape | `frontend/src/components/manage/AddRelativeDialog.jsx` | Modified |
| Edit-member dialog | EMPTY_FORM, `formFromMember()`, mutation selection set | `frontend/src/components/manage/EditMemberDialog.jsx` | Modified |
| Manage page queries | Field-list constants + `inScopeMembers` mapping that feeds the Autocomplete | `frontend/src/pages/ManagePage.jsx` | Modified |
| Family tree page query | Selection set feeding `MemberNode` via the assembly module | `frontend/src/pages/FamilyTreePage.jsx` | Modified |
| Forest assembly | No change — passes the whole `member` object through untouched (`data: { member }`), so `geezFullname` rides along automatically once selected | `frontend/src/components/family/familyTree.assembly.js` | **NO CHANGE** |

## Concrete Integration Points (verified against real files)

### 1. Data layer

**Model today** (`backend/src/models/FamilyMember.js`):
```js
mothersname: { type: DataTypes.STRING, allowNull: true },
...
fullname: {
  type: DataTypes.VIRTUAL,
  get() { return `${this.firstname} ${this.lastname}`; }
}
```
Add, mirroring `mothersname`'s nullable-STRING pattern and `fullname`'s VIRTUAL pattern exactly:
```js
geezFirstname: { type: DataTypes.STRING, allowNull: true },
geezLastname: { type: DataTypes.STRING, allowNull: true },
geezMothersname: { type: DataTypes.STRING, allowNull: true },
geezFullname: {
  type: DataTypes.VIRTUAL,
  get() {
    if (!this.geezFirstname && !this.geezLastname) return null;
    return [this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null;
  }
}
```
`DataTypes.STRING` → `VARCHAR(255)`, matching every other optional text column on this model (`mothersname`, `phone`, `address`). No length concern for Ge'ez script — MySQL/MariaDB `VARCHAR(n)` counts characters, not bytes, so `VARCHAR(255)` is unaffected by needing `utf8mb4`'s 4-byte-per-character storage.

**Migration — new file `backend/migrations/manual/018-add-family-members-geez-names.sql`:**

Follow the established header-comment + `ALTER TABLE` convention used by `013`/`014` (read directly — neither specifies an explicit `COLLATE`, both inherit the table's default charset/collation). Do the same here, but be explicit about `CHARACTER SET utf8mb4` since Ge'ez glyphs require multi-byte-safe storage and the milestone context flags a MySQL-8-vs-MariaDB collation/`ENCRYPTION` incompatibility as a known gotcha:

```sql
-- Manual, one-time migration (v3.0 Ge'ez Native-Script Names, Phase 1).
--
-- NOT applied by sequelize.sync() -- sync() creates tables on brand-new
-- databases but never alters an existing table's columns (same convention
-- as 013/014/016/017).
--
-- Adds three OPTIONAL Ge'ez-script name columns mirroring the existing
-- Latin firstname/lastname/mothersname. All nullable, no backfill -- a
-- member with no Ge'ez name simply has NULL here and the app falls back
-- to the Latin name (v3.0 goal: no display-toggle, Latin-only members are
-- unaffected).
--
-- MariaDB-vs-MySQL-8 caution: do NOT use a MySQL-8-only collation
-- (e.g. utf8mb4_0900_ai_ci) or an ENCRYPTION=... clause here -- both are
-- rejected by MariaDB. CHARACTER SET utf8mb4 alone (no explicit COLLATE)
-- is portable to both engines and inherits the column's default collation
-- for that charset.

ALTER TABLE family_members
  ADD COLUMN geezFirstname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  ADD COLUMN geezLastname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL,
  ADD COLUMN geezMothersname VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL;
```

Also add the apply step to `README.md`'s manual-migration list (it documents 009/011/014 today by name — add 018 alongside them), matching the existing pattern at `README.md:254-292`.

### 2. GraphQL layer

**Type defs** (`backend/src/schemas/familyMember.schema.js`) — add to all three places the SDL currently lists `mothersname` as the sibling optional field:

- `type FamilyMember`: `geezFirstname: String`, `geezLastname: String`, `geezMothersname: String`, `geezFullname: String` (nullable — no `!`; unlike `fullname: String!` which is always derivable from required firstname/lastname, `geezFullname` is null whenever no Ge'ez name exists, so it must stay nullable).
- `input NewFamilyMemberInput`: `geezFirstname: String`, `geezLastname: String`, `geezMothersname: String`.
- `input EditFamilyMemberInput`: same three, preserving the existing D-05 comment's structural guarantee (no edge-mutating field is added — these are still plain scalars).

**Resolvers — the important discovery:** `familyMember.resolver.js`'s mutations already do `models.FamilyMember.create({ ...sanitizeNewMember(newMember), ... })` / `target.update({ ...sanitizeNewMember(fields), ... })`. Both spread the *entire* input object — they don't allow-list specific keys before writing to Sequelize. So once the GraphQL input types declare the geez fields, they flow through to the model with **zero resolver code changes** in `familyMember.resolver.js`. The only resolver-adjacent change needed is in `user.resolver.js`:

```js
// backend/src/resolvers/user.resolver.js
export const OPTIONAL_FAMILY_MEMBER_FIELDS = [
  'mothersname', 'email', 'birthdate', 'deathdate', 'phone', 'address',
  'geezFirstname', 'geezLastname', 'geezMothersname'   // ADD
];
```
Without this, clearing a Ge'ez field back to empty in the edit form would submit `''` rather than `null`, which is inconsistent with how every other optional text field behaves.

**`FamilyMember.geezFullname` needs no explicit resolver function.** Confirmed by reading the `FamilyMember: {...}` resolver map in `familyMember.resolver.js`: it defines explicit functions only for computed/relational fields (`photoUrl`, `mother`, `father`, `spouses`, `children`, `siblings`, `linkedUser`, `createdBy`, `updatedBy`). `fullname` has **no entry** — Apollo's default resolver reads `member.fullname` directly off the Sequelize instance (the VIRTUAL getter), and `geezFullname` will resolve identically.

**DataLoaders — no changes.** The loader factory batches *relationship edges* (`memberById`, `spousesByMemberId`, `childrenByParentId`, `userById`) — none of them touch name fields, so nothing here needs updating.

### 3. Frontend render surfaces — enumerated

Every place in the codebase that currently prints a family member's name, confirmed by reading each file:

| Surface | File | Current name render | Ge'ez integration |
|---------|------|----------------------|---------------------|
| Tree card | `frontend/src/components/family/MemberNode.jsx` | `<Typography>{member.fullname}</Typography>` (~line 189) | Add a second `<Typography>` line (or inline) rendering `getGeezName(member)` when non-null |
| Manage row card | `frontend/src/components/manage/MemberCard.jsx` | `<Typography>{member.fullname}</Typography>` (~line 108) | Same — render Ge'ez name via helper, likely as a smaller secondary line next to/under the Latin name |
| Relationship grouping | `frontend/src/components/manage/RelationshipGroupedPanel.jsx` | none — only forwards `member` prop to `MemberCard` | **No change** — do not add a helper import here, it never prints a name string |
| Admin member table | `frontend/src/components/manage/AdminMemberTable.jsx` | Name `<TableCell>` renders `member.fullname` colored by gender (~line 112) | Add Ge'ez name as a secondary caption line inside the same cell (matching the existing `Provenance` sub-component's two-line pattern already used for the "Last edited by" column) |
| Relative picker | `frontend/src/components/manage/AddRelativeDialog.jsx` Autocomplete | `getOptionLabel={(member) => member.fullname}` (~line 245) | Update `getOptionLabel` to combine Latin + Ge'ez via the helper (e.g. `"Firstname Lastname (ግዕዝ ስም)"`), and/or add a `renderOption` for a two-line option; requires `inScopeMembers` (built in `ManagePage.jsx`) to carry `geezFullname` |
| Detail panel | *(none exists yet as a distinct surface — out of scope per milestone)* | — | **Explicitly out of scope this milestone** |
| Link-accounts picker | `frontend/src/pages/LinkAccountsPage.jsx` Autocomplete (`getOptionLabel={(member) => member.fullname}`, ~line 185) | Renders member names in an admin-only `/link-accounts` picker | **Not named in the milestone's target features** (that page is routed separately at `/link-accounts`, not nested under `/manage`). Flagging as a same-shaped surface a future milestone/quick-task may want for consistency, but not required for v3.0 scope as defined. |

**Shared helper — why it matters.** Every surface above needs the *same* precedence decision ("this member has no Ge'ez name → show nothing extra; this member has one → show it"), and two of them (`AdminMemberTable`, `AddRelativeDialog`) need it inside a colored/truncated `<Typography noWrap>` or a `getOptionLabel` string builder. Without a shared helper, that null-check gets copy-pasted three-plus times and drifts (e.g. one surface uses `member.geezFullname`, another reconstructs it from `geezFirstname + geezLastname` because a query forgot to select `geezFullname`). A single `frontend/src/utils/displayName.js`:

```js
// Single source of truth: does this member have a Ge'ez name, and what
// string represents it? Every render surface (MemberNode, MemberCard,
// AdminMemberTable, AddRelativeDialog's Autocomplete) calls this instead
// of re-deriving the precedence rule independently.
export function getGeezName(member) {
  return member?.geezFullname || null;
}
```
keeps the precedence rule in one place and gives the roadmap a natural "build this once, before touching any render surface" phase boundary. (If a richer combined-label helper is wanted later — e.g. `formatMemberLabel(member)` returning `"Latin (Geez)"` for Autocomplete — it belongs in the same file, built on top of `getGeezName`.)

### 4. Forms — `MemberFields.jsx` + both dialogs

`MemberFields.jsx` is the single shared field block (already documented in its own header comment as reused by `AddRelativeDialog` + `EditMemberDialog` + the admin create-and-link form). Add three `TextField`s following the exact `handleTextChange(field)` pattern already used for `mothersname`:

```jsx
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
  <TextField label="First name (Ge'ez)" value={form.geezFirstname} onChange={handleTextChange('geezFirstname')} fullWidth />
  <TextField label="Last name (Ge'ez)" value={form.geezLastname} onChange={handleTextChange('geezLastname')} fullWidth />
</Stack>
<TextField label="Mother's name (Ge'ez)" value={form.geezMothersname} onChange={handleTextChange('geezMothersname')} fullWidth />
```
No special IME/transliteration wiring needed (explicitly out of scope) and no per-field font override needed — because the font is wired at the theme level (see below), the `TextField`'s default typography already resolves Ge'ez glyphs.

**`AddRelativeDialog.jsx`:** add the 3 keys to `EMPTY_FORM`. The 4 `ADD_*_MUTATION` GraphQL strings pass `newMember: form` as a **variable**, not an inline selection — so once the schema's `NewFamilyMemberInput` includes the geez fields, submitting `form` (which now has the extra keys) works with **no mutation-string edits**. The mutation *response* selections (`{ id fullname }`) don't need geez fields — the dialog discards the created record's fields beyond `id`/photo-upload and calls `onCreated()` to refetch.

**`EditMemberDialog.jsx`:** add the 3 keys to `EMPTY_FORM` and to `formFromMember()`. Optionally extend `EDIT_MEMBER_MUTATION`'s response selection set (currently `id firstname lastname fullname gender mothersname email birthdate isAlive phone address`) with `geezFirstname geezLastname geezFullname` for consistency/future optimistic-update reuse (the dialog itself discards the mutation response today, so this is not strictly required for functionality, but keeps the field-list one honest inventory rather than a partial one).

**`ManagePage.jsx`** — the field-list constants/queries that must grow:
- `EDITABLE_MEMBER_FIELDS` (feeds both `MyEditableMembers` and the focus query) → add `geezFirstname geezLastname geezFullname` (needed so `EditMemberDialog` opens pre-populated and `MemberCard`/`AdminMemberTable` can render it).
- `FAMILY_MEMBERS_QUERY` (admin table listing) → add `geezFullname`.
- `inScopeMembers` mapping — currently `.map(({ id, fullname }) => ({ id, fullname }))` in both `MemberBranch` and `AdminBranch` — must become `.map(({ id, fullname, geezFullname }) => ({ id, fullname, geezFullname }))` so `AddRelativeDialog`'s Autocomplete has the data to show it.

**`FamilyTreePage.jsx`** — `FAMILY_TREE_QUERY`'s flat selection set (currently `id firstname lastname fullname gender birthdate isAlive photoUrl mothersname address ...`) → add `geezFullname`. No change needed downstream in `familyTree.assembly.js`/`familyTree.layout.js` — confirmed by reading `familyTree.assembly.js`: it builds `nodes` as `{ id, type: 'member', data: { member } }`, passing the *entire* member object through untouched, so `geezFullname` rides along automatically as soon as it's selected in the query.

### 5. Self-hosted font

**Current state (verified in `frontend/index.html`):** the existing Latin display fonts (Inter, Sora) are loaded via a Google Fonts CDN `<link>` — *not* self-hosted. The milestone explicitly wants the Ge'ez font to be self-hosted (no external CDN), so the Ge'ez font's loading mechanism deliberately does **not** copy the existing Inter/Sora pattern; it's a new, separate mechanism living entirely in the Vite-bundled frontend.

**Recommendation (MEDIUM confidence — WebSearch-verified, not Context7, since this is a static-asset package not an API library):** use `@fontsource/noto-sans-ethiopic` (npm package, confirmed to exist on npm/fontsource.org). This is the cleanest "self-hosted, no CDN" path in a Vite project — the font files ship inside `node_modules` and get bundled/emitted into the production build automatically, with no manual `public/fonts/` asset management and no hand-written `@font-face` block to maintain.

- `frontend/package.json` (MODIFIED): add `"@fontsource/noto-sans-ethiopic"` dependency.
- `frontend/src/main.jsx` (MODIFIED): add one import, e.g. `import '@fontsource/noto-sans-ethiopic/400.css'` (plus `/700.css` if a bold weight is used anywhere Ge'ez text needs emphasis — check which weights the render surfaces actually use before pulling in more than needed).
- `frontend/src/theme.js` (MODIFIED): append the font family name to both existing stacks so Ge'ez resolves through MUI's global typography, not per-component:
  ```js
  const FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, sans-serif';
  ```
  Because CSS font-family fallback only engages a later font for *glyphs the earlier font doesn't have*, Latin text keeps rendering in Inter/Sora exactly as today, and any Ge'ez glyphs anywhere in the app (not just in the new render surfaces — any future Ge'ez text too) automatically fall through to Noto Sans Ethiopic. This is what makes the font integration "app-wide" per the milestone's own framing, with zero per-component `fontFamily` overrides needed in `MemberNode`/`MemberCard`/`AdminMemberTable`/`MemberFields`.

**Alternative considered:** manually downloading `.woff2` files into `frontend/public/fonts/` + a hand-written `@font-face` in a new `frontend/src/fonts.css`. Rejected as the primary recommendation because it duplicates what Fontsource already automates (subsetting, `font-display: swap`, multiple weight files) and adds an asset-maintenance surface with no offsetting benefit in this codebase — but it's a valid fallback if `@fontsource/noto-sans-ethiopic`'s specific glyph coverage or file size turns out to be unsuitable during implementation (flag this as a phase-time verification item, not a settled fact).

## Architectural Patterns

### Pattern 1: Optional-field passthrough (no new resolver logic)

**What:** Because `familyMember.resolver.js`'s create/update paths spread the entire sanitized input object into Sequelize (`{ ...sanitizeNewMember(newMember), createdByUserId: user.id }`), adding a GraphQL input field is sufficient to make it writable — no resolver code has to reference the new field name explicitly.
**When to use:** Any future plain-scalar FamilyMember field (this is the established pattern for `mothersname`, `email`, `phone`, `address` today).
**Trade-off:** Convenient, but means the SDL's input type shape is the *only* gate on what's writable — the migration's `018` comment and the model's field list must stay in lockstep with the SDL, or a client can submit a field that either silently no-ops (if not in the model) or throws (if in the model but not migrated on that environment).

### Pattern 2: Shared display-name helper (DRY across render surfaces)

**What:** A single `frontend/src/utils/displayName.js` function encapsulating "does this member have a Ge'ez name, what do I show." Every render surface imports it rather than inlining `member.geezFullname || null` (or worse, `` `${member.geezFirstname} ${member.geezLastname}`.trim() `` — a hand-rolled reconstruction that could drift from the backend's own `geezFullname` VIRTUAL logic).
**When to use:** Any time 2+ components need the same derived-from-optional-fields display decision.
**Trade-off:** One more file to maintain, but prevents exactly the kind of precedence-drift bug this codebase already guards against elsewhere — `ManagePage.jsx`'s `groupByRelation`/`flattenFocusedRow` centralize a similar "one function, multiple entry points" concern with an explicit code comment: *"one grouping function, two entry points (D-03)"*.

### Pattern 3: Global theme-level font fallback (not per-component overrides)

**What:** Appending the Ge'ez font name to MUI's `typography.fontFamily` chain in `theme.js`, rather than adding `sx={{ fontFamily: '"Noto Sans Ethiopic"' }}` to each of `MemberNode`/`MemberCard`/`AdminMemberTable`/`MemberFields`.
**When to use:** Whenever a font needs to resolve for a specific script across an entire MUI app, and Latin text must keep using the existing brand fonts.
**Trade-off:** Requires confirming (during implementation, via a quick visual check) that the fallback actually engages per-glyph in every browser targeted — this is standard CSS `font-family` list behavior, but worth a quick manual verification pass since it's the only part of this milestone that isn't purely mechanical code wiring.

## Anti-Patterns to Avoid

### Anti-Pattern 1: MySQL-8-only DDL syntax in the manual migration

**What people do:** Copy a `COLLATE utf8mb4_0900_ai_ci` or an `ENCRYPTION='Y'`/`ENCRYPTION='N'` clause from MySQL 8 documentation or from a tool that generated the DDL against a MySQL-8-only server.
**Why it's wrong:** `utf8mb4_0900_ai_ci` is a MySQL-8-exclusive collation (introduced with MySQL 8's new Unicode 9.0 collations) and is rejected by MariaDB with an unknown-collation error; `ENCRYPTION` as an `ALTER TABLE`/`CREATE TABLE` option is likewise a MySQL/Percona/AWS-specific InnoDB feature not present in vanilla MariaDB's grammar. Since this app runs MariaDB locally in some environments and MySQL 8.4 in prod/Docker (per the milestone context), a migration using either would apply cleanly on one and fail hard on the other.
**Instead:** Use `CHARACTER SET utf8mb4` with no explicit `COLLATE` (inherits the table's default collation for that charset on both engines), and never add an `ENCRYPTION` clause to this migration.

### Anti-Pattern 2: Reconstructing the Ge'ez display name per-component

**What people do:** In each render surface, write `` `${member.geezFirstname ?? ''} ${member.geezLastname ?? ''}`.trim() || null `` instead of using the backend's already-computed `geezFullname`.
**Why it's wrong:** Duplicates the precedence/joining logic in N places; if the backend's `geezFullname` getter logic ever changes (e.g. incorporates a Ge'ez middle name later), every frontend call site would need updating in lockstep, and it's easy to miss one — silently producing an inconsistent name for the same member across the tree view vs. the manage table.
**Instead:** Always select `geezFullname` in the GraphQL query and read it through the shared `getGeezName(member)` helper.

### Anti-Pattern 3: Forgetting `OPTIONAL_FAMILY_MEMBER_FIELDS`

**What people do:** Add the geez fields to the GraphQL input types and the model, ship it, and consider the backend done.
**Why it's wrong:** `sanitizeNewMember()` in `user.resolver.js` is the *only* place blank-string-to-null conversion happens for optional FamilyMember text fields. Skipping this means clearing a Ge'ez field via the edit form persists `''` instead of `null` — functionally harmless today (no validator fires on these fields, unlike `email`), but a silent inconsistency with how every other optional field on this model behaves, and a trap for any future SQL `WHERE geezFirstname IS NULL` query or truthiness check that assumes null, not empty string.

## Build Order (dependency-ordered, for roadmap phase derivation)

1. **Migration + model** — `018-*.sql` migration, applied to local + any staging/prod DB; `FamilyMember.js` model additions (3 columns + `geezFullname` VIRTUAL). Nothing above this layer can be built/tested without it.
2. **GraphQL** — schema type/input additions (`familyMember.schema.js`) + `OPTIONAL_FAMILY_MEMBER_FIELDS` update (`user.resolver.js`). No resolver-map changes needed in `familyMember.resolver.js` itself (confirmed passthrough). This is the natural point for backend-side tests (create/edit a member with Ge'ez fields, verify blank→null, verify `geezFullname` resolves).
3. **Font** — `@fontsource/noto-sans-ethiopic` dependency + `main.jsx` import + `theme.js` fallback-chain update. Independent of steps 1-2 and of the shared helper; can be built and visually verified (paste Ge'ez text into any existing MUI `Typography` and confirm it renders) before any frontend data-plumbing exists.
4. **Shared display-name helper** — `frontend/src/utils/displayName.js`. Depends on nothing but is a prerequisite for step 5 (every render surface imports it) — build it before touching any component, per the milestone's own "avoid duplicating precedence logic" concern.
5. **Render surfaces** — `MemberNode.jsx`, `MemberCard.jsx`, `AdminMemberTable.jsx`, `AddRelativeDialog.jsx`'s Autocomplete, plus the query/selection-set updates each depends on (`FamilyTreePage.jsx`'s `FAMILY_TREE_QUERY`, `ManagePage.jsx`'s `EDITABLE_MEMBER_FIELDS`/`FAMILY_MEMBERS_QUERY`/`inScopeMembers` mapping). `RelationshipGroupedPanel.jsx` needs no change and can be skipped entirely.
6. **Forms** — `MemberFields.jsx` (3 new TextFields) → `AddRelativeDialog.jsx` + `EditMemberDialog.jsx` (`EMPTY_FORM`, `formFromMember()`, optional mutation selection-set additions in `EditMemberDialog.jsx`). Placed last because the forms are how Ge'ez data *enters* the system, but rendering (step 5) can and should be verified first against manually-seeded DB rows (or via a direct GraphQL mutation in a test/console) before wiring up the UI that lets end users type Ge'ez text themselves — this matches the app's existing test-first convention of proving data flow before UI.

This order lets phase boundaries fall cleanly at 1→2 (data+API, backend-only, testable via resolver/integration tests without touching React at all) and 3→4→5→6 (frontend, font infra → shared logic → passive rendering → active data-entry), which mirrors how this repo's prior phases (12 "data model foundation" before 14 "resolvers" before 15 "self-service UI") were sequenced.

## Sources

- Direct repo reads (HIGH confidence — all integration points above are verified against the actual files, not inferred):
  - `backend/src/models/FamilyMember.js`, `backend/src/schemas/familyMember.schema.js`, `backend/src/resolvers/familyMember.resolver.js`, `backend/src/resolvers/user.resolver.js`
  - `backend/migrations/manual/013-add-family-members-profile-picture.sql`, `014-add-family-members-isalive-and-provenance.sql`, `016-create-invitations.sql` (manual-migration convention + charset precedent)
  - `frontend/src/components/manage/MemberFields.jsx`, `MemberCard.jsx`, `AdminMemberTable.jsx`, `AddRelativeDialog.jsx`, `EditMemberDialog.jsx`, `RelationshipGroupedPanel.jsx`
  - `frontend/src/components/family/MemberNode.jsx`, `familyTree.assembly.js`
  - `frontend/src/pages/ManagePage.jsx`, `FamilyTreePage.jsx`, `LinkAccountsPage.jsx`, `App.jsx` (route table)
  - `frontend/src/theme.js`, `frontend/index.html` (current Google-Fonts-CDN pattern), `frontend/vite.config.js`
  - `.planning/PROJECT.md` (v3.0 milestone scope), `.planning/codebase/STACK.md`, `.planning/codebase/INTEGRATIONS.md` (MySQL 8.4 Docker image confirmation)
- WebSearch (MEDIUM confidence, static-asset package not covered by Context7): [@fontsource-variable/noto-serif-ethiopic - npm](https://www.npmjs.com/package/@fontsource-variable/noto-serif-ethiopic), [Noto Sans Ethiopic | Install | Fontsource](https://fontsource.org/fonts/noto-sans-ethiopic/install), [Noto Sans Ethiopic | Fontsource](https://fontsource.org/fonts/noto-sans-ethiopic)

---
*Architecture research for: Ge'ez native-script name fields + self-hosted webfont integration (v3.0 milestone)*
*Researched: 2026-07-30*
