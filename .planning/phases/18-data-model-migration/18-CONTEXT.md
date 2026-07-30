# Phase 18: Data Model & Migration - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Give `FamilyMember` records optional Ge'ez-script name storage — three nullable
columns (`geezFirstname`, `geezLastname`, `geezMothersname`) plus a derived
`geezFullname` VIRTUAL — via a portable hand-applied migration (`018-*.sql`),
before any API or UI depends on it. Delivers DATA-01 and DATA-02.

This is a backend-only, additive data-layer phase. No GraphQL, no frontend, no
font work — those are later phases (19–23). Every change is backward-compatible:
existing members with no Ge'ez data must continue to boot, query, and serialize
without error.

</domain>

<decisions>
## Implementation Decisions

### geezFullname composition
- **D-01:** `geezFullname` mirrors the existing Latin `fullname` VIRTUAL exactly —
  it joins **only** `geezFirstname` + `geezLastname`. The mother's name is
  **excluded** from the combined name, just as Latin `mothersname` is excluded
  from `fullname`. `geezMothersname` stays a standalone field rendered on its own
  row in later view phases.
- **D-02:** The getter is written defensively for all-optional parts (unlike the
  required Latin firstname/lastname): `[geezFirstname, geezLastname].filter(Boolean).join(' ') || null`.
  It must return `null` (not `""`) when no Ge'ez parts are set, and must never
  emit stray leading/trailing spaces or literal `"null"`/`"undefined"` strings.
  Unit-tested across the none / first-only / last-only / all-filled matrix
  (Success Criteria #3).

### Cross-engine portability
- **D-03:** Portability is proven by construction + local run + documentation —
  **not** by a live MySQL 8.4 test in this phase. Write bare-portable DDL
  (`CHARACTER SET utf8mb4`, **no** `COLLATE`, **no** `utf8mb4_0900_ai_ci`, **no**
  `ENCRYPTION` clause), apply it against local MariaDB, and add 018 to the README
  manual-migration list with a note that it is MySQL-8.4-safe. Mirrors how 013/014
  were handled. No throwaway MySQL 8.4 container run.

### Prod rollout timing
- **D-04:** Phase 18 writes, tests, and commits the migration + model change but
  does **NOT** apply 018 to the live prod DB (agne.bisrat.ch). The column isn't
  needed until the Ge'ez API/UI ships (Phases 19+), and the backend boots fine
  without it meanwhile. The prod apply happens later, in the coordinated deploy
  that ships the feature. Matches the established manual-migration handling.

### Model guardrails (from precedent, not discussed)
- **D-05:** The three Ge'ez columns are plain nullable `VARCHAR(255)` with **no**
  validation and **no** length constraint beyond the default — matching the
  existing optional string fields (`mothersname`, `address`, `phone`). No script
  validation; names are entered via the user's own device IME.

### Testing approach (standing preference)
- **D-06:** Test-first (TDD red-green-refactor) per the user's standing
  preference. Write the `geezFullname` fill-matrix unit tests before/as the getter
  is implemented. The full `npm test` suite stays green.

### Claude's Discretion
- Exact `.sql` file naming suffix (following the `018-add-family-members-geez-names.sql`
  shape suggested by research), header-comment wording, and column ordering within
  the `ALTER TABLE` are Claude's discretion, following the 013/014 convention.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-02 definitions and the confirmed
  scope decisions (three columns, no Ge'ez for address/email/phone).
- `.planning/ROADMAP.md` § "Phase 18: Data Model & Migration" — the four Success
  Criteria this phase is verified against.

### Research (well-precedented — skip deep research, proceed to planning)
- `.planning/research/SUMMARY.md` — the authoritative build guidance. Key items
  for this phase: the defensive `geezFullname` getter recipe (Pitfall 4), the
  MySQL-8-vs-MariaDB portable-DDL requirement (Pitfall 3), the "`sync()` never
  alters tables" hard prerequisite (Pitfall 2), and the note that this phase is
  fully precedented by migrations 013/014/016/017.

### Codebase precedents to follow
- `backend/src/models/FamilyMember.js` — the model to extend; `fullname` VIRTUAL
  getter (`get() { return \`${this.firstname} ${this.lastname}\`; }`) is the
  pattern `geezFullname` mirrors (but defensively — see D-02).
- `backend/migrations/manual/013-add-family-members-profile-picture.sql` — closest
  analog: single nullable additive column on `family_members`, header-comment
  convention, `ADD COLUMN ... VARCHAR(255) NULL DEFAULT NULL`.
- `backend/migrations/manual/014-add-family-members-isalive-and-provenance.sql` —
  multi-column `ALTER TABLE family_members` example.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FamilyMember.js` `fullname` VIRTUAL — direct template for `geezFullname`, but
  the port must be defensive (all Ge'ez parts optional; Latin first/last are not).
- Manual-migration convention (`backend/migrations/manual/NNN-*.sql`) with the
  standard "NOT applied by sequelize.sync()" header block — copy 013's header shape.

### Established Patterns
- Optional string fields on `FamilyMember` (`mothersname`, `email`, `phone`,
  `address`) are `DataTypes.STRING` + `allowNull: true`, no backfill — the three
  Ge'ez columns follow this exactly.
- `sequelize.sync()` creates tables on fresh DBs but never alters existing ones —
  so the migration is a hard prerequisite, not optional (Pitfall 2).

### Integration Points
- Only `backend/src/models/FamilyMember.js` and a new
  `backend/migrations/manual/018-*.sql` change in this phase. No resolver, schema,
  or frontend files are touched (those are Phases 19+).
- README's manual-migration list gets 018 appended (documentation, per D-03).

</code_context>

<specifics>
## Specific Ideas

- `geezFullname` getter, exact shape:
  `[this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null`.
- Migration DDL must avoid, specifically: `utf8mb4_0900_ai_ci` collation, any
  explicit `COLLATE`, and any `ENCRYPTION=` clause — these are the exact tokens
  that break MariaDB (Pitfall 3).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Live MySQL 8.4 portability testing
and the prod-DB apply were both explicitly deferred as decisions D-03/D-04, not as
new capabilities.)

</deferred>

---

*Phase: 18-data-model-migration*
*Context gathered: 2026-07-30*
