---
phase: 22-render-surfaces-read-path
plan: 03
subsystem: manual-visual-verification
tags: [geez, checkpoint, human-verify, visual-signoff, deferred]
requires:
  - "22-02 render surfaces shipped (getGeezDisplay wired into /family + /manage)"
provides:
  - "Human visual sign-off gate outcome recorded for Phase 22 (deferred to Phase 23)"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
requirements: [VIEW-01]
status: deferred
---

# 22-03 — Manual Visual Sign-off (Ge'ez names on /family + /manage)

## Outcome: DEFERRED to Phase 23 (user decision, 2026-07-31)

This is a `checkpoint:human-verify` gate with **zero code changes** — Plan 22-02 already
shipped and unit-tested (289 tests green) the rendering/search wiring. This plan exists only
to obtain a human visual sign-off against the **longest real Ge'ez name in the production
dataset**, which jsdom cannot rasterize.

## Why deferred

At sign-off time the operator reported "no new fields are visible" on the running app.
Root-caused via the app's own Sequelize connection against the local dev DB:

- **96 family members total, 0 with any Ge'ez name** (`geezFirstname`/`geezLastname` both null everywhere).

This is **correct absent-data behavior**, not a defect:
- `geezFullname` resolves as a Sequelize VIRTUAL from `geezFirstname`+`geezLastname` (`backend/src/models/FamilyMember.js:75-78`), exposed on the GraphQL `FamilyMember` type.
- Plan 22-01 added `geezFullname` to the three query selection sets; Plan 22-02 renders it via `getGeezDisplay(member)` only when present.
- With every member's Ge'ez fields null, the surfaces correctly render nothing extra.

The **write path** that lets a human enter Ge'ez names through the UI (the `/manage` edit
forms + Autocomplete) is **Phase 23**, which has not run yet. There is therefore no real
Ge'ez data to visually verify against, and no in-app way to create it.

The operator chose to **defer the real-data visual sign-off to Phase 23** rather than seed
synthetic Ge'ez names into the real dataset now. Phase 22 closes on its automated coverage
(the rendering/truncation logic is proven by component tests using Ethiopic fixtures); the
worst-case glyph-width / fixed-card-overflow check happens in Phase 23 once real Ge'ez names
can be entered and viewed.

## Carry-forward (must be closed during/after Phase 23)

Visual sign-off on `/family` + `/manage` against the **longest real Ge'ez name** once data
exists — confirm the fixed 252×120px `/family` card truncates every row with ellipsis and
never overflows (STATE.md blocker, UI-SPEC Component Contract #5, ROADMAP SC1). Recorded as a
deferred human-UAT item in STATE.md.

## Self-Check: PASSED
Checkpoint resolved (deferred by operator decision). No code changed; nothing to break.
