# Phase 29: Accessibility, Responsive & Quality Gate - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `/detail` fully keyboard-operable and screen-legible on mobile, then close the v4.0 milestone with the whole automated suite green. This is the milestone-closing **graded gate**: the `/detail` surfaces were built accessibly across Phases 25–28 (aria-labels, `role` attributes, a `focus-visible` outline, non-color gender cues, a ≤3/row→1 responsive grid), and this phase audits that work, closes any gaps, verifies contrast and mobile layout, and lands the closing green-suite gate.

**In scope:** keyboard operability + accessible labels + visible focus on `/detail`'s interactive elements (expand/collapse controls, search suggestions, Edit/Add controls); WCAG AA text/background contrast on `/detail`'s new surfaces; mobile-viewport readability/usability of `/detail`'s layout; the milestone-close full-suite green gate. Requirement: **A11Y-01**.

**Out of scope (new capabilities → their own phase):** new `/detail` features or controls; a11y remediation of pages outside `/detail`; the Edit/Add dialogs' internals (existing reused components — see D-06); a design-system-wide a11y overhaul.
</domain>

<decisions>
## Implementation Decisions

### Milestone green gate (SC-4) — the discussed area

- **D-01 (engine-guard skip for the two MariaDB-only concurrency tests):** The v4.0 close gate is a genuinely green `npm test --workspaces` (exit 0) on **both** the developer's local engine and CI. The two long-standing failures — `verifyEmail.test.js` VERIFY-04 (admin-slot lock-contention) and `familyMember.dedup.test.js` REL-06 (D-10 resolver-path TOCTOU) — are **MariaDB-only**: they pass on CI's MySQL 8.4 (where the `FOR UPDATE` locking semantics they assert hold) and fail only on the local MariaDB 12.1 dev DB, which surfaces a Sequelize optimistic-version `"Record has changed since last read"` error instead. They also fail on `main` locally — not a Phase 28/29 regression, not a product defect. **Decision:** gate exactly these two tests to **skip when the running engine is MariaDB**, so the suite exits 0 on both engines while still running (and passing) on CI's MySQL 8.4.
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
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement & roadmap
- `.planning/REQUIREMENTS.md` §A11Y-01 — the single requirement this phase validates (keyboard-operable + accessible labels + visible focus + WCAG AA contrast + mobile-readable).
- `.planning/ROADMAP.md` → Phase 29 — goal + 4 success criteria (SC-1 keyboard, SC-2 contrast, SC-3 mobile, SC-4 full-suite green).

### Prior-phase decisions carried forward (do NOT re-decide)
- `.planning/phases/27-descendant-navigation-performance/27-CONTEXT.md` §D-05 — responsive generation grid (≤3 cards/row desktop → 1 on mobile); and the explicit deferral of "keyboard operability / WCAG AA contrast / final mobile polish" to Phase 29 as a graded gate ("build accessibly now; the audit + fixes land there").
- `.planning/phases/25-reusable-personcard/25-CONTEXT.md` §CARD-03/D-09/D-11 — gender signalled via ring + `data-gender` + aria-label (non-color cue already satisfies WCAG for gender).
- `.planning/phases/28-admin-actions-on-detail/28-CONTEXT.md` — controls are always-visible (no hover-reveal) precisely for the a11y/keyboard/touch direction.

### Green-gate evidence (the MariaDB-only characterization)
- `.planning/quick/260727-rvt-dashboard-user-management/260727-rvt-SUMMARY.md` (line ~44) — verbatim: the two failures are "pre-existing MariaDB-only concurrency tests … CI runs MySQL 8.4 where they pass."
- `.planning/milestones/v1.1-phases/11-email-verification-admin-race-fix/11-08-SUMMARY.md` — VERIFY-04 was fixed with an atomic `SELECT … FOR UPDATE` transaction proven under real MySQL 8.4 concurrency (why it passes on MySQL).
- `.planning/milestones/v3.0-phases/23-write-path-quality-gate/23-VERIFICATION.md` — prior milestone-close precedent: closed "green except the two named pre-existing failures."
- `.github/workflows/ci.yml` — CI runs `npm test` against a `mysql:8.4` service (the canonical green environment).
- `KNOWN-ISSUES.md` — currently silent on these two; D-01 adds the MariaDB-vs-MySQL caveat here.

### Files under audit
- `frontend/src/components/person/PersonCard.jsx`, `frontend/src/components/person/GenerationGrid.jsx`, `frontend/src/components/person/PersonSearch.jsx`, `frontend/src/pages/DetailPage.jsx`.
- `frontend/src/theme.js` — color tokens for the D-03 contrast computation; `MuiButton`/palette `contrastText` definitions.
- Engine-gate targets: `backend/src/resolvers/verifyEmail.test.js` (VERIFY-04), `backend/src/services/familyMember.dedup.test.js` (REL-06).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PersonCard.jsx` already has: card-level `aria-label={`${fullname}, ${genderLabel}`}`, `role`, a `&:focus-visible` outline (`2px solid ${colors.primary}`, offset 2px), and aria-labelled `IconButton`s for Edit, Add, and expand/collapse (label toggles Show/Hide children). The a11y baseline exists — audit verifies completeness (focus order, tab reachability, menu semantics), not greenfield build.
- `theme.js` exposes named hex color tokens (`primary #6366f1`, `ink #0f172a`, `slate`, palette `contrastText`) → deterministic contrast math for D-03.
- Frontend test suite is Vitest + RTL + jsdom, with many existing dialog/component specs to mirror; no a11y tooling yet (jest-axe would be the first).
- `familyMember.queryCount.test.js` / existing backend helpers show the `SELECT VERSION()`-style raw-connection pattern the D-01 engine detector can reuse.

### Established Patterns
- Project convention: prove behavior in CI, fail loudly — favors code-enforced a11y checks (D-02/D-03) over manual audits.
- HUMAN-UAT files (`26-HUMAN-UAT.md`, `27-HUMAN-UAT.md`) are the established vehicle for browser-only visual/layout sign-off → reuse for D-04 mobile check.
- The two target concurrency tests already `SET SESSION innodb_lock_wait_timeout` and use raw connections — the engine guard slots in at their top-level `describe`/`it`.

### Integration Points
- `DetailPage.jsx` composes `PersonCard` (head/child/grandchild via `role`) and `PersonSearch`; a11y fixes concentrate there and in the two person components.
- The engine guard touches only the two named backend test files — no resolver/product code change.
</code_context>

<specifics>
## Specific Ideas

- The green gate must be *honest*: a visible, reason-documented conditional skip keyed on auto-detected engine — never a blanket `.skip` and never masking a real defect. On MySQL/CI the tests run and must pass.
- Prefer a single shared engine-detection helper so both tests (and any future engine-gated test) import one source of truth.
</specifics>

<deferred>
## Deferred Ideas

- Making the two concurrency tests genuinely engine-portable (adapting resolver/test locking so MariaDB passes too) — explicitly rejected for this phase as backend-concurrency scope creep inside an a11y phase; a valid future backend-hardening task.
- A11y remediation of surfaces beyond `/detail` (Dashboard, `/manage`, `/family`) — separate scope.
- Any dialog-internal a11y defects incidentally found in `EditMemberDialog`/`AddRelativeDialog` — note as follow-up, don't fix here (D-06).

*Discussion stayed within phase scope; the user chose to deep-dive only the milestone green-gate and delegated the other three areas to Claude's discretion (D-02–D-06).*
</deferred>

---

*Phase: 29-accessibility-responsive-quality-gate*
*Context gathered: 2026-08-05*
