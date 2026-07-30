# Stack Research

**Domain:** Self-hosted Ge'ez/Ethiopic webfont + optional native-script name storage, added to an existing React 18.3 + MUI 6.3 + Emotion 11 + Vite 6 frontend and Express + Apollo + Sequelize + MySQL/MariaDB backend (v3.0 milestone — NOT a greenfield stack pick).
**Researched:** 2026-07-30
**Confidence:** HIGH (font package license/coverage/file sizes verified by downloading and inspecting the actual npm tarballs; MySQL/MariaDB charset coverage verified against official docs; mysql2 default charset is MEDIUM — WebSearch-verified only, but consistent with the app's already-working utf8mb4 tables)

## Scope Note

This is an *addendum* for the v3.0 Ge'ez Native-Script Names milestone only — it supersedes the v2.0-era content previously in this file (tree-visualization/photo-upload research, now archived in `.planning/milestones/v2.0-*`). The existing stack (React 18.3, MUI 6.3, Vite 6.0.7, Emotion 11.14, Express 4.21, Apollo Server 4.11, Sequelize 6.37 + mysql2 3.11, MySQL 8.4 prod / MariaDB local) is treated as fixed. Only what's needed for optional Ge'ez name fields — a self-hosted webfont and two new nullable columns — is researched here.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@fontsource/noto-sans-ethiopic` | `5.3.0` (pin exact) | Self-hosted Ge'ez/Ethiopic webfont, npm-distributed | Official Google Noto build, OFL-1.1 licensed (redistributable, no attribution required beyond the bundled `LICENSE` file), full Ethiopic Unicode coverage in a **single subset file**, ships pre-built woff2/woff with `font-display: swap` already set, zero external CDN — matches the self-hosted deploy constraint out of the box |

No other "core" additions are needed — no bundler plugin, no font-loading library, no new backend package. This is a font asset + two lines of CSS import + a `theme.js` fallback-stack edit + two Sequelize columns.

### Supporting Libraries

None required. Specifically avoid adding any of:
- `vite-plugin-webfont-dl` / `vite-plugin-webfonts` — these exist to *download* remote (Google Fonts CDN) fonts at build time; irrelevant here since we self-host from day one via an npm-distributed package, not a CDN fetch.
- `fontfaceobserver` or similar font-loading-detection libraries — unnecessary; `font-display: swap` (already in the generated CSS) handles the FOUT/FOIT tradeoff without JS.
- `@fontsource-variable/noto-sans-ethiopic` — the variable-font sibling package. Skip it: it bundles a `wght`+`wdth` variable-axis file that's larger than a single static weight and gives no benefit here (the app needs at most two static weights — 400 body, optionally 700 for any bold/heading context — not a full interpolatable weight range).

### Development Tools

None. No Vite config changes are required — Vite 6 resolves `url()` references inside CSS imported from `node_modules` and copies the referenced font files into the build output (or serves them directly from `node_modules` in dev/dev-server-as-prod, which is how this repo's `frontend/Dockerfile` currently runs `npm start` → `vite --host 0.0.0.0`, per `frontend/package.json`). No `vite-plugin-*` font tooling needed.

## Font Choice: Noto Sans Ethiopic vs Abyssinica SIL

Both packages were downloaded and inspected directly (`@fontsource/noto-sans-ethiopic@5.3.0` and `@fontsource/abyssinica-sil@5.3.0` tarballs pulled from the npm registry) rather than relying on marketing pages.

| Criterion | Noto Sans Ethiopic | Abyssinica SIL |
|---|---|---|
| License | OFL-1.1 (verified: `google/fonts` `ofl/notosansethiopic/METADATA.pb` → `license: "OFL"`; npm package `license: "OFL-1.1"`) | OFL-1.1 (verified: bundled `LICENSE` file header — "SIL Open Font License, Version 1.1") |
| Ethiopic block coverage | **All 5 Ethiopic Unicode blocks in one file.** Verified via the actual generated `unicode-range` on the full (`index.css`) build: `U+1200-1399` (Ethiopic + Ethiopic Supplement), `U+2D80-2DDE` (Ethiopic Extended), `U+AB01-AB2E` (Ethiopic Extended-A), `U+1E7E0-1E7FE` (Ethiopic Extended-B) | All 5 Ethiopic blocks per SIL's own charset page (Ethiopic, Supplement, Extended, Extended-A, Extended-B) — not independently verified byte-for-byte via unicode-range since the SIL charset page is the authoritative source for this font |
| Tigrinya + Amharic coverage | Yes — Noto's `METADATA.pb` explicitly lists `am_Ethi` (Amharic), `ti_Ethi` (Tigrinya), `gez_Ethi` (Ge'ez), `tig_Ethi` (Tigre) as supported languages | Yes — SIL's own docs target the same Ethiopic-script language set |
| woff2 size (single subset, weight 400) | **75,076 bytes** (`ethiopic-400.css` → `noto-sans-ethiopic-ethiopic-400-normal.woff2`) | 73,172 bytes — comparable, not a differentiator |
| Available weights | **100–900**, both as discrete static files and as a variable font | **400 (regular) only** — no bold. Single-weight calligraphic-tradition design, not a UI sans family |
| Visual/UI fit | Sans-serif, drawn to sit alongside the rest of the Noto superfamily — harmonizes with a modern UI sans stack (the app already uses Inter/Sora, both sans) | Calligraphic/traditional letterform style — reads more "manuscript," less "UI" |
| npm package | `@fontsource/noto-sans-ethiopic` | `@fontsource/abyssinica-sil` (also exists, also Fontsource-distributed) |

**Decision: Noto Sans Ethiopic.** Both are OFL-licensed and cover the same Unicode blocks at essentially the same file size, so license/coverage/size is a wash. The deciding factors: (1) Noto Sans Ethiopic ships a 700 weight for free, so if a later milestone renders Ge'ez names in a bold/heading context (`h1`–`h6` use `fontWeight: 700–800` in `theme.js`) there's a matching bold face — Abyssinica SIL has none; (2) Noto Sans is a sans-serif design that visually pairs with the app's existing Inter/Sora sans stack, where Abyssinica SIL's calligraphic style would look mismatched next to Latin UI text.

### What NOT to use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Google Fonts CDN `<link>` tag (`fonts.googleapis.com`) | Violates the "no external CDN, fully self-contained deploy" constraint — a Hetzner-server, Caddy-only deploy must not phone home to Google at runtime | `@fontsource/noto-sans-ethiopic` npm package (bundles the same files, served from your own origin) |
| `@font-face` with a remote `src: url('https://...')` | Same CDN-dependency problem, plus an unnecessary CSP/CORS surface | Local woff2 shipped inside the frontend bundle / `node_modules` |
| `@fontsource-variable/noto-sans-ethiopic` | Larger variable-font file for a feature that only needs 1–2 static weights; adds axis-interpolation overhead with zero visual benefit for name display | `@fontsource/noto-sans-ethiopic` static package, `ethiopic-400.css` (+ `ethiopic-700.css` if bold is ever needed) |
| Full `index.css` / `400.css` import from the package | Pulls in `latin` and `latin-ext` subset duplicates of the same weight (three files instead of one) since the app already has a Latin font (Inter) covering that range | Import the **subset-scoped** entry point: `ethiopic-400.css` (only the Ethiopic-block file, ~75 KB) |
| A new "Ge'ez collation" or custom charset on the new columns | No such collation exists in MySQL 8.4 or MariaDB (see Storage section) — inventing one adds risk for zero benefit | Let the new columns inherit the table's existing default `utf8mb4` charset/collation, same as every other `family_members` column |

## Self-Hosting Mechanics (Vite 6 + MUI 6 + Emotion)

### 1. Install (frontend workspace)

```bash
npm install --workspace frontend @fontsource/noto-sans-ethiopic@5.3.0
```

### 2. Font file location: `node_modules` via the npm package, not `public/`

Recommended approach — import the package's pre-scoped CSS entry point once, in `frontend/src/main.jsx`, alongside the existing MUI/theme imports:

```js
// frontend/src/main.jsx
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
// Only add this if a bold Ge'ez rendering context is needed later (theme.js h1-h6 use 700/800):
// import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
```

This is the standard Fontsource + Vite integration: Vite's dev server resolves and serves the `url()` reference inside that CSS file directly out of `node_modules` (no config needed), and a production `vite build` would emit the referenced `.woff2`/`.woff` as hashed assets in `dist/assets/`. Because this repo's `frontend/Dockerfile` currently runs `vite` as the "prod" server (`CMD ["npm", "start"]` → dev server, not a built bundle — a known, separately-tracked concern, not something this milestone should fix), this works with **zero Docker/Vite config changes**: `node_modules` is already installed inside the image, and the dev server serves the font file straight from there.

Only the two CSS files actually imported (`ethiopic-400.css`, and `ethiopic-700.css` if added) get pulled into the served asset graph — the other 50+ weight/subset combinations that ship inside the npm package (needed for other consumers of the general-purpose Fontsource package) are simply never referenced and never transferred over the wire.

The generated CSS this import resolves to (verified from the tarball) is exactly:

```css
/* noto-sans-ethiopic-ethiopic-400-normal */
@font-face {
  font-family: 'Noto Sans Ethiopic';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/noto-sans-ethiopic-ethiopic-400-normal.woff2) format('woff2'),
       url(./files/noto-sans-ethiopic-ethiopic-400-normal.woff) format('woff');
}
```

Note there's no `unicode-range` restriction on this subset-scoped file (that's only present in the combined `index.css` which bundles all three subsets together) — irrelevant here since we're intentionally only loading the one Ethiopic-block file, and per-character font-family fallback (see step 3) is what actually routes Ge'ez glyphs to it.

**Fallback approach (if you want the font file fully auditable in-repo rather than a `node_modules` import):** extract just the two files (`noto-sans-ethiopic-ethiopic-400-normal.woff2` + the package's `OFL.txt`/`LICENSE`, required by the OFL's redistribution terms) into `frontend/public/fonts/geez/`, and hand-write the `@font-face` in a small `frontend/src/fonts/geez.css` pointing at `/fonts/geez/noto-sans-ethiopic-ethiopic-400-normal.woff2` (an absolute path off the Vite `public/` root, stable across builds, no hashing). Functionally identical; more manual to keep in sync on a future font-version bump. The npm-package approach above is recommended as primary.

### 3. MUI theme integration — fallback stack, not a separate font

Edit `frontend/src/theme.js`'s two font constants to insert `"Noto Sans Ethiopic"` **immediately after** the primary Latin font and **before** any OS-dependent fallback:

```js
const FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, sans-serif';
```

Why this order matters: CSS `font-family` fallback is resolved **per character**, not per whole string — for each glyph the browser tries each listed font in order and uses the first one that has that glyph. `Inter`/`Sora` have no Ethiopic glyphs, so Latin text renders in Inter/Sora exactly as today, and the browser falls through to `Noto Sans Ethiopic` only for the Ge'ez codepoints — no separate `lang` tag or conditional-rendering logic needed; one `Typography` node can mix Latin and Ge'ez text and each part renders in the right font automatically.

Placing `Noto Sans Ethiopic` **before** `system-ui`/`-apple-system`/`Segoe UI` is deliberate: several OS default UI fonts have partial/inconsistent native Ethiopic coverage (varies by OS version), which would silently reintroduce the exact "renders differently per device" problem this milestone exists to close. Putting the self-hosted font ahead of any OS fallback guarantees Ge'ez always resolves to the same glyphs everywhere.

No `MuiCssBaseline` change is needed beyond this — `theme.typography.fontFamily` already propagates to `body`/all `Typography` variants; only the two constants need the extra fallback entry.

### 4. FOUT/FOIT/layout shift

- `font-display: swap` is already set in every `@font-face` rule Fontsource generates (verified above) — the browser shows the fallback font immediately and swaps to Noto Sans Ethiopic when it loads, so there's no invisible-text (FOIT) window. This matches Google Fonts' own default for this family; no extra config needed.
- Because Ge'ez name fields are **additive** (the existing Latin `fullname` keeps rendering as today; the Ge'ez name is a new, separate text node next to/below it per the milestone's scope), the swap only affects the new Ge'ez text nodes — it does not reflow or shift the existing Latin layout on `/family` cards or `/manage` panels.
- Minor recommendation for whoever builds the UI: give the Ge'ez `Typography` node an explicit `line-height` (rather than relying on the font's own metrics) so its box height doesn't visibly jump between the fallback font and Noto Sans Ethiopic during the swap. This is a CSS detail for the implementation phase, not a new dependency.
- The woff2 is ~75 KB, loaded once and cached — no meaningful additional page-weight concern for a portfolio-scale app displaying a handful of family members' names at once.

## Storage: utf8mb4 + no new backend deps

**MySQL 8.4 (production):** `utf8mb4` (and `utf16`/`utf16le`/`utf32`) supports the full Basic Multilingual Plane plus supplementary-plane characters (per the MySQL 8.4 Reference Manual, §12.10.1 Unicode Character Sets). Every Ethiopic-related block is covered:
- Ethiopic `U+1200–137F` — BMP
- Ethiopic Supplement `U+1380–139F` — BMP
- Ethiopic Extended `U+2D80–2DDF` — BMP
- Ethiopic Extended-A `U+AB00–AB2F` — BMP
- Ethiopic Extended-B `U+1E7E0–U+1E7FF` — supplementary plane (above U+FFFF), still covered by `utf8mb4`'s 4-byte encoding

**MariaDB (local dev):** MariaDB's `utf8mb4` implementation is the same standard 4-byte UTF-8 charset with equivalent BMP + supplementary-plane coverage — no divergence to account for between environments.

**Collation:** Neither MySQL 8.4 nor MariaDB ships a language-specific collation for Ethiopic/Amharic/Tigrinya/Ge'ez (confirmed against the MySQL 8.4 collation-language-specifier table, which lists dozens of other languages — Bulgarian, Czech, Japanese, Vietnamese, etc. — but no Ethiopic entry). This is not a gap that needs filling: the app never sorts or does collation-sensitive comparison on Ge'ez text (it's a display-only field, round-tripped verbatim), so the generic default collation is sufficient. **Recommendation: do not specify an explicit `COLLATE` on the new columns** — let them inherit the table's existing default, exactly matching the pattern already used in the repo's manual migrations (e.g. `backend/migrations/manual/013-add-family-members-profile-picture.sql` adds a column with no `COLLATE` clause; `016`/`017` create tables with only `DEFAULT CHARSET=utf8mb4`, no explicit collation).

**Migration pattern to follow** (same style as `013`, `014`, `015` in `backend/migrations/manual/` — manual, since `sequelize.sync()` never `ALTER`s existing tables):

```sql
ALTER TABLE family_members ADD COLUMN geezFirstname VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE family_members ADD COLUMN geezLastname VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE family_members ADD COLUMN geezMothersname VARCHAR(255) NULL DEFAULT NULL;
```
(`geezFullname` is a Sequelize `DataTypes.VIRTUAL` getter mirroring the existing `fullname` pattern in `backend/src/models/FamilyMember.js` — no DB column needed for it.)

**No new backend dependency required.** `mysql2` (already at `3.11`, per the existing `backend/package.json`) defaults its connection charset to `utf8mb4` (MEDIUM confidence — WebSearch-verified, not Context7/official-doc-confirmed line-by-line, but consistent with the fact that the existing `firstname`/`lastname`/`mothersname` columns and the app's existing UTF-8 content already round-trip correctly through the current `backend/src/config/database.js` Sequelize connection, which sets no explicit `dialectOptions.charset` override). Sequelize's `DataTypes.STRING` maps to `VARCHAR` and is charset-agnostic — it stores whatever bytes the connection charset produces, so no Sequelize-level change is needed either. If you want to remove even the MEDIUM-confidence gap, add `dialectOptions: { charset: 'utf8mb4' }` to `backend/src/config/database.js` as a defensive, explicit pin — optional, not required by any evidence found of it currently defaulting elsewhere.

## Installation

```bash
# Frontend: self-hosted Ge'ez webfont
npm install --workspace frontend @fontsource/noto-sans-ethiopic@5.3.0

# Backend: no new packages
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `@fontsource/noto-sans-ethiopic` (static, `ethiopic-400`/`ethiopic-700`) | `@fontsource/abyssinica-sil` | If a more traditional/calligraphic Ge'ez letterform is explicitly wanted for branding reasons and no bold weight is ever needed — otherwise Noto Sans Ethiopic's weight range and UI-sans styling fit this app better |
| `@fontsource/noto-sans-ethiopic` (static) | `@fontsource-variable/noto-sans-ethiopic` | If a future milestone needs many intermediate weights (e.g. a design system with 500/600 in between) rather than just regular/bold |
| npm-package self-host, import in `main.jsx` | Manual `public/fonts/` + hand-written `@font-face` | If the team wants the exact font bytes checked into the repo and reviewable in a diff rather than living inside a versioned `node_modules` dependency — functionally equivalent, more manual to update |
| No explicit `COLLATE` on new columns | An explicit `utf8mb4_unicode_ci`/`utf8mb4_0900_ai_ci` pin | Only if the app later needs locale-aware sorting of Ge'ez names (it doesn't today — display-only field) |

## What NOT to Use

See "What NOT to use" table under Font Choice above — repeated here for template consistency: no Google Fonts CDN link, no remote `@font-face` `src`, no variable-font package, no full (unsubsetted) CSS import, no invented Ge'ez collation.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@fontsource/noto-sans-ethiopic@5.3.0` | Vite `^6.0.7` (already pinned in `frontend/package.json`) | Fontsource CSS-import pattern is bundler-agnostic; verified the package's `exports` map resolves `./ethiopic-400.css` and `./files/*` cleanly, no Vite-specific config required |
| `@fontsource/noto-sans-ethiopic@5.3.0` | MUI `^6.3.1` / Emotion `^11.14.0` (already pinned) | Font is wired purely through `theme.typography.fontFamily` string values — no Emotion/MUI version sensitivity |
| `utf8mb4` Ethiopic storage | MySQL 8.4 (prod) and MariaDB (local dev) | Both already store the existing `firstname`/`lastname` columns as `utf8mb4`; no divergence between the two engines for this feature |

## Sources

- `google/fonts` GitHub repo, `ofl/notosansethiopic/METADATA.pb` (fetched via `raw.githubusercontent.com`) — HIGH confidence: license (`OFL`), supported languages (`am_Ethi`, `ti_Ethi`, `gez_Ethi`, `tig_Ethi`, etc.), source repo/version (`NotoSansEthiopic-v2.102`)
- npm registry (`registry.npmjs.org`) package metadata + downloaded tarballs for `@fontsource/noto-sans-ethiopic@5.3.0` and `@fontsource/abyssinica-sil@5.3.0` — HIGH confidence: exact file names, woff2 byte sizes (75,076 / 73,172 bytes respectively), available weights (100–900 vs 400-only), `unicode-range` values, `font-display: swap` presence, `LICENSE` file contents, npm package `license` field (`OFL-1.1`)
- MySQL 8.4 Reference Manual, §12.10.1 "Unicode Character Sets" (`dev.mysql.com/doc/refman/8.4/en/charset-unicode-sets.html`) — HIGH confidence: `utf8mb4` BMP + supplementary-plane coverage; confirmed no Ethiopic/Amharic/Tigrinya-specific collation exists in the documented collation-language-specifier table
- `software.sil.org/abyssinica/charset/` — HIGH confidence: Abyssinica SIL's own stated Unicode block coverage (all 5 Ethiopic blocks including Extended-B)
- WebSearch: `mysql2` driver default connection charset defaults to `utf8mb4` — MEDIUM confidence (no single authoritative changelog/doc line quoted; consistent with the app's existing working utf8mb4 data, and easy to pin explicitly as a zero-risk defensive change if desired)
- Repo files read directly: `frontend/src/theme.js`, `frontend/vite.config.js`, `frontend/src/main.jsx`, `frontend/package.json`, `frontend/Dockerfile`, `backend/src/models/FamilyMember.js`, `backend/src/config/database.js`, `backend/migrations/manual/013-add-family-members-profile-picture.sql`, `016-create-invitations.sql`, `017-create-audit-logs.sql`, `.planning/PROJECT.md`

---
*Stack research for: Ge'ez/Ethiopic native-script name support (self-hosted webfont + storage) — v3.0 milestone*
*Researched: 2026-07-30*
