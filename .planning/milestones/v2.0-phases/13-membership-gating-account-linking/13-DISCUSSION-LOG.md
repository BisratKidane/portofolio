# Phase 13: Membership Gating & Account Linking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 13-Membership Gating & Account Linking
**Areas discussed:** Pending-user experience, Admin linking interface, Create-and-link boundary, Carve-out scope, Link column semantics

---

## Gray-area selection

Presented 4 candidate areas (Pending-user experience, Admin linking interface, Carve-out scope, Link column semantics). User selected **Pending-user experience** and **Admin linking interface**; the other two were folded back in at the wrap-up check and discussed as well.

---

## Pending-user experience

### Gate scope

| Option | Description | Selected |
|--------|-------------|----------|
| Everything → /pending only | All authenticated routes redirect to /pending; only pending message + logout. | |
| Keep Dashboard, gate family | Dashboard stays reachable; only family routes/data gated; banner not dedicated page. | |
| You decide | Claude chooses; recommended gate-everything-to-/pending since only Dashboard exists. | ✓ |

**User's choice:** You decide → recorded as gate-everything-to-`/pending` (D-01).

### Pending message content

| Option | Description | Selected |
|--------|-------------|----------|
| Simple static message | "Awaiting admin linking" — no contact, no admin identity. | (default) |
| Message + admin contact | Also surface who to contact. | |
| Message + refresh/status | Static message + re-check/poll status. | |

**User's choice:** Free-text — redirected to the admin workflow rather than message content: "It is not like a user is going to come register there, the admin is already going to register the known members, almost 80%. in the /manage page an admin should be able to create members and connect them to existing members."
**Notes:** Reframed `/pending` as a minority (~20%) path (D-02). Surfaced the linking-vs-relationship-connecting distinction and the Phase 13/14/15 boundary.

---

## Admin linking interface

### What linking UI Phase 13 ships

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal admin linking UI now | Simple admin-only screen: list unlinked accounts → pick member → link. | ✓ |
| Backend + mutation only, defer UI | Gate + column + mutation only; linking screen folded into Phase 15 /manage. | |
| You decide | — | |

**User's choice:** Minimal admin linking UI now (D-03).

### Existing-member vs create-and-link

| Option | Description | Selected |
|--------|-------------|----------|
| Pick existing member only | Linking assumes member exists; creation is Phase 15. | |
| Pick existing OR create-and-link | Admin can create a new member node inline and link in one step. | ✓ |
| You decide | — | |

**User's choice:** Pick existing OR create-and-link (D-04).

---

## Create-and-link boundary

### What "create" covers in Phase 13

| Option | Description | Selected |
|--------|-------------|----------|
| Bare member only | Own fields only; relationships via /manage (Phase 14/15). | ✓ (after tradeoff) |
| Create + wire relationships | Also connect parents/spouse/children inline. | (initial answer) |
| You decide | — | |

**User's choice (initial):** Create + wire relationships. **After the phase-boundary tradeoff was surfaced** (this = Phase 14 resolvers + Phase 15 /manage, plus adversarial security work), user chose **Keep Phase 13 lean** → bare-member-only (D-05).

### Sequencing decision

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Phase 13 lean | Bare create + link now; full create-and-connect on /manage in 14/15. | ✓ |
| Expand Phase 13 | Pull admin-only create+wire into this phase; reshape roadmap. | |
| Reshape roadmap first | Handle as a /gsd:phase re-sequencing before planning. | |

**User's choice:** Keep Phase 13 lean.
**Notes:** Full "create members and connect them" is the intended end-state, deferred to Phase 14/15.

---

## Carve-out scope

| Option | Description | Selected |
|--------|-------------|----------|
| Any ADMIN bypasses | requireFamilyAccess = linked-member OR role==ADMIN; ACC-03 falls out naturally. | ✓ |
| Bootstrap admin only | Only first-verified ADMIN gets the carve-out; later admins need a link. | |
| You decide | — | |

**User's choice:** Any ADMIN bypasses (D-06).

---

## Link column semantics

| Option | Description | Selected |
|--------|-------------|----------|
| FK, ON DELETE SET NULL, unique | Nullable FK → family_members; UNIQUE; auto-re-pend on member delete. | ✓ |
| Plain nullable column, app-enforced | No DB FK/unique; app handles it. | |
| You decide | — | |

**User's choice:** FK, ON DELETE SET NULL, unique (D-07); added via manual ALTER + boot-verify (D-08).

---

## Claude's Discretion

- Gate scope (D-01) — user said "you decide."
- `/pending` message content — defaulted to simple static (D-02).
- `requireFamilyAccess` helper shape, frontend gate mechanics, `me` payload additions, admin unlinked-users query + screen layout, migration numbering/boot-verify mechanics.

## Deferred Ideas

- Admin create-member-AND-wire-relationships (full /manage workflow) → Phase 14/15.
- Relink/unlink support and richer unlinked-users management view → Phase 15 /manage.
- `/pending` admin-contact surfacing and live status polling → revisit only if pending path is higher-traffic than expected.
