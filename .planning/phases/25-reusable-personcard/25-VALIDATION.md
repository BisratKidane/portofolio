---
phase: 25
slug: reusable-personcard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `frontend/vitest.config.js` (or vite.config test block) |
| **Quick run command** | `npm test --workspace frontend -- PersonCard` |
| **Full suite command** | `npm test --workspace frontend` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace frontend -- PersonCard`
- **After every plan wave:** Run `npm test --workspace frontend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | CARD-XX | — | N/A | unit | `npm test --workspace frontend -- PersonCard` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Planner fills concrete rows per task; every rendering/a11y/conditional-visibility behavior maps to a Vitest + RTL assertion in `PersonCard.test.jsx`.)*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/detail/PersonCard.test.jsx` — colocated test stub for CARD-01..04, SPOUSE-01
- [ ] Existing Vitest + RTL + jsdom infrastructure covers all phase requirements (no framework install needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gender ring shape is genuinely *visible* (solid/dashed/dotted) | CARD-03 | Visual perception of border-style not asserted by RTL DOM queries | Render each gender; confirm distinct ring style over both photo and fallback avatar |

*Automated tests cover data-gender, field omission, count pluralization, expand-gate, canEdit gate, and spouse no-expand; the visible-cue perception is the one manual check.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
