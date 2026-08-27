# Phase 29: Accessibility, Responsive & Quality Gate - Research

**Researched:** 2026-08-05
**Domain:** Frontend accessibility testing (axe-core/jest-axe under Vitest+jsdom+RTL), deterministic WCAG contrast math, responsive-breakpoint verification, backend cross-engine (MySQL/MariaDB) conditional test skipping in Vitest 4.
**Confidence:** HIGH

## Summary

This is an audit + gap-closure + gate phase, not greenfield work. `/detail`'s four surfaces (`PersonCard.jsx`, `GenerationGrid.jsx`, `PersonSearch.jsx`, `DetailPage.jsx`) already carry a real a11y baseline from Phases 25-28: `aria-label`s on every `IconButton`, a `data-gender`/ring-style non-color cue, MUI's native `Menu`/`Autocomplete` (both already keyboard-accessible by construction), and a responsive `Grid` (`size={{ xs: 12, sm: 6, md: 4 }}`) that is confirmed (via direct `node_modules` inspection) to compile to real `@media (min-width:600px)` / `@media (min-width:900px)` rules using MUI's default breakpoints (verified in `@mui/system/createBreakpoints/createBreakpoints.js`). The work in this phase is to (1) make the milestone-close gate genuinely green via a scoped, honest MariaDB-vs-MySQL engine skip on exactly two backend tests, (2) add `jest-axe` as a code-enforced regression tool (previously absent — grepped, zero hits), (3) add a deterministic contrast unit test against the real theme tokens — which this research already ran and found **two confirmed WCAG AA failures and one confirmed source-level fact that materially changes the failure risk** — and (4) extend the project's existing `HUMAN-UAT.md` pattern (Phases 26/27) to close the mobile-viewport check, backed by a jsdom-feasible breakpoint-CSS-presence assertion.

**Primary recommendation:** Use `context.skip(condition, reason)` (Vitest ≥3.1, confirmed present in the installed 4.1.10 types) for D-01, not `it.skipIf`/`describe.skipIf` — it needs no top-level `await` and is a one-line, per-test addition. Use `jest-axe` (not the Vitest-native fork `vitest-axe`) per CONTEXT.md's explicit direction — it works under Vitest because Vitest's `expect.extend` is Jest-API-compatible and jest-axe has no Jest-runtime dependency, only Jest-flavored diff formatting. Use a hand-rolled or `wcag-contrast`-based relative-luminance function against the literal hex strings already in `theme.js`/`genderTheme.js` — **the Ge'ez name text (both `#3b82f6` male and `#ec4899` female tints) and the "Living"/"Deceased" status `Chip` text (`#10b981` at full opacity, confirmed from MUI `Chip.js` source) are real, confirmed-at-risk pairs that will need either a token change or a documented exception.**

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keyboard operability / focus order (SC-1) | Browser / Client (React component markup) | — | Pure DOM/ARIA structure in `PersonCard.jsx`/`PersonSearch.jsx`; no server involvement |
| axe-core violation scanning (D-02) | Frontend test tooling (jsdom) | — | Runs against RTL-rendered DOM in the Vitest process, never a real browser |
| Contrast ratio computation (SC-2/D-03) | Frontend test tooling (pure JS math over theme tokens) | — | jsdom cannot render/compute real contrast; must be computed from the same hex source `theme.js` exports to the UI |
| Mobile responsive layout (SC-3/D-04) | Browser / Client (real rendering) + Frontend test tooling (CSS-text presence only) | Human-UAT | jsdom has no layout engine; automated leg can only prove the responsive CSS rules exist, not that they visually work — human confirms the rest |
| Milestone green gate (SC-4/D-01) | Backend test infra (Vitest + raw MySQL/MariaDB connection) | CI (GitHub Actions, MySQL 8.4 service) | Engine detection and the concurrency assertions themselves are backend-only; CI coverage is unaffected |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 (engine-guard skip for the two MariaDB-only concurrency tests):** The v4.0 close gate is a genuinely green `npm test --workspaces` (exit 0) on **both** the developer's local engine and CI. The two long-standing failures — `verifyEmail.test.js` VERIFY-04 (admin-slot lock-contention) and `familyMember.dedup.test.js` REL-06 (D-10 resolver-path TOCTOU) — are **MariaDB-only**: they pass on CI's MySQL 8.4 (where the `FOR UPDATE` locking semantics they assert hold) and fail only on the local MariaDB 12.1 dev DB, which surfaces a Sequelize optimistic-version `"Record has changed since last read"` error instead. They also fail on `main` locally — not a Phase 28/29 regression, not a product defect. **Decision:** gate exactly these two tests to **skip when the running engine is MariaDB**, so the suite exits 0 on both engines while still running (and passing) on CI's MySQL 8.4.
- **Engine detection:** auto-detect at test setup via `SELECT VERSION()` (MariaDB reports a version string containing `MariaDB`) — no manual env toggle. Prefer a shared helper the two tests import so detection lives in one place.
- **Documented skip:** each skip must carry an inline reason referencing that the assertion requires MySQL 8.4 `SELECT … FOR UPDATE` lock-wait semantics and that MariaDB's differing optimistic-version behavior makes the assertion inapplicable there. This is a *visible, documented* skip — NOT a silent `.skip`, NOT masking a product bug.
- **CI coverage unchanged:** on MySQL (CI) both tests still execute and MUST pass. The gate must not weaken CI's concurrency coverage.
- **Scope discipline:** do NOT rewrite the resolvers or make the tests engine-portable (that was the explicitly-rejected heavier option) — this phase is a11y-focused; the engine guard is the agreed minimal, honest fix that removes the recurring local red-noise every prior phase hit (23/24/27/28 all closed around this exact carve-out).
- Also refresh `KNOWN-ISSUES.md` (currently silent on this) with the MariaDB-vs-MySQL caveat so the skip is discoverable.

### Claude's Discretion (other three areas — user delegated; planner/researcher may refine, flagged for override)

- **D-02 (a11y test tooling — enforce in the suite, don't rely on manual audit):** Consistent with this project's core value ("fail loudly in CI"), keyboard/label/focus correctness (SC-1) should be a **code-enforced** regression, not a one-time manual audit. Direction: add `jest-axe` (axe-core) as a frontend dev dependency and assert **zero role/name/label violations** on the `/detail` surfaces, plus targeted RTL `userEvent.tab()` focus-order / visible-focus assertions on the expand/collapse controls and the search Autocomplete. Researcher to confirm `jest-axe` + Vitest + jsdom integration and version pin.
- **D-03 (contrast verified deterministically, SC-2):** jsdom/axe cannot compute real rendered contrast, and the theme colors are known hex tokens (`frontend/src/theme.js`). Direction: compute WCAG AA contrast **ratios** for `/detail`'s text-on-background pairs from the theme tokens and assert them (≥4.5:1 normal text, ≥3:1 large text) in a unit test — making contrast a code-enforced gate rather than eyeballing. Any failing pair is a real fix in this phase.
- **D-04 (mobile verification, SC-3 — human-UAT at target widths + assert breakpoints):** jsdom can't measure layout, so mobile readability closes via a **HUMAN-UAT item** (precedent: phases 26/27) checked at **360px** (small phone) and **768px** (tablet boundary), backed by RTL/source assertions that the responsive `sx` breakpoints exist where they matter. The ≤3/row→1 grid already exists (Phase 27 D-05) — this verifies, not rebuilds.
- **D-05 (auto-approve on green — no false 100%):** SC-4 is satisfied when frontend is fully green (local + CI) and backend is green in CI (MySQL 8.4) with the two tests engine-gated locally. Do not report "all green" without the D-01 caveat surfaced.

### Audit scope boundary

- **D-06 (audit only `/detail`'s own new surfaces):** The sweep covers `PersonCard.jsx`, `GenerationGrid.jsx`, `PersonSearch.jsx`, and `DetailPage.jsx`. The Edit/Add dialogs reached from `/detail` (`EditMemberDialog.jsx`, `AddRelativeDialog.jsx`) are **existing reused components from earlier phases** and are out of scope for this phase's a11y audit (SC criteria say "`/detail`'s new surfaces"). If the audit incidentally surfaces a dialog-level a11y defect, note it as a deferred follow-up rather than expanding scope.

### Deferred Ideas (OUT OF SCOPE)

- Making the two concurrency tests genuinely engine-portable (adapting resolver/test locking so MariaDB passes too) — explicitly rejected for this phase as backend-concurrency scope creep inside an a11y phase; a valid future backend-hardening task.
- A11y remediation of surfaces beyond `/detail` (Dashboard, `/manage`, `/family`) — separate scope.
- Any dialog-internal a11y defects incidentally found in `EditMemberDialog`/`AddRelativeDialog` — note as follow-up, don't fix here (D-06).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| A11Y-01 | Expand/collapse controls and search suggestions are fully keyboard-operable with accessible labels and visible focus states; text/background contrast meets WCAG AA and the layout stays readable on mobile. | D-01 makes the gate honest; D-02 (`jest-axe` + `userEvent.tab()`) code-enforces keyboard/label/focus; D-03 (deterministic contrast unit test) code-enforces WCAG AA contrast and this research already surfaced two failing pairs to fix; D-04 (HUMAN-UAT + breakpoint-CSS assertion) closes mobile readability. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- ESM throughout (`"type": "module"` in both workspaces) — new test/helper files must use `import`/`export`, no CommonJS `require`.
- Vitest is the single test runner across backend and frontend — no Jest. `jest-axe` is acceptable as a *library* (it has no Jest-runtime dependency; see Standard Stack) but do not introduce a second test runner.
- React Testing Library + jsdom for the frontend (already configured — `frontend/vitest.config.js`, `frontend/test/setup.js`).
- Non-destructive milestone: this phase adds tests, tooling, and (for D-01) a narrowly-scoped conditional-skip guard and a `KNOWN-ISSUES.md` update — it must not change application runtime behavior. **Caveat surfaced by D-03:** if the contrast audit finds a real AA failure (it did — see below), fixing the failing color token IS an in-scope "real fix" per CONTEXT.md D-03's own text ("Any failing pair is a real fix in this phase"), and counts as `/detail`-surface polish, not a runtime-behavior change outside the milestone's stated scope (A11Y-01 explicitly requires WCAG AA contrast).
- CI: GitHub Actions (`.github/workflows/ci.yml`) runs `npm test` (→ `npm test --workspaces`) against a `mysql:8.4` service — this is the canonical "green" environment CI coverage must not regress against.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jest-axe` | `^11.0.0` (latest, published ~1 week before this research; package itself created 2018-02-12, 2.53M weekly downloads) | Zero-violation axe-core assertions against RTL-rendered DOM (`toHaveNoViolations()`) | CONTEXT.md D-02 explicit direction; industry-standard axe-core wrapper; `expect.extend` API is Jest-compatible and Vitest's `expect` implements the same extension contract, so it works without a Jest runtime |
| `wcag-contrast` | `^3.0.0` (package created 2013-09-24, 113K weekly downloads) | `wcag_contrast.hex(fg, bg)` relative-luminance contrast ratio from two hex strings | Tiny (1 dependency: `relative-luminance`), does exactly the WCAG 2.x math CONTEXT.md D-03 asks for, avoids reimplementing sRGB gamma-correction math by hand |

**Version verification:** `npm view jest-axe version` → `11.0.0`; `npm view wcag-contrast version` → `3.0.0`. Both confirmed present on the npm registry and both passed `slopcheck install <pkg> --json`-equivalent verification (`[OK]`, no source-repo/downloads anomalies) during this research session — see Package Legitimacy Audit below. `jest-axe`'s own `dependencies` are `axe-core@4.12.1`, `chalk@4.1.2`, `lodash.merge@4.6.2`, `jest-matcher-utils@30.4.1` — the last one only formats diff output; it does not require an actual Jest test runner to import.

**Already present (no install needed):** `@testing-library/react@16.3.2`, `@testing-library/user-event@14.6.1`, `@testing-library/jest-dom@6.9.1`, `vitest@4.1.10`, `jsdom@26.0.0` — all confirmed from `frontend/package.json` and installed `node_modules`.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `mysql2/promise` | `^3.11.5` (already a backend dependency) | Raw connection for `SELECT VERSION()` engine detection (D-01) | Reuse the exact `rawConnection()`-style pattern already in `backend/src/resolvers/verifyEmail.test.js` — do not add a new DB driver |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jest-axe` | `vitest-axe` (a Vitest-native fork of jest-axe, by `chaance`) | `vitest-axe` avoids the Jest-flavored dependency chain entirely and ships Vitest-first types, but CONTEXT.md D-02 explicitly names `jest-axe`; `jest-axe` is far more widely used/battle-tested (2.5M weekly downloads vs. a niche fork) and its cross-runner compatibility is a well-established community pattern (multiple independent blog posts confirm Vue+Vitest and React+Vitest usage). Recommend sticking with `jest-axe` per the locked direction unless a concrete incompatibility surfaces during implementation. |
| Hand-rolled relative-luminance function | `wcag-contrast` npm package | Hand-rolling is ~15 lines and zero-dependency (no supply-chain surface at all), which some projects prefer for a one-off test utility. `wcag-contrast` is safer against transcription bugs in the gamma-correction formula and is a trivially small, long-established (2013), high-download package. Either is reasonable; this research computed contrast ratios during research using a hand-rolled script (see below) and both approaches produce identical documented WCAG figures — recommend the package for auditability (test failure messages can cite a well-known library name) but either satisfies D-03. |

**Installation:**
```bash
npm install --workspace frontend jest-axe wcag-contrast
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `jest-axe` | npm | 8 yrs (created 2018-02-12) | 2.53M/wk | github.com/NickColley/jest-axe | [OK] | Approved |
| `wcag-contrast` | npm | 13 yrs (created 2013-09-24) | 113K/wk | github.com/tmcw/wcag-contrast | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*Methodology note: `slopcheck install jest-axe wcag-contrast` was run to obtain the `[OK]` verdicts above. The CLI's `install` subcommand performs a real `npm install` as a side effect (it does not support a dry-run/`--json` flag in the installed slopcheck version) — this transiently added both packages to the repo root `package.json`/`package-lock.json` during research. That mutation was reverted (`git checkout -- package.json package-lock.json`) immediately after capturing the `[OK]` results, so the repo is unmodified by this research session. **The planner should re-run the actual install as part of Phase 29 execution** (into `frontend/package.json`, not root) — this audit only confirms legitimacy, it does not leave the packages installed.

## Architecture Patterns

### D-01: MariaDB engine-guard skip

**Closest existing analog to mirror:** `backend/src/resolvers/verifyEmail.test.js`'s own `rawConnection()` helper (lines 28-39) — a `mysql.createConnection({...})` built from `env.database.*`, already imported in that exact file. There is **no pre-existing `SELECT VERSION()` engine-detection helper anywhere in the backend** — CONTEXT.md's reference to `familyMember.queryCount.test.js` using this pattern does not hold up under inspection (that file has a `countQueries()` helper for SQL statement counting, unrelated to engine detection); treat the "shared helper" as **new code this phase must create**, not code to extend.

**Recommended new file:** `backend/test/dbEngine.js` (sibling to the existing `backend/test/helpers.js`, `backend/test/guard.js`) — a single new module exporting an `isMariaDB()` async function, imported by both target test files.

```javascript
// Source: backend/src/resolvers/verifyEmail.test.js's rawConnection() pattern (verified in-repo),
// applied to a version-check instead of a lock-holding connection.
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

// Auto-detected at call time (no manual env toggle, per CONTEXT.md D-01).
// MariaDB's SELECT VERSION() reports a version string containing "MariaDB"
// (e.g. "10.11.6-MariaDB"); MySQL 8.4's does not.
export async function isMariaDB() {
  const conn = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name
  });
  try {
    const [[row]] = await conn.query('SELECT VERSION() AS version');
    return /mariadb/i.test(row.version);
  } finally {
    await conn.end();
  }
}
```

**Skip mechanism — recommend `context.skip(condition, reason)`, not `it.skipIf`/`describe.skipIf`:**

Both are available in the installed Vitest 4.1.10 (`describe.skipIf`/`it.skipIf` confirmed via `@vitest/runner`'s shipped `.d.ts`: `skipIf: (condition: any) => ChainableTestAPI/ChainableSuiteAPI`; `context.skip` confirmed via the same package: `skip(note?: string): never` and `skip(condition: boolean, note?: string): void`, documented on vitest.dev as available **since Vitest 3.1**). The tradeoff:

- `it.skipIf(condition)('name', fn)` needs `condition` to be a **plain boolean at test-collection time** — since `isMariaDB()` is async, this forces either a `beforeAll`/top-level-await dance (ESM top-level await works in this codebase's `"type": "module"` backend, but couples the whole file's collection order to a live DB round-trip before any test runs) or caching the result in `globalSetup.js`.
- `context.skip(condition, reason)` is called **inside** the test body/async function, so the `await isMariaDB()` happens naturally as part of the test's own execution — no collection-time restructuring, minimal diff to the two existing test files, and the `reason` string is a native part of the Vitest skip API (shows in reporter output) rather than something stuffed into the test's `it(...)` title string.

**Recommended pattern (per target test, minimal diff):**

```javascript
// Source: verified from @vitest/runner's shipped types + vitest.dev/guide/test-context.html
import { isMariaDB } from '../../test/dbEngine.js';

it('lets two users racing to verify simultaneously each keep a usable session, with exactly one becoming ADMIN (VERIFY-04)', async (ctx) => {
  ctx.skip(
    await isMariaDB(),
    'MariaDB does not implement the MySQL 8.4 SELECT … FOR UPDATE lock-wait semantics this test asserts ' +
    '(MariaDB raises a Sequelize optimistic-version error instead). Runs and must pass on CI (MySQL 8.4). ' +
    'See KNOWN-ISSUES.md.'
  );

  // ...existing test body, unchanged...
});
```

Apply the identical pattern to `familyMember.dedup.test.js`'s `'(D-10 resolver-path TOCTOU, CR-01) detects a duplicate...'` test (the one CONTEXT.md names as REL-06). **Do not** wrap the whole `describe` block — only the one named test per file needs the skip; the other tests in both files are engine-agnostic and must keep running (and passing) on both engines.

**KNOWN-ISSUES.md update:** the file currently documents one unrelated issue (reset-token exposure). Add a new entry following its existing format (Location / Expected / Actual / Severity / Documented by test), e.g.:

```markdown
## MariaDB-only skip on two concurrency-locking tests

- **Location:** `backend/src/resolvers/verifyEmail.test.js` (VERIFY-04), `backend/src/services/familyMember.dedup.test.js` (REL-06)
- **Expected:** Both tests pass on any supported MySQL-compatible engine.
- **Actual:** Both assert `SELECT ... FOR UPDATE` lock-wait interleaving that holds under MySQL 8.4 (CI's engine) but not under local MariaDB, which surfaces a Sequelize optimistic-version `"Record has changed since last read"` error instead. Both tests auto-detect the engine via `SELECT VERSION()` (`backend/test/dbEngine.js`) and skip themselves, with a visible reason, when running on MariaDB. They still run and pass on CI (MySQL 8.4).
- **Severity:** N/A — not a product defect, a test-infrastructure limitation.
- **Documented by test:** the two tests named above (see their inline skip reason).
```

### D-02: `jest-axe` + Vitest + jsdom wiring

**Setup:** add a single `expect.extend(toHaveNoViolations)` call. Two options, both valid — recommend the setup-file route since `frontend/test/setup.js` already exists and is wired via `frontend/vitest.config.js`'s `setupFiles`:

```javascript
// Source: jest-axe README (github.com/NickColley/jest-axe) — add to frontend/test/setup.js
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);
```

**Per-test usage (new tests in `PersonCard.test.jsx`, `GenerationGrid.test.jsx`, `PersonSearch.test.jsx`, `DetailPage.test.jsx`):**

```javascript
// Source: jest-axe README, adapted to this repo's existing renderCard()/renderGrid() helpers
import { axe } from 'jest-axe';

it('has no axe accessibility violations', async () => {
  const { container } = renderCard({ member: { ...BASE_MEMBER, canEdit: true }, onAddRelative: vi.fn() });
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}, 10000); // axe scans can be slower than the default 5s Vitest timeout on CI runners
```

**Critical jsdom limitation (confirmed via jest-axe's own README):** *"Color contrast checks do not work in JSDOM so are turned off in jest-axe."* This is not something the planner needs to manually disable — jest-axe already excludes the `color-contrast` rule under jsdom by default. **This is exactly why D-03 exists as a separate, deterministic test** — `jest-axe` alone cannot and will not catch the two contrast failures this research already found (see D-03 below).

**MUI-specific caveats to flag for the plan:**
- `Menu`/`MenuItem` (used by `PersonCard`'s Add-relative control) render into a **React Portal** appended to `document.body`, not inside the component's own `container`. jest-axe's README explicitly notes: *"If you're using React Portals, use the `baseElement` instead of `container"`* — i.e. `axe(document.body)` (or RTL's own `baseElement`, `render()`'s second return value) when a test needs to scan an *open* menu. For closed-menu scans (the common case), `container` is fine since nothing is portaled yet.
- MUI `Autocomplete`'s listbox popper is also portaled — the same `baseElement` guidance applies for a test that opens the suggestion list and scans it.
- No known MUI-specific axe *false positives* were found in this research; MUI's own components are broadly axe-clean by design (native `<button>`s, proper `role`/`aria-*` wiring already visible in the read source).

**RTL `userEvent.tab()` focus-order pattern (already-established `userEvent` conventions in this repo — see `frontend/src/pages/Login.test.jsx`):**

```javascript
// Source: @testing-library/user-event v14 docs, adapted to this repo's existing userEvent.click()-style tests
import userEvent from '@testing-library/user-event';

it('tabs from Edit to Add to the expand control in DOM order, each landing focus visibly', async () => {
  const user = userEvent.setup();
  renderCard({ member: { ...BASE_MEMBER, canEdit: true, children: [{ id: '2' }] }, onAddRelative: vi.fn() });

  await user.tab();
  expect(screen.getByRole('button', { name: 'Edit Ada Lovelace' })).toHaveFocus();

  await user.tab();
  expect(screen.getByLabelText(/add relative to ada lovelace/i)).toHaveFocus();

  await user.tab();
  expect(screen.getByRole('button', { name: /children of Ada Lovelace/i })).toHaveFocus();
});
```

`user.tab()` requires `@testing-library/user-event`'s `setup()` API (v14, already the pinned version) rather than the bare `userEvent.tab()` static call from v13 — `userEvent.setup()` is not yet used anywhere in this repo's existing tests (they call `userEvent.click(...)` statically), so this is a genuinely new pattern for this codebase; either the static `userEvent.tab()` (still exported in v14 for compatibility) or the `setup()`-based instance form works, but `setup()` is the currently-recommended v14 idiom for anything beyond a single simple interaction. **jsdom caveat:** `toHaveFocus()` (from `@testing-library/jest-dom`, already installed) works correctly in jsdom for real focus (jsdom does track `document.activeElement`), but it does **not** prove the CSS `:focus-visible` outline actually renders — jsdom has no layout/paint engine, so *visible* focus styling cannot be asserted this way. This is a real coverage gap: RTL can prove **focus lands on the right element in the right order**, but not that it is **visually indicated**. See Common Pitfalls below for a specific, confirmed landmine in this exact codebase.

### D-03: Deterministic WCAG contrast test

**Exact text-on-background pairs present on `/detail`'s surfaces (enumerated from `PersonCard.jsx`, `GenerationGrid.jsx`, `PersonSearch.jsx`, `theme.js`, `genderTheme.js` — all read directly in this research):**

| # | Text | Color token | Background | Effective bg (composited) | Ratio computed | Status |
|---|------|-------------|------------|---------------------------|-----------------|--------|
| 1 | Fullname (`fontSize:16, weight:700`) | `colors.ink` `#0f172a` | Card `bgcolor: ${genderTint}14` over page `colors.bg #f5f6fb` | `#e6edfb` (male) / `#f4e8f3` (female) / `#eaecf2` (other) | **15.0–15.2:1** | PASS (large margin) |
| 2 | Ge'ez name (`fontSize:18, weight:700`) | `genderTint` (male `#3b82f6` / female `#ec4899` / other `colors.slate`) | Same card bg as row 1 | same as row 1 | **male 3.13:1, female 2.97:1, other 4.03:1** | **male/female FAIL** both the 4.5:1 normal-text and (barely) the 3:1 large-text threshold; `18px`/`700` is ~0.67px *under* the WCAG large-text bold cutoff (14pt ≈ 18.67px), so it should be judged against **4.5:1**, not 3:1 — a clear fail either way for male/female |
| 3 | Role label (`fontSize:12, weight:700`, e.g. "Head"/"Child"/"Grandchild") | `colors.slate` `#64748b` | Same card bg as row 1 | same as row 1 | **4.01–4.05:1** | **FAIL** — under the 4.5:1 threshold required for 12px text (too small to qualify as "large text" regardless of weight) |
| 4 | "Living"/"Deceased" `Chip` text (outlined variant) | `success.main` `#10b981` at **full opacity** (confirmed from `@mui/material/Chip/Chip.js` line 280: `color: (theme.vars \|\| theme).palette[color].main` for the outlined variant — no alpha applied to the text, only to the border/hover states) | Card bg (row 1) or plain white `Paper` | `#e6edfb` (male card) / `#ffffff` | **2.16:1 (card) / 2.54:1 (white)** | **FAIL badly** — this is the worst pair found |
| 5 | Search suggestion secondary text (birth year / mother's name, `variant="body2" color="text.secondary"`) | `colors.slate` `#64748b` | Autocomplete popup `Paper` bg `#ffffff` | `#ffffff` | **4.76:1** | PASS |
| 6 | Search suggestion primary text (fullname) | `colors.ink` `#0f172a` | `#ffffff` | `#ffffff` | **17.85:1** | PASS |
| 7 | Expand-control label ("N children") | Typography default `text.primary` = `colors.ink` (no explicit `color` prop set, so MUI's `body1`/default variant styling applies `text.primary`, NOT the `IconButton`'s own inherited action-grey) | Card bg | Card bg | **~15:1** | PASS |
| 8 | IconButton icon glyphs (Edit/Add/Expand chevron — non-text, SC 1.4.11 UI-component 3:1 rule, not the 4.5:1 text rule) | MUI default `action` icon color ≈ `rgba(0,0,0,0.54)` ≈ `#757575` | Card bg | Card bg | **3.92–4.61:1** | PASS (meets the 3:1 non-text threshold with margin) |

**Confirmed-at-risk pairs to flag prominently for the plan (rows 2, 3, 4 above are genuine, computed WCAG AA failures, not hypothetical):**
1. Ge'ez name text tinted by `genderTint` directly on its own translucent card background — the male/female tints were chosen for the avatar ring/border, not for text-on-tint contrast, and it shows.
2. The `role` label (`colors.slate`) on the tinted card background sits at ~4.0:1, just under the 4.5:1 bar — a small, plausible-to-miss-by-eye failure.
3. The success-colored "Living" `Chip` text is the clearest failure (as low as 2.16:1) — this is the systemic MUI "outlined chip = full-opacity `main` color as text" pattern, and it will recur anywhere else in the app that uses `<Chip variant="outlined" color="success">` on a light background; worth flagging to the planner as a likely **real token/approach fix**, not just a test addition (CONTEXT.md D-03: "Any failing pair is a real fix in this phase").

**Recommended test file:** new `frontend/src/theme.contrast.test.js` (co-located sibling to `theme.js`, following this repo's `X.test.jsx`-next-to-`X.jsx` convention), importing `colors` and `genderMeta`/`MALE_TINT`/`FEMALE_TINT` directly (no component rendering needed — pure data test).

```javascript
// Source: WCAG 2.x contrast formula (W3C), computed with wcag-contrast per CONTEXT.md D-03
import { describe, it, expect } from 'vitest';
import contrast from 'wcag-contrast';
import { colors } from './theme.js';
import { MALE_TINT, FEMALE_TINT } from './utils/genderTheme.js';

// Composited card background: genderTint at alpha 0x14/255 over the page background,
// mirroring PersonCard.jsx's `bgcolor: \`${genderTint}14\`` sitting on colors.bg.
function compositeOverPage(hexFg, alphaByte, hexBg = colors.bg) { /* ...see PATTERNS above... */ }

describe('WCAG AA contrast — /detail surfaces', () => {
  it('fullname (ink) on the male/female/other card background meets 4.5:1', () => { /* ... */ });
  it('Ge\'ez name text (genderTint) on its own card background meets 4.5:1 (currently FAILS — fix required)', () => { /* ... */ });
  it('role label (slate) on the card background meets 4.5:1 (currently FAILS — fix required)', () => { /* ... */ });
  it('"Living"/"Deceased" chip text meets 4.5:1 against the card background (currently FAILS — fix required)', () => { /* ... */ });
});
```

**Flag for the planner:** this test file should be written FIRST (TDD red) against the current token values (proving the 3 real failures), THEN the plan should include an explicit task to either (a) darken the Ge'ez-name/role-label/chip colors for AA compliance, or (b) increase those specific text sizes to cross the "large text" 3:1 threshold with real margin, or (c) use a solid (non-alpha) card background so the tint isn't diluted before computing contrast against text. Per this project's CLAUDE.md core value ("fail loudly... before broken code ships"), red-then-green on this specific file is the expected TDD shape, consistent with the user's memory note on TDD red-green-refactor for security/quality fixes.

### D-04: Mobile responsive verification (breakpoints + HUMAN-UAT)

**Confirmed facts (verified directly from installed `@mui/system`/`@mui/material` source, not assumed):**
- `GenerationGrid.jsx` already uses `<Grid size={{ xs: 12, sm: 6, md: 4 }}>` per card (confirmed by reading the file).
- MUI's default breakpoint pixel values are `xs: 0, sm: 600, md: 900, lg: 1200` (confirmed from `@mui/system/createBreakpoints/createBreakpoints.js`); `theme.js` does not override `breakpoints`, so these defaults are live.
- `@mui/material/Grid/Grid.js` (line 92) generates `globalStyles[theme.breakpoints.up(breakpoint)] = styles`, and `theme.breakpoints.up('sm')` produces a literal `@media (min-width:600px)` string — this is injected as a real emotion `<style>` tag into `document.head` at render time, which **jsdom does load into the DOM** (jsdom has a DOM but no layout engine — it can hold and expose `<style>` text content, it just cannot *apply* the media query to compute actual layout).

**What this means for the target widths (verified arithmetic, not assumption):**
- At **360px** (< 600px `sm` threshold): only `xs: 12` applies → 1 card per row. Matches CONTEXT's "1 on mobile."
- At **768px** (≥ 600px, < 900px `md` threshold): `sm: 6` applies → 2 cards per row (not yet 3). Matches CONTEXT's "fewer on tablet" — worth calling out precisely in the HUMAN-UAT checklist as "2 per row at 768px, not 3" so the human isn't checking for the wrong number.

**Feasible automated (jsdom) assertion — CSS-presence, not rendered layout:**

```javascript
// Source: confirmed via @mui/material/Grid/Grid.js + @mui/system/createBreakpoints — real emotion
// <style> tags are injected into document.head even in jsdom; this proves the responsive rule
// EXISTS without needing jsdom to apply it (jsdom cannot).
it('generates real @media rules for the sm (600px) and md (900px) breakpoints used by the grid', () => {
  render(<GenerationGrid people={[makePerson('1'), makePerson('2'), makePerson('3')]} role="Child" onExpand={vi.fn()} onEdit={vi.fn()} />);
  const styleText = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  expect(styleText).toMatch(/@media \(min-width:\s*600px\)/);
  expect(styleText).toMatch(/@media \(min-width:\s*900px\)/);
});
```

A simpler, lower-fidelity fallback (source-text regex against the file itself) is also viable if the CSS-presence approach proves too coupled to MUI/emotion internals during implementation — either satisfies CONTEXT.md's phrasing ("assertions that the responsive `sx` breakpoints exist where they matter").

**HUMAN-UAT checklist items to add (following the exact `26-HUMAN-UAT.md`/`27-HUMAN-UAT.md` YAML-frontmatter + numbered-test format):**
1. At 360px width: single-column card stack, no horizontal scroll, no text truncation/overlap on the head card or an expanded generation row, search bar and its suggestion dropdown remain usable/tappable (44px+ touch targets — already coded via `minWidth/minHeight: 44` on the `IconButton`s per the read source).
2. At 768px width: 2-per-row generation grid (not 3, not 1 — precise expectation per the arithmetic above), apex connector cue remains legible, spouse dashed-connector pairs don't wrap awkwardly.
3. Keyboard-only pass at both widths: Tab through the head card's Edit/Add/Expand controls and confirm a real visible focus ring is painted (this is the item the automated `toHaveFocus()` assertions in D-02 *cannot* prove — see Pitfall 1 below).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| axe-core rule engine / ARIA violation detection | A custom "check every button has aria-label" linter script | `jest-axe` | axe-core encodes the full WCAG/ARIA ruleset (name/role/label, landmark, form-label, etc.); a hand-rolled check would only catch the subset someone thought to check for |
| sRGB relative-luminance / contrast-ratio math | A quick approximate formula | `wcag-contrast` (or a carefully-cited hand-rolled implementation of the exact W3C formula, as this research used for the audit above) | The WCAG formula has a specific gamma-correction piecewise function (the `0.03928` threshold constant); an approximate version can silently misjudge borderline pairs — several of the pairs found here (4.01, 3.13, 2.97) are close enough to nearby thresholds that formula precision matters |
| Cross-DB-engine test conditionals | Manual `process.env.SKIP_MARIADB_TESTS` flag set by hand before running tests locally | Auto-detected `SELECT VERSION()` helper (D-01) | CONTEXT.md explicitly rejects a manual toggle — auto-detection means the skip self-corrects if the local dev DB is ever upgraded to MySQL, with zero developer action required |

**Key insight:** every one of this phase's four workstreams already has a well-established, small, single-purpose library (or a Vitest-native API) that exactly matches the need — the risk in this phase is not "no tool exists" but "assuming jest-axe's default ruleset covers contrast" (it explicitly does not) and "assuming `toHaveFocus()` proves visible focus" (it does not — see Pitfall 1).

## Common Pitfalls

### Pitfall 1: The Paper's `&:focus-visible` outline in `PersonCard.jsx` is likely unreachable CSS

**What goes wrong:** `PersonCardSingle`'s root `Paper` (`frontend/src/components/person/PersonCard.jsx` lines 88-108) declares `'&:focus-visible': { outline: ... }`, but the `Paper` renders a plain `<div>` (via MUI's default `component` for `Paper`) with **no `tabIndex` and no interactive role** — it is never in the tab order and can never receive DOM focus via keyboard navigation, so this CSS rule cannot be triggered by any user action visible in the current source.

**Why it happens:** Likely written with the intent of the whole card being keyboard-focusable/navigable as a unit (a common a11y pattern for card-grid UIs), but the actual interactive elements are the `IconButton`s nested inside the card, which are real `<button>` elements that already receive the browser's native focus-visible outline automatically (no custom CSS needed for those).

**How to avoid:** During the D-02 audit, explicitly test (with `userEvent.tab()`) whether the `Paper` root is ever reachable via Tab. It will not be. The plan should decide: (a) remove the dead CSS as a small cleanup (safest, since the buttons already have native focus indication), or (b) if the intent really was "the whole card is keyboard-focusable" (e.g. for a future feature), add `tabIndex={0}` and a role — but that is scope creep beyond A11Y-01's literal ask ("interactive elements" are the buttons, not the card shell) and should be flagged as a discretionary call for the planner, not assumed.

**Warning signs:** A `jest-axe` scan will NOT catch this (dead CSS isn't an axe violation). Only an explicit `userEvent.tab()` walk-through (D-02's own recommended technique) surfaces it — this is exactly why CONTEXT.md asks for both jest-axe AND targeted tab-order tests, not jest-axe alone.

### Pitfall 2: `jest-axe`'s jsdom `color-contrast` exclusion means a fully-green jest-axe suite proves nothing about SC-2

**What goes wrong:** A plan that treats "jest-axe reports zero violations" as covering contrast (SC-2) will ship the three real contrast failures found in this research undetected — jest-axe silently disables the `color-contrast` rule under jsdom (confirmed via its own README).

**Why it happens:** It's an easy, reasonable-sounding assumption that "the a11y testing library catches a11y issues" without reading the fine print on jsdom's rendering limitations.

**How to avoid:** D-03's deterministic contrast test is not optional/redundant with D-02 — it is the *only* code-enforced coverage for SC-2. The plan must include both as separate, independently-required tasks/gates.

**Warning signs:** If a plan or verification report cites "jest-axe: 0 violations" as evidence for the contrast success criterion, that's a red flag — cross-check against the separate contrast test file's pass/fail.

### Pitfall 3: `it.skipIf`'s condition must be synchronous — don't reach for it for D-01

**What goes wrong:** `it.skipIf(await isMariaDB())` inside a `describe` block collection is either invalid (can't `await` at that position without wrapping the whole file in an async IIFE or top-level await) or, if forced to work via top-level `await isMariaDB()` at module scope, adds a live DB round-trip to the very top of test-file collection for **every** test in that file (even the ones that don't need the skip), and couples file-collection success to DB availability in a way that can produce confusing collection-time errors instead of a clean per-test skip.

**Why it happens:** `skipIf` reads naturally as "the idiomatic Vitest way to skip," and it is for statically-known conditions (env vars, `process.platform`, etc.) — but engine detection here is inherently async.

**How to avoid:** Use `context.skip(await isMariaDB(), reason)` inside the test body instead (see D-01 code example above) — confirmed available since Vitest 3.1, present in the installed 4.1.10.

### Pitfall 4: MUI `Chip` `variant="outlined"` text color is NOT alpha-adjusted — don't assume a translucent chip "must" have washed-out (safer/lower-contrast) text

**What goes wrong:** It's easy to assume an "outlined" (lighter-looking) chip variant uses a softened, alpha-blended text color and is therefore *less* likely to have a contrast problem than a solid "filled" chip. The opposite is true here: MUI's outlined `Chip` renders its text at the theme color's **full opacity** (confirmed at `Chip.js` line 280 — only the border uses `alpha(color, 0.7)`), so it inherits 100% of whatever base contrast problem the raw palette color (`success.main` = `#10b981`) has against a light background, which turns out to be severe (as low as 2.16:1).

**Why it happens:** Visual "lightness" of a variant doesn't map cleanly onto the underlying color's contrast math; only the border/background got the alpha treatment, not the text.

**How to avoid:** Verify contrast from the actual rendered/computed color per MUI's own component source (as this research did) rather than reasoning about variant "lightness" by eye.

**Warning signs:** Any `Chip` (or similar MUI component) using a semantic palette color (`success`, `warning`, `error`, `info`) directly as text-on-light-background is worth a contrast check — this pattern likely recurs elsewhere in the app (`/family`, `/manage`) outside this phase's `/detail`-only scope (D-06), worth a note for a future phase.

## Code Examples

See the inline code blocks under Architecture Patterns above (D-01 through D-04) — each is a concrete, ready-to-adapt pattern grounded in files actually read during this research (`verifyEmail.test.js`'s `rawConnection()`, `PersonCard.test.jsx`'s `renderCard()` helper, `GenerationGrid.jsx`'s `Grid size` prop, `Chip.js`'s outlined-variant styling).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The composited card background (`genderTint` at alpha `0x14` over `colors.bg #f5f6fb`) is the correct "effective background" to use for the D-03 contrast test, rather than compositing over plain white `#ffffff` (the `Paper`'s own implicit backdrop before `bgcolor` is applied) | D-03 contrast table | If the real rendered stacking context differs (e.g. an intervening opaque ancestor), the exact numeric ratios shift by a few tenths — this research computed both (page-bg and white-bg composites) and the male/female Ge'ez-text and Chip failures hold under **either** assumption, so the qualitative failures are robust, but the plan should still verify the actual DOM stacking order (e.g. via `getComputedStyle` in a real browser, or accept the page-bg composite as the reasonable worst-case default) before finalizing exact pass/fail thresholds in the test |
| A2 | `jest-axe` works correctly under Vitest with no Jest-runtime present (no official jest-axe documentation confirms Vitest compatibility; this is inferred from its dependency graph having no runtime coupling to Jest, cross-verified against multiple independent community blog posts describing the same Vitest+jest-axe pattern for other frameworks) | Standard Stack, D-02 | If an undocumented incompatibility surfaces (unlikely given the dependency analysis, but not officially confirmed by the jest-axe maintainers), the fallback is the Vitest-native fork `vitest-axe`, which has an identical API surface |
| A3 | 18px/700-weight text falls just under the WCAG "large text" bold cutoff (14pt ≈ 18.67px), and should therefore be judged against the 4.5:1 (not 3:1) threshold | D-03, Ge'ez name text row | If treated as "large text" instead (a defensible reading given how close 18px is to 18.67px, and given browser/font-rendering variance in actual px-to-pt conversion), the male tint's 3.13:1 would still fail the 3:1 large-text threshold too (3.13 is barely over, but the female tint's 2.97:1 fails even the more lenient 3:1 threshold) — **the qualitative conclusion (both are failures) does not change under either reading**, only the reported margin does |

## Open Questions

1. **Is `wcag-contrast` (the package) or a hand-rolled function preferred for D-03's implementation?**
   - What we know: both produce identical WCAG-formula results (verified by this research's own hand-rolled script, which matches the well-known W3C formula exactly); `wcag-contrast` is a tiny, long-established, `[OK]`-verified dependency.
   - What's unclear: whether the team prefers zero new runtime/test dependencies for a one-off contrast utility vs. the auditability of citing a named library in test failure messages.
   - Recommendation: default to `wcag-contrast` (already legitimacy-audited above) unless the planner has a specific zero-dependency preference; either is low-risk.

2. **Should the `PersonCard.jsx` dead `&:focus-visible` CSS (Pitfall 1) be removed, or does it hint at an intended but unbuilt "whole-card focusable" feature?**
   - What we know: the CSS as written cannot currently be triggered by any keyboard interaction (the `Paper` has no `tabIndex`/interactive role).
   - What's unclear: whether this was an intentional placeholder or a redundant/mistaken carry-over from an earlier design.
   - Recommendation: flag explicitly in the plan as a small, low-risk cleanup decision point (remove vs. wire up) rather than silently leaving it or silently "fixing" it without a decision — it's adjacent to, but not squarely inside, "keyboard operability" (the buttons are already independently keyboard-operable).

3. **Does the D-03 contrast fix (darkening tokens / resizing text / changing card-bg opacity) risk visually regressing the gender-tint design intent from Phase 25 (D-02 in that phase's RESEARCH.md)?**
   - What we know: Phase 25 established `MALE_TINT`/`FEMALE_TINT` as a deliberate visual language, reused across `/family` too (per `genderTheme.js`'s own comments).
   - What's unclear: whether darkening the tints (the most direct AA fix) would create visual inconsistency between `/detail`'s (now-darker) tints and `/family`'s existing (lighter) tints, since `genderTheme.js` is shared.
   - Recommendation: prefer fixing via text weight/size (crossing the large-text 3:1 threshold, or ensuring `18px`/`700` is unambiguously read as large by using `20px`+) or via increasing the card's background opacity (making it less washed-out, raising contrast without touching the shared tint constants) over changing `MALE_TINT`/`FEMALE_TINT` themselves, to avoid an unplanned `/family`-wide visual change inside an a11y-scoped phase (D-06 audit-boundary spirit). This is a call for the planner/discuss-phase to confirm, not a locked research recommendation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Whole stack | ✓ | v24.15.0 (repo pins `24.x` in `package.json`/`.nvmrc`; note CLAUDE.md's checked-in text says "Node 18.x" — stale relative to the actual `.nvmrc`/`package.json`, which this research confirmed read `24`) | — |
| npm (workspaces) | Install/test orchestration | ✓ | 11.12.1 | — |
| Vitest | Test runner (both workspaces) | ✓ | 4.1.10 (both `backend/package.json` and `frontend/package.json`) | — |
| Local MySQL/MariaDB client | D-01 engine detection dev-loop | ✓ | MariaDB 10.5.29 client reported by `mysql --version` locally (CONTEXT.md states the actual dev **server** is MariaDB 12.1 — this research did not independently re-verify the running server version, only the CLI client binary present in `PATH`) | — |
| GitHub Actions CI | SC-4 CI-green half of the gate | ✓ (workflow file present) | `mysql:8.4` service container, Node from `.nvmrc` (currently `24`) | — |
| `jest-axe` / `wcag-contrast` (new frontend devDependencies) | D-02/D-03 | ✓ on npm registry, `[OK]` per slopcheck | `11.0.0` / `3.0.0` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — everything needed for this phase is either already installed or a small, verified, easily-installable addition.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (both workspaces) |
| Config file | `backend/vitest.config.js` (globalSetup + DB reset, `pool: 'forks'`, `fileParallelism: false`); `frontend/vitest.config.js` (jsdom environment, `frontend/test/setup.js`) |
| Quick run command | `npm test --workspace frontend -- PersonCard.test.jsx` (single-file) or `npm test --workspace backend -- verifyEmail.test.js` |
| Full suite command | `npm test --workspaces` (root `package.json` script — the literal SC-4 gate command) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| A11Y-01 (keyboard/labels/focus) | axe-core zero-violations scan on each `/detail` surface | unit (jsdom) | `npm test --workspace frontend -- --run PersonCard.test.jsx GenerationGrid.test.jsx PersonSearch.test.jsx DetailPage.test.jsx` | ❌ Wave 0 (new `axe()` assertions to add to existing files) |
| A11Y-01 (tab order / focus landing) | `userEvent.tab()` sequence assertions on expand/collapse + Autocomplete | unit (jsdom) | same as above | ❌ Wave 0 |
| A11Y-01 (WCAG AA contrast) | Deterministic contrast-ratio assertions against theme tokens | unit (pure data, no DOM) | `npm test --workspace frontend -- --run theme.contrast.test.js` | ❌ Wave 0 (new file) |
| A11Y-01 (mobile layout, automated leg) | Responsive breakpoint CSS-rule presence assertion | unit (jsdom, CSS-text) | `npm test --workspace frontend -- --run GenerationGrid.test.jsx` | ❌ Wave 0 (new assertion in existing file) |
| A11Y-01 (mobile layout, human leg) | Visual/manual check at 360px and 768px | manual-only (jsdom cannot render/paint) | n/a — `29-HUMAN-UAT.md` checklist | ❌ Wave 0 (new file, mirrors `26-HUMAN-UAT.md`/`27-HUMAN-UAT.md`) |
| SC-4 (milestone green gate) | Full workspace suite exits 0 locally (MariaDB) and in CI (MySQL 8.4) | integration + full-suite | `npm test --workspaces` | ✓ suite exists; ❌ Wave 0 for the two skip-guarded tests + `backend/test/dbEngine.js` |

### Sampling Rate
- **Per task commit:** the relevant single-file `npm test --workspace <ws> -- --run <file>` command.
- **Per wave merge:** `npm test --workspaces` (the actual SC-4 command).
- **Phase gate:** Full suite green (with the documented D-01 MariaDB-skip caveat) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `backend/test/dbEngine.js` — new shared `isMariaDB()` helper (D-01)
- [ ] `frontend/src/theme.contrast.test.js` — new deterministic contrast test file (D-03)
- [ ] `.planning/phases/29-accessibility-responsive-quality-gate/29-HUMAN-UAT.md` — new HUMAN-UAT file (D-04), following the `26-HUMAN-UAT.md`/`27-HUMAN-UAT.md` frontmatter/format exactly
- [ ] `npm install --workspace frontend jest-axe wcag-contrast` — framework/tooling install
- [ ] `KNOWN-ISSUES.md` update (D-01) — not a test file, but a required Wave-0-adjacent doc change gating an honest SC-4 close

## Security Domain

> `security_enforcement` is absent from `.planning/config.json` (= enabled per protocol default), but this phase touches no authentication, authorization, data-validation, or cryptography surface — it is a UI accessibility/contrast audit plus a backend test-infrastructure skip guard. No new attack surface is introduced.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No | Not touched — no auth code changes in this phase |
| V3 Session Management | No | Not touched |
| V4 Access Control | No | `PERM-01/02/03` (admin gating) were built and enforced in Phase 28; this phase's D-06 audit boundary explicitly excludes the Edit/Add dialogs' internals, and the read-only `PersonCard`/`GenerationGrid`/`PersonSearch` surfaces under audit here contain no new access-control logic |
| V5 Input Validation | No | No new user input surfaces introduced (the search Autocomplete's existing debounced query is unchanged by this phase) |
| V6 Cryptography | No | Not touched |

### Known Threat Patterns for this stack

None applicable — this phase adds test tooling and a documented, narrowly-scoped conditional test skip; it does not change any request-handling, data-access, or trust-boundary code. The one item worth a passing security-adjacent note: the D-01 engine-detection helper (`backend/test/dbEngine.js`) opens a raw `mysql2` connection using the **test** environment's DB credentials (`env/test.env`, already used identically by the existing `rawConnection()` pattern in `verifyEmail.test.js`) — it introduces no new credential-handling surface beyond what that existing pattern already does.

## Sources

### Primary (HIGH confidence)
- Direct file reads in this repo: `frontend/src/components/person/PersonCard.jsx`, `GenerationGrid.jsx`, `PersonSearch.jsx`, `frontend/src/pages/DetailPage.jsx`, `frontend/src/theme.js`, `frontend/src/utils/genderTheme.js`, `backend/src/resolvers/verifyEmail.test.js`, `backend/src/services/familyMember.dedup.test.js`, `backend/src/services/familyMember.queryCount.test.js`, `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/vitest.config.js`, `frontend/vitest.config.js`, `frontend/test/setup.js`, `.github/workflows/ci.yml`, `KNOWN-ISSUES.md`, `frontend/src/components/person/PersonCard.test.jsx`, `GenerationGrid.test.jsx`, `.planning/phases/26.../26-HUMAN-UAT.md`, `27.../27-HUMAN-UAT.md`.
- Direct `node_modules` source inspection: `@mui/material/Chip/Chip.js` (outlined-variant text color, line 280), `@mui/material/Grid/Grid.js` (breakpoint-keyed `globalStyles`, line 92), `@mui/system/createBreakpoints/createBreakpoints.js` (default `sm:600`/`md:900`), `@vitest/runner/dist/tasks.d-*.d.ts` (`skipIf` and `context.skip` type signatures), `@testing-library/user-event/package.json` (version `14.6.1`).
- `npm view jest-axe`, `npm view wcag-contrast` (version, `time.created`, `repository.url`, `dependencies`) — registry-confirmed.
- `npmjs.org` downloads API (`api.npmjs.org/downloads/point/last-week/<pkg>`) for both packages.
- `slopcheck install jest-axe wcag-contrast` — both `[OK]`.
- https://vitest.dev/guide/test-context.html — `context.skip(condition, note)` signature and "since Vitest 3.1" note (WebFetch).

### Secondary (MEDIUM confidence)
- https://raw.githubusercontent.com/NickColley/jest-axe/main/README.md (WebFetch) — `expect.extend(toHaveNoViolations)` pattern, jsdom `color-contrast` exclusion, `baseElement`-for-portals guidance. Confirms jest-axe's own documented behavior; does not itself confirm Vitest compatibility (see Assumption A2).
- WebSearch cross-verification of "jest-axe with Vitest" community usage (multiple independent blog posts describing the same integration pattern for React+Vitest and Vue+Vitest projects) — supports Assumption A2 without being an official jest-axe statement.

### Tertiary (LOW confidence)
- None relied upon for load-bearing claims in this document.

## Metadata

**Confidence breakdown:**
- Standard stack (jest-axe/wcag-contrast versions, legitimacy): HIGH — registry- and slopcheck-verified directly in this session.
- Architecture/D-01 Vitest skip API: HIGH — confirmed from installed package `.d.ts` files and official vitest.dev docs.
- Architecture/D-03 contrast findings: HIGH — computed with a WCAG-formula script during this research and cross-checked against MUI's own source for the Chip text-color claim; the exact hex composites depend on Assumption A1 (stacking-context bg), but the qualitative pass/fail calls are robust across the range tested.
- D-02 jest-axe+Vitest compatibility: MEDIUM — not an officially-documented combination by the jest-axe maintainers, but architecturally sound and community-corroborated (Assumption A2).
- D-04 mobile: HIGH for the breakpoint-CSS mechanism (source-verified); the visual/human portion is inherently manual by jsdom's nature, not a confidence gap.

**Research date:** 2026-08-05
**Valid until:** 2026-09-04 (30 days — stable, mature libraries and an already-mostly-built codebase; re-verify package versions if planning is delayed materially past this window)
