---
phase: quick-260801-fsa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/package.json
  - frontend/src/main.jsx
  - frontend/src/theme.js
  - frontend/src/theme.test.js
  - frontend/src/components/family/MemberNode.jsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "The Ge'ez webfont loaded by the app is SIL Abyssinica SIL, not Noto Sans Ethiopic"
    - "The theme's FONT_SANS and FONT_DISPLAY stacks reference Abyssinica SIL in the same fallback position Noto Sans Ethiopic occupied"
    - "On the /family tree card, the Ge'ez name row and the mother's-name row are tinted with the member's gender color; all other rows are unchanged"
  artifacts:
    - path: "frontend/src/main.jsx"
      provides: "Abyssinica SIL 400/700 CSS imports (Noto Sans Ethiopic imports removed)"
    - path: "frontend/src/theme.js"
      provides: "FONT_SANS / FONT_DISPLAY stacks with Abyssinica SIL"
    - path: "frontend/src/theme.test.js"
      provides: "Assertions updated to Abyssinica SIL"
    - path: "frontend/src/components/family/MemberNode.jsx"
      provides: "geez.text and motherName rows colored with genderTint"
    - path: "frontend/package.json"
      provides: "@fontsource/abyssinica-sil dependency (noto-sans-ethiopic removed)"
  key_links:
    - from: "frontend/src/main.jsx"
      to: "@fontsource/abyssinica-sil"
      via: "static CSS import"
      pattern: "@fontsource/abyssinica-sil/(400|700)\\.css"
    - from: "frontend/src/components/family/MemberNode.jsx"
      to: "genderTint"
      via: "sx color override on geez.text and motherName Typography rows"
      pattern: "color:\\s*genderTint"
---

<objective>
Two small, independent frontend visual follow-ups from the v3.0 milestone, each committed atomically:

1. Swap the self-hosted Ge'ez webfont from `@fontsource/noto-sans-ethiopic` to `@fontsource/abyssinica-sil` (a font with broader/more accurate native Ge'ez glyph design) everywhere it's referenced: the webfont CSS imports, the theme's font stacks, and the theme's regression test.
2. On the `/family` tree card (`MemberNode.jsx`), color the Ge'ez name row and the mother's-name row with the member's existing per-card `genderTint`, matching the card's border/background gender cue instead of the default muted slate text.

Purpose: keep visual polish moving on a feature-complete v3.0 app without opening a new milestone/phase for tiny, unambiguous UI tweaks.
Output: two atomic commits — one font swap, one MemberNode color change — both frontend-only, no backend/API/runtime-behavior changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@frontend/src/main.jsx
@frontend/src/theme.js
@frontend/src/theme.test.js
@frontend/src/components/family/MemberNode.jsx
@frontend/package.json

<interfaces>
<!-- Current state, extracted directly from the files above — no further exploration needed. -->

frontend/src/main.jsx (lines 7-8, the two imports to replace):
```
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
```

frontend/src/theme.js (lines 32-33, the two stacks to edit — keep "Noto Sans Ethiopic"'s exact position, just rename it to "Abyssinica SIL"):
```
const FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, sans-serif';
```

frontend/src/theme.test.js: two `it()` blocks assert `stack.indexOf('Noto Sans Ethiopic')` is present, after the Latin font (`Inter`/`Sora`), and before `system-ui`. Update both string literals to `'Abyssinica SIL'`; keep the position assertions (`toBeGreaterThan`/`toBeLessThan`) unchanged.

frontend/package.json: dependency `"@fontsource/noto-sans-ethiopic": "^5.3.0"` at line 20 — remove after adding the replacement (npm install handles both add and lockfile update; remove the stale line from package.json if `npm install` doesn't already prune it).

frontend/src/components/family/MemberNode.jsx — relevant excerpts:
- Line 52: `const ROW_SX = { fontSize: 12, fontWeight: 400, color: colors.slate };` — this is what the Ge'ez row and mother-name row currently inherit and must override.
- Line 69: `const { label: genderLabel, tint: genderTint } = genderMeta(member.gender);` — `genderTint` is already computed and in scope (also used for the card's `border`/`bgcolor` at lines 85-86).
- Lines 202-206 (Ge'ez row):
```
{geez && (
  <Typography sx={ROW_SX} lang={geez.lang} noWrap>
    {geez.text}
  </Typography>
)}
```
- Lines 214-218 (mother's-name row):
```
{motherName && (
  <Typography sx={ROW_SX} noWrap>
    {motherName}
  </Typography>
)}
```
- Lines 208-212 (birthday row — leave untouched) and lines 220-224 (address row — leave untouched) both also use bare `sx={ROW_SX}` and must NOT change.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Switch Ge'ez webfont from Noto Sans Ethiopic to Abyssinica SIL</name>
  <files>frontend/package.json, frontend/src/main.jsx, frontend/src/theme.js, frontend/src/theme.test.js</files>
  <action>
Run `npm i @fontsource/abyssinica-sil@5.3.0 --workspace frontend` to add the new dependency (confirmed present on npm at 5.3.0). Then run `npm uninstall @fontsource/noto-sans-ethiopic --workspace frontend` to remove the old one and prune it from frontend/package.json and the root lockfile.

In frontend/src/main.jsx, replace the two `@fontsource/noto-sans-ethiopic/ethiopic-400.css` / `ethiopic-700.css` imports with `@fontsource/abyssinica-sil/400.css` and `@fontsource/abyssinica-sil/700.css` (Abyssinica SIL ships weight-named CSS files, not an "ethiopic" subset — this is the correct import path for the fontsource package, verify the exact file names exist under `frontend/node_modules/@fontsource/abyssinica-sil/` after install and adjust only the filename if the package structure differs).

In frontend/src/theme.js, replace the literal string `"Noto Sans Ethiopic"` with `"Abyssinica SIL"` in both `FONT_SANS` (line 32) and `FONT_DISPLAY` (line 33), keeping the exact same position in each stack (after the Latin font, before the OS/generic fallback chain).

In frontend/src/theme.test.js, update both `it()` blocks' string literals from `'Noto Sans Ethiopic'` to `'Abyssinica SIL'`. Do not change the test structure, describe block, or the `toBeGreaterThan`/`toBeLessThan` position assertions — only the font name being searched for.

Note for the SUMMARY: Abyssinica SIL ships as a full font file (no Ethiopic-only subset like the old `ethiopic-400/700.css`), so the frontend bundle's font payload grows. Real glyph rendering — specifically Tigrinya labialized consonant forms (ቨ, ቐ) — cannot be asserted by jsdom/Vitest; flag this as a manual visual follow-up check in the SUMMARY, same category as the Phase 22 deferred visual sign-off noted in STATE.md.
  </action>
  <verify>
    <automated>npm test --workspace frontend</automated>
  </verify>
  <done>@fontsource/abyssinica-sil is a frontend dependency, @fontsource/noto-sans-ethiopic is removed from frontend/package.json, main.jsx imports Abyssinica SIL 400/700 CSS, theme.js's two font stacks reference "Abyssinica SIL" in the same position "Noto Sans Ethiopic" held, theme.test.js asserts against "Abyssinica SIL", and `npm test --workspace frontend` passes with no failing tests.</done>
</task>

<task type="auto">
  <name>Task 2: Gender-color the Ge'ez name row and mother's-name row on the /family tree card</name>
  <files>frontend/src/components/family/MemberNode.jsx</files>
  <action>
In frontend/src/components/family/MemberNode.jsx, change ONLY the two Typography rows for the Ge'ez name (currently `sx={ROW_SX}` around line 203) and the mother's name (currently `sx={ROW_SX}` around line 215) to override `color` with the already-in-scope `genderTint` variable (computed at line 69 from `genderMeta(member.gender)` — male `#3b82f6`, female `#ec4899`, other `colors.slate`, the same value driving the card's border/background tint).

Use `sx={{ ...ROW_SX, color: genderTint }}` for both rows so they keep `ROW_SX`'s `fontSize`/`fontWeight` but override the `color: colors.slate` default.

Do NOT touch: the fullname row (line 198-200, stays `sx={{ fontSize: 14, fontWeight: 600 }}`, no color change requested), the birthday row (lines 208-212, stays bare `sx={ROW_SX}`), the address row (lines 220-224, stays bare `sx={ROW_SX}`), the reserved "Head" tag row, or any styling in the card's `Paper`/avatar column. Do NOT touch `/manage` or any other component — this is a `/family` tree-card-only change. Do not introduce a new shared style constant or theme token; keep `genderTint` used inline exactly as it already is for the border/background.
  </action>
  <verify>
    <automated>npm test --workspace frontend -- MemberNode</automated>
  </verify>
  <done>The Ge'ez name Typography and the mother's-name Typography in MemberNode.jsx both render with `color: genderTint` via `sx={{ ...ROW_SX, color: genderTint }}`; the fullname, birthday, and address rows are byte-for-byte unchanged; `npm test --workspace frontend` (full suite, including MemberNode.test.jsx's data-gender/accessible-name assertions) passes with no failures.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

None — both tasks are client-side visual/styling changes with no new trust boundary, no new input parsing, and no change to data flow, auth, or API surface.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick260801-SC | Tampering | `@fontsource/abyssinica-sil` npm install | accept | Package pre-verified present on npmjs.com at version 5.3.0 by the orchestrator before this plan was written (see `npm view @fontsource/abyssinica-sil versions` output showing 5.3.0 as latest); it is a `@fontsource` scoped package from the same trusted publisher/org already used for `@fontsource/noto-sans-ethiopic` in this codebase, so no additional blocking human-verify checkpoint is warranted. |
</threat_model>

<verification>
- `npm test --workspace frontend` passes in full (all pre-existing + updated tests green) after both tasks.
- `grep -rn "Noto Sans Ethiopic\|noto-sans-ethiopic" frontend/src frontend/package.json` returns no matches after Task 1.
- Visual: manual check deferred to SUMMARY — Abyssinica SIL glyph coverage for Tigrinya labialized forms and the two newly-tinted `/family` card rows are not verifiable by jsdom and require a human `/family` page look.
</verification>

<success_criteria>
- Two atomic commits exist: one for the font swap (Task 1), one for the MemberNode color change (Task 2).
- `npm test --workspace frontend` is green after each commit.
- No backend files, no other frontend components, and no application runtime behavior (routes, data, auth) are touched.
</success_criteria>

<output>
Create `.planning/quick/260801-fsa-switch-geez-font-to-abyssinica-sil-and-g/260801-fsa-SUMMARY.md` when done, noting the two commits and the deferred manual visual/glyph-coverage follow-up.
</output>
