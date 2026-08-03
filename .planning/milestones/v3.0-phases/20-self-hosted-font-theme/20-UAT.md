---
status: complete
phase: 20-self-hosted-font-theme
source: [20-01-SUMMARY.md]
started: 2026-07-30T19:58:50Z
updated: 2026-07-30T20:01:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold-start smoke — app boots + Latin UI unchanged
expected: Production build at http://localhost:4173/ loads with no console errors; existing Latin UI renders unchanged in Inter/Sora (font wiring didn't regress the app).
result: pass

### 2. Ge'ez glyph rendering (Tigrinya labialized forms) across ≥2 browsers
expected: Real Tigrinya fixtures — including ቨ (U+1268) and ቐ (U+1250) — render as correct Ethiopic glyph shapes (no tofu boxes □, no wrong forms) in at least two browser/OS combinations. Both body weight (400) and heading weight (700) render.
result: pass

### 3. Self-hosted — zero external request for the Ge'ez font
expected: In DevTools → Network (filter: Font), the Noto Sans Ethiopic woff2 is served same-origin from localhost:4173 (e.g. /assets/noto-sans-ethiopic-ethiopic-400-normal-*.woff2). No request for the Ge'ez font goes to any external host. (Inter/Sora requests to fonts.gstatic.com are expected and out of scope — D-02.)
result: pass

### 4. No FOUT-driven layout shift on hard reload
expected: With network throttling on, a hard reload shows no jarring reflow/jump as fonts swap in (font-display: swap). Font-resolution scope only — the /family tree-card truncation check is Phase 22's job per STATE scope note.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
