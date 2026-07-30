# Phase 19: GraphQL Layer - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the three writable Ge'ez name fields (`geezFirstname`, `geezLastname`, `geezMothersname`) and the read-only derived `geezFullname` flow through the existing GraphQL API — the `FamilyMember` type, the `NewFamilyMemberInput`/`EditFamilyMemberInput` input types, and the existing spread-passthrough create/update resolvers — with **zero new resolver logic** (DATA-03).

This is a **backend-only** phase: schema type + input types, the `OPTIONAL_FAMILY_MEMBER_FIELDS` list, a one-line model VIRTUAL hardening, and GraphQL integration tests. It does **not** touch the frontend. Rendering these fields on read surfaces is Phase 22; wiring them into the write-path forms is Phase 23.

</domain>

<decisions>
## Implementation Decisions

### Phase scope
- **D-01:** Backend-only. Phase 19 edits `backend/src/schemas/familyMember.schema.js` (add 4 fields to `type FamilyMember`; add the 3 writable fields to both `NewFamilyMemberInput` and `EditFamilyMemberInput`), `backend/src/resolvers/user.resolver.js` (extend `OPTIONAL_FAMILY_MEMBER_FIELDS`), and adds a backend GraphQL integration test. It does **not** modify any frontend inline GraphQL query strings — selecting/rendering these fields client-side is deferred to Phases 22 (read) and 23 (write). Selecting fields nothing renders yet is explicitly avoided.

### geezFullname VIRTUAL hardening (closes 18-REVIEW.md WR-01)
- **D-02:** Fix WR-01 as part of this phase. Redeclare the `geezFullname` VIRTUAL to declare its source-field dependencies: `type: new DataTypes.VIRTUAL(DataTypes.STRING, ['geezFirstname', 'geezLastname'])`, keeping the existing defensive `get()` body unchanged. Exposing `geezFullname` over the GraphQL API is exactly the scenario where the undeclared dependency bites — a future query that restricts Sequelize `attributes` would otherwise silently return `null`. No resolver restricts `attributes` today, so this is proactive hardening, not a live-bug fix.
- **D-03:** This VIRTUAL change touches `backend/src/models/FamilyMember.js` (Phase 18's file). It is a **model type declaration** change, not resolver logic — it stays inside the roadmap's "zero new resolver logic" boundary. The existing Phase 18 fill-matrix tests for `geezFullname` must remain green after the change (the `get()` body and its output are unchanged).
- **Claude's Discretion (see below):** whether to apply the same dependency-declaration hardening to the existing Latin `fullname` VIRTUAL for consistency.

### Ge'ez input validation
- **D-04:** No validation. The three Ge'ez input fields are plain nullable `String` in both input types, mirroring `mothersname` exactly (Phase 18 D-05). No `@constraint`, no Ethiopic/Unicode-range script check — accept any string. This is consistent with every other optional string field and preserves "zero new resolver logic." Blank strings become `null` via the existing `sanitizeNewMember` path once the fields are added to `OPTIONAL_FAMILY_MEMBER_FIELDS` (SC3).

### Integration test breadth
- **D-05:** Focused coverage, not exhaustive. The integration test proves the round-trip through a representative create mutation plus `editMember`: (1) create a member with Ge'ez fields set and read them back; (2) `editMember` sets Ge'ez fields and reads them back; (3) `editMember` clears a Ge'ez field and asserts it reads back `null`, not `""` (proves SC3 — the `OPTIONAL_FAMILY_MEMBER_FIELDS` addition); (4) assert `geezFullname` derives correctly over the API. Do not duplicate the same assertion across all five `NewFamilyMemberInput` mutations — the passthrough is shared, so one create-path proof suffices.

### Claude's Discretion
- Which single create mutation to use for the create-path round-trip test (e.g. `addChild`, `addSibling`, or `linkUserToMember`) — pick whichever gives the cleanest, least-scaffolding integration test given existing test helpers.
- Whether to also declare source-field dependencies on the existing Latin `fullname` VIRTUAL for consistency with D-02. Lean: keep Phase 19 scoped to `geezFullname` unless the `fullname` change is trivial and risk-free; `fullname`'s parts are required and it is not being newly exposed, so its latent risk is lower. If skipped, note it as a follow-up.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §DATA-03 — the single requirement this phase satisfies (readable/writable Ge'ez fields over GraphQL; clearing persists `null`).
- `.planning/ROADMAP.md` §"Phase 19: GraphQL Layer" — goal + the 4 success criteria that lock most of the "what".

### Prior-phase decisions (carried forward)
- `.planning/phases/18-data-model-migration/18-CONTEXT.md` §D-01/D-02/D-05 — `geezFullname` joins only first+last (excludes `geezMothersname`), returns `null` when empty, Ge'ez fields are unvalidated nullable strings.
- `.planning/phases/18-data-model-migration/18-REVIEW.md` §WR-01 — the undeclared-VIRTUAL-dependency finding this phase fixes (D-02); §WR-02 for context on the migration comment (not in scope here).
- `.planning/phases/18-data-model-migration/18-01-SUMMARY.md` — what Phase 18 actually shipped on the model.

### Code touch-points
- `backend/src/schemas/familyMember.schema.js` — `type FamilyMember` (line 13), `NewFamilyMemberInput` (line 39), `EditFamilyMemberInput` (line 54). `fullname: String!` is the analog for exposing `geezFullname` on the type (read-only, not in inputs).
- `backend/src/resolvers/user.resolver.js` §`OPTIONAL_FAMILY_MEMBER_FIELDS` (line 41) + `sanitizeNewMember` (line 52) — the blank-string→null passthrough the 3 writable fields must join.
- `backend/src/models/FamilyMember.js` — the `geezFullname` VIRTUAL to harden (D-02).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sanitizeNewMember` / `OPTIONAL_FAMILY_MEMBER_FIELDS` (`user.resolver.js:41,52`): the single shared blank→null path. Adding the 3 Ge'ez fields here is the entire mechanism for SC3 — no per-mutation code.
- The existing `fullname: String!` field on `type FamilyMember`: exact analog for exposing `geezFullname` (read-only, derived, absent from input types). Note `geezFullname` is nullable (`String`, not `String!`) since it can be `null`.
- Existing family-member resolver integration tests (`backend/src/resolvers/familyMember.*.test.js`) and test helpers — templates for the focused round-trip test (D-05).

### Established Patterns
- Spread-passthrough: mutations do `...sanitizeNewMember(newMember)` into `FamilyMember.create`, and `editMember` spreads `fields`. Adding fields to the input types + `OPTIONAL_FAMILY_MEMBER_FIELDS` is sufficient; no resolver body changes.
- `EditFamilyMemberInput` deliberately excludes edge-mutating fields (D-05 structural, schema comment lines 51-53) — the 3 Ge'ez fields are plain data fields and belong here.
- Schema is a single tagged-template SDL string per domain; no codegen.

### Integration Points
- GraphQL type/input SDL ↔ Sequelize model attributes: the 3 writable Ge'ez columns already exist on the model (Phase 18); this phase only opens the API surface to them.
- `geezFullname` (VIRTUAL) is read-only — exposed on the type, never in an input.

</code_context>

<specifics>
## Specific Ideas

- `geezFullname` on the type must be nullable `String` (not `String!`) — it returns `null` when no Ge'ez parts are set (Phase 18 D-02), unlike the required Latin `fullname: String!`.
- SC3 is the load-bearing correctness point: clearing a Ge'ez field over the API must persist `null`, not `""`. This is achieved purely by adding the three fields to `OPTIONAL_FAMILY_MEMBER_FIELDS`, and must be proven by an integration test (the edit-then-clear assertion in D-05).

</specifics>

<deferred>
## Deferred Ideas

- **Ethiopic-script validation** on Ge'ez inputs — considered and rejected for this phase (D-04, conflicts with "zero new resolver logic" and D-05's no-validation precedent). If ever wanted, it's a standalone data-quality concern for a later phase.
- **Frontend query strings / rendering** the Ge'ez fields — Phase 22 (read surfaces) and Phase 23 (write forms).
- **Declaring source deps on the Latin `fullname` VIRTUAL** — optional consistency follow-up (see Claude's Discretion); track if not done in Phase 19.

</deferred>

---

*Phase: 19-graphql-layer*
*Context gathered: 2026-07-30*
