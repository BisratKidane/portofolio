# Requirements — v3.0 Ge'ez Native-Script Names

**Milestone goal:** Family members can carry their name in Ge'ez script (ግዕዝ) alongside the existing Latin name, rendered with a self-hosted Ge'ez-capable webfont so it displays correctly on every device — deepening the app's fit for the Tigrinya/Eritrean family it serves.

**Scope decisions (confirmed with user):**
- Ge'ez columns added: `geezFirstname`, `geezLastname`, `geezMothersname` (+ derived `geezFullname`). No Ge'ez for address/email/phone.
- Surfaces: `/family` tree cards and `/manage` (relationship panels, admin member table, pickers). Detail panel / dashboard are **out**.
- Latin remains the primary, always-present name; Ge'ez is optional and shown **stacked below** the Latin name (no inline `Latin / ግዕዝ`, no toggle).
- Entry via the person's own device keyboard/IME (no in-app transliteration helper).
- Ge'ez search enabled in **both** the admin table filter and the add-relative Autocomplete picker.

**Research:** see `.planning/research/SUMMARY.md` (font `@fontsource/noto-sans-ethiopic`, self-hosted no-CDN; backend spread-passthrough means near-zero resolver changes; portable manual migration 018; shared `displayName` helper; tree-card layout constraint; Autocomplete `filterOptions` gap).

---

## v3.0 Requirements

### FONT — Webfont & rendering

- [x] **FONT-01**: A Ge'ez-capable webfont (`@fontsource/noto-sans-ethiopic`, OFL-1.1) is self-hosted/bundled with the frontend — no external CDN — and wired into the MUI theme font stacks so Ge'ez script renders consistently regardless of the viewer's OS fonts.
- [x] **FONT-02**: Latin text continues to render in the existing Inter/Sora fonts via per-character fallback, with `font-display: swap` and no FOUT/layout-shift regression on the `/family` tree cards.

### DATA — Model, migration & API

- [x] **DATA-01**: A family member can store an optional Ge'ez first name, last name, and mother's name (three nullable `utf8mb4` columns on `family_members`), added via a portable manual migration (`018-*.sql`) that applies cleanly on both production MySQL 8.4 and local MariaDB (bare `CHARACTER SET utf8mb4`, no `utf8mb4_0900_ai_ci` collation, no `ENCRYPTION` clause).
- [x] **DATA-02**: A derived `geezFullname` is exposed on `FamilyMember`, correct when only one Ge'ez part is present (no stray leading/trailing space) and empty when no Ge'ez parts are set.
- [x] **DATA-03**: The Ge'ez name fields are readable and writable over the GraphQL API — added to the relevant query selections and to the create/edit input types — and clearing a Ge'ez field persists `null` (added to `OPTIONAL_FAMILY_MEMBER_FIELDS`), not an empty string.

### VIEW — Display

- [x] **VIEW-01**: On the `/family` tree, a member card shows the member's Ge'ez name stacked below the Latin name when a Ge'ez name is present, and renders nothing extra (no empty row, dash, or separator) when it is absent.
- [x] **VIEW-02**: Across `/manage` — the relationship panels and the admin member table — a member's Ge'ez name is shown alongside the Latin name when present.
- [x] **VIEW-03**: A single shared `displayName` helper drives the Latin/Ge'ez precedence and empty-handling identically across every render surface, and Ge'ez runs are marked with a `lang` attribute (Ge'ez is LTR — no `dir` change).

### EDIT — Entry

- [x] **EDIT-01**: In the Manage add-relative and edit-member dialogs, a user can enter and update the Ge'ez first name, last name, and mother's name using their own device keyboard/IME.

### FIND — Search

- [x] **FIND-01**: The `/manage` admin member-table search box matches Ge'ez name text in addition to Latin.
- [x] **FIND-02**: The Manage add-relative Autocomplete picker matches typed Ge'ez text (via a custom `filterOptions`) in addition to the Latin label.

### QUAL — Quality

- [x] **QUAL-01**: The shared `displayName` helper and the `geezFullname` derivation are unit-tested (including single-part-filled and all-empty cases), the full `npm test` suite (backend + frontend) stays green in CI, and visual glyph/rendering correctness is captured as a manual sign-off gate (jsdom cannot assert real glyph rendering).

---

## Future Requirements (deferred)

- Ge'ez rendering in the read-only member detail panel and the dashboard greeting.
- A Latin ↔ Ge'ez display toggle for viewers.
- Broader Amharic/Tigrinya UI localization (labels, buttons — full i18n).
- Ge'ez name matching in the LinkAccounts admin picker (same Autocomplete surface, different page).

## Out of Scope (explicit exclusions)

- **Latin ↔ Ge'ez display toggle** — the confirmed design shows Latin-primary with Ge'ez stacked below; no viewer switch this milestone.
- **Ge'ez in the detail panel / dashboard** — not selected among the target surfaces (tree cards + manage only).
- **Full Amharic/Tigrinya UI translation** — this milestone is native-script *names*, not interface localization.
- **In-app Latin → Ge'ez transliteration input** — names are entered via the user's own device IME.
- **Ge'ez equivalents for address / email / phone** — only the three name fields get Ge'ez columns.
- **Ge'ez-aware sorting / collation** — no name-based sort exists in the admin table or pickers today; introducing bilingual collation would be scope creep with no baseline to extend (anti-feature).

---

## Traceability

<!-- Filled by the roadmapper: REQ-ID → Phase mapping. -->

| Requirement | Phase | Status |
|-------------|-------|--------|
| FONT-01 | Phase 20 | Complete |
| FONT-02 | Phase 20 | Complete |
| DATA-01 | Phase 18 | Complete |
| DATA-02 | Phase 18 | Complete |
| DATA-03 | Phase 19 | Complete |
| VIEW-01 | Phase 22 | Complete |
| VIEW-02 | Phase 22 | Complete |
| VIEW-03 | Phase 21 | Complete |
| EDIT-01 | Phase 23 | Complete |
| FIND-01 | Phase 22 | Complete |
| FIND-02 | Phase 23 | Complete |
| QUAL-01 | Phase 23 | Complete |

**Coverage:** 12/12 v3.0 requirements mapped. No orphans, no duplicates.
