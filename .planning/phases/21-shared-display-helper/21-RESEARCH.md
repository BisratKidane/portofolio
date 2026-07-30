# Phase 21: Shared Display Helper - Research

**Researched:** 2026-07-30
**Domain:** Frontend pure-function utility design (React/JS display-derivation helper, no UI)
**Confidence:** HIGH

## Summary

Phase 21 has no `CONTEXT.md` (confirmed — `.planning/phases/21-shared-display-helper/` contains no other files, and `STATE.md` explicitly says "Phase 21 has no CONTEXT.md yet"). This research therefore works directly from `ROADMAP.md`'s three Phase 21 success criteria and `REQUIREMENTS.md` VIEW-03/QUAL-01, with no locked user decisions beyond what's already written there.

This phase is small and self-contained: a single new file, `frontend/src/utils/displayName.js`, exporting one pure function and unit tests, with **zero new dependencies, zero component/JSX changes, and zero visual/manual verification** (that's explicitly deferred — glyph rendering is Phase 20/23's job, wiring the render surfaces is Phase 22's job). The entire phase is automatable and CI-gateable.

The single load-bearing design decision is the helper's **return shape**. This codebase already has a directly-analogous precedent one file away: `MemberNode.jsx`'s `formatDate()` returns `null` when there's nothing to show, and every consumer does `{birthday && <Typography>...}`. The recommended `displayName.js` contract follows the same idiom: return `null` when there is no Ge'ez name, or `{ text, lang: 'ti' }` when there is. This makes the "render nothing when absent" rule (VIEW-01) trivially satisfiable with `{geez && <Typography lang={geez.lang}>{geez.text}</Typography>}` — no re-deriving, no sentinel-object unwrapping, and the absence signal (`null`) is provably distinct from `''` in a one-line `toBeNull()` assertion.

The second key decision is the **data source**: the helper should read the already-server-derived `member.geezFullname` field (Phase 18's defensive `VIRTUAL` getter — joins only first+last, excludes mothersname, returns `null` not `''`), not recompute a join from `geezFirstname`/`geezLastname` itself. Recomputing the same join logic in two places (backend VIRTUAL + frontend helper) is exactly the kind of per-surface drift this phase exists to prevent, just moved one level down. The helper's job is narrower than "derive a name" — it's "detect presence + attach the `lang` marker," operating on a value the backend has already computed.

**Primary recommendation:** Export a single named function, e.g. `getGeezDisplay(member)`, from `frontend/src/utils/displayName.js`, that reads `member.geezFullname`, treats `null`/`undefined`/`''`/whitespace-only as absent, and returns either `null` or `{ text: string, lang: 'ti' }`. Hard-code `'ti'` as an exported constant (`GEEZ_LANG`) rather than a parameter — this app serves one Tigrinya/Eritrean family and broader i18n is explicitly out of scope for v3.0. The helper does not touch the Latin name at all; every consumer continues to render `member.fullname` unconditionally, exactly as today.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ge'ez presence detection + `lang` tagging (this phase) | Browser/Client (pure JS utility) | — | Pure function over already-fetched GraphQL data; no network call, no server round-trip, no persistence. |
| `geezFullname` join/defensive-null derivation | API/Backend (Sequelize `VIRTUAL`) | Database/Storage (source columns) | Already implemented in Phase 18 (`FamilyMember.js`); this phase must NOT re-implement it client-side. |
| Latin name selection/rendering (`member.fullname`) | Browser/Client (existing components) | — | Unowned by this phase's helper — VIEW-01 keeps Latin always-primary/always-present; every render surface already does this today and keeps doing it unchanged. |
| Font family resolution for the Ge'ez glyph run | Browser/Client (theme.js `FONT_SANS`/`FONT_DISPLAY`) | — | Already wired in Phase 20 (`"Noto Sans Ethiopic"` ahead of OS fallback); this phase's `lang="ti"` attribute is additive metadata, not a font selector. |
| Stacked layout (Ge'ez below Latin) | Browser/Client (per-surface JSX) | — | Explicitly Phase 22's job — layout/spacing is a per-component concern, not something the helper returns or controls. |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEW-03 | A single shared `displayName` helper drives the Latin/Ge'ez precedence and empty-handling identically across every render surface, and Ge'ez runs are marked with a `lang` attribute (LTR, no `dir` change). | Recommended API contract (`getGeezDisplay` returning `null \| { text, lang: 'ti' }`), source-field choice (`geezFullname`), and the explicit "what the helper does/does not own" boundary below. |
| QUAL-01 (helper half only — full-suite/CI/manual-glyph parts belong to Phase 23) | The shared `displayName` helper is unit-tested, including single-part-filled and all-empty cases. | Test matrix in Validation Architecture section: none / `''` / whitespace-only / single-part-filled / all-filled, each asserting the return value and the `lang` marker, plus an explicit "signal is not `''`" assertion. |

## Standard Stack

No new stack. This phase adds one file and its test, using tooling already present in the repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — plain JS) | — | Pure function, no framework/library dependency | The problem (presence-check + tag a string) does not warrant any dependency; see Don't Hand-Roll below for why even a "just in case" library is unwarranted. |

### Supporting (already installed, used for testing only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.1.10 `[VERIFIED: frontend/package.json]` | Test runner, already the project standard (`frontend/package.json` `test` script) | Unit-testing the helper, colocated `displayName.test.js` |

**Installation:** None required — no `npm install` for this phase.

## Package Legitimacy Audit

**N/A — this phase installs zero external packages.** Per the Package Legitimacy Gate protocol, this section is only required when a phase installs packages; skipped here. No `slopcheck`/registry verification needed.

## Architecture Patterns

### System Architecture Diagram

```
GraphQL query result (member object, already fetched by Phase 22's render surfaces)
        │
        │  member.geezFullname : string | null   (Phase 18 VIRTUAL, Phase 19 API-exposed)
        ▼
┌─────────────────────────────┐
│ getGeezDisplay(member)      │  ← THIS PHASE (frontend/src/utils/displayName.js)
│  - trim/blank-check         │
│  - absent  → null           │
│  - present → { text, lang } │
└─────────────────────────────┘
        │
        ▼
Consumer JSX (Phase 22 — MemberNode.jsx, MemberCard.jsx, AdminMemberTable.jsx, etc.)
  {geez && <Typography lang={geez.lang}>{geez.text}</Typography>}
  (Latin name: member.fullname rendered unconditionally, unchanged, NOT produced by this helper)
```

### Recommended Project Structure
```
frontend/src/
└── utils/                       # NEW directory — does not exist yet
    ├── displayName.js           # single named export(s), pure function
    └── displayName.test.js      # colocated, mirrors photoClient.test.js / familyTree.assembly.test.js
```
`frontend/src/utils/` does not currently exist (confirmed: `ls frontend/src` shows only `context/`, `components/`, `api/`, `assets/`, `pages/`). This phase creates it — first file in a new, generically-named "shared frontend helpers" location.

### Pattern 1: Null-or-payload return (matches existing codebase idiom)
**What:** Return `null` for "nothing to render," or a small payload object when there is something.
**When to use:** Whenever a helper produces optional, conditionally-rendered UI content.
**Example (existing precedent in this exact file family):**
```javascript
// Source: frontend/src/components/family/MemberNode.jsx:24-29 (existing code, not written by this phase)
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}
// consumer: {birthday && <Typography sx={ROW_SX} noWrap>{birthday}</Typography>}
```
**Recommended `displayName.js` (this phase), following the same idiom but returning an object instead of a bare string (because two properties — text and lang — must travel together):**
```javascript
// frontend/src/utils/displayName.js
export const GEEZ_LANG = 'ti';

/**
 * Derives the Ge'ez display name for a family member, or null if absent.
 * Reads the server-derived geezFullname (Phase 18/19) — does not recompute
 * a join from geezFirstname/geezLastname (avoids duplicating that logic).
 * @param {{ geezFullname?: string | null }} member
 * @returns {{ text: string, lang: string } | null}
 */
export function getGeezDisplay(member) {
  const text = member?.geezFullname?.trim();
  if (!text) return null;
  return { text, lang: GEEZ_LANG };
}
```
**Illustrative Phase 22 consumer (not built in this phase — shown only to prove the contract is sufficient):**
```jsx
import { getGeezDisplay } from '../../utils/displayName.js';
// ...
const geez = getGeezDisplay(member);
// ...
<Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{member.fullname}</Typography>
{geez && (
  <Typography sx={ROW_SX} noWrap lang={geez.lang}>
    {geez.text}
  </Typography>
)}
```

### Anti-Patterns to Avoid
- **Recomputing the Ge'ez join client-side** (`[member.geezFirstname, member.geezLastname].filter(Boolean).join(' ')` inside the helper): duplicates Phase 18's `FamilyMember.js` `geezFullname` VIRTUAL logic in a second place. If the backend join rule ever changes (e.g., mothersname inclusion is reconsidered), only one of the two implementations gets updated — the exact drift bug this phase is chartered to prevent, just relocated.
- **A discriminated-union return shape** (`{ hasGeez: false }` vs `{ hasGeez: true, text, lang }`): works, but is more verbose at every call site (`geez.hasGeez ? ... : null` instead of `geez && ...`) for no benefit over `null`-or-object, and has no precedent elsewhere in this codebase.
- **Returning a bare string or `null`, with `lang` documented separately / hard-coded in each consumer**: fails SC2 in practice — every consumer would need to independently remember to write `lang="ti"`, which is precisely the "per-component drift" this phase exists to eliminate. The `lang` value must travel with the text, not live in a comment.
- **`dir="rtl"` on the Ge'ez run**: Ge'ez/Ethiopic script is LTR `[CITED: en.wikipedia.org/wiki/Tigrinya_language]`; ROADMAP SC2 explicitly says "no dir/bidi change" — do not add a `dir` attribute anywhere in the helper or its consumers.
- **Defaulting to `lang="am"` (Amharic)**: Amharic and Tigrinya share the Ethiopic script but are different ISO 639-1 codes (`am` vs `ti`); STATE.md/PROJECT.md identify this family as Tigrinya/Eritrean, so `ti` is correct — `am` is a plausible copy-paste mistake because Amharic is the more commonly seen example language for the Ethiopic script in generic documentation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| (none identified) | — | — | This helper is a ~10-line presence-check + tag-attach function with no complex edge cases (no locale-aware string comparison, no pluralization, no bidi algorithm needed — Ge'ez is LTR). Introducing a generic i18n/display-name library (e.g., `Intl.DisplayNames`, `i18next`) would be over-engineering for one derived field and contradicts the "no dependency" YAGNI signal from `ROADMAP.md`'s Phase 21 scope (no packages listed, no font/i18n work — that's Phases 20/23). |

**Key insight:** The risk in this phase is not "reinventing a hard algorithm" — it's "reinventing the *same simple rule* five times across five components with five slightly different empty-checks." The fix is centralization, not a library.

## Common Pitfalls

### Pitfall 1: Re-deriving the join instead of reading `geezFullname`
**What goes wrong:** The helper is written to accept `geezFirstname`/`geezLastname`/`geezMothersname` and re-implement `filter(Boolean).join(' ')`, duplicating Phase 18's `FamilyMember.js` logic.
**Why it happens:** ROADMAP SC1's wording — "derives the Ge'ez name ... from a member object" — is ambiguous between "the raw parts" and "the already-derived field." Reading only the ROADMAP line without cross-referencing `18-01-SUMMARY.md` (D-01/D-02) makes recomputation look like the obvious interpretation.
**How to avoid:** Read `member.geezFullname` only. The "member object" in SC1 is satisfied by any object carrying that one field — the test fixtures don't need `geezFirstname`/`geezLastname` at all.
**Warning signs:** The helper's implementation imports/references `geezFirstname` or `geezLastname`, or the test file constructs fixtures with those two fields instead of directly setting `geezFullname`.

### Pitfall 2: Treating `''` from the API as "present"
**What goes wrong:** `OPTIONAL_FAMILY_MEMBER_FIELDS` (Phase 19) is designed so clearing a Ge'ez field persists `null`, not `''` — but that's a write-path guarantee, not a type-system guarantee on read. If the helper only checks `!== null`, a stray `''` (from a future code path, a different mutation, or a manual DB edit) would render an empty-but-present Ge'ez row.
**Why it happens:** JS's optional-chaining `member?.geezFullname` alone doesn't distinguish `null`/`undefined`/`''`.
**How to avoid:** Use a truthiness/trim check (`.trim()` then falsy-check), not a strict `!== null` check, so `''` and whitespace-only strings are both treated as absent — same defensive posture as Phase 18's own `|| null` in the backend getter.
**Warning signs:** Test suite has no case asserting `geezFullname: ''` → `null`.

### Pitfall 3: `lang` attribute placed on a wrapper, not the text node
**What goes wrong:** A consumer wraps the Ge'ez `Typography` in a `Box` and puts `lang="ti"` on the `Box` instead of the element actually containing the text.
**Why it happens:** Convenience — the wrapping element is what's already in scope in some layouts.
**How to avoid:** This is technically a Phase 22 concern (no JSX in Phase 21), but the helper's return contract should make correct usage the path of least resistance: returning `{ text, lang }` as a pair, documented in a JSDoc example showing `<Typography lang={geez.lang}>{geez.text}</Typography>`, nudges consumers toward attaching `lang` directly to the text-bearing element.
**Warning signs:** N/A for this phase; flag for Phase 22 code review.

### Pitfall 4: Forgetting the field isn't in the query yet
**What goes wrong:** Someone tries to manually verify the helper against real `/family` data and finds `member.geezFullname` is always `undefined`, concluding the helper is broken.
**Why it happens:** `FAMILY_TREE_QUERY` / `EDITABLE_MEMBER_FIELDS` / `FAMILY_MEMBERS_QUERY` do not yet select `geezFullname` — adding those selections is explicitly Phase 22 SC4's job, not this phase's.
**How to avoid:** This phase's tests use plain JS fixture objects (`{ geezFullname: '...' }`), not a live query — there is nothing to wire against real data yet. Document this boundary clearly so it isn't mistaken for a bug.
**Warning signs:** A verification step in this phase's plan tries to hit `/family` in a browser — that's out of scope; Phase 21 is unit-test-only.

## Code Examples

### Full recommended implementation
```javascript
// Source: this research's synthesis of MemberNode.jsx's existing null-or-value
// idiom (frontend/src/components/family/MemberNode.jsx:24-29) + Phase 18's
// defensive geezFullname VIRTUAL (backend/src/models/FamilyMember.js:75-79)
export const GEEZ_LANG = 'ti';

export function getGeezDisplay(member) {
  const text = member?.geezFullname?.trim();
  if (!text) return null;
  return { text, lang: GEEZ_LANG };
}
```

### Full recommended test file
```javascript
// Source: pattern from frontend/src/api/photoClient.test.js (plain describe/it/expect,
// no React render) and frontend/src/components/family/familyTree.assembly.test.js
// (pure-function fixture style)
import { describe, it, expect } from 'vitest';
import { getGeezDisplay, GEEZ_LANG } from './displayName.js';

describe('getGeezDisplay', () => {
  it('returns null when geezFullname is null (none case)', () => {
    expect(getGeezDisplay({ geezFullname: null })).toBeNull();
  });

  it('returns null when geezFullname is undefined (field omitted from selection)', () => {
    expect(getGeezDisplay({})).toBeNull();
  });

  it('returns null when geezFullname is an empty string (defensive, not just null-check)', () => {
    const result = getGeezDisplay({ geezFullname: '' });
    expect(result).toBeNull();
    // Explicitly prove the absent signal is not the empty string itself (SC3):
    expect(result).not.toBe('');
  });

  it('returns null when geezFullname is whitespace-only', () => {
    expect(getGeezDisplay({ geezFullname: '   ' })).toBeNull();
  });

  it('returns { text, lang } when a single Ge\'ez part is present (partial case)', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ' });
    expect(result).toEqual({ text: 'ጃነ', lang: 'ti' });
  });

  it('returns { text, lang } when both Ge\'ez parts are present (all-filled case)', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ ዶ' });
    expect(result).toEqual({ text: 'ጃነ ዶ', lang: 'ti' });
  });

  it('always tags the lang as the exported GEEZ_LANG constant, not a hard-coded literal', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ ዶ' });
    expect(result.lang).toBe(GEEZ_LANG);
  });
});
```

## State of the Art

Not applicable — this is a new, first-of-its-kind file in this codebase (no prior `displayName`/i18n helper existed to supersede). No deprecated approach to document.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exported function should be named `getGeezDisplay` (not literally `displayName`) — the ROADMAP's "displayName helper" phrase describes the module/file's purpose colloquially, not a mandated export identifier. `displayName` as a bare export is also easily confused with React's `Component.displayName` static (devtools naming), which is an unrelated concept. | Architecture Patterns, Code Examples | Low — a naming choice only; the planner/discuss-phase can rename before or during planning with zero logic impact. Flagging here so it isn't silently locked in as if it were a requirement. |
| A2 | `ti` (not `am` or `und-Ethi`) is the correct BCP-47 subtag, based on WebSearch cross-referenced with Wikipedia's Tigrinya language article, not an authoritative IETF registry lookup in this session. | Common Pitfalls (Pitfall on `am` mixup), Code Examples | Low-Medium — if wrong, it's a one-line constant change (`GEEZ_LANG`) with no structural rework; screen-reader/font-matching behavior would be marginally less correct until fixed. |
| A3 | The helper should read `member.geezFullname` rather than raw `geezFirstname`/`geezLastname`/`geezMothersname` parts — this is a design recommendation, not something ROADMAP.md states explicitly (its SC1 wording is ambiguous, see Pitfall 1). | Summary, Architecture Patterns, Pitfall 1 | Medium — if the planner instead wants the raw-parts approach (e.g., to avoid any dependency on Phase 18/19's exact getter behavior), the test fixtures and function signature would need to change, but the return-shape contract (null-or-`{text,lang}`) is unaffected either way. |

## Open Questions

1. **Should `getGeezDisplay` (or whatever it's named) validate/guard against a member object with a `geezFullname` that is not a string (e.g., accidentally a number or object)?**
   - What we know: GraphQL's schema types `geezFullname` as nullable `String`, so a well-formed API response can only ever produce `string | null`.
   - What's unclear: whether any test fixture or future caller might pass a malformed object (e.g., from a stale cache or a mocking mistake in a test).
   - Recommendation: skip explicit type-guarding — `?.trim()` on a non-string would throw, which is an acceptable fail-fast signal for a contract violation; adding runtime type-checking for an internal-only utility is not warranted at this scope.

2. **Does this phase's plan need any file beyond `displayName.js` + `displayName.test.js`?**
   - What we know: ROADMAP SC1 only names `frontend/src/utils/displayName.js`; no other file is mentioned across Phase 21's three success criteria.
   - What's unclear: whether the planner wants an `index.js` barrel in the new `utils/` directory (matching the backend's aggregator pattern) even though there's only one file in it.
   - Recommendation: no barrel — the backend aggregator pattern (`schemas/index.js`, `resolvers/index.js`, `models/index.js`) exists because Apollo/Sequelize need arrays/merged objects; there's no analogous mechanical need on the frontend, and `frontend/src` doesn't use barrels anywhere today (per CLAUDE.md Module Design: "Not used on the frontend").

## Environment Availability

Skipped — this phase has no external dependencies (no new packages, no service, no CLI tool, no database). It is a pure-JS unit-testable utility using tooling already installed (`vitest`, already in `frontend/package.json` devDependencies).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 `[VERIFIED: frontend/package.json]`, jsdom environment (`frontend/vitest.config.js`) |
| Config file | `frontend/vitest.config.js` |
| Quick run command | `npm test --workspace frontend -- displayName` |
| Full suite command | `npm test --workspaces` (root) or `npm test --workspace frontend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEW-03 | Ge'ez absent (`null`/`undefined`/`''`/whitespace) → helper returns `null` | unit | `npm test --workspace frontend -- displayName` | ❌ Wave 0 |
| VIEW-03 | Ge'ez present (single-part, all-filled) → helper returns `{ text, lang: 'ti' }` | unit | `npm test --workspace frontend -- displayName` | ❌ Wave 0 |
| VIEW-03 (SC2) | `lang` marker is always `'ti'` (exported `GEEZ_LANG` constant, not re-typed per call) | unit | `npm test --workspace frontend -- displayName` | ❌ Wave 0 |
| VIEW-03 (SC3) | Absent-signal (`null`) is provably distinct from `''` | unit | `npm test --workspace frontend -- displayName` (explicit `.not.toBe('')` assertion) | ❌ Wave 0 |
| QUAL-01 (helper half) | none/single-part/all-filled matrix unit-tested | unit | `npm test --workspace frontend -- displayName` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test --workspace frontend -- displayName`
- **Per wave merge:** `npm test --workspace frontend`
- **Phase gate:** Full suite green (`npm test --workspaces` at repo root) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/utils/displayName.js` — new file, does not exist yet
- [ ] `frontend/src/utils/displayName.test.js` — new file, does not exist yet
- [ ] `frontend/src/utils/` directory itself does not exist yet — first file in it
- No framework install needed — Vitest/jsdom already configured project-wide.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` (absent = enabled), so this section is included per protocol — but this phase has essentially no attack surface: it is a pure function operating on already-fetched, already-authorized GraphQL response data (no new network call, no new input parsing boundary, no persistence, no auth/session logic).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not touched — helper has no auth surface. |
| V3 Session Management | No | Not touched. |
| V4 Access Control | No | Not touched — data has already passed through Phase 14's permission-scoped resolvers before reaching this helper. |
| V5 Input Validation | Marginal | The helper's only "input validation" is the presence/blank check itself (Pitfall 2). No sanitization is needed for output because React/JSX auto-escapes text content by default (no `dangerouslySetInnerHTML` anywhere near this helper's consumers) — XSS via a stored Ge'ez name is already mitigated by React's default text-node escaping, unchanged by this phase. |
| V6 Cryptography | No | Not touched. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via a malicious `geezFirstname`/`geezLastname` value (e.g., containing `<script>`) surfacing through `geezFullname` | Tampering / Information Disclosure | Already mitigated by React's default JSX text-node escaping (no `dangerouslySetInnerHTML` used anywhere in `MemberNode.jsx`/`MemberDetailPanel.jsx`/manage components) — this phase's helper returns a plain string that will be rendered the same auto-escaped way `member.fullname` already is today. No new mitigation needed in this phase; note for Phase 22/23 code review to confirm no consumer introduces `dangerouslySetInnerHTML` for the Ge'ez run. |

## Notes on files read that are out of scope for this phase (flag for planner)

`MemberDetailPanel.jsx` was listed in this research's input as "another fullname render surface," but `REQUIREMENTS.md`'s own scope decisions state: *"Surfaces: `/family` tree cards and `/manage` ... Detail panel / dashboard are **out**."* `MemberDetailPanel.jsx:84` (`{member.fullname}`) and `:43` (`{relatedMember.fullname}`) render Latin names only and are **not** a Phase 22 target per the confirmed v3.0 scope — the planner should not schedule this file for Ge'ez wiring. This doesn't affect Phase 21 itself (no JSX changes here either way), but is worth flagging now so Phase 22 planning doesn't accidentally scope-creep into an explicitly excluded surface.

Confirmed actual Phase 22 targets (files containing `.fullname` today, per `grep -rln "\.fullname" frontend/src`): `MemberNode.jsx`, `FamilyTreeCanvas.jsx` (search-match logic, not a display row), `MemberCard.jsx`, `AddRelativeDialog.jsx`, `AdminMemberTable.jsx`, `MemberAvatarImage.jsx` (likely just an `alt`/`aria-label` use), `LinkAccountsPage.jsx`, `ManagePage.jsx` — these are Phase 22/23 concerns, listed here only as forward-looking context confirming the helper's contract (`null | {text, lang}`) is generic enough to serve all of them identically.

## Sources

### Primary (HIGH confidence)
- `frontend/src/components/family/MemberNode.jsx` — existing null-or-value idiom (`formatDate`), existing render structure/lines cited (24-29, 65, 190-203).
- `frontend/src/components/family/MemberDetailPanel.jsx` — existing render surface, confirmed OUT of v3.0 scope per `REQUIREMENTS.md`.
- `backend/src/models/FamilyMember.js` (lines 63-82) — exact `geezFullname` VIRTUAL implementation (D-01/D-02 from Phase 18).
- `.planning/phases/18-data-model-migration/18-01-SUMMARY.md` — confirms `geezFullname` joins only first+last (excludes mothersname), returns `null` not `''`.
- `.planning/phases/19-graphql-layer/19-01-SUMMARY.md` — confirms `geezFullname` is exposed read-only on the GraphQL type, and `OPTIONAL_FAMILY_MEMBER_FIELDS` guarantees blank-to-`null` persistence on the writable Ge'ez fields.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — phase scope, success criteria, drift rationale.
- `frontend/src/api/photoClient.test.js`, `frontend/src/components/family/familyTree.assembly.test.js` — confirmed Vitest pure-function test pattern (`describe`/`it`/`expect`, no React render, colocated `.test.js`).
- `frontend/package.json`, `frontend/vitest.config.js`, root `package.json` — confirmed test tooling/commands.

### Secondary (MEDIUM confidence)
- `[CITED: en.wikipedia.org/wiki/Tigrinya_language]` — Tigrinya's ISO 639-1 code is `ti`; Amharic's is `am`; both use the Ge'ez/Ethiopic script; script is LTR.
- WebSearch cross-reference (BCP-47 subtag registry summaries, IETF language tag Wikipedia article) — corroborates `ti` vs `am` distinction.

### Tertiary (LOW confidence)
- None — no unverified single-source claims remain in this research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack; existing Vitest tooling directly inspected.
- Architecture: HIGH — return-shape recommendation is grounded in a direct, in-repo precedent (`formatDate` in the same component family), not merely a generic best practice.
- Pitfalls: HIGH — each pitfall is grounded in a specific artifact already in this repo (Phase 18/19 summaries, `OPTIONAL_FAMILY_MEMBER_FIELDS` behavior), not speculative.
- `lang="ti"` correctness: MEDIUM — verified via WebSearch + Wikipedia cross-reference, not an authoritative IANA/IETF registry lookup in this session (see Assumption A2).

**Research date:** 2026-07-30
**Valid until:** No expiry risk — this research concerns a stable, internal design decision (function contract), not a fast-moving external API/library version. Safe to treat as valid for the remainder of the v3.0 milestone (Phases 21-23).
