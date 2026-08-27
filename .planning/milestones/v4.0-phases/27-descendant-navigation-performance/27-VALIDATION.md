---
phase: 27
slug: descendant-navigation-performance
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-03
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.10 + @testing-library/react ^16.3.2 + jsdom (frontend/vitest.config.js, frontend/test/setup.js — already configured) |
| **Config file** | frontend/vitest.config.js (existing — already configured) |
| **Quick run command** | `npm test --workspace frontend -- <file>` (e.g. `npm test --workspace frontend -- descendantNav.reducer`) |
| **Full suite command** | `npm test --workspace frontend -- --run` |
| **Estimated runtime** | ~20 seconds full suite (jsdom + RTL, no containers/network — all `graphqlRequest` calls mocked) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace frontend -- <file>` for the file(s) touched
- **After every plan wave:** Run `npm test --workspace frontend -- --run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds (matches estimated full-suite runtime — no test in this phase touches network/DB, all mocked)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | NAV-02, NAV-03, NAV-04 | T-27-01 | RED: failing test suite specifies `navReducer`'s full contract — RESET, EXPAND_TOP (expand/collapse/walk-back-up), EXPAND_CHILD (expand/collapse/sibling-swap), EXPAND_GRANDCHILD (shift+push), NAV-03 structural invariant (D-01..D-04) | unit | `npm test --workspace frontend -- descendantNav.reducer` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | NAV-02, NAV-03, NAV-04 | T-27-01 | GREEN: `navReducer` + `initial` implement one-branch-only auto-collapse (D-01), ordinary collapse (D-02), forward-shift push (D-03), exact push/pop undo (D-04), zero framework imports | unit | `npm test --workspace frontend -- descendantNav.reducer` | ✅ | ⬜ pending |
| 27-02-01 | 02 | 1 | NAV-01 | T-27-02 | RED: failing test suite specifies `GenerationGrid`'s contract — card count, single group-level apex (D-06), size-prop grid cells (D-05), spouse passthrough (D-07), onExpand/onEdit forwarding, loadingId passthrough | component | `npm test --workspace frontend -- GenerationGrid` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 1 | NAV-01 | T-27-02 | GREEN: `GenerationGrid` + `ApexCue` render a responsive grid (MUI `size={{ xs:12, sm:6, md:4 }}`), exactly one apex per generation container, unmodified `PersonCard` passthrough | component | `npm test --workspace frontend -- GenerationGrid` | ✅ | ⬜ pending |
| 27-03-01 | 03 | 2 | PERF-01, PERF-03 | T-27-03 / T-27-04 | RED: failing `renderHook` suite specifies cache-miss-fetches, cache-hit-skips-fetch, RESET-preserves-cache, forward-shift resolves promoted parent from cache with zero extra fetch (D-08/D-09) | unit (renderHook) | `npm test --workspace frontend -- useDescendantNav` | ❌ W0 | ⬜ pending |
| 27-03-02 | 03 | 2 | PERF-01, PERF-03 | T-27-03 / T-27-04 | GREEN: `useDescendantNav` implements `useRef(Map)` session cache (never `useState`) + expand-only `EXPAND_CHILDREN_QUERY` orchestration built on Plan 27-01's `navReducer`, unchanged | unit (renderHook) | `npm test --workspace frontend -- useDescendantNav` | ✅ | ⬜ pending |
| 27-04-01 | 04 | 3 | NAV-01, NAV-02, NAV-03, NAV-04, PERF-01, PERF-03 | T-27-05 / T-27-06 | Wire `useDescendantNav` + `GenerationGrid` into `DetailPage`'s live head-card handler; the pre-existing no-op-click test is updated IN THIS SAME TASK so the full `DetailPage` suite stays green (no unexplained red from the now-live handler firing a 3rd unmocked `graphqlRequest`) | integration | `npm test --workspace frontend -- DetailPage` | ✅ (extended) | ⬜ pending |
| 27-04-02 | 04 | 3 | NAV-01, NAV-02, NAV-03, NAV-04, PERF-01, PERF-03 | T-27-05 / T-27-06 | Extend `DetailPage.test.jsx` with full end-to-end assertions for NAV-01..04, PERF-01, PERF-03, and D-01 (sibling auto-collapse) through the real rendered component tree, including a `<Profiler>`-based exact render-commit-count assertion for the cache-hit re-expand | integration | `npm test --workspace frontend -- DetailPage` | ✅ (extended) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/hooks/descendantNav.reducer.test.js` — RED-first unit stubs for NAV-02/NAV-03/NAV-04 (D-01..D-04), created in Plan 27-01 Task 1
- [ ] `frontend/src/components/person/GenerationGrid.test.jsx` — RED-first component stubs for NAV-01 (D-05/D-06/D-07), created in Plan 27-02 Task 1
- [ ] `frontend/src/hooks/useDescendantNav.test.js` — RED-first `renderHook` stubs for PERF-01/PERF-03 (D-08/D-09), created in Plan 27-03 Task 1

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (estimated ~20s full suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-03
</content>
</invoke>
