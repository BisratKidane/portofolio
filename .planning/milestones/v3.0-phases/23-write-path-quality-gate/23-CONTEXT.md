# Phase 23: Write Path & Quality Gate - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **write path** for Ge'ez names and close the v3.0 milestone quality gate. Specifically:
- Add the three Ge'ez name inputs (`geezFirstname`, `geezLastname`, `geezMothersname`) to the shared `MemberFields.jsx` form, so users can enter/edit them via **both** the Manage add-relative dialog (`AddRelativeDialog.jsx`) and the edit-member dialog (`EditMemberDialog.jsx`) using their own device keyboard/IME (EDIT-01).
- Make the add-relative `Autocomplete` picker findable by typed Ge'ez text via a custom `filterOptions`, without changing the visible Latin-only option label (FIND-02).
- Close the milestone quality gate: `displayName`/`geezFullname` unit tests stay green, full `npm test` (backend + frontend) passes in CI, and a manual glyph/visual sign-off against real Tigrinya names is recorded (QUAL-01) — this absorbs the deferred Phase 22 real-glyph visual sign-off.

**This phase is frontend-only.** The backend already accepts these writes — the create/update resolvers pass Ge'ez fields through via spread-passthrough (Phase 19), and the three fields are in `OPTIONAL_FAMILY_MEMBER_FIELDS`, so clearing a field persists `null`, not `''` (DATA-03). No new resolver work.
</domain>

<decisions>
## Implementation Decisions

### Ge'ez field layout (in shared `MemberFields.jsx`)
- **D-01:** Each Ge'ez input sits in a row **directly below its Latin twin**, column-aligned, preserving the form's existing 2-column (`Stack direction={{ xs:'column', sm:'row' }}`) structure — NOT beside the Latin field, and NOT a separate grouped "Ge'ez section". Concrete arrangement:
  ```
  First name        | Last name
  Ge'ez first name  | Ge'ez last name
  Gender            | Mother's name
  (empty)           | Ge'ez mother's name
  Birthdate         | Living [toggle]
  Email             | Phone
  Address
  ```
- **D-02:** The existing `Gender | Mother's name` row is preserved. Ge'ez mother's name goes in the **right column directly under Mother's name**; the left slot under Gender stays **empty** (Gender has no Ge'ez twin). Do not move Gender.
- **D-03:** Latin fields keep their current labels/required flags untouched. The three Ge'ez fields are **optional** (nullable), matching the Latin `Mother's name` (also optional) — no `required` flag.

### Ge'ez field labels (bilingual — user-supplied exact terms)
- **D-04:** Labels are **bilingual**: English descriptor + the native Ge'ez/Tigrinya term in parentheses. Use these **exact** user-provided terms verbatim (do not translate, transliterate, or "correct" them):
  - Ge'ez first name → **ስም**  → label: `Ge'ez first name (ስም)`
  - Ge'ez last name → **ስም ኣቦ**  → label: `Ge'ez last name (ስም ኣቦ)`
  - Ge'ez mother's name → **ስም ኣደ**  → label: `Ge'ez mother's name (ስም ኣደ)`
- **D-05:** SC1 round-trip must hold: values entered persist and read back correctly on dialog reopen (both add and edit paths). Clearing a Ge'ez field must send it such that the backend stores `null` (the `OPTIONAL_FAMILY_MEMBER_FIELDS` path already handles `'' → null`).

### Add-relative picker search (FIND-02)
- **D-06:** Replace the `Autocomplete`'s default filtering with a custom `filterOptions` (via MUI `createFilterOptions`) that matches the typed query against **`fullname` OR `geezFullname`** (null-guarded), decoupled from `getOptionLabel` (which stays Latin `fullname`). The visible option label remains Latin-only per FIND-02.

### Milestone quality gate / manual sign-off (QUAL-01)
- **D-07:** The manual glyph/visual sign-off is done by **entering real Tigrinya names via the new dialog** (no direct SQL/data seeding) — including the longest realistic name — then visually verifying rendering + fixed-card truncation/overflow on `/family` and both `/manage` surfaces. This closes the deferred Phase 22 VIEW-01 gate in one pass.
- **D-08:** Full `npm test` (backend + frontend) must be green at milestone close. NOTE: two **pre-existing** backend integration failures exist and are unrelated to v3.0 (`verifyEmail` VERIFY-04 admin-race; `familyMember.dedup` REL-06 TOCTOU) — see Deferred. The gate should not be blocked by these unless the planner scopes fixing them; flag them explicitly rather than silently passing.

### Claude's Discretion
- **Picker matched-row display:** whether to also surface the Ge'ez name as a secondary line in matched `renderOption` rows (so the user sees *why* a Latin-labelled row matched) is left to the planner. FIND-02 only requires the label stay Latin; a secondary line is an optional enhancement, not a requirement.
- **Placeholder / IME hint:** whether Ge'ez inputs get a placeholder example or helper text is planner's discretion; the bilingual label already cues the field's purpose.
- **No input validation** that Ge'ez fields contain Ge'ez script — free text via device IME, trust the user (consistent with the no-transliteration decision).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — EDIT-01, FIND-02, QUAL-01 (locked scope decisions: Ge'ez columns are the 3 name fields only; entry via device IME, no transliteration; Ge'ez search in both admin table AND add-relative picker; Latin primary, stacked, no toggle).
- `.planning/ROADMAP.md` §"Phase 23: Write Path & Quality Gate" — goal + 4 success criteria (SC1 round-trip persist/reopen; SC2 custom filterOptions, Latin label; SC3 helper/derivation tests + full suite green in CI; SC4 manual glyph sign-off recorded).

### Prior-phase context (build order & locked patterns)
- `.planning/phases/22-render-surfaces-read-path/22-CONTEXT.md` — read-path decisions the write path mirrors (getGeezDisplay usage, stacked display).
- `.planning/phases/22-render-surfaces-read-path/22-03-SUMMARY.md` — the deferred Phase 22 visual sign-off this phase closes (status: deferred; reason: 0 members had Ge'ez names until this write path).
- `.planning/phases/19-graphql-layer/19-01-SUMMARY.md` (or `19-CONTEXT.md`) — proves the backend write path: spread-passthrough create/update resolvers + `OPTIONAL_FAMILY_MEMBER_FIELDS` (clear → null).
- `.planning/research/SUMMARY.md` — notes the MUI Autocomplete `filterOptions` gap (default filter only matches `getOptionLabel`) and backend near-zero resolver changes.

### Key source files (implementation targets)
- `frontend/src/components/manage/MemberFields.jsx` — shared add/edit form; add the 3 Ge'ez inputs here (single source → both dialogs).
- `frontend/src/components/manage/AddRelativeDialog.jsx` §Autocomplete (~line 243) — add custom `filterOptions`.
- `frontend/src/components/manage/EditMemberDialog.jsx` — consumes MemberFields; verify Ge'ez values load + round-trip.
- `frontend/src/utils/displayName.js` — the `getGeezDisplay`/`geezFullname` invariants QUAL-01 re-confirms.
- `backend/src/resolvers/user.resolver.js` (OPTIONAL_FAMILY_MEMBER_FIELDS incl. geez fields) — the null-on-clear guarantee; no changes expected.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MemberFields.jsx`: shared by BOTH `AddRelativeDialog` and `EditMemberDialog` — adding the 3 Ge'ez inputs here wires entry into both dialogs at once. Layout is a vertical `Stack` of 2-column `Stack` rows; `handleTextChange(field)` already generalizes text-field wiring.
- `createFilterOptions` (MUI): the standard way to build a custom `filterOptions` for the `AddRelativeDialog` Autocomplete (FIND-02).
- Backend spread-passthrough resolvers + `OPTIONAL_FAMILY_MEMBER_FIELDS`: write path already accepts geez fields and maps `'' → null` on clear — no resolver changes.

### Established Patterns
- This app's test-first convention (TDD RED→GREEN) applies — Phase 22 and prior v3.0 phases all shipped RED test → GREEN impl commits. QUAL-01 explicitly wants unit coverage; expect component tests for the new form fields (values render, round-trip, clear→null) and the picker's Ge'ez filter.
- Ge'ez fields mirror the existing optional `mothersname` field pattern (nullable, non-required TextField).

### Integration Points
- `MemberFields` `form` object must carry `geezFirstname`/`geezLastname`/`geezMothersname`; the dialogs' initial-state/reset logic and their GraphQL mutation variable assembly must include the three fields (add + edit).
- The edit dialog's initial load must hydrate the 3 Ge'ez values from the fetched member (the read queries already fetch `geezFullname`, but the EDIT form needs the raw parts — confirm `EDITABLE_MEMBER_FIELDS`/edit query fetches `geezFirstname`/`geezLastname`/`geezMothersname`, not just the derived `geezFullname`).
</code_context>

<specifics>
## Specific Ideas

- Bilingual label terms are **user-supplied and locked** (D-04): `ስም`, `ስም ኣቦ`, `ስም ኣደ`. These are the family's Tigrinya terms — use verbatim, do not alter.
- Layout is a deliberate "Ge'ez directly under its Latin twin, column-aligned" arrangement (D-01/D-02) — the user explicitly rejected "beside" and "separate grouped section".
</specifics>

<deferred>
## Deferred Ideas

- **Pre-existing backend test failures (not this phase's bug):** `verifyEmail` VERIFY-04 (simultaneous-verify ADMIN race) and `familyMember.dedup` REL-06 (TOCTOU dedup under REPEATABLE READ) — concurrency/transaction-isolation integration tests failing against the shared dev DB, unrelated to v3.0 (backend source unchanged across Phase 22). QUAL-01's "full suite green in CI" may require triaging these; surface explicitly, don't mask. Could be its own debug/fix task.
- Ge'ez in the read-only member **detail panel** and **dashboard greeting** — v3.0 out of scope (Future Requirements).
- **LinkAccounts** admin picker Ge'ez matching (same Autocomplete surface, different page) — deferred (Future Requirements).
- Latin ↔ Ge'ez display **toggle** and broader Amharic/Tigrinya **UI localization** — explicitly out of scope this milestone.
</deferred>

---

*Phase: 23-write-path-quality-gate*
*Context gathered: 2026-07-31*
