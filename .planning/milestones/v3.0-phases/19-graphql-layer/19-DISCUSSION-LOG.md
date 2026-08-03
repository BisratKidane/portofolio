# Phase 19: GraphQL Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-30
**Phase:** 19-graphql-layer
**Areas discussed:** Phase scope, VIRTUAL hardening (WR-01), Input validation, Test breadth

---

## Phase scope

| Option | Description | Selected |
|--------|-------------|----------|
| Backend-only | Schema type + input types + OPTIONAL_FAMILY_MEMBER_FIELDS + GraphQL integration tests; leave frontend query strings alone (read → Phase 22, write → Phase 23) | ✓ |
| Backend + frontend queries | Also update inline frontend GraphQL query strings to select the new fields now | |

**User's choice:** Backend-only
**Notes:** Avoids selecting fields nothing renders yet; respects the roadmap's Phase 22/23 sequencing for read/write surfaces.

---

## VIRTUAL hardening (code-review WR-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Fix now | Declare `new DataTypes.VIRTUAL(DataTypes.STRING, ['geezFirstname','geezLastname'])`; exposing over the API is exactly when an attributes-restricted query would return null | ✓ |
| Defer | Leave the bare VIRTUAL; no resolver restricts `attributes` today | |

**User's choice:** Fix now
**Notes:** Cheap one-line, test-backed. Touches FamilyMember.js (a model type declaration, not resolver logic — stays within "zero new resolver logic"). Existing Phase 18 fill-matrix tests must remain green.

---

## Input validation

| Option | Description | Selected |
|--------|-------------|----------|
| No validation | Accept any string; mirror `mothersname` (Phase 18 D-05); blank → null via OPTIONAL_FAMILY_MEMBER_FIELDS | ✓ |
| Ethiopic-script check | Reject non-Ge'ez text via a script/Unicode-range validator | |

**User's choice:** No validation
**Notes:** Consistent with every other optional string field; preserves "zero new resolver logic." Script validation deferred as a standalone data-quality concern.

---

## Test breadth

| Option | Description | Selected |
|--------|-------------|----------|
| Focused | One create mutation + editMember round-trip + null-clearing assertion + geezFullname derivation | ✓ |
| Broad | Assert passthrough across all NewFamilyMemberInput mutations plus editMember | |

**User's choice:** Focused
**Notes:** The passthrough is shared, so one create-path proof suffices. Edit-then-clear assertion is load-bearing for SC3.

---

## Claude's Discretion

- Which create mutation to use for the create-path round-trip test (addChild / addSibling / linkUserToMember) — pick the cleanest given existing test helpers.
- Whether to also declare source-field deps on the existing Latin `fullname` VIRTUAL for consistency; lean toward keeping Phase 19 scoped to `geezFullname` unless the `fullname` change is trivial and risk-free.

## Deferred Ideas

- Ethiopic-script validation on Ge'ez inputs — later phase, if ever.
- Frontend query strings / rendering — Phases 22 (read) and 23 (write).
- Declaring source deps on the Latin `fullname` VIRTUAL — optional consistency follow-up.
