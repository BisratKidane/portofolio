---
phase: 17
slug: family-deep-tree-visualization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend + frontend workspaces) + React Testing Library + jsdom |
| **Config file** | `backend/vitest.config.js`, `frontend/vitest.config.js` |
| **Quick run command** | `npm test --workspace frontend` |
| **Full suite command** | `npm test --workspaces` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace frontend` (or backend when the guard change is touched)
- **After every plan wave:** Run `npm test --workspaces`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | REQ-{XX} | T-{N}-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*To be filled by gsd-planner from RESEARCH.md "## Validation Architecture" (TREE-01..04, QUAL-02/03).*

---

## Wave 0 Requirements

- [ ] `npm install --workspace frontend` — install the spike-chosen tree library (net-new dependency; no viz lib currently installed)
- [ ] jsdom mock helpers for `@xyflow/react` (ResizeObserver, DOMMatrixReadOnly, offsetWidth/Height, getBBox) per reactflow.dev `mockReactFlow()`

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SC-1 spike: synthetic-union-node spouse pairing renders correctly at ~15–20 generation depth | TREE-01 | Real SVG/canvas layout cannot be asserted under jsdom; spike pass/fail is a visual bar | Run the spike page against the deep fixture; confirm couples render paired with shared children descending from the union node without overlap/jank |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
