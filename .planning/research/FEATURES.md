# Feature Research

**Domain:** Collaborative family-tree / genealogy web app (small, single-family, membership-gated — not a public "world tree")
**Researched:** 2026-07-21
**Confidence:** MEDIUM (visualization-library specifics HIGH via source docs; collaboration/permission patterns MEDIUM via WikiTree/Geni/FamilySearch documentation, which are much larger-scale products than this milestone's single-family scope — patterns are directionally correct but scaled down)

## How This Maps to the Milestone's 6 Question Areas

| # | Area | Table-stakes anchor | Biggest risk |
|---|------|---------------------|--------------|
| 1 | Member records + fields | firstname/lastname/gender required, derived fullname | Treating optional PII fields (address, phone) as required |
| 2 | Relationship modeling | Directed parent↔child + undirected spouse, derived siblings | Modeling siblings as a stored edge instead of a derived query |
| 3 | Deep tree visualization | Pan/zoom + spouse-adjacent rendering + search-to-locate | Picking an org-chart library (no native spouse concept) instead of a family-tree-native one |
| 4 | Collaborative multi-user editing | Self-scoped "edit my immediate relatives" + admin whole-tree | Building real-time sync or approval workflows nobody asked for |
| 5 | Membership-gated access | register → verify → **pending** → admin links to member node | Letting users self-claim a member node (identity-fraud risk) |
| 6 | Duplicate prevention | Sibling-firstname-uniqueness as the *prevention* guard | Building WikiTree-style merge tooling as a *cure* — not requested, high cost |

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Category | Why Expected | Complexity | Auth/Existing-System Dependency |
|---------|----------|--------------|------------|----------------------------------|
| Required firstname/lastname/gender, derived fullname | 1. Member records | Every genealogy tool (GEDCOM, FamilySearch, WikiTree) treats name + sex as the minimum identifying record | LOW | New Sequelize model; no dependency on existing `User` model — this is a separate `Member` entity |
| Optional biographical fields (mothersname, email, birthdate, deathdate, phone, address) | 1. Member records | Standard genealogy fields — birth/death dates and place are the baseline GEDCOM record beyond name/sex | LOW–MEDIUM | None; deathdate presence doubles as an implicit living/deceased flag, useful later for privacy rules (not required this milestone since app is membership-gated, not public) |
| Profile photo per member | 1. Member records | Users expect faces in a tree; every genealogy product (Geni, MyHeritage, FamilySearch) supports a profile photo | MEDIUM | New backend file upload route + Docker volume mount (per PROJECT.md); reuse existing Express app, not existing auth per se, but the upload route must reuse `requireAuth`-style guard |
| Directed parent→child link + undirected spouse link | 2. Relationships | Confirmed by genealogy-software data-model research: minimum viable family graph is (a) directed parent-child edges, (b) undirected spousal edges | MEDIUM | Bidirectional consistency required at write time (add-parent-to-child must add-child-to-parent in the same transaction) — new logic, no auth dependency |
| Siblings **derived** from shared parent(s), never stored | 2. Relationships | Every genealogy data model treats siblings as computed, not authored, to avoid a second source of truth that can drift from the parent graph | LOW–MEDIUM | Query design only; because half-siblings/multiple-marriages are explicitly deferred, "any shared parent = sibling" is an acceptable simplification for this milestone |
| Pan + zoom on the tree canvas | 3. Visualization | Baseline expectation once a tree exceeds ~10–15 nodes; every surveyed library (family-chart, react-d3-tree, js_family_tree) ships this out of the box | LOW–MEDIUM | Delegated to chosen library; no backend dependency |
| Spouses rendered adjacent to their partner (not as another generation) | 3. Visualization | A *family* chart, unlike an *org* chart, must show couples side-by-side — this is the single biggest library-selection criterion | MEDIUM–HIGH (library-dependent) | None on auth; strongly constrains library choice (see Sources below) |
| Search-to-locate a person by name | 3. Visualization | Table stakes once a tree is "deep" (explicitly required this milestone) — users cannot visually scan 50+ nodes | MEDIUM | Needs a name index endpoint + library API to center/highlight a node; no auth dependency beyond standard `requireAuth` on the query |
| Self-service edit of **own immediate relatives** on `/manage` | 4. Collaboration | This is the stated core value prop of the milestone; comparable to Geni's "collaborators can edit profiles they're connected to" model | MEDIUM–HIGH | **New auth primitive needed.** Existing `requireAuth`/`requireAdmin` (`backend/src/utils/auth.js`) are binary role gates; this needs a *relationship-scoped* guard (e.g., "is the target member node the caller's own node, or a parent/spouse/child/sibling of it?") — extends, doesn't replace, existing utils |
| Admin edits the **whole tree** | 4. Collaboration | Standard "root/admin can edit everything" pattern seen in every collaborative genealogy tool (WikiTree, Geni, FamilySearch group admins) | LOW–MEDIUM | Directly reuses existing `requireAdmin` — no new primitive needed |
| Visible editable-members list | 4. Collaboration + 6. Dedup | Transparency into shared data is standard in collaborative tools (WikiTree shows "who else can edit this profile"); also doubles as the human backstop for spotting duplicates | LOW–MEDIUM | Simple authenticated query (`requireAuth`), no new primitive |
| Register → email-verify → **inactive/pending** until admin links to a member node | 5. Membership gate | Matches FamilySearch's "family group" model: join requests must be approved by a group admin before participation | MEDIUM | Builds directly on v1.1's email-verification work; needs a **new account state** (`pending`) beyond today's binary verified/unverified, and a `memberId` FK on `User` |
| Admin UI: link one unlinked user account to one unlinked member node | 5. Membership gate | Mirrors FamilySearch/FamilyTreeDNA admin-approval flows, scaled to a 1:1 person↔account link instead of a group join | MEDIUM | Reuses `requireAdmin`; needs new resolver + uniqueness constraint (one user ↔ one member, enforced at the DB layer) |
| "Pending" gate page for unlinked-but-verified users | 5. Membership gate | Standard "your request is awaiting approval" UX pattern (FamilySearch shows this exact state for join requests) | LOW | Extends existing `ProtectedRoute.jsx` redirect pattern with a third state (authenticated-but-unlinked → `/pending`) instead of just two (authenticated/not) |
| Sibling-firstname-uniqueness validation at write time | 6. Dedup | Explicit milestone requirement; functionally equivalent to a lightweight version of what WikiTree calls "duplicate checking before merge is needed" — prevention instead of cure | LOW–MEDIUM | Resolver-level check scoped to a specific parent-set (siblings sharing a parent), not global; no auth dependency beyond standard mutation guards |

### Differentiators (Competitive Advantage / Nice-to-Have Beyond MVP)

| Feature | Category | Value Proposition | Complexity | Notes |
|---------|----------|--------------------|------------|-------|
| Collapse/expand branches | 3. Visualization | Improves usability on very deep trees by letting a viewer hide distant branches; several libraries (react-d3-tree, js_family_tree, D3 pedigree examples) ship this natively | LOW–MEDIUM | Not explicitly requested this milestone but cheap if the chosen library supports it out of the box — recommend enabling if free, don't build custom if the library lacks it |
| Re-root / "focus on this person" view | 3. Visualization | Lets a user see only their own line rather than the whole family; `react-family-tree` supports this cheaply via changing a `rootId` prop and re-deriving the visible subgraph | MEDIUM | Genuinely useful for large trees but adds a second navigation mode beyond the default full-tree view — good v1.x candidate, not MVP |
| Per-field edit history / audit log ("who changed grandma's birthdate") | 4. Collaboration | Builds trust in a collaboratively-edited dataset; every large genealogy platform (WikiTree, FamilySearch) has this because disputes over facts are common | MEDIUM–HIGH | Valuable long-term but orthogonal to this milestone's core value prop (self-service immediate-relative editing); defer until real edit conflicts are observed |
| Admin merge tool for accidental duplicates (union relationships/fields from two profiles into one) | 6. Dedup | Standard on WikiTree/Geni at their scale (millions of contributors, duplicates are inevitable) | HIGH | Explicitly not in this milestone's target features (only sibling-uniqueness prevention is scoped); the small, bounded, admin-curated tree here makes prevention sufficient — build only if duplicates are observed in practice |

### Anti-Features (Commonly Requested, Often Problematic — Avoid This Milestone)

| Feature | Category | Why It Seems Appealing | Why Problematic Here | Alternative |
|---------|----------|------------------------|------------------------|-------------|
| Real-time collaborative editing (live multi-cursor sync, like Google Docs) | 4. Collaboration | "Collaborative" in the milestone name makes this feel implied | Requires websockets/OT/CRDT infrastructure disproportionate to a single small family's tree size; existing app has zero real-time infra (stateless JWT, plain axios request/response) | Keep the existing request/response GraphQL pattern; refetch on mutation. Scoped-write conflicts (two people editing the same parent link) are rare at family scale and can be handled with simple last-write-wins |
| Approval workflow for a relative's edits before they apply (e.g., "your sibling proposed a change to your record, approve it?") | 4. Collaboration | Feels safer / more "correct" for shared data | Doesn't match the stated model — the design already scopes writes to "my immediate relatives," which is the safety mechanism. Layering an approval queue on top adds a second, redundant permission system | Enforce correctness via scoped write permissions (only touch nodes within one hop of your own), not a review queue |
| Self-service "claim this member node" (search the tree, request to be linked to a specific pre-existing node without admin mediation) | 5. Membership gate | Reduces admin workload; feels more "self-service" and modern | Identity-fraud risk — anyone could claim to be "Uncle Robert" and gain edit rights over his relationships; the milestone explicitly specifies admin-mediated linking for this reason | Keep linking strictly admin-initiated; optionally let a user *request* a link (admin still approves) as a v1.x nicety, never auto-approve |
| Auto-provisioning a member node on registration | 5. Membership gate | Simpler onboarding — no admin bottleneck | Bypasses the "admin curates a deduped, accurate genealogy" model entirely; would immediately create duplicate-member risk and defeat the sibling-uniqueness guard's purpose | Registration creates a `User` only; a member node is either pre-seeded by an admin or created by an admin as part of the linking step |
| Global fuzzy-matching duplicate detection across the whole tree (WikiTree/Geni "world tree" style) | 6. Dedup | Sounds like the "proper" genealogy-software way to prevent duplicates | This app has one bounded, admin-curated family — not thousands of independently-contributed trees. Fuzzy matching solves a problem (independent strangers entering the same ancestor) this app doesn't have | Sibling-firstname-uniqueness (already scoped) plus the visible editable-members list is sufficient prevention at this scale |
| Full non-binary/relationship-type generality (co-parents without marriage, adoptive vs. biological distinction, multiple concurrent spouses, half-sibling distinction) | 2. Relationships | "More inclusive/accurate modeling" is generally good practice per LGBTQ-genealogy-software critiques found in research | Explicitly deferred by PROJECT.md ("full genealogy... deferred to a later milestone"); building it now is scope creep against an explicit milestone boundary | Model gender as a required field but keep parent/spouse edges type-agnostic (don't hardcode "father"/"mother" labels — use generic "parent" edges) so this remains extensible without rework later |
| GEDCOM import/export | 1/2/6 | "Standard" genealogy interop format, feels like it should be there from day one | Explicitly deferred by PROJECT.md; meaningful complexity (GEDCOM 5.5.1 parsing/serialization) for a feature with no current user demand | Defer; if ever needed, treat as an isolated import/export module that maps to/from the existing Member/Relationship schema |

---

## Feature Dependencies

```
Member CRUD (fields, model)
    └──requires──> nothing new (independent of existing User/auth model)

Relationship modeling (parent/child/spouse)
    └──requires──> Member CRUD (edges reference member ids)

Derived siblings
    └──requires──> Relationship modeling (computed from shared-parent query)

Sibling-firstname-uniqueness guard (dedup)
    └──requires──> Relationship modeling (must know the sibling set to validate against)

Tree visualization (/family)
    └──requires──> Member CRUD + Relationship modeling (no data to render without both)

Photo upload
    └──enhances──> Member CRUD (optional field, not a hard dependency)

Membership-gated access (pending state)
    └──requires──> existing email verification (v1.1)
    └──requires──> Member CRUD (an admin needs member nodes to link accounts to)

Self-service /manage (edit own immediate relatives)
    └──requires──> Membership-gated access (must know "my" member node to scope edits)
    └──requires──> Relationship modeling (the thing being edited)

Admin whole-tree management + account linking
    └──requires──> existing requireAdmin (backend/src/utils/auth.js)
    └──requires──> Member CRUD + Membership-gated access

Visible editable-members list
    └──enhances──> Self-service /manage (lets a user orient themselves in the roster)
    └──enhances──> Dedup (human backstop for spotting duplicates admin/uniqueness-guard missed)

Collapse/expand, re-root (differentiators)
    └──enhances──> Tree visualization (not required for it to function)

Real-time collaborative editing ──conflicts──> existing stateless request/response architecture
Self-service node-claiming ──conflicts──> admin-mediated linking (milestone's explicit design)
```

### Dependency Notes

- **Self-service `/manage` requires Membership-gated access:** the resolver scoping logic ("can this user edit this node?") needs to resolve "which member node is *me*?" first — that mapping only exists once an admin has linked the account. Build the account↔member link (and the `pending` gate) before wiring up self-service edit resolvers, or the scoping check has nothing to check against.
- **Relationship modeling requires Member CRUD:** parent/spouse/child edges are foreign-key pairs between member records; the member table and its required fields must exist first.
- **Derived siblings requires Relationship modeling, not the reverse:** siblings must never be a stored table — computing them from shared-parent edges is what keeps this milestone's simplification ("any shared parent = sibling," since half-siblings are deferred) internally consistent. If a stored `Sibling` join table is introduced later by mistake, it becomes a second source of truth that can drift from the parent graph.
- **Real-time collaborative editing conflicts with the existing architecture:** the whole stack (stateless JWT, plain axios request/response, no websocket layer) is built around simple request/response GraphQL. Retrofitting live multi-user sync would touch server.js, the client, and add new infrastructure — disproportionate to a small family's collaboration needs.
- **Self-service node-claiming conflicts with admin-mediated linking:** these are two different trust models for the same operation (who decides "this account = this person"). The milestone has already chosen admin-mediated; don't build both.

---

## MVP Definition

### Launch With (this milestone, v2.0)

- [ ] Member model: firstname*, lastname*, gender* (required), derived fullname, mothersname, email, birthdate, deathdate, phone, address, profilePicture — table stakes, no user trusts a family tree missing basic vitals
- [ ] Parent↔child + spouse relationships, siblings derived from shared parents — the entire value of a "tree" is the graph, not the records
- [ ] Sibling-firstname-uniqueness guard — the cheapest possible dedup prevention, must exist before any tree grows past a handful of members
- [ ] `/manage`: self-service edit of own immediate relatives (parents, spouse, children, siblings) — the stated core value proposition of this milestone
- [ ] Admin: whole-tree management + account↔member linking — required to bootstrap membership-gated access at all
- [ ] Membership gate: register → verify (existing) → pending → admin-linked — this *is* the access model; nothing else in the milestone works without it
- [ ] `/family`: pan/zoom deep tree, spouses shown adjacent, search-to-locate — explicitly named in the milestone goal
- [ ] Visible editable-members list — cheap, doubles as dedup backstop and self-service orientation aid
- [ ] Photo upload to Docker volume — explicitly named target field, moderate cost, high perceived value

### Add After Validation (v2.x)

- [ ] Collapse/expand on the tree canvas — add once real trees are deep enough that full-expand becomes visually noisy
- [ ] Re-root/focus-on-a-person view — add once users report wanting to see "just my branch"
- [ ] Per-field edit history/audit log — add once multiple editors on the same node produce a real dispute or confusion
- [ ] Self-service request-to-link (still admin-approved) — add if admin linking becomes a workflow bottleneck

### Future Consideration (v3+, already flagged Out of Scope in PROJECT.md)

- [ ] Invitation links (email + WhatsApp) — defer until the admin-bootstrapped membership base is established
- [ ] Full genealogy generality (multiple marriages, half-siblings, adoption) — defer until the simplified "any shared parent = sibling" model demonstrably breaks down
- [ ] GEDCOM import/export — defer until there's a concrete need to interoperate with another genealogy tool
- [ ] Admin merge tooling for duplicates — defer unless the uniqueness guard proves insufficient in practice
- [ ] Object-storage photos (S3-style) — defer; Docker volume is sufficient at this scale
- [ ] Browser E2E tests for the family-tree flows — defer per existing project-wide E2E deferral

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Member model + required fields | HIGH | LOW | P1 |
| Parent/child + spouse relationships | HIGH | MEDIUM | P1 |
| Derived siblings | HIGH | LOW–MEDIUM | P1 |
| Sibling-firstname-uniqueness guard | MEDIUM | LOW–MEDIUM | P1 |
| Membership gate (pending → admin-linked) | HIGH | MEDIUM | P1 |
| `/manage` self-service immediate-relative editing | HIGH | MEDIUM–HIGH | P1 |
| Admin whole-tree management + linking | HIGH | LOW–MEDIUM | P1 |
| `/family` pan/zoom tree, spouse-adjacent rendering | HIGH | MEDIUM–HIGH | P1 |
| Search-to-locate on tree | MEDIUM | MEDIUM | P1 |
| Visible editable-members list | MEDIUM | LOW–MEDIUM | P1 |
| Profile photo upload | MEDIUM | MEDIUM | P1 |
| Collapse/expand | MEDIUM | LOW–MEDIUM | P2 |
| Re-root/focus-on-person | MEDIUM | MEDIUM | P2 |
| Edit history/audit log | MEDIUM | MEDIUM–HIGH | P3 |
| Admin merge tooling | LOW (given prevention guard exists) | HIGH | P3 |
| Invitations (email/WhatsApp) | HIGH (future) | MEDIUM–HIGH | P3 (deferred by PROJECT.md) |
| GEDCOM import/export | LOW (no current demand) | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone (v2.0)
- P2: Should have, first candidate for v2.x
- P3: Nice to have / explicitly deferred

---

## Competitor Feature Analysis

| Feature | WikiTree (public, world-tree, wiki-style) | Geni (public/private, collaborative) | FamilySearch Family Groups (private, admin-approved) | Our Approach |
|---------|---------------------------------------------|----------------------------------------|----------------------------------------------------------|--------------|
| Who can edit a person | Any registered user can propose edits; disputes resolved via profile "managers" | Collaborators have full edit access to public profiles they're connected to in a project; private profiles need a "profile manager" | Members of the group edit shared/group data; personal tree stays private unless copied into the group tree | Self: own immediate relatives only. Admin: everyone. No public/wiki-style open editing — smaller trust surface fits a single-family app |
| Joining/linking to the tree | Open registration, anyone can search/add themselves | Open registration; connecting to existing profiles is user-initiated | Invitation-only; admin approves join requests before participation | Registration open, but **account access is gated**: verified but unlinked accounts sit in `pending` until an admin links them to a member node — closer to FamilySearch's admin-approval model than WikiTree/Geni's open model |
| Duplicate handling | Dedicated merge tooling; duplicates are expected at scale (millions of contributors) | Dedicated "Merge This Profile" tooling; same rationale | Not heavily documented (smaller, curated groups) | Prevention only (sibling-firstname-uniqueness) — no merge tooling this milestone, because the tree is small and admin-curated, not crowd-contributed |
| Tree visualization | Standard pedigree/tree view, deep trees common (world tree) | Rich family-tree visualization with drag/explore | Standard Family Tree view (FamilySearch's global tree) | Purpose-built pan/zoom deep tree at `/family`, library chosen specifically for native spouse-adjacent rendering (see Sources) |
| Non-traditional family structures | Documented critique: hetero-centric defaults ("father"/"mother" labels) are a known pain point | Similarly hetero-centric by default per general genealogy-software critique | Same category of critique applies broadly to genealogy software | Model relationships as generic "parent"/"spouse" edges (not "father"/"mother" fields) so the schema doesn't need rework when full genealogy generality is tackled later — cheap to do now, expensive to retrofit |

---

## Sources

- [Genealogy software — Wikipedia](https://en.wikipedia.org/wiki/Genealogy_software) — baseline data-model description (name/sex/relationships/dates), MEDIUM confidence
- [The Family Tree Data Model — FamilySearch Developers](https://developers.familysearch.org/main/docs/the-family-tree-data-model) — couple relationships vs. child-and-parents relationships as the two core relationship types, HIGH confidence (official docs)
- [GEDCOM: The Essential File Format for Genealogy Data](https://genomelink.io/blog/gedcom-the-essential-file-format-for-genealogy-data) — GEDCOM 5.5.1 as baseline interop standard, MEDIUM confidence
- [family-chart (GitHub, donatso)](https://github.com/donatso/family-chart) and its [data-format.md](https://github.com/donatso/family-chart/blob/master/docs/data-format.md) — D3-based, framework-agnostic (React-compatible), native `parents`/`spouses`/`children` arrays per person, gender-aware layout, zoom/pan built in — HIGH confidence (read directly from source docs)
- [react-family-tree (npm/GitHub, SanichKotikov)](https://www.npmjs.com/package/react-family-tree) — `rootId` prop enables cheap re-rooting/focus-on-person by re-deriving the visible subgraph — MEDIUM confidence (search-derived, not directly fetched)
- [react-d3-tree (GitHub, bkrem)](https://github.com/bkrem/react-d3-tree) — collapsible hierarchical tree, but is an *org-chart*-style layout without a native spouse concept — MEDIUM confidence; flagged as a poorer fit than family-chart for this milestone's "show spouses" requirement
- [WikiTree Help:Merging](https://www.wikitree.com/wiki/Help:Merging) and [Matching and Merging FAQ](https://www.wikitree.com/wiki/Help:Matching_and_Merging_FAQ) — merge-as-cure pattern at world-tree scale, MEDIUM confidence
- [Geni: How do I merge duplicate profiles?](https://help.geni.com/hc/en-us/articles/229705547-How-do-I-merge-duplicate-profiles) and [How can a stranger edit my tree?](https://help.geni.com/hc/en-us/community/posts/222067587-How-can-a-stranger-edit-my-tree-And-can-I-stop-her-from-doing-it-again) — collaborative-editing trust model (collaborators can edit public profiles they're connected to), MEDIUM confidence
- [FamilySearch: Approve join requests for a family group](https://www.familysearch.org/en/help/helpcenter/article/approve-join-requests-for-a-family-group) and [Invite people to join a family group](https://www.familysearch.org/en/help/helpcenter/article/invite-people-to-join-a-family-group) — admin-approval membership-gate pattern closest to this milestone's design, MEDIUM confidence
- [sixgen.org — LGBTQ Genealogy & Software, Part 1](https://sixgen.org/lgbtq-genealogy-software-part-1/) and [Part 3](https://sixgen.org/lgbtq-genealogy-software-part-3/) — critique of hetero-centric "father"/"mother" data modeling, informs the "generic parent/spouse edges, not gendered role fields" recommendation — MEDIUM confidence (advocacy source, but directionally consistent with modern genealogy-software critiques)
- Existing codebase: `backend/src/utils/auth.js` (`requireAuth`, `requireAdmin`), `frontend/src/components/ProtectedRoute.jsx` — read directly, HIGH confidence, basis for all "auth/existing-system dependency" notes above

---
*Feature research for: Collaborative family-tree domain (v2.0 milestone)*
*Researched: 2026-07-21*
