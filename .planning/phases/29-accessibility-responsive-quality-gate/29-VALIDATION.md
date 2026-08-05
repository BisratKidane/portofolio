---
phase: 29
slug: accessibility-responsive-quality-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-05
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend: + RTL + jsdom; backend: node integration) |
| **Config file** | `frontend/vitest.config.js`, `backend/vitest.config.js` |
| **Quick run command** | `npm test --workspace frontend` |
| **Full suite command** | `npm test --workspaces` |
| **Estimated runtime** | ~TBD (planner to confirm) seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace frontend`
- **After every plan wave:** Run `npm test --workspaces`
- **Before `/gsd:verify-work`:** Full suite must be green (SC-4 gate; backend concurrency pair engine-skipped on local MariaDB per D-01)
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | A11Y-01 | — | N/A | unit | `TBD` | ❌ W0 | ⬜ pending |

*Planner to complete from RESEARCH.md Validation Architecture (D-01 engine guard, D-02 jest-axe/focus, D-03 contrast math, D-04 mobile breakpoint assertions + HUMAN-UAT).*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] jest-axe / wcag-contrast dev dependencies installed (version pins per RESEARCH.md)
- [ ] `backend/test/dbEngine.js` — shared `SELECT VERSION()` engine-detection helper (D-01)
- [ ] a11y / contrast / focus-order test stubs for A11Y-01 SC-1..SC-3

*Planner to finalize.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mobile layout readability/usability at 360px + 768px | A11Y-01 (SC-3) | jsdom cannot measure rendered layout | HUMAN-UAT: load `/detail` at 360px and 768px viewport; verify grid collapses (1/row at 360px, 2/row at 768px), text legible, controls tappable |

*Planner to finalize per D-04 (HUMAN-UAT precedent 26/27).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
