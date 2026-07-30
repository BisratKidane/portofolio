# Phase 22 Discussion Log

**Date:** 2026-07-30
**Mode:** standard discuss (/gsd:discuss-phase 22)
**Areas selected by user:** all four (Ge'ez visual hierarchy, Tree-card layout & height, /manage presentation, Admin-table search scope)

---

## Area 1 — Tree-card layout & height
**Options presented:** (a) card grows taller when present [recommended], (b) fixed height + tighten existing rows, (c) uniformly taller cards.
**User decision:** Fixed height — use the reserved row's budget, put the Ge'ez full name below the Latin full name.
**Notes:** Keeps uniform card heights (no variable/mixed dagre node heights). Worst-case crowding handled by truncation, not overflow — flagged for UI-SPEC. → D-01.

## Area 2 — Ge'ez visual hierarchy
**Options presented:** smaller & secondary [recommended], equal prominence, Ge'ez emphasized.
**User decision:** Smaller & secondary (~12–13px, lighter/muted), consistent across tree card + /manage.
**Notes:** Matches locked "Latin primary" rule. Exact px/color = Claude's discretion. → D-02.

## Area 3 — /manage presentation
**Options presented:** stacked below Latin in same cell/card [recommended], separate Ge'ez column (table) + stacked (cards), inline after Latin.
**User decision:** Stacked below Latin, same cell/card — identical pattern to the tree card; no table restructuring. → D-03.

## Area 4 — Admin-table search scope (FIND-01)
**Options presented:** geezFullname only (matches what's shown) [recommended], all Ge'ez parts incl. mother's name.
**User decision:** Match Latin fullname OR geezFullname; exclude Ge'ez mother's name. → D-04.

---

## Locked (carried forward, not discussed)
- Latin always primary; Ge'ez stacked below, only when present (VIEW-01).
- Every surface calls `getGeezDisplay` (Phase 21) — no re-derivation.
- Ge'ez runs `lang="ti"`, no `dir` (from helper).
- SC4: add Ge'ez fields to render-path query constants (→ D-05).

## Deferred / scope
- MemberDetailPanel Ge'ez — OUT of v3.0 scope (do not retrofit).
- LinkAccounts Ge'ez search — deferred (Future).
- Ge'ez sorting/collation — out of scope (anti-feature).
- No new deferred ideas raised.
