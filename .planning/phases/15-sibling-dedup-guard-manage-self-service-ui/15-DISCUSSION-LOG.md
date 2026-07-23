# Phase 15: Sibling Dedup Guard & /manage Self-Service UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 15-sibling-dedup-guard-manage-self-service-ui
**Areas discussed:** Scope presentation on /manage, Admin view, Add-relative flow, Field-lock UX, Dedup guard (REL-06), Relationship to /admin/link-members

---

## Scope presentation on /manage (member view)

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by relationship | Sections You/Parents/Spouse/Children/Siblings, each with an Add action | ✓ |
| Flat list of member cards | Uniform list, each card shows relation | |
| Mini-tree diagram | Small visual tree with clickable nodes | |

**User's choice:** Grouped by relationship.
**Notes:** Makes the scope boundary legible and homes each add-mutation. Mini-tree rejected as Phase 17 overlap.

---

## Admin view

| Option | Description | Selected |
|--------|-------------|----------|
| Searchable table + focus a member | Paginated table → open member in the same grouped panel with admin powers | ✓ |
| Same grouped view, admin sees everyone | Unscoped flat grouped render | |
| Separate admin-only screen | Distinct management surface | |

**User's choice:** Searchable table + focus a member.
**Notes:** One grouped component, two entry points. Flat render rejected (unusable at hundreds of nodes); separate screen contradicts MNG-03 "same page".

---

## Add-relative flow

| Option | Description | Selected |
|--------|-------------|----------|
| Modal, create-new default + in-scope picker | Dialog with new-person fields; secondary picker offers in-scope members only | ✓ |
| Inline expanding form | Section expands in place | |
| Two-step new-vs-existing chooser | Ask new-or-existing first, then form | |

**User's choice:** Modal with create-new default + in-scope picker.
**Notes:** Common case (new person) stays one step; picker structurally can't breach Phase 14 D-02 scope. Per-relationship shapes captured in CONTEXT D-05.

---

## Field-lock UX (Phase 14 D-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only card, no edit affordance | Locked relative shows no edit button + "manages their own profile" hint | ✓ |
| Editable form, error on submit | Show edit for all; backend rejects locked ones | |
| Show edit, disable locked fields | Open form with grayed fields | |

**User's choice:** Read-only card, no edit affordance.
**Notes:** UI never offers an action the backend rejects. D-06 locks the whole record, so per-field disable = read-only with more work.

---

## Dedup guard behavior (REL-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Service-layer hard block, applies to all | One check in familyMember.service.js on the addChild path, covers all callers incl. admins | ✓ |
| Service block, admins can override | Same check but admin force/confirm path | |
| DB unique constraint | Schema-level constraint | |

**User's choice:** Service-layer hard block, applies to all.
**Notes:** Either-parent + two-nullable-FK semantics aren't a simple UNIQUE; override deferred (admin can edit after). Guard must run in the insert transaction (D-10) and fire on create AND admin-link (D-11).

---

## Relationship to existing /admin/link-members

| Option | Description | Selected |
|--------|-------------|----------|
| Absorb into /manage, redirect old route | Fold linking into admin /manage; old route redirects | ✓ |
| Keep separate, link between them | Leave standalone page, /manage links out | |
| Duplicate the control on both | Add to /manage and keep the page | |

**User's choice:** Absorb into /manage, redirect old route.
**Notes:** One admin surface (MNG-03 "same page"), reuses existing Autocomplete/create-and-link logic, no broken bookmarks.

---

## Claude's Discretion

- Exact MUI composition (Dialog vs Drawer, pagination size, empty-state copy) — follow AdminLinkMembers.jsx conventions.
- Whether the scoped list and admin table share one route component with a role branch or split — planner's call, provided they share the grouped panel.

## Deferred Ideas

- Admin override for intentional duplicate-name children (twins/cultural naming).
- Deep tree visualization / pan-zoom → Phase 17.
- Member→admin removal-request flow → per REQUIREMENTS PERM-03.
- Full WR-01 transaction-threading fix (this phase threads only the child-create/dedup path).
