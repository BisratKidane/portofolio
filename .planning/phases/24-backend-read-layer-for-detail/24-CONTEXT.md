# Phase 24: Backend Read Layer for /detail - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose, via the existing GraphQL API, every **read** the new `/detail` page needs:
family head, person-by-id, Latin+Ge'ez name search, direct-children-with-counts,
spouse data for displayed persons, and the caller's edit-permission signal.

Reuse the existing `FamilyMember` model, per-request DataLoaders, and
`requireFamilyAccess`/`requireAdmin` guards. **No DB schema change** (a query
must genuinely require one to justify it — none is expected). **No N+1** — the
direct-children read must issue a bounded/flat set of SQL statements regardless
of child count, proven by an integration test.

This phase is backend-read-only: no mutations, no frontend, no page. Requirements
covered: **API-01**, **PERF-02**.

</domain>

<decisions>
## Implementation Decisions

### Family head (SC-1)
- **D-01:** The backend "family head" query MUST mirror the client's existing
  `resolveRootAncestorId` rule: prefer member **id `1`** (Agne) when present;
  else the parentless apex (`motherId == null && fatherId == null`) with the
  **largest descendant subtree** (spouses excluded from the size comparison);
  else the first member; `null` for an empty family. Source of truth to mirror:
  `frontend/src/components/family/familyTree.assembly.js:150` (`resolveRootAncestorId`).
- **D-02:** The head query MUST be **bounded** — it must not load the whole tree
  to compute the head (PERF-01 spirit). The researcher decides the SQL shape
  (e.g. a direct id-1 lookup with an apex+subtree fallback), but pulling every
  member into memory to replicate the client walk is disallowed.

### Name search (SC-3)
- **D-03:** Search matches **partial, case-insensitive Latin** first/last name
  and **Ge'ez** first/last name (`firstname`, `lastname`, `geezFirstname`,
  `geezLastname`). Mother's-name fields are **out of scope** for search matching
  (per REQUIREMENTS API-01: "Latin + Ge'ez first/last").
- **D-04:** Results are **capped** (target ~20) and **name-sorted**
  (`lastname` ASC, `firstname` ASC) — no relevance/prefix ranking in the backend.
  Any further trimming/highlighting is the frontend's job (Phase 26).

### Direct children + child counts (SC-4)
- **D-05:** **No new `childCount` field.** Reuse the existing `children { id }`
  shape on `FamilyMember`. To satisfy "each direct child annotated with its own
  child count," the direct-children read nests one additional `children { id }`
  level (grandchild ids), and the client derives counts from array length.
- **D-06:** That nested read (`familyMember(id) { children { id children { id } spouses { id } } }`
  or equivalent) is the **N+1 proof target**: it MUST resolve in a bounded,
  flat SQL-statement count regardless of child/grandchild count — reusing the
  existing `childrenByParentId` and `spousesByMemberId` DataLoaders. Prove it
  with the `countQueries` recipe already established in
  `backend/src/services/familyMember.queryCount.test.js`.

### Edit-permission signal (SC-5)
- **D-07:** The signal reuses the **existing admin check** — `user.role === 'ADMIN'`
  on the logged-in `User` row — exactly as `requireAdmin` and the `linkedUser`/
  `createdBy`/`updatedBy` field gating already do. **No new scope logic**
  (no `computeEditableScope` on this read path). `/detail` editing is admin-only
  per the v4.0 milestone goal.
- **D-08:** Shape it as a **per-person `canEdit: Boolean!` field on `FamilyMember`**,
  resolved as `Boolean(user?.role === 'ADMIN')`, so `PersonCard` (Phase 25/28)
  can gate every card uniformly without threading a global prop. The value is
  uniform today (admin-only); the per-person shape leaves room if scoped editing
  is ever wanted on `/detail`. (Open to a single global flag instead if the user
  prefers — noted, not blocking.)

### Reuse over new surface
- **D-09:** `familyMember(id)` (SC-2 person-by-id) and the existing `spouses`
  and `children` fields already exist and return the card fields — **do not add
  parallel queries** for these. The genuinely-new API surface is: a **head**
  query, a **name-search** query, and the **`canEdit`** field. `childCount` is
  explicitly NOT added (D-05).

### Claude's Discretion
- Exact new query names and arg signatures (e.g. `familyHead`, `searchFamilyMembers(term:)`).
- The precise SQL/loader implementation for the bounded head lookup and for search.
- Whether search cap is a fixed constant or a capped `limit` arg (default ~20).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 24: Backend Read Layer for /detail" — goal, depends-on, 5 success criteria.
- `.planning/REQUIREMENTS.md` — **API-01** (reads the page needs) and **PERF-02** (no N+1). PERF-01/PERF-03 are Phase 27 but frame why the head/children reads must stay bounded.

### Head-determination rule to mirror (D-01)
- `frontend/src/components/family/familyTree.assembly.js:150` — `resolveRootAncestorId` (prefer id 1 → largest apex subtree → first). Also `collectDescendantIds` (subtree size, spouses excluded).

### Existing read layer to extend (no schema change)
- `backend/src/schemas/familyMember.schema.js` — `FamilyMember` type + `familyMember(id)`, `familyMembers`, `myEditableMembers` queries.
- `backend/src/resolvers/familyMember.resolver.js` — Query + `FamilyMember` field resolvers; admin-gating precedent for `linkedUser`/`createdBy`/`updatedBy` (D-07 analog).
- `backend/src/loaders/familyMember.loaders.js` — `memberById`, `childrenByParentId`, `spousesByMemberId`, `userById` DataLoaders (per-request, string cache keys). The N+1-safe batching to reuse.
- `backend/src/utils/auth.js` — `requireFamilyAccess`, `requireAdmin`, `user.role` shape.

### N+1 proof pattern (SC-4 / PERF-02)
- `backend/src/services/familyMember.queryCount.test.js` — `countQueries()` recipe + nested-children deep-tree bounded-SQL assertion. Copy this pattern for the direct-children N+1 test.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DataLoaders** (`familyMember.loaders.js`): `childrenByParentId` and `spousesByMemberId` already batch the exact fan-out SC-4 needs — nested `children`/`spouses` resolve flat. `memberById` covers person-by-id batching.
- **`familyMember(id)` query** already returns every card field (Latin+Ge'ez name, gender, birth, `isAlive`, `photoUrl`, spouses, children) — SC-2 is essentially met; verify field coverage, don't rebuild.
- **Admin-gating pattern**: `linkedUser`/`createdBy`/`updatedBy` resolvers already branch on `user?.role === 'ADMIN'` — the `canEdit` field (D-08) follows the identical shape.
- **`countQueries` test helper** proves bounded SQL for nested reads — directly reusable for the SC-4 N+1 test.

### Established Patterns
- Barrel aggregation: new type defs/resolvers merge via `backend/src/schemas/index.js` and `backend/src/resolvers/index.js`.
- Loaders constructed **fresh per request** (never module scope) and injected on Apollo `context` as `loaders` (see `backend/src/server.js` context fn + resolver `{ loaders }` destructure).
- GraphQL `ID!` args arrive as strings; FK columns are numeric — every loader uses `cacheKeyFn: String`. New id-keyed lookups must do the same.
- TDD red-green-refactor with integration tests via Apollo `executeOperation`/`graphql` helper (`test/helpers.js`); SC-4 explicitly demands the N+1 integration test.

### Integration Points
- New `FamilyMember.canEdit` resolver reads `context.user` (already resolved per-request in `server.js`).
- New head + search queries mount in `familyMember.schema.js` `extend type Query` and `familyMember.resolver.js` `Query` map.
- Head query's apex/subtree fallback should reuse the models/associations already wired in `models/index.js` — no new association needed.

</code_context>

<specifics>
## Specific Ideas

- The head query must stay consistent with `/family`'s current head (Agne / id 1) so `/detail` and `/family` agree on who the top ancestor is.
- Keep the API additive: existing `/family` and `/manage` queries must be untouched (non-destructive milestone).

</specifics>

<deferred>
## Deferred Ideas

- **Scoped (non-admin) editing on `/detail`** — the `canEdit` field could later reflect `computeEditableScope` instead of admin-only. Out of scope for v4.0 (milestone locks `/detail` edits to admins). D-08 leaves the per-person shape open for it.
- **Ancestor / upward navigation, deep-linkable `/detail/:id`, Latin↔Ge'ez toggle, fuller genealogy** — already logged as v4.0 Future Requirements in STATE.md; not this phase.
- **Relevance/prefix ranking of search results** — rejected for D-04 (name-sorted); revisit only if search UX (Phase 26) needs it.

</deferred>

---

*Phase: 24-backend-read-layer-for-detail*
*Context gathered: 2026-08-03*
