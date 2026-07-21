# Phase 13: Membership Gating & Account Linking - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Gate verified user *login accounts* behind admin-linking to a `FamilyMember`
node, enforced both in the SPA (route unlinked users to a `/pending` screen) and
server-side (a `requireFamilyAccess` guard on every family query/mutation), with a
first-admin carve-out so the bootstrap admin is never locked out. Add the
`users.familyMemberId` link column to the existing `users` table via a tracked
manual `ALTER` + boot-verify. Ship a **minimal admin-only linking UI** that lets an
admin connect an unlinked account to a member node (existing, or a newly-created
bare member).

**In scope:** `users.familyMemberId` column (manual `ALTER` + boot-verify); the
`requireFamilyAccess` backend guard (linked-member OR ADMIN) + the adversarial
"unlinked JWT hits a family resolver directly" integration test; a `linkUserToMember`
admin mutation; the SPA `/pending` gate + routing for unlinked users; a minimal
admin-only linking screen (list unlinked accounts → pick/search a member → link);
lightweight **bare-member creation** used inside the create-and-link flow; admin
self-link.

**Explicitly NOT in this phase (later phases own these):** relationship-connecting
between members (parent/spouse/children wiring) → Phase 14 resolvers; the polished
`/manage` page and member-management UX → Phase 15; permission-scoping / member-driven
relationship edits + their adversarial privilege-escalation tests → Phase 14; photo
upload → Phase 16; `/family` visualization → Phase 17.

</domain>

<decisions>
## Implementation Decisions

### The gate & pending experience
- **D-01 — Gate scope:** A verified user with no linked member (and not an ADMIN) is
  gated down to a single `/pending` screen; all other authenticated routes redirect
  there. This is the simplest coherent enforcement of ACC-01's "cannot reach family
  data" given the app currently only has `Dashboard` behind `ProtectedRoute`. (User
  chose "you decide"; recorded as gate-everything-to-`/pending`.)
- **D-02 — `/pending` is a minority path:** The admin proactively creates ~80% of member
  nodes, so most people never sit in the pending state. `/pending` shows a **simple
  static message** ("Your account is awaiting an admin to link you to your family
  member; you'll get access once linked."). No admin-contact surfacing, no live status
  polling in this phase (a re-login/refresh picks up the link). Low-stakes by design.

### Admin linking interface
- **D-03 — Ship a minimal admin linking UI now:** ACC-02 ("an admin can link a user")
  reads as a usable capability this phase — not a deferred backend-only mutation. The
  screen is admin-only and minimal: list user accounts with no linked member, select
  one, pick/search a member node, link. The *polished* management surface (`/manage`)
  remains Phase 15.
- **D-04 — Linking supports pick-existing OR create-and-link:** When linking, the admin
  can either select an existing member node or **create a new bare member and link in one
  step** (covers the ~20% who registered before a node existed).
- **D-05 — "Create" in create-and-link = BARE member only (SCOPE ANCHOR):** The inline
  create makes a member with only its *own* fields (`firstname`/`lastname`/`gender` +
  optional `email`/`birthdate`/`deathdate`/`phone`/`address`/`mothersname`). It does
  **NOT** wire that member into the tree (no parents/spouse/children). The user's full
  "create members and connect them to existing members" workflow is the intended
  *end-state* but lives on `/manage` across Phase 14 (relationship resolvers) + Phase 15
  (UI). **This overrides an earlier in-discussion answer of "create + wire relationships"**
  — once the phase-boundary tradeoff was surfaced, the user chose to keep Phase 13 lean.

### Access rule (carve-out)
- **D-06 — `requireFamilyAccess` = linked-member OR `role == 'ADMIN'`:** Any ADMIN
  bypasses the linked-member requirement (zero linked members is fine). ACC-03's
  first-admin carve-out falls out of this naturally — no special-casing of "which admin
  is the bootstrap one." An admin **may** optionally self-link to their own member node
  but is never required to. This mirrors the existing `requireAdmin`/`requireAuth`
  thrown-guard pattern in `backend/src/utils/auth.js`.

### Link column semantics
- **D-07 — `users.familyMemberId` shape:** Nullable FK referencing `family_members(id)`,
  with a **UNIQUE** constraint (one member ↔ at most one user account) and
  **`ON DELETE SET NULL`** (deleting a member auto-nulls the link, re-pending that user).
  The DB enforces both the one-user-one-member invariant and the re-pend-on-delete
  behavior — no app-level bookkeeping needed.
- **D-08 — Added via tracked manual `ALTER` + boot-verify (ACC-05):** `sync()` does not
  alter existing tables, so `familyMemberId` is added to the existing `users` table with
  a numbered manual migration under `backend/migrations/manual/` and a boot-time verify
  step, exactly mirroring the v1.1 Phase 9/11 `passwordChangedAt` / email-verification
  column pattern. NOT assumed to apply via `sync()`.

### Cross-cutting (carried forward — not re-decided)
- **D-09 — TDD red-green-refactor** is mandatory (QUAL-01 / project standard). The
  adversarial guard test (a verified-but-unlinked JWT calling a family GraphQL op directly,
  bypassing the SPA, is rejected) is a locked success criterion and must be a red test first.
- **D-10 — First-user-ADMIN regression:** The existing v1.1 first-verified-user-ADMIN
  assignment test must still pass; the gate must not break admin bootstrap (ACC-03).

### Claude's Discretion
Left to research/planning (not user-facing decisions):
- Exact shape of the `requireFamilyAccess` helper (standalone guard fn vs. resolver
  wrapper) and where "family resolvers" are enumerated — there are no family resolvers yet,
  so this phase may stub the guard against the first family operation or document the
  contract for Phase 14 to consume.
- Frontend routing mechanics for the gate (extend `ProtectedRoute` vs. a new
  `RequireMembership`/`PendingGate` wrapper), and how `AuthContext` learns a user's
  linked/pending state (add `familyMemberId`/`hasMember` to the `me` query payload).
- The admin "unlinked users" list query + minimal linking-screen layout/component reuse
  (`AuthShell`/MUI patterns).
- Migration file numbering and the boot-verify assertion mechanics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — v2.0 requirements; Phase 13 covers **ACC-01, ACC-02,
  ACC-03, ACC-04, ACC-05**.
- `.planning/ROADMAP.md` §"Phase 13: Membership Gating & Account Linking" — goal + the 5
  success criteria (the source of truth for what must be TRUE).
- `.planning/STATE.md` §"Blockers/Concerns" — the `sync()`-doesn't-`ALTER` carry-forward
  and the "first-admin carve-out" note (relevant to D-06/D-08).
- `.planning/PROJECT.md` — v1.1 shipped the manual-`ALTER` + boot-verify pattern (Phases
  9/11) that D-08 mirrors; v2.0 in-progress state.

### Existing code to follow (conventions)
- `backend/src/utils/auth.js` — `requireAuth`/`requireAdmin` thrown-guard pattern +
  `getUserFromRequest` (JWT → `User`); D-06's `requireFamilyAccess` extends this.
- `backend/src/models/User.js` — `User` model to extend with `familyMemberId`; ENUM/hook
  conventions.
- `backend/src/models/index.js` — barrel + association wiring (Phase 12 added
  `FamilyMember`/`Spouse` here); the `User ↔ FamilyMember` link association goes here.
- `backend/migrations/manual/` — existing numbered manual SQL migrations
  (`009-add-password-changed-at.sql`, `011-add-email-verification-columns.sql`) are the
  template for D-08's `familyMemberId` ALTER.
- `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/App.jsx` — route-guard +
  route table to extend for the `/pending` gate.
- `frontend/src/context/AuthContext.jsx` — where the SPA learns linked/pending state (the
  `me` query payload).
- `.planning/phases/12-family-data-model-foundation/12-CONTEXT.md` — Phase 12 model
  decisions (D-13 explicitly hands the `users.familyMemberId` manual-`ALTER` to Phase 13).
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md` — naming,
  barrel/aggregator, error-handling style.

No external specs/ADRs beyond the planning docs and existing code above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/utils/auth.js`: `requireAuth`/`requireAdmin` are the direct template for
  `requireFamilyAccess`; `getUserFromRequest` already resolves the JWT → `User` in the
  Apollo context, so the linked-member check has the `User` in hand.
- `backend/migrations/manual/011-add-email-verification-columns.sql`: closest analog for
  the `familyMemberId` ALTER (adds columns to `users`, tracked, boot-verified).
- `frontend/src/components/ProtectedRoute.jsx`: already branches on `loading`/`user`/`role`
  — the pending-gate redirect slots in alongside the existing role check.
- `frontend/src/components/AuthShell.jsx`: card wrapper reusable for the `/pending` screen.

### Established Patterns
- Thrown-error auth guards called at the top of resolvers (not middleware) — `requireFamilyAccess`
  follows suit.
- Manual `ALTER` + boot-verify for existing-table schema changes (v1.1 Phases 9/11) — the
  established, mandatory pattern because `sync()` won't alter `users`.
- First-registered/-verified user becomes ADMIN (`backend/src/resolvers/user.resolver.js`) —
  the carve-out (D-06) must not regress this.

### Integration Points
- `users.familyMemberId` FK → `family_members(id)` is the FIRST cross-table association
  touching the pre-existing `users` table; declared in `backend/src/models/index.js`.
- The `me` query payload (`backend/src/schemas/user.schema.js` + resolver) likely needs
  `familyMemberId`/pending-state so the SPA can route.
- `requireFamilyAccess` has no family resolvers to guard yet (those are Phase 14) — this
  phase defines the guard + proves it with the adversarial test against the first family
  operation (real or a documented contract Phase 14 wires into).

</code_context>

<specifics>
## Specific Ideas

- **Admin-driven model (user's words):** "It is not like a user is going to come register
  there, the admin is already going to register the known members, almost 80%. In the
  /manage page an admin should be able to create members and connect them to existing
  members." → drives D-02 (`/pending` is a rare state), D-03/D-04 (admin linking UI with
  create-and-link), and the deferral of full member-connecting to `/manage` (D-05).
- **Create-and-link convenience:** the admin should be able to spin up a member and link
  an account in one step for the ~20% who register before their node exists — but only a
  *bare* member in Phase 13 (D-05).

</specifics>

<deferred>
## Deferred Ideas

- **Admin create-member-AND-wire-relationships (the full `/manage` workflow).** The user
  initially wanted create-and-link to also connect the new member to parents/spouse/children.
  Once the phase-boundary cost was surfaced, this was deliberately deferred: relationship
  resolvers are Phase 14, and the polished `/manage` create-and-connect UI is Phase 15.
  Phase 13 ships only bare-member create + account-link (D-05). This is the intended
  end-state, just sequenced later.
- **Relink / unlink support and a richer "unlinked users" management view.** Not raised as
  required for ACC-01..05; belongs with the Phase 15 `/manage` admin surface.
- **`/pending` admin-contact surfacing and live status polling.** Explicitly out for
  Phase 13 (D-02) — revisit only if the pending path proves higher-traffic than expected.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 13-Membership Gating & Account Linking*
*Context gathered: 2026-07-21*
