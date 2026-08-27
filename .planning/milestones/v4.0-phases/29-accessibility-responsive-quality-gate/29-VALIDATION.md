---
phase: 29
slug: accessibility-responsive-quality-gate
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-05
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (frontend: + RTL + jsdom + jest-axe; backend: node integration + mysql2/promise) |
| **Config file** | `frontend/vitest.config.js`, `backend/vitest.config.js` |
| **Quick run command** | `npm test --workspace frontend -- --run <file>` / `npm test --workspace backend -- --run <file>` |
| **Full suite command** | `npm test --workspaces` |
| **Estimated runtime** | ~30-60s frontend, ~30-60s backend (existing suite sizes; this phase adds ~10-15 new test cases, no new slow paths) |

---

## Sampling Rate

- **After every task commit:** Run the single-file command shown in that task's `<verify>`.
- **After every plan wave:** Run `npm test --workspaces`.
- **Before `/gsd:verify-work`:** Full suite must be green (SC-4 gate; backend concurrency pair
  engine-skipped on local MariaDB per D-01, unconditionally green on CI's MySQL 8.4).
- **Max feedback latency:** < 60s per task-level command; < 120s for the full-suite gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|---------------------|-------------|--------|
| 29-01-T1 | 29-01 | 1 | A11Y-01 (D-01) | T-29-01, T-29-02 | `isMariaDB()` engine detection, read-only | unit (node) | `cd backend && node --check test/dbEngine.js` | ❌ W0 | ⬜ pending |
| 29-01-T2 | 29-01 | 1 | A11Y-01 (D-01) | T-29-01 | Documented `ctx.skip` on exactly VERIFY-04 + REL-06; CI coverage unweakened | integration | `npm test --workspace backend -- --run verifyEmail.test.js familyMember.dedup.test.js` | ✓ (modify) | ⬜ pending |
| 29-01-T3 | 29-01 | 1 | A11Y-01 (D-01) | — | KNOWN-ISSUES.md caveat discoverable | doc | `grep -c "^## MariaDB-only skip" KNOWN-ISSUES.md` | ✓ (modify) | ⬜ pending |
| 29-02-T1 | 29-02 | 1 | A11Y-01 (D-02) | T-29-SC | jest-axe/wcag-contrast installed, legitimacy pre-audited [OK] | config | `npm ls --workspace frontend jest-axe wcag-contrast` | ✓ (modify) | ⬜ pending |
| 29-02-T2 | 29-02 | 1 | A11Y-01 (D-03) | — | Contrast test RED against unfixed tokens (TDD) | unit (pure data) | `npm test --workspace frontend -- --run theme.contrast.test.js` (expect non-zero) | ❌ W0 | ⬜ pending |
| 29-02-T3 | 29-02 | 1 | A11Y-01 (D-03) | T-29-03 | Contrast test GREEN; shared tokens untouched | unit (pure data) | `npm test --workspace frontend -- --run theme.contrast.test.js PersonCard.test.jsx` | ❌ W0 (test) / ✓ (modify, component) | ⬜ pending |
| 29-03-T1 | 29-03 | 2 | A11Y-01 (D-02) | — | Zero axe violations + Edit/Add/Expand tab order on PersonCard | unit (jsdom) | `npm test --workspace frontend -- --run PersonCard.test.jsx` | ✓ (modify) | ⬜ pending |
| 29-03-T2 | 29-03 | 2 | A11Y-01 (D-02, D-04) | — | Zero axe violations on GenerationGrid + PersonSearch; 600px/900px breakpoint CSS present; search tab-reachable | unit (jsdom) | `npm test --workspace frontend -- --run GenerationGrid.test.jsx PersonSearch.test.jsx` | ✓ (modify) | ⬜ pending |
| 29-03-T3 | 29-03 | 2 | A11Y-01 (D-02) | T-29-04 | Zero axe violations on DetailPage once head card loaded (baseElement, portal-aware) | unit (jsdom) | `npm test --workspace frontend -- --run DetailPage.test.jsx` | ✓ (modify) | ⬜ pending |
| 29-04-T1 | 29-04 | 3 | A11Y-01 (D-04) | — | HUMAN-UAT checklist created (3 items: 360px, 768px, keyboard-visible-focus) | doc | `grep -c "^### " 29-HUMAN-UAT.md` | ❌ W0 | ⬜ pending |
| 29-04-T2 | 29-04 | 3 | A11Y-01 (D-05) | T-29-05 | Full suite exits 0; honest engine/skip status reported (no false 100%) | integration + full-suite | `npm test --workspaces` | ✓ suite exists | ⬜ pending |
| 29-04-T3 | 29-04 | 3 | A11Y-01 (SC-1, SC-3) | T-29-06 | Human confirms visually-painted focus + mobile readability at 360px/768px | manual-only | n/a — `29-HUMAN-UAT.md` checklist | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] jest-axe / wcag-contrast dev dependencies planned for install (Plan 29-02 Task 1, version pins `^11.0.0`/`^3.0.0` per RESEARCH.md, pre-audited [OK])
- [x] `backend/test/dbEngine.js` — shared `SELECT VERSION()` engine-detection helper planned (Plan 29-01 Task 1; confirmed genuinely new code, no existing analog)
- [x] `frontend/src/theme.contrast.test.js` — new deterministic contrast test planned (Plan 29-02 Task 2, RED-first TDD)
- [x] `.planning/phases/29-accessibility-responsive-quality-gate/29-HUMAN-UAT.md` — new HUMAN-UAT file planned (Plan 29-04 Task 1, mirrors 26/27 format)
- [x] a11y / contrast / focus-order test additions for A11Y-01 SC-1..SC-3 planned across Plans 29-02 (contrast) and 29-03 (axe + tab-order + breakpoint CSS)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|---------------------|
| Mobile layout readability/usability at 360px + 768px | A11Y-01 (SC-3) | jsdom cannot measure rendered layout | `29-HUMAN-UAT.md` item 1/2: load `/detail` at 360px and 768px viewport; verify grid collapses (1/row at 360px, 2/row at 768px — not 3), text legible, no horizontal scroll, controls tappable (44px+ targets) |
| Visually-painted keyboard focus ring | A11Y-01 (SC-1) | jsdom has no paint engine — RTL's `toHaveFocus()` proves focus *landed* on the right element but not that it is *visually indicated* | `29-HUMAN-UAT.md` item 3: Tab through Edit/Add/Expand/search controls at both 360px and 768px, confirm a real focus ring is painted on each |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the one manual-only leg — Plan
      29-04 Task 3 — is a `checkpoint:human-verify` task, not an untested gap; it is backed by the
      automated `toHaveFocus()`/breakpoint-CSS-presence assertions in Plan 29-03 covering
      everything jsdom structurally can prove).
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only the final
      checkpoint task in Plan 29-04 is manual; all 11 preceding tasks across Plans 29-01/02/03/04
      have an `<automated>` command).
- [x] Wave 0 covers all MISSING references (`dbEngine.js`, `theme.contrast.test.js`,
      `29-HUMAN-UAT.md`, jest-axe/wcag-contrast install — all assigned to specific tasks above).
- [x] No watch-mode flags (all commands use `vitest run` / `--run`, never `vitest` bare/watch).
- [x] Feedback latency < 120s (single-file commands < 60s; full-suite gate < 120s).
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** planned — ready for `/gsd:execute-phase 29`.
