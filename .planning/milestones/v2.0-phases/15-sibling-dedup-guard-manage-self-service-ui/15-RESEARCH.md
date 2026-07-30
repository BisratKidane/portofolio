# Phase 15: Sibling Dedup Guard & /manage Self-Service UI - Research

**Researched:** 2026-07-23
**Domain:** Backend transactional write-guard (Sequelize/MySQL) + MUI React self-service CRUD UI over an existing GraphQL surface
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Relationship-grouped layout for the member view:** The member-user's editable
  scope renders as labelled sections — **You**, **Parents**, **Spouse**, **Children**,
  **Siblings** — each with its own `+ Add {relationship}` action. Rejected a flat card list
  and a mini-tree diagram: grouping makes the scope boundary self-explanatory (the page
  shows *why* each person is editable) and gives each Phase 14 add-mutation a natural home.
  The mini-tree overlaps Phase 17 and was explicitly deferred.
- **D-02 — Siblings section is derived, labelled as such:** Siblings come from
  `myEditableMembers` (shared-parent derivation, Phase 14 D-03), shown with a "derived"
  affordance, never presented as a stored edge.
- **D-03 — Searchable table → focus one member into the grouped panel:** The admin lands on
  a searchable, paginated table of all members (the whole tree can be hundreds of nodes).
  Selecting a member opens them in the **same** relationship-grouped panel the member-user
  sees, but with admin powers (rewire existing edges, delete, link account). One grouped
  component, two entry points (scoped list vs. table-focus). Rejected an unscoped flat
  grouped render (unusable at scale) and a fully separate admin screen (MNG-03 says "from
  the same page").
- **D-04 — Modal dialog, create-new default, in-scope picker secondary:** Clicking
  `+ Add {relationship}` opens a dialog whose primary path is entering a NEW person's fields
  (the overwhelmingly common case → one step). A secondary "or pick someone already in your
  family" control is offered where it applies, populated **only** with in-scope members
  (Phase 14 D-02 — the picker structurally cannot offer anything that would breach scope).
  Rejected an inline expanding form (page gets long with multiple sections open) and a
  two-step new-vs-existing chooser (extra click on the common case).
- **D-05 — Per-relationship form shape (maps to the Phase 14 mutations):**
  - **Add parent** → new person + a **mother/father role** selector (`addParent(role)`).
    No "other parent" picker.
  - **Add spouse** → new person; links via `addSpouse`.
  - **Add child** → new person + optional **"other parent"** picker (in-scope only) →
    `addChild(role, otherParentId?)`.
  - **Add sibling** → new person only; parents are **derived from the target**, no parent
    picker (`addSibling`). Surface Phase 14 D-04's "add a parent first" rejection as an
    inline message when the actor has no parent recorded.
- **D-06 — Locked relatives render read-only with no edit affordance:** A relative who has
  their OWN linked user account (D-06 field-lock) shows as a card *without* an edit button,
  plus a small "manages their own profile" hint. The UI never presents an action the backend
  will reject — no dead-end forms. Rejected "editable form, error on submit" (guaranteed-fail
  dead end) and "disable locked fields" (D-06 locks the whole record, so that equals
  read-only with more work). The member always sees these relatives (they're in scope) and
  can always edit their own record (self is in the editable set).
- **D-07 — Members add-only; admins rewire/delete:** Carried from Phase 14 D-05. Member edit
  forms expose plain fields + add-edge actions only. Rewiring an existing edge and deleting a
  member are admin-only affordances, shown only in the admin-focused panel.
- **D-08 — Service-layer hard block, applies to everyone:** Enforce the duplicate check in
  `backend/src/services/familyMember.service.js` on the `addChild` write path, so every
  caller — `addChild`, `addSibling` (which routes through `addChild`), admin attach, and any
  future caller — is covered by one function. Hard rejection (no admin override this phase)
  with an **actionable error naming the conflicting member** and its shared parent. Rejected a
  DB unique constraint (the "shares EITHER parent" / two-nullable-FK semantics aren't a simple
  column-tuple UNIQUE; would need a trigger/generated column — too heavy) and an admin-override
  path (extra flag + confirm step; an admin can edit after if a genuine same-name case arises).
- **D-09 — Comparison semantics:** Duplicate = another child sharing a **non-null `motherId`
  OR non-null `fatherId`** with the candidate, whose `firstname` matches **trimmed +
  case-folded**. Mirrors the either-parent sibling rule (Phase 14 D-03).
- **D-10 — Guard runs inside the insert transaction:** The check MUST execute in the same
  transaction as the `FamilyMember.create` it guards, so two concurrent adds cannot both pass
  the check and then both insert (TOCTOU). This intersects the still-open Phase 14 **WR-01**
  (`computeEditableScope`'s `{transaction}` option is accepted but never passed) — the dedup
  work is the natural place to start threading the shared transaction through, at least on the
  child-create path.
- **D-11 — "Creating OR linking" both fire the guard (REL-06 wording):** REL-06 covers
  creating *and linking* a child. Member adds are create-only (Phase 14 D-01), but the admin
  attach/rewire path must also run the guard — not only the create path.
- **D-12 — Reuse the existing ProtectedRoute gate:** `/manage` sits behind `ProtectedRoute`,
  which already redirects unlinked non-admins to `/pending` (Phase 13 D-06:
  `requireFamilyAccess` = linked member OR admin). Linked members get the scoped view, admins
  the full view; unlinked users never reach it. No new gating primitive needed — the member
  vs. admin view split happens *inside* the page based on `user.role`.

### Claude's Discretion

- Exact MUI composition (Dialog vs. Drawer for the add form, table pagination size, empty-state
  copy) — follow existing `AdminLinkMembers.jsx` conventions.
- Whether the admin table and the scoped member list share a single route component with a
  role branch or split into two — planner's call, as long as they share the grouped panel.

### Deferred Ideas (OUT OF SCOPE)

- **Admin override for intentional duplicate-name children** (twins, cultural naming) — not
  this phase; hard block for now, admin can edit after. Revisit if it comes up in practice.
- **Deep tree visualization / pan-zoom** — Phase 17 (`/family`).
- **Member→admin removal-request flow** — deferred per REQUIREMENTS PERM-03 note.
- **Threading `{transaction}` through the *entire* permission/scope layer (full WR-01 fix)** —
  this phase only threads it on the child-create/dedup path (D-10); the broader
  `computeEditableScope` TOCTOU remains a Phase 14 gap-closure candidate.

None of these block Phase 15's four success criteria.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-06 | Block creating/linking a child whose `firstname` duplicates an existing child sharing **either** parent | §Code Examples "REL-06 dedup guard", §Common Pitfalls #1–#3, exact `addChild` signature documented below |
| MNG-01 | Member-user sees a visible, editable-scope list on `/manage` | `myEditableMembers` shape documented below; §Architecture Patterns "Relationship-grouped panel" |
| MNG-02 | Add/edit members and wire relationships through forms picking existing members from dropdowns | `AdminLinkMembers.jsx` Autocomplete pattern documented and mapped to D-04/D-05 dialog shapes; GraphQL mutation contracts documented |
| MNG-03 | Admin manages whole tree + links accounts, from the same page | `familyMembers`/`unlinkedUsers`/`linkUserToMember` contracts documented; D-03 table→panel pattern |
| MNG-04 | `/manage` reachable only by linked members and admins | `ProtectedRoute.jsx` gate documented verbatim, zero new code required |
</phase_requirements>

## Summary

This phase adds no new libraries, no new database tables, and no new GraphQL mutations — it
is a **composition and threading** phase. The entire Phase 14 mutation surface
(`addParent`, `addSpouse`, `addChild`, `addSibling`, `editMember`, `deleteMember`,
`myEditableMembers`) already exists, is tested, and is exactly what the `/manage` UI drives.
The one new piece of backend logic (REL-06) is a single guard function inserted at one call
site (`addChild` in `backend/src/services/familyMember.service.js`), which both `addChild`
and `addSibling` resolvers already route through — so D-11's "every caller is covered by one
function" is achieved almost for free by construction, **provided** the guard is added inside
`addChild` itself rather than duplicated in each resolver.

The transactional subtlety is the real engineering risk: `addChild(attrs, { transaction } = {})`
currently does a bare `models.FamilyMember.create(attrs, { transaction })` with no read
before the write. Adding a "does a duplicate exist" `SELECT` immediately before the `CREATE`
inside the *same* transaction closes the naive race (two requests reading stale state from
different transactions) but does **not** close a genuine phantom-read race under MySQL's
default REPEATABLE READ isolation: two concurrent transactions can each run the duplicate
check, each see zero matching rows, and each insert. The Phase 14 review (WR-01) already
flagged this exact class of bug for the permission-scope check. D-10 explicitly asks for this
to be closed "at least on the child-create path" — the correct mechanism is a **row lock on
the shared parent** (`SELECT ... FOR UPDATE` on the `motherId`/`fatherId` parent row) taken
before the duplicate check, which serializes all concurrent `addChild` calls targeting the
same parent onto one connection at a time, closing the phantom-insert window without a new
migration or unique constraint.

On the frontend, `AdminLinkMembers.jsx` is a complete, working template for both dialog
patterns this phase needs (Autocomplete-driven "pick existing" and TextField-driven
"create new"), and `ProtectedRoute.jsx` already implements the exact linked-or-admin gate
MNG-04 requires with zero new code. The primary net-new frontend work is: one route, one
relationship-grouped panel component (reused for both member and admin views per D-03), one
add-relative dialog component parameterized by relationship type (D-05), and wiring `editMember`
+ (admin-only) `deleteMember`/rewire actions.

**Primary recommendation:** Add the REL-06 guard as a single new function called from inside
`addChild` (`backend/src/services/familyMember.service.js`), using a `SELECT ... FOR UPDATE`
row lock on the shared-parent row(s) to close the phantom-insert race before the duplicate-name
`SELECT`; build `/manage` as one route component with a role branch (`user.role === 'ADMIN'`)
that renders a shared `RelationshipGroupedPanel` component, fed either by `myEditableMembers`
(member) or by table-selection + `familyMember(id)` (admin), with the add-relative dialog
lifted and parameterized from `AdminLinkMembers.jsx`'s existing Autocomplete/TextField/
create-and-link patterns.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| REL-06 duplicate-name guard | API / Backend (service layer) | Database (row lock) | D-08 locks this in `familyMember.service.js`; the row lock that closes the TOCTOU is a DB-level primitive (`FOR UPDATE`) invoked from the service, not a DB constraint/trigger |
| `/manage` route gating (MNG-04) | Frontend Server / Client (React Router) | API / Backend (`requireFamilyAccess`) | `ProtectedRoute` is a client-side redirect for UX; every resolver still enforces `requireFamilyAccess`/`requireAdmin` server-side — the client gate is cosmetic, not the security boundary |
| Relationship-grouped panel rendering (MNG-01/02/03) | Browser / Client | API / Backend (`myEditableMembers`, `familyMember`) | Pure presentation over server-computed, server-trusted data; no client-side scope computation (Phase 14 PERM-05 invariant carries forward — the client never re-derives or trusts a client-supplied scope) |
| Add-relative dialog + in-scope picker (MNG-02) | Browser / Client | API / Backend (mutation validation) | The picker is populated from server-trusted `myEditableMembers` data, but the actual scope enforcement happens again server-side in the mutation resolver (defense in depth — the UI must never be the only gate) |
| Admin account-linking (MNG-03) | Browser / Client | API / Backend (`linkUserToMember`) | UI re-homes `AdminLinkMembers.jsx`'s existing behavior into `/manage`; no new backend capability |
| Field-lock read-only rendering (D-06) | Browser / Client | API / Backend (`linkedUser` field) | UI reads `linkedUser` (already gated CR-01-fixed in Phase 14) to decide render mode; the actual edit rejection is still enforced server-side in `editMember` |

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mui/material` | 6.3.1 `[VERIFIED: frontend/package.json]` | Dialog, Autocomplete, Table/TablePagination, Chip, Avatar, Alert, Stack, Paper primitives for `/manage` | Already the project's sole design system (per UI-SPEC — no shadcn gate applies); zero new dependency |
| `@mui/icons-material` | 6.3.1 `[VERIFIED: frontend/package.json]` | Section icons matching Dashboard's Rounded-icon convention | Same design-system mandate |
| `@apollo/server` | 4.11.3 `[VERIFIED: backend/package.json]` | Executes the `addChild`/`addSibling`/`editMember` mutations the UI drives | Already the project's GraphQL runtime; no new mutation added |
| `sequelize` | 6.37.5 `[VERIFIED: backend/package.json]` | `sequelize.transaction()`, row-level locking (`transaction.LOCK.UPDATE`) for the REL-06 guard | Already the project's ORM; the dedup guard is implemented entirely with Sequelize's existing transaction/locking API — no new package |
| `mysql2` | 3.11.5 (installed) / 3.23.1 latest `[VERIFIED: npm view mysql2 version]` | MySQL driver underneath Sequelize; supports `SELECT ... FOR UPDATE` via Sequelize's `lock` option | No upgrade needed for this phase; row-locking is a stable MySQL feature |
| `vitest` | 4.1.10 `[VERIFIED: backend/package.json, frontend/package.json]` | Backend service/resolver tests + frontend component tests (TDD red→green, project standard) | Already the sole test runner across both workspaces |
| `@testing-library/react` + `@testing-library/user-event` | 16.3.2 / 14.6.1 `[VERIFIED: frontend/package.json]` | `/manage` component tests, following `AdminLinkMembers.test.jsx` conventions | Established frontend test pattern |

### Supporting

None. This phase installs **no new dependency** in either workspace — it is pure composition
over Phase 12–14's data model, resolvers, and existing MUI/RTL/Vitest tooling.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Row lock (`FOR UPDATE`) on the shared-parent row to close the REL-06 TOCTOU | A DB unique constraint/trigger on `(motherId, fatherId, firstname_normalized)` | Rejected explicitly by D-08: the "shares EITHER parent" semantics (two independently-nullable FK columns, OR not AND) don't map onto a simple column-tuple `UNIQUE` index; a generated/virtual column plus trigger would work but is "too heavy" per the user's own stated rationale — the row-lock approach needs no schema change |
| Row lock (`FOR UPDATE`) | Application-level advisory lock / mutex (e.g., `GET_LOCK()` in MySQL, or a Redis lock) | Unnecessary extra infra for a single-process Node/Express app talking to one MySQL instance; a plain transactional row lock is the standard, zero-dependency pattern for this exact "check then insert" race and matches the codebase's existing transaction-based concurrency control (see `verifyEmail`'s `FOR UPDATE` admin-count lock in `user.resolver.js:179`, and `resetPassword`'s conditional-update pattern) |
| One shared `RelationshipGroupedPanel` component (D-03) for both member and admin views | Two entirely separate components/pages | Rejected by MNG-03's "from the same page" requirement and the CONTEXT.md discretion note; a single component with an admin-powers prop/flag is simpler to keep in sync with future Phase 17 changes |
| Reusing `AdminLinkMembers.jsx`'s Autocomplete/TextField patterns directly | Building a new generic form library / a schema-driven form generator | Over-engineering for four structurally similar forms (parent/spouse/child/sibling); the existing hand-rolled pattern is small, tested, and already matches the design system |

**Installation:** None — no `npm install` required this phase.

**Version verification:** All versions above were read directly from `backend/package.json`
and `frontend/package.json` (already-installed, lockfile-pinned versions) — this is
authoritative for "what's actually in this repo," not a registry lookup for a new package.
`mysql2@3.23.1` was confirmed as the current npm registry `latest` via `npm view mysql2 version`
purely to confirm no urgent security-relevant upgrade is pending; the installed `3.11.5` is
retained (no upgrade is in scope for this phase).

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** Every library used
(`@mui/material`, `@mui/icons-material`, `sequelize`, `@apollo/server`, `vitest`,
`@testing-library/react`, `@testing-library/user-event`) is already a locked, installed
dependency in `backend/package.json` / `frontend/package.json`, verified by direct file read
(`[VERIFIED: backend/package.json]` / `[VERIFIED: frontend/package.json]`) rather than a
registry lookup. The slopcheck/registry-verification gate in this protocol exists to catch
hallucinated or newly-published packages being introduced into a plan — no such package is
being introduced here, so the gate does not apply. If a future gap-closure decides to add a
library (e.g., a form-schema validator), that decision must re-trigger this gate at that time.

## Architecture Patterns

### System Architecture Diagram

```
Browser (/manage)
  │
  ├─ ProtectedRoute (client gate, MNG-04)
  │     - redirects !user → /login
  │     - redirects (no familyMemberId && role!=ADMIN) → /pending
  │     - else renders <Outlet/> → ManagePage
  │
  ManagePage (role branch: user.role === 'ADMIN' ?)
  │
  ├── Member branch ─────────────────────────────────────┐
  │     useEffect → graphqlRequest(MY_EDITABLE_MEMBERS_QUERY)
  │       → myEditableMembers { ...FamilyMemberFields }   │
  │     group rows by relation-to-self (client groups     │
  │     the flat list into You/Parents/Spouse/Children/   │
  │     Siblings using self.motherId/fatherId/spouses/     │
  │     children/siblings ids already present in each row) │
  │     → <RelationshipGroupedPanel scope="member" .../>   │
  │                                                        │
  ├── Admin branch ───────────────────────────────────────┤
  │     useEffect → graphqlRequest(FAMILY_MEMBERS_QUERY)   │
  │       → familyMembers { id firstname lastname          │
  │              fullname } (paginated client-side or      │
  │              server-paginated table)                   │
  │     onRowSelect(member) →                              │
  │       graphqlRequest(FAMILY_MEMBER_QUERY, {id})         │
  │         → familyMember(id) { ...deep relations }        │
  │       → <RelationshipGroupedPanel scope="admin" .../>   │
  │     "Link account" affordance reuses                    │
  │       UNLINKED_USERS_QUERY + LINK_USER_TO_MEMBER_MUTATION│
  │       lifted verbatim from AdminLinkMembers.jsx          │
  │                                                          │
  └── <RelationshipGroupedPanel/> (shared, D-03)  ◄──────────┘
        │
        ├─ Section: You            (self card, always editable)
        ├─ Section: Parents        (+ Add parent → AddRelativeDialog)
        ├─ Section: Spouse         (+ Add spouse → AddRelativeDialog)
        ├─ Section: Children       (+ Add child  → AddRelativeDialog)
        └─ Section: Siblings       (derived Chip, + Add sibling → AddRelativeDialog)
              each card: if member.linkedUser && !isAdmin && linkedUser.id !== self.id
                          → read-only card + "Manages their own profile" (D-06)
                         else → editable card (Edit → editMember; admin: rewire/Delete)

  AddRelativeDialog(relationshipType, targetId)
        │
        ├─ primary path: TextField form (firstname/lastname/gender/optional fields)
        │     → addParent | addSpouse | addChild | addSibling mutation
        └─ secondary path (parent/child only, D-04/D-05):
              Autocomplete over in-scope members (from myEditableMembers/scope)
              → addChild(otherParentId) only — parent/spouse/sibling never take
                an existing-node id per Phase 14 D-01 (create-only structural rule)

Backend (unchanged mutation surface, Phase 14):
  addParent / addSpouse / addChild / addSibling / editMember / deleteMember
        │
        ▼
  familyMember.service.js
        │
        └─ addChild(attrs, { transaction }) ── NEW: REL-06 guard runs here ──┐
              1. determine candidate's parent ids from attrs.motherId/fatherId │
              2. SELECT ... FOR UPDATE the parent row(s) (serializes           │
              3. SELECT existing children of those parent(s) whose             │
                 firstname (TRIM+LOWER) matches attrs.firstname (TRIM+LOWER)   │
              4. if found → throw named, actionable Error                      │
              5. else → FamilyMember.create(attrs, { transaction })  ◄─────────┘
```

### Recommended Project Structure

```
frontend/src/
├── pages/
│   ├── ManagePage.jsx              # NEW — route component, role branch (D-03)
│   ├── AdminLinkMembers.jsx        # BECOMES a <Navigate to="/manage" replace /> redirect
│   └── ManagePage.test.jsx         # NEW — colocated RTL test, mirrors AdminLinkMembers.test.jsx
├── components/
│   ├── manage/
│   │   ├── RelationshipGroupedPanel.jsx   # NEW — shared member/admin panel (D-03)
│   │   ├── RelationshipGroupedPanel.test.jsx
│   │   ├── AddRelativeDialog.jsx          # NEW — parameterized by relation type (D-04/D-05)
│   │   ├── AddRelativeDialog.test.jsx
│   │   ├── MemberCard.jsx                 # NEW — card w/ D-06 read-only branch
│   │   └── AdminMemberTable.jsx           # NEW — searchable/paginated table (D-03)
│   └── ProtectedRoute.jsx           # UNCHANGED — already satisfies MNG-04 (D-12)
├── App.jsx                          # MODIFIED — add /manage route, redirect old route

backend/src/
├── services/
│   └── familyMember.service.js      # MODIFIED — addChild gains the REL-06 guard
├── services/
│   └── familyMember.dedup.test.js   # NEW — TDD red-first tests for the guard
└── resolvers/
    └── familyMember.resolver.js     # UNCHANGED (addChild/addSibling already route through the service)
```

### Pattern 1: Row-locked duplicate check inside an existing transaction (REL-06 / D-10)

**What:** Take a `SELECT ... FOR UPDATE` lock on the shared-parent row(s) before running the
duplicate-name `SELECT`, all inside the transaction the caller already opened and passes in.
**When to use:** Any "check invariant across sibling rows, then insert" write where the
invariant spans two nullable FK columns (motherId OR fatherId) and no DB constraint can
express it directly.
**Example (mirrors the codebase's own `FOR UPDATE` pattern in `user.resolver.js:179`):**
```javascript
// Source: pattern generalized from backend/src/resolvers/user.resolver.js:178-181
// (existing "SELECT ... FOR UPDATE" admin-count lock inside verifyEmail's transaction)
export async function addChild(attrs, { transaction } = {}) {
  const parentIds = [attrs.motherId, attrs.fatherId].filter((id) => id != null);

  if (parentIds.length > 0 && transaction) {
    // Lock the parent row(s) first: this serializes any other addChild/addSibling
    // call that also targets one of these parents onto the same connection,
    // closing the phantom-insert race a bare SELECT-then-INSERT would leave open.
    await models.FamilyMember.findAll({
      where: { id: parentIds },
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    const conflict = await models.FamilyMember.findOne({
      where: {
        [Op.or]: parentIds.map((pid) => ({ [Op.or]: [{ motherId: pid }, { fatherId: pid }] })),
        firstname: sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('firstname'))),
          attrs.firstname.trim().toLowerCase()
        )
      },
      include: [{ association: 'mother' }, { association: 'father' }],
      transaction
    });

    if (conflict) {
      const sharedParent = parentIds.includes(conflict.motherId) ? conflict.mother : conflict.father;
      throw new Error(
        `A child named '${conflict.firstname}' already exists under ${sharedParent.fullname}. ` +
        'Pick a different name, or edit the existing member.'
      );
    }
  }

  return models.FamilyMember.create(attrs, { transaction });
}
```
**Note:** This runs inside the same transaction the resolver already opens
(`models.User.sequelize.transaction(async (t) => { ... return addChild(attrs, { transaction: t }); })`
— see `familyMember.resolver.js:131-145` and `:165-193`), so D-10 is satisfied without any
resolver change; both `addChild` and `addSibling` get the guard automatically (D-11).

### Pattern 2: Relationship-grouped panel fed by two data sources (D-01/D-03)

**What:** One presentational component takes a normalized `{ self, parents, spouses,
children, siblings }` shape (the exact shape `computeEditableScope`/`myEditableMembers`
already returns) regardless of whether the data came from `myEditableMembers` (member) or
`familyMember(id)` + client-side grouping (admin, after table-selection).
**When to use:** Whenever the member view and admin-focused view must render identically
except for available actions (D-03's "one grouped component, two entry points").
**Example:**
```jsx
// Source: shape modeled on backend/src/services/familyMember.service.js:108-160
// (computeEditableScope's return shape) and familyMember.resolver.js:24-36 (myEditableMembers)
function groupByRelation(rows, self) {
  const parentIds = [self.motherId, self.fatherId].filter(Boolean).map(Number);
  const spouseIds = new Set((self.spouses ?? []).map((s) => s.id));
  const childIds = new Set((self.children ?? []).map((c) => c.id));
  const siblingIds = new Set((self.siblings ?? []).map((s) => s.id));
  return {
    parents: rows.filter((r) => parentIds.includes(r.id)),
    spouses: rows.filter((r) => spouseIds.has(r.id)),
    children: rows.filter((r) => childIds.has(r.id)),
    siblings: rows.filter((r) => siblingIds.has(r.id)),
  };
}
```

### Pattern 3: In-scope-only Autocomplete picker (D-04, reused from `AdminLinkMembers.jsx`)

**What:** `AdminLinkMembers.jsx:113-120` already implements exactly the Autocomplete the
add-child "other parent" picker needs — options list, `getOptionLabel`, controlled
`value`/`onChange`, MUI `TextField` render prop.
**When to use:** Any "pick an existing member" secondary path (D-04) — the only difference
for `/manage` is the `options` array must be pre-filtered to the actor's `scope.ids` (never
the whole `familyMembers` list, unlike the admin-only `AdminLinkMembers` page which is
allowed to show every member).
**Example:**
```jsx
// Source: frontend/src/pages/AdminLinkMembers.jsx:113-120 (verbatim pattern to reuse)
<Autocomplete
  options={inScopeMembers}                 // NEW: filtered to scope.ids, not all members
  getOptionLabel={(member) => member.fullname}
  value={selectedOtherParent}
  onChange={(_event, value) => setSelectedOtherParent(value)}
  sx={{ minWidth: 260, flexGrow: 1 }}
  renderInput={(params) => <TextField {...params} label="Other parent (optional)" />}
/>
```

### Anti-Patterns to Avoid

- **Duplicating the REL-06 check inside `addSibling`'s resolver or a second service
  function:** D-08 requires ONE function guarding every caller. If the check is written a
  second time in the resolver (matching the existing scope-check duplication pattern already
  present for `addParent`/`addSpouse`/`addChild`/`addSibling`), a future caller can bypass it
  the same way `addSibling` bypassed the SC-4 scope check in Phase 14 (CR-02) until it was
  fixed to hoist a shared check. Put the guard inside `addChild` in the service module, not in
  a resolver.
- **Checking for a duplicate with a bare `SELECT` and no lock:** This is the exact TOCTOU
  Phase 14's WR-01 already flagged for `computeEditableScope`. A `SELECT` immediately followed
  by an `INSERT` in the same transaction still allows two concurrent transactions to both read
  "no duplicate" under MySQL's default REPEATABLE READ isolation. Lock the parent row(s) first.
- **Re-deriving editable scope on the client:** The client must only ever *display* what
  `myEditableMembers`/`familyMember` returns and *submit* mutations — never compute its own
  "is this in scope" logic to decide what to show in the Autocomplete or whether to render an
  edit button. The server is the only source of truth (Phase 14 PERM-05 invariant, carried
  into this phase's Architectural Responsibility Map).
- **Building a second design system or a generic form-schema library for four similar
  forms:** Explicitly rejected by the UI-SPEC's design-system note and the "Alternatives
  Considered" table above — reuse `AdminLinkMembers.jsx`'s hand-rolled TextField pattern.
- **Presenting an edit button on a `linkedUser`-locked relative and letting the mutation
  fail:** D-06 requires the UI to structurally omit the affordance, not catch-and-display the
  server's `'This member manages their own profile and cannot be edited by others.'` error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Duplicate-sibling detection race condition | A custom mutex/semaphore, a Redis lock, or an in-memory `Set` of "names being inserted" | Sequelize's `lock: transaction.LOCK.UPDATE` (`SELECT ... FOR UPDATE`) on the parent row, inside the existing transaction | The codebase already uses this exact primitive for a structurally identical problem (`verifyEmail`'s single-ADMIN-slot race, `user.resolver.js:178-181`); a custom lock adds an unnecessary moving part and its own race conditions |
| "Pick an existing relative" UI | A new generic combobox/search component | MUI `Autocomplete`, exactly as used in `AdminLinkMembers.jsx:113-120` | Already tested, already matches the design system, already handles the exact "search a small in-memory list of members" use case this phase needs |
| Case-insensitive/trimmed name comparison in SQL | A new normalization utility with custom locale-aware folding | `sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col(...)))` compared against `.trim().toLowerCase()` on the JS side | D-09's semantics ("trimmed + case-folded") are exactly what SQL `LOWER(TRIM(...))` plus JS `.trim().toLowerCase()` already provide; no Unicode-normalization library is warranted for a single-family, Latin-script name set (flag as an assumption below if the family has non-Latin names) |
| Route gating for `/manage` | A new `RequireLinkedMember` wrapper or a new auth context flag | The existing `ProtectedRoute` component, exactly as used for `dashboard` | `ProtectedRoute.jsx:16-18` already implements the precise linked-or-admin rule MNG-04 needs; zero new code (D-12) |

**Key insight:** Every "don't hand-roll" item in this phase already has a working, tested
precedent *somewhere else in this same codebase*. The research risk here is not "what library
should we use" — it is "did we find and reuse the existing precedent, or did we quietly
re-implement it slightly differently" (as Phase 14's `addSibling` did with the scope check).

## Common Pitfalls

### Pitfall 1: Naive check-then-insert leaves the REL-06 TOCTOU exactly as open as before
**What goes wrong:** A `SELECT` for an existing duplicate followed by `FamilyMember.create()`
in the same transaction *looks* like it satisfies D-10, but under MySQL's default REPEATABLE
READ isolation two concurrent transactions each get a consistent snapshot from the moment
their transaction (or first statement) began — both can see zero duplicates and both insert.
**Why it happens:** "Runs in the same transaction" is necessary but not sufficient; it
prevents one class of race (reading committed-after-check data) but not the classic
insert-phantom race, which requires a lock, not just transactional isolation.
**How to avoid:** Take a `SELECT ... FOR UPDATE` lock on the shared-parent row(s) *before*
the duplicate-check `SELECT` (Pattern 1 above). This serializes all `addChild` calls
targeting the same parent onto one connection at a time.
**Warning signs:** A test that runs two `addChild` calls sequentially (not concurrently) and
asserts the second is rejected will pass even with the naive implementation — it does not
prove the race is closed. The planner should specify a genuinely concurrent test (two
`Promise.all([...])`-launched `addChild` calls against the same parent/name) as the proof for
D-10, not a sequential one.

### Pitfall 2: `addChild(attrs, { transaction })` has no built-in transaction — callers must supply one
**What goes wrong:** `addChild`'s current signature is `addChild(attrs, { transaction } = {})`
— if it is ever called *without* a transaction (e.g., a future direct-attach admin mutation,
or a test that calls the service function directly), the new lock-based guard has nothing to
lock against, silently reducing to the (still-buggy) naive check.
**Why it happens:** The function's own destructured default (`{ transaction } = {}`) makes it
easy to call without a transaction and have it "work" (no error, no lock) — the phase's tests
must actively exercise this.
**How to avoid:** Either make the guard a no-op with a loud comment when `transaction` is
missing (documenting the gap explicitly), or — safer — have `addChild` open its own
`sequelize.transaction()` when none is supplied (mirroring `setSpouse`'s existing
caller-supplied-or-fresh-transaction pattern at `familyMember.service.js:71-80`), so the guard
is *always* correctly locked regardless of caller discipline.
**Warning signs:** Any new test calling `addChild(attrs)` with no second argument and
asserting the dedup guard still fires.

### Pitfall 3: Comparing `attrs.firstname` before `sanitizeNewMember` runs
**What goes wrong:** `sanitizeNewMember` (in `user.resolver.js`, imported into
`familyMember.resolver.js`) trims strings and blank-to-null's optional fields, but it runs in
the **resolver**, before `attrs` is passed into `addChild`. If a future refactor moves the
guard earlier in the call chain, or a caller bypasses `sanitizeNewMember`, the guard could
compare an untrimmed `firstname` against already-trimmed stored values (asymmetric
comparison), producing false negatives.
**Why it happens:** `sanitizeNewMember`'s trimming and the REL-06 guard's own "trimmed +
case-folded" comparison (D-09) are two separate normalization steps that must both actually
run, in the right order, for every code path.
**How to avoid:** Do the `.trim().toLowerCase()` normalization *inside* the guard itself on
whatever `firstname` it receives, rather than assuming the caller already normalized it —
belt-and-suspenders, matches D-09's own wording ("trimmed + case-folded" is the guard's job,
not the input-sanitizer's).
**Warning signs:** A test creating a child via `addSibling` (which builds `attrs` inline in
the resolver, not through the same `sanitizeNewMember` call used for the primary `newMember`
field — re-check `familyMember.resolver.js:187` to confirm `sanitizeNewMember(newMember)` is
applied) whose `firstname` has leading/trailing whitespace.

### Pitfall 4: Forgetting the admin path also needs the guard (D-11)
**What goes wrong:** Because admins bypass the `computeEditableScope` scope check
(`isAdmin` branches skip it throughout `familyMember.resolver.js`), it is tempting to also
skip other guards "for admins." REL-06 is explicitly NOT a scope/permission rule — D-08 says
it is a hard block "applies to everyone," with no admin override this phase.
**Why it happens:** The codebase's existing pattern of `if (!isAdmin) { ...scope check... }`
scattered through every mutation makes "admin skips this check" the path of least resistance
to copy-paste.
**How to avoid:** Put the guard inside `addChild` itself (Pattern 1), which both admin and
non-admin calls to `addChild`/`addSibling` pass through unconditionally — do not gate it
behind `isAdmin` anywhere.
**Warning signs:** A test where an ADMIN actor calls `addChild` creating a duplicate-named
sibling and the mutation unexpectedly succeeds.

### Pitfall 5: `myEditableMembers`' flat list loses "who is whose parent/spouse/child" once flattened
**What goes wrong:** `myEditableMembers` (as currently implemented) returns a **flat,
de-duplicated array** of `FamilyMember` rows (`familyMember.resolver.js:24-36`) — it does not
return the categorized `{ parents, spouses, children, siblings }` shape that
`computeEditableScope` internally computes. Building the grouped panel (D-01) purely from this
flat list requires re-deriving categories client-side from each row's own `motherId`/
`fatherId`/`spouses`/`children`/`siblings` GraphQL fields, which means the `myEditableMembers`
GraphQL query must explicitly request those relationship sub-fields, not just flat scalars.
**Why it happens:** `myEditableMembers`'s SDL return type is `[FamilyMember!]!`, a flat list;
the categorization was an internal implementation detail of `computeEditableScope`, not
exposed as-is over GraphQL.
**How to avoid:** The planner should decide (and this is worth flagging to discuss-phase or
resolving at plan time): either (a) the frontend requests `myEditableMembers { id firstname
lastname fullname mother { id } father { id } spouses { id } children { id } siblings { id }
linkedUser { id } }` and groups client-side using `self`'s own relation ids (Pattern 2 above),
or (b) a new lightweight non-mutating change exposes `self`/`parents`/`spouses`/`children`/
`siblings` as separate typed fields on a `MyEditableScope` type. **Option (a) requires no
schema change** and is consistent with "Phase 14 already shipped the full query surface" —
recommended.
**Warning signs:** A frontend implementation that calls `myEditableMembers` once per relation
category (four separate queries) instead of one query with nested selections — this would be
both wasteful and inconsistent with the existing single-query dashboard pattern.

## Code Examples

### REL-06 dedup guard — GREEN-state target implementation

```javascript
// Source: backend/src/services/familyMember.service.js (extending the existing addChild)
import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../models/index.js';

export async function addChild(attrs, { transaction } = {}) {
  const run = async (t) => {
    const parentIds = [attrs.motherId, attrs.fatherId].filter((id) => id != null);

    if (parentIds.length > 0) {
      // Lock the parent(s) first -- serializes concurrent addChild/addSibling
      // calls targeting the same parent, closing the phantom-insert race a
      // bare SELECT-then-INSERT would leave open (D-10).
      await models.FamilyMember.findAll({
        where: { id: parentIds },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      const normalizedFirstname = attrs.firstname.trim().toLowerCase();

      const conflict = await models.FamilyMember.findOne({
        where: {
          [Op.and]: [
            { [Op.or]: parentIds.flatMap((pid) => [{ motherId: pid }, { fatherId: pid }]) },
            sequelize.where(
              sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('firstname'))),
              normalizedFirstname
            )
          ]
        },
        include: [{ association: 'mother' }, { association: 'father' }],
        transaction: t
      });

      if (conflict) {
        const sharedParent =
          parentIds.includes(conflict.motherId) ? conflict.mother : conflict.father;
        throw new Error(
          `A child named '${conflict.firstname}' already exists under ${sharedParent.fullname}. ` +
          'Pick a different name, or edit the existing member.'
        );
      }
    }

    return models.FamilyMember.create(attrs, { transaction: t });
  };

  // Mirrors setSpouse's existing "run in caller's transaction if supplied,
  // else open a fresh one" convention (familyMember.service.js:71-80) --
  // guarantees the guard is always correctly locked, even if a future
  // caller forgets to pass a transaction (Pitfall 2).
  if (transaction) return run(transaction);
  return sequelize.transaction((t) => run(t));
}
```

### `myEditableMembers` query shape the `/manage` member view should send

```graphql
# Source: backend/src/schemas/familyMember.schema.js + resolver at
# backend/src/resolvers/familyMember.resolver.js:24-36 (flat list, so nested
# relation ids are requested per-row to allow client-side grouping — see
# Common Pitfalls #5)
query MyEditableMembers {
  myEditableMembers {
    id
    firstname
    lastname
    fullname
    gender
    birthdate
    deathdate
    phone
    email
    address
    mother { id }
    father { id }
    spouses { id fullname }
    children { id fullname }
    siblings { id fullname }
    linkedUser { id }
  }
}
```

### Admin table + focus query shape

```graphql
# Source: backend/src/schemas/familyMember.schema.js — familyMembers (admin-only,
# requireAdmin) already returns exactly the flat, sorted list a searchable table needs
query FamilyMembersTable {
  familyMembers {
    id
    firstname
    lastname
    fullname
    gender
    linkedUser { id name email }
  }
}

# On row-select, fetch the full grouped detail exactly like the member view:
query FamilyMemberFocus($id: ID!) {
  familyMember(id: $id) {
    id firstname lastname fullname gender birthdate deathdate phone email address
    mother { id fullname }
    father { id fullname }
    spouses { id fullname }
    children { id fullname }
    siblings { id fullname }
    linkedUser { id name email }
  }
}
```

### Every mutation the `/manage` UI must send (exact SDL, from `familyMember.schema.js:66-73`)

```graphql
mutation AddParent($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!) {
  addParent(memberId: $memberId, role: $role, newMember: $newMember) { id fullname }
}
mutation AddSpouse($memberId: ID!, $newMember: NewFamilyMemberInput!) {
  addSpouse(memberId: $memberId, newMember: $newMember) { id fullname }
}
mutation AddChild($memberId: ID!, $role: ParentRole!, $newMember: NewFamilyMemberInput!, $otherParentId: ID) {
  addChild(memberId: $memberId, role: $role, newMember: $newMember, otherParentId: $otherParentId) { id fullname }
}
mutation AddSibling($memberId: ID!, $newMember: NewFamilyMemberInput!) {
  addSibling(memberId: $memberId, newMember: $newMember) { id fullname }
}
mutation EditMember($id: ID!, $fields: EditFamilyMemberInput!) {
  editMember(id: $id, fields: $fields) { id firstname lastname fullname gender mothersname email birthdate deathdate phone address }
}
mutation DeleteMember($id: ID!) {
  deleteMember(id: $id)
}
mutation LinkUserToMember($userId: ID!, $memberId: ID, $newMember: NewFamilyMemberInput) {
  linkUserToMember(userId: $userId, memberId: $memberId, newMember: $newMember) { id familyMemberId }
}
```

`NewFamilyMemberInput` fields (`familyMember.schema.js:33-43`): `firstname` (required),
`lastname` (required), `gender` (required enum `Male|Female|Other`), `mothersname`, `email`,
`birthdate`, `deathdate`, `phone`, `address` (all optional) — identical field set to
`AdminLinkMembers.jsx`'s existing `EMPTY_FORM`/`TextField` block, which can be reused verbatim.

`EditFamilyMemberInput` (`familyMember.schema.js:48-58`) is **structurally identical except it
has no `gender`... wait, it does have `gender` optional** — it has no edge-mutating field
(no motherId/fatherId/spouse reference) by design (D-05/D-07): only
`firstname/lastname/gender/mothersname/email/birthdate/deathdate/phone/address`, all optional.

## State of the Art

| Old Approach (Phase 13/14) | Current Approach (Phase 15) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Account linking lives on its own admin-only page (`/admin/link-members`) | Account linking is absorbed into `/manage`'s admin view (MNG-03) | This phase | `AdminLinkMembers.jsx` becomes a thin `<Navigate to="/manage" replace />`; its component logic (Autocomplete/TextField/create-and-link) is lifted into `/manage`'s components, not deleted |
| No duplicate-name protection on `addChild`/`addSibling` | REL-06 hard-blocks same-first-name children sharing either parent | This phase | First guard in the codebase enforcing a **data-integrity invariant that spans two nullable FK columns with OR semantics** — no existing precedent in Phase 12-14 to copy verbatim (unlike scope checks, which had precedent); this is genuinely new logic, not just composition |
| `computeEditableScope`'s `{ transaction }` param exists but is dead code (WR-01) | The dedup guard is the first caller to actually open-and-thread a transaction into a permission/invariant-check-then-write path from the start | This phase (partial WR-01 fix, D-10 scope only) | Establishes the pattern (open transaction first, pass `t` to every read+write) that the broader WR-01 fix (deferred) would generalize to `computeEditableScope`'s scope checks |

**Deprecated/outdated:** None — this phase does not deprecate any Phase 12-14 mutation or
model; it is purely additive (one new guard) plus a UI consolidation.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `firstname` comparison for REL-06 needs only ASCII/Latin-script `.trim().toLowerCase()` case-folding, with no Unicode normalization (NFC/NFD) or locale-aware collation | Don't Hand-Roll, Pitfall 3 | If family member names use non-Latin scripts or combining diacritics stored in different normalization forms, a real duplicate could be missed (false negative) — low likelihood for a single hand-entered family tree, but worth a one-line confirmation from the user since REQUIREMENTS.md's "Agne lineage" note suggests real (possibly Amharic-origin, transliterated) names will be entered |
| A2 | `myEditableMembers` should stay a flat list and the frontend should group client-side by requesting nested relation ids (Option (a) in Pitfall 5), rather than the backend adding a new typed `MyEditableScope` response shape | Common Pitfalls #5, Code Examples | If the planner instead decides a schema change is warranted, that is a new (small) GraphQL surface change not covered by "Phase 14 already shipped the full query surface" in CONTEXT.md's out-of-scope list — worth an explicit planner decision, not an assumption baked silently into task breakdown |
| A3 | The REL-06 guard should open its own transaction when none is supplied (rather than being a documented no-op without one) | Common Pitfalls #2, Code Examples | If the planner instead chooses "no-op without an explicit transaction," any future direct caller of `addChild` without a transaction gets silent unguarded inserts — worth pinning explicitly in the plan's acceptance criteria either way |
| A4 | No isolation-level override exists in `backend/src/config/database.js` beyond Sequelize/mysql2 defaults, so transactions run under MySQL's default REPEATABLE READ | Summary, Pitfall 1 | Confirmed by direct read of `database.js` (no `isolationLevel` option present) — HIGH confidence, not really an assumption, but flagged because the exact isolation level determines whether the phantom-read race is even possible absent a lock (it is, under REPEATABLE READ and READ COMMITTED both, for INSERT-vs-INSERT races — `FOR UPDATE` is warranted regardless) |

## Open Questions

1. **Should the admin's "focus a member" detail query (`familyMember(id)`) request the same
   deep relation set as `myEditableMembers`, or a narrower one?**
   - What we know: `Query.familyMember(id: ID!)` exists, is guarded by `requireFamilyAccess`
     (any linked user, not just admin — see Phase 14 review CR-01, already fixed for
     `linkedUser` specifically), and returns the same `FamilyMember` type with all relation
     fields available.
   - What's unclear: Whether the admin-focused panel needs `mother`/`father`/`spouses`/
     `children`/`siblings` all resolved one level deep (as sketched above) or whether some
     should be deferred/paginated for members with very large sibling sets.
   - Recommendation: Start with the same shape as `myEditableMembers` (Code Examples above);
     the existing DataLoader batching (Phase 14) makes this cheap regardless of table size,
     since only the focused member's own relations are fetched, not the whole tree.

2. **Does the admin table (D-03) need server-side pagination, or is client-side pagination
   over `familyMembers` (which returns the *entire* table, unpaginated, per its current SDL)
   sufficient for a single-family tree at the stated ~10-23 generation depth?**
   - What we know: `Query.familyMembers` currently has no `limit`/`offset`/cursor arguments —
     it returns every row, sorted by lastname/firstname. STATE.md's blockers note this is a
     "hand-built single-family tree," not crowd-scale.
   - What's unclear: Whether hundreds of rows (CONTEXT.md's own estimate) fetched unpaginated
     and paginated only in the MUI `TablePagination` component client-side is acceptable, or
     whether the resolver needs new `limit`/`offset` arguments (a schema change outside "Phase
     14 already shipped the full query surface").
   - Recommendation: Client-side `TablePagination` over the full `familyMembers` result is
     almost certainly sufficient at "hundreds of nodes" scale and requires zero backend
     change — recommended default; flag to the planner as a discretion point only if the real
     data size turns out larger than expected.

## Environment Availability

Skipped — this phase introduces no new external dependency, service, or tool beyond what
Phases 12-14 already established and exercised in CI (Node 24.x per `.nvmrc`/`package.json`
`engines` — note this is a newer pin than CLAUDE.md's documented "Node 18.x", `[ASSUMED]`
stale doc, not a blocker for this phase since no environment change is being made here; MySQL
8+ via the existing `docker-compose.yml`/test-db setup; npm workspaces; Vitest/RTL/jsdom
already configured in both `vitest.config.js` files).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (backend + frontend, shared config pattern) |
| Config file | `backend/vitest.config.js`, `frontend/vitest.config.js` |
| Quick run command | `npm --workspace backend run test -- src/services/familyMember.dedup.test.js` / `npm --workspace frontend run test -- src/pages/ManagePage.test.jsx` |
| Full suite command | `npm --workspace backend run test` / `npm --workspace frontend run test` (both wired into root CI per Phase 6) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-06 | Rejects a duplicate-firstname child sharing either parent (create path) | integration (resolver, via `graphql()` helper) | `npm --workspace backend run test -- src/resolvers/familyMember.addChild.test.js` (extend) | ❌ Wave 0 — extend existing file or add `familyMember.dedup.test.js` |
| REL-06 | Rejects via `addSibling` (D-11, same guard, different door) | integration | extend `familyMember.addSibling.test.js` | ❌ Wave 0 |
| REL-06 | Genuinely concurrent double-insert is serialized, not both accepted (D-10 TOCTOU proof) | integration (`Promise.all` on two `addChild` service calls) | new test in `familyMember.dedup.test.js` | ❌ Wave 0 |
| REL-06 | Error names the conflicting member and shared parent (exact copy) | integration | same file, assert `errors[0].message` | ❌ Wave 0 |
| MNG-01 | Member sees You/Parents/Spouse/Children/Siblings sections populated from `myEditableMembers` | component (RTL) | `npm --workspace frontend run test -- src/pages/ManagePage.test.jsx` | ❌ Wave 0 |
| MNG-01 | Siblings section shows a "Derived" affordance, no edit/rewire control | component | same file | ❌ Wave 0 |
| MNG-02 | Add-relative dialog submits the correct mutation per relation type (4 cases) | component | `src/components/manage/AddRelativeDialog.test.jsx` | ❌ Wave 0 |
| MNG-02 | In-scope picker never offers an out-of-scope member (mirrors `AdminLinkMembers.test.jsx`'s Autocomplete pattern) | component | same file | ❌ Wave 0 |
| MNG-03 | Admin table search/select focuses a member into the shared grouped panel | component | `src/components/manage/AdminMemberTable.test.jsx` | ❌ Wave 0 |
| MNG-03 | Admin can link an unlinked account from `/manage` (re-homed `AdminLinkMembers` behavior) | component | reuse/adapt `AdminLinkMembers.test.jsx` assertions into `ManagePage.test.jsx` | ❌ Wave 0 |
| MNG-04 | Unlinked non-admin hitting `/manage` is redirected to `/pending` | component (RTL, `ProtectedRoute` already covered) | existing `ProtectedRoute.test.jsx` — extend with a `/manage` route case if not generically covered | ✅ existing coverage generically proves the gate; add one `/manage`-specific route assertion |
| D-06 | Locked relative (own `linkedUser`, not self) renders no edit button + hint text | component | `src/components/manage/MemberCard.test.jsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the specific test file(s) for that task (see table above)
- **Per wave merge:** full backend suite (`npm --workspace backend run test`) + full frontend
  suite (`npm --workspace frontend run test`)
- **Phase gate:** both full suites green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/src/services/familyMember.dedup.test.js` — REL-06 guard, including the
      concurrent-race proof (D-10) and the exact error-message assertion (D-08/D-09)
- [ ] Extend `backend/src/resolvers/familyMember.addChild.test.js` and
      `familyMember.addSibling.test.js` — duplicate-name rejection through both public doors
- [ ] `frontend/src/pages/ManagePage.test.jsx` — route-level component test (member + admin
      branches)
- [ ] `frontend/src/components/manage/RelationshipGroupedPanel.test.jsx`
- [ ] `frontend/src/components/manage/AddRelativeDialog.test.jsx`
- [ ] `frontend/src/components/manage/MemberCard.test.jsx` (D-06 read-only branch)
- [ ] `frontend/src/components/manage/AdminMemberTable.test.jsx`
- [ ] No new test framework/config needed — both `vitest.config.js` files already cover the
      new file locations by existing glob patterns (colocated `*.test.js`/`*.test.jsx`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Existing JWT auth (`requireAuth`) — no change this phase |
| V3 Session Management | no (unchanged) | Existing JWT/localStorage pattern — no change this phase |
| V4 Access Control | yes | `requireFamilyAccess`/`requireAdmin` (existing, `backend/src/utils/auth.js`) on every resolver the UI drives; client-side `ProtectedRoute` is UX-only, never the authorization boundary — every new component must call the existing mutations, never a new unguarded one |
| V5 Input Validation | yes | `sanitizeNewMember` (existing, `user.resolver.js:28-38`) for all `NewFamilyMemberInput`/`EditFamilyMemberInput` payloads; the REL-06 guard's own `firstname.trim().toLowerCase()` is an additional, guard-specific normalization, not a substitute for `sanitizeNewMember` |
| V6 Cryptography | no | Not applicable — no new secrets, tokens, or crypto in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| TOCTOU on the REL-06 duplicate check (two concurrent `addChild` calls both pass the check and both insert) | Tampering (data-integrity bypass, not classic security tampering, but the same "check-then-act" race class as WR-01) | `SELECT ... FOR UPDATE` row lock on the shared-parent row before the duplicate-name read (Pattern 1) |
| Client trusting its own copy of "editable scope" to gate the Autocomplete picker or edit buttons, diverging from what the server actually enforces | Elevation of Privilege (if client and server scope logic ever drift) | Never re-derive scope client-side; always render strictly from server-returned `myEditableMembers`/`familyMember` data, and always let the mutation resolver be the final enforcement point (Architectural Responsibility Map) — this mirrors the Phase 14 CR-02 lesson (`addSibling` bypassed a scope check that existed elsewhere in the same codebase) |
| Presenting an edit affordance on a `linkedUser`-locked relative and relying on the server's rejection message as the only control | Elevation of Privilege / poor UX, not a true security hole (server still rejects per D-06/Phase 14 editMember check) but trains users to expect dead-end forms and can mask a real regression if the server check is ever weakened | Structural omission of the edit button per D-06, verified by a component test asserting the button is absent, not just that a resubmission fails |
| Admin table/detail query leaking PII (email/phone/address/birthdate) to a non-admin if a future refactor accidentally reuses the admin-only `familyMembers` query in the member branch | Information Disclosure | Keep `familyMembers` (unpaginated, all-fields, `requireAdmin`-gated) strictly in the admin branch; the member branch must only ever call `myEditableMembers`, which is scope-limited by construction (Phase 14 T-14-10) |

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `backend/src/services/familyMember.service.js` — exact `addChild`/`computeEditableScope`/`setSpouse`/`deleteMember` implementations, transaction-threading conventions
- `backend/src/resolvers/familyMember.resolver.js` — exact mutation/query resolvers, scope-check patterns, D-06 field-lock implementation
- `backend/src/schemas/familyMember.schema.js` — exact SDL for every type/input/query/mutation
- `backend/src/models/FamilyMember.js`, `backend/src/models/Spouse.js` — field definitions, validators, `notSelfMarriage`/date validators
- `backend/src/resolvers/user.resolver.js` — `sanitizeNewMember`, `linkUserToMember`, the existing `FOR UPDATE` lock pattern in `verifyEmail`
- `backend/src/utils/auth.js` — `requireAuth`/`requireAdmin`/`requireFamilyAccess` exact implementations
- `backend/src/config/database.js` — confirms no isolation-level override (default MySQL REPEATABLE READ applies)
- `frontend/src/pages/AdminLinkMembers.jsx` + `.test.jsx` — exact reusable Autocomplete/TextField/create-and-link pattern and its RTL test conventions
- `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/App.jsx` — exact route-gating implementation (MNG-04, D-12)
- `frontend/src/context/AuthContext.jsx`, `frontend/src/api/graphqlClient.js` — authed GraphQL call pattern, `user.role`/`familyMemberId` shape
- `frontend/src/pages/Dashboard.jsx` — established MUI/Chip/Avatar/Stat-tile visual conventions to match
- `backend/test/helpers.js`, `backend/test/familyTreeFactory.js` — `graphql()`/`createTestUser()`/`resetTables()` test harness conventions
- `backend/src/resolvers/familyMember.addChild.test.js`, `familyMember.myEditableMembers.test.js`, `familyMember.scope.test.js` — exact test patterns and `myEditableMembers`'s actual returned shape (flat, deduplicated array)
- `.planning/phases/14-.../14-REVIEW.md` — WR-01 (dead `{transaction}` param), CR-02 (addSibling scope bypass precedent), WR-03/WR-06/WR-07 (id-coercion/self-parent bugs still open, relevant context for the new guard's own id handling)
- `.planning/phases/15-.../15-CONTEXT.md`, `15-UI-SPEC.md` — locked decisions, copy contract, design tokens
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — requirement text, success criteria, milestone history
- `backend/package.json`, `frontend/package.json`, `.nvmrc` — exact installed versions of every library used

### Secondary (MEDIUM confidence)
- `npm view mysql2 version` (registry check, run live) — confirmed `3.23.1` is current `latest`; not adopted this phase (installed `3.11.5` retained), used only to confirm no forced-upgrade need

### Tertiary (LOW confidence)
- None — every claim in this research traces to a direct file read or a live command run in this session; no unverified WebSearch findings were used (Brave/Exa/Firecrawl were unavailable per init config, and this phase's domain — reading this project's own existing code — did not require external documentation lookup).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library/version is read directly from the installed
  `package.json` files; no new package is introduced
- Architecture: HIGH — every pattern (row-lock, Autocomplete reuse, ProtectedRoute reuse,
  grouped-panel shape) is either a direct precedent already in this codebase or a minimal,
  well-established extension of one
- Pitfalls: HIGH — every pitfall traces to either the Phase 14 code-review findings
  (WR-01/CR-02, already documented and fixed/open) or a direct re-read of the exact function
  signatures involved (`addChild`'s transaction default, `myEditableMembers`'s flat-list
  return shape)

**Research date:** 2026-07-23
**Valid until:** 30 days (stable, internal-codebase-only research; re-verify if Phase 14
gap-closure work lands before Phase 15 planning, since it directly touches the same
`familyMember.service.js`/`familyMember.resolver.js` files this research is keyed to)
