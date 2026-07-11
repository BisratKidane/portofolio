---
phase: 3
slug: backend-integration-tests
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-12
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (backend workspace) |
| **Config file** | `backend/vitest.config.js` (from Phase 1) |
| **Quick run command** | `npm test --workspace backend -- --run <spec>` |
| **Full suite command** | `npm test --workspace backend -- --run` |
| **Estimated runtime** | ~3 seconds (existing 25 tests + ~14 new tests, per RESEARCH.md's observed ~2s for 25 tests) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command against the changed spec file
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green, plus a manual check that `KNOWN-ISSUES.md` exists at repo root with the reset-token-exposure entry
- **Max feedback latency:** ~3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | — (infra for BE-04..07) | T-03-SC | N/A — test-only helper, no runtime attack surface | unit (helper) | `node --check backend/test/helpers.js` | ❌ W0 → created this task | ⬜ pending |
| 03-01-02 | 01 | 1 | BE-04 | T-03-01 / T-03-02 | register pins first-user-ADMIN role matrix and rejects invalid email via Sequelize isEmail | integration | `npm test --workspace backend -- --run src/resolvers/register.test.js` | ❌ W0 → created this task | ⬜ pending |
| 03-02-01 | 02 | 2 | BE-05 | T-03-03 | login issues a verifiable JWT for valid creds and rejects invalid/unknown with identical message | integration | `npm test --workspace backend -- --run src/resolvers/login.test.js` | ❌ W0 → created this task | ⬜ pending |
| 03-02-02 | 02 | 2 | BE-06 | T-03-04 | dashboard/me enforces requireAuth and ADMIN-only users population | integration | `npm test --workspace backend -- --run src/resolvers/dashboard.test.js` | ❌ W0 → created this task | ⬜ pending |
| 03-03-01 | 03 | 2 | BE-07 | T-03-05 / T-03-06 | requestPasswordReset happy path documented (generic message + DB persistence), leak NOT asserted as expected | integration | `npm test --workspace backend -- --run src/resolvers/resetPassword.test.js` | ❌ W0 → created this task | ⬜ pending |
| 03-03-02 | 03 | 2 | DOCS-01 | T-03-05 | Reset-token exposure bug tracked at repo root, backed by a test, not fixed | manual (doc review) | `test -f KNOWN-ISSUES.md && grep -c "resetToken" KNOWN-ISSUES.md` | ❌ W0 → created this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/test/helpers.js` `graphql()` extension — created by Task 03-01-01 (Wave 1), consumed by every subsequent integration spec
- [x] `backend/src/resolvers/register.test.js`, `login.test.js`, `dashboard.test.js`, `resetPassword.test.js` — created across Plans 03-01/03-02/03-03, covering BE-04 through BE-07
- [x] `KNOWN-ISSUES.md` — created by Task 03-03-02, covering DOCS-01
- Framework install: none required — Vitest, `@apollo/server`, `jsonwebtoken` are already installed dependencies (RESEARCH.md Environment Availability).

All Wave 0 gaps identified in RESEARCH.md's "Phase Requirements → Test Map" are closed by this plan set: BE-04 (03-01), BE-05 (03-02), BE-06 (03-02), BE-07 (03-03), DOCS-01 (03-03).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| `KNOWN-ISSUES.md` accurately documents the reset-token exposure (Location/Expected/Actual/Severity/Documented-by-test fields are substantively correct, not just present) | DOCS-01 | Content correctness (is the prose an accurate, well-written characterization of the bug) is not fully machine-checkable beyond string/grep presence | Read `KNOWN-ISSUES.md` at repo root; confirm it names `backend/src/resolvers/user.resolver.js:48-61`, states Expected (email-only delivery) vs. Actual (returned in API response) correctly, marks Severity: High, and points to `backend/src/resolvers/resetPassword.test.js` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (all 6 tasks across the 3 plans have automated commands)
- [x] Wave 0 covers all MISSING references (helper + 4 spec files + KNOWN-ISSUES.md, all planned)
- [x] No watch-mode flags (`vitest run` / `--run`, never bare `vitest`)
- [x] Feedback latency < 5s (observed ~2-3s for the full suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-12
