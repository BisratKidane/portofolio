# Phase 26: /detail Page, Search & Initial Load - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 26-detail-page-search-initial-load
**Areas discussed:** Search UX, Suggestion-row content, Initial-load data flow, Entry point & layout, Edge states

---

## Search UX

| Option | Description | Selected |
|--------|-------------|----------|
| Live suggestions (debounced) | Suggestions appear as you type (~250ms debounce, ~2 char min); each keystroke hits `searchFamilyMembers`; MUI Autocomplete idiom from AddRelativeDialog/LinkAccountsPage. | ✓ |
| Type-then-submit | Type + Enter/button, then results render; FamilyTreeCanvas pattern; fewer requests, extra action. | |
| Fetch-once then client-filter | Load capped list once, filter locally; snappy but defeats the server-side ~20 cap; poor for larger trees. | |

**User's choice:** Live suggestions (debounced)
**Notes:** → D-01. Debounce interval and min-char threshold left to Claude's discretion.

---

## Suggestion-row content (family context)

| Option | Description | Selected |
|--------|-------------|----------|
| Parent name(s) | Show "child of {mother/father}" — strongest disambiguator; plus Latin+Ge'ez name, birth year, avatar. | |
| Birth year only | Lean row: avatar + Latin + Ge'ez + birth year, no parent line. | |
| You decide | Use whatever parent/family fields the payload already carries, graceful fallback; most disambiguating combo without new backend work. | ✓ |

**User's choice:** You decide
**Notes:** → D-03. Use existing payload fields (e.g. mothersname/parent) for context; birth year shown in the row even though the card omits it (Phase 25 D-06).

---

## Initial-load & main-person data flow

| Option | Description | Selected |
|--------|-------------|----------|
| Head-id → person-by-id fetch | `familyHead` → id, then `familyMember(id)` for full card fields; two round-trips on open; single uniform load path shared with suggestion-select. | ✓ |
| Head returns full fields | First-load query returns head with all card fields directly; fewer round-trips but two fetch shapes; may need a Phase-24 query tweak. | |
| You decide | Optimize during planning; prefer uniform person-by-id unless it adds a needless round-trip. | |

**User's choice:** Head-id → person-by-id fetch
**Notes:** → D-04/D-05. Uniform `familyMember(id)` path for both first-load and suggestion-select; main person in page state only (no URL param).

---

## Entry point & page layout

| Option | Description | Selected |
|--------|-------------|----------|
| Nav link + centered card | `/detail` link in AppLayout top nav; persistent top search bar; head's single PersonCard centered below. | ✓ |
| Nav link, search-first | Same nav link, search bar as hero (large/centered), head card below. | |
| You decide | Add nav entry, pick cleaner layout during UI/planning. | |

**User's choice:** Nav link + centered card
**Notes:** → D-06/D-07. Route mounts in existing ProtectedRoute group like /family; visual polish may be refined via optional /gsd:ui-phase 26.

---

## Edge & empty states (DETAIL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| You decide (existing components) | Map each of the 6 states to existing patterns (CircularProgress, Alert error/info, inline "no matches", graceful missing-info); no new components; consistent with FamilyTreePage. | ✓ |
| Add a retry action on errors | Same mapping + explicit "Try again" button on error/missing-head states. | |
| Let me specify | User dictates specific copy/behavior. | |

**User's choice:** You decide (existing components)
**Notes:** → D-08. Existing-component mapping; inline "Try again" affordance allowed but not required.

---

## Claude's Discretion

- Debounce interval + min-char threshold for live search (D-01).
- Exact "family context" fields + suggestion-row layout, using only available payload fields (D-03).
- Precise component/copy per state and whether errors get an inline "Try again" (D-08).
- Whether the search input clears or retains text after a suggestion is selected (view clears regardless, D-05).
- Whether the head fetch + person-by-id are chained or threaded through one hook — keep one uniform path (D-04).

## Deferred Ideas

- Descendant expand/collapse, generation grid, 3-generation forward-shift — Phase 27.
- Lazy per-generation loading + session cache — Phase 27.
- Admin add-child/add-spouse/edit wiring — Phase 28.
- `/detail/:id` deep-linkable URL and ancestor navigation — deferred v4.0 Future Requirements.
