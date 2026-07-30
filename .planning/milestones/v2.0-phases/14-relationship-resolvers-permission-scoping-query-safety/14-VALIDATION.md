---
phase: 14
slug: relationship-resolvers-permission-scoping-query-safety
status: approved
nyquist_compliant: true
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

*Synced to the 6 plans (14-01 … 14-06) after plan verification. Every task is TDD RED-first
(D-09) and carries a targeted automated verify command. All test files are created by their
own task, so "File Exists" is ❌ W0 until that task runs.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | PERM-05 | T-14-depth | Over-depth query rejected as a GraphQL **validation** error before any resolver runs; shared `serverConfig.js` consumed by both `server.js` and `test/helpers.js` | integration | `npm test --workspace backend -- src/graphql/queryDepth.test.js` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | PERM-05 | T-14-leak | Loaders constructed per-request inside `createLoaders()` only; no cache leak across instances | unit | `npm test --workspace backend -- src/loaders/familyMember.loaders.test.js` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | PERM-05, REL-04 | T-14-scope | Editable set = {self, mother, father, spouses, children, either-parent siblings}; grandparent / cousin / sibling-of-sibling excluded | unit | `npm test --workspace backend -- src/services/familyMember.scope.test.js` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | PERM-01 | T-14-gate | `dashboard` resolver gated by `requireFamilyAccess`, not `requireAuth` (WR-04) | integration | `npm test --workspace backend -- src/resolvers/dashboard.test.js` | ✅ | ⬜ pending |
| 14-03-01 | 03 | 2 | REL-04, PERM-05 | T-14-dos | Recursive fields resolve via loaders; siblings derived from shared parent, never stored as an edge | integration | `npm test --workspace backend -- src/resolvers/familyMember.relationships.test.js` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 2 | — (SC-5) | T-14-dos | Resolved SQL query count stays flat as fixture generation depth grows | integration | `npm test --workspace backend -- src/services/familyMember.queryCount.test.js` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 3 | PERM-01, PERM-02, PERM-04 | T-14-escalate | `addParent` creates a new node for members; existing-node references rejected unless already in scope (D-01/D-02) | integration | `npm test --workspace backend -- src/resolvers/familyMember.addParent.test.js` | ❌ W0 | ⬜ pending |
| 14-04-02 | 04 | 3 | PERM-01, PERM-02, PERM-04 | T-14-escalate | `addSpouse` same invariant; canonical spouse-row ordering preserved (P12 D-01) | integration | `npm test --workspace backend -- src/resolvers/familyMember.addSpouse.test.js` | ❌ W0 | ⬜ pending |
| 14-05-01 | 05 | 4 | PERM-01, PERM-02, PERM-04 | T-14-escalate | **SC-4 adversarial core:** `otherParentId` pointing at a stranger's linked member or the actor's grandparent is rejected before the transaction opens | integration (adversarial) | `npm test --workspace backend -- src/resolvers/familyMember.addChild.test.js` | ❌ W0 | ⬜ pending |
| 14-05-02 | 05 | 4 | REL-04, PERM-01 | T-14-escalate | `addSibling` creates a member sharing an existing parent; rejected with guidance when no parent recorded (D-04) | integration | `npm test --workspace backend -- src/resolvers/familyMember.addSibling.test.js` | ❌ W0 | ⬜ pending |
| 14-06-01 | 06 | 5 | MEM-04, PERM-02 | T-14-fieldlock | Fields editable on in-scope relatives; record field-locked when target has a linked user (D-06); existing edges not rewirable (D-05) | integration | `npm test --workspace backend -- src/resolvers/familyMember.editMember.test.js` | ❌ W0 | ⬜ pending |
| 14-06-02 | 06 | 5 | PERM-03, PERM-04 | T-14-delete | Member delete rejected; admin delete permitted tree-wide | integration | `npm test --workspace backend -- src/resolvers/familyMember.deleteMember.test.js` | ❌ W0 | ⬜ pending |
| 14-06-03 | 06 | 5 | PERM-05 | T-14-scope | `myEditableMembers` returns exactly the server-computed scope; no client-supplied scope trusted | integration | `npm test --workspace backend -- src/resolvers/familyMember.myEditableMembers.test.js` | ❌ W0 | ⬜ pending |

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 13/13 tasks mapped
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — no `<automated>MISSING</automated>` in any plan
- [x] No watch-mode flags (`vitest run`, never `vitest --watch`)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-22 (gsd-plan-checker: VERIFICATION PASSED, no blockers)
