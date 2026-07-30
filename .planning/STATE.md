---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Ge'ez Native-Script Names
status: completed
stopped_at: Phase 19 context gathered
last_updated: "2026-07-30T19:04:38.995Z"
last_activity: 2026-07-30 -- Phase 19 marked complete
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-30)

**Core value:** Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.
**Current focus:** Phase 19 — graphql-layer

## Current Position

Phase: 19 — COMPLETE
Plan: 1 of 1
Status: Phase 19 complete
Last activity: 2026-07-30 -- Phase 19 marked complete

Progress: [░░░░░░░░░░] 0%

## Deferred Items

Items acknowledged and deferred at the v2.0 milestone close on 2026-07-25:

| Category | Item | Status |
|----------|------|--------|
| uat | Phase 16 — full browser walkthrough of the upload + crop flow | pending |
| uat | Phase 16 — remove-photo confirm flow end-to-end in a real browser | pending |

Both are browser-only manual checks from Phase 16 (Photo Upload); the underlying code is verified and unit/component-tested. Close them via `/gsd:verify-work 16` when convenient.

## Performance Metrics

**Velocity:**

- Total plans completed: 53 (v1.0: 13, v1.1: 19, v2.0: 27) — none yet in v3.0
- Average duration: - min
- Total execution time: 0 hours (v3.0)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01–06 (v1.0) | 13 | - | - |
| 07–11 (v1.1) | 19 | - | - |
| 12–17 (v2.0) | 31 | - | - |
| 18–23 (v3.0) | TBD | - | - |
| 18 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: - (v2.0 closed 2026-07-25; v3.0 not yet started)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- v3.0 roadmap: Phase order is data model + migration (18) → GraphQL layer (19) → self-hosted font/theme (20) → shared displayName helper (21) → read-path render surfaces (22) → write-path forms/Autocomplete (23), per RESEARCH.md SUMMARY.md's dependency-ordered build order.
- v3.0 roadmap: Phase 20 (font/theme) is deliberately independent of Phases 18–19 (no data dependency) and may be executed in parallel — it carries the highest number of distinct "looks done but isn't" pitfalls per research (subsetting/glyph coverage, FOUT/FOIT, CDN-vs-self-host).
- v3.0 roadmap: Phase 21 (shared `displayName` helper) is sequenced as a standalone prerequisite before Phase 22's render surfaces, to prevent each component from re-deriving the Latin/Ge'ez precedence rule slightly differently (the drift risk PITFALLS.md/ARCHITECTURE.md both flag).
- v3.0 roadmap: Phase 22 (render, read path) is sequenced before Phase 23 (write path/forms) matching this app's established test-first convention — prove rendering against seeded/direct-mutation data before wiring end-user input, avoiding conflating "renders wrong" bugs with "form submits wrong" bugs.
- v3.0 roadmap: QUAL-01 (cross-cutting TDD/CI constraint) is anchored to Phase 23 (milestone-closing phase) for traceability, though its constituent unit tests (`geezFullname`, `displayName`) are substantively written in Phases 18 and 21 respectively — Phase 23's criteria explicitly re-confirm both stay green plus the full-suite/CI gate and the manual glyph sign-off.
- v3.0 roadmap: manual glyph/visual verification (font rendering, tree-card truncation, Tigrinya labialized-consonant coverage) is treated as a human sign-off gate, not an automated assertion — jsdom cannot assert real glyph rendering, per RESEARCH.md.
- [Phase 17]: familyMembers query guard relaxed from requireAdmin to requireFamilyAccess (D-13); linkedUser field-level gate (Phase 14 CR-01) verified untouched via new D-14 regression test
- [Phase 17]: D-12 locked with an implementation amendment: production spouse-pairing uses the union-node midpoint mechanism, not RESEARCH.md's minlen:0 dagre edge (crashes @dagrejs/dagre)
- Post-Phase 17 (2026-07-25): `/family` edge model replaced union-node "spouses-paired" rendering with a pure parent→child hierarchy at the user's request (real data had 0 spouse rows, 0 two-parent children — the union model rendered zero edges). `UnionNode.jsx` and the union assembly/layout machinery were removed.

### Pending Todos

None yet.

### Blockers/Concerns

- Carry-forward from v1.1: `sequelize.sync()` does not alter existing tables — v3.0's Ge'ez columns need a manual `.sql` migration (`018-*.sql`), same as every prior schema change to an existing table (009/011/013/014/016/017).
- New for v3.0: font subsetting/tooling risk — a generic "self-host Google Fonts" recipe can silently drop Tigrinya-specific labialized consonant glyphs (ቨ, ቐ — main Ethiopic block U+1200–137F, not the Supplement U+1380–139F as the milestone brief originally assumed). Phase 20 must verify against real Tigrinya name fixtures, not generic Ethiopic sample text.
- New for v3.0: the fixed 252×120px `/family` tree card is already tight for Latin `noWrap` text; Ge'ez glyphs are visually wider at the same character count. Phase 22 needs a mandatory manual visual pass against the longest real Ge'ez name in the actual dataset.
- New for v3.0: MUI Autocomplete's default filter only matches `getOptionLabel` (kept Latin-only per the no-toggle decision) — Phase 23 needs a custom `filterOptions` via `createFilterOptions`, decoupled from the visible option label.
- Phase 20 scope note (2026-07-30): ROADMAP SC4's "manual pass on `/family` tree cards shows no FOUT-driven layout shift" is intentionally split — Phase 20 proves font *resolution* (paste arbitrary Ge'ez sample text into a `Typography`) since no `/family` surface renders real Ge'ez data yet; the tree-card truncation/layout-shift check against real Ge'ez names is Phase 22's job (RESEARCH.md Pitfall 4). Do not flag the deferred `/family`-specific check as an unmet Phase 20 criterion at `/gsd:verify-work 20`.

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
| Ge'ez toggle | Latin ↔ Ge'ez display toggle for viewers | Deferred (v3.0 REQUIREMENTS.md Out of Scope) | v3.0 requirements |
| Ge'ez surfaces | Detail panel / dashboard Ge'ez rendering, LinkAccounts picker Ge'ez search | Deferred | v3.0 requirements |
| i18n | Broader Amharic/Tigrinya UI localization (labels/buttons) | Deferred | v3.0 requirements |

## Quick Tasks Completed

| Quick ID | Task | Status | Date |
|----------|------|--------|------|
| 260726-rwp | Root the `/family` tree at the top ancestor (member id 1, Agne) instead of the viewer — full tree expanded + fit on load | complete ✓ | 2026-07-26 |
| 260726-sh4 | Restyle `/family` MemberNode card: 1/3 avatar column + rows (reserved edit row, fullname, birthday, mother name, alive-only address) — on branch `member_node` | complete ✓ | 2026-07-26 |
| 260726-wn2 | Agne rebrand: themed tree-of-people logo + favicon, gender default avatars, rename Portofolio→Agne — on branch `agne-rebrand` | complete ✓ | 2026-07-26 |
| 260727-byh | /manage forms pass 1: role clarity (names active member), shared MemberFields ≤2 cols + MUI X DatePicker, photo-on-create, side-by-side account↔member connection card — on branch `manage-forms` | complete ✓ | 2026-07-27 |
| 260727-rvt | Dashboard user management (TDD): updateUser/changePassword/setUserPassword mutations + Edit/Change-password/Set-password dialogs, richer users list (last-updated + Unverified chip), self-vs-admin authz, last-admin guard, email re-verification — on branch `dashboard-user-management` | complete ✓ | 2026-07-27 |
| 260727-tb1 | Family member provenance + isAlive (TDD): createdBy/updatedBy + timestamps (admin-only), isAlive replaces deathdate in API/UI (deathdate column kept), admin isAlive toggle in /manage list + /family detail panel, provenance columns; manual migration 014 — on branch `member-provenance-isalive` (stacked on dashboard-user-management) | complete ✓ | 2026-07-27 |

## Session Continuity

Last session: 2026-07-30T18:11:11.560Z
Stopped at: Phase 19 context gathered
Resume file: .planning/phases/19-graphql-layer/19-CONTEXT.md

## Operator Next Steps

- Run `/gsd:plan-phase 18` to plan the Data Model & Migration phase.
