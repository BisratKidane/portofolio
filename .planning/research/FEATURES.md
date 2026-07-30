# Feature Research

**Domain:** Bilingual / native-script (Ge'ez) name display in an existing family-tree app
**Researched:** 2026-07-30
**Confidence:** HIGH (display precedence, empty handling, script directionality — verified against Unicode/CLDR conventions and existing codebase patterns); MEDIUM (search/picker implementation cost — verified against documented MUI Autocomplete behavior, not yet prototyped)

> Supersedes the v2.0 collaborative-family-tree feature research previously in this file. This research covers only the v3.0 Ge'ez Native-Script Names milestone — see `.planning/PROJECT.md` "Current Milestone: v3.0" for the confirmed target features this builds on.

## Recommended Display Behavior (firm recommendation)

**Latin-primary, Ge'ez-secondary, stacked two-line display, rendered only when present. No toggle, ever — there is only one rendering mode.**

```
Fullname (Latin)        ← always present, unchanged from today
ገዕዝ ስም (Ge'ez)           ← only rendered when geezFullname is non-empty
```

Concretely: a second `<Typography>` line directly beneath the existing fullname line, conditionally rendered exactly the way `MemberNode.jsx` already conditionally renders `birthday`/`motherName`/`address` (`{birthday && <Typography>...}`) and the way `RelationshipGroupedPanel.jsx` conditionally renders `{onAdd && <Button>...}`. This is the codebase's established idiom for optional rows — not a new pattern.

**Why stacked, not inline "Latin / ገዕዝ":**
- A slash or parenthetical reads as *either/or alternatives to pick between* (which invites "why can't I toggle?" confusion) rather than *primary name + supplementary script*. The Wikipedia infobox convention (`Template:Native_name`) and Unicode LDML person-name guidance both favor a primary-name-plus-subordinate-native-form layout over slash/parenthetical concatenation for exactly this reason.
- Tree cards already truncate with `noWrap` in a fixed 252×120px card; concatenating two scripts onto one line risks silently clipping the Ge'ez portion. Stacking avoids that failure mode and reuses the same two-line pattern everywhere (tree card, admin table name cell, Autocomplete option row — MUI's own `ListItemText` primary/secondary idiom).

**Why Latin always first/on top:** Latin is the confirmed "always-present, primary" identity for this milestone (per PROJECT.md decisions); Ge'ez is optional supplementary metadata. Keeping Latin's position fixed and Ge'ez always subordinate avoids the visual implication that the two fields are independently orderable or user-selectable, which is exactly the toggle behavior this milestone explicitly excludes.

**Empty-state rule:** When `geezFullname` (or the individual geez field being rendered) is null/empty, render **nothing** — no second line, no empty parens `()`, no stray `/` or `—` separator. Conditional-render the whole secondary element, never conditional-render just its contents. This must be verified per-surface (tree card, `MemberCard` relationship rows, `AdminMemberTable` name cell, Autocomplete `getOptionLabel`/option rendering) since each currently builds its Latin name string differently.

## Feature Landscape

### Table Stakes (required for this milestone to feel complete)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ge'ez name renders on `/family` tree card when present | The milestone's stated goal (PROJECT.md target feature #4) — a Ge'ez name that only shows in `/manage` and never on the tree itself would defeat the point of a family *tree* feature | MEDIUM | `MemberNode.jsx` fullname row (line 189-191) is a single `noWrap` `<Typography>` inside an already height-constrained 120px card with 3 more conditional rows below it (birthday, mother, address). Adding a second name line needs either a taller card or tighter row spacing — a real layout cost, not just adding a prop. |
| Ge'ez name renders across `/manage` (relationship panels, admin table, pickers) | Same milestone goal, applies to every surface that currently shows `fullname` | LOW–MEDIUM | `RelationshipGroupedPanel.jsx`/`MemberCard` and `AdminMemberTable.jsx` (line 111-114, the `Typography` showing `member.fullname`) have more horizontal/vertical room than the tree card, so the stacked line is a cheaper add here. |
| Graceful empty handling (no name has no Ge'ez) | A family with 9+ members where Ge'ez names are entered incrementally must never show a broken/empty artifact for the members who don't have one yet | LOW | Conditional-render the whole secondary line/element, following the exact pattern already used for `birthday`/`motherName`/`address` in `MemberNode.jsx`. |
| `geezFullname` derived the same way as `fullname` | Confirmed decision (PROJECT.md) — mirrors the existing VIRTUAL pattern so it behaves consistently (auto-updates on firstname/lastname edit, empty when both parts are empty) | LOW | Direct analog of the existing Sequelize VIRTUAL getter for `fullname`; same derivation logic, different source columns. |
| `lang` attribute on every Ge'ez text run | Correct screen-reader pronunciation, correct font-fallback selection if the self-hosted webfont fails a given codepoint, and signals to assistive tech that this run is a different language than the surrounding Latin UI | LOW | `lang="ti"` (Tigrinya) is the right BCP-47 primary tag for this family's names; the `Ethi` script subtag is implied by the language in the common case and doesn't need to be explicit unless the surrounding context is ambiguous. Apply at the `<Typography>` element wrapping the Ge'ez run, not the whole card. |
| Search matches Ge'ez text in the admin table and Autocomplete pickers | This feature exists specifically for a Tigrinya/Eritrean family; a family member typing a name in Ge'ez via their own IME and getting zero search results (while the record demonstrably exists) reads as the feature being broken, not as an omission | LOW (admin table) / LOW–MEDIUM (Autocomplete) | `AdminMemberTable.jsx` line 56-58 filters `member.fullname.toLowerCase().includes(...)` — trivially extend to also check `member.geezFullname`. `AddRelativeDialog.jsx` line 243-248's `<Autocomplete>` relies on MUI's **default** filter, which matches only the string returned by `getOptionLabel` (`member.fullname`); Ge'ez text will not match unless a custom `filterOptions` (via `createFilterOptions` with a `stringify` combining `fullname` + `geezFullname`) is supplied. Ge'ez script has no case, so this is a substring/`includes` match, not a `.toLowerCase()` one. |

### Differentiators (nice-to-have polish, not required for completeness)

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Mother's Ge'ez name shown as the tree-card mother row when available | `MemberNode.jsx` already falls back `member.mother?.fullname \|\| member.mothersname` (line 65) — extending this to prefer the linked mother's `geezFullname` (or the freetext `geezMothersname`) when present makes the mother row bilingual-consistent with the member's own name, rather than Ge'ez appearing only for the member and not their listed mother | LOW | Same fallback-chain pattern, one more tier: `member.mother?.geezFullname || member.geezMothersname`, rendered as its own conditional secondary line under the existing mother row. |
| Distinct typographic weight/size for the Ge'ez line (smaller, lighter than the Latin line) | Visually reinforces "Latin is primary, Ge'ez is supplementary" without needing a toggle or label — a subtle default that still reads correctly to a Ge'ez-literate reader | LOW | Pure styling (`fontSize`/`fontWeight`/`color` on the second `Typography`, matching the existing `ROW_SX` treatment already used for birthday/mother/address rows). No new mechanism. |
| Ge'ez name included in the tree card's `aria-label` | Screen-reader users get the full bilingual identity of a card, not just the Latin name that happens to render first | LOW | `MemberNode.jsx` line 76 already builds `aria-label={`${member.fullname}, ${genderLabel}`}` — append `, ${member.geezFullname}` conditionally. |

### Anti-Features (explicitly out of scope for this milestone)

| Feature | Why Requested | Why Problematic (for this milestone) | Alternative |
|---------|----------------|----------------------------------------|-------------|
| Latin ↔ Ge'ez display toggle | Feels like the "obvious" bilingual-app feature (this is what FamilySearch's own Family Tree does for CJK/Cyrillic names) | Explicitly excluded per confirmed decision; adds a UI control, a stored preference, and per-surface toggle-state plumbing for a milestone scoped to be additive-only | Ship the fixed Latin-primary/Ge'ez-secondary stacked display (above); revisit a toggle only if a future milestone demands it |
| Auto-transliteration (Latin→Ge'ez or Ge'ez→Latin) input helper | Would lower data-entry friction for family members unfamiliar with a Ge'ez IME | Transliteration engines for Tigrinya/Amharic are lossy and inconsistent (multiple romanization schemes exist); building/vetting one is its own project, not a name-field milestone | Rely on the member's own device keyboard/IME, as already decided |
| Per-field language tagging / user-configurable locale picker | Feels "more correct" i18n-wise | There is exactly one designated Ge'ez field per name; a general language-tagging system implies arbitrary scripts/languages per field, which this milestone doesn't need and would balloon the data model | Fixed `geezFirstname`/`geezLastname`/`geezMothersname` columns, no language metadata beyond the field name itself |
| Full UI i18n (translating labels/buttons to Tigrinya/Amharic) | Once native-script names exist, translating the surrounding UI feels like the natural next step | Confirmed out of scope (PROJECT.md) — a completely different, much larger effort (every label, button, validation message) | None this milestone; UI chrome stays English |
| Ge'ez-aware sort/collation ordering of member lists | Seems like a natural companion to bilingual display | **The app has no name-based sort today** (`AdminMemberTable.jsx` is filtered/paginated in whatever order `members` arrives in; `AddRelativeDialog.jsx`'s Autocomplete uses `inScopeMembers` in query order — verified via code search, no `.sort()` on either). Introducing a *new* sort feature, and doing it with correct mixed-script (Latin + Ethiopic) collation, is a scope-creep rabbit hole with no existing baseline to extend | Leave list ordering untouched this milestone. If a future milestone adds sorting, sort by Latin `fullname` only and treat Ge'ez as display-only — don't attempt Latin/Ethiopic interleaved collation |
| RTL layout / bidi isolation (`dir="rtl"`, `<bdi>` wrapping) | Common assumption for "non-Latin script" | **False for Ge'ez.** Ethiopic/Ge'ez script (ISO 15924 code `Ethi`) is written left-to-right, confirmed via Wikipedia/Omniglot/ScriptSource — unlike other Semitic-family scripts (Arabic, Hebrew), Ge'ez has always been LTR | No `dir` override, no bidi isolation needed; `lang="ti"` alone is sufficient markup |
| Ge'ez name in the detail panel / dashboard, or Ge'ez equivalents for address/email/phone | Feels like completeness | Explicitly out of scope (PROJECT.md) — this milestone is name-fields-only, on two specific surfaces (tree card, `/manage`) | Defer to a future milestone if requested |

## Feature Dependencies

```
FamilyMember model: geezFirstname/geezLastname/geezMothersname + geezFullname VIRTUAL
    └──requires──> (prerequisite, not this doc's concern, but blocks everything below)

Self-hosted Ge'ez webfont bundled
    └──requires──> Any Ge'ez text rendering correctly across devices
                       (already a confirmed target feature; called out here only as a hard
                        rendering dependency for every table-stakes item below)

Ge'ez name renders on tree card
    └──requires──> Model fields + webfont
    └──constrained-by──> MemberNode.jsx's fixed 120px card height and existing 4-row stack
                          (birthday/mother/address already conditional; a 5th conditional
                          row needs a layout decision — taller card vs. tighter spacing —
                          this is a requirements/design question, not just a data question)

Ge'ez name renders across /manage
    └──requires──> Model fields + webfont
    └──lower cost than the tree card (more room in MemberCard/AdminMemberTable rows)

Graceful empty handling
    └──requires──> Nothing beyond following the existing conditional-render idiom already
                    used for birthday/motherName/address/onAdd — no new pattern to design

lang="ti" attribute on Ge'ez runs
    └──enhances──> Screen reader correctness + font-fallback selection
    └──independent of──> the webfont dependency (still correct even if the webfont fails to load)

Search matches Ge'ez text (admin table)
    └──requires──> geezFullname field only; trivial extension of existing .includes() filter

Search matches Ge'ez text (Autocomplete pickers)
    └──requires──> A custom `filterOptions` (MUI's default filter only matches getOptionLabel's
                    string, which stays fullname-only for display purposes)
    └──conflicts-with-naive-approach──> Simply appending geezFullname into getOptionLabel would
                    fix search but break the picker's Latin-only option-label display; the two
                    need to be decoupled (custom filterOptions + unchanged getOptionLabel)

Ge'ez-aware sorting
    └──NOT built this milestone──> no existing name-sort feature to extend; treat as anti-feature
```

## MVP Definition

### Launch With (this milestone)

- [ ] `geezFullname`/individual geez fields render on the tree card (`MemberNode.jsx`) — stacked under the Latin name, conditionally rendered
- [ ] Same stacked display across `/manage` (`RelationshipGroupedPanel`/`MemberCard` rows, `AdminMemberTable.jsx` name cell, Autocomplete option rendering where it shows more than the raw label)
- [ ] Empty-state correctness verified on every surface above (no member with a missing Ge'ez name shows any artifact)
- [ ] `lang="ti"` on every rendered Ge'ez text run
- [ ] Admin table search (`AdminMemberTable.jsx`) matches against Ge'ez text in addition to Latin
- [ ] Autocomplete picker search (`AddRelativeDialog.jsx`) matches against Ge'ez text via custom `filterOptions`, while still displaying only the Latin `fullname` as the option label (per no-toggle/Latin-primary decision — Ge'ez is searchable metadata, not necessarily the visible option label text, unless the stacked-line pattern is also applied inside the option renderer)

### Add After Validation (not this milestone, no trigger defined yet)

- [ ] Mother's Ge'ez name shown as a secondary line in the tree-card mother row
- [ ] Ge'ez name included in tree-card `aria-label`

### Future Consideration (explicitly deferred / anti-features)

- [ ] Latin↔Ge'ez toggle
- [ ] Auto-transliteration input helper
- [ ] Full UI i18n
- [ ] Any name-based list sorting (Latin or bilingual collation)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Tree card Ge'ez display (stacked) | HIGH | MEDIUM (card layout constraint) | P1 |
| `/manage` Ge'ez display (stacked) | HIGH | LOW–MEDIUM | P1 |
| Graceful empty handling | HIGH (silent breakage is worse than no feature) | LOW | P1 |
| `lang` attribute | MEDIUM (accessibility correctness) | LOW | P1 |
| Admin table Ge'ez search | HIGH (for this family's actual keyboard habits) | LOW | P1 |
| Autocomplete Ge'ez search | MEDIUM–HIGH | LOW–MEDIUM (custom filterOptions) | P1 |
| Mother's-name Ge'ez fallback | MEDIUM | LOW | P2 |
| aria-label Ge'ez inclusion | LOW–MEDIUM | LOW | P2 |
| Toggle / transliteration / i18n / sorting | N/A (anti-features) | N/A | Out of scope |

## Sources

- [Ge'ez script — Wikipedia](https://en.wikipedia.org/wiki/Ge%CA%BBez_script) — confirms Ethiopic/Ge'ez script is written left-to-right (LTR), ISO 15924 code `Ethi`
- [Ethiopic (Ge'ez) — ScriptSource](https://scriptsource.org/cms/scripts/page.php?item_id=script_detail&key=Ethi) — script code and writing-direction reference
- [Ge'ez (Ethiopic) syllabic script and the Amharic language — Omniglot](https://www.omniglot.com/writing/ethiopic.htm) — LTR confirmation, used for Amharic/Tigrinya/Tigré
- [Template:Native name — Wikipedia](https://en.wikipedia.org/wiki/Template:Native_name) — primary-name/native-script subordinate display convention referenced for the stacked-display recommendation
- [Unicode LDML Part 8: Person Names](https://www.unicode.org/reports/tr35/tr35-personNames.html) — general native-script name field guidance
- [Set Family Tree to display names in roman script — FamilySearch Help Center](https://www.familysearch.org/en/help/helpcenter/article/how-do-i-set-family-tree-to-show-names-in-roman-script) — confirms the toggle pattern this milestone explicitly rejects, used as contrast
- Confidence note: search/picker cost is MEDIUM — based on documented MUI `Autocomplete` default-filter behavior (matches `getOptionLabel` string only), not yet verified by reading the installed MUI version's source directly; recommend a quick spike/prototype before committing to the `createFilterOptions` approach in planning.
- Codebase evidence (HIGH confidence, direct read): `frontend/src/components/family/MemberNode.jsx`, `frontend/src/components/manage/RelationshipGroupedPanel.jsx`, `frontend/src/components/manage/AdminMemberTable.jsx`, `frontend/src/components/manage/AddRelativeDialog.jsx`, `.planning/PROJECT.md`

---
*Feature research for: Bilingual/native-script name display, v3.0 Ge'ez Native-Script Names milestone*
*Researched: 2026-07-30*
