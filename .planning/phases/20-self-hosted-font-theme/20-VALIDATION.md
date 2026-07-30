---
phase: 20
slug: self-hosted-font-theme
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-30
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + jsdom (frontend workspace) |
| **Config file** | `frontend/vitest.config.js` (existing) |
| **Quick run command** | `cd frontend && npm test -- theme` |
| **Full suite command** | `cd frontend && npm test` |
| **Estimated runtime** | ~10–20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- theme`
- **After every plan wave:** Run `cd frontend && npm test`
- **Before `/gsd:verify-work`:** Full frontend suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | FONT-01 | — | N/A (static asset bundling; no untrusted input) | unit | `cd frontend && npm test -- theme` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | FONT-01 | — | N/A | unit | `cd frontend && npm test -- theme` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | FONT-02 | — | N/A | unit | `cd frontend && npm test -- theme` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Exact task IDs finalized by the planner; this map is the sampling contract, not the task breakdown.*

---

## Wave 0 Requirements

- [ ] `frontend/src/theme.test.js` (or co-located `theme.test.jsx`) — stubs asserting the font-stack constants include `"Noto Sans Ethiopic"` (FONT-01 SC3) and that Ge'ez follows Latin / precedes OS fallback (FONT-02 ordering). No existing test targets `theme.js` today.

*Existing frontend Vitest + jsdom + React Testing Library infrastructure otherwise covers this phase — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ge'ez glyphs (incl. Tigrinya labialized forms ቨ U+1268, ቐ U+1250) render with correct shapes | FONT-01 | jsdom has no font rasterizer — it cannot assert glyph rendering | Load the app in ≥2 browser/OS combos; paste a real Tigrinya name fixture into a `Typography`; visually confirm correct glyph shapes (not tofu boxes / wrong forms) |
| Zero external font requests for the Ge'ez font | FONT-01 | Network-trace assertion is a runtime browser observation, not a unit test | Open DevTools Network tab, filter fonts; confirm Noto Sans Ethiopic is served from the local origin (Fontsource bundle), with no request to a non-local host for it |
| No FOUT-driven layout shift on `/family` tree cards | FONT-02 | Layout-shift/FOUT timing is a real-browser rendering behavior; the 252×120px card is already tight for `noWrap` text | Throttle network, hard-reload `/family`; confirm no visible reflow/jump on the fixed-size cards as fonts swap in (`font-display: swap`) |

*Not all phase behaviors have automated verification — the glyph-rendering and FOUT criteria are manual-only by nature (documented as human sign-off gates in STATE.md).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (the new `theme` test)
- [ ] No watch-mode flags (use `npm test` = `vitest run`, non-watch)
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
