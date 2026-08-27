---
phase: 25
slug: reusable-personcard
status: approved
nyquist_compliant: true
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
| 25-01-01 | 01 | 1 | CARD-01..04 (foundation) | T-25-02 | genderMeta extraction is behavior-preserving; MemberNode.test.jsx stays green with zero edits | unit (existing, regression) | `cd frontend && npx vitest run src/components/family/MemberNode.test.jsx` | ✅ existing file | ⬜ pending |
| 25-01-02 | 01 | 1 | CARD-01, CARD-02, CARD-03, CARD-04 | T-25-01, T-25-02, T-25-03 | Field omission, role-agnostic rendering, gender cue (data-gender/aria-label + deterministic `data-ring-style` ring border-style), child-count/expand gate, canEdit gate | component (new) | `cd frontend && npx vitest run src/components/person/PersonCard.test.jsx` | ❌ W0 (new file) | ⬜ pending |
| 25-02-01 | 02 | 2 | SPOUSE-01 | T-25-04 | Spouse pairing + dashed connector render; spouse card has no expand control; no spouse-of-spouse recursion (exactly 2 person-card DOM roots) | component (extends 25-01-02's file) | `cd frontend && npx vitest run src/components/person/PersonCard.test.jsx -t spouse` | ❌ W0 (extends new file) | ⬜ pending |
| 25-02-02 | 02 | 2 | CARD-01..04, SPOUSE-01 (phase close) | T-25-05 | Full workspace regression gate; MemberNode.test.jsx confirmed unmodified across the whole phase; 44px touch targets + stable data-testid audited | full suite (existing + new) | `cd frontend && npx vitest run` | ✅ existing + new files | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/person/PersonCard.test.jsx` — colocated test file for CARD-01..04, SPOUSE-01 (created in 25-01 Task 2, extended in 25-02 Task 1)
- [ ] Existing Vitest + RTL + jsdom infrastructure covers all phase requirements (no framework install needed)

---

## Manual-Only Verifications

*None.* Every CARD-01..04 and SPOUSE-01 behavior — including the D-09 gender
ring's non-color cue — is covered by an automated Vitest + RTL assertion:

- The ring border-style cue (solid/dashed/dotted per gender) is asserted via
  a stable `data-ring-style` attribute on the ring wrapper (25-01 Task 2
  acceptance criteria), not left to visual/manual inspection, because
  asserting Emotion-generated border shorthand directly via `toHaveStyle` is
  unreliable in jsdom.

*Automated tests cover data-gender, aria-label, ring border-style (via
`data-ring-style`), field omission, count pluralization, expand-gate,
canEdit gate, and spouse pairing/no-expand/no-recursion.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
