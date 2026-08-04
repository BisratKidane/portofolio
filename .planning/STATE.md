---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Family Detail & Descendant Navigation
status: planning
stopped_at: Phase 28 context gathered
last_updated: "2026-08-04T10:22:44.894Z"
last_activity: 2026-08-04
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 11
  completed_plans: 11
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-03 for v4.0)

**Core value:** Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.
**Current focus:** Phase 28 — admin actions on /detail

## Current Position

Phase: 28
Plan: Not started
Status: Ready to plan
Last activity: 2026-08-04

Progress: [██████████] 100%

## Deferred Items

Items acknowledged and deferred at the v2.0 milestone close on 2026-07-25:

| Category | Item | Status |
|----------|------|--------|
| uat | Phase 16 — full browser walkthrough of the upload + crop flow | pending |
| uat | Phase 16 — remove-photo confirm flow end-to-end in a real browser | pending |

Both are browser-only manual checks from Phase 16 (Photo Upload); the underlying code is verified and unit/component-tested. Close them via `/gsd:verify-work 16` when convenient.

Items acknowledged and deferred at the v3.0 milestone close on 2026-07-31:

| Category | Item | Status |
|----------|------|--------|
| code-review | CR-01 — non-admin uncle/aunt Edit path data-loss risk (`ManagePage.jsx:35-36` card-only projection → blank-form overwrite on save). Pre-existing (commit `c43e5be`, v2.0), untouched by v3.0. | open — needs `/gsd:debug` |
| code-review | WR-01 — `LinkAccountsPage`'s `EMPTY_LINK_FORM` omits the 3 new Ge'ez keys → uncontrolled-input warning + no Ge'ez in create-and-link. Introduced by v3.0's shared `MemberFields` change. | open — `/gsd:code-review 23 --fix` candidate |
| bug | Two named pre-existing backend integration failures (VERIFY-04 verify-race, REL-06 dedup TOCTOU) — flagged per D-08, explicitly out of v3.0 scope. | open — deferred |
| housekeeping | 6 completed v2.0 quick-tasks (`260726-*`, `260727-*`) flagged "missing" by pre-close audit — work is done (see Quick Tasks Completed below); tracking files were cleaned up. | acknowledged — no action |

The Phase 22 deferred Ge'ez visual sign-off was **CLOSED** in Phase 23 (human "approved" against a real Tigrinya name) — no longer pending.

## Performance Metrics

**Velocity:**

- Total plans completed: 72 (v1.0: 13, v1.1: 19, v2.0: 27) — none yet in v3.0/v4.0
- Average duration: - min
- Total execution time: 0 hours (v4.0)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01–06 (v1.0) | 13 | - | - |
| 07–11 (v1.1) | 19 | - | - |
| 12–17 (v2.0) | 31 | - | - |
| 18–23 (v3.0) | 11 | - | - |
| 24–29 (v4.0) | TBD | - | - |
| 24 | 3 | - | - |
| 25 | 2 | - | - |
| 26 | 2 | - | - |
| 27 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: - (v3.0 closed 2026-07-31; v4.0 roadmap just created, execution not yet started)
- Trend: -

*Updated after each plan completion*
| Phase 27 P01 | 10min | 2 tasks | 2 files |
| Phase 27 P02 | 2min | 2 tasks | 2 files |
| Phase 27 P03 | 15min | 2 tasks | 2 files |
| Phase 27 P04 | 25min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- v4.0 roadmap: 6 phases (24–29), continuing numbering from v3.0's Phase 23 close (no reset to 1). Backend read layer (24) is sequenced first so the frontend phases consume real GraphQL reads instead of mocks, matching this project's established build-order convention (v2.0/v3.0 backend-before-frontend sequencing).
- v4.0 roadmap: the reusable `PersonCard` (25) is built and tested before the `/detail` page (26) composes it, and before descendant navigation (27) reuses it per generation — one card component renders head/children/grandchildren with no duplicate card UI.
- v4.0 roadmap: admin actions (28) are sequenced after navigation (27) so add-child/add-spouse can refresh an already-expanded person's children/spouses in place, and depend on Phase 24's edit-permission signal + the already-admin-guarded `AddRelativeDialog`/`EditMemberDialog` mutations (no new backend enforcement to build, PERM-03 is a reuse+adversarial-test concern).
- v4.0 roadmap: a milestone-closing Phase 29 (a11y + responsive + full-suite gate) mirrors this project's established close-out pattern (cf. v3.0 Phase 23's QUAL-01 gate).
- v4.0 roadmap: PERF-02 (N+1-free child counts/reads) is anchored to Phase 24 (backend) and PERF-01/PERF-03 (lazy loading + session caching, which are inherently frontend-behavior concerns) are anchored to Phase 27 (navigation), even though performance is a cross-cutting concern woven through both.
- v3.0 roadmap: Phase order is data model + migration (18) → GraphQL layer (19) → self-hosted font/theme (20) → shared displayName helper (21) → read-path render surfaces (22) → write-path forms/Autocomplete (23), per RESEARCH.md SUMMARY.md's dependency-ordered build order.
- v3.0 roadmap: Phase 21 (shared `displayName` helper) is sequenced as a standalone prerequisite before Phase 22's render surfaces, to prevent each component from re-deriving the Latin/Ge'ez precedence rule slightly differently (the drift risk PITFALLS.md/ARCHITECTURE.md both flag).
- Post-Phase 17 (2026-07-25): `/family` edge model replaced union-node "spouses-paired" rendering with a pure parent→child hierarchy at the user's request (real data had 0 spouse rows, 0 two-parent children — the union model rendered zero edges). `UnionNode.jsx` and the union assembly/layout machinery were removed.
- [Phase 27]: colors.line used for the GenerationGrid apex cue (D-06) -- lighter/more restrained than colors.slate (/family edges) and colors.primary (spouse connector)
- [Phase 27]: Plan 27-03: RTL's global cleanup() unmounts renderHook's host component after every it() -- restructured the useDescendantNav test suite so each it() renders its own fresh instance instead of sharing one across a describe block.
- [Phase 27]: DetailPage wires useDescendantNav + GenerationGrid; onEdit stays a no-op on every card (head/gen1/gen2), Phase 28 scope untouched
- [Phase 27]: PERF-03's exact cache-hit re-expand render count is 2 (not 1) -- traced to MemberAvatarImage's benign mount-effect settling commit on the freshly re-mounted card, distinct from a cache-miss expand's 3+ commit cost

### Pending Todos

None yet.

### Blockers/Concerns

- Carry-forward from v1.1: `sequelize.sync()` does not alter existing tables — any v4.0 schema change (not expected per API-01/D-scope, but if a query genuinely requires one) needs a manual `.sql` migration, same as every prior schema change to an existing table.
- v4.0 Phase 24 needs to confirm the DataLoader/batching pattern used for `/family` and `/manage` extends cleanly to per-parent direct-child + child-count queries without introducing a new N+1 shape (PERF-02).
- v4.0 Phase 27's forward-shift state machine (NAV-04) is the milestone's trickiest UI logic — grandparent + parent's-siblings drop, parent promotes to top, grandchild's children become gen-3 — worth a design pass before implementation to keep the 3-generation invariant provably correct.
- Carry-forward from v3.0: CR-01 (non-admin uncle/aunt Edit path data-loss risk, `ManagePage.jsx:35-36`) remains open; `/detail`'s admin edit path (Phase 28) reuses `EditMemberDialog` and should confirm it doesn't inherit the same card-only-projection gap when opened from `/detail`'s person card.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Quality | Coverage reporting/thresholds, linter/formatter + CI gate | Deferred to v2+ | v1.1 milestone init |
| Testing | Full browser E2E tests (Playwright/Cypress) | Deferred (v4.0 REQUIREMENTS.md Out of Scope) | v4.0 requirements |
| Rate limiting | Coarse whole-`/graphql` `express-rate-limit` guard, operation-aware graduated limits | Deferred to v2+ | v1.1 requirements |
| Admin bootstrap | Env-seeded initial admin `ADMIN_EMAIL` as belt-and-suspenders | Deferred to v2+ | v1.1 requirements |
| UX | Frontend-specific 429 message, password-strength meter | Deferred to v2+ | v1.1 requirements |
| Invitations | Email/WhatsApp registration links, automated WhatsApp | Deferred to v2 (INV-01..03) | v2.0 requirements |
| Removal flow | Member-initiated removal request/admin-approval flow | Deferred to v2 (RMV-01) | v2.0 requirements |
| Genealogy | Multiple marriages, half-siblings, adoptions as first-class types | Deferred to v2 (GEN-01/02) | v2.0 requirements |
| Tree curation | Inline tree-editing from `/family` nodes, duplicate-merge tooling | Deferred to v2 (CUR-01/02) | v2.0 requirements |
| Ge'ez toggle | Latin ↔ Ge'ez display toggle for viewers | Deferred (v3.0 REQUIREMENTS.md Out of Scope) | v3.0 requirements |
| Ge'ez surfaces | Detail panel / dashboard Ge'ez rendering, LinkAccounts picker Ge'ez search | Deferred | v3.0 requirements |
| i18n | Broader Amharic/Tigrinya UI localization (labels/buttons) | Deferred | v3.0 requirements |
| uat | Phase 22 — visual sign-off of Ge'ez name rendering/truncation on the fixed 252×120px `/family` card + both `/manage` surfaces against the LONGEST real Ge'ez name. | CLOSED in Phase 23 | Phase 22 execution (2026-07-31) |
| Navigation | Ancestor navigation on `/detail` (upward) | Deferred (v4.0 REQUIREMENTS.md Future Requirements) | v4.0 requirements |
| Navigation | Shareable/deep-linkable per-person URL on `/detail` (e.g. `/detail/:id`) | Deferred (v4.0 REQUIREMENTS.md Future Requirements) | v4.0 requirements |
| Genealogy | Fuller genealogy relationships in the `/detail` card/nav (multiple marriages, half-siblings, adoptions) | Deferred (v4.0 REQUIREMENTS.md Future Requirements) | v4.0 requirements |
| Ge'ez toggle | Latin↔Ge'ez display toggle + Ge'ez search on `/detail` suggestions beyond name fields | Deferred (v4.0 REQUIREMENTS.md Future Requirements) | v4.0 requirements |

## Quick Tasks Completed

| Quick ID | Task | Status | Date |
|----------|------|--------|------|
| 260726-rwp | Root the `/family` tree at the top ancestor (member id 1, Agne) instead of the viewer — full tree expanded + fit on load | complete ✓ | 2026-07-26 |
| 260726-sh4 | Restyle `/family` MemberNode card: 1/3 avatar column + rows (reserved edit row, fullname, birthday, mother name, alive-only address) — on branch `member_node` | complete ✓ | 2026-07-26 |
| 260726-wn2 | Agne rebrand: themed tree-of-people logo + favicon, gender default avatars, rename Portofolio→Agne — on branch `agne-rebrand` | complete ✓ | 2026-07-26 |
| 260727-byh | /manage forms pass 1: role clarity (names active member), shared MemberFields ≤2 cols + MUI X DatePicker, photo-on-create, side-by-side account↔member connection card — on branch `manage-forms` | complete ✓ | 2026-07-27 |
| 260727-rvt | Dashboard user management (TDD): updateUser/changePassword/setUserPassword mutations + Edit/Change-password/Set-password dialogs, richer users list (last-updated + Unverified chip), self-vs-admin authz, last-admin guard, email re-verification — on branch `dashboard-user-management` | complete ✓ | 2026-07-27 |
| 260727-tb1 | Family member provenance + isAlive (TDD): createdBy/updatedBy + timestamps (admin-only), isAlive replaces deathdate in API/UI (deathdate column kept), admin isAlive toggle in /manage list + /family detail panel, provenance columns; manual migration 014 — on branch `member-provenance-isalive` (stacked on dashboard-user-management) | complete ✓ | 2026-07-27 |
| 260801-fsa | Switch Ge'ez webfont Noto Sans Ethiopic → SIL Abyssinica SIL (`@fontsource/abyssinica-sil`, weight 400 only) + gender-tint the Ge'ez name & mother's-name rows on the `/family` tree card (male #3b82f6 / female #ec4899). 301/301 frontend tests + prod build green. Manual follow-up: human `/family` glyph-coverage + tint-legibility check. | complete ✓ | 2026-08-01 |
| 260801-fst (fast) | `/family` tree card: remove the birthday row; show the mother's name in Ge'ez (Ge'ez-preferred, Latin fallback — added `geezMothersname` + `mother{geezFullname}` to `FAMILY_TREE_QUERY`); remove the "Head" text label (re-root still shown by the boxShadow glow; single-click re-heading unchanged). 303/303 frontend tests green. | complete ✓ | 2026-08-01 |
| 260801-hfw | Fix `/family` spouse node overlapping a sibling: `familyTree.layout.js` now reserves the couple's combined footprint (`COUPLE_W = 2·PERSON_W + SPOUSE_GAP`) as the bloodline anchor's dagre node width, so dagre's `nodesep` spacing keeps siblings clear of the spouse's snapped slot — overlap is impossible by construction. Added a pairwise-AABB no-overlap regression test. 305/305 frontend tests green. | complete ✓ | 2026-08-01 |
| 260801-l9e | Add-relative dialog: when adding a **child**, auto-fill the child's father/mother name in BOTH Latin and Tigrinya from the anchor parent — male anchor → `lastname`+`geezLastname` (= parent's first / Ge'ez-first), female anchor → `mothersname`+`geezMothersname` (= parent's "first last" / "Ge'ez-first Ge'ez-last"). Sparse join (present parts only; Tigrinya left blank when the parent has no Ge'ez name); all fields stay editable. Plumbed `targetLastname`/`targetGeezFirstname`/`targetGeezLastname` through both ManagePage branches; no query change (fields already in `EDITABLE_MEMBER_FIELDS`). TDD; 309/309 frontend tests green. | complete ✓ | 2026-08-01 |
| 260801-idsort (fast) | `/manage` admin "Manage family" member list now always sorted by ascending numeric id (`AdminMemberTable` sorts before search/pagination), independent of DB return order. Regression test added. 310/310 frontend tests green. | complete ✓ | 2026-08-01 |

## Session Continuity

Last session: 2026-08-04T10:22:44.888Z
Stopped at: Phase 28 context gathered
Resume file: .planning/phases/28-admin-actions-on-detail/28-CONTEXT.md

## Operator Next Steps

- Run `/gsd:plan-phase 24` to plan the first v4.0 phase (Backend Read Layer for /detail).
