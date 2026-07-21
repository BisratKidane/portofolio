# Roadmap: Portfolio Auth App — Testing Foundation

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- ✅ **v1.1 Security Remediation** — Phases 7–11 (shipped 2026-07-21)

## Phases

<details>
<summary>✅ v1.0 Full-Stack Testing Safety Net (Phases 1–6) — SHIPPED 2026-07-12</summary>

- [x] Phase 1: Backend Test Tooling & Test Database (2/2 plans) — completed 2026-07-11
- [x] Phase 2: Backend Unit Tests (2/2 plans) — completed 2026-07-11
- [x] Phase 3: Backend Integration Tests (3/3 plans) — completed 2026-07-11
- [x] Phase 4: Frontend Test Tooling (1/1 plan) — completed 2026-07-12
- [x] Phase 5: Frontend Component Tests (3/3 plans) — completed 2026-07-12
- [x] Phase 6: Root Orchestration & CI Pipeline (2/2 plans) — completed 2026-07-12

Full detail archived in [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

</details>

<details>
<summary>✅ v1.1 Security Remediation (Phases 7–11) — SHIPPED 2026-07-21</summary>

**Milestone Goal:** Remediate the security bugs deferred from v1.0 — closing the account-takeover and brute-force vectors — while keeping the CI-enforced test suite green. Every fix TDD'd red-green-refactor.

- [x] Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength (2/2 plans) — completed 2026-07-12
- [x] Phase 8: Mailer Abstraction & Reset-Token Remediation (3/3 plans) — completed 2026-07-13
- [x] Phase 9: Session Revocation via passwordChangedAt (3/3 plans) — completed 2026-07-20
- [x] Phase 10: Rate Limiting on Auth Mutations (3/3 plans) — completed 2026-07-20
- [x] Phase 11: Email Verification & ADMIN Race Fix (8/8 plans, incl. gap-closure 11-08) — completed 2026-07-21

Full detail archived in [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md).

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Backend Test Tooling & Test Database | v1.0 | 2/2 | Complete | 2026-07-11 |
| 2. Backend Unit Tests | v1.0 | 2/2 | Complete | 2026-07-11 |
| 3. Backend Integration Tests | v1.0 | 3/3 | Complete | 2026-07-11 |
| 4. Frontend Test Tooling | v1.0 | 1/1 | Complete | 2026-07-12 |
| 5. Frontend Component Tests | v1.0 | 3/3 | Complete | 2026-07-12 |
| 6. Root Orchestration & CI Pipeline | v1.0 | 2/2 | Complete | 2026-07-12 |
| 7. Foundation Hardening — CORS, JWT Fail-Fast & Password Strength | v1.1 | 2/2 | Complete | 2026-07-12 |
| 8. Mailer Abstraction & Reset-Token Remediation | v1.1 | 3/3 | Complete | 2026-07-13 |
| 9. Session Revocation via passwordChangedAt | v1.1 | 3/3 | Complete | 2026-07-20 |
| 10. Rate Limiting on Auth Mutations | v1.1 | 3/3 | Complete | 2026-07-20 |
| 11. Email Verification & ADMIN Race Fix | v1.1 | 8/8 | Complete | 2026-07-21 |
