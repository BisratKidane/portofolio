# Phase 12: Family Data Model Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 12-Family Data Model Foundation
**Areas discussed:** Spouse link shape, Parents + mothersname, Optional-field validation

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Spouse link shape | How the symmetric spouse relationship is stored | ✓ |
| Parents + mothersname | Parent FK modeling + meaning of the mothersname field | ✓ |
| Seed/demo data scope | Ship a seed family in Phase 12 or defer | |
| Optional-field validation | How strict the model layer validates optional fields | ✓ |

**Notes:** Seed/demo data not selected → recorded default (no seed in Phase 12; programmatic test fixtures only).

---

## Spouse link shape

### Storage shape

| Option | Description | Selected |
|--------|-------------|----------|
| One canonical row | Single join row per couple, ordered id pair, unique; one source of truth | ✓ |
| Two mirrored rows | A→B and B→A rows kept in sync | |

**User's choice:** One canonical row.

### Cardinality (monogamy)

| Option | Description | Selected |
|--------|-------------|----------|
| One at a time | Enforce at most one spouse per member (aligns with deferred GEN-01) | |
| Allow multiple | No cap on spouse edges | ✓ |

**User's choice:** Allow multiple.
**Notes:** Deliberate override of the recommended "one spouse" default. Diverges from REQUIREMENTS "one mother/father + spouse" phrasing — flagged in CONTEXT.md D-02 for the planner.

### Delete behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Drop the edge only | Deleting A removes the join row; B always survives | |
| Keep a dangling ref | Preserve row with nulled side | |
| (free text) | "If the deleted member is only there by marriage delete the spouse, but if by birth keep in the tree" | ✓ |

**User's choice:** Free-text — introduce a "married-in vs blood" distinction for deletion.
**Notes:** Prompted a follow-up split between DB-level cascade safety (Phase 12) and the deletion policy. User then chose to **build the married-in rule now** (see below), revising success criterion #4.

### Follow-up: DB safety vs building the rule now

| Option | Description | Selected |
|--------|-------------|----------|
| Drop edge, keep both members | Model-layer delete stays purely safe; married-in rule deferred to Phase 14/15 | |
| Build the married-in rule now | Implement "delete member → also delete married-in-only spouse" in Phase 12 | ✓ |

**User's choice:** Build the married-in rule now.

### Follow-up: where to capture the broader policy

| Option | Description | Selected |
|--------|-------------|----------|
| Note for Phase 14/15 | Record for the admin removal flow | |
| Roadmap backlog | Capture at milestone/backlog level | ✓ |

**User's choice:** Roadmap backlog (for the broader admin removal-flow polish; core rule still built now).

### Follow-up: "married-in-only" definition

| Option | Description | Selected |
|--------|-------------|----------|
| No parents AND no children | Only connection is the marriage | ✓ |
| No parents linked | Ignores children | |

**User's choice:** No parents AND no children.

### Follow-up: cascade depth

| Option | Description | Selected |
|--------|-------------|----------|
| One hop only | Delete target + direct married-in-only spouses; no recursion | ✓ |
| Recurse fully | Keep walking orphaned married-in-only members | |

**User's choice:** One hop only.

---

## Parents + mothersname

### Parent columns

| Option | Description | Selected |
|--------|-------------|----------|
| Two FK columns: motherId + fatherId | Explicit nullable self-ref columns | ✓ |
| Generic parent self-ref | Single generic parent link | |

**User's choice:** Two FK columns: motherId + fatherId.

### mothersname meaning

| Option | Description | Selected |
|--------|-------------|----------|
| Free-text cultural/heritage name | Standalone text, no FK | |
| Denormalized cache of linked mother | Convenience copy of linked mother's name | |
| Let me explain | User describes it | ✓ |

**User's choice:** Free text — user explained.
**Notes (user's words):** "sometimes a family raises a child born from the side, and the family raises him as a son of the family, in that case the mother will be missed. To cover such cases." → captured as an optional free-text field for a biological mother who is not (and won't be) a member node; independent of `motherId`, no enforced exclusivity (CONTEXT.md D-06).

---

## Optional-field validation

### Overall strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Light integrity checks | gender ENUM, email format when present, basic date sanity | ✓ |
| Store loosely | Almost no validation | |
| Strict now | Full validation incl. phone normalization etc. | |

**User's choice:** Light integrity checks (with dates escalated — see below).

### Date rules

| Option | Description | Selected |
|--------|-------------|----------|
| deathdate >= birthdate only | Single invariant, no future-date guessing | |
| No date rules | Store as-is | |
| Full date validation | deathdate >= birthdate AND reject future dates AND plausible ranges | ✓ |

**User's choice:** Full date validation.
**Notes:** Implemented as `deathdate ≥ birthdate` + reject future dates, with NO artificial lower bound (tree spans ~10–23 generations, possibly into the 1600s) — "plausible ranges" read as future-date rejection only. Flagged in CONTEXT.md D-10.

---

## Claude's Discretion

- Cycle-prevention algorithm and its error message.
- Join-table mechanics / canonical-ordering enforcement (hook vs helper).
- Whether link operations are model instance methods vs standalone service functions.
- Gender-typing of parent slots (default: not enforced).
- Test file structure and fixtures.

## Deferred Ideas

- Broader admin removal-flow polish → roadmap backlog (member removal is admin-only, Phase 14/15).
- No seed/demo data in Phase 12 — programmatic test fixtures only; real data entered later.
- Multiple-marriage timelines (GEN-01) and half-siblings/step/adoption (GEN-02) remain v2-deferred; model permits multiple spouse edges but not marriage timelines.
