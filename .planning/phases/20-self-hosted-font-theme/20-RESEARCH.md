# Phase 20: Self-Hosted Font & Theme - Research

**Researched:** 2026-07-30
**Domain:** Self-hosted Ge'ez/Ethiopic webfont integration into an existing React 18.3 + MUI 6.3 + Vite 6 frontend (v3.0 milestone, Ge'ez Native-Script Names)
**Confidence:** HIGH

## Summary

This phase adds exactly one new dependency — `@fontsource/noto-sans-ethiopic@5.3.0` (OFL-1.1, official Fontsource/Google Noto build) — and wires it into `frontend/src/theme.js`'s two existing font-stack constants (`FONT_SANS`, `FONT_DISPLAY`). No backend, no database, no new bundler config, no font-loading JS library. The package's Ethiopic-only subset file (`ethiopic-400.css`) was downloaded and inspected directly from the npm tarball in this research session: its `unicode-range` (`U+030E,U+1200-1399,U+2D80-2DDE,U+AB01-AB2E,...`) fully covers the Tigrinya labialized-consonant letters (ቨ U+1268, ቐ U+1250) that live in the main Ethiopic block U+1200–137F — confirming the milestone-level research's correction that these are NOT in the Ethiopic Supplement as the phase brief's original framing assumed. `font-display: swap` is already baked into the shipped CSS, matching FONT-02's requirement with zero extra config.

The one scope question this research resolves explicitly: **FONT-01/FONT-02 as written in REQUIREMENTS.md and ROADMAP.md scope this phase to the Ge'ez font only.** Neither requirement mentions Inter or Sora migration, and "Out of Scope" in REQUIREMENTS.md lists only the Latin↔Ge'ez toggle — it does not list "migrate existing fonts off Google CDN" as in-scope. The existing Google Fonts `<link>` for Inter/Sora in `frontend/index.html` is a **separate, pre-existing concern** this phase must not silently compound (by adding a second CDN font) but also must not silently expand its own scope to fix. Recommendation: do not touch `index.html`'s existing `<link>`/`<preconnect>` tags, do not add `@fontsource/inter` or `@fontsource/sora`. Scope the phase's own verification (success criterion 1) narrowly: "zero external requests for the new Ethiopic font specifically" — not "zero font requests of any kind."

**Primary recommendation:** Install `@fontsource/noto-sans-ethiopic@5.3.0`, import `@fontsource/noto-sans-ethiopic/ethiopic-400.css` (and optionally `/ethiopic-700.css`) once in `frontend/src/main.jsx`, and append `"Noto Sans Ethiopic"` to both `FONT_SANS` and `FONT_DISPLAY` in `theme.js`, positioned immediately after the existing Latin font name(s) and before any OS-fallback font (`system-ui`, `-apple-system`, etc.) — not first in the list, not last.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Webfont asset bundling (`@fontsource` package → build output) | CDN / Static | Browser / Client | Vite resolves the `import '...css'` at build time and emits the woff2/woff files as hashed static assets served from the app's own origin — this is a build/static-asset concern, not a runtime server concern (no SSR in this app) |
| Font-family CSS resolution (per-glyph fallback across the stack) | Browser / Client | — | CSS `font-family` fallback matching happens entirely in the browser's rendering engine at paint time; no server involvement |
| Removing/avoiding a second CDN font dependency | CDN / Static | Browser / Client | `index.html` is a static asset; the decision of what it references (self-hosted bundle vs. external `<link>`) is a build-time/static-asset decision, observed at runtime by the browser's network layer |
| FOUT/layout-shift mitigation (`font-display`, optional preload) | Browser / Client | CDN / Static | The visual flicker is a client-side paint behavior; a `<link rel="preload">` hint (if added) is declared in the static `index.html` but its effect is entirely client-side |
| Glyph coverage verification (manual visual QA) | Browser / Client | — | Real glyph shaping/rendering only happens in an actual browser engine — jsdom has no font-rendering pipeline (see Validation Architecture) |

This phase touches **no backend, no API, no database tier** — it is a frontend-build + frontend-runtime concern exclusively.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fontsource/noto-sans-ethiopic` | `5.3.0` (pin exact — matches `frontend/package.json`'s existing pattern of caret-ranges on all other deps; a caret range is fine here too since Fontsource static packages don't break APIs between patch/minor bumps) | Self-hosted Ge'ez/Ethiopic webfont, npm-distributed, OFL-1.1 | Official Google Noto build packaged by the Fontsource project (`github.com/fontsource/font-files`); ships pre-built woff2/woff files with `font-display: swap` already set; zero external CDN; full Ethiopic Unicode coverage confirmed by direct tarball inspection in this session |

**Version verification:** `npm view @fontsource/noto-sans-ethiopic version` → `5.3.0` `[VERIFIED: npm registry]` (checked live in this session, `dist-tags.latest: 5.3.0`, 29 published versions, `license: OFL-1.1`, `repository: git+https://github.com/fontsource/font-files.git`, no `postinstall` script). Package name/existence was originally surfaced via the milestone-level `STACK.md` research (WebSearch-sourced) — per provenance rules this is tagged `[ASSUMED]` for name-discovery purposes even though the registry independently confirms it exists (registry existence alone does not upgrade provenance; see Assumptions Log).

### Supporting

None required. Do not add:
- `vite-plugin-webfont-dl` / `vite-plugin-webfonts` — for downloading remote CDN fonts at build time; irrelevant since this package ships pre-built files in the npm tarball itself.
- `fontfaceobserver` or any font-loading-detection JS — unnecessary; `font-display: swap` (already in the shipped CSS) handles FOUT without JS.
- `@fontsource-variable/noto-sans-ethiopic` — the variable-font sibling. Skip it: larger file for a `wght`-axis range this app doesn't need (at most two discrete weights, 400 and optionally 700).
- `@fontsource/inter`, `@fontsource/sora` — out of scope per FONT-01/FONT-02 as written (see Summary's scope resolution).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@fontsource/noto-sans-ethiopic` | `@fontsource/abyssinica-sil` | Both OFL-1.1, both cover all 5 Ethiopic Unicode blocks, comparable file size (~73–75 KB). Abyssinica SIL ships regular weight only (no bold face) and has a calligraphic/manuscript letterform style that doesn't visually pair with this app's existing Inter/Sora UI-sans stack. Noto Sans Ethiopic ships 100–900 weights and is a UI-sans design. Not recommended for this app. |
| Fontsource static package | Manually downloaded `.woff2` in `frontend/public/fonts/` + hand-written `@font-face` | Valid fallback if the Fontsource package's coverage/size proves unsuitable during implementation, but duplicates work Fontsource already automates (subsetting, `font-display: swap`) and adds a silent-typo/404 risk (see Common Pitfalls) with no offsetting benefit. Not recommended as the primary path. |
| Full `400.css` import | Subset-scoped `ethiopic-400.css` import | Confirmed by direct tarball inspection: plain `400.css` bundles THREE `@font-face` blocks under the same `font-family: 'Noto Sans Ethiopic'` name — one Ethiopic, one `latin-ext`, one `latin` — duplicating glyph coverage Inter already provides and adding two extra font files the browser may fetch unnecessarily. `ethiopic-400.css` contains only the single Ethiopic `@font-face` block, byte-identical Ethiopic file reference, no `latin`/`latin-ext` blocks. Always prefer the subset-scoped import for this app. |

**Installation:**
```bash
npm install @fontsource/noto-sans-ethiopic --workspace frontend
```

**Package Legitimacy Audit** (see below) confirms this is safe to install.

## Package Legitimacy Audit

slopcheck (v0.6.1, installed via `pip install slopcheck` in this session) was run against the package. **Caution for future sessions/planners:** `slopcheck install <pkg>` actually executes `npm install` as a side effect (it is not a dry-run check) — it modified this repo's root `package.json`/`package-lock.json` during this research session; both were reverted with `git checkout -- package.json package-lock.json` immediately after. **The planner must have the implementation phase run `npm install` itself in the `frontend` workspace explicitly** (`npm install @fontsource/noto-sans-ethiopic --workspace frontend`), not rely on a stray slopcheck invocation, and must NOT re-run `slopcheck install` against the root workspace without immediately reverting the lockfile/package.json diff it produces.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `@fontsource/noto-sans-ethiopic` | npm | 29 published versions (mature, actively maintained Fontsource monorepo package) | Not independently queried (npm downloads API not checked this session); package is part of the official `fontsource/font-files` GitHub org, not an independent/unknown publisher | `github.com/fontsource/font-files` | `[OK]` | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

Additional verification performed directly (not slopcheck): `npm view @fontsource/noto-sans-ethiopic scripts.postinstall` returned empty — no postinstall script, no supply-chain red flag. `deps: none` (zero runtime dependencies) per `npm view` output.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ BUILD TIME (Vite)                                                │
│  frontend/src/main.jsx                                           │
│    import '@fontsource/noto-sans-ethiopic/ethiopic-400.css'      │
│    (+ optionally /ethiopic-700.css)                               │
│         │  Vite resolves node_modules CSS import,                │
│         │  emits hashed woff2/woff into build output              │
│         ▼                                                         │
│  dist/assets/*.woff2  (served from same origin as the app —       │
│  no fonts.googleapis.com / fonts.gstatic.com request for THIS     │
│  font; the PRE-EXISTING Inter/Sora <link> in index.html is        │
│  untouched and out of scope for this phase)                       │
├─────────────────────────────────────────────────────────────────┤
│ RUNTIME (Browser)                                                 │
│  <html> loads app bundle → CSSOM registers @font-face rules       │
│  (font-family: 'Noto Sans Ethiopic', font-display: swap,          │
│   already baked into the shipped CSS — no override needed)        │
│         │                                                          │
│         ▼                                                          │
│  MUI ThemeProvider (theme.js)                                     │
│    FONT_SANS  = "Inter", "Noto Sans Ethiopic", system-ui, ...     │
│    FONT_DISPLAY = "Sora", "Noto Sans Ethiopic", "Inter", ...      │
│         │  Per-glyph fallback: browser tries Inter/Sora first;    │
│         │  Ge'ez codepoints (U+1200-137F etc.) have no glyph in   │
│         │  Inter/Sora → falls through to Noto Sans Ethiopic       │
│         │  BEFORE ever reaching system-ui/OS fallback             │
│         ▼                                                          │
│  Any <Typography> anywhere in the app (MemberNode.jsx today has   │
│  no Ge'ez text yet — Phase 22 wires that; this phase only         │
│  guarantees the font-stack is ready for it)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new directories needed. Two files change, one dependency added:
```
frontend/
├── package.json          # + "@fontsource/noto-sans-ethiopic": "^5.3.0"
├── src/
│   ├── main.jsx           # + one (or two) CSS import line(s)
│   └── theme.js            # FONT_SANS / FONT_DISPLAY updated
```

### Pattern 1: Global theme-level font fallback (not per-component overrides)

**What:** Append `"Noto Sans Ethiopic"` to MUI's `typography.fontFamily` chain in `theme.js` (both `FONT_SANS` and `FONT_DISPLAY`), rather than adding `sx={{ fontFamily: '"Noto Sans Ethiopic"' }}` to individual components.
**When to use:** Whenever a font needs to resolve for a specific script across an entire MUI app while Latin text keeps using the existing brand fonts.
**Example:**
```js
// frontend/src/theme.js — verified current values at lines 32-33
const FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, sans-serif';
```
Because CSS `font-family` fallback only engages a later font for glyphs the earlier font lacks, Latin text keeps rendering in Inter/Sora exactly as today; Ge'ez glyphs anywhere in the app fall through to Noto Sans Ethiopic automatically.

**Reconciling "ahead of any OS-fallback font" (success criterion 3) with "Latin stays primary" (success criterion 4):** These are not in tension. "Ahead of any OS-fallback font" means the Ge'ez font must sit before `system-ui`/`-apple-system`/`sans-serif` in the list — it does **not** mean the Ge'ez font goes first overall. The correct position is: `[Latin font(s), Ge'ez font, OS-fallback fonts]`. Placing Ge'ez first would be wrong (it would try to shape Latin glyphs in the Ethiopic font, which does have some Latin glyphs bundled in its *non*-subset build, but is not tuned for Latin UI text and isn't what either criterion intends).

### Pattern 2: Subset-scoped CSS import, not the combined weight file

**What:** Import `@fontsource/noto-sans-ethiopic/ethiopic-400.css`, not `@fontsource/noto-sans-ethiopic/400.css`.
**Example (verified by direct tarball inspection in this session):**
```js
// frontend/src/main.jsx
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
// Optional — only if a component ever renders Ge'ez text at fontWeight >= 700
// (theme.js's FONT_DISPLAY chain is used on h1–h6, which are 700–800 weight;
// no current render surface uses h1–h6 for a member name, but importing this
// now is cheap — 75,648 bytes, lazily fetched only if actually rendered —
// and closes a theoretical gap where a bold Ge'ez glyph request falls back
// to font-synthesis/faux-bold on the 400-weight face rather than a true
// bold face)
import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
```
Actual extracted CSS content (verbatim, `ethiopic-400.css`):
```css
/* noto-sans-ethiopic-ethiopic-400-normal */
@font-face {
  font-family: 'Noto Sans Ethiopic';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/noto-sans-ethiopic-ethiopic-400-normal.woff2) format('woff2'), url(./files/noto-sans-ethiopic-ethiopic-400-normal.woff) format('woff');
  unicode-range: U+030E,U+1200-1399,U+2D80-2DDE,U+AB01-AB2E,U+1E7E0-1E7E6,U+1E7E8-1E7EB,U+1E7ED-1E7EE,U+1E7F0-1E7FE;
}
```
`[VERIFIED: npm registry tarball inspection]` — downloaded via `npm pack @fontsource/noto-sans-ethiopic@5.3.0` and extracted directly in this research session. The `unicode-range` (`U+1200-1399`) spans the entire main Ethiopic block (U+1200–137F) AND the Ethiopic Supplement (U+1380–139F) contiguously — Tigrinya's ቨ (U+1268) and ቐ (U+1250) are both within this range, confirming full glyph coverage with this single subset file. File sizes verified: `ethiopic-400.css`'s referenced woff2 is exactly **75,076 bytes**; `ethiopic-700.css`'s is **75,648 bytes**.

By contrast, plain `400.css` (verified, not recommended) contains three `@font-face` blocks under the same family name — `ethiopic`, `latin-ext`, and `latin` — each with its own `unicode-range` and its own woff2 file. Importing it would ship two extra font files (Latin + Latin-ext) that duplicate glyph ranges Inter already covers, for no benefit.

### Anti-Patterns to Avoid

- **Adding a second Google Fonts `<link>` for the new font:** copy-pasting the existing `index.html` CDN pattern for "Noto Sans Ethiopic" would violate FONT-01's explicit "no external CDN" requirement and contradict the entire point of this phase.
- **Per-component `fontFamily` overrides that shadow the theme:** three existing components (`AppLayout.jsx:87`, `BrandMark.jsx:55`, `Dashboard.jsx:78,157,274`) already hard-code `fontFamily: '"Sora", sans-serif'` with no Ge'ez fallback. **Verified in this session: this is NOT a bug for this phase** — all three render the static "Agne" brand wordmark, never user-supplied member data, so Ge'ez text will never flow through these code paths. Do not "fix" these as part of this phase; they are out of scope. Flag for the planner only as a pattern to watch for in Phase 22 (render surfaces), where a *future* component-level override on an actual name-rendering `Typography` would silently exclude the Ge'ez fallback (per milestone `PITFALLS.md` Pitfall 8) — confirmed clean today (`MemberNode.jsx:189` and other current name-rendering `Typography` elements have no local `fontFamily` override).
- **Font path typo when using `public/` + hand-written `@font-face`:** not applicable if using the recommended `@fontsource` import path (Vite validates the import at build time), but flagged here because it's the failure mode the recommended approach specifically avoids.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Self-hosting a Google-family webfont | Manual `google-webfonts-helper` export + hand-written `@font-face` + `public/fonts/` asset management | `@fontsource/noto-sans-ethiopic` npm package | Subsetting-tool defaults commonly bury/default-uncheck non-Latin scripts (the exact "Latin-only subset" trap flagged in milestone `PITFALLS.md` Pitfall 1); Fontsource's package is pre-verified, pre-subset per-script, and Vite-import-validated at build time instead of runtime-404-prone |
| Font-load-completion detection for FOUT mitigation | `fontfaceobserver` or a custom `document.fonts.ready` polyfill | `font-display: swap` (already shipped in the package's CSS) | No JS needed; CSS-native mechanism already matches FONT-02's stated requirement |

**Key insight:** This phase's entire "custom code" footprint is two edited lines in `theme.js` and one-to-two import lines in `main.jsx`. Any solution that involves more moving parts (a webfont-download build plugin, a manual `@font-face` file, a JS font-loading library) is over-engineering for what Fontsource already solves.

## Common Pitfalls

### Pitfall 1: Font-family list ordering breaks the "Latin stays Inter/Sora" guarantee

**What goes wrong:** Putting `"Noto Sans Ethiopic"` first in the stack (before `"Inter"`/`"Sora"`) would make the browser prefer Ethiopic glyph shapes for any Latin/shared-codepoint characters the Ethiopic font happens to also cover (e.g. the `latin`/`latin-ext` blocks in the *non-subset* build, or basic ASCII punctuation), subtly changing Latin rendering — a direct regression of FONT-02.
**Why it happens:** "Include the Ge'ez font ahead of any OS-fallback font" (success criterion 3) can be misread as "put it first, period."
**How to avoid:** Order is `[Latin font(s) already present, "Noto Sans Ethiopic", OS-fallback fonts]` — see Pattern 1 above. Verify by rendering existing Latin UI text after the change and confirming zero visual diff.
**Warning signs:** Any existing Latin heading/body text visually looks different after this phase's changes.

### Pitfall 2: Importing the combined `400.css` instead of the subset-scoped `ethiopic-400.css`

**What goes wrong:** Ships two extra unnecessary font files (`latin`/`latin-ext` subsets) under the same family name, inflating the bundle and creating an unnecessary code-review question ("why are we shipping a second Latin font file when Inter already exists").
**Why it happens:** The unqualified `400.css` is the more obvious/default-looking import path; the `ethiopic-` prefix is easy to miss without inspecting the package contents (as done in this research session).
**How to avoid:** Always import the `ethiopic-` prefixed file(s): `ethiopic-400.css` (required), `ethiopic-700.css` (optional, see Pattern 2).
**Warning signs:** Network tab shows 2-3 new font file requests for this package instead of 1.

### Pitfall 3: `slopcheck install` (or any "install" style CLI check) mutates the real lockfile

**What goes wrong:** Running `slopcheck install <pkg>` (v0.6.1, the version available via `pip install slopcheck` at research time) is not a dry-run — it performs an actual `npm install` in whatever directory it's run from. In this research session it modified the **repo root** `package.json`/`package-lock.json` (not `frontend/`'s), which had to be reverted with `git checkout`.
**Why it happens:** The tool's `install` subcommand is designed to gate a real install, not simulate one; running it from the repo root instead of the `frontend` workspace also installs into the wrong `package.json`.
**How to avoid:** If the implementation phase re-runs any legitimacy-check tooling, run it from `frontend/` specifically, and always `git status`/`git diff` afterward to confirm no unintended lockfile changes remain before continuing.
**Warning signs:** `git status` shows `package.json`/`package-lock.json` as modified with entries you didn't intend to add, at the wrong workspace level (root vs. `frontend`).

### Pitfall 4: FOUT/layout flicker on the fixed 252×120px tree card (deferred to Phase 22, but font-display choice locked in now)

**What goes wrong:** Ethiopic glyphs in a fallback sans-serif (if the OS even has Ethiopic coverage) have different average advance widths than in Noto Sans Ethiopic; when the real font swaps in mid-session (`font-display: swap`), the `noWrap`-truncated name row's ellipsis position can visibly jump.
**Why it happens:** `font-display: swap` (already baked into the Fontsource CSS, and explicitly required by FONT-02's wording) trades in FOUT by design — text paints immediately in a fallback, then re-paints once the real font loads.
**How to avoid:** This phase locks in `font-display: swap` because FONT-02 explicitly names it as the required mechanism (matching the existing Inter/Sora `&display=swap` Google Fonts URL parameter already in `index.html`) — do not override to `optional`. The actual truncation-jump verification (against real Ge'ez name data on `/family`) is Phase 22's job, since no render surface in this phase renders actual Ge'ez text yet; this phase's own acceptance check is limited to pasting arbitrary Ge'ez sample text into an existing `Typography` to confirm the font *resolves* (per success criterion 2), not the tree-card-specific truncation behavior.
**Warning signs:** N/A for this phase directly — flag for Phase 22's manual QA pass.

## Code Examples

### Verified `theme.js` diff (exact recommended edit)
```js
// Source: this repo, frontend/src/theme.js:32-33 (current) → recommended
// BEFORE:
const FONT_SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Inter", system-ui, sans-serif';

// AFTER:
const FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, sans-serif';
```

### Verified `main.jsx` addition
```js
// Source: this repo, frontend/src/main.jsx (currently imports theme.js at line 9,
// no font CSS import exists yet)
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
// import '@fontsource/noto-sans-ethiopic/ethiopic-700.css'; // optional, see Pattern 2
```

### Manual glyph verification snippet (for the human sign-off step)
```jsx
// Paste into any existing page temporarily, or use as the basis for a
// throwaway manual-QA route — NOT a permanent code addition.
// Real Tigrinya-name test fixtures (containing labialized consonant forms),
// per milestone PITFALLS.md's correction (main Ethiopic block, not Supplement):
<Typography lang="ti">ቨርጂኒያ ቐለታ</Typography>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Loading Google Fonts via `<link href="https://fonts.googleapis.com/...">` | Self-hosting via npm-distributed `@fontsource/*` packages resolved through the bundler | Fontsource has been the standard self-hosting path for Vite/webpack projects for several years; not a new-in-2026 shift, but this app has not adopted it yet for any font (Inter/Sora still CDN-loaded) | This phase introduces the pattern for the first time in this codebase, scoped only to the new Ge'ez font — a template a future "also self-host Inter/Sora" follow-up could reuse |

**Deprecated/outdated:** None specific to this phase — no prior Ge'ez/Ethiopic font-loading code exists in this repo to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Package name `@fontsource/noto-sans-ethiopic` was originally surfaced via WebSearch/training data (milestone-level `STACK.md`), not Context7 or official docs directly in this session (Context7 MCP tools and the `ctx7` CLI fallback were both unavailable in this environment) | Standard Stack | Low — independently re-verified live via `npm view` (exists, OFL-1.1, 29 versions, official `fontsource/font-files` GitHub org, no postinstall script) and via direct tarball download/inspection (byte-for-byte CSS/unicode-range/file-size confirmation) in this session. Residual risk is near-zero given the tarball-level verification, but the package-name provenance itself remains `[ASSUMED]` per the strict provenance rule (registry existence alone doesn't upgrade it to `[VERIFIED]`) |
| A2 | Scope interpretation: FONT-01/FONT-02 do **not** require migrating Inter/Sora to self-hosted packages or removing the existing Google Fonts `<link>` in `index.html` | Summary, Architecture | Medium — if the roadmap author actually intended "zero external font requests" (ROADMAP success criterion 1 literal wording) to mean the whole page, not just the new font, the phase as scoped here would fail an overly-literal automated network-trace check. Mitigated by REQUIREMENTS.md's own narrow FONT-01 wording and REQUIREMENTS.md's "Out of Scope" section not listing Inter/Sora migration — but this is a scope call worth one line of explicit confirmation before the planner locks task boundaries |
| A3 | No current or near-future (Phase 21-23) render surface displays a Ge'ez name at `fontWeight >= 700` (i.e., through an `h1`-`h6` MUI variant), so importing `ethiopic-700.css` is optional rather than required | Code Examples / Pattern 2 | Low — verified against `ARCHITECTURE.md`'s enumerated render-surface list (`MemberNode.jsx`, `MemberCard.jsx`, `AdminMemberTable.jsx`, Autocomplete) — none use heading variants for name text. If a future surface does, the fallback would still resolve to the 400-weight Ethiopic face (near-weight match) rather than fail outright, so risk is cosmetic (slightly-off boldness), not breakage |

## Open Questions

1. **Should `ethiopic-700.css` be imported now or deferred?**
   - What we know: No current render surface needs it (verified against ARCHITECTURE.md's full surface enumeration).
   - What's unclear: Whether the planner wants to future-proof `FONT_DISPLAY` (used on `h1`-`h6`, weight 700-800) now for near-zero cost (75,648 bytes, lazily fetched), or defer until a render surface actually needs it.
   - Recommendation: Import it now — the cost is negligible and it removes a class of "why does the bold Ge'ez heading look slightly off" bug reports later. If the planner prefers minimal footprint, deferring to whichever future phase first renders Ge'ez text in a heading variant is also reasonable.

2. **Is a `<link rel="preload">` for the Ethiopic woff2 warranted?**
   - What we know: Milestone-level `PITFALLS.md` flags this as a FOUT-mitigation option for `/family` specifically (highest glyph-density page), but explicitly leaves it as an implementation-time visual-spike decision.
   - What's unclear: Whether the FOUT window is visually noticeable enough to warrant it, since Phase 20 itself doesn't render any real Ge'ez data yet (that's Phase 22).
   - Recommendation: Skip preload in this phase (nothing renders Ge'ez text yet, so there's nothing to visually spike against); revisit in Phase 22 once real tree-card rendering with real data exists to actually observe FOUT behavior against.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm registry access | Installing `@fontsource/noto-sans-ethiopic` | Confirmed reachable in this session (live `npm view`/`npm pack` succeeded) | — | — |
| Vite 6 | Resolving the CSS import from `node_modules` | ✓ (already in `frontend/package.json`, `^6.0.7`) | 6.0.7 | — |

No missing dependencies; no fallback needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 + `@testing-library/react` 16.3.2 + jsdom 26.0.0 |
| Config file | `frontend/vitest.config.js` (environment: jsdom, setup: `frontend/test/setup.js`) |
| Quick run command | `npm test --workspace frontend -- theme` |
| Full suite command | `npm run test --workspace frontend` (and root `npm test` if it runs both workspaces) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FONT-01 | `FONT_SANS` and `FONT_DISPLAY` string constants contain `"Noto Sans Ethiopic"` | unit | `npx vitest run src/theme.test.js` | ❌ Wave 0 |
| FONT-01 | No `fonts.googleapis.com`/`fonts.gstatic.com` request for the new Ethiopic font | manual | Network tab trace of `npm run build && npm run preview --workspace frontend` (or deployed app) | manual-only — jsdom does not fetch real network resources |
| FONT-02 | Existing Google Fonts `<link>` for Inter/Sora in `index.html` is unchanged (byte-for-byte) | unit/snapshot | `npx vitest run` against a raw-file read of `index.html`, or a simple `git diff --stat frontend/index.html` check in CI | ❌ Wave 0 (trivial — could also just be a manual diff review, not worth a dedicated test) |
| FONT-02 | Ge'ez sample text pasted into an existing `Typography` renders without visual regression to surrounding Latin text | manual | Visual pass, ≥2 browser/OS combinations | manual-only — jsdom cannot assert glyph rendering |

### Sampling Rate
- **Per task commit:** `npx vitest run src/theme.test.js` (new, cheap, milliseconds)
- **Per wave merge:** `npm run test --workspace frontend` (full frontend suite — must stay green, this phase should not break any existing test since it only touches `theme.js`/`main.jsx`/`package.json`)
- **Phase gate:** Full suite green + the two manual checks (network trace, ≥2-browser glyph visual pass) recorded before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/theme.test.js` — new file; asserts `FONT_SANS`/`FONT_DISPLAY` (exported or re-derived) contain the string `"Noto Sans Ethiopic"`. **Note:** `FONT_SANS`/`FONT_DISPLAY` are currently module-private `const`s in `theme.js` (not exported) — the implementation task must either export them for testability or assert indirectly via `theme.typography.fontFamily`/`theme.typography.h1.fontFamily` on the default-exported `theme` object (the latter requires no export change and is the lower-risk option).
- [ ] No test-framework install needed — Vitest/RTL/jsdom already fully configured (`frontend/vitest.config.js`, `frontend/test/setup.js`).

**What jsdom/Vitest genuinely cannot verify for this phase (must be manual):** whether the Ethiopic codepoints actually have a rendered glyph (tofu detection), whether `font-display: swap` produces a visible flicker, and whether the self-hosted `@font-face` file is reachable over a real network (jsdom does not fetch real font resources). These are exactly the milestone-level `PITFALLS.md`'s documented jsdom limitations, reconfirmed here as applying specifically to this phase's two manual-only rows above.

## Security Domain

Not applicable — `config.json` has no `security_enforcement: false` override, but this phase installs no auth/session/input-validation-relevant code; it is a static-asset/CSS-only change with zero attack surface beyond standard supply-chain package-install hygiene (covered under Package Legitimacy Audit above). No ASVS category applies meaningfully to a font-asset addition.

## Sources

### Primary (HIGH confidence)
- Direct `npm view @fontsource/noto-sans-ethiopic` (version, license, dist-tags, postinstall script, repository URL) — run live in this session
- Direct `npm pack @fontsource/noto-sans-ethiopic@5.3.0` + tarball extraction/inspection of `400.css`, `ethiopic-400.css`, `ethiopic.css`, `package.json`, and the actual `.woff2` file sizes — run live in this session
- `slopcheck` v0.6.1 (`pip install slopcheck`) — run live in this session, `[OK]` verdict
- Repo reads: `frontend/src/theme.js`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/package.json`, `frontend/src/components/family/MemberNode.jsx`, `frontend/src/components/AppLayout.jsx`, `frontend/src/components/BrandMark.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/vitest.config.js`, `frontend/test/setup.js`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/config.json`, `./CLAUDE.md`
- Milestone-level research (already HIGH/MEDIUM-HIGH confidence per its own metadata): `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` — cross-referenced and, where checkable, re-verified in this session (package version, license, unicode-range, file sizes)

### Secondary (MEDIUM confidence)
- WebFetch of `fontsource.org/fonts/noto-sans-ethiopic/install` — returned the *variable*-font package's install instructions rather than the static package's (a fetch-tool limitation, not a fact about the package); superseded by the direct tarball inspection above, which is authoritative

### Tertiary (LOW confidence)
- None carried forward — all claims in this file are either directly tool-verified in this session or explicitly flagged in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — package version/license/file-contents verified by direct tool inspection (`npm view`, `npm pack` + tarball extraction), not just documentation claims
- Architecture: HIGH — both required file edits (`theme.js`, `main.jsx`) verified against actual current file contents in this repo
- Pitfalls: HIGH — the ordering/subset-import pitfalls are verified via direct CSS inspection; the slopcheck side-effect pitfall was directly encountered and resolved in this session

**Research date:** 2026-07-30
**Valid until:** 30 days (stable static-asset package; low churn risk) — re-verify `npm view` version if planning is deferred more than a month

## RESEARCH COMPLETE

**Phase:** 20 - Self-Hosted Font & Theme
**Confidence:** HIGH

### Key Findings
- `@fontsource/noto-sans-ethiopic@5.3.0` (OFL-1.1) is the correct, verified package — confirmed via live `npm view` and direct tarball inspection, not just documentation claims.
- The Ethiopic-only subset file `ethiopic-400.css` (not plain `400.css`) is the correct import; its `unicode-range` (`U+1200-1399,...`) fully covers Tigrinya's labialized-consonant forms (ቨ, ቐ), confirming the milestone-level correction that these live in the main Ethiopic block, not the Supplement.
- Scope resolved: FONT-01/FONT-02 apply to the Ge'ez font only — do not touch the existing Inter/Sora Google Fonts `<link>` in `index.html` or add `@fontsource/inter`/`@fontsource/sora`. This is flagged as Assumption A2 for explicit confirmation.
- Font-stack ordering must place `"Noto Sans Ethiopic"` after the existing Latin font(s) and before OS-fallback fonts in both `FONT_SANS` and `FONT_DISPLAY` — not first overall.
- `font-display: swap` requires no extra configuration; it ships baked into the Fontsource CSS already, matching FONT-02's explicit requirement.
- Caution for planner/executor: `slopcheck install <pkg>` performs a real `npm install` as a side effect (encountered and reverted in this session) — do not run it against the repo root without immediately checking `git status`.

### File Created
`.planning/phases/20-self-hosted-font-theme/20-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Verified via live npm registry query + direct tarball download/inspection |
| Architecture | HIGH | Both edit targets (`theme.js`, `main.jsx`) verified against actual current file contents |
| Pitfalls | HIGH | Ordering/subset-file pitfalls verified via direct CSS inspection; slopcheck side-effect pitfall directly encountered |

### Open Questions
- Whether to import `ethiopic-700.css` now (recommended, negligible cost) or defer until a heading-weight Ge'ez render surface exists.
- Whether a `<link rel="preload">` for the Ethiopic woff2 is warranted in this phase (recommended: skip, defer to Phase 22 when real Ge'ez data first renders on `/family`).
- Scope confirmation (A2): that Inter/Sora self-hosting is genuinely out of scope for FONT-01/FONT-02, per REQUIREMENTS.md's narrow wording.

### Ready for Planning
Research complete. Planner can now create PLAN.md files for Phase 20.
