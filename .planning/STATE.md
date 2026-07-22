---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Collaborative Family Tree
status: executing
stopped_at: Phase 14 context gathered
last_updated: "2026-07-22T17:55:55.067Z"
last_activity: 2026-07-22 -- Phase 14 planning complete
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 14
  completed_plans: 8
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-21)

**Core value:** Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.
**Current focus:** Phase 13 — membership-gating-account-linking

## Current Position

Phase: 13 — COMPLETE
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-07-22 -- Phase 14 planning complete

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 28 (v1.0: 13, v1.1: 19) — none yet in v2.0
- Average duration: - min
- Total execution time: 0 hours (v2.0)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01–06 (v1.0) | 13 | - | - |
| 07–11 (v1.1) | 19 | - | - |
| 12–17 (v2.0) | TBD | - | - |
| 12 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: - (v1.1 closed 2026-07-21; v2.0 not yet started)
- Trend: -

*Updated after each plan completion*
| Phase 13 P01 | 15min | 2 tasks | 6 files |
| Phase 13 P02 | 10min | 2 tasks | 8 files |
| Phase 13 P03 | 12min | 2 tasks | 7 files |
| Phase 13 P04 | 12min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- v2.0 roadmap: Phase order is data-model-first (12) → membership gating (13) → permission-scoping/relationship-resolvers (14) → dedup+/manage UI (15) → photo upload (16) → /family tree (17), per research's dependency-ordered build order (schema/cycle/cascade decisions are expensive to retrofit; gating must land before scoped edits; permission-scoping and relationship mutations are mutually dependent; tree view consumes everything prior).
- v2.0 roadmap: Phase 13 (membership gating) explicitly carries the manual `ALTER TABLE users ADD COLUMN familyMemberId` + boot-verify step and the first-admin carve-out, mirroring the v1.1 Phase 9/11 manual-migration pattern — `sequelize.sync()` will not add a column to the existing `users` table.
- v2.0 roadmap: Phase 14 (permission-scoping + relationship resolvers) is a dedicated phase with mandatory adversarial tests (privilege-escalation via relationship edits, exclusion fixtures for grandparent/cousin/sibling-of-sibling) — not folded into a feature phase as an afterthought, per PITFALLS.md Pitfalls 7–8.
- v2.0 roadmap: Photo upload (Phase 16) is sequenced as architecturally independent of Phases 14/15 and may run in parallel once Phase 12 lands, per ARCHITECTURE.md's build order.
- v2.0 roadmap: Phase 17 (/family) opens with a spike validating the React Flow (`@xyflow/react` + `dagre`) synthetic-union-node spouse-pairing pattern against a realistic-depth fixture before the full page is built — the library choice is a confirm-not-settled decision per STACK.md/SUMMARY.md.
- v2.0 roadmap: QUAL-01/02/03 (cross-cutting TDD/CI constraints) are baked into every phase's success criteria rather than isolated as a standalone phase, per milestone instructions; for traceability purposes QUAL-01 is anchored to Phase 16 (last new backend surface) and QUAL-02/03 to Phase 17 (milestone-closing frontend + CI validation).
- v2.0 roadmap note: REQUIREMENTS.md's stated "34 total" header undercounts by one — the actual v1 requirements list contains 35 IDs (MEM×5, REL×6, ACC×5, PERM×5, PHOTO×3, MNG×4, TREE×4, QUAL×3). All 35 are mapped 1:1 to phases 12–17 with 100% coverage; the header count was corrected to 35 during roadmap creation.
- [Phase 13]: requireFamilyAccess = linked-member OR ADMIN (D-06 carve-out), delegating to requireAuth for the null check
- [Phase 13]: familyMemberId declared only via the User.belongsTo(FamilyMember) association, not redeclared in User.init() (association-owns-the-column convention, mirrors Spouse.js)
- [Phase 13]: FamilyMember.hasOne(User) used instead of hasMany, reflecting the UNIQUE-constrained one-to-one link (D-07)
- [Phase 13]: familyMember/familyMembers resolvers return raw Sequelize instances so the fullname VIRTUAL getter resolves via default GraphQL field resolution
- [Phase 13]: linkUserToMember validates memberId/newMember mutual exclusivity via (memberId == null) === (newMember == null), and relies on the DB UniqueConstraintError (not a pre-emptive findOne) to catch duplicate-link races (D-07/T-13-06)
- [Phase 13]: create-and-link path creates only a bare FamilyMember (no linkParent/addChild/setSpouse), keeping D-05's scope boundary enforced by a zero-match grep
- [Phase 13]: ProtectedRoute's pending-gate guard sits between the !user check and the allowedRoles check so unlinked users are gated before any role-mismatch redirect
- [Phase 13]: familyMemberId added to ME_QUERY, LOGIN_MUTATION, and VERIFY_EMAIL_MUTATION (not just ME_QUERY) since authenticate() never re-runs me after login/verifyEmail
- [Phase 13]: Pending.jsx is deliberately static (no useEffect/polling/admin-contact link) per D-02, and bounces linked/ADMIN users to /dashboard, unauthenticated to /login
- [Phase 13]: AdminLinkMembers.jsx wires page-level unlinkedUsers/familyMembers fetch to per-row pick-existing (Autocomplete) or create-and-link (bare-member form) submit handlers, calling linkUserToMember
- [Phase 13]: /admin/link-members registered behind ProtectedRoute allowedRoles=['ADMIN'], reusing the existing role-gate mechanism unchanged

### Pending Todos

None yet.

### Blockers/Concerns

- Carry-forward from v1.1: `sequelize.sync()` does not alter existing tables — any DB schema change touching an *existing* table (this milestone: `users.familyMemberId` in Phase 13) needs a manual `ALTER TABLE` + human boot-verify; CI's force-recreate can't surface the gap. (Standing infra-debt: adopt Sequelize migrations — still deferred.)
- Carry-forward from v1.1: branch/merge/tag strategy for this milestone (one long-lived `family` branch vs. a stale `origin/main`) should be decided at milestone start, not ship time.
- New for v2.0: the tree-visualization library choice (`@xyflow/react` + `@dagrejs/dagre` vs. `family-chart`) is flagged MEDIUM confidence in research — Phase 17 must spike the synthetic-union-node spouse-pairing pattern before committing to the full build; `family-chart` is the documented fallback if the spike fails.
- New for v2.0: the sibling-dedup scope ("any one shared parent" vs. "both shared parents") was an open product question in research — resolved as "any one shared parent" per REL-06's wording ("shares **either** parent"); Phase 15 implementation must document this as a deliberate, known limitation (half-siblings sharing a firstname will be blocked).
- New for v2.0: cross-subtree relationship-edit consent (Pitfall 8) — the roadmap resolves this as "require admin approval for any edge connecting two independently-linked accounts," to be enforced in Phase 14.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Quality | Coverage reporting/thresholds, linter/formatter + CI gate | Deferred to v2+ | v1.1 milestone init |
| Testing | Full browser E2E tests (Playwright/Cypress) | Deferred (v2.0 REQUIREMENTS.md Out of Scope) | v2.0 requirements |
| Rate limiting | Coarse whole-`/graphql` `express-rate-limit` guard, operation-aware graduated limits | Deferred to v2+ | v1.1 requirements |
| Admin bootstrap | Env-seeded initial admin `ADMIN_EMAIL` as belt-and-suspenders | Deferred to v2+ | v1.1 requirements |
| UX | Frontend-specific 429 message, password-strength meter | Deferred to v2+ | v1.1 requirements |
| Invitations | Email/WhatsApp registration links, automated WhatsApp | Deferred to v2 (INV-01..03) | v2.0 requirements |
| Removal flow | Member-initiated removal request/admin-approval flow | Deferred to v2 (RMV-01) | v2.0 requirements |
| Genealogy | Multiple marriages, half-siblings, adoptions as first-class types | Deferred to v2 (GEN-01/02) | v2.0 requirements |
| Tree curation | Inline tree-editing from `/family` nodes, duplicate-merge tooling | Deferred to v2 (CUR-01/02) | v2.0 requirements |

## Session Continuity

Last session: 2026-07-22T17:16:03.840Z
Stopped at: Phase 14 context gathered
Resume file: .planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-CONTEXT.md

## Operator Next Steps

- Review and approve the v2.0 roadmap, then run `/gsd:plan-phase 12` to begin Family Data Model Foundation.
