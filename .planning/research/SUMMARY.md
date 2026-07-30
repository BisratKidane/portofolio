# Project Research Summary

**Project:** Portfolio Auth App — v3.0 Ge'ez Native-Script Names
**Domain:** Brownfield addition of optional native-script (Ge'ez/Ethiopic) name fields + a self-hosted Ethiopic webfont, layered onto an existing React 18.3 + MUI 6.3 + Vite 6 frontend and Express + Apollo + Sequelize + MySQL/MariaDB backend
**Researched:** 2026-07-30
**Confidence:** HIGH

## Executive Summary

This milestone is a narrow, additive feature on a mature, well-tested app: give `FamilyMember` records an optional Ge'ez-script name (three nullable columns + a derived virtual `geezFullname`), render it wherever the Latin name already renders, and make sure it actually displays correctly on every device via a self-hosted webfont. All four research tracks converge on the same shape of answer — nothing about this milestone requires new architecture, new backend dependencies, or a new data-modeling pattern; it requires careful reuse of patterns this codebase already has (VIRTUAL getters, optional-field passthrough resolvers, manual `.sql` migrations, conditional-render idioms) plus two genuinely new concerns: picking and correctly wiring a self-hosted font, and getting the MySQL-8-vs-MariaDB migration DDL portable.

The clear stack recommendation is `@fontsource/noto-sans-ethiopic` (pinned `5.3.0`, static `ethiopic-400`/`ethiopic-700` subset), imported once in `main.jsx` and appended to **both** `theme.js` font-stack constants (`FONT_SANS` and `FONT_DISPLAY`) ahead of any OS-fallback font — not a CDN `<link>`, not the variable-font package, not a new bundler plugin. Storage is two/three plain `VARCHAR(255) CHARACTER SET utf8mb4` columns added via a new hand-written manual migration (`018-*.sql`), explicitly avoiding any MySQL-8-only collation or `ENCRYPTION` clause so the same file applies cleanly to both the MariaDB (local) and MySQL 8.4 (prod) engines this app already straddles. Display follows a firm, already-decided UX rule — Latin name always on top, Ge'ez name stacked underneath only when present, no toggle, LTR (Ge'ez is not RTL) — reusing the exact conditional-render idiom `MemberNode.jsx` already uses for optional fields like birthday/mother/address.

The main risks are not architectural but *verification* risks: (1) a font subsetting tool or a copy-pasted recipe silently shipping Latin-only or an Amharic-biased glyph set that drops Tigrinya-specific letters, invisible in local smoke-testing on a Mac (which has broad OS Unicode coverage masking the bug); (2) the fixed 252×120px tree card, already tight for Latin `noWrap` text, truncating a genuinely longer/wider-glyphed Ge'ez name harder than expected; (3) the MUI Autocomplete relative-picker's default filter only matching `getOptionLabel` (Latin `fullname`), meaning Ge'ez text typed into the search box will find nothing unless a custom `filterOptions` is added; and (4) a naive port of the existing `fullname` template-literal join producing stray spaces, `"null null"` literal strings, or an empty string instead of `null` when only some Ge'ez name parts are filled. All four are cheap to prevent (real Tigrinya-name test fixtures, a manual visual pass on `/family` specifically, a `createFilterOptions` extension, and a defensive `.filter(Boolean).join(' ') || null` getter) but easy to miss if treated as "just add a column and a Typography line."

## Key Findings

### Recommended Stack

The only new dependency this milestone needs is one npm package: `@fontsource/noto-sans-ethiopic@5.3.0` (frontend workspace only). Both candidate fonts (Noto Sans Ethiopic and Abyssinica SIL) were downloaded and inspected directly from their npm tarballs — both are OFL-1.1 licensed, both cover all five Ethiopic Unicode blocks in a single ~75 KB subset file at comparable size. Noto Sans Ethiopic wins on two concrete points: it ships a 700 (bold) weight (Abyssinica SIL is regular-only, and this app's `h1`–`h6` use `fontWeight: 700–800`), and its sans-serif design visually pairs with the app's existing Inter/Sora sans stack rather than Abyssinica SIL's calligraphic/manuscript style. No backend package is needed — `mysql2` already defaults to `utf8mb4` and Sequelize's `DataTypes.STRING` is charset-agnostic.

**Core technologies:**
- `@fontsource/noto-sans-ethiopic@5.3.0` (static, `ethiopic-400.css` + optionally `ethiopic-700.css`): self-hosted Ge'ez webfont — OFL-licensed, full Ethiopic coverage in one subset file, `font-display: swap` built in, zero CDN, resolved natively by Vite 6 from `node_modules` with no config changes
- No new bundler plugin, font-loading library, or backend package — explicitly avoid `vite-plugin-webfont-dl`, `fontfaceobserver`, `@fontsource-variable/noto-sans-ethiopic`, and any Google Fonts CDN `<link>` (the existing Inter/Sora CDN `<link>` in `index.html` is a separate, pre-existing concern — do not compound it by loading the new font the same way)
- Storage: two/three new nullable `VARCHAR(255) CHARACTER SET utf8mb4` columns on `family_members`, no explicit `COLLATE` (neither MySQL 8.4 nor MariaDB ships an Ethiopic-specific collation, and the field is display-only, never sorted/compared) — same pattern as existing manual migrations `013`/`016`/`017`

### Expected Features

The confirmed display rule (per PROJECT.md and cross-validated in FEATURES.md against Unicode/CLDR conventions) is: **Latin-primary, Ge'ez-secondary, stacked two-line display, rendered only when present — no toggle, ever.** Ge'ez script is LTR (unlike Arabic/Hebrew), so no `dir`/bidi wrapping is needed — only a `lang="ti"` attribute on each Ge'ez text run, for both accessibility and font-fallback correctness.

**Must have (table stakes):**
- Ge'ez name renders on the `/family` tree card (`MemberNode.jsx`) — the milestone's core goal, and the layout-costliest surface (fixed 120px card, already 3–4 conditional rows deep)
- Same stacked display across `/manage` (relationship panels via `MemberCard`, `AdminMemberTable` name cell, Autocomplete option rendering) — cheaper here, more room
- Graceful empty handling — no member without a Ge'ez name shows any artifact (blank row, stray separator, empty parens); conditional-render the whole element, never just its contents
- `geezFullname` derived the same way as `fullname` (VIRTUAL getter mirroring the existing pattern, but defensively — see Pitfalls)
- `lang="ti"` on every rendered Ge'ez text run
- Search matches Ge'ez text: trivial `.includes()` extension for the admin table; requires a **custom `filterOptions`** (via `createFilterOptions`) for the Autocomplete relative-picker, since MUI's default filter only matches the `getOptionLabel` string (which stays Latin-only for the visible label)

**Should have (differentiators, P2, no trigger defined for this milestone):**
- Mother's Ge'ez name shown as a secondary line in the tree-card mother row when available
- Ge'ez name included in the tree card's `aria-label` for screen readers

**Defer (explicit anti-features this milestone):**
- Latin↔Ge'ez display toggle — explicitly rejected per PROJECT.md
- Auto-transliteration input helper — rely on the member's own device IME
- Per-field language tagging / user-configurable locale picker
- Full UI i18n (translating labels/buttons)
- Ge'ez-aware sort/collation of member lists — the app has no name-based sort today; don't introduce one as a side effect of this milestone
- RTL/bidi handling — not applicable to Ge'ez script

### Architecture Approach

This is a thin, mostly-passthrough addition to an already-established layering. Because `familyMember.resolver.js`'s create/update paths spread the *entire* sanitized input object into Sequelize rather than allow-listing fields, adding the three Ge'ez fields to the GraphQL input types (`NewFamilyMemberInput`/`EditFamilyMemberInput`) makes them writable with **zero resolver-map changes** — the only resolver-adjacent change needed is adding the three field names to `OPTIONAL_FAMILY_MEMBER_FIELDS` in `user.resolver.js` so blank-string-to-null trimming applies consistently with every other optional field. `geezFullname` needs no explicit GraphQL resolver function either — Apollo's default property resolver reads it straight off the Sequelize VIRTUAL getter, exactly like `fullname` today.

**Major components:**
1. **Manual migration `018-*.sql`** — adds 3 nullable `utf8mb4` columns to `family_members`, portable to both MySQL 8.4 and MariaDB (no `COLLATE`, no `ENCRYPTION`); `sequelize.sync()` never alters existing tables, so this is a hard prerequisite for everything else
2. **`FamilyMember.js` model** — 3 new `DataTypes.STRING` attrs + a `geezFullname` VIRTUAL getter that must filter falsy parts before joining (not a naive template-literal port of `fullname`)
3. **GraphQL schema + `OPTIONAL_FAMILY_MEMBER_FIELDS`** — type/input additions, one array update; no other resolver code changes
4. **`frontend/src/utils/displayName.js` (new shared helper)** — single source of truth (`getGeezName(member)`) for "does this member have a Ge'ez name," imported by every render surface instead of each component re-deriving the precedence rule (explicitly called out as a DRY/drift-prevention pattern, analogous to `ManagePage.jsx`'s existing "one grouping function, two entry points" convention)
5. **Font wiring** — `@fontsource` import in `main.jsx` + both `theme.js` font-stack constants (`FONT_SANS` and `FONT_DISPLAY`) updated, so Ge'ez resolves app-wide through MUI's global typography rather than per-component overrides
6. **Render surfaces** — `MemberNode.jsx`, `MemberCard.jsx`, `AdminMemberTable.jsx`, `AddRelativeDialog.jsx`'s Autocomplete (option label/filter), each modified to call the shared helper; `RelationshipGroupedPanel.jsx` and the forest-assembly module (`familyTree.assembly.js`) need **no changes** since they pass the whole `member` object through untouched
7. **Forms** — `MemberFields.jsx` (3 new TextFields, no IME/transliteration wiring needed) feeding `AddRelativeDialog.jsx`/`EditMemberDialog.jsx`'s `EMPTY_FORM`/`formFromMember()`

Verified build order (data → API → font → shared helper → passive rendering → active forms) mirrors how this repo's prior v2.0 phases were sequenced (data model foundation before resolvers before self-service UI).

### Critical Pitfalls

1. **Font subsetting/tooling silently drops Tigrinya-specific glyphs (e.g. ቨ *va*, ቐ *qha*)** — a generic "self-host Google Fonts" recipe defaults to a Latin-only or Amharic-biased subset; Tigrinya's labialized consonant forms live in the *main* Ethiopic block (U+1200–137F, not the Supplement U+1380–139F, correcting a milestone-brief assumption) and won't show up in Amharic-only test text. **Avoid by:** verifying against real Tigrinya family names from the actual dataset, not generic Ethiopic sample text; ship the font unsubsetted (it's already script-scoped and small) rather than running it through another subsetting pass.
2. **`sequelize.sync()` won't add the new columns** — this app's DB changes are always hand-applied `.sql` files (`backend/migrations/manual/`); skipping the migration or only updating the model causes `Unknown column` errors in prod/staging on first touch, exactly the failure mode already documented for prior migrations (009/011/014/015). **Avoid by:** following the established `018-*.sql` numbering/header convention and adding it to README's manual-migration list.
3. **MySQL-8-only DDL breaks MariaDB** — a migration copy-pasted from a MySQL 8 `SHOW CREATE TABLE` dump (`utf8mb4_0900_ai_ci` collation, `ENCRYPTION=...`) fails outright on MariaDB, which this app runs locally while prod runs MySQL 8.4. **Avoid by:** `CHARACTER SET utf8mb4` with no explicit `COLLATE`, no `ENCRYPTION` clause, and test-running the exact `.sql` file against both engines before calling it done.
4. **Naive `geezFullname` getter mishandles partial fill** — porting `fullname`'s unconditional template-literal join (`${a} ${b}`) to fields that are all optional (unlike required `firstname`/`lastname`) produces trailing spaces, literal `"null"`/`"undefined"` strings, or `""` instead of `null`. **Avoid by:** `[geezFirstname, geezLastname].filter(Boolean).join(' ') || null`, unit-tested across the none/first-only/last-only/all matrix.
5. **Fixed-width tree card (252×120px) truncates Ge'ez text harder than Latin at the same character count** — Ethiopic block-style glyphs are visually wider than Latin letters at the same font size, and this is the most width-constrained render surface. **Avoid by:** a mandatory manual visual pass against the longest real Ge'ez name in the actual dataset (jsdom/Vitest cannot detect glyph rendering or truncation — this is explicitly a human-verification item, not an automatable one).
6. **Autocomplete search silently excludes Ge'ez text** — MUI's default filter matches only `getOptionLabel`'s string (kept Latin-only per the no-toggle decision), so a family member searching by the Ge'ez name they know a relative by finds nothing. **Avoid by:** a custom `filterOptions` (via `createFilterOptions` with a combined `fullname`+`geezFullname` stringify) decoupled from the unchanged Latin-only `getOptionLabel`.

## Implications for Roadmap

Based on combined research, the dependency-ordered build order from ARCHITECTURE.md maps directly onto phase boundaries:

### Phase 1: Data Model & Migration
**Rationale:** Nothing above this layer (GraphQL, frontend) can be built or tested without the columns existing; this is also where the trickiest cross-engine (MySQL-8-vs-MariaDB) migration risk lives and should be resolved in isolation.
**Delivers:** `backend/migrations/manual/018-add-family-members-geez-names.sql` (3 nullable `utf8mb4` columns, no `COLLATE`/`ENCRYPTION`, portable to both engines) applied to local + staging/prod; `FamilyMember.js` model updated with the 3 attrs + a defensively-written `geezFullname` VIRTUAL getter (`filter(Boolean).join(' ') || null`), unit-tested across the full fill-combination matrix.
**Addresses:** the `geezFullname` derived-field feature (FEATURES.md table stakes); the model-level prerequisite for every render/search feature below.
**Avoids:** Pitfalls 2 (`sync()` doesn't alter tables), 3 (MySQL-8-only DDL breaks MariaDB), 4 (default collation doesn't help/hurt — document, don't chase), 9 (naive getter join bugs).

### Phase 2: GraphQL Layer
**Rationale:** Thin, mechanical, and independently testable via resolver/integration tests without touching React — matches this app's TDD convention of proving data flow before UI.
**Delivers:** Schema type/input additions (`familyMember.schema.js`) exposing `geezFirstname`/`geezLastname`/`geezMothersname`/`geezFullname`; `OPTIONAL_FAMILY_MEMBER_FIELDS` updated in `user.resolver.js` for blank-to-null sanitization. No `familyMember.resolver.js` changes needed (confirmed passthrough).
**Uses:** the "optional-field passthrough" architectural pattern already established for `mothersname`/`email`/`phone`/`address`.
**Implements:** ARCHITECTURE.md's Pattern 1 (no new resolver logic needed given the existing spread-based create/update).

### Phase 3: Self-Hosted Font & Theme Integration
**Rationale:** Independent of Phases 1–2 and of the shared display helper — can be built and visually verified (paste Ge'ez text into any existing `Typography`) before any Ge'ez data-plumbing exists at all. Also the phase carrying the highest "looks done but isn't" risk (font subsetting, FOUT/FOIT, CDN-vs-self-host, MUI variant-level `fontFamily` overrides), so it benefits from being isolated and given its own acceptance gate.
**Delivers:** `@fontsource/noto-sans-ethiopic@5.3.0` installed; one import in `main.jsx`; both `theme.js` font-stack constants (`FONT_SANS` and `FONT_DISPLAY`) updated with `"Noto Sans Ethiopic"` inserted ahead of any OS-fallback font.
**Addresses:** the "consistent rendering regardless of viewer's OS fonts" milestone goal (FEATURES.md/PROJECT.md).
**Avoids:** Pitfalls 1 (subsetting drops Tigrinya glyphs — verify against real Tigrinya fixtures), 5 (FOUT/FOIT flicker on the tree specifically), 6 (font path typo silent 404), 7 (accidentally adding a second CDN-loaded font), 8 (font stack applied to only one of `FONT_SANS`/`FONT_DISPLAY`).

### Phase 4: Shared Display Helper
**Rationale:** A small, standalone prerequisite for Phase 5 — building it first prevents the precedence-drift bug (each render surface re-deriving "does this member have a Ge'ez name" slightly differently) that PITFALLS.md and ARCHITECTURE.md both flag as the most likely quiet drift point.
**Delivers:** `frontend/src/utils/displayName.js` exporting `getGeezName(member)`, unit-tested, with the `lang="ti"` attribute baked in at this shared layer so every consumer gets it for free.
**Implements:** ARCHITECTURE.md's Pattern 2 (shared display-name helper).

### Phase 5: Render Surfaces (Display, Read Path)
**Rationale:** Should land before the forms (Phase 6) so Ge'ez rendering can be verified against manually-seeded/direct-mutation data first, matching this app's existing test-first convention of proving data flow before wiring up end-user input.
**Delivers:** Stacked Ge'ez name rendering on `MemberNode.jsx` (tree card), `MemberCard.jsx` (manage relationship rows), `AdminMemberTable.jsx` (admin table name cell), plus the query/selection-set updates each depends on (`FamilyTreePage.jsx`'s `FAMILY_TREE_QUERY`, `ManagePage.jsx`'s `EDITABLE_MEMBER_FIELDS`/`FAMILY_MEMBERS_QUERY`/`inScopeMembers` mapping). Admin-table Ge'ez substring search added here too (trivial `.includes()` extension).
**Addresses:** FEATURES.md's P1 items — tree card display, `/manage` display, graceful empty handling, `lang` attribute, admin table search.
**Avoids:** Pitfall 10 (fixed-width tree card truncation — mandatory manual visual pass against the longest real Ge'ez name), Pitfall 11 (missing `lang`), the "empty state renders a stray separator" UX pitfall.

### Phase 6: Autocomplete Search + Forms (Write Path)
**Rationale:** Placed last — this is how Ge'ez data *enters* the system, and rendering should be provably correct first. The Autocomplete `filterOptions` work is scoped separately from its `getOptionLabel` (which stays Latin-only) since they solve different problems (search vs. display).
**Delivers:** `AddRelativeDialog.jsx`'s Autocomplete gets a custom `filterOptions` (via `createFilterOptions`) matching Ge'ez text without changing the visible Latin-only option label; `MemberFields.jsx` gets 3 new TextFields (no IME/transliteration wiring); `AddRelativeDialog.jsx`/`EditMemberDialog.jsx` get `EMPTY_FORM`/`formFromMember()` updates.
**Addresses:** FEATURES.md's Autocomplete search table-stake item; the "enter/edit via existing dialogs, own device IME" milestone goal.
**Avoids:** the Autocomplete search-gap UX pitfall (searching by a known Ge'ez name finding nothing).

### Phase Ordering Rationale

- Data → API → Font → Helper → Render → Forms mirrors dependency direction exactly as mapped in ARCHITECTURE.md's "Build Order" section, and lets Phase 1→2 be verified backend-only (resolver/integration tests, no React) before any frontend work starts.
- Font (Phase 3) is deliberately decoupled and sequenced early/independent because it has zero data dependency and the highest number of distinct "looks done but isn't" pitfalls (6 of 11 pitfalls in PITFALLS.md are font/theme-integration-phase issues) — isolating it lets its acceptance criteria (manual glyph verification, network-trace CDN check) be gated cleanly rather than diluted across a later, busier phase.
- Rendering (Phase 5) before forms (Phase 6) matches this repo's established test-first convention (seed/mutate data directly, prove rendering, then wire up user-facing input) and avoids conflating "does the UI render Ge'ez correctly" bugs with "does the form correctly submit Ge'ez text" bugs.

### Research Flags

Needs research/deeper planning-phase attention:
- **Font & Theme phase:** MEDIUM confidence on file-size/subsetting specifics beyond what STACK.md already verified by downloading tarballs — the FOUT/FOIT `font-display` choice (`swap` vs `optional`) and whether a `<link rel="preload">` is warranted for the `/family` tree specifically is a judgment call best made with a quick visual spike, not settled by research alone.
- **Autocomplete search phase:** MEDIUM confidence per FEATURES.md — "based on documented MUI `Autocomplete` default-filter behavior, not yet prototyped." Recommend a quick spike/prototype of `createFilterOptions` before committing to a specific implementation shape in the phase plan.

Phases with well-documented, standard patterns (skip deep research, proceed directly to planning):
- **Data Model & Migration:** the manual-migration convention, VIRTUAL-getter pattern, and MySQL-8/MariaDB-portable DDL shape are all fully precedented in this repo (013/014/016/017) and fully specified in STACK.md/ARCHITECTURE.md.
- **GraphQL Layer:** confirmed zero-resolver-code-change passthrough; purely mechanical schema/array edits.
- **Shared Helper:** trivial, fully specified function signature and precedence rule already given in ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Font package license, glyph coverage, and file sizes verified by downloading and inspecting actual npm tarballs; MySQL/MariaDB charset coverage verified against official reference manuals. Only the `mysql2` default-charset claim is MEDIUM (WebSearch-only, not doc-line-quoted), and is optionally closeable with a one-line defensive `dialectOptions.charset` pin. |
| Features | HIGH for display precedence/empty-handling/directionality (Unicode/CLDR + existing codebase idioms); MEDIUM for Autocomplete search implementation cost (documented MUI behavior, not yet prototyped) |
| Architecture | HIGH — every integration point (model, schema, resolver, each render surface, each query/selection-set constant) verified against the actual files in this repo, not general framework docs |
| Pitfalls | MEDIUM-HIGH — font/Unicode facts verified against Unicode charts and Noto documentation; DB/migration facts verified against this repo's own prior incidents and official collation docs; jsdom/Vitest testing-limits facts are HIGH (direct tool behavior) |

**Overall confidence:** HIGH

### Gaps to Address

- **Ethiopic Unicode block for Tigrinya labialized forms:** the milestone brief's original framing (Ethiopic Supplement, U+1380–139F) was incorrect; PITFALLS.md's correction (main Ethiopic block, U+1200–137F) is authoritative and should be the reference used for any font-fixture/acceptance-check language written into phase plans.
- **Whether Ge'ez search is truly in scope for the Autocomplete picker vs. the admin table only:** FEATURES.md treats both as P1 table stakes per the milestone's own framing ("this feature exists specifically for a Tigrinya/Eritrean family"), but PITFALLS.md flags this as worth an explicit "yes, in scope" confirmation rather than an assumption — resolve during requirements definition, not left implicit.
- **`lang` tag value (`ti` vs `am` vs generic `gez`):** PROJECT.md frames this as serving "the Tigrinya/Eritrean family," making `lang="ti"` the researched recommendation, but this is a one-line product confirmation worth capturing explicitly in REQUIREMENTS.md rather than assumed silently in code.
- **Font-display strategy (`swap` vs `optional`) and whether to `preload` the Ethiopic woff2 on `/family`:** left as an implementation-time visual-verification decision in both STACK.md and PITFALLS.md, not resolved by research — flag for a quick visual spike during the Font & Theme phase rather than pre-deciding in the roadmap.
- **`LinkAccountsPage.jsx`'s Autocomplete (`/link-accounts`):** ARCHITECTURE.md notes this surface has the identical `getOptionLabel={(member) => member.fullname}` shape as `AddRelativeDialog.jsx` but is not named in the milestone's target features (routed separately, not nested under `/manage`) — explicitly out of this milestone's scope per current PROJECT.md wording, flagged as a candidate follow-up rather than silently included or silently dropped.

## Sources

### Primary (HIGH confidence)
- `google/fonts` GitHub repo, `ofl/notosansethiopic/METADATA.pb` — license, supported languages, source version
- npm registry package metadata + downloaded tarballs for `@fontsource/noto-sans-ethiopic@5.3.0` and `@fontsource/abyssinica-sil@5.3.0` — exact file sizes, weights, `unicode-range`, `font-display`, license files
- MySQL 8.4 Reference Manual §12.10.1 "Unicode Character Sets" — `utf8mb4` BMP + supplementary-plane coverage, confirmed no Ethiopic-specific collation
- Unicode Ethiopic block chart (U1200.pdf), Ethiopic Supplement chart (U1380.pdf), Wikipedia Ethiopic (Unicode block)/Ethiopic Supplement/Ethiopic Extended-A — corrects the labialized-forms block location
- Direct repo reads (all four research files independently verified against): `backend/src/models/FamilyMember.js`, `backend/src/schemas/familyMember.schema.js`, `backend/src/resolvers/familyMember.resolver.js`, `backend/src/resolvers/user.resolver.js`, `backend/migrations/manual/013/014/016/017-*.sql`, `frontend/src/components/family/MemberNode.jsx`, `frontend/src/components/manage/*.jsx`, `frontend/src/pages/ManagePage.jsx`/`FamilyTreePage.jsx`/`LinkAccountsPage.jsx`, `frontend/src/theme.js`, `frontend/index.html`, `frontend/vite.config.js`, `docker-deploy/Caddyfile`, `.planning/PROJECT.md`

### Secondary (MEDIUM confidence)
- WebSearch: `mysql2` driver default connection charset defaults to `utf8mb4` — no single authoritative doc line quoted, consistent with existing working data
- WebSearch: MUI `Autocomplete` default-filter behavior (matches `getOptionLabel` only) — documented behavior, not verified against the installed MUI version's source directly
- `software.sil.org/abyssinica/charset/` — Abyssinica SIL's own stated Unicode block coverage claims

### Tertiary (LOW confidence)
- None identified — all findings across the four research files were either HIGH (direct source/tarball/repo verification) or explicitly flagged MEDIUM with a stated reason above.

---
*Research completed: 2026-07-30*
*Ready for roadmap: yes*
