---
phase: 14-relationship-resolvers-permission-scoping-query-safety
verified: 2026-07-23T06:50:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 14: Relationship Resolvers, Permission Scoping & Query Safety Verification Report

**Phase Goal:** Members can add and edit only their immediate relatives — parents, spouse, children, and derived siblings — with the editable scope computed and enforced entirely server-side, resistant to relationship-edit privilege escalation, and safe against N+1 fan-out and unbounded query depth on the now-recursive schema.
**Verified:** 2026-07-23
**Status:** passed
**Re-verification:** No — initial verification

## Context

A code review (`14-REVIEW.md`) ran earlier this session and found 4 CRITICAL + 12 WARNING findings. All 4 CRITICALs were reportedly fixed test-first. This verification independently re-derived the phase's 5 roadmap Success Criteria, read every relevant source file (not just the SUMMARYs), and re-ran both test suites from a clean shell to confirm the SUMMARY/REVIEW claims hold in the actual codebase.

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A member-user can add and edit parents/spouse/children/derived siblings; editing outside that scope is rejected | ✓ VERIFIED | `addParent`/`addSpouse`/`addChild`/`addSibling`/`editMember` in `backend/src/resolvers/familyMember.resolver.js:44-225` all call `computeEditableScope` and reject with `'This member is outside your editable scope.'` for non-admins. Tested in `familyMember.addParent.test.js`, `familyMember.addSpouse.test.js`, `familyMember.addChild.test.js`, `familyMember.addSibling.test.js`, `familyMember.editMember.test.js`. Siblings are derived (never a stored edge) via the `siblings` field resolver reusing `loaders.childrenByParentId` (`familyMember.resolver.js:256-273`), proven in `familyMember.relationships.test.js`. |
| 2 | A member-user cannot remove any member; an admin can add/edit/remove any member across the tree | ✓ VERIFIED | `deleteMember` resolver (`familyMember.resolver.js:233-242`) calls `requireAdmin(user)` as its **only** guard, with zero `computeEditableScope` calls in the function body (grep-verified). `familyMember.deleteMember.test.js` proves rejection for a linked USER (including self-delete) and success for ADMIN across mid-tree deletes. |
| 3 | The editable-relative set is computed by a single, reused server-side utility, tested against exclusions (grandparent, cousin, sibling-of-sibling) and inclusions | ✓ VERIFIED | `computeEditableScope` (`backend/src/services/familyMember.service.js:108-160`) is the only scope-computation function in the codebase; every mutation resolver imports and calls it — no resolver re-derives scope inline (grep-verified: `computeEditableScope` appears only via this one import). `familyMember.scope.test.js` has 11 cases: self, mother/father, spouse-either-side, children, full-sibling, half-sibling, empty-parents-no-throw, **and the 3 named SC-3 exclusions** (grandparent, cousin, sibling-of-sibling) — all pass. |
| 4 | A member cannot fabricate a relationship edge to an already-linked unrelated member's subtree to expand scope, proven by an adversarial test | ✓ VERIFIED | `addChild`'s `otherParentId` is checked against `scope.ids` before the transaction opens (`familyMember.resolver.js:120-126`), with adversarial tests for a stranger's linked member and a grandparent (`familyMember.addChild.test.js`). **CR-02 fix confirmed in code**: `addSibling` (previously bypassed this control by copying `target.motherId`/`target.fatherId` without a scope check) now hoists `scope` and validates `inherited` parent ids against `scope.ids` (`familyMember.resolver.js:157-185`), with dedicated regression tests `'rejects (CR-02) inheriting a co-parent FK...'` and `"rejects (CR-02) inheriting a spouse's parent FKs..."` in `familyMember.addSibling.test.js:110-158`, both passing. |
| 5 | A deep-tree fixture's resolved SQL query count stays flat as depth grows, and an over-depth query is rejected by a depth-limit rule | ✓ VERIFIED | `familyMember.queryCount.test.js`: an 8-generation/255-node fixture resolved via nested `children` fields costs `< 20` SQL queries (bounded by depth via `createLoaders`' DataLoader batching, not by the 255-node fixture size). A real recursive-field query exceeding `env.maxQueryDepth` is rejected with `GRAPHQL_VALIDATION_FAILED`. **CR-03/CR-04 fix confirmed in code**: `env.maxQueryDepth` is parsed via `requiredPositiveInt(process.env.MAX_QUERY_DEPTH, 12, 'MAX_QUERY_DEPTH')` (`backend/src/config/env.js:32`, `backend/src/config/requiredPositiveInt.js`), which throws at startup on a non-positive-integer value instead of silently disabling the rule (previously `Number(x || 100)` failed open on `NaN`/`0`). `MAX_QUERY_DEPTH=12` is now set explicitly in all four `env/*.env` files (`local.env`, `local.container.env`, `remote.env`, `test.env`) — confirmed by `grep`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/graphql/serverConfig.js` | Shared `{typeDefs, resolvers, validationRules}` | ✓ VERIFIED | Exports all three; `validationRules` includes `maxDepthRule({ n: env.maxQueryDepth, ignoreIntrospection: false, propagateOnRejection: false, onReject })`. |
| `backend/src/loaders/familyMember.loaders.js` | `createLoaders(models)` factory | ✓ VERIFIED | 3 `DataLoader`s (`memberById`, `childrenByParentId`, `spousesByMemberId`), all `cacheKeyFn: String`, constructed fresh inside the factory function only. |
| `backend/src/services/familyMember.service.js` | `computeEditableScope`, extended `linkParent`/`setSpouse`/`addChild` with optional `transaction` | ✓ VERIFIED | All present; sibling query correctly skips (not defaults-to-null-clause) when `parentIds.length === 0`. |
| `backend/src/schemas/familyMember.schema.js` | Full recursive field set + mutation SDL | ✓ VERIFIED | `mother`/`father`/`spouses`/`children`/`siblings`/`linkedUser`, `ParentRole` enum (declared once), `EditFamilyMemberInput` (no edge fields — D-05 structural guarantee), `addParent`/`addSpouse`/`addChild`/`addSibling`/`editMember`/`deleteMember` mutations, `myEditableMembers` query. |
| `backend/src/resolvers/familyMember.resolver.js` | All 6 mutations + 3 queries + field resolvers | ✓ VERIFIED | All present and wired to `computeEditableScope`/loaders per plan. |
| `backend/test/familyTreeFactory.js` | `buildGenerationFixture({depth, childrenPerNode})` | ✓ VERIFIED | Used by `familyMember.queryCount.test.js` to build the 255-node fixture. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `backend/src/server.js` | `graphql/serverConfig.js` | `import { typeDefs, resolvers, validationRules }` | ✓ WIRED | Line 8; passed into `new ApolloServer(...)` line 25. |
| `backend/test/helpers.js` | `graphql/serverConfig.js` | same import | ✓ WIRED | Line 4; passed into its own `ApolloServer` construction — production/test parity confirmed. |
| `backend/src/server.js` / `test/helpers.js` | `loaders/familyMember.loaders.js` | `createLoaders(models)` per-request/per-call | ✓ WIRED | `server.js:38` (context factory), `test/helpers.js:23` (fresh call inside `graphql()`, not hoisted). |
| `familyMember.resolver.js` (siblings) | `familyMember.loaders.js` | reuses `childrenByParentId`, no new loader | ✓ WIRED | Confirmed no `siblingsBy*` loader exists; `siblings` resolver calls `loaders.childrenByParentId.load` twice (once per parent id) and de-dupes. |
| `familyMember.resolver.js` (all mutations) | `familyMember.service.js` (`computeEditableScope`) | scope check before write | ✓ WIRED | Every non-admin mutation path calls `computeEditableScope` before its transaction opens. |
| `backend/src/resolvers/index.js` / `schemas/index.js` | `familyMember.resolver.js` / `familyMember.schema.js` | barrel aggregation | ✓ WIRED | Both barrels import and merge the family-member modules into the arrays Apollo consumes. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green | `npm test --workspace backend` | 42 files, 270/270 tests passed | ✓ PASS |
| Full frontend suite green | `npm test --workspace frontend` | 9 files, 34/34 tests passed | ✓ PASS |
| CR-01 fix (linkedUser gated) present | grep resolver body | `user?.role === 'ADMIN' \|\| linked.id === user?.id` guard confirmed at `familyMember.resolver.js:289` | ✓ PASS |
| CR-02 fix (addSibling scope-checks inherited parents) present | grep resolver body | `inherited.every((id) => scope.ids.has(id))` confirmed at `familyMember.resolver.js:182` | ✓ PASS |
| CR-03/CR-04 fix (fail-fast depth config) present | read `env.js`/`requiredPositiveInt.js`/`env/*.env` | `requiredPositiveInt(...)` throws on invalid input; `MAX_QUERY_DEPTH=12` set in all 4 env files | ✓ PASS |
| Git history matches REVIEW.md's claimed fix commits | `git log --oneline` | `9e3f3b5`/`15af328` (CR-01 RED/GREEN), `f79a3a9`/`318476c` (CR-02 RED/GREEN), `28123c6`/`c3edeb3` (CR-03/CR-04 RED/GREEN) all present, TDD-ordered | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PERM-05 | 14-01, 14-02 | Backend computes editable scope, enforces server-side | ✓ SATISFIED | `computeEditableScope` + universal resolver adoption |
| REL-04 | 14-02, 14-03, 14-05 | Siblings derived from shared parents, never stored | ✓ SATISFIED | `siblings` field resolver + `addSibling` inherits parent FKs, never fabricates |
| PERM-01 | 14-04, 14-05 | Member-user can add immediate relatives | ✓ SATISFIED | `addParent`/`addSpouse`/`addChild`/`addSibling` |
| PERM-02 | 14-04—14-06 | Member-user can edit fields/relationships within scope | ✓ SATISFIED | `editMember` (fields) + add-mutations (relationships, add-only per D-05) |
| PERM-03 | 14-06 | Member-user cannot remove any member | ✓ SATISFIED | `deleteMember` is `requireAdmin`-only, structurally |
| PERM-04 | 14-06 | Admin can add/edit/remove any member | ✓ SATISFIED | Admin bypass confirmed in every mutation's tests |
| MEM-04 | 14-06 | User can edit fields of an in-scope member | ✓ SATISFIED | `editMember` scope + D-06 field-lock, tested |

**Note (documentation staleness, non-blocking):** `.planning/REQUIREMENTS.md`'s checkbox/traceability table still marks `MEM-04`, `PERM-01`, `PERM-02`, `PERM-03`, `PERM-04` as `Pending` even though the code satisfies all of them (only `REL-04`/`PERM-05` are marked `Complete`). This is a doc-sync gap in `REQUIREMENTS.md`, not a code gap — recommend updating the traceability table's status column as a follow-up, but it does not block this phase's goal.

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`), no stub returns, no placeholder implementations were found in any file this phase modified.

The code review's **12 WARNING-level findings remain open** (confirmed by direct source inspection — none were silently fixed). These are hardening follow-ups, not violations of the 5 roadmap Success Criteria verified above:

| ID | File | Severity | Impact |
|----|------|----------|--------|
| WR-01 | `familyMember.service.js:108`, all mutation resolvers | ⚠️ WARNING | `computeEditableScope`'s `{transaction}` option is accepted but never passed by any caller — permission checks run on a different DB connection/snapshot than the write they authorize (TOCTOU). Narrow blast radius: requires a concurrent admin write racing a member's mutation. |
| WR-02 | `familyMember.resolver.js:202-225` (`editMember`) | ⚠️ WARNING | No transaction wraps the scope-check/D-06 field-lock-read/update sequence; the field-lock decision can be stale by the time the update executes. |
| WR-03 | `familyMember.resolver.js:106-146` (`addChild`) | ⚠️ WARNING | `otherParentId === memberId` is not rejected — a member can be recorded as both mother and father of the same child, corrupting sibling derivation. Confirmed still absent (`otherId === targetId` check not present in code). |
| WR-05 | `familyMember.service.js:6-31` (`wouldCreateCycle`) | ⚠️ WARNING | Fails open (`return false` = "no cycle") if its 100-iteration budget is exhausted; also re-visits frontier nodes. Effectively unreachable this phase (`linkParent` is only ever called with a freshly-created parent, which can never be an ancestor). |
| WR-04, WR-06 through WR-12 | various | ⚠️ WARNING | Remaining warnings (ID coercion edge cases, PII read-scope policy undocumented, service-layer `models` singleton binding, `deleteMember` existence-check race, cross-resolver-module import coupling, test-harness cleanup) — see `14-REVIEW.md` for full detail. None affect the phase's 5 stated Success Criteria. |

**This looks like intentional scope-boundary triage**, not an oversight — the REVIEW.md's own resolution table explicitly separates 4 fixed CRITICALs from 12 deferred WARNINGs and recommends `/gsd:plan-phase 14 --gaps` for the highest-value remainder (WR-01, WR-02, WR-05 explicitly called out). No override is being applied here since none of these warnings caused a must-have truth to fail — they are surfaced for a human gap-closure decision, not silently accepted.

### Human Verification Required

None. This phase is backend-only (GraphQL resolvers/services/schema); all 5 success criteria are mechanically verifiable and were verified via direct source inspection plus a from-scratch run of both test suites (270/270 backend, 34/34 frontend, both green).

### Gaps Summary

No gaps found against the phase's 5 roadmap Success Criteria. All 4 CRITICAL findings from the code review (CR-01 linkedUser leak, CR-02 addSibling SC-4 bypass, CR-03 inert depth limit, CR-04 fail-open depth parsing) were independently confirmed fixed in the actual source code (not just claimed in SUMMARY/REVIEW), with matching TDD-ordered commit history and passing regression tests. Both test suites are green.

12 WARNING-level findings remain open in the codebase (WR-01 through WR-12, per `14-REVIEW.md`). None of them causes any of the 5 must-have truths above to fail, so they do not block this phase's goal achievement. They are flagged here for a human decision on whether to open a gap-closure plan (the review's own recommendation) or explicitly defer them to a later phase/hardening pass — particularly WR-01 (scope-check TOCTOU), WR-02 (`editMember` no-transaction race), WR-03 (`addChild` self-as-both-parents), and WR-05 (fail-open cycle-check budget), which are the four the reviewer flagged as highest-value.

---

_Verified: 2026-07-23_
_Verifier: Claude (gsd-verifier)_
