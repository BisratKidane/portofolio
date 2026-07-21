# Phase 12: Family Data Model Foundation - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a provably-correct Sequelize data model for family members and their
relationships — parent/child self-references (`motherId`/`fatherId`), a symmetric
spouse relationship, and the supporting model-layer link/create/delete helpers —
with cycle-safety, cascade-safety, and a fresh-DB `sequelize.sync({ force: true })`
smoke test. Built test-first (TDD red-green), following the existing barrel/model
conventions.

**In scope:** the `FamilyMember` model + associations, the spouse join table,
model-layer helpers to link parents / add a child / set a spouse / delete a member
safely, cycle-prevention, cascade-safety (incl. the married-in-spouse rule below),
and the fresh-DB sync smoke test.

**Explicitly NOT in this phase (later phases own these):** GraphQL schema &
resolvers (Phase 14), permission scoping (Phase 14), membership gating &
`users.familyMemberId` (Phase 13), the `/manage` UI + sibling-dedup guard
(Phase 15), photo upload (Phase 16), `/family` visualization (Phase 17).

</domain>

<decisions>
## Implementation Decisions

### Spouse relationship
- **D-01 — Storage shape:** A single **canonical join row per couple** in a spouses
  join table, stored as an ordered id pair (e.g. `memberAId < memberBId`, unique on
  the pair). "My spouse" is read by querying rows where either column equals me, so
  the relationship reads identically from both sides with **one source of truth** (no
  two-row sync risk). This is how REL-02's symmetry requirement is satisfied.
- **D-02 — Cardinality:** **Multiple spouse edges are allowed** — the model does NOT
  enforce a single-spouse cap. (User deliberately overrode the "one spouse" default;
  the join table is naturally many-to-many.) NOTE: this diverges from the v2.0
  REQUIREMENTS "one mother/father + spouse" phrasing and from GEN-01's deferral of
  multiple marriage — flag for the planner, but implement as chosen (no unique
  single-spouse constraint).
- **D-03 — Delete behavior (the "married-in" rule):** Deleting a member drops the
  spouse join row(s), and **blood members always survive** the delete. Additionally,
  a spouse who is **"married-in only"** is deleted along with their partner.
  - **"Married-in only" is defined precisely as:** the member has **no linked mother
    AND no linked father AND no children** in the tree — i.e. their only connection to
    the tree is the marriage. Any member with at least one blood link (a parent OR a
    child) is a "blood" member and is never deleted by this rule.
  - **Cascade depth: ONE HOP ONLY.** Delete the target member and their direct
    married-in-only spouse(s). Do NOT recurse if that removal would in turn orphan
    another married-in-only member.
- **D-04 — Success-criterion revision:** This changes ROADMAP Phase 12 success
  criterion #4. Original: "deleting a member does not cascade-delete their
  children/spouse/parents." **Revised:** deleting a member never cascade-deletes any
  **blood** relative (children/parents/blood spouse), but a **married-in-only** spouse
  (per D-03) IS removed with their partner — proven by tests that delete (a) a
  mid-tree blood member and assert descendants + blood spouse survive, and (b) a member
  whose spouse is married-in-only and assert that spouse is removed one hop deep.

### Parent relationships
- **D-05 — Parent columns:** Two nullable self-referencing FK columns on the member:
  **`motherId`** and **`fatherId`** (references the same `FamilyMember` table). Caps
  parents at two and keeps mother/father semantics explicit for REL-01. `ON DELETE`
  must **null out** these references on the children of a deleted member (never
  cascade-delete the children) — this is the core cascade-safety guarantee.

### `mothersname` field
- **D-06 — Purpose:** An **optional free-text** string that records the (biological)
  mother's name for cases where a child is raised by the family but the mother is NOT
  — and will not be — a member node in the tree (e.g. a child born outside the family
  and raised as its own). It does **not** reference a member, is **independent of
  `motherId`**, and exists specifically so that information isn't lost when there's no
  linked mother. **No enforced mutual-exclusivity** with `motherId` — both may be
  present; `mothersname` simply covers the unlinked-mother gap.

### Field & validation rules
- **D-07 — Required fields:** `firstname`, `lastname`, `gender` are required (MEM-01).
  `gender` is an **`ENUM('Male','Female','Other')`** (mirrors the existing `role` ENUM
  pattern on `User`).
- **D-08 — Optional fields (MEM-02):** `mothersname`, `email`, `birthdate`,
  `deathdate`, `phone`, `address` — all optional/nullable.
- **D-09 — `fullname` is derived, never stored (MEM-03):** exposed as a derived value
  (`firstname` + `lastname`) — a Sequelize VIRTUAL getter is the natural fit at the
  model layer; not a persisted column, not a separate input.
- **D-10 — Validation strictness = "light integrity" overall, EXCEPT dates get full
  validation:**
  - Light integrity elsewhere: `gender` ENUM; `email` format validated **only when
    present** (matches `User`'s `isEmail`); everything else stored as-is.
  - **Full date validation:** if both present, **`deathdate` ≥ `birthdate`**; AND
    **reject future dates** (neither `birthdate` nor `deathdate` may be in the future).
  - **Interpretation of "plausible ranges":** future-date rejection is the plausibility
    guard; there is **NO artificial lower bound** on dates, because the tree spans
    ~10–23 generations (potentially into the 1600s) and legitimate old/estimated dates
    must not be rejected. Flagged for the planner as a deliberate reading.

### Cross-cutting (carried forward — not re-decided)
- **D-11 — TDD red-green-refactor** is mandatory (project standard + QUAL-01). Cycle
  and cascade rules must each be proven by a test that constructs the bad state and
  asserts rejection/survival.
- **D-12 — Barrel/model conventions:** the new model follows `backend/src/models/User.js`
  + `backend/src/models/index.js` (init function, `models` object, `initializeDatabase`).
- **D-13 — `sync()` caveat does NOT block Phase 12:** Phase 12 adds only NEW tables, so
  `sync({ force: true })` on a fresh DB is legitimate and is the smoke test (success
  criterion #5). The `users.familyMemberId` manual-`ALTER` problem belongs to Phase 13,
  NOT here.

### Claude's Discretion
Left to research/planning (not user-facing decisions):
- The cycle-prevention algorithm (e.g. walking the ancestor chain before a parent
  edit) and its exact error message.
- Join-table mechanics / association setup and the canonical-ordering enforcement
  mechanism (hook vs helper).
- Whether link operations are surfaced as model instance methods vs standalone service
  functions.
- Whether to gender-type parent slots (e.g. require `motherId` → Female) — not raised
  by the user; default to NOT enforcing gender on parent slots.
- Test file structure and fixtures.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — v2.0 requirements; Phase 12 covers **MEM-01, MEM-02,
  MEM-03, MEM-05, REL-01, REL-02, REL-03, REL-05**. Also see the "Out of Scope" table
  (multiple marriages / half-siblings deferred — relevant to D-02).
- `.planning/ROADMAP.md` §"Phase 12: Family Data Model Foundation" — goal + the 5
  success criteria (criterion #4 revised by D-04 above).
- `.planning/STATE.md` §"Blockers/Concerns" — the `sync()`-doesn't-ALTER carry-forward
  (relevant to D-13; the `users.familyMemberId` ALTER is Phase 13, not here).

### Existing code to follow (conventions)
- `backend/src/models/User.js` — model init pattern: `init(...)` fn, `DataTypes`,
  ENUM usage (`role`), `beforeValidate` normalization hook, `tableName`.
- `backend/src/models/index.js` — barrel: `initX(sequelize)`, `models` object,
  `initializeDatabase()` (`authenticate` + `sync`), `sequelize` re-export.
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md` — naming,
  barrel/aggregator pattern, error-handling style.

No external specs/ADRs beyond the planning docs and existing code above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/models/User.js`: template for the new `FamilyMember` model — ENUM field
  (`role` → `gender`), `beforeValidate` hook (email lowercasing → reuse for
  normalization), `isEmail` validator, `DataTypes.DATE` usage.
- `backend/src/models/index.js`: extend `models` object with `FamilyMember`; the spouse
  join table + self-ref associations get wired here (associations are currently absent —
  `User` is the only model, so this is the first relational/self-ref model in the app).

### Established Patterns
- Barrel/aggregator pattern for models/schemas/resolvers (only `user` domain exists
  today; this adds the `family`/`member` domain).
- ENUM columns modeled like `role: DataTypes.ENUM('ADMIN','USER')`.
- `initializeDatabase()` calls `sequelize.sync()` (no args today) — the Phase 12 smoke
  test needs `sync({ force: true })` against a genuinely fresh DB.

### Integration Points
- New self-referencing FKs (`motherId`, `fatherId`) + spouse join table are entirely
  new tables — no change to the existing `users` table in this phase.
- First introduction of Sequelize associations in the codebase → association setup
  belongs in `models/index.js` after all `init` calls.

</code_context>

<specifics>
## Specific Ideas

- **`mothersname` real-world driver (user's words):** "sometimes a family raises a
  child born from the side, and the family raises him as a son of the family, in that
  case the mother will be missed. To cover such cases." → the free-text `mothersname`
  field (D-06) captures the biological mother when she isn't a tree node.
- **Married-in deletion driver:** the user wants a removed member's spouse to disappear
  only when that spouse has no independent standing in the tree (no blood ties),
  otherwise the spouse — as a blood relative — stays. Modeled exactly as D-03.
- **Multiple spouses:** user explicitly wants the model to permit more than one spouse
  edge (D-02), not the single-spouse default.

</specifics>

<deferred>
## Deferred Ideas

- **Broader admin removal-flow polish → roadmap backlog.** The married-in one-hop
  delete rule (D-03) is built in Phase 12 at the model layer; the richer admin-facing
  removal UX / edge-case handling around member removal is captured as a backlog item
  for the admin removal flow (removal is admin-only, surfaced in Phase 14/15).
- **No seed/demo data in Phase 12.** Only programmatic test fixtures are built here;
  any real/demo family data is entered later using the finished tooling (per
  REQUIREMENTS "Out of Scope: Real family-data entry"). The user did not select the
  seed-data area for discussion — recorded as the default.
- **Multiple-marriage / remarriage-over-time as first-class data (GEN-01)** and
  **half-siblings/step/adoption (GEN-02)** remain deferred to v2 — the model permits
  multiple spouse edges (D-02) but does not model marriage timelines or richer
  genealogy.

</deferred>

---

*Phase: 12-Family Data Model Foundation*
*Context gathered: 2026-07-21*
