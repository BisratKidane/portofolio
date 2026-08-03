# Phase 24: Backend Read Layer for /detail - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 24-backend-read-layer-for-detail
**Areas discussed:** Family head rule, Name search shape, Child count exposure, Edit-permission signal

---

## Family head rule

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror client rule | Backend replicates `resolveRootAncestorId`: prefer id 1, else parentless apex with largest subtree; needs a bounded query | ✓ |
| Simple apex query | Parentless member with largest subtree; drop the id-1 special case | |
| Hardcoded/configured id | Fixed id (1) or env/config value | |

**User's choice:** Mirror client rule
**Notes:** Keeps `/detail` and `/family` agreeing on the head (Agne / id 1). Must stay bounded — not load the whole tree to compute it.

---

## Name search shape

| Option | Description | Selected |
|--------|-------------|----------|
| Capped + ranked | Bounded set ordered by best match (prefix > contains) then name | |
| Capped, name-sorted | Bounded set (~20) ordered by lastname/firstname; no backend ranking | ✓ |
| Unbounded, name-sorted | All matches, frontend limits | |

**User's choice:** Capped, name-sorted
**Notes:** Backend keeps it simple; any ranking/highlighting is the frontend's job in Phase 26.

---

## Child count exposure

| Option | Description | Selected |
|--------|-------------|----------|
| `childCount` field on FamilyMember | New batched count DataLoader field, reusable | |
| Reuse `children { id }` | No new field; derive count from nested children ids | ✓ |
| Count only on the children query | Count within the direct-children response only | |

**User's choice:** Reuse `children { id }`
**Notes:** No new API surface. Each direct child's own count comes from nesting one more `children { id }` level; still bounded/batched via existing `childrenByParentId` loader — this nested read is the N+1 proof target for SC-4.

---

## Edit-permission signal

| Option | Description | Selected |
|--------|-------------|----------|
| Per-person `canEdit`, admin-only | `canEdit` = caller is ADMIN, per-person field | ✓ (shape) |
| Global `canEditFamily` flag | One top-level boolean (= isAdmin) | |
| Per-person, full editable scope | Reflects `computeEditableScope` | |

**User's choice:** Reuse the existing admin check — `user.role === 'ADMIN'` on the logged-in User row — "already used in the system." Shaped as a per-person `canEdit: Boolean!` field on `FamilyMember` (Claude's shape recommendation, open to a global flag if preferred).
**Notes:** No new scope logic. Same mechanism as `requireAdmin` and the existing `linkedUser`/`createdBy`/`updatedBy` admin gating. `/detail` editing is admin-only per the v4.0 milestone goal.

---

## Claude's Discretion

- Exact new query names/arg signatures (e.g. `familyHead`, `searchFamilyMembers(term:)`).
- SQL/loader implementation for the bounded head lookup and search.
- Whether the search cap is a fixed constant or a capped `limit` arg (default ~20).

## Deferred Ideas

- Scoped (non-admin) editing on `/detail` — `canEdit` could later reflect `computeEditableScope`; out of scope for v4.0.
- Relevance/prefix search ranking — rejected now (name-sorted), revisit only if Phase 26 UX needs it.
- Ancestor/upward nav, deep-linkable `/detail/:id`, Latin↔Ge'ez toggle, fuller genealogy — already logged as v4.0 Future Requirements.
