# Project Research Summary

**Project:** Portfolio Auth App — v2.0 Collaborative Family Tree
**Domain:** Collaborative, membership-gated genealogy/family-tree web app, grafted onto an existing shipped Express + Apollo Server 4 + React 18/MUI 6 + Sequelize 6/MySQL 8 auth application
**Researched:** 2026-07-21
**Confidence:** HIGH overall (stack versions, Sequelize patterns, Apollo upload guidance, and `sync()`/N+1/CSRF mechanics are all verified against official docs or live registry data); MEDIUM on family-tree-specific collaboration/permission/dedup patterns (reasoned from a smaller-scale domain analogy to WikiTree/Geni/FamilySearch, which operate at far larger scale than this milestone)

## Executive Summary

This is a subsequent-milestone addition, not a greenfield build: a self-referential genealogy graph (parent/child + spouse), a deep pan/zoom tree view, photo upload, and admin-mediated membership gating are being bolted onto an already-hardened Express/Apollo/Sequelize/React stack. The research across all four areas agrees on the shape of the solution: model parent/child as directional self-referencing FKs (`motherId`/`fatherId`) and spouse as a self-referential many-to-many join table written symmetrically (both directions on write); serve the deep tree as one flat, whole-graph GraphQL query assembled into a layout client-side rather than nested recursive resolvers (which would hit this app's documented lack of DataLoader/query-depth limiting); and keep photo upload on a dedicated REST route via `multer`, deliberately outside `/graphql`, because Apollo Server 4's default `csrfPrevention: true` and this app's Apollo-Client-less Axios frontend make GraphQL multipart uploads (`graphql-upload`) both against Apollo's own guidance and needlessly fragile here.

The single biggest risk this milestone carries is **permission and membership-gating logic**, not the tree visualization itself. Pitfalls research identifies a cluster of adversarial-thinking gaps that are easy to ship "looking done" while being wrong: cycles in the parent/child graph, asymmetric spouse writes, wrong cascade-on-delete behavior, a permission-scope function (`getEditableMemberIds`) that must be the single source of truth and tested against explicit *exclusions* (grandparents, cousins, siblings-of-siblings), relationship edits used as a privilege-escalation vector (fabricating a spouse/parent link to a stranger's subtree to expand editable reach), and a membership gate that must be enforced at the resolver layer — not just the frontend route — while still carving out an exemption for the first bootstrapped admin (who has no linked member yet, the same chicken-and-egg problem v1.1 already solved once for role assignment). These are correctness- and security-critical enough that they warrant dedicated phases with adversarial (not just happy-path) tests, TDD'd red-green per this project's established discipline.

The tree-visualization library choice is presented as a recommendation to confirm, not a settled fact, because the two research passes disagree in emphasis (see below), and the sibling-dedup rule has an explicit open product question that must be resolved during requirements definition before it can be implemented correctly.

## Key Findings

### Recommended Stack

STACK.md recommends three additions layered onto the existing, unchanged stack (no new ORM, no Apollo Client, no bundler change): `@xyflow/react` (React Flow) + `@dagrejs/dagre` for the deep tree canvas, `multer@^2.2.0` for photo upload via a dedicated REST route, and no new Sequelize package — self-referential `belongsTo`/`hasMany`/`belongsToMany` cover both parent/child and spouse natively in Sequelize 6.37 (already installed).

**Core technologies:**
- `@xyflow/react ^12.11.2` (React Flow): renders the `/family` deep tree — nodes are plain React components (MUI composes in directly), pan/zoom/minimap built in, and an officially documented `hidden`-node pattern supports collapsible/lazy branches, which matters at 10–23 generations deep.
- `@dagrejs/dagre ^3.0.0`: computes hierarchical layout coordinates before handing them to React Flow (React Flow has no built-in auto-layout). Must be the `@dagrejs` fork, not the abandoned plain `dagre` package.
- `multer ^2.2.0`: parses the photo upload on a dedicated Express REST route, separate from `/graphql`. Must be `2.x` — `1.x` carries two unpatched DoS CVEs.
- `sequelize@6.37.8` (unchanged): self-referential adjacency-list FKs for parent/child, self-referential `belongsToMany` join table for spouse — both stable, documented patterns, no version bump needed.

**Tree-visualization library — decision to confirm, not settled:** STACK.md's live-registry comparison recommends `@xyflow/react` for being actively maintained (weekly release cadence), natively React/MUI-idiomatic (no DOM-ownership conflicts), and having official documented patterns for both auto-layout and lazy/collapsible branches — the two hardest requirements at this milestone's depth. Its gap is that React Flow has **no native spouse/couple concept**; the recommended workaround is a synthetic "union node" between two spouses (well-precedented in public React-Flow family-tree projects, and structurally mirrors GEDCOM's own `FAM` record). FEATURES.md, researching the domain independently, leaned toward `family-chart` (`donatso/family-chart`) precisely because it has the *best native spouse/parent/children genealogy modeling* of anything surveyed — but it is framework-agnostic vanilla D3 (requires manual `useEffect`+ref DOM-ownership wiring inside React, a real source of bugs on unmount/route-change) and the vendor's own site advertises a paid "premium" tier for "Performance Optimizations," a signal the free tier's headroom may not comfortably cover a 10–23-generation tree. **Net recommendation: proceed with `@xyflow/react` + `@dagrejs/dagre` as the default, but treat the synthetic-union-node spouse-pairing approach as a specific implementation risk worth an early spike/prototype before committing** — if it proves awkward in practice, `family-chart` (or `relatives-tree`'s layout math alone, paired with a different renderer) is the documented fallback. This should not be treated as a closed decision going into roadmap phase-planning.

### Expected Features

FEATURES.md maps table-stakes features against genealogy-software conventions (GEDCOM, FamilySearch, WikiTree, Geni) scaled down to a single, small, admin-curated family — explicitly *not* a public "world tree," which is why several common genealogy features (global fuzzy-match dedup, merge tooling, real-time collaborative editing, self-service node-claiming) are flagged as anti-features for this milestone.

**Must have (table stakes):**
- Member model: required firstname/lastname/gender, derived fullname, optional biographical fields (birthdate, deathdate, phone, address, mothersname, email), profile photo
- Directed parent→child + undirected spouse relationships; siblings **derived** from shared parents, never stored as their own edge
- Pan/zoom deep tree with spouses rendered adjacent (not as a separate generation) and search-to-locate
- Self-service `/manage` editing scoped to "my immediate relatives"; admin edits the whole tree
- Membership gate: register → verify (existing) → pending → admin-linked
- Visible editable-members list (doubles as dedup backstop)
- Sibling-firstname-uniqueness dedup guard (prevention, not cure)

**Should have (v2.x candidates, not blocking this milestone):**
- Collapse/expand on the tree canvas, re-root/focus-on-person view — both cheap if the chosen library supports them, add once real trees get visually noisy

**Defer (explicitly out of scope per PROJECT.md and FEATURES.md):**
- Real-time collaborative editing, approval workflows for edits, self-service node-claiming, auto-provisioned member nodes on registration, global fuzzy-match dedup/merge tooling, full genealogy generality (multiple marriages/half-siblings/adoption), GEDCOM import/export, per-field edit history/audit log, invitation links, object-storage photos, browser E2E for family-tree flows

### Architecture Approach

ARCHITECTURE.md treats this as additive: new backend domain files follow the codebase's existing `user.*` aggregator-barrel convention exactly (`familyMember.schema.js`/`.resolver.js`, merged into the same `schemas/index.js`/`resolvers/index.js` pattern already anticipating multiple domains). The deep tree is served as one flat adjacency-list query (`familyTree: { members: [FamilyMember!]! }`, 1–2 SQL statements total) assembled into a graph client-side, specifically to avoid the app's documented lack of DataLoader/batching. Permission scoping is a pure, reusable in-memory set-builder (`computeEditableRelatives`) recomputed fresh per mutation, never cached — mirroring how `utils/auth.js` already centralizes cross-cutting guard logic separately from resolver bodies.

**Major components:**
1. `FamilyMember` / `FamilySpouse` Sequelize models (new tables) + `models/index.js` association wiring — foundational, no manual migration needed since these are brand-new tables.
2. `utils/family.js` (`computeEditableRelatives`, sibling-derivation helpers) + `utils/auth.js` extension (`requireFamilyAccess`/`requireLinkedMember`) — the permission/gating layer every mutation depends on.
3. `familyMember.schema.js` / `familyMember.resolver.js` — CRUD, relationship mutations, the flat `familyTree` query, account-linking mutations (admin-only).
4. Photo upload subsystem: a dedicated `multer`-backed Express route + `express.static('/uploads')`, mounted alongside (not through) Apollo, backed by a named Docker volume.
5. Frontend: `FamilyTree.jsx` (`/family`), `ManageFamily.jsx` (`/manage`), `Pending.jsx` (`/pending`), plus a `ProtectedRoute` variant gated on `requireFamilyAccess`.

### Critical Pitfalls

1. **N+1 fan-out from naive recursive resolvers on a deep tree** — avoid by never resolving `parents`/`children`/`spouse` field-by-field; use the flat whole-tree fetch (Pattern 3) plus request-scoped DataLoaders for any place per-node resolution is still needed, and add `graphql-depth-limit` the same phase the recursive `FamilyMember` type ships (this app currently has zero query-depth limiting — a real DoS surface once this type exists).
2. **Cycles in the parent/child graph** (a person becomes their own ancestor) — nothing in Sequelize/MySQL FK constraints prevents this; every parent/child mutation needs an explicit, bounded ancestor-check before committing, TDD'd with a test that attempts to create a cycle and asserts rejection.
3. **Asymmetric spouse writes and undecided cascade/orphan behavior on delete** — spouse must be written symmetrically (both directions) on every marriage-create, and every self-referencing association needs an explicit, deliberately-chosen `onDelete` (almost certainly `SET NULL`, not cascade) — a family tree should not vanish downstream because one ancestor was removed.
4. **Permission-scope computed wrong, or used as a privilege-escalation vector** — `getEditableMemberIds`(-style utility) must be the single source of truth, recomputed fresh per mutation, tested against explicit *exclusions* (grandparents, cousins, siblings-of-siblings); separately, a relationship-creation mutation that lets Member A unilaterally attach themselves to Member B's (already-linked) subtree without consent is itself a privilege-escalation bug, not just a data-modeling nicety.
5. **Membership gate enforced only at the frontend route level** — a verified-but-unlinked JWT can call family GraphQL operations directly, bypassing the SPA gate entirely, unless a `requireLinkedMember` guard runs inside every family-domain resolver — with an explicit **role-based carve-out for the first bootstrapped admin**, who has no linked member yet and must still be able to create/link the first node (the same chicken-and-egg shape v1.1 already solved once for admin promotion).
6. **Insecure file upload handling** (trusting client filename/content-type) — path traversal and stored-XSS-via-mislabeled-image are both live risks; require server-generated filenames, magic-number content validation (disallow SVG), and `nosniff` on the serving route, tested adversarially before the happy path.

## Open Product Question (flag for requirements definition — do not decide here)

PITFALLS.md surfaces an explicit ambiguity in the sibling-firstname-dedup rule as specified: does "sibling" for the purposes of the uniqueness check mean **shares ANY ONE parent** (catches half-siblings as false-positive duplicates) or **shares BOTH parents** (misses genuine full-sibling duplicates when only one parent has been recorded so far)? This is not an implementation detail — it is a product decision with real, differently-shaped tradeoffs (false-positive blocking of legitimate half-siblings vs. under-catching duplicates for partially-recorded families), and PITFALLS.md explicitly recommends it be decided and documented as a known, deliberate scope limitation, not left as an implicit consequence of whichever query gets written first. **This must be resolved during requirements definition, not assumed by the roadmap or by implementation.** Whichever direction is chosen, normalize the firstname comparison (trim + case-fold) and give the rejection error enough detail that a human can recognize a false positive and route around it.

## Implications for Roadmap

Based on combined research, suggested phase structure (dependency-ordered, per ARCHITECTURE.md's build order and PITFALLS.md's phase mapping):

### Phase 1: Family data model foundation
**Rationale:** Everything else — resolvers, permission scoping, the tree view — depends on the `FamilyMember`/`FamilySpouse` schema existing and being *correct* (cycle-safe, cascade-safe, symmetric-spouse-safe) before any mutation logic is built on top of it. These are schema-design decisions that are expensive to change after real data exists.
**Delivers:** `FamilyMember` model (self-referencing `motherId`/`fatherId` FKs), `FamilySpouse` join model (symmetric double-write on create), explicit `onDelete: 'SET NULL'` on every self-referencing association, a cycle-prevention check on parent/child mutations, and a `sync({ force: true })`-against-fresh-DB smoke test in CI global setup.
**Addresses:** FEATURES.md's "Relationship modeling" table-stakes item (directed parent/child + undirected spouse, derived siblings).
**Avoids:** Pitfalls 3 (cycles), 4 (asymmetric spouse), 5 (cascade/orphan), 13 (`sync()` self-referencing rough edges) — all flagged as data-model-phase, not later.

### Phase 2: Membership gating and account↔member linking
**Rationale:** Self-service `/manage` editing requires resolving "which member node is *me*?" — that mapping only exists once the `User.familyMemberId` FK and the account-linking flow exist. This is also the one schema change in this milestone that touches an *existing* table (`users`), which `sequelize.sync()` will silently **not** pick up (see Carry-Forward below) — sequencing it early, as its own phase, keeps that manual step from being missed or entangled with unrelated work.
**Delivers:** `User.familyMemberId` FK (manual `ALTER TABLE` + boot-verify), `requireFamilyAccess`/`requireLinkedMember` guards in `utils/auth.js` with an explicit ADMIN role-based carve-out, the `pending` account state, `/pending` page, admin-only account-linking mutations, and an integration test proving the first-bootstrapped-admin (zero linked members) can still create/link the first node while the v1.1 first-user-ADMIN regression test still passes.
**Addresses:** FEATURES.md's "Membership-gated access" table-stakes item.
**Avoids:** Pitfalls 11 (frontend-only gate) and 12 (admin lockout chicken-and-egg) — both explicitly scoped as the same phase in PITFALLS.md.

### Phase 3: Relationship resolvers, permission scoping, and query-safety
**Rationale:** CRUD/relationship mutations and the permission-scope utility are tightly coupled (every mutation needs the scope check before it can safely exist) and both depend on Phase 1's schema and Phase 2's linked-member concept.
**Delivers:** GraphQL schema + resolvers for `FamilyMember` CRUD and relationship mutations; the flat `familyTree`/`myEditableRelatives` queries (Pattern 3, no nested recursive resolvers); a single, separately-tested `getEditableMemberIds`-style utility in `utils/family.js`; request-scoped DataLoaders (not module-level singletons) if any per-node resolution remains; `graphql-depth-limit` added alongside the now-recursive `FamilyMember` type; and a test that a relationship edge connecting two independently-linked accounts requires consent/admin approval.
**Uses:** Sequelize self-referential association patterns from STACK.md; the flat-adjacency-list resolver pattern and `computeEditableRelatives` design from ARCHITECTURE.md.
**Implements:** ARCHITECTURE.md Patterns 3 and 4.
**Avoids:** Pitfalls 1 (N+1 fan-out), 2 (unbounded query depth), 7 (permission-scope computed wrong), 8 (relationship edits as privilege escalation).

### Phase 4: Sibling dedup guard and `/manage` self-service UI
**Rationale:** The dedup guard is cheap but has real edge cases (normalization, half-sibling false positives, independently-added duplicate parents) that need to be resolved as product decisions before or during implementation — this phase should not start until the open product question above is answered.
**Delivers:** Normalized (trim/case-fold) sibling-firstname-uniqueness check at member-creation and parent-linking time, with an actionable rejection error; `/manage` self-service CRUD form scoped to immediate relatives via Phase 3's permission utility; visible editable-members list; a "search existing members before creating a new parent" UX step to reduce accidental duplicate-parent forking.
**Addresses:** FEATURES.md's "Duplicate prevention" and "Self-service `/manage`" table-stakes items.
**Avoids:** Pitfall 6 (dedup edge cases) — explicitly scoped as its own phase in PITFALLS.md, separate from the data-model and permission phases.

### Phase 5: Photo upload
**Rationale:** Architecturally independent of the relationship/permission work (can parallelize with Phase 3 once Phase 1's `FamilyMember` model exists) but carries its own concentrated security surface (path traversal, content-sniffing XSS, non-durable Docker volume) that deserves dedicated, adversarial-first TDD.
**Delivers:** A dedicated `multer`-backed REST route (`POST /uploads/family-photo`) outside `/graphql`, reusing existing JWT-verification logic; server-generated filenames; magic-number content validation with SVG disallowed; `nosniff` on the serving route; a named Docker volume declared in the same commit, verified to survive a container rebuild.
**Uses:** `multer@^2.2.0` from STACK.md; the REST-route decision explicitly recorded as a Key Decision per PITFALLS.md.
**Avoids:** Pitfalls 9 (insecure upload handling) and 10 (non-durable volume / GraphQL-multipart CSRF complexity) — adversarial fixtures (path-traversal filename, mislabeled content-type, oversized file) should be the first red tests, before the happy path.

### Phase 6: `/family` deep tree visualization
**Rationale:** Depends on Phases 1 and 3 (the flat `familyTree` query and its data shape) and Phase 2 (gating); sequenced last because it's the most visually complex, most library-dependent piece, and benefits from having real (or realistic fixture) relationship data to render against.
**Delivers:** `FamilyTreeCanvas.jsx` wrapping the chosen library, consuming the flat adjacency-list payload, with pan/zoom, spouse-adjacent rendering (synthetic union-node or fallback), search-to-locate, and a collapsed-by-default initial render (not fully expanded) to avoid browser jank at depth.
**Uses:** `@xyflow/react` + `@dagrejs/dagre` per STACK.md's recommendation — **treat the spouse-pairing approach as a spike-first decision**, not a settled implementation detail; budget time to validate the synthetic-union-node pattern against realistic fixture data before committing the full page build.
**Avoids:** The "rendered fully expanded by default" UX pitfall and the performance trap of every node being a live, unwindowed React component.

### Phase Ordering Rationale

- Data model (Phase 1) must come first because cycle/cascade/symmetric-write decisions are schema-level and expensive to retrofit onto real data — this matches both ARCHITECTURE.md's build order and PITFALLS.md's "data-model design phase" grouping for Pitfalls 3, 4, 5, 13.
- Membership gating (Phase 2) is sequenced early and separately because it touches the one *existing* table in this milestone (`User`) and gates every subsequent capability — building it before the relationship/permission resolvers means "who am I" is answered before "what can I edit" needs to check it.
- Permission scoping and relationship resolvers (Phase 3) are combined into one phase because they are mutually dependent per PITFALLS.md (Pitfalls 7 and 8 are explicitly "same phase").
- Dedup (Phase 4) is deliberately sequenced after permission scoping exists, since the `/manage` UI it ships with needs the scoped-edit capability to be usable at all.
- Photo upload (Phase 5) is architecturally independent and could run in parallel with Phase 3/4 per ARCHITECTURE.md's build order ("Steps 8 and steps 4–7 can run in parallel once (1) lands") — listed after for narrative clarity, not as a hard dependency.
- Tree visualization (Phase 6) is last because it consumes the data shape and gating established by every prior phase, and because the library-choice risk (union-node spike) benefits from real relationship data to validate against.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase <N>`):
- **Phase 3 (relationship resolvers/permission scoping):** the `getEditableMemberIds` set-builder and the "consent/admin-approval for cross-subtree relationship edges" rule are genuinely novel logic for this codebase with no existing precedent to imitate beyond `requireAuth`/`requireAdmin`'s guard-clause shape — worth a research pass on exact query construction and test-fixture design.
- **Phase 4 (dedup guard):** blocked on the open product question above; needs the requirements-definition answer before implementation, and the "search existing members before create" UX pattern has no existing precedent in this codebase.
- **Phase 6 (tree visualization):** the STACK.md vs. FEATURES.md library disagreement (React Flow vs. family-chart) means this phase should start with a short spike/prototype validating the synthetic-union-node spouse-pairing pattern against realistic fixture data before committing to the full build.

Phases with standard, well-documented patterns (research-phase optional):
- **Phase 1 (data model):** Sequelize self-referential association patterns are directly documented in official Sequelize docs (HIGH confidence in STACK.md/ARCHITECTURE.md); mostly a careful-implementation-and-testing exercise, not an open research question.
- **Phase 2 (membership gating):** closely mirrors v1.1's already-solved first-user-ADMIN atomicity pattern; the new `requireLinkedMember`/admin-carve-out guard follows the existing `requireAuth`/`requireAdmin` shape directly.
- **Phase 5 (photo upload):** the REST-route-plus-`multer` pattern, CVE-safe version pin, and adversarial-fixture list are all fully specified in STACK.md and PITFALLS.md — implementation-ready without further research.

## Carry-Forward: `sync()`-no-migrations trap

This project's existing constraint — `sequelize.sync()` (no migrations) — creates **new tables** (`family_members`, `family_spouses`) without issue, since `sync()` handles table creation fine regardless of `{ alter: true }`. But `User.familyMemberId` is a **column added to the existing `users` table**, and `sync()` without `{ alter: true }` does **not** add columns to tables that already exist (confirmed against Sequelize's own docs/GitHub issue discussion, HIGH confidence). This means the new FK will silently fail to appear on any environment whose DB already has a `users` table — dev, CI, and any pre-existing deployment — until a human runs an explicit `ALTER TABLE users ADD COLUMN familyMemberId ...` and boot-verifies against a real DB. This is the same category of manual step this project already executed for v1.1's `passwordChangedAt`/email-verification columns, and it must be flagged explicitly in Phase 2's plan and success criteria — not treated as "just another new model" alongside `FamilyMember`/`FamilySpouse`, which need no such step.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Package versions/publish dates/peer-deps live-verified against the npm registry; Sequelize association patterns verified against official Context7-indexed docs; Apollo's own blog verified directly for upload guidance. Tree-visualization library choice is HIGH-confidence on the comparison data, but MEDIUM on the final recommendation given the unresolved spouse-pairing tradeoff (see below). |
| Features | MEDIUM | Table-stakes/anti-feature analysis draws on WikiTree/Geni/FamilySearch documentation — directionally correct but those products operate at a much larger scale (millions of contributors, public/crowd-sourced trees) than this milestone's single, small, admin-curated family; patterns are scaled down by reasoning, not directly sourced at this scale. |
| Architecture | HIGH | Grounded directly in the actual codebase (existing barrel/aggregator conventions, `server.js`, `utils/auth.js` read directly) with MEDIUM/LOW flagged inline only for self-referential Sequelize M:N query rough edges (community GitHub issues, not official docs). |
| Pitfalls | HIGH for GraphQL N+1/DataLoader, MySQL recursive-CTE, and file-upload-security patterns (official docs + multiple corroborating sources); MEDIUM for family-tree-specific dedup/permission edge cases (reasoned from the stack + domain logic, less directly documented externally). |

**Overall confidence:** MEDIUM-HIGH — the technical/architectural foundation (stack choices, data modeling, security mechanics) is HIGH confidence and largely settled; the domain-specific product logic (dedup scope, collaboration trust model, tree library fit) carries real open questions that this research deliberately surfaces rather than resolves.

### Gaps to Address

- **Tree-visualization library:** treat `@xyflow/react` + `@dagrejs/dagre` as the default, but budget an early spike validating the synthetic-union-node spouse-pairing pattern before committing the full `/family` build (Phase 6) — do not treat this as closed.
- **Sibling-dedup scope ("any one parent" vs. "both parents"):** must be explicitly decided during requirements definition, not left to whichever query gets written first in Phase 4.
- **Consent/approval mechanism for cross-subtree relationship edges (Pitfall 8):** research flags this as needed but doesn't fully specify the UX (self-approval by the target member? admin-only approval? simplest-safest = admin approval for v2.0) — needs a requirements-level decision before Phase 3 implementation.
- **`User.familyMemberId` manual ALTER step:** must be explicitly tracked as a discrete Phase 2 task with a boot-verify success criterion, not assumed to "just work" alongside the new `FamilyMember`/`FamilySpouse` tables.

## Sources

### Primary (HIGH confidence)
- npm registry (live `npm view` version/publish-date/peer-dependency checks) — `@xyflow/react`, `@dagrejs/dagre`, `multer`, `sequelize`, `@apollo/server`, and rejected alternatives (`react-d3-tree`, `family-chart`, `react-family-tree`, plain `dagre`)
- Context7 `/websites/sequelize_v6` — official self-referential `belongsTo`/`hasMany`/`belongsToMany` association patterns
- Apollo GraphQL Blog — File Upload Best Practices (https://www.apollographql.com/blog/file-upload-best-practices)
- Sequelize Model Basics — sync/alter (https://sequelize.org/docs/v6/core-concepts/model-basics/) and GitHub issue #9731 — `sync()` does not add columns to existing tables
- Percona: Introduction to MySQL 8.0 Recursive CTE (https://www.percona.com/blog/introduction-to-mysql-8-0-recursive-common-table-expression-part-2/)
- Direct repo inspection: `.planning/PROJECT.md`, `.planning/codebase/`, `backend/src/server.js`, `backend/src/utils/auth.js`, `backend/src/models/`, `docker-compose.yml`

### Secondary (MEDIUM confidence)
- WikiTree, Geni, FamilySearch Family Groups documentation — collaboration/membership-gate/dedup patterns, scaled down by reasoning from larger-scale products
- reactflow.dev examples (Dagre/ELK/Expand-and-Collapse) — official but WebFetch-summarized
- donatso/family-chart GitHub and docs site — vendor's own marketing/docs, cross-checked against npm metadata
- Sequelize self-referential M:N GitHub issue threads (#1724, #1937, #1559) — maintainer discussion, not formal docs

### Tertiary (LOW confidence)
- sixgen.org LGBTQ Genealogy Software critique — advocacy source informing the "generic parent/spouse edges, not gendered role fields" recommendation, directionally consistent but not empirically verified against this app's actual user base

---
*Research completed: 2026-07-21*
*Ready for roadmap: yes — with the tree-library spike, sibling-dedup scope question, and cross-subtree-consent mechanism flagged as open decisions for requirements definition / early implementation, not blockers to roadmap creation*
