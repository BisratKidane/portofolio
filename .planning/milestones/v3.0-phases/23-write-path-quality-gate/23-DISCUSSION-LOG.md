# Phase 23: Write Path & Quality Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-31
**Phase:** 23-write-path-quality-gate
**Areas discussed:** Ge'ez field layout, Ge'ez labels & guidance

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Ge'ez field layout | Where the 3 Ge'ez inputs sit in MemberFields | ✓ |
| Ge'ez labels & guidance | Label wording + optional cue + placeholder | ✓ |
| Picker match display | How a Ge'ez-matched Autocomplete row appears | (default) |
| Milestone sign-off | Real-data sourcing for the manual glyph gate | (default) |

**User's choice:** Discussed layout + labels; took defaults on picker display and sign-off.

---

## Ge'ez field layout

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped Ge'ez section | Separate "Ge'ez name (optional)" block below Latin name fields | |
| Paired beside each Latin | Ge'ez field in the same row as its Latin twin | (initially picked, then clarified) |
| Ge'ez stacked under each | Ge'ez input directly below its Latin field | |

**User's choice:** After clarification — **Ge'ez row directly under each Latin row, column-aligned, preserving the 2-column layout** (not beside, not a separate grouped section, not full-width vertical stack).
**Notes:** User first selected "Paired beside each Latin" then clarified "when I say paired, I meant just below it." A follow-up confirmed the "2-column preserved, Ge'ez row under each Latin row" interpretation over a full-width vertical stack. Gender stays in its existing `Gender | Mother's name` row; Ge'ez mother's name goes under Mother's name (right column); the slot under Gender stays empty.

---

## Ge'ez labels & guidance

| Option | Description | Selected |
|--------|-------------|----------|
| Ge'ez first name | Explicit English "Ge'ez …" prefix, no native script | |
| First name (Ge'ez) | Latin name + "(Ge'ez)" suffix | |
| Bilingual label | English + native Ge'ez script in the label | ✓ |

**User's choice:** **Bilingual labels** with user-supplied exact Ge'ez/Tigrinya terms.
**Notes:** Claude declined to fabricate the native terms; user provided them directly:
first name → **ስም**, last name → **ስም ኣቦ**, mother's name → **ስም ኣደ**. Captured verbatim as D-04 (`Ge'ez first name (ስም)`, `Ge'ez last name (ስም ኣቦ)`, `Ge'ez mother's name (ስም ኣደ)`).

---

## Claude's Discretion

- Picker matched-row display — whether to reveal the Ge'ez name as a secondary line in matched `renderOption` rows (FIND-02 only mandates the label stay Latin).
- Ge'ez input placeholder / IME helper text.
- No script-validation on Ge'ez inputs (free text via device IME).

## Deferred Ideas

- Pre-existing backend integration failures (VERIFY-04 admin-race, REL-06 dedup TOCTOU) — unrelated to v3.0; may need triage for QUAL-01's "full suite green".
- Ge'ez in detail panel / dashboard; LinkAccounts picker Ge'ez search; Latin↔Ge'ez toggle; full UI localization — all explicitly out of v3.0 scope.
