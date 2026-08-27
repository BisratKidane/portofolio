---
phase: 24
slug: backend-read-layer-for-detail
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (backend workspace) |
| **Config file** | none — Vitest runs on defaults; `backend/test/globalSetup.js` + `backend/test/helpers.js` provide the DB + Apollo `executeOperation` harness |
| **Quick run command** | `npm test --workspace backend -- <file>` (e.g. the touched `*.test.js`) |
| **Full suite command** | `npm test --workspace backend` (`vitest run`) |
| **Estimated runtime** | ~15–40 seconds (integration tests hit an isolated test DB) |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace backend -- <touched test file>`
- **After every plan wave:** Run `npm test --workspace backend`
- **Before `/gsd:verify-work`:** Full backend suite must be green
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Success Criterion | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| SC-1 `familyHead` returns tree top ancestor (id 1 → largest apex subtree → first → null), **bounded** SQL (no full-tree load) | API-01 | — | Query resolves without loading whole tree | integration | `npm test --workspace backend -- familyHead` | ❌ W0 | ⬜ pending |
| SC-2 `familyMember(id)` returns all card fields (Latin+Ge'ez name, gender, birth/death, photo) | API-01 | — | Field coverage assertion (reuse existing query) | integration | `npm test --workspace backend -- familyMember` | ✅ (query exists — verify coverage) | ⬜ pending |
| SC-3 `searchFamilyMembers` partial case-insensitive Latin + Ge'ez match, capped ~20, name-sorted | API-01 | — | Only `firstname/lastname/geezFirstname/geezLastname` matched; mother fields excluded | integration | `npm test --workspace backend -- searchFamilyMembers` | ❌ W0 | ⬜ pending |
| SC-4 direct-children (nested `children`/`spouses`) resolves in **bounded/flat SQL count regardless of child count** — no N+1 | PERF-02 | — | `countQueries()` statement count constant as fixture children grow | integration (query-count) | `npm test --workspace backend -- queryCount` | ✅ pattern exists (`familyMember.queryCount.test.js`) | ⬜ pending |
| SC-5 `canEdit: Boolean!` field reflects existing admin check (`user.role === 'ADMIN'`) | API-01 | T-24-01 (authz) | `canEdit` = false for non-admin/anon, true for admin; no scope leak | integration | `npm test --workspace backend -- canEdit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/**/familyHead*.test.js` — SC-1 bounded head query (id-1 fast path, apex+subtree fallback, empty→null)
- [ ] `backend/src/**/searchFamilyMembers*.test.js` — SC-3 Latin+Ge'ez partial/case-insensitive, cap, sort, mother-field exclusion
- [ ] `backend/src/**/*canEdit*.test.js` — SC-5 admin/non-admin/anonymous `canEdit` matrix
- [ ] SC-4 N+1 test — copy the `countQueries()` recipe from `backend/src/services/familyMember.queryCount.test.js`; assert bounded statement count as direct-children fixture grows
- [ ] Reuse existing `backend/test/helpers.js` (`executeOperation`/`graphql`) + `familyTreeFactory.js` fixtures — no new framework install

*Vitest is already installed and configured; existing DB + Apollo harness covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ge'ez Unicode substring match under live MySQL 8.4 collation (CI environment) | API-01 | Local dev DB is MariaDB 12.1.2; CI/prod is `mysql:8.4` (collation `utf8mb4_general_ci` on both) | CI run of the backend suite is authoritative; a green `searchFamilyMembers` Ge'ez test in GitHub Actions confirms collation behavior on the real target |

*All other phase behaviors have automated verification via integration tests.*

---

## Validation Sign-Off

- [ ] All success criteria have integration verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (SC-1, SC-3, SC-4, SC-5 tests)
- [ ] No watch-mode flags (`vitest run`, not `vitest`)
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter (set after plan-checker verifies coverage)

**Approval:** pending
