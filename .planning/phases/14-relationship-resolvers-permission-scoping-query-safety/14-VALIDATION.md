---
phase: 14
slug: relationship-resolvers-permission-scoping-query-safety
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`vitest run`), backend workspace |
| **Config file** | `backend/vitest.config.js` (globalSetup: `backend/test/globalSetup.js`) |
| **Quick run command** | `npm test --workspace backend -- <path-to-test-file>` |
| **Full suite command** | `npm test --workspace backend` |
| **Estimated runtime** | ~30-60 seconds (195 tests green at phase start) |

**Harness note (from RESEARCH.md — treat as a Wave 0 blocker):** `backend/test/helpers.js`
constructs its own `ApolloServer` and its own `contextValue`, bypassing the `context` factory in
`backend/src/server.js`. DataLoaders (D-07) and `validationRules` (D-08) wired only into
`server.js` will **not** be exercised by any test. A shared config module
(e.g. `backend/src/graphql/serverConfig.js` + `createLoaders(models)`) consumed by *both*
`server.js` and `test/helpers.js` is required before SC-5 can be validated at all.

---

## Sampling Rate

- **After every task commit:** Run the touched test file(s) — `npm test --workspace backend -- <file>`
- **After every plan wave:** Run `npm test --workspace backend` (full backend suite)
- **Before `/gsd:verify-work`:** Full suite must be green (≥195 tests, no regressions)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Populated by the planner — every task in every PLAN.md must map to a row here or declare a
Wave 0 dependency. Draft skeleton below reflects the phase success criteria; task IDs are
filled in once plans exist.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 0 | PERM-05 | — | Shared server config + `createLoaders` used by both `server.js` and `test/helpers.js` | integration | `npm test --workspace backend` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERM-05 | T-14-scope | Editable set = {self, mother, father, spouses, children, either-parent siblings}; grandparent / cousin / sibling-of-sibling excluded | unit | `npm test --workspace backend -- <scope util test>` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MEM-04, REL-04 | — | Member adds parent/spouse/child/sibling; sibling derived from shared parent, never stored as an edge | integration | `npm test --workspace backend -- <mutation test>` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERM-02 | T-14-escalate | Referencing an existing node outside the actor's editable set is rejected (D-02 invariant); existing edges cannot be rewired (D-05) | integration (adversarial) | `npm test --workspace backend -- <escalation test>` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERM-03, PERM-04 | T-14-delete | Member delete rejected; admin add/edit/remove permitted tree-wide | integration | `npm test --workspace backend -- <perm test>` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERM-01 | T-14-gate | Every family-domain resolver gated by `requireFamilyAccess`; `dashboard` brought in line (WR-04) | integration | `npm test --workspace backend -- src/resolvers/dashboard.test.js` | ✅ | ⬜ pending |
| TBD | TBD | TBD | — (SC-5) | T-14-dos | Resolved SQL query count stays flat as fixture generation depth grows | integration | `npm test --workspace backend -- <query-count test>` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | — (SC-5) | T-14-depth | Over-depth query rejected as a GraphQL **validation** error before any resolver runs | integration | `npm test --workspace backend -- <depth-limit test>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Shared GraphQL server config extracted so `backend/src/server.js` **and**
      `backend/test/helpers.js` build the schema, `validationRules`, and per-request
      DataLoaders from one source. Without this, SC-5 is untestable.
- [ ] `dataloader` dependency added to `backend/package.json` (Node 18 + ESM compatible).
- [ ] Depth-limit validation rule dependency added
      (`@escape.tech/graphql-armor-max-depth` per RESEARCH.md, or equivalent).
- [ ] Deep-tree test fixture with parameterisable generation depth.
- [ ] Query-counting helper (Sequelize `logging` hook or equivalent) usable from Vitest.

*Framework install not required — Vitest is already configured and green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | — |

*All Phase 14 behaviors are server-side and have automated verification. The phase is
backend-only; no UI surface ships here.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, never `vitest --watch`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
