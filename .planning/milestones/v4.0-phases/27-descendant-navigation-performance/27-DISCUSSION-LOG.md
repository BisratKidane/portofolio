# Phase 27: Descendant Navigation & Performance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 27-descendant-navigation-performance
**Areas discussed:** Multi- vs single-expand, Going back up, Grid & connector visual

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Multi- vs single-expand | Expanding multiple siblings at once vs one branch at a time | ✓ |
| Going back up | How to undo a forward-shift (collapse / breadcrumb / reset) | ✓ |
| Grid & connector visual | How closely to follow /family's connector language + spouse placement | ✓ |
| Cache scope & freshness | Session-cache boundary + Phase 28 invalidation | (not picked — Claude's discretion) |

---

## Multi- vs single-expand

| Option | Description | Selected |
|--------|-------------|----------|
| One branch at a time | Expanding a second sibling auto-collapses the first; only one parent's children shown below; ≤3 columns, unambiguous 3-gen cap | ✓ |
| Multiple open at once | Each expanded sibling shows its own children block simultaneously; grid must group grandchildren by parent | |

**User's choice:** One branch at a time
**Notes:** Keeps the view following a single lineage; simplest cap semantics.

---

## Going back up

| Option | Description | Selected |
|--------|-------------|----------|
| Collapse control reverses it | Collapsing the promoted top-person walks the view back up one generation (restores grandparent + full brood) via a view-history stack | ✓ |
| Breadcrumb trail | Ancestor breadcrumb appears after shifts; click a crumb to jump back | |
| Reset-to-head only | No step-back; only a full reset to head/re-search | |

**User's choice:** Collapse control reverses it
**Notes:** Pure symmetric undo, no extra chrome; requires a view-frame stack.

---

## Grid & connector visual

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse /family conventions | Solid parent→child lines + dashed spouse connector adapted to a flowing grid | |
| Lighter / minimal | A subtler cue than /family (indentation / bracket / stub line) | |
| **Free-text (user)** | The whole children container has an **inverted-V (∧)** indicator showing it relates to the parent above | ✓ |

**User's choice (free-text):** "the whole container of the children has an inverted v shaped indicator of that there is a relation."
**Notes:** Confirmed as a **single group-level cue**, not a line per child; apex points **up** to the parent/couple, opening downward over the row; rendered as a subtle line/chevron in the theme line color, not a heavy tree edge.

### Spouse placement (asked alongside connector)

| Option | Description | Selected |
|--------|-------------|----------|
| Beside the parent, above the grid | Spouse laterally paired with the person; shared children hang beneath the couple | ✓ |
| Parent only, spouse tucked | Children connect only to the blood-line parent; spouse secondary/offset | |

**User's choice:** Beside the parent, above the grid
**Notes:** Reads as "these two → their children," matching the family model.

---

## Claude's Discretion

- **Cache scope & freshness (unpicked gray area):** session-scoped in-memory cache
  keyed by person id, read-through on expand; **invalidation for Phase 28 admin
  mutations is deferred to Phase 28**. Build it per-id-invalidatable.
- Loading feel during an expand (spinner vs skeleton).
- Whether the forward-shift/grid change animates or snaps.
- Exact rendering technique + stroke/size for the inverted-V apex.
- Where nav state lives (page state vs a dedicated `useDescendantNav` hook).

## Deferred Ideas

- Cache invalidation / refresh after admin mutations — Phase 28.
- Admin add-child / add-spouse / edit affordances on `/detail` — Phase 28.
- Keyboard operability / WCAG AA contrast / mobile-polish graded gate — Phase 29.
- 4th simultaneous generation / multiple sibling broods open at once — rejected (NAV-03 + one-branch decision).
- Breadcrumb / ancestor navigation and `/detail/:id` deep links — deferred v4.0 Future Requirements.
