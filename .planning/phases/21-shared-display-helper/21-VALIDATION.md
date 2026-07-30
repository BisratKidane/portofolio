---
phase: 21
slug: shared-display-helper
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-30
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + jsdom (frontend workspace) |
| **Config file** | `frontend/vitest.config.js` (existing) |
| **Quick run command** | `cd frontend && npm test -- displayName` |
| **Full suite command** | `cd frontend && npm test` |
| **Estimated runtime** | ~5–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- displayName`
- **After every plan wave:** Run `cd frontend && npm test`
- **Before `/gsd:verify-work`:** Full frontend suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | VIEW-03 / QUAL-01 | — | N/A (pure function; no untrusted-input handling) | unit | `cd frontend && npm test -- displayName` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Exact task IDs finalized by the planner; this map is the sampling contract.*

---

## Wave 0 Requirements

- [ ] `frontend/src/utils/displayName.test.js` (or colocated) — the unit test is created by the phase's own TDD task (RED → GREEN). No pre-existing test targets `displayName.js` (the `utils/` directory does not exist yet).

*Existing frontend Vitest + jsdom infrastructure otherwise covers this phase — no framework install needed. Closest scaffolding analog: `frontend/src/api/photoClient.test.js` (plain `.js` pure-function test).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|

All phase behaviors have automated verification — the helper is a pure function returning data (no glyph rendering, no DOM). Real glyph-rendering correctness is Phase 22's manual gate, not this phase's.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (single tdd task)
- [x] Wave 0 covers all MISSING references (the new `displayName` test is created by the tdd task itself)
- [x] No watch-mode flags (use `npm test` = `vitest run`, non-watch)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-30
