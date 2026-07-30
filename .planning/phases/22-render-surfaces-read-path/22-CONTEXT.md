# Phase 22: Render Surfaces (Read Path) — Context

**Gathered:** 2026-07-30
**Status:** Ready for planning (→ UI-SPEC → plan)
**Source:** /gsd:discuss-phase 22 (standard mode)

<domain>
## Phase Boundary

Make each family member's Ge'ez name **visible** everywhere the Latin name already appears — the `/family` tree cards and the `/manage` surfaces (relationship panels + admin member table) — without breaking existing layouts, and make it **searchable** in the admin member table. This is the read path only: no create/edit/entry (that's Phase 23), no new data or API (Phases 18/19 done), no new helper logic (Phase 21's `getGeezDisplay` is the single source of truth).

Requirements: **VIEW-01** (tree card), **VIEW-02** (/manage surfaces), **FIND-01** (admin-table Ge'ez search).
</domain>

<decisions>
## Implementation Decisions

### Locked (carried forward — do NOT re-open)
- **L-01 — Latin stays primary.** The Latin name is always shown and never disappears; Ge'ez is stacked BELOW it, only when present. (VIEW-01, REQUIREMENTS scope decision "Latin-primary, Ge'ez stacked below, no toggle".)
- **L-02 — Every surface calls the shared helper.** All render surfaces use `getGeezDisplay(member)` from `frontend/src/utils/displayName.js` (Phase 21) — no surface re-derives the Latin/Ge'ez precedence or empty-handling. The helper returns `null | { text, lang: 'ti' }`; consumers render `{geez && <Typography lang={geez.lang}>{geez.text}</Typography>}`.
- **L-03 — Ge'ez runs marked `lang="ti"`, no `dir`.** Comes from the helper's payload; Ethiopic is LTR. (SC2 of the ROADMAP; VIEW-03 already delivered.)
- **L-04 — Absent = nothing extra.** When `getGeezDisplay` returns `null`, render no line, no empty row, no dash, no separator. (VIEW-01.)

### D-01 — Tree card: fixed height, Ge'ez below Latin, reuse the reserved-row budget
The `/family` `MemberNode` card stays at its **fixed height (~120px)** — do NOT grow the card or use variable/mixed node heights. Render the Ge'ez full name as a secondary line **directly below the Latin `fullname` line**, absorbing the extra line into the card's existing **reserved top row budget** (the 18px row at `MemberNode.jsx` that shows the "Head" tag only for the tree-root card and is otherwise empty). Uniform card heights are preserved so the dagre tree layout stays even. When the member has no Ge'ez name, the line is absent (L-04) and the card is unchanged.
- **Claude's Discretion (UI-SPEC / planner):** exact mechanism for staying within the fixed height (e.g. redistributing the reserved-row space, tightening the `gap: 0.25`); the Ge'ez line is `noWrap` + ellipsis like the Latin `fullname`. Worst-case crowding (Head tag + Latin + Ge'ez + birthday + mother + address all present at once on one card) must be handled by truncation/`noWrap`, NOT by overflowing the fixed height — call this out explicitly in the UI-SPEC.

### D-02 — Ge'ez visual hierarchy: smaller & secondary, consistent everywhere
The Ge'ez line is visually **secondary** to the Latin primary: slightly smaller than the Latin name (Latin `fullname` is `fontSize: 14, fontWeight: 600` on the tree card) and/or lighter weight / muted color. Apply the SAME treatment consistently on the tree card AND both `/manage` surfaces so there is one visual rule.
- **Claude's Discretion (UI-SPEC):** exact px (~12–13px), the muted color token (reuse an existing `colors.*` / MUI `text.secondary`), and whether the de-emphasis is size, weight, color, or a combination. Must remain legible for Ethiopic glyphs (which render a touch taller/wider than Latin at the same size).

### D-03 — /manage presentation: stacked below Latin, same cell/card (no restructuring)
On BOTH `/manage` surfaces, render the Ge'ez name as a secondary line **stacked directly below the Latin name in the same container** — identical pattern to the tree card:
- Admin member table (`AdminMemberTable.jsx`, name cell ~line 113): Ge'ez as a second line in the SAME table cell. Do NOT add a separate Ge'ez column and do NOT restructure the table.
- Relationship-panel card (`MemberCard.jsx` ~line 109, used by `RelationshipGroupedPanel`): Ge'ez as a second line in the SAME card, below the Latin name.

### D-04 — Admin-table search (FIND-01): match Latin fullname OR geezFullname
Extend the existing search filter (`AdminMemberTable.jsx:56-57`, currently `member.fullname.toLowerCase().includes(term)`) to also match `member.geezFullname` — i.e. `fullname` OR `geezFullname`, substring match. This is the "search matches what you see" rule (both are the displayed names; `geezFullname` covers Ge'ez first+last).
- **Excluded:** `geezFirstname`/`geezLastname` raw parts (already covered by `geezFullname`) and `geezMothersname` (not displayed in the name cell — matching invisible text would be surprising).
- **Claude's Discretion (planner):** `.toLowerCase()` is a harmless no-op on Ethiopic (no case), keep it for the Latin side; guard against `geezFullname` being `null` before `.includes()`.

### D-05 — SC4: add Ge'ez fields to the render-path query selection sets
The Ge'ez fields must be added to the GraphQL selection-set constants that feed the render surfaces, or the data won't be present to render:
- `FAMILY_TREE_QUERY` — `frontend/src/pages/FamilyTreePage.jsx:20` (feeds the tree cards).
- `EDITABLE_MEMBER_FIELDS` + `FAMILY_MEMBERS_QUERY` — `frontend/src/pages/ManagePage.jsx:28, 43` (feed /manage relationship panels + admin table).
- Add `geezFullname` at minimum everywhere the surface displays it (D-01/D-03) and where search reads it (D-04). Add `geezFirstname`/`geezLastname`/`geezMothersname` to a selection set ONLY if a surface actually needs the raw parts (the read surfaces this phase need only `geezFullname`).
- **Claude's Discretion (planner):** exact per-query field list, verified against what each surface + the search actually read.

### Claude's Discretion (not user-facing — planner/UI-SPEC decides)
- All exact px sizes, color tokens, spacing, and truncation styling (constrained by D-01/D-02).
- How each consumer imports and calls `getGeezDisplay` (mechanical — L-02).
- Test strategy: component tests asserting Ge'ez line renders when `geezFullname` present and is absent when null (both tree card + /manage), plus a FIND-01 search test matching a Ge'ez substring. Real glyph rendering / the constrained-card visual pass remain a MANUAL sign-off (jsdom can't rasterize) — see STATE blocker.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (UI-researcher, phase-researcher, planner) MUST read these before designing/planning.**

### Requirements & roadmap
- `.planning/ROADMAP.md` — Phase 22 section (goal + 4 success criteria, incl. SC4 query constants).
- `.planning/REQUIREMENTS.md` — VIEW-01, VIEW-02, FIND-01; the "Latin-primary, Ge'ez stacked below, no toggle" scope decision; and the Out-of-Scope list (detail panel, dashboard, Ge'ez toggle, LinkAccounts Ge'ez search).

### The shared helper this phase consumes (Phase 21 — LOCKED, do not modify)
- `frontend/src/utils/displayName.js` — `getGeezDisplay(member)` → `null | { text, lang: 'ti' }`; `GEEZ_LANG`.
- `.planning/phases/21-shared-display-helper/21-RESEARCH.md` — the return-shape rationale and consumer-usage pattern.

### Render surfaces to retrofit (this phase's edit targets)
- `frontend/src/components/family/MemberNode.jsx` — the `/family` tree card (fixed height; Latin `fullname` at ~line 190; reserved top row at ~line 165). (VIEW-01)
- `frontend/src/components/manage/AdminMemberTable.jsx` — admin table name cell (~line 113) + search filter (lines 52-57). (VIEW-02 + FIND-01)
- `frontend/src/components/manage/MemberCard.jsx` — relationship-panel card name (~line 109), used by `RelationshipGroupedPanel.jsx`. (VIEW-02)
- `frontend/src/pages/FamilyTreePage.jsx` — `FAMILY_TREE_QUERY` (line 20). (SC4)
- `frontend/src/pages/ManagePage.jsx` — `EDITABLE_MEMBER_FIELDS` (line 28) + `FAMILY_MEMBERS_QUERY` (line 43). (SC4)

### Constraint / risk
- `.planning/STATE.md` — Blockers/Concerns: the fixed 252×120px tree card is already tight for Latin `noWrap`; Ge'ez glyphs are visually wider — a MANDATORY manual visual pass against the LONGEST real Ge'ez name in the actual dataset is required before phase sign-off.
</canonical_refs>

<specifics>
## Specific Ideas / Constraints

- **Card dimensions:** the tree card is fixed ~252×120px (2-column: 1/3 avatar + rows column). Rows today: reserved-top (18px, "Head" tag or empty) / `fullname` (14px/600, `noWrap`) / birthday / mother / address-if-alive, `gap: 0.25`.
- **Existing search:** `AdminMemberTable.jsx:56-57` — `members.filter((m) => m.fullname.toLowerCase().includes(search.trim().toLowerCase()))`. Extend to OR `geezFullname`.
- **Ethiopic samples** for tests (reuse Phase 18/20/21 fixtures): firstname `'ጃነ'`, lastname `'ዶ'`, `geezFullname` `'ጃነ ዶ'`.
- **Manual visual gate:** use the longest REAL Ge'ez name in the production dataset for the constrained-card pass, not sample text (STATE blocker).
</specifics>

<deferred>
## Deferred Ideas

- **`MemberDetailPanel` Ge'ez rendering** — explicitly OUT of v3.0 scope (REQUIREMENTS.md Out of Scope: "Ge'ez in the detail panel / dashboard"). Do NOT retrofit it this phase.
- **Ge'ez search in the LinkAccounts admin picker** (`LinkAccountsPage.jsx` `FAMILY_MEMBERS_QUERY`) — deferred (REQUIREMENTS.md Future). Same Autocomplete surface as Phase 23's add-relative picker but a different page; not in FIND-01's scope.
- **Ge'ez-aware sorting/collation** — explicitly out of scope (anti-feature; no name-based sort exists to extend).
- No new deferred ideas surfaced during discussion.

</deferred>

---

*Phase: 22-render-surfaces-read-path*
*Context gathered: 2026-07-30 via /gsd:discuss-phase*
