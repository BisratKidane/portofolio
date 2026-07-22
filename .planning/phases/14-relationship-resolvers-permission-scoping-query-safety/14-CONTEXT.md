# Phase 14: Relationship Resolvers, Permission Scoping & Query Safety - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Members can add and edit only their immediate relatives — parents, spouse, children, and
derived siblings — with the editable scope computed and enforced **entirely server-side**,
resistant to relationship-edit privilege escalation, and safe against N+1 fan-out and
unbounded query depth on the now-recursive schema.

**Requirements:** MEM-04, REL-04, PERM-01, PERM-02, PERM-03, PERM-04, PERM-05

**In scope:** the family-domain mutation surface (add relative, edit member), the
server-side editable-scope utility, sibling derivation, the anti-escalation guard,
request-scoped DataLoader batching, and a GraphQL depth-limit validation rule.

**Out of scope:** the `/family` pan/zoom tree visualisation (later phase), the member→admin
removal-request flow (deferred to v2 per PERM-03), photo upload, and any frontend `/manage`
screen work beyond what the resolvers require.

</domain>

<decisions>
## Implementation Decisions

### Cross-subtree attachment (the SC-4 security boundary)

- **D-01 — Create-new-only for member-users:** When a member-user adds a relative
  (parent, spouse, or child), the mutation **always creates a NEW bare member node** and
  links it. Attaching to a pre-existing member node is **admin-only**. This closes the
  privilege-escalation vector at the source: no member action can pull an existing node —
  and therefore an existing subtree — into their editable scope.
  Duplicate nodes (two relatives who both join independently) are an accepted trade-off,
  resolved by an admin later. Admins retain full attach/merge power (PERM-04).

- **D-02 — Existing-node references are allowed, but only within the actor's own scope:**
  A member may reference an existing node id in a relative-add **if and only if** that node
  is already in their computed editable set. This makes everyday actions work — "add my
  child, with my existing spouse as the other parent", "add a sibling sharing my existing
  mother" — without opening the boundary.

  **Resulting invariant (state this in the plan and test it directly):**
  > A member may only wire together nodes they already control. Their scope grows **only**
  > by creating new nodes, never by referencing existing ones.

  Any referenced id outside the actor's editable set is rejected. This is the invariant the
  SC-4 adversarial test must attack.

### Sibling derivation (REL-04)

- **D-03 — Sibling = shares *either* parent:** A sibling is any other member sharing a
  non-null `motherId` **or** a non-null `fatherId`. Never stored as an edge — always
  derived. Chosen because data arrives incrementally (one parent is often recorded first),
  so an either-parent rule keeps siblings resolvable when only one parent is known, and
  half-siblings fall out naturally without modelling them explicitly.
  Note: half-vs-full is **not** distinguished or exposed this phase — full genealogy
  (half-siblings, multiple marriages, adoptions) is deferred to a later milestone.

- **D-04 — Adding a sibling with no parent recorded is rejected, with guidance:** Since
  "add a sibling" is really "create a member sharing my parent", it is impossible when the
  actor has neither parent recorded. Reject with an actionable message
  (e.g. *"Add a parent first — siblings are derived from a shared parent."*) rather than
  fabricating a placeholder parent. Placeholder auto-creation was explicitly rejected: it
  injects a person nobody created, hands both siblings edit rights over them, and collides
  with `firstname`/`lastname`/`gender` being `NOT NULL` on `family_members`.

### Edit scope granularity (PERM-02)

- **D-05 — Add-only; members may not rewire or remove existing edges:** A member-user may
  edit plain fields on in-scope members and **add** new edges (new parent/spouse/child), but
  may **not** change or remove an existing edge (`motherId`, `fatherId`, or a spouse row).
  Re-parenting relocates an entire subtree and is the second escalation vector after
  attachment; keeping it admin-only leaves the boundary airtight and avoids TOCTOU/ordering
  cases where scope is recomputed mid-edit.
  Members may not delete any member (PERM-03). Admins may add, edit, rewire, and remove
  anywhere in the tree (PERM-04).

- **D-06 — All family fields editable on in-scope relatives, EXCEPT relatives who have their
  own linked user account:** If the target member has no linked user, every family field is
  collaboratively editable by an in-scope relative. If the target **has** a linked user
  account, the record is field-locked to that person and to admins — a relative cannot
  overwrite the details of someone who has joined and manages their own profile.
  **Corollary:** a linked member is always able to edit their own record; self is part of the
  editable set.
  A per-field permission matrix was considered and rejected as unnecessary complexity that
  would also block fixing genuine typos in a relative's name.

### Query safety (SC-5)

- **D-07 — Request-scoped DataLoader:** Add the `dataloader` dependency and construct
  per-request loaders (e.g. `memberById`, `childrenByParentId`, `spousesByMemberId`) in the
  Apollo `context` factory in `backend/src/server.js`, alongside the existing per-request
  `models` / `user`. Resolvers batch through the loaders so resolved SQL query count stays
  flat as tree depth grows. Loaders MUST be created per request (never module-level) so no
  cache leaks across users — this matters because the loaders sit behind a permission
  boundary.

- **D-08 — GraphQL depth limit of 100, rejected at validation:** Register a
  `graphql-depth-limit`-style validation rule with a max depth of **100**. Over-depth queries
  are rejected as a validation error before any resolver runs (zero DB cost).
  **Intent:** 100 is a *pathological-recursion backstop* — it exists to kill infinitely
  nested hand-crafted queries, not to tune performance. DataLoader (D-07) is what keeps cost
  flat at realistic depths. The generous ceiling deliberately leaves headroom for the deep
  pan/zoom `/family` view in a later phase.
  Implement the value as a **named, env-overridable constant** (not a magic number inline)
  so it can be tightened later without a code change.

### Cross-cutting (carried forward — not re-decided)

- **D-09 — TDD red-green-refactor is mandatory** (QUAL-01 / project standard, carried from
  P12 D-11 and P13 D-09). Every behaviour-adding task ships a failing test first. The
  adversarial SC-4 test and the exclusion tests in SC-3 are the centrepiece of this phase.
- **D-10 — Phase 12 relationship semantics stand as-is:** one canonical spouse join row per
  couple with normalised ordering (P12 D-01), multiple spouse edges allowed (P12 D-02), the
  "married-in" delete rule (P12 D-03), and two nullable self-FK parent columns (P12 D-05).
  The existing `wouldCreateCycle` guard must be reused, not reimplemented.
- **D-11 — `requireFamilyAccess` = linked member OR ADMIN** (P13 D-06) remains the gate for
  every family-domain operation.

### Carried-over defect to close in this phase

- **WR-04 (from Phase 13 code review, deferred):** the `dashboard` resolver still uses
  `requireAuth` only, not `requireFamilyAccess`. Phase 13's verifier explicitly flagged this
  as needing attention in Phase 14, since this phase introduces the first real member-facing
  relationship resolvers. **Every new family-domain resolver in this phase must be gated, and
  the existing `dashboard` resolver should be brought in line.**
  See `.planning/phases/13-membership-gating-account-linking/deferred-items.md`.

### Claude's Discretion

The planner and executor decide these — they were not raised as user preferences:

- Mutation naming and signature shapes (`addParent`/`addChild`/`addSpouse`/`addSibling` as
  separate mutations vs. one `addRelative` with a relationship-kind enum).
- Where the editable-scope utility lives (`backend/src/utils/` guard-style vs.
  `backend/src/services/familyMember.service.js` alongside the existing helpers) — but
  PERM-05 requires it be **a single, reused server-side utility**, not logic duplicated
  per resolver.
- The exact SQL/ORM shape of the scope computation (one query with OR-groups vs. several
  batched lookups), provided the result is correct and does not itself N+1.
- Whether to expose a read-only `myEditableMembers`-style query so the UI can grey out
  non-editable nodes (useful, but not required by any Phase 14 requirement).
- Error message wording and GraphQL error shape conventions.
- Test fixture design for the deep-tree/query-count assertion, and how query count is
  measured (e.g. Sequelize logging hook vs. a query counter).
- Whether the depth-limit rule comes from the `graphql-depth-limit` package or an equivalent
  validation rule.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & goal
- `.planning/ROADMAP.md` § "Phase 14: Relationship Resolvers, Permission Scoping & Query Safety" — goal + the 5 success criteria this phase is graded against
- `.planning/REQUIREMENTS.md` — MEM-04, REL-04, PERM-01…PERM-05 wording and the requirement→phase map
- `.planning/PROJECT.md` § "Current Milestone: v2.0 Collaborative Family Tree" — milestone scope, and what is explicitly deferred (full genealogy, inline tree editing)

### Prior-phase locked decisions (do not re-litigate)
- `.planning/phases/12-family-data-model-foundation/12-CONTEXT.md` — D-01…D-13: spouse storage shape, parent columns, `mothersname`, validation strictness
- `.planning/phases/13-membership-gating-account-linking/13-CONTEXT.md` — D-01…D-10: the membership gate, `requireFamilyAccess`, link-column semantics
- `.planning/phases/13-membership-gating-account-linking/deferred-items.md` — **WR-04** (dashboard gating gap) is in scope to close here; WR-02 and the INFO items are not

### Existing code this phase builds on
- `backend/src/services/familyMember.service.js` — `wouldCreateCycle`, `linkParent`, `addChild`, `setSpouse`, `getSpouseRows`, `deleteMember` (Phase 12). **Reuse, do not reimplement.**
- `backend/src/models/index.js` — the association block: `mother`/`father` self-FKs, `Spouse` join pair, `User.belongsTo(FamilyMember)`
- `backend/src/models/FamilyMember.js` / `backend/src/models/Spouse.js` — field definitions, normalised spouse ordering hook, `notSelfMarriage` validation
- `backend/src/utils/auth.js` — `requireAuth`, `requireAdmin`, `requireFamilyAccess`
- `backend/src/resolvers/familyMember.resolver.js` + `backend/src/schemas/familyMember.schema.js` — the existing guarded query surface to extend
- `backend/src/server.js` — the Apollo `context` factory where per-request DataLoaders and the depth-limit validation rule get wired in

### Project conventions
- `CLAUDE.md` — coding conventions, error-handling style (throw plain `Error` from resolvers), ESM + workspace constraints
- `.planning/codebase/TESTING.md` — test layout and fixture conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`familyMember.service.js` (Phase 12)** — `linkParent`, `addChild`, `setSpouse`, and
  `deleteMember` already encapsulate the edge-writing mechanics, and `wouldCreateCycle`
  already prevents ancestor loops. Phase 14 should layer **permission checks** on top of
  these rather than writing new edge logic.
- **`requireFamilyAccess` / `requireAdmin` (Phase 13)** — the guard pattern is established:
  synchronous throw at the top of the resolver body, before any other work.
- **Normalised `Spouse` ordering hook** — `memberAId`/`memberBId` are swapped into canonical
  order on `beforeValidate`, with a UNIQUE index on the pair. Spouse-edge dedup is free.
- **Transaction pattern** — `models.User.sequelize.transaction(...)` is now established in
  `linkUserToMember` (Phase 13 WR-01 fix); multi-step relationship writes should follow it.

### Established Patterns
- Barrel aggregation: new schema/resolver modules register in
  `backend/src/schemas/index.js` and `backend/src/resolvers/index.js`.
- Resolvers throw plain `Error` with user-facing messages; Apollo surfaces them.
- Per-request Apollo `context` already carries `models` and the resolved `user` — the natural
  seam for DataLoaders (D-07).
- Tests are colocated (`*.test.js` beside the module) and run under Vitest; the backend suite
  is at 195 tests and must stay green.

### Integration Points
- **`backend/src/server.js` `context` factory** — add per-request loaders here (D-07).
- **Apollo `validationRules`** — add the depth-limit rule at server construction (D-08).
- **`backend/src/resolvers/familyMember.resolver.js`** — extend from queries-only to the
  mutation surface; every operation gated per D-11.
- **`dashboard` resolver** — tighten `requireAuth` → `requireFamilyAccess` (WR-04).

</code_context>

<specifics>
## Specific Ideas

- The SC-4 adversarial test should attack the D-02 invariant directly: a member-user attempts
  to reference an existing node **outside** their editable set (a stranger's linked member,
  and a grandparent) as a relative endpoint, and is rejected.
- SC-3's exclusion tests were named explicitly in the roadmap and must be covered as stated:
  **grandparent, cousin, and sibling-of-sibling** are all excluded from the editable set,
  alongside the inclusions (parents, spouse, children, siblings, self).
  Note "sibling-of-sibling" is a genuinely tricky case under D-03's either-parent rule — a
  half-sibling's other-side sibling is *not* in scope — and deserves a dedicated test.
- The depth-limit constant should be named and env-overridable rather than inline (D-08).

</specifics>

<deferred>
## Deferred Ideas

- **Member→admin removal-request flow** — a member requesting deletion of a member they
  cannot remove themselves. Explicitly deferred by PERM-03 to a later milestone.
- **Admin-approval queue for attaching to existing nodes** — considered as an alternative to
  D-01; rejected for this phase because it adds a request/approval model + UI and overlaps
  the deferred PERM-03 request flow. If duplicate nodes become a real problem in practice,
  this is the natural follow-up.
- **Half-vs-full sibling distinction exposed in the schema** — considered under D-03;
  deferred with the rest of full genealogy (multiple marriages, half-siblings, adoptions) to
  a later milestone.
- **`myEditableMembers` read-only query for UI affordances** — surfaced as a candidate but not
  required by any Phase 14 requirement; left to Claude's Discretion / a `/manage` UI phase.
- **Admin delete + orphan-handling semantics** beyond the existing Phase 12 "married-in" rule
  — not raised in this discussion; the Phase 12 `deleteMember` behaviour stands.
- **Phase 13 WR-02** (`unlinkedUsers` includes admins and unverified users) and the three
  INFO items — remain deferred; see `deferred-items.md`. Only WR-04 is pulled into Phase 14.

</deferred>

---

*Phase: 14-relationship-resolvers-permission-scoping-query-safety*
*Context gathered: 2026-07-22*
