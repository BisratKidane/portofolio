---
phase: 08
plan: 01
subsystem: backend-mailer
tags: [mailer, nodemailer, smtp, fail-fast, config]
requires: []
provides:
  - "backend/src/services/mailer.js — sendMail() + sendPasswordResetEmail() named exports"
  - "env.smtpHost / env.smtpPort / env.smtpUser / env.smtpPass / env.smtpFrom on the env object"
  - "assertProductionMailConfig() wired into env.js boot sequence"
affects:
  - "backend/src/config/env.js (boot sequence gains a second production assertion)"
  - "backend/src/resolvers/user.resolver.js (plan 08-02 will import sendPasswordResetEmail)"
tech_stack:
  added:
    - "nodemailer@^9.0.3 (backend runtime dependency)"
  patterns:
    - "jsonTransport in dev/test (zero network egress), SMTP transport in production"
    - "Pure plain-argument boot assertion, one function per file (mirrors assertProductionSecrets)"
key_files:
  created:
    - backend/src/services/mailer.js
    - backend/src/config/assertProductionMailConfig.js
    - backend/src/config/assertProductionMailConfig.test.js
  modified:
    - backend/package.json
    - package-lock.json
    - backend/src/config/env.js
decisions:
  - "SMTP env var names: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM (Claude's Discretion per CONTEXT.md)"
  - "Assertion named assertProductionMailConfig, in its own file, importable from env.js without pulling nodemailer into env.js's import graph"
  - "Reset email is text-only (no html part) — one template, nothing to keep in sync"
  - "SMTP_FROM defaults to no-reply@portfolio.local so dev/test boot needs zero SMTP config"
metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_changed: 6
  tests_added: 5
  completed: 2026-07-13
---

# Phase 8 Plan 01: Mailer Service & Production SMTP Fail-Fast Summary

Nodemailer-backed `sendMail()`/`sendPasswordResetEmail()` mailer service with zero-egress `jsonTransport` in dev/test, plus a production boot assertion that refuses to start when SMTP config is incomplete.

## What Was Built

**`backend/src/services/mailer.js`** (new) — plain named exports, mirroring `utils/auth.js`'s module shape. A single module-level `transporter` is selected by `env.nodeEnv === 'production'`: production gets an SMTP transport built from `env.smtpHost`/`smtpPort`/`smtpUser`/`smtpPass`; development and test get `{ jsonTransport: true }` (composes the message, zero network egress — SC-1, D-01/D-03).

- `sendMail({ to, subject, text, html })` — the generic transport primitive. Awaits `transporter.sendMail(...)`, and `console.log`s the composed message (recipient, subject, body) **only** when `env.nodeEnv === 'development'`. Silent in `test` (D-04).
- `sendPasswordResetEmail({ to, token })` — thin wrapper (D-02) owning subject/body/link composition. Builds the link as `${env.clientUrl}/reset-password?token=${token}` (verbatim shape from CONTEXT.md `<specifics>`) and delegates to `sendMail()`. Resolvers will call this wrapper, not `sendMail()` directly; the mailer is **not** added to the Apollo `context()` object.

**`backend/src/config/assertProductionMailConfig.js`** (new, TDD'd) — pure, plain-argument assertion in its own file, mirroring `assertProductionSecrets.js` exactly. Throws `SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in production.` when `nodeEnv === 'production'` AND any of host/user/pass is falsy. The condition is an explicit allowlist-of-one on the literal string `'production'` — never an inverted check (PITFALLS Pitfall 12).

**`backend/src/config/env.js`** (modified) — five SMTP fields added between `resetTokenExpiresMinutes` and `database`, using the same `process.env.X || <default>` idiom as every existing field. `assertProductionMailConfig(...)` is called at the bottom of the file, directly below the existing `assertProductionSecrets(...)` call.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Verify nodemailer package legitimacy (checkpoint) | — (no file changes; evidence recorded in Task 2's commit body) |
| 2 | Install nodemailer, add SMTP env vars, create mailer service | `5048acb` |
| 3 (RED) | Failing tests for assertProductionMailConfig | `d4e7b3b` |
| 3 (GREEN) | assertProductionMailConfig + env.js boot wiring | `f8d4c80` |

No REFACTOR commit — the GREEN implementation is 5 lines and already matches the `assertProductionSecrets` template exactly; there was nothing to clean up.

## Package Legitimacy Audit (Task 1 checkpoint)

RESEARCH.md has no `## Package Legitimacy Audit` table for this milestone, so `nodemailer` was treated as `[ASSUMED]` and gated behind a blocking `checkpoint:human-verify` (threat T-08-SC) before any `npm install` ran. Human approved after registry verification:

| Field | Value |
|-------|-------|
| Package | `nodemailer@^9.0.3` |
| Maintainer | `andris <andris@kreata.ee>` (Andris Reinman — original/longstanding author) |
| Repository | github.com/nodemailer/nodemailer |
| License | MIT-0 |
| Registry versions | 9.0.0–9.0.3 exist, so `^9.0.3` resolves |
| Engines | `node >=6.0.0` — compatible with this repo's Node 24.x backend |
| Verdict | **Approved** — install proceeded in Task 2 |

## Verification

- `npm test --workspace backend` — **59 passed / 14 files** (was 54/13 before this plan; +5 from the new `assertProductionMailConfig.test.js`). Zero collateral failures: `env.js` imports cleanly under `NODE_ENV=test` with no SMTP vars set (T-08-02 mitigation confirmed).
- Production fail-fast confirmed manually — `NODE_ENV=production JWT_SECRET=... node -e "import('./src/config/env.js')"` with no SMTP vars printed `REFUSED: SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in production.` and exited **1** (T-08-03 mitigation confirmed).
- `NODE_ENV=test node -e "import('./src/services/mailer.js')"` resolves and exports exactly `['sendMail', 'sendPasswordResetEmail']` — importing the mailer under test never throws and never attempts network egress.
- Grep criteria: one `export async function sendMail`, one `export async function sendPasswordResetEmail`, one `jsonTransport: true`, one `env.nodeEnv === 'development'` guarding the log, one `nodeEnv === 'production'` in the assertion, two `assertProductionMailConfig` refs in `env.js`, five new SMTP fields.

## Deviations from Plan

None — plan executed exactly as written. All three threat-model mitigations (T-08-01 dev-only log gate, T-08-02 test/dev-safe assertion scope, T-08-03 production boot refusal) landed as specified, plus T-08-SC's supply-chain gate.

Per D-07, no dedicated `mailer.test.js` was created; mailer correctness is proven indirectly via the resolver-level `vi.mock()` tests in plan 08-03.

## Notes for Downstream Plans

- **08-02** imports `sendPasswordResetEmail` from `../services/mailer.js` (direct module import, not Apollo context) and calls it fire-and-forget after `await user.save()`.
- **08-03** `vi.mock('../services/mailer.js', ...)` — the module exports exactly two named functions, so the mock factory must provide `sendPasswordResetEmail` (and `sendMail` if any test imports it).
- No SMTP env vars were added to `env/local.env` or `env/test.env` — every SMTP field defaults to a value that lets dev/test boot with zero configuration. Real SMTP credentials are a deployment concern, explicitly deferred out of this milestone; production is wired-but-unconfigured and boot-refusing, which is exactly the state that deferral implies.

## Self-Check: PASSED

All created files exist on disk; all three task commits (`5048acb`, `d4e7b3b`, `f8d4c80`) exist in git history.
