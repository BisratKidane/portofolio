---
phase: 1
slug: backend-test-tooling-test-database
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.10 (Node 24, ESM) |
| **Config file** | `backend/vitest.config.js` (created in Wave 0) |
| **Quick run command** | `npm test --workspace backend` |
| **Full suite command** | `npm test --workspace backend` |
| **Estimated runtime** | ~5–15 seconds (2 proof specs + DB provision/teardown) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace backend`
- **After every plan wave:** Run `npm test --workspace backend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01-01 | 1 | SETUP-01 | — | N/A | config | `npm test --workspace backend` (via Task 3) | ❌ W0 | ⬜ pending |
| 1-01-02 | 01-01 | 1 | SETUP-01 | T-1-03 | Config isolation: ENV_FILE/NODE_ENV set before defineConfig | config | `npm test --workspace backend` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01-01 | 1 | SETUP-01 | — | N/A | smoke | `npm test --workspace backend` | ❌ W0 | ⬜ pending |
| 1-02-01 | 01-02 | 2 | SETUP-04 | T-1-01 | Guard throws unless NODE_ENV=test AND DB_NAME ends `_test` | unit | `cd backend && npx vitest run test/guard.test.js` | ❌ W0 | ⬜ pending |
| 1-02-02 | 01-02 | 2 | SETUP-04 | T-1-01 | globalSetup: guard → sync({force,match:/_test$/}) → drop+close | integration | `npm test --workspace backend` | ❌ W0 | ⬜ pending |
| 1-02-03 | 01-02 | 2 | SETUP-04 | T-1-02 | Connectivity spec asserts resolved DB name ends `_test` (A1 mitigation) | integration | `npm test --workspace backend` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finalized against `01-01-PLAN.md` / `01-02-PLAN.md`. `❌ W0` = infrastructure created within this phase (Wave 0/Wave 1), not pre-existing.*

---

## Wave 0 Requirements

- [ ] `backend/vitest.config.js` — runner config (globalSetup registration, single-fork pool, ENV_FILE/NODE_ENV)
- [ ] `backend/test/` — shared harness (globalSetup: guard → sync force → teardown; importable helpers)
- [ ] `env/test.env` — dedicated test DB config (`DB_NAME=portofolio_test`)
- [ ] `vitest@^4.1.10` — devDependency install in backend workspace

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `portofolio_test` provisioned on a fresh Docker volume via init script | SETUP-04 | Docker init scripts only run on an empty data volume — not reproducible inside the Vitest process | `docker compose down -v && docker compose up -d mysql`, then confirm `portofolio_test` exists and the app user has access |

*All in-process behaviors (runner works, guard fires, DB connects, tables reset/torn down) have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-11 (confirmed by gsd-plan-checker against both PLAN.md `<verify><automated>` blocks)
