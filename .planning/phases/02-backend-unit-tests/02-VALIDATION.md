---
phase: 02
slug: backend-unit-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 |
| **Config file** | `backend/vitest.config.js` (sets `ENV_FILE`→`env/test.env`, `NODE_ENV=test`, `pool: 'forks'`, `fileParallelism: false`, `globalSetup: ['./test/globalSetup.js']`) |
| **Quick run command** | `npx vitest run src/utils/auth.test.js src/models/User.test.js` (run from `backend/`) |
| **Full suite command** | `npm test --workspace backend` |
| **Estimated runtime** | ~5 seconds (pure unit; `globalSetup` still provisions the test DB per Pitfall 2) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <the specific new spec file>` (from `backend/`)
- **After every plan wave:** Run `npm test --workspace backend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-* | 01 | 1 | BE-01 | — | Signed token verifies; expired/tampered tokens rejected (silent `null`) | unit | `npx vitest run src/utils/auth.test.js` | ❌ W0 | ⬜ pending |
| 02-01-* | 01 | 1 | BE-03 | — | ADMIN passes guards; USER/null throw | unit | `npx vitest run src/utils/auth.test.js -t require` | ❌ W0 | ⬜ pending |
| 02-01-* | 01 | 1 | D-07 | — | `createResetToken` 64-hex + unique; `resetTokenExpiry` future Date | unit | `npx vitest run src/utils/auth.test.js -t reset` | ❌ W0 | ⬜ pending |
| 02-02-* | 02 | 1 | BE-02 | — | `validatePassword` accepts correct/rejects incorrect; `beforeCreate` hashes (never plaintext) | unit | `npx vitest run src/models/User.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/utils/auth.test.js` — covers BE-01, BE-03, D-07 (this phase's own deliverable)
- [ ] `backend/src/models/User.test.js` — covers BE-02 (this phase's own deliverable)
- Framework install: none — Vitest, jsonwebtoken, bcryptjs, sequelize already installed and proven (Phase 1).

*No shared fixtures or additional framework config needed; `backend/test/helpers.js` / `globalSetup.js` remain available but are not required by any Phase 2 spec per the D-05 resolution (`User.runHooks('beforeCreate', builtInstance)` runs the real hook without a DB).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
