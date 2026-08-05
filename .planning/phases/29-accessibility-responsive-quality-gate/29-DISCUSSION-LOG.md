# Phase 29: Accessibility, Responsive & Quality Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 29-accessibility-responsive-quality-gate
**Areas discussed:** Milestone green-gate (user-selected); A11y test tooling / Mobile verification / Audit scope (delegated to Claude's discretion)

---

## Area selection

Four gray areas were presented (multiSelect): A11y test tooling, Mobile verification, Audit scope, Milestone green-gate. The user selected **only Milestone green-gate** and delegated the other three to Claude's discretion.

---

## Milestone green-gate

Pre-question investigation established a decisive fact: the two long-failing backend tests (`verifyEmail` VERIFY-04, `familyMember.dedup` REL-06) are **MariaDB-only** — they pass on CI's MySQL 8.4 and fail only on the local MariaDB 12.1 dev DB (Sequelize optimistic-version `"Record has changed since last read"` vs MySQL `FOR UPDATE` lock-wait). They also fail on `main` locally; not a Phase 28/29 regression. Source: `.planning/quick/260727-rvt-dashboard-user-management/260727-rvt-SUMMARY.md`.

| Option | Description | Selected |
|--------|-------------|----------|
| Close on CI-green + document | Gate = full suite green in CI (MySQL 8.4) + frontend green locally; add KNOWN-ISSUES note; no test/product change. Matches prior-phase precedent. | |
| Engine-guard skip (green locally too) | Gate the two tests to skip when the dev engine is MariaDB, so `npm test --workspaces` exits 0 on both engines; tests still run on CI's MySQL 8.4. | ✓ |
| Make tests engine-portable | Adapt resolver/tests so both engines pass — genuinely 100% green everywhere; expands the a11y phase into backend concurrency work. | |

**User's choice:** Engine-guard skip (green locally too).
**Notes:** Skip must be honest and visible — auto-detected via `SELECT VERSION()`, reason-documented inline, keyed on engine (not a manual toggle), and must NOT weaken CI coverage (tests still run and pass on MySQL 8.4). Also refresh KNOWN-ISSUES.md with the MariaDB caveat. Captured as CONTEXT D-01.

---

## Claude's Discretion

The user delegated these three areas; defaults captured as CONTEXT D-02–D-06:
- **A11y test tooling (D-02):** enforce keyboard/label/focus as a code regression — add `jest-axe` + targeted RTL `userEvent.tab()` focus assertions, not a manual audit.
- **Contrast (D-03):** compute WCAG AA ratios from `theme.js` hex tokens and assert them in a unit test (deterministic, code-enforced).
- **Mobile (D-04):** human-UAT at 360px + 768px plus breakpoint assertions (jsdom can't measure layout); reuse the HUMAN-UAT precedent from phases 26/27.
- **Audit scope (D-06):** limit to `/detail`'s own new surfaces (PersonCard, GenerationGrid, PersonSearch, DetailPage); the reused Edit/Add dialogs are out of scope.

## Deferred Ideas

- Making the two concurrency tests genuinely engine-portable — rejected as scope creep for an a11y phase; valid future backend-hardening task.
- A11y remediation of surfaces beyond `/detail` (Dashboard, `/manage`, `/family`).
- Any dialog-internal a11y defects incidentally found in the reused Edit/Add dialogs — note as follow-up, don't fix here.
