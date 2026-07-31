# Roadmap: Portfolio Auth App — Testing Foundation, Collaborative Family Tree & Ge'ez Native-Script Names

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- ✅ **v1.1 Security Remediation** — Phases 7–11 (shipped 2026-07-21)
- ✅ **v2.0 Collaborative Family Tree** — Phases 12–17 (shipped 2026-07-25)
- ✅ **v3.0 Ge'ez Native-Script Names** — Phases 18–23 (shipped 2026-07-31)

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

<details>
<summary>✅ v2.0 Collaborative Family Tree (Phases 12–17) — SHIPPED 2026-07-25</summary>

**Milestone Goal:** Add a family-tree domain where app access is gated on being an admin-linked member; members collaboratively add/edit their immediate relatives on `/manage`, and any linked member views a deep, pan/zoom tree on `/family` — built test-first (TDD) with CI staying green.

- [x] Phase 12: Family Data Model Foundation (4/4 plans) — completed 2026-07-22
- [x] Phase 13: Membership Gating & Account Linking (4/4 plans) — completed 2026-07-22
- [x] Phase 14: Relationship Resolvers, Permission Scoping & Query Safety (6/6 plans) — completed 2026-07-23
- [x] Phase 15: Sibling Dedup Guard & /manage Self-Service UI (6/6 plans) — completed 2026-07-23
- [x] Phase 16: Photo Upload (7/7 plans) — completed 2026-07-24
- [x] Phase 17: /family Deep Tree Visualization (4/4 plans) — completed 2026-07-25

Full detail archived in [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md).

_Post-milestone note: the `/family` tree edge model was later changed from the union-node "spouses-paired" rendering to a pure parent→child hierarchy (with a dashed spouse connector) at the user's request. See PROJECT.md Key Decisions._

</details>

<details>
<summary>✅ v3.0 Ge'ez Native-Script Names (Phases 18–23) — SHIPPED 2026-07-31</summary>

**Milestone Goal:** Family members can carry their name in Ge'ez script (ግዕዝ) alongside the existing Latin name, rendered with a self-hosted Ge'ez-capable webfont so it displays correctly on every device.

- [x] Phase 18: Data Model & Migration (2/2 plans) — completed 2026-07-30
- [x] Phase 19: GraphQL Layer (1/1 plan) — completed 2026-07-30
- [x] Phase 20: Self-Hosted Font & Theme (1/1 plan) — completed 2026-07-30
- [x] Phase 21: Shared Display Helper (1/1 plan) — completed 2026-07-30
- [x] Phase 22: Render Surfaces / Read Path (3/3 plans) — completed 2026-07-31
- [x] Phase 23: Write Path & Quality Gate (3/3 plans) — completed 2026-07-31

Full detail archived in [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md).

</details>

## Progress

**Execution Order (v3.0):**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23. (Phase 20 has no dependency on 18/19 and may be executed in parallel if desired.)

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
| 12. Family Data Model Foundation | v2.0 | 4/4 | Complete | 2026-07-22 |
| 13. Membership Gating & Account Linking | v2.0 | 4/4 | Complete | 2026-07-22 |
| 14. Relationship Resolvers, Permission Scoping & Query Safety | v2.0 | 6/6 | Complete | 2026-07-23 |
| 15. Sibling Dedup Guard & /manage Self-Service UI | v2.0 | 6/6 | Complete | 2026-07-23 |
| 16. Photo Upload | v2.0 | 7/7 | Complete | 2026-07-24 |
| 17. /family Deep Tree Visualization | v2.0 | 4/4 | Complete | 2026-07-25 |
| 18. Data Model & Migration | v3.0 | 2/2 | Complete    | 2026-07-30 |
| 19. GraphQL Layer | v3.0 | 1/1 | Complete   | 2026-07-30 |
| 20. Self-Hosted Font & Theme | v3.0 | 1/1 | Complete    | 2026-07-30 |
| 21. Shared Display Helper | v3.0 | 1/1 | Complete    | 2026-07-30 |
| 22. Render Surfaces (Read Path) | v3.0 | 3/3 | Complete    | 2026-07-31 |
| 23. Write Path & Quality Gate | v3.0 | 3/3 | Complete    | 2026-07-31 |
