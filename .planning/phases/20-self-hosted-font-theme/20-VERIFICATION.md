---
phase: 20-self-hosted-font-theme
verified: 2026-07-30T21:55:00Z
status: human_needed
score: 4/4 automated must-haves verified (2 additional criteria are correctly manual-only)
overrides_applied: 0
---

# Phase 20: Self-Hosted Font & Theme Verification Report

**Phase Goal:** Ge'ez script renders correctly and consistently via a self-hosted webfont (`@fontsource/noto-sans-ethiopic`), with zero CDN dependency for the Ge'ez font and no regression to existing Latin (Inter/Sora) rendering.
**Verified:** 2026-07-30T21:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `@fontsource/noto-sans-ethiopic` installed as a local frontend dependency, imported via CSS side-effect import, served from the app's own build output (no external CDN `<link>` for this font) | ✓ VERIFIED (automated part) | `frontend/package.json:20` → `"@fontsource/noto-sans-ethiopic": "^5.3.0"`. `frontend/src/main.jsx:7-8` imports `ethiopic-400.css` and `ethiopic-700.css` (subset paths, not the unqualified `400.css`/`700.css` — confirmed via grep, 0 matches for unqualified paths). Live `npm run build` emits the font locally: `dist/assets/noto-sans-ethiopic-ethiopic-{400,700}-normal-*.{woff2,woff}` (4 files, ~390KB total), proving the woff assets are bundled into the app's own output, not fetched from a CDN at runtime. |
| 2 | Ge'ez glyphs incl. Tigrinya labialized forms (ቨ, ቐ) render correctly across ≥2 browsers | ? MANUAL (correctly deferred) | jsdom has no font rasterizer; SUMMARY.md correctly records this as "pending" under Manual-Only Sign-Off Items, not falsely claimed as done. |
| 3 | Both `FONT_SANS` and `FONT_DISPLAY` include "Noto Sans Ethiopic" after Latin font(s) and before OS-fallback | ✓ VERIFIED | `frontend/src/theme.js:32-33`: `FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, ...'`; `FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, ...'`. Live-run `theme.test.js` (2/2 tests pass) asserts ordering via `theme.typography.fontFamily`/`theme.typography.h1.fontFamily` string-index comparisons, with upper bound against `system-ui` so a future regression (Ethiopic pushed past OS-fallback) would fail the test. No new `export` added to `FONT_SANS`/`FONT_DISPLAY` (grep confirms 0 matches for `export const FONT_`). |
| 4 | Latin keeps rendering in Inter/Sora (font-display: swap); no FOUT layout shift | ✓ VERIFIED (ordering) / MANUAL (visual pass, correctly deferred split) | Ordering guarantee is structurally proven by truth #3 (Ethiopic's `unicode-range` has zero Latin coverage per RESEARCH.md, so it is never selected for Latin glyphs). The `/family-tree-card`-specific FOUT check is explicitly deferred to Phase 22 per `.planning/STATE.md`'s "Phase 20 scope note" — this is a documented, intentional split, not an unmet criterion. |

**Score:** 4/4 automated-checkable truths verified; 2 items (glyph rendering, network trace) are correctly recorded as pending manual sign-off, not claimed as complete.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/package.json` | `@fontsource/noto-sans-ethiopic` dependency, real npm install | ✓ VERIFIED | Line 20, `"^5.3.0"`, alphabetically sorted between `@emotion/styled` and `@mui/icons-material` as specified. |
| `package-lock.json` | Lockfile updated with new package | ✓ VERIFIED | `grep -c '@fontsource/noto-sans-ethiopic' package-lock.json` → 3 matches (package entry + resolved + integrity records). |
| `frontend/src/main.jsx` | Ethiopic-subset CSS side-effect imports (400 + 700) | ✓ VERIFIED, WIRED | Lines 7-8, both subset paths present, correctly positioned after third-party imports and before local imports. `npm run build` confirms both resolve (no module-not-found). |
| `frontend/src/theme.js` | FONT_SANS/FONT_DISPLAY updated, locked position | ✓ VERIFIED, WIRED | Lines 32-33 exactly match plan spec; feeds `typography.fontFamily` (line 50) and `typography.h1`-`h6` (lines 51-56), consumed app-wide via `ThemeProvider` in `main.jsx`. |
| `frontend/src/theme.test.js` | Automated ordering assertions | ✓ VERIFIED, WIRED, PASSING | 26 lines, 2 `it` blocks matching plan's `<behavior>` spec exactly. Live-executed: 2/2 pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `frontend/src/main.jsx` | `@fontsource/noto-sans-ethiopic/ethiopic-400.css` | side-effect import | ✓ WIRED | Import present at line 7; build output confirms Vite resolved and bundled the asset. |
| `frontend/src/theme.test.js` | `frontend/src/theme.js` | `import theme from './theme.js'` | ✓ WIRED | Line 2; test executes against the real default-exported theme object (not a mock), live run confirms 2/2 pass. |

### Behavioral Spot-Checks (live-executed by verifier, not sourced from SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| theme.test.js passes | `cd frontend && npm test -- theme` | `Test Files 1 passed (1)`, `Tests 2 passed (2)` | ✓ PASS |
| Full frontend suite green (no regression) | `cd frontend && npm test` | `Test Files 34 passed (34)`, `Tests 268 passed (268)` | ✓ PASS (matches SUMMARY's claimed 268/268) |
| Production build succeeds, bundles font locally | `cd frontend && npm run build` | Exit 0; `dist/assets/noto-sans-ethiopic-ethiopic-400-normal-*.woff2` (75.08 kB) + `-700-normal-*.woff2` (75.65 kB) + matching `.woff` fallbacks emitted | ✓ PASS |
| Unqualified (non-subset) font paths absent | `grep -c "fontsource/noto-sans-ethiopic/400.css\|/700.css" frontend/src/main.jsx` | `0` | ✓ PASS |
| No new export added to theme.js | `grep -c "export const FONT_" frontend/src/theme.js` | `0` | ✓ PASS |

### Scope Enforcement (LOCKED scope check)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| `frontend/index.html` untouched since phase base commit | `git diff --stat ff46145..HEAD -- frontend/index.html` | No output (byte-identical) | ✓ PASS — no defect |
| Root `package.json` untouched | `git diff --stat ff46145..HEAD -- package.json` | No output | ✓ PASS — no defect |
| `@fontsource/inter` / `@fontsource/sora` NOT added | `grep -rn "@fontsource/inter\|@fontsource/sora" frontend/package.json package-lock.json` | 0 matches | ✓ PASS — no defect |
| Inter/Sora Google Fonts `<link>` still present, unmodified | Read `frontend/index.html` lines 8-13 | `https://fonts.googleapis.com/css2?family=Sora...&family=Inter...` link intact | ✓ PASS — no defect |

No LOCKED-scope violations found.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FONT-01 | 20-01-PLAN.md | Self-hosted Ge'ez webfont, no external CDN, wired into MUI theme | ✓ SATISFIED (code) / pending manual network-trace sign-off | Package installed, imported, bundled by build; theme wiring confirmed. `.planning/REQUIREMENTS.md` checkbox correctly left unchecked pending the manual network-trace sign-off item. |
| FONT-02 | 20-01-PLAN.md | Latin keeps rendering Inter/Sora, `font-display: swap`, no FOUT regression on `/family` tree cards | ✓ SATISFIED (ordering, code) / pending manual visual sign-off (deferred split to Phase 22 for the tree-card-specific check, per STATE.md) | Font-stack ordering proven by test; tree-card visual check intentionally deferred, documented in STATE.md, not a Phase 20 gap. |

Note: `.planning/REQUIREMENTS.md` still shows `[ ]` (unchecked) for both FONT-01/FONT-02 and the tracking table (line 74-75) shows "Pending" — this is consistent with the phase's own design (manual sign-off items remain open) and is not itself a code defect. It should be flagged to the developer as an outstanding administrative step once manual sign-off completes.

### Anti-Patterns Found

None. Scanned `theme.js`, `theme.test.js`, `main.jsx`, `package.json` for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub patterns — zero matches.

### Human Verification Required

### 1. Network trace confirms zero external request for Noto Sans Ethiopic specifically

**Test:** Run `npm run build && npm run preview --workspace frontend`, open DevTools Network tab, hard-reload, filter for font requests.
**Expected:** `noto-sans-ethiopic-ethiopic-{400,700}-normal-*.woff2` requests resolve to the same origin (local dev/preview server), zero request to an external host for this font. Inter/Sora's pre-existing Google Fonts CDN requests are expected and out of scope.
**Why human:** jsdom/vitest cannot make real network requests or inspect the resolved origin of browser font requests; this requires a real browser DevTools session.

### 2. Ge'ez glyph correctness across ≥2 browsers (SC2)

**Test:** Paste a real Tigrinya name fixture with labialized consonant forms (e.g. `<Typography lang="ti">ቨርጂኒያ ቐለታ</Typography>`) into any existing page; visually inspect in at least 2 browser/OS combinations.
**Expected:** Correct glyph shapes rendered, no "tofu" (missing-glyph) boxes.
**Why human:** jsdom has no font rasterizer/glyph renderer; this can only be visually confirmed in a real browser.

### 3. No FOUT-driven layout shift on hard-reload (font-resolution scope only, per Phase 20's own bounds)

**Test:** Hard-reload a page containing pasted Ge'ez sample text under throttled network in DevTools.
**Expected:** No visible reflow/jump as the Ethiopic webfont swaps in (font-display: swap already shipped in Fontsource CSS).
**Why human:** Visual timing/layout-shift perception requires a real browser render; jsdom cannot simulate FOUT. (Note: the full `/family`-tree-card-specific check against real Ge'ez data is correctly out of scope for Phase 20 and deferred to Phase 22 per STATE.md — do not conflate this generic font-resolution check with that deferred one.)

### Gaps Summary

No code-level gaps found. All automatable success criteria (SC1's install/bundle check, SC3, and the ordering half of SC4) are verified live against the running codebase, not just SUMMARY.md claims:
- Package correctly installed only in the frontend workspace (root untouched).
- Both Ethiopic subset CSS files imported at the correct position, correct files (not the unqualified/duplicate-glyph variant).
- Font-stack ordering in `theme.js` exactly matches the locked D-04 decision, proven by a live-passing `theme.test.js` with upper/lower string-index bounds.
- Full frontend test suite (268/268) and production build both pass live, matching SUMMARY.md's claims (not just trusting them).
- LOCKED scope respected: no `frontend/index.html` changes, no `@fontsource/inter`/`@fontsource/sora` additions, root `package.json` untouched.
- The two genuinely manual-only success criteria (SC2 glyph rendering, and the network-trace half of SC1) are honestly recorded as pending in SUMMARY.md — not misrepresented as done.
- SC4's `/family`-tree-card-specific FOUT check is correctly deferred to Phase 22 per STATE.md's documented scope note and is NOT flagged here as an unmet Phase 20 criterion.

The only reason status is `human_needed` rather than `passed` is the presence of genuine, correctly-identified manual sign-off items (network trace + cross-browser glyph visual pass) — these were never claimed as automated and require a human with a real browser to close out. No plan or code change is needed to reach `passed`; only human sign-off on the three items above.

---

_Verified: 2026-07-30T21:55:00Z_
_Verifier: Claude (gsd-verifier)_
