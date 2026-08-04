# Phase 28: Admin Actions on /detail - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-04
**Phase:** 28-admin-actions-on-detail
**Areas discussed:** Add-relative control, Refresh in place, Actionable cards

---

## Gray areas offered (multiSelect)

| Area | Selected |
|------|----------|
| Add-relative control | ✓ |
| Refresh in place | ✓ |
| Actionable cards | ✓ |
| Add-child co-parent | (not selected — routed to Claude's discretion) |

---

## Add-relative control

| Option | Description | Selected |
|--------|-------------|----------|
| Single 'Add' menu | One `+`/⋮ icon opening a menu: Add child / Add spouse. Least clutter on a busy card; scales. | ✓ |
| Two separate buttons | Distinct always-visible Add-child / Add-spouse buttons (mirrors /manage panel). Three action buttons crowd the card. | |

**User's choice:** Single 'Add' menu
**Notes:** Paired with the existing top-right edit button, always visible (no hover-only), consistent with the a11y direction. Icon glyph + label wording left to Claude.

---

## Refresh in place

| Option | Description | Selected |
|--------|-------------|----------|
| Evict + refetch that id | Evict affected id from useDescendantNav cache, re-run Phase-24 read; head via loadPersonById. Targeted, server-truth, one bounded request. | ✓ |
| Optimistic merge | Splice mutation payload into cache with no refetch. Instant but risks drift from server-computed fields; new merge logic. | |
| Refetch whole view | Rebuild entire frame after any mutation. Simple but discards the Phase-27 cache; more requests. | |

**User's choice:** Evict + refetch that id

**Follow-up — post-add view (collapsed person):**

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-expand to reveal | Expand the person after add-child so the new child is visible; respects Phase-27 nav rules. | ✓ |
| Just bump the count | Leave collapsed, only update the child-count chip. Less movement, no direct confirmation. | |

**User's choice:** Auto-expand to reveal
**Notes:** Auto-expand must respect Phase-27 one-branch/forward-shift/3-gen-cap rules when the target is a grandchild with children.

---

## Actionable cards

**Spouse-card actions:**

| Option | Description | Selected |
|--------|-------------|----------|
| Edit only on spouses | Spouse cards keep just the edit button; Add menu on anchor cards only. Matches model (children belong to a couple). | ✓ |
| Full actions on spouses | Spouse cards also get the Add menu. More uniform but redundant/awkward add paths. | |

**User's choice:** Edit only on spouses

**Add-second-spouse availability:**

| Option | Description | Selected |
|--------|-------------|----------|
| Always allow | 'Add spouse' stays available; truthful to the multi-spouse model. New last spouse shown after refresh (previous drops from view). | ✓ |
| Hide when spouse exists | Suppress 'Add spouse' once a spouse is displayed. Avoids surprise but diverges from model, blocks a legit action. | |

**User's choice:** Always allow
**Notes:** Accepted consequence — /detail shows only the last spouse (Phase 25), so a newly added spouse replaces the displayed one.

---

## Claude's Discretion

- Add-child co-parent (`inScopeMembers`) handling on /detail — pass `[]` or default to displayed spouse.
- Add-menu icon glyph and menu-item wording.
- Shape of the `useDescendantNav` per-id invalidate/refetch API.
- Field-completeness fix for edit (extend /detail queries vs fetch full member on edit-open).
- Loading/feedback affordance during a mutation refresh.
- SC-3 adversarial server-side test (reuse existing guards).

## Deferred Ideas

None — discussion stayed within phase scope. The Phase-27-deferred cache invalidation is resolved here (CONTEXT D-04), not deferred further.
