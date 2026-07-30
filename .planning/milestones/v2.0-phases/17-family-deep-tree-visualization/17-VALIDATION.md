---
phase: 17
slug: family-deep-tree-visualization
status: finalized
nyquist_compliant: true
wave_0_complete: true
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
| **Estimated runtime** | ~15s (frontend workspace) / ~45s (full workspaces, backend 319 + frontend 115+ tests) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace frontend` (or backend when the guard change is touched)
- **After every plan wave:** Run `npm test --workspaces`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15s per-task (targeted frontend pattern) / ~45s at wave-merge and phase-gate (full `npm test --workspaces`, the QUAL-03 closing gate)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | TREE-03 | T-17-02 / T-17-03 | `familyMembers` list rejects unauthenticated + unlinked non-admin callers; linked members and admins succeed | integration (RED) | `npm test --workspace backend -- familyMember.resolver` | ✅ (extends) | ⬜ pending |
| 17-01-02 | 01 | 1 | TREE-03 | T-17-02 / T-17-03 | Guard flipped `requireAdmin`→`requireFamilyAccess`; full backend suite green (no over-broad exposure) | integration (GREEN) | `npm test --workspace backend` | ✅ | ⬜ pending |
| 17-02-01 | 02 | 1 | TREE-01 | — | `buildForest` derives full graph client-side, one union per pair, no N+1 | unit (TDD) | `npm test --workspace frontend -- familyTree.assembly` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | TREE-01 | — | `layoutWithDagre` positions person/union nodes deterministically | unit (TDD) | `npm test --workspace frontend -- familyTree.layout` | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 1 | TREE-01 | — | SC-1 spike: spouse pairing renders paired at ~15–20 gen depth without overlap/jank (D-11 hard gate) | checkpoint:human-verify | manual (see Manual-Only Verifications) | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | TREE-01 | — | `MemberNode` (viewer ring + You label, gender tint, descent & ancestor reveal badges) / `UnionNode` render | render-smoke | `npm test --workspace frontend -- MemberNode` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 2 | TREE-01, TREE-02 | — | `FamilyTreeCanvas`: collapsed-by-default, expand/collapse toggles `hidden` in both the descendant and ancestor direction, pan/zoom + 4 D-05 nav aids | render-smoke | `npm test --workspace frontend -- FamilyTreeCanvas` | ❌ W0 | ⬜ pending |
| 17-03-03 | 03 | 2 | TREE-02 | — | Render-smoke suite passes under `mockReactFlow()` jsdom polyfill | render-smoke | `npm test --workspace frontend -- FamilyTreeCanvas` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 3 | QUAL-02 | — | `MemberDetailPanel` read-only (no edit affordances), closed renders nothing, open shows member | component | `npm test --workspace frontend -- MemberDetailPanel` | ❌ W0 | ⬜ pending |
| 17-04-02 | 04 | 3 | TREE-02, QUAL-02 | — | `FamilyTreePage` single flat fetch on mount, orchestrates canvas + detail panel | component | `npm test --workspace frontend -- FamilyTreePage` | ❌ W0 | ⬜ pending |
| 17-04-03 | 04 | 3 | TREE-04, QUAL-03 | T-17-10 / T-17-11 | `/family` gated like `/manage` (unlinked non-admin → `/pending`); full `npm test --workspaces` green, no new CI config | component (route) + CI gate | `npm test --workspaces` | ✅ (extends ProtectedRoute) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Filled from RESEARCH.md "## Validation Architecture" (TREE-01..04, QUAL-02/03) and the 17-01..17-04 PLAN.md task breakdown. "❌ W0" = file is net-new, created during the phase (Wave 0 dependency covers package install + `mockReactFlow()` polyfill). 17-03-01's `npm test --workspace frontend -- MemberNode` command targets the dedicated `MemberNode.test.jsx` file created in 17-03-PLAN.md's Task 1 — that same file also carries a `describe('UnionNode', ...)` render-smoke block, so no separate `UnionNode.test.jsx` file exists or is required for this row to be accurate. No 3-consecutive-task gap: the only non-automated task (17-02-03, human-verify) is flanked by automated tasks.*

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only 17-02-03 is human-verify, flanked by automated tasks)
- [x] Wave 0 covers all MISSING references (`npm install --workspace frontend` for `@xyflow/react`+`@dagrejs/dagre`; `mockReactFlow()` jsdom polyfill)
- [x] No watch-mode flags
- [x] Feedback latency < 45s (full suite; <15s per-task targeted runs)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized
