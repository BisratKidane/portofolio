# Pitfalls Research

**Domain:** Collaborative family-tree domain (self-referencing graph data, permission-scoped CRUD, file upload) added to an existing Express + Apollo Server 4 + Sequelize 6/MySQL 8 + React 18 stack
**Researched:** 2026-07-21
**Confidence:** HIGH for GraphQL N+1/DataLoader, MySQL recursive-CTE, and file-upload-security patterns (official docs + multiple corroborating sources); MEDIUM for family-tree-specific dedup/permission edge cases (reasoned from the stack + domain logic, less directly documented in external sources); LOW flagged inline where a claim rests on a single source.

## Critical Pitfalls

### Pitfall 1: Recursive self-referencing resolvers cause exponential N+1 fan-out on a deep tree

**What goes wrong:**
`FamilyMember` fields (`parents`, `children`, `spouse`, derived `siblings`) are naturally recursive GraphQL types. If each field resolver just calls `member.getParents()` / `member.getChildren()` independently per node (the natural first implementation), a single `/family` query that asks for a few generations up and down fans out to hundreds or thousands of individual `SELECT ... WHERE parentId = ?` queries — one N+1 problem nested inside another. At 10-23 generations this isn't a minor slowdown, it can time out the request or exhaust the default 5-connection Sequelize pool (`backend/src/config/database.js` has no `pool` tuning today).

**Why it happens:**
GraphQL resolvers are field-scoped and stateless by default — nothing forces batching unless you deliberately add it. Sequelize associations (`getParents()`, `getChildren()`) look like "just call the ORM method" and work fine in a two-level test fixture, hiding the problem until someone tests with a real deep tree.

**How to avoid:**
- Add a `DataLoader` per relationship type (`parentsLoader`, `childrenLoader`, `spouseLoader`), each batching by `FamilyMember.id` and instantiated **fresh per request** inside the same `context()` function that already computes `user`/`models` in `backend/src/server.js` — never a module-level singleton loader (that would leak/cache across requests and silently return stale data to different users).
- For the `/family` deep-tree read path specifically, don't resolve field-by-field at all: fetch the whole subtree in one shot using a MySQL 8 `WITH RECURSIVE` CTE (or, more simply given `sequelize.sync()` and no migrations, fetch **all** `FamilyMember` rows + a flat relationships table in 1-2 queries and assemble the tree in JS) rather than letting GraphQL's naive per-field resolution walk the graph node-by-node.

**Warning signs:**
- A fixture with 4+ generations and >2 children per generation makes the `/family` query visibly slow in local dev.
- Enabling Sequelize's dev query logger (`backend/src/config/database.js:8`, already conditional on `NODE_ENV`) and eyeballing the log shows dozens/hundreds of near-identical `SELECT` statements for one GraphQL request.

**Phase to address:**
Data-model & resolver phase (when `FamilyMember` relationships and resolvers are first built) — DataLoader wiring should ship with the relationship resolvers, not be retrofitted after `/family` is slow.

---

### Pitfall 2: Unbounded recursive GraphQL query depth becomes a new DoS surface

**What goes wrong:**
The existing app has **no query depth/complexity limiting** (documented as an architectural constraint in the codebase map — "Single GraphQL endpoint, no query complexity/depth limiting"). Today that's low-risk because the schema is flat (`User`, `Dashboard`). Once `FamilyMember { parents { parents { parents { ... spouse { children { ... } } } } } }` exists as a real recursive type, a single crafted query can request unbounded depth/breadth, turning an oversight that was harmless into an actual DoS vector against the same server that also handles login/auth traffic.

**Why it happens:**
Recursive types are added for a legitimate feature (the tree), but nobody revisits the "no depth limiting" gap until it's exploited or a test with a large fixture times out the whole server (not just one request), because the connection pool gets starved.

**How to avoid:**
Add `graphql-depth-limit` (or Apollo's complexity plugin) as a validation rule the same milestone the recursive `FamilyMember` type ships — cap depth to something a bit deeper than the deepest legitimate `/manage` query needs (immediate relatives ≈ depth 2-3), and let `/family`'s deep-tree read use a dedicated non-recursive query (`familyTree(rootId, maxDepth)`) instead of relying on arbitrarily deep field nesting.

**Warning signs:**
- No `validationRules`/depth-limit plugin present in `backend/src/server.js` after the recursive type ships.
- A manually-crafted 15-level-deep GraphQL query string is accepted without error in dev.

**Phase to address:**
Same phase as Pitfall 1 (relationship resolvers) — add the depth-limit plugin alongside DataLoader, before `/family` is exposed publicly-reachable-by-JWT.

---

### Pitfall 3: Parent/child edges allow cycles — a person becomes their own ancestor

**What goes wrong:**
Sequelize (and MySQL FK constraints) will happily let you set `memberA.parentId = memberB.id` and, separately, `memberB.parentId = memberA.id` (or a longer chain back to itself) — nothing in the ORM or a plain FK enforces "this graph must stay a DAG." Once a cycle exists, any recursive read (tree render, ancestor lookup, the cycle-check itself) either infinite-loops or blows past MySQL's recursion cap (`WITH RECURSIVE` fails past 1000 levels by default via `cte_max_recursion_depth`), and a naive JS-side recursive walk will stack-overflow or hang.

**Why it happens:**
Member-scoped editing (any linked member can add/edit their *immediate* relatives) plus a permissive schema means the mutation `setParent(childId, parentId)` has no reason, on its own, to know that `parentId` is already a descendant of `childId` several generations down — that check requires walking the graph, which is easy to forget when the happy-path (adding a real, non-cyclic relative) never triggers it.

**How to avoid:**
Before committing any parent/child edge (create or update), run an ancestor-check: does `parentId` already appear in `childId`'s descendant set (or vice versa for the mirrored check)? Implement as a bounded recursive query (either `WITH RECURSIVE` with a depth cap, or an app-level BFS/DFS capped at, e.g., 30 levels — deeper than the deepest legitimate tree) and reject the mutation with a clear error if a cycle would result. This check belongs in the resolver/service layer, not just "trust the client" — write it test-first: a test that attempts `setParent(grandparentId, grandchildId)` where grandchild is already a descendant of grandparent must fail.

**Warning signs:**
- No explicit "would this create a cycle?" check anywhere near the parent/child mutation resolvers.
- A test suite that only covers adding relatives in the "obvious" direction (parent before child exists) and never attempts the reverse/cyclic case.

**Phase to address:**
Data-model & relationship-mutation phase — this is a correctness invariant of the graph itself, not an edge case to defer; it must ship with the first parent/child mutation, TDD'd red-green per the milestone's hard constraint.

---

### Pitfall 4: Spouse relationship modeled as an asymmetric FK goes out of sync

**What goes wrong:**
If `spouse` is implemented as a single nullable `spouseId` column on `FamilyMember` (the "obvious" self-FK design), it's easy to write `memberA.spouseId = memberB.id` without also setting `memberB.spouseId = memberA.id`. The relationship then reads correctly from one side and not the other — A shows B as a spouse, but B's tree shows no spouse (or worse, a stale different spouse from a previous edit). This corrupts the derived-siblings logic too, since spouse pairing can matter for scoping "immediate relatives."

**Why it happens:**
A single-column self-FK is the fastest thing to model in Sequelize and passes every test that only checks "from the side I just edited." The asymmetry only surfaces when someone reads from the *other* member's perspective, which single-direction tests won't naturally cover.

**How to avoid:**
Model spouse (and arguably parent/child too) as rows in a dedicated `FamilyRelationship` join table (`memberAId`, `memberBId`, `type: 'SPOUSE'|'PARENT_CHILD'`) rather than a same-table self-FK column, and always write/read symmetric relationships as a single row queried from either direction (`WHERE memberAId = ? OR memberBId = ?`) instead of two mirrored writes that can drift. If a same-table FK is kept for parent/child (directional, so asymmetry is inherent and fine), spouse specifically should not be — enforce the symmetric-write (or join-table) design and add a test that asserts querying from *either* member of a spouse pair returns the same relationship.

**Warning signs:**
- `spouseId` exists as a plain column with no transactional "set both sides" logic around every write path (create, update, unlink).
- No test reads the relationship from the "other" member's side after an edit.

**Phase to address:**
Data-model design phase (before the first migration/`sync()` of the relationship schema ships) — this is a schema-design decision, expensive to change after real data exists.

---

### Pitfall 5: Removing a member cascades further than intended (or not far enough)

**What goes wrong:**
`sequelize.sync()` (no migrations, per this project's existing constraint) will create FK constraints based on whatever `onDelete` behavior the association definitions specify — and Sequelize's per-association defaults are easy to get wrong for a self-referencing model. Two failure modes are both plausible and both bad: (a) deleting one ancestor member accidentally `CASCADE`s and wipes out an entire descendant subtree because a `belongsTo`/`hasMany` pair was left at a default that cascades; or (b) deleting a member leaves dangling `parentId`/`spouseId`/`childId` references pointing at a now-nonexistent row (if no `onDelete` is specified and the FK constraint doesn't enforce integrity the way you assumed), silently corrupting tree renders later.

**Why it happens:**
Nobody explicitly decided "what should happen to X's children/spouse when X is deleted" as a product requirement before writing the model — it's easy to let the ORM/DB default decide, and self-referencing FK cascade semantics are genuinely confusing (MySQL and Sequelize disagree in places, and behavior can differ between `sync()`-created schema and what a hand-written migration would specify).

**How to avoid:**
Decide explicitly, as a requirement, before modeling: member deletion should almost certainly `SET NULL` on dependent parent/spouse/child references (orphaning the edge, not cascading the delete) — a family tree should not vanish downstream because one ancestor node was removed. Set `onDelete: 'SET NULL'` explicitly on every self-referencing association (don't rely on the Sequelize default), and write an integration test that creates a 3-generation branch, deletes the middle-generation member, and asserts the grandchildren still exist with their `parentId` nulled (or reassigned per whatever the actual product rule is) rather than being cascade-deleted.

**Warning signs:**
- Association definitions with no explicit `onDelete` option.
- No test exercises "delete a member who has children/spouse/parents and assert what survives."

**Phase to address:**
Data-model design phase, same as Pitfall 4 — cascade behavior is schema-level and must be decided and tested before `/manage` delete/remove functionality ships to any non-admin user.

---

### Pitfall 6: Sibling-firstname dedup rule breaks down for half-siblings, remarriage, and independently-added shared parents

**What goes wrong:**
The dedup guard ("block a new child if their firstname matches an existing sibling") is ambiguous the moment "sibling" isn't simply "full sibling with two shared parents," which is exactly the situation this milestone's own scope creates: half-siblings, blended/remarried families, and partial parentage are explicitly named as real scenarios (full multi-marriage genealogy is deferred, but the dedup rule as specified operates on *any* shared parent, so half-siblings will hit it whether or not "half-sibling" is a modeled concept). Concretely:
- Two children who share only one parent (father remarries, has a child with the same firstname as a child from his first marriage) get incorrectly blocked as "duplicates" even though they're different people through different mothers.
- A member with only one parent recorded (or none) can't have siblings derived at all — the check silently doesn't fire, which is *correct* until that member is later linked to a parent, at which point a firstname collision that should have been caught at creation time is only discoverable retroactively.
- Case/whitespace aren't automatically normalized — `"John"`, `"john"`, and `" John "` are three different strings to a naive `WHERE firstname = ?` comparison, so the "uniqueness" guard silently fails to catch real duplicates typed inconsistently by different family members.
- Most importantly: two different (unlinked) relatives adding "the same" parent independently — e.g., two siblings, each editing their own immediate relatives on `/manage`, both add a new "Dad" record with his real name because neither knew the other had already added him — produces **two separate `FamilyMember` rows for the same real person**. The sibling-firstname check operates per shared-parent-*row*, so it never catches this: the children now "share a parent" only in the real world, not in the DB, so no duplicate-firstname block fires, and the tree silently forks into two disconnected trees rooted at two different "Dad" nodes.

**Why it happens:**
The rule as specified is a proxy for a much harder problem (canonical person identity / record linkage) using the cheapest signal available (firstname + literal shared-parent-row). It works for the common case (one nuclear family, one person per parent, everyone spelled consistently) and breaks exactly at the boundaries this milestone's feature list calls out as real (remarriage, partial parentage) but explicitly defers full support for (multiple marriages/half-siblings as *modeled concepts*).

**How to avoid:**
- Normalize firstname comparison (trim + case-fold, e.g., lowercase + Unicode normalize) before any uniqueness check, at the resolver layer, and cover it with an explicit mixed-case/whitespace test.
- Scope the dedup check precisely and document the scope as a product decision, not an implementation accident: decide (and write down) whether the rule applies to "shares any one parent" or "shares both parents," and accept — explicitly, as a known limitation, consistent with "full genealogy deferred" — that legitimate half-siblings sharing a firstname will be blocked; give the blocking error message enough detail (e.g., "a child named X already exists under this parent") that a human can recognize the false-positive and route around it (rename, or flag for admin override) rather than silently failing.
- For independently-added duplicate parents: this is the highest-value prevention target. Before letting a member create a brand-new parent record, require a "search existing members first" step in the `/manage` UI (search by name/birthdate) and make creating a *new* parent record a deliberate, distinct action from *linking* to an existing one. This doesn't eliminate the possibility (names still won't always match), but it removes the accidental case. Additionally, give admins a manual "merge two member records" tool (even a minimal one) as a recovery path, since some duplication will still slip through.
- Re-run the dedup check at parent-*linking* time (not only at member-creation time), so a member discovered to share a parent after the fact still gets validated.

**Warning signs:**
- Dedup check does a raw string `=` comparison with no `TRIM`/`LOWER` normalization.
- No UI affordance to search/select an existing member before creating a new parent node.
- No admin merge/dedup tool exists at all once real (non-test) family data starts accumulating.

**Phase to address:**
Dedup-rule + `/manage` UI phase — the normalization fix is cheap and should ship with the first version of the rule; the "search before create" UX and admin merge tool should be scoped explicitly as separate roadmap items (the merge tool can be minimal/manual for v2.0, but its absence should be a documented, deliberate scope decision, not an oversight).

---

### Pitfall 7: "Immediate relatives" permission scope computed once/statically instead of freshly per mutation

**What goes wrong:**
A member is permitted to edit parents, spouse, children, and siblings — a set that changes as the graph changes (unlink a parent, gain a new sibling, etc.). If the permission check computes this set once (e.g., cached on login, or read from a client-supplied claim) rather than recomputing it fresh from the current DB state at the time of each mutation, a member can retain edit rights over relatives they're no longer connected to, or — more dangerously — a stale/incorrect computation can under- or over-scope the set silently. The over-scope direction is the security bug: any bug that accidentally includes siblings-of-siblings, grandparents, or arbitrary other members in the "editable" set grants privilege beyond "immediate."

**Why it happens:**
"Immediate relatives" for a self-referencing graph with 4 relationship directions (I am parent of X / X is parent of me / I am spouse of X / X and I share a parent) is genuinely easy to compute incorrectly — union queries in the wrong direction, or reusing a "siblings" computation that was written for the *tree display* (which may deliberately show more than the *editable* scope) for permission checks instead.

**How to avoid:**
Write one single, well-tested utility function (e.g., `getEditableMemberIds(actingMemberId)`) that is the *only* source of truth for permission scope, used by every family-domain mutation resolver — never inline a scope check per-resolver. Test it explicitly with fixtures that include grandparents, cousins, and siblings-of-siblings, asserting they are *excluded*, alongside fixtures for parents/spouse/children/derived-siblings asserting they *are* included. Recompute this set fresh inside the resolver on every mutation call (never trust a cached/client-supplied scope), and treat every mutation that touches a `targetMemberId` as needing `targetMemberId ∈ getEditableMemberIds(callingMemberId)` before doing anything else — mirroring the existing `requireAuth`/`requireAdmin` guard-clause pattern already used in `backend/src/utils/auth.js`.

**Warning signs:**
- More than one place in the resolver code independently computes "who can this member edit."
- No test fixture includes a grandparent or a sibling's spouse and asserts they're rejected.

**Phase to address:**
Permission-scoping phase (before any member-facing `/manage` mutation ships) — this utility function is a hard dependency for every subsequent mutation resolver and should be built and fully tested first.

---

### Pitfall 8: Relationship edits become a privilege-escalation vector

**What goes wrong:**
Because editing relationships *is itself* how "immediate relatives" gets computed, a member creating a relationship edge is also — indirectly — expanding their own future editable scope. Concretely: if Member A can set `spouseId = adminMemberId` (or any other real member's id) on their own record without the other party's consent, and the permission-scope check (Pitfall 7) recomputes "immediate relatives" from current graph state, Member A has just fabricated a claim of being married to the admin's member record and, on the next request, may be treated as having edit rights over the admin's other immediate relatives too. The same logic applies to parent/child edges — falsely claiming to be someone's child/parent extends editable reach into a whole new subtree.

**Why it happens:**
Relationship-creation mutations are naturally one-sided (the acting member submits the edit), but the *effect* of that edit (expanding their own permission scope) is a second-order consequence nobody reviews for abuse the way they'd review, say, a `promoteToAdmin` mutation.

**How to avoid:**
Any relationship edge that links two **different, already-linked-to-an-account** members (spouse, or a parent/child edge where both ends already have their own user account) should require the target member's own account to have created the record, or the acting member's account to be the one who originally created *that specific member node* (i.e., they're linking a node they own/created, not grafting onto someone else's pre-existing subtree), or (simplest, safest for v2.0) require admin approval for any edge that connects two independently-linked accounts. Unlinked `FamilyMember` nodes (no account attached yet) are safe to edit freely within scope since there's no second account to protect. Write a test: Member A (linked, with their own subtree) attempts to set themselves as spouse/parent/child of Member B (linked, unrelated subtree) without B's consent or admin approval — must be rejected.

**Warning signs:**
- Relationship-creation mutations only check "is the acting member within scope of the edge they're creating *today*" without considering that the edge itself changes tomorrow's scope.
- No distinction in the permission model between editing a node you already have standing over vs. creating a *new* edge to a node you don't yet have standing over.

**Phase to address:**
Permission-scoping phase, immediately following Pitfall 7 — this is the adversarial-thinking pass on the same permission model, and should be reviewed/tested before `/manage` is exposed to non-admin users in any environment beyond local dev.

---

### Pitfall 9: File upload trusts client-supplied filename/content-type, enabling path traversal and content-sniffing XSS

**What goes wrong:**
A naive photo-upload implementation stores the file using the client-supplied filename (or trusts the `Content-Type` header/extension to decide it's really an image), which opens two separate holes: (1) a filename like `../../../etc/somewhere/evil` used to construct a filesystem path causes path traversal outside the intended upload directory; (2) a file whose *extension* says `.jpg` but whose *content* is actually HTML/SVG-with-`<script>` can, depending on how the file is served, be sniffed and executed by a browser as HTML/SVG (stored XSS via "image" upload) if served without a strict `Content-Type`/`X-Content-Type-Options: nosniff` header.

**Why it happens:**
"Accept a file and save it" is treated as a solved problem borrowed from generic tutorials that skip the security review, and it's easy to test the happy path (upload a real `.jpg`) without ever testing the adversarial path (upload something that lies about what it is).

**How to avoid:**
- Never use the client-supplied filename to build a filesystem path. Generate a server-side unique name (UUID or member-id + timestamp) for the stored file; keep the original filename only as display metadata in the DB, never interpolated into a path.
- Validate the actual file content (magic-number/content sniffing, e.g. via the `file-type` package), not just the extension or `Content-Type` header, and reject anything that isn't a real, allow-listed image format. Explicitly disallow SVG (SVG can contain executable script) unless it's run through a sanitizer.
- Enforce a max file size at the multipart-parsing layer (multer/busboy `limits.fileSize`), not only in frontend JS, since a request can always bypass the browser.
- Serve uploaded photos from a dedicated route with `X-Content-Type-Options: nosniff` and an explicit, allow-listed `Content-Type` derived from the validated file type — never "whatever the browser guesses."

**Warning signs:**
- Any code path that does `path.join(uploadDir, req.file.originalname)` or similar without sanitization/replacement.
- No content-sniffing library in `backend/package.json` after the upload feature ships — only extension/mimetype string checks.

**Phase to address:**
File-upload phase — this is the core security surface of that phase and should be TDD'd with adversarial fixtures (a `.jpg`-named HTML file, a path-traversal filename, an oversized file) as the first red tests, before the happy-path test.

---

### Pitfall 10: Upload volume not durably mounted, or GraphQL-multipart approach introduces avoidable CSRF complexity

**What goes wrong:**
Two related but distinct traps: (a) if the Docker volume for uploaded photos isn't declared as a **named** volume in `docker-compose.yml` from the very first version that ships file upload, files written during development/staging live inside the container's writable layer and are silently lost on the next `docker compose up --build` (or any container recreate) — this is easy to miss because it "works" until the first rebuild; (b) implementing uploads via GraphQL multipart (`graphql-upload`) — the seemingly natural choice given the existing single-`/graphql`-endpoint architecture — inherits a documented CSRF weakness (multipart/form-data requests are "simple" requests under CORS and don't trigger a preflight, so if auth ever relied on cookies this would be exploitable; even with this app's existing Bearer-token-in-header auth pattern, `graphql-upload` still requires deliberately enabling Apollo's `csrfPrevention` and carries real complexity — ESM/version-compatibility friction has also historically been an issue with `graphql-upload`).

**Why it happens:**
(a) Volume mounting is invisible until a rebuild happens, and dev environments that never rebuild the container hide the bug for weeks. (b) "We already have one GraphQL endpoint, uploads should go through it too" feels architecturally consistent even though the existing app's Bearer-token pattern (not cookies) already sidesteps the main reason people reach for GraphQL multipart, and a plain REST route is simpler and better-trodden.

**How to avoid:**
- Add the upload directory as a named volume (e.g., `family_photos:/app/uploads`) in `docker-compose.yml` the same commit the upload feature ships, and add a manual/CI check step: "stop and restart the backend container, confirm a previously-uploaded test photo is still servable" before considering the phase done.
- Prefer a **dedicated REST endpoint** (`POST /uploads/photo`, protected by the same JWT-bearer `requireAuth`/permission-scope check used elsewhere) over GraphQL multipart — it avoids the CSRF-preflight gap entirely, keeps the existing Axios-based `graphqlClient.js` pattern simple (one extra Axios call, not a new GraphQL upload scalar), and sidesteps `graphql-upload`'s dependency/version friction. This is a deliberate deviation from "everything goes through `/graphql`" and should be recorded as a Key Decision, not left implicit.

**Warning signs:**
- `docker-compose.yml`'s backend service has no `volumes:` entry for the upload path, or uses an anonymous/bind-to-container-layer path.
- `graphql-upload` (or equivalent) appears in `backend/package.json` without `csrfPrevention: true` also being set on the Apollo Server config.

**Phase to address:**
File-upload phase — both the volume declaration and the REST-vs-GraphQL-multipart decision must be made at the start of that phase, not discovered after the feature seems "done" in local dev (where rebuild-persistence never gets exercised).

---

### Pitfall 11: Membership gate checked only at the frontend route level, leaving the GraphQL API itself open to unlinked-but-verified users

**What goes wrong:**
The intended flow is register → verify email (v1.1, already shipped) → admin links the account to a `FamilyMember` node → only then can the user reach `/family`/`/manage`. If the "pending" gate is implemented only as a React Router guard (analogous to today's `ProtectedRoute.jsx`, which checks auth but has no concept of "linked"), a verified-but-unlinked user still holds a perfectly valid JWT and can call any family-domain GraphQL query/mutation directly (bypassing the SPA entirely) unless the *resolver* layer independently enforces "does this JWT's user have a linked member." This is the same class of gap the codebase's own architecture doc already flags generally ("no query complexity/depth limiting... every resolver executes directly against the DB") — frontend gating has never been a substitute for resolver-level guards in this codebase, and the new membership dimension must follow that same discipline.

**Why it happens:**
It's natural to build the "pending" UI screen first (it's the visible, demo-able part) and treat the backend check as an afterthought, especially since `requireAuth`/`requireAdmin` already exist as a pattern to imitate but a third guard (`requireLinkedMember`) doesn't yet exist and is easy to forget to add to *every* family-domain resolver individually.

**How to avoid:**
Add a `requireLinkedMember(user)` guard function alongside the existing `requireAuth`/`requireAdmin` in `backend/src/utils/auth.js` (or an equivalent new module), and apply it at the top of every family-domain resolver (mirroring the existing convention of guard clauses called first, before any other logic). Write an integration test with a verified, non-admin, **unlinked** JWT attempting to call a family query/mutation directly (bypassing the SPA) and assert it's rejected — this test is the actual verification that the gate isn't merely cosmetic.

**Warning signs:**
- The "pending" gate exists only as a frontend route condition (`AuthContext`/`ProtectedRoute`-style check), with no equivalent guard inside any family resolver.
- No integration test exercises "verified user, no linked member, calls family GraphQL operation directly."

**Phase to address:**
Membership-gating phase — should ship in the same phase as (or immediately before) the first family-domain resolver, so no resolver is ever merged without the guard already in place.

---

### Pitfall 12: Membership gate locks out the very first admin who has no linked member yet (chicken-and-egg with v1.1's admin bootstrap)

**What goes wrong:**
v1.1 already solved "who becomes admin first" via an atomic, race-safe verify+promote mechanism. But that mechanism produces a `User` with `role = ADMIN` and **no** `FamilyMember` link — nothing in v1.1 created or linked a member node, because the family-tree domain didn't exist yet. If the new membership gate (Pitfall 11) is applied uniformly to all family-domain operations including the ones needed to *create the first member node and link it*, the first admin is locked out of the very tools needed to bootstrap the tree: they can't reach `/manage` to create/link a member because they're not yet linked, and they can't get linked without reaching `/manage`.

**Why it happens:**
"Gate everything family-related behind membership" is the correct rule for ordinary members, but applying it without an admin carve-out recreates exactly the kind of chicken-and-egg problem v1.1 already had to solve once (first-user-ADMIN) in a new form (first-member-link), and it's easy to reuse the mental model "membership gate = simple boolean check" without special-casing the role that must be exempt from it.

**How to avoid:**
`requireLinkedMember` (Pitfall 11) should not apply to ADMIN-role users for the specific operations that create/link member nodes and manage the whole tree (member CRUD, account-linking mutations) — admins operate on the whole tree by role, independent of being linked themselves; only the "view my tree" (`/family`, `/manage`-immediate-relatives) experience should require *that specific user* to be linked, and even then, an admin who chooses to also be a member should link themselves through the same admin tooling. Write an integration test: a freshly-promoted ADMIN with **no** linked `FamilyMember` can still call member-creation and account-linking mutations (proving the carve-out works), while a non-admin, unlinked, verified user cannot (proving Pitfall 11's gate still holds for everyone else). Also add a regression test confirming the v1.1 first-user-ADMIN promotion flow itself is unaffected by the new gate (it must still work with zero `FamilyMember` rows in the database).

**Warning signs:**
- `requireLinkedMember` is applied as a blanket guard with no role-based exemption.
- No test covers "brand-new ADMIN, zero FamilyMember rows exist yet, can they still create the first node."

**Phase to address:**
Membership-gating phase, same as Pitfall 11 — the admin carve-out must be designed at the same time as the gate itself, not patched in after a demo reveals the lockout.

---

### Pitfall 13: `sequelize.sync()` (no migrations) mishandles self-referencing associations, and DataLoader/permission logic silently diverges between test harness and production

**What goes wrong:**
Two testability-specific traps compound here. First, self-referencing associations (`FamilyMember belongsTo FamilyMember as 'father'`, etc.) are a known rough edge for `sequelize.sync()` — depending on how associations are declared, `sync()` can attempt to create FK constraints in an order that fails on a genuinely empty database (chicken-and-egg at the schema level, distinct from the app-level chicken-and-egg in Pitfall 12), especially under `{ force: true }` (which this project's CI/test-DB setup already uses per `backend/test/globalSetup.js`). This might work in an incrementally-evolved dev DB (where the table already exists with data) while failing on a truly fresh CI database — exactly the scenario CI forces every run. Second, if the DataLoader instance or the permission-scope computation used in tests differs even slightly from what production's `context()` function builds (e.g., a test helper that skips DataLoader entirely and calls models directly "for simplicity"), the test suite can be green while the exact bugs this research flags (N+1 fan-out, stale permission scope) go completely undetected — the tests would be testing a different code path than production runs.

**Why it happens:**
Self-referencing FK/`sync()` interaction is a genuine MySQL/Sequelize edge case that most tutorials don't cover (most examples are one-directional, unrelated-table associations). And test helpers naturally drift toward "simplest thing that makes the assertion pass," which quietly diverges from the request-scoped `context()` wiring that production actually uses.

**How to avoid:**
- Add an explicit "does `sync({ force: true })` boot cleanly against a genuinely empty database with the new self-referencing model" smoke test very early — this should run as part of the existing CI global-setup path (`backend/test/globalSetup.js`), not be assumed to work by analogy with the existing `User` model.
- Extend the existing `backend/test/helpers.js` request-builder to construct the same `context()` (including a fresh DataLoader instance) that `backend/src/server.js` builds in production, rather than a simplified test-only stand-in — the whole point of the executeOperation/supertest harness this project already has is that it exercises real request wiring; DataLoader and permission-scope guards must be part of that same wiring in tests, or regressions in exactly the areas this document flags will pass CI silently.
- Build a reusable fixture-generation helper (e.g., `test/familyTreeFactory.js`) that programmatically creates N-generation trees, since hand-authoring 10-23 generations of fixtures per test is impractical; use it to write a query-count assertion (hook into Sequelize's logger, count queries per request) proving the DataLoader batching actually caps query count as tree depth grows, rather than only asserting the returned data shape is correct.
- For file-upload tests, use a temp/mocked upload directory scoped per test run (cleaned up in the same teardown pattern as the DB), independent of the real Docker-mounted volume path, so upload tests neither depend on nor pollute the real storage location.

**Warning signs:**
- No test exists that runs `sync({ force: true })` against a fresh DB specifically covering the new self-referencing model in isolation.
- Test helpers build GraphQL context by calling models directly instead of reusing production's `context()`/DataLoader construction.
- No query-count assertion anywhere in the test suite for deep-tree reads.

**Phase to address:**
Should be addressed continuously starting with the data-model phase (the `sync()` smoke test) and reinforced in the resolver/DataLoader phase (harness parity) and the deep-tree-read phase (query-count assertions) — this isn't a single phase's concern but a standing practice that should be called out explicitly in each phase's success criteria.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| Single self-FK `spouseId` column instead of a relationship join table | Faster to model, fewer joins for simple reads | Asymmetric-write drift (Pitfall 4), harder to extend to future multi-marriage support | Never for spouse; acceptable only for strictly-directional parent/child edges |
| No admin merge/dedup tool for accidentally-duplicated parent nodes | Saves a phase of UI/backend work | Real family data silently forks into disconnected sub-trees (Pitfall 6) with no recovery path | Acceptable only if explicitly scoped out with a documented manual-SQL-fix fallback for v2.0 |
| GraphQL multipart upload (`graphql-upload`) instead of a REST upload route | Keeps "everything through `/graphql`" architectural purity | Inherited CSRF-preflight gap, dependency/version friction (Pitfall 10) | Never — the REST-route deviation is cheap and strictly safer here |
| Skipping the cycle-prevention check "because nobody would do that in the demo data" | One less check to write and test | A single bad edit corrupts every recursive read forever, discoverable only when the tree render hangs (Pitfall 3) | Never — this is a correctness invariant, not a UX nicety |
| Reusing "sibling" logic built for tree *display* as the permission-scope computation for edits | Avoids writing a second function | Silent permission over-scope if display logic is ever more permissive than intended edit scope (Pitfall 7) | Never — keep display and permission-scope logic as separate, separately-tested functions even if they overlap today |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|------------------|--------------------|
| MySQL 8 `WITH RECURSIVE` for tree reads | Assuming unlimited recursion depth; hitting the default `cte_max_recursion_depth` (1000) unexpectedly on a pathological/cyclic graph | Set an explicit, generous-but-bounded `MAXRECURSION`/`cte_max_recursion_depth` and pair it with the app-level cycle-prevention check (Pitfall 3) so the CTE never needs to protect against a cycle that shouldn't exist in the first place |
| Sequelize self-referencing associations + `sync()` | Assuming `sync()` handles self-referential FK creation exactly like unrelated-table associations | Prove it with a dedicated fresh-DB smoke test (Pitfall 13); consider `constraints: false` on one side of the association if `sync()` errors on FK-creation ordering |
| DataLoader + Apollo Server 4 `context()` | Creating one DataLoader instance at server startup (module scope) and reusing it across requests | Instantiate DataLoaders inside the `context()` async function on every request, exactly where `models`/`user` are already computed in `backend/src/server.js` |
| Docker Compose volume for uploads | Adding the upload feature without a named volume, testing only in a container that's never rebuilt | Declare the named volume in the same commit as the feature; verify with an explicit rebuild-and-check step |
| `graphql-upload` + Apollo Server CSRF prevention | Enabling multipart uploads without also setting `csrfPrevention: true` | Prefer a separate REST upload route (Pitfall 10); if GraphQL multipart is used anyway, `csrfPrevention: true` is mandatory, not optional |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|-----------|------------|-----------------|
| Per-field N+1 resolution of parent/child/spouse | Query log shows dozens-hundreds of near-identical SELECTs per `/family` request | DataLoader batching per relationship type, request-scoped | Becomes visible at ~3-4 generations, severe by 10+ |
| No query depth/complexity limit on a now-recursive schema | A hand-crafted deep query hangs or slows the whole server, not just itself | `graphql-depth-limit`/complexity plugin added alongside the recursive type | Immediately exploitable once the recursive type ships, regardless of real data size |
| Rendering the full tree as one deeply-nested React component tree | Browser tab freezes/jank scrolling or zooming a 10-23 generation tree | Fetch flat node+edge list, use a virtualizing tree-render library (e.g., a D3-based org-chart/family-chart library with pan/zoom + virtualization, or ReactFlow-style windowed rendering), collapse distant branches by default | Noticeable well before 23 generations if every node is a live React component with no windowing |
| Default (untuned) Sequelize connection pool (max 5) under deep-tree read load | Requests queue/block waiting for a DB connection during a heavy tree fetch | Explicit `pool: { max, min, acquire, idle }` tuning once family-tree read volume is added (this was already flagged as a scaling limit before this milestone) | Breaks under concurrent `/family` loads even at modest user counts if tree reads are chatty (reinforces need for Pitfall 1's fix) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-supplied file extension/`Content-Type` for uploads | Stored XSS via a mislabeled HTML/SVG file served as an "image" | Magic-number content validation, disallow SVG, `nosniff` header on the serving route (Pitfall 9) |
| Using client-supplied filename in a filesystem path | Path traversal, overwrite of arbitrary files | Server-generated filename only; original name stored as metadata, never interpolated into a path (Pitfall 9) |
| Membership gate enforced only at the frontend route level | A valid-but-unlinked JWT reaches family data directly via GraphQL, bypassing the SPA gate entirely | Resolver-level `requireLinkedMember` guard on every family-domain operation (Pitfall 11) |
| Permission scope computed loosely / reused from display logic | Privilege escalation — a member edits relatives outside their intended set | Single, separately-tested `getEditableMemberIds()` utility, recomputed fresh per mutation (Pitfall 7) |
| Relationship edits accepted from one side without the other party's consent | A member fabricates a spouse/parent/child claim on an unrelated, already-linked member to expand their own edit scope | Require admin approval (or mutual confirmation) for edges connecting two independently-linked accounts (Pitfall 8) |
| Blanket membership gate with no admin exemption | Locks the first admin out of the tools needed to bootstrap the tree | Role-based carve-out for admin-only tree-management operations (Pitfall 12) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|-------------------|
| Sibling-firstname dedup rejects a legitimate half-sibling with a generic error | User can't figure out why a real family member can't be added, may work around it by lying about the name | Surface a specific, actionable error ("a child named X already exists under this parent — is this the same person?") rather than a bare validation failure |
| No "search existing members" step before adding a new parent | Two relatives independently create duplicate parent nodes, silently forking the tree (Pitfall 6) | Require a search/select-existing step in `/manage` before allowing "create new parent," making linking the default and creation the deliberate exception |
| Deep tree rendered fully expanded by default | Browser jank, users lost in 10-23 generations of nodes on first load | Default to a collapsed view centered on the viewing member, with explicit expand-per-branch and pan/zoom, not a fully-expanded initial render |
| "Pending" gate with no explanation of *why* or *what's next* | Verified users stuck at a gate with no indication an admin needs to link them | Pending-state screen should explain the admin-linking step is required and roughly what to expect, so users don't assume the app is broken |

## "Looks Done But Isn't" Checklist

- [ ] **Parent/child mutations:** Often missing a cycle-prevention check — verify a test attempts to create a cycle and asserts rejection, not just that normal additions succeed.
- [ ] **Spouse relationship:** Often implemented as a plain one-directional FK column — verify querying from *either* member of a pair returns the same, symmetric result.
- [ ] **Member deletion:** Often leaves cascade/orphan behavior undecided by default — verify a test deletes a member with children/spouse and asserts exactly what survives (not merely that the delete "succeeds").
- [ ] **Sibling dedup check:** Often does a raw string comparison — verify a mixed-case/whitespace duplicate ("john" vs " John ") is actually caught.
- [ ] **Deep-tree resolvers:** Often tested only against a 2-3 node fixture — verify a query-count assertion against a programmatically-generated 10+ generation fixture, not just correctness of a shallow tree.
- [ ] **Membership gate:** Often implemented as a frontend route guard only — verify an integration test calls a family GraphQL operation directly with a verified-but-unlinked JWT and gets rejected.
- [ ] **First-admin bootstrap:** Often untested post-family-tree-gate — verify a fresh ADMIN with zero linked `FamilyMember` rows can still create/link the first node.
- [ ] **File upload:** Often tested only with a real, correctly-named image — verify adversarial fixtures (path-traversal filename, mislabeled content-type, oversized file) are explicitly rejected.
- [ ] **Upload volume:** Often verified only in a container that's never been rebuilt — verify a photo survives an actual `docker compose` restart/rebuild.
- [ ] **Permission scope function:** Often duplicated inline per-resolver — verify there is exactly one `getEditableMemberIds`-style utility used everywhere, tested against grandparents/cousins/siblings-of-siblings as explicit exclusions.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| A cycle already exists in production data | HIGH | Requires a manual data-repair script (find and break the cycle via direct SQL/admin tooling) before any recursive read will work again; add the cycle-prevention check immediately to stop recurrence, then backfill-audit existing data |
| Duplicate parent nodes already forked part of the tree | MEDIUM | Build (even a minimal) admin merge tool: reassign all child/spouse edges from the duplicate node to the canonical one, then delete the duplicate; requires careful transaction handling to avoid partial merges |
| Uploaded photos lost due to non-persistent volume | LOW–MEDIUM | If caught early (no real user data yet), simply add the named volume and re-upload test data; if real user photos were lost, there is no recovery — communicate loss and re-request uploads from users |
| Permission-scope bug allowed out-of-scope edits before being caught | MEDIUM–HIGH | Audit recent mutation history (if any audit log/timestamps exist) for edits made outside the intended scope; may require manually reviewing and reverting affected `FamilyMember` records; add the missing test before re-enabling the affected mutation |
| Membership gate bypass allowed an unlinked user to read/write family data | MEDIUM | Patch the missing resolver-level guard immediately; review what that user could have accessed (family data is likely low-sensitivity relative to auth credentials, but personal data like birthdate/address/photo is still exposed) and consider notifying affected members per the app's data-sensitivity posture |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. N+1 fan-out on deep tree | Relationship resolvers / data-model phase | Query-count assertion stays flat (not O(generations)) against a programmatic deep-tree fixture |
| 2. Unbounded recursive query depth | Relationship resolvers phase (same as #1) | A hand-crafted over-depth query is rejected by the depth-limit plugin in a test |
| 3. Cycles in parent/child graph | Data-model / relationship-mutation phase | Test asserts `setParent` rejects an edge that would make an ancestor a descendant |
| 4. Asymmetric spouse relationship | Data-model design phase | Test reads the relationship from both members of a pair and asserts equality |
| 5. Wrong cascade/orphan behavior on delete | Data-model design phase | Test deletes a member with children/spouse and asserts the exact, decided survival behavior |
| 6. Sibling dedup edge cases (half-siblings, duplicate parents) | Dedup-rule + `/manage` UI phase | Tests cover case/whitespace normalization, half-sibling false-positive is documented, and search-before-create UX is present |
| 7. Immediate-relatives scope computed wrong | Permission-scoping phase | Single `getEditableMemberIds` utility tested against explicit exclusion fixtures (grandparent, cousin, sibling-of-sibling) |
| 8. Relationship edits as privilege escalation | Permission-scoping phase (same as #7) | Test: linked Member A cannot unilaterally attach themselves to linked Member B's subtree without consent/admin approval |
| 9. Insecure file upload handling | File-upload phase | Adversarial fixtures (path traversal, mislabeled content, oversized file) are the first red tests, before the happy path |
| 10. Volume persistence / upload transport choice | File-upload phase (same as #9) | Manual/CI check: photo survives a container rebuild; REST-vs-GraphQL-multipart decision recorded as a Key Decision |
| 11. Membership gate is frontend-only | Membership-gating phase | Integration test: verified-but-unlinked JWT calling a family resolver directly is rejected |
| 12. First-admin bootstrap chicken-and-egg | Membership-gating phase (same as #11) | Integration test: fresh ADMIN with zero linked members can still create/link the first node; v1.1 admin-promotion regression test still passes |
| 13. `sync()`/DataLoader/permission logic diverges test-vs-prod | Continuous, starting at data-model phase | Fresh-DB `sync({ force: true })` smoke test; test harness reuses production's exact `context()`/DataLoader/guard wiring |

## Sources

- [Apollo GraphQL Docs — Fetching Data (DataLoader patterns)](https://www.apollographql.com/docs/apollo-server/data/fetching-data)
- [Apollo GraphQL Docs — Handling the N+1 Problem](https://www.apollographql.com/docs/graphos/schema-design/guides/handling-n-plus-one)
- [Using Apollo Server 4 to Solve the N+1 Problem with DataLoaders — CodeSignal](https://codesignal.com/learn/courses/advanced-graphql-data-patterns-and-fetching-1/lessons/using-apollo-server-4-to-solve-the-n1-problem-with-data-loaders)
- [MySQL 8.0 Labs — Recursive Common Table Expressions (CTEs), Part Three: Hierarchies](https://dev.mysql.com/blog-archive/mysql-8-0-labs-recursive-common-table-expressions-in-mysql-ctes-part-three-hierarchies/)
- [Cycle Detection for Recursive Search in Hierarchical Trees — sqlfordevs.com](https://sqlfordevs.com/cycle-detection-recursive-query)
- [Recursive CTE vs Closure Tables in MySQL — Medium](https://medium.com/@ramu.ramaiah/recursive-cte-vs-closure-tables-in-mysql-choosing-the-right-strategy-for-hierarchical-data-c1c89ebd264f)
- [Apollo Server File Upload Best Practices — Apollo GraphQL Blog](https://www.apollographql.com/blog/file-upload-best-practices)
- [GraphQL.org — Handling File Uploads in GraphQL](https://graphql.org/learn/file-uploads/)
- [Doyensec — "That single GraphQL issue that you keep missing" (GraphQL CSRF via multipart)](https://blog.doyensec.com/2021/05/20/graphql-csrf.html)
- [Apollo GraphQL Docs — CSRF Prevention](https://www.apollographql.com/docs/graphos/routing/security/csrf)
- [ReactFlow for Family Tree Visualization — tva.sg](https://www.tva.sg/insights/reactflow-family-tree-visualization)
- [family-chart — D3-based family tree visualization (GitHub)](https://github.com/donatso/family-chart)
- Internal: `.planning/codebase/CONCERNS.md` (existing scaling/pool/pagination concerns, no query depth limiting, `sync()` vs migrations debt)
- Internal: `.planning/PROJECT.md` (v1.1 first-admin race-safe promotion mechanism, v2.0 feature scope and deferred-scope boundaries)

---
*Pitfalls research for: Collaborative family-tree domain (v2.0 milestone) on Express/Apollo/Sequelize/MySQL/React stack*
*Researched: 2026-07-21*
