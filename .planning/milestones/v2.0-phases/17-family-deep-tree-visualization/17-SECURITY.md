---
phase: 17
slug: family-deep-tree-visualization
status: verified
threats_open: 0
asvs_level: 2
created: 2026-07-25
---

# Phase 17 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all four 17-0x-PLAN.md carried a `<threat_model>` block);
> verified against the current codebase — including the post-phase pure-hierarchy refactor
> (commits 305dfa6, c23f8b8, 5c897e2) that removed the union-node model. `nodesDraggable={false}`
> (T-17-07) and the visible-id-set-keyed layout memoization (T-17-09) were confirmed still present
> after that refactor.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| GraphQL client → `familyMembers` resolver | Guard relaxed from admin-only to linked-member-or-admin (D-13); any JWT-bearing linked member or admin now reaches it | Whole family graph (names, dates, photo refs) |
| `FamilyMember.linkedUser` field resolver → User table | Per-row field gate that must keep gating regardless of who can call the parent query | User email/role (admin-or-self only) |
| Browser → `/family` route | Client-side `<ProtectedRoute>` gate (UX redirect only); real enforcement is the server-side `requireFamilyAccess` guard | Route access |
| `FamilyTreePage` → `FAMILY_TREE_QUERY` payload | The single flat query must not select any admin-only-sensitive field | Family member fields (no `linkedUser`) |
| `FamilyTreeCanvas` props → rendered DOM | Presentation-only; performs no auth/fetch, renders only the props it is given | Already-authorized member fields |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-17-01 | Elevation of Privilege | `familyMembers` resolver guard (D-13) | mitigate | `familyMember.resolver.js:14` guards with `requireFamilyAccess(user)` (not `requireAdmin`); `auth.js:43-47` rejects unlinked non-admin; adversarial test proves rejection | closed |
| T-17-02 | Information Disclosure | `FamilyMember.linkedUser` field resolver | mitigate | `familyMember.resolver.js:289-294` field gate unchanged: `user?.role === 'ADMIN' \|\| linked.id === user?.id`, else `null` (D-14 regression test) | closed |
| T-17-03 | Denial of Service | broadly-callable `familyMembers` query | accept | Global `maxDepthRule` (`graphql/serverConfig.js` → `server.js:26` `validationRules`) applies to every operation; query is shallow (`queryDepth.test.js`) | closed |
| T-17-04 | Information Disclosure | temporary `/family-spike` route | mitigate | Route + `__spike/` dir fully removed in 17-03; `grep -c family-spike App.jsx` = 0, no `*spike*` under `frontend/src` | closed |
| T-17-05 | Tampering (dead code) | spike harness files | accept | `frontend/src/components/family/__spike/` does not exist on disk (planned removal in 17-03 completed) | closed |
| T-17-06 | Supply Chain | `@xyflow/react` / `@dagrejs/dagre` installs | accept | Both legitimacy-audited in 17-RESEARCH.md; present in `package.json` (`^12.11.2` / `^3.0.0`) and actively imported; both survived the refactor | closed |
| T-17-07 | Tampering | node interaction surface | mitigate | `FamilyTreeCanvas.jsx:223` — `nodesDraggable={false}` present verbatim post-refactor; canvas read-only by prop (D-08) | closed |
| T-17-08 | Information Disclosure | rendered member fields | accept | `FamilyTreeCanvas`/`MemberNode` render only `data.member` props; no new fetch surface; access control enforced upstream (T-17-01/T-17-11) | closed |
| T-17-09 | DoS (client-side) | full-tree dagre re-layout | mitigate | `FamilyTreeCanvas.jsx:110-116` — `positionedNodes` memo keyed on `visibleIdsKey` (sorted `expandedIds`) only; `layoutWithDagre` re-runs on expand/collapse, not on pan/zoom/selection (holds post-refactor) | closed |
| T-17-10 | Spoofing / Elevation of Privilege | `/family` route access | mitigate | `App.jsx:28` route inside `<ProtectedRoute>` (no `allowedRoles`); `ProtectedRoute.jsx:16-17` → unauth `/login`, unlinked non-admin `/pending`; real enforcement server-side (T-17-01) | closed |
| T-17-11 | Information Disclosure | `FAMILY_TREE_QUERY` field selection | mitigate | `FamilyTreePage.jsx:20-27` selects `id firstname lastname fullname gender birthdate deathdate photoUrl mother{id} father{id} spouses{id} children{id}` — no `linkedUser` (`grep -c linkedUser` = 0), closes Phase 14 CR-01 field (D-14) | closed |
| T-17-12 | Repudiation / Availability | full-suite regression (v2.0 close-out) | mitigate | `npm test --workspaces` run as phase gate — backend 321/321, frontend 169/169 green; QUAL-03 satisfied with zero new CI config | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-17-01 | T-17-03 | DoS via the now-more-broadly-callable `familyMembers` query is bounded by the existing global `maxDepthRule` validation rule (applies to every operation regardless of caller role); the query is shallow (2–3 levels) and nowhere near `MAX_QUERY_DEPTH`. No phase-specific control needed. | Bisrat Kidane | 2026-07-25 |
| AR-17-02 | T-17-05 | Residual spike/dead-code risk was time-boxed: the `__spike/` harness and temporary `/family-spike` route were an auditable, planned removal in Plan 17-03 Task 1 — verified gone from disk. | Bisrat Kidane | 2026-07-25 |
| AR-17-03 | T-17-06 | Supply-chain risk of `@xyflow/react` / `@dagrejs/dagre` accepted on the basis of 17-RESEARCH.md's Package Legitimacy Audit (verified source repos, high download counts, OK slopcheck verdict). | Bisrat Kidane | 2026-07-25 |
| AR-17-04 | T-17-08 | The canvas renders only fields already present in its props and introduces no new data-fetching surface; the real access-control boundary is enforced upstream (server guard T-17-01, route gate T-17-10, query field-selection T-17-11). | Bisrat Kidane | 2026-07-25 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-25 | 12 | 12 | 0 | gsd-security-auditor (via /gsd:secure-phase 17) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-25
