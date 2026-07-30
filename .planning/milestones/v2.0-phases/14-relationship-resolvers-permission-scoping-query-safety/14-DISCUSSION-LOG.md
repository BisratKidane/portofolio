# Phase 14: Relationship Resolvers, Permission Scoping & Query Safety - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 14-relationship-resolvers-permission-scoping-query-safety
**Areas discussed:** Cross-subtree attachment, Sibling derivation + add, Edit scope granularity, Query safety

---

## Cross-subtree attachment

### Q1 — When a member-user adds a relative, what may they attach to?

| Option | Description | Selected |
|--------|-------------|----------|
| Create-new-only | Member may only create a NEW bare member as their relative; attaching to any pre-existing node is admin-only | ✓ |
| Existing-if-unlinked | May attach to an existing node only if it has no linked user account | |
| Admin-approval queue | May request attachment to any existing member; pending until an admin approves | |

**User's choice:** Create-new-only
**Notes:** Closes the escalation vector completely and makes the SC-4 adversarial test trivial
to state. Duplicate nodes accepted as the trade-off, resolved by an admin later.
Admin-approval queue was additionally unattractive because PERM-03 already defers the
member→admin request flow to v2 — building one here would be scope creep.

### Q2 — May a member reference an EXISTING node already inside their own editable scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — own scope only | May reference existing nodes already in the computed editable set; anything outside is rejected | ✓ |
| No — strictly new nodes | Every relative-add creates brand-new nodes with no existing-node references at all | |

**User's choice:** Yes — own scope only
**Notes:** Raised because a strict reading of create-new-only would have blocked a legitimate
everyday action — "add my child, with my existing spouse as the other parent" — and would have
duplicated the spouse on every child, fragmenting the tree. Resulting invariant: *a member may
only wire together nodes they already control; scope grows only by creating new nodes, never by
referencing existing ones.* This became the invariant the SC-4 adversarial test attacks.

---

## Sibling derivation + add

### Q1 — What counts as a sibling for derivation and editable scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Share either parent | Anyone sharing a non-null motherId OR fatherId | ✓ |
| Share both parents | Full siblings only — both parents must match and be non-null | |
| Either parent, flagged | Share either parent, plus a derived full/half indicator exposed in the schema | |

**User's choice:** Share either parent
**Notes:** Data arrives incrementally and one parent is often recorded first, so an
either-parent rule keeps siblings resolvable when only one parent is known. Half-siblings fall
out naturally without extra modelling. The "flagged" variant was declined — the milestone
defers half-sibling genealogy to a later version, so exposing the distinction now is premature.

### Q2 — What happens when a member adds a sibling but has NO parent recorded?

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with guidance | Reject with a clear "add a parent first" message | ✓ |
| Auto-create placeholder parent | Silently create a bare placeholder parent and hang both siblings off it | |
| Require explicit parent arg | Mutation takes the shared parent as an explicit argument | |

**User's choice:** Reject with guidance
**Notes:** Placeholder auto-creation was rejected on three counts: it injects a person nobody
created, it hands both siblings edit rights over that fabricated node, and it collides with
`firstname`/`lastname`/`gender` being `NOT NULL` on `family_members` — there would be no
legitimate values to write.

---

## Edit scope granularity

### Q1 — Which relationship edges may a member rewrite on someone in their scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Add-only, no rewiring | May edit fields and ADD new edges, but may not change or remove an existing edge | ✓ |
| Rewire within own scope | May also change existing edges provided both endpoints stay in the editable set | |
| Fields only | All relationship changes admin-only, including adding | |

**User's choice:** Add-only, no rewiring
**Notes:** Re-parenting relocates an entire subtree and is the second escalation vector after
attachment; admin-only keeps the boundary airtight and avoids TOCTOU/ordering cases where scope
is recomputed mid-edit. "Fields only" was a non-starter — it directly contradicts PERM-01,
which states a member-user can add their immediate relatives.

### Q2 — Which fields may a member edit on an in-scope relative, especially one with their own account?

| Option | Description | Selected |
|--------|-------------|----------|
| All fields, except linked members | All family fields editable, but a relative with their own linked user account is field-locked to that person and admins | ✓ |
| All fields, no exception | Every field editable on any in-scope relative | |
| Protected field subset | Identity fields (email, name, gender) admin-only; softer fields collaborative | |

**User's choice:** All fields, except linked members
**Notes:** Respects self-ownership for people who have joined, without introducing a per-field
permission matrix. Corollary captured in CONTEXT.md: self is always in the editable set, so a
linked member can always edit their own record. The protected-subset variant was declined as
unnecessary complexity that would also block fixing a genuine typo in a relative's name.

---

## Query safety

### Q1 — Batching strategy for the recursive family schema?

| Option | Description | Selected |
|--------|-------------|----------|
| Request-scoped DataLoader | Per-request loaders in the Apollo context factory | ✓ |
| Recursive CTE flat-fetch | One MySQL 8 WITH RECURSIVE query pulling the whole subtree up front | |
| Both — loaders + CTE | DataLoader for general resolvers plus a dedicated CTE for the deep tree view | |

**User's choice:** Request-scoped DataLoader
**Notes:** Idiomatic, batches naturally across the resolved tree, and slots into the existing
per-request Apollo context alongside `models` / `user`. The CTE options were declined as
partly premature — the deep `/family` view is a later phase — and raw SQL would bypass the
established ORM patterns. Emphasised in CONTEXT.md: loaders must be per-request, never
module-level, since they sit behind a permission boundary.

### Q2 — Depth limit threshold and strictness?

| Option | Description | Selected |
|--------|-------------|----------|
| Depth 10, reject | Max depth 10, rejected at validation | |
| Depth 7, reject | Tighter bound at 7 | |
| Depth 15, reject | Looser bound at 15 | |
| **Other (free text)** | **User specified: 100** | ✓ |

**User's choice:** 100 (free-text response, above all offered options)
**Notes:** Reflected back and confirmed as a deliberate split of responsibilities — the depth
limit is a *pathological-recursion backstop* that kills infinitely nested hand-crafted queries,
while DataLoader is what actually keeps cost flat at realistic depths. The generous ceiling
leaves headroom for the deep pan/zoom `/family` view in a later phase. Agreed to implement the
value as a named, env-overridable constant rather than a magic number, so it can be tightened
later without a code change.

---

## Claude's Discretion

Recorded in CONTEXT.md; not raised as user preferences:

- Mutation naming/signature shape (separate `addParent`/`addChild`/… vs. one `addRelative` with a kind enum)
- Where the editable-scope utility lives (`utils/` vs. `services/familyMember.service.js`) — PERM-05 only requires it be a single reused server-side utility
- SQL/ORM shape of the scope computation, provided it does not itself N+1
- Whether to expose a read-only `myEditableMembers` query for UI affordances
- Error message wording and GraphQL error shape
- Deep-tree test fixture design and how query count is measured
- Whether the depth rule comes from `graphql-depth-limit` or an equivalent

## Deferred Ideas

- Member→admin removal-request flow (already deferred by PERM-03 to v2)
- Admin-approval queue for attaching to existing nodes (natural follow-up if duplicates become a real problem)
- Half-vs-full sibling distinction exposed in the schema (deferred with full genealogy)
- `myEditableMembers` read-only query for UI affordances
- Admin delete + orphan-handling semantics beyond the Phase 12 "married-in" rule
- Phase 13 WR-02 and the three INFO items remain deferred — only WR-04 is pulled into Phase 14
