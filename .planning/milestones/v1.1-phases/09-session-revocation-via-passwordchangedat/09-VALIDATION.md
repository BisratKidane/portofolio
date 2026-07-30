---
phase: 9
slug: session-revocation-via-passwordchangedat
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-20
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | backend/vitest.config.js (existing) |
| **Quick run command** | `npm run test --workspace backend` |
| **Full suite command** | `npm test` (root — backend + frontend workspaces) |
| **Estimated runtime** | ~15 seconds (backend) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace backend`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-xx | 01 | 1 | SESS-01 | — | `passwordChangedAt` column exists (nullable, DATE(3)); stamped only inside `changed('passwordHash')` branch; unrelated role/name update leaves it untouched | unit | `npm run test --workspace backend -- User` | ✅ | ⬜ pending |
| 9-01-xx | 01 | 1 | SESS-02 | — | `resetPassword` sets `passwordChangedAt = now()` when password actually changes | integration | `npm run test --workspace backend -- resetPassword` | ✅ | ⬜ pending |
| 9-02-xx | 02 | 2 | SESS-03 | — | Token with `iat_seconds < floor(passwordChangedAt)` → `getUserFromRequest` returns `null`; same-second re-login token stays valid; NULL `passwordChangedAt` → no revocation | unit | `npm run test --workspace backend -- auth` | ✅ | ⬜ pending |
| 9-03-xx | 03 | 2 | RESET-06 | WR-08 | `requestPasswordReset` persists `sha256(token)`; `resetPassword` looks up by hash; raw token emailed; anti-enumeration message + timing floor + single-use + 30-min expiry preserved | integration | `npm run test --workspace backend -- requestPasswordReset resetPassword` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Vitest + Apollo `executeOperation` harness (`backend/test/helpers.js`) and unit-test style (`backend/src/utils/auth.test.js`) are already in place. No new framework install.

**Note (from RESEARCH.md):** the `graphql()` helper injects `user` directly into `contextValue`, bypassing `getUserFromRequest`. SC-3 MUST be pinned by a **direct unit test of `getUserFromRequest`** (explicit `iat` override via `jwt.sign`), not the `graphql()` helper alone.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No `Unknown column` on boot against a pre-existing, non-force-synced dev DB with a provisioned `users` table | SESS-01 (SC-4) | `sequelize.sync()` never ALTERs existing tables; CI/test force-recreates every run so it cannot surface a missing column | Run the documented `ALTER TABLE users ADD COLUMN ...` against the dev DB, boot the backend against that DB (no force sync), issue an authenticated request, confirm zero `Unknown column 'passwordChangedAt'` SQL errors |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-20 (plan-checker verified Dimension 8 PASS)
