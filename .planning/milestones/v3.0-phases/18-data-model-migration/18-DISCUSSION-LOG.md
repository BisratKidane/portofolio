# Phase 18: Data Model & Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-30
**Phase:** 18-data-model-migration
**Areas discussed:** geezFullname composition, Cross-engine verification, Prod rollout timing

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| geezFullname composition | How the derived combined Ge'ez name is built | ✓ |
| Cross-engine verification | How hard to prove MySQL 8.4 ↔ MariaDB portability | ✓ |
| Prod rollout timing | Whether to apply 018 to live prod in this phase | ✓ |
| Model guardrails | Validation/length on the Ge'ez columns | (not selected — took precedent default) |

---

## geezFullname composition

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Latin fullname | `geezFirstname + geezLastname` only, mother's name excluded — identical to the existing `fullname` VIRTUAL | ✓ |
| First + Father + Mother | Join all three present parts (given + father's + mother's), per Habesha naming convention | |

**User's choice:** Mirror Latin fullname
**Notes:** Keeps Latin/Ge'ez behavior symmetric and predictable; `geezMothersname`
remains a standalone field rendered separately in later view phases.

---

## Cross-engine verification

| Option | Description | Selected |
|--------|-------------|----------|
| Local + documented (research default) | Bare-portable DDL, run against local MariaDB, README note that it's MySQL-8.4-safe. Same as 013/014. | ✓ |
| Add a real MySQL 8.4 run | Also run 018.sql in a throwaway MySQL 8.4 container to prove portability with evidence | |

**User's choice:** Local + documented
**Notes:** Portability guaranteed by construction (no `COLLATE`, no
`utf8mb4_0900_ai_ci`, no `ENCRYPTION`); no live MySQL 8.4 container run this phase.

---

## Prod rollout timing

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to deploy time | Write/test/commit 018 + model change; prod DB untouched until the deploy that ships Ge'ez API/UI | ✓ |
| Apply to prod now | Also hand-run 018 against live prod MySQL 8.4 during this phase | |

**User's choice:** Defer to deploy time
**Notes:** Column isn't needed until Phases 19+; backend boots fine without it.
Prod apply happens in the coordinated feature deploy.

---

## Claude's Discretion

- Exact `.sql` filename suffix, header-comment wording, and column ordering within
  the `ALTER TABLE`, following the 013/014 convention.
- Model guardrails: not discussed — took the precedent default (plain nullable
  `VARCHAR(255)`, no validation, matching `mothersname`/`address`/`phone`).

## Deferred Ideas

None — discussion stayed within phase scope.
