---
phase: 35
slug: post-verify-landing-invited-path-copy
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-09
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 (both workspaces); React Testing Library + jsdom on the frontend |
| **Config file** | `frontend/vitest.config.js` (jsdom, `setupFiles: ['./test/setup.js']`); `backend/vitest.config.js` (`globalSetup`, `pool: 'forks'`, `fileParallelism: false`) |
| **Quick run command** | `cd frontend && npx vitest run src/pages/<File>.test.jsx` / `cd backend && npx vitest run src/services/mailer.test.js` |
| **Full suite command** | `npm test --workspaces` (repo root; backend half needs the MariaDB test DB up) |
| **Estimated runtime** | ~10 s single frontend file; ~7 min full workspace suite (backend ≈ 6.5 min measured in Phase 34) |

---

## Sampling Rate

- **After every task commit:** Run the single-file `npx vitest run <path>` for whichever file(s) that task touched
- **After every plan wave:** Run `cd frontend && npx vitest run` (plus `cd backend && npx vitest run` if `mailer.js` was touched in that wave)
- **Before `/gsd:verify-work`:** `npm test --workspaces` must be green, run once from the repo root in the foreground to completion
- **Max feedback latency:** 120 s for per-task single-file runs; the full-suite phase gate is a one-time ~7 min run (Phase 34 precedent)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | REG-04, REG-06 | T-35-03, T-35-04 | RED-first: `AwaitingApproval.jsx` + `App.jsx` route + composed test created; landing renders with no session, never reads/sets `authToken`; today's code fails by rendering the login form (D-01, D-02, D-05, D-06, D-11, D-12) | composed (red first, D-12) | `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx` | ❌ W0 (created by this task) | ⬜ pending |
| 35-01-02 | 01 | 1 | REG-04, REG-06 | T-35-03 | GREEN: `VerifyEmail.jsx` retargeted to `/awaiting-approval`; Active user still gets `/dashboard` + stored token (D-01, D-13 item 1) | unit + composed | `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx src/pages/VerifyEmail.test.jsx` | ✅ `VerifyEmail.test.jsx` / composed created by 35-01-01 | ⬜ pending |
| 35-01-03 | 01 | 1 | REG-04 (SC-2/SC-4) | T-35-05 | `Pending.jsx:9` `!user → /login` bounce unchanged; copy no longer says "approval"; four mutation-and-restore cycles recorded (D-03, D-07, D-13 item 4) | unit + mutation | `cd frontend && npx vitest run src/pages/Pending.test.jsx src/pages/verifyLanding.composed.test.jsx` | ✅ | ⬜ pending |
| 35-02-01 | 02 | 1 | INVITE-03 | T-35-06 | Invited-path success copy says "verify, then sign in" (D-08); self-reg paragraph ~211-215 untouched | unit | `cd frontend && npx vitest run src/pages/Register.test.jsx` | ✅ | ⬜ pending |
| 35-02-02 | 02 | 1 | INVITE-03 | T-35-01 | Invitation email text + html no longer promise a review; static strings only, `escapeHtml` pattern kept (D-08) | syntax gate (Task 35-02-03 supplies the assertions) | `node --check backend/src/services/mailer.js` | ✅ (assertions added in 35-02-03) | ⬜ pending |
| 35-02-03 | 02 | 1 | REG-04, INVITE-03 | T-35-01 | Shared verification email path-neutral, no signature change (D-09); resolver string untouched (D-10) | unit | `cd backend && npx vitest run src/services/mailer.test.js` | ✅ (`sendVerificationEmail` had zero coverage before this task — W0 gap closed here) | ⬜ pending |
| 35-03-01 | 03 | 2 | REG-04, REG-06, INVITE-03 | T-35-07 | 11-point Do-not-use-list grep sweep + D-10/resolver-schema-AuthContext boundary confirmed phase-wide | grep sweep | `grep -ci "approval" frontend/src/pages/Pending.jsx` (+10 more checks, see 35-03-PLAN.md Task 1) | ✅ | ⬜ pending |
| 35-03-02 | 03 | 2 | REG-04, REG-06, INVITE-03 | T-35-08 | Whole-stack gate green, reconciled against the Phase 34 baseline (72 files/648+3 skipped backend, 44 files/498 frontend) | full suite | `npm test --workspaces` | ✅ | ⬜ pending |
| 35-03-03 | 03 | 2 | REG-04, REG-06, INVITE-03 | — | Human sign-off: landing page, `/pending`, invitation email, verification email visuals match `35-UI-SPEC.md` | manual (`checkpoint:human-verify`) | n/a — `<human-check>` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs reconciled against the planner's actual task list (`35-01-PLAN.md`, `35-02-PLAN.md`, `35-03-PLAN.md`) — no longer provisional.*

---

## Wave 0 Requirements

- [x] `frontend/src/pages/verifyLanding.composed.test.jsx` — composed verify → landing test (D-11/D-12/D-13), written RED before the fix (Task 35-01-01)
- [x] `frontend/src/pages/AwaitingApproval.test.jsx` — Claude's Discretion exercised: NOT created; the composed test's D-13 item 3 (direct-hit render assertion) already provides equivalent unit-level coverage, so a dedicated unit test file was judged redundant
- [x] `backend/src/services/mailer.test.js` — new `sendVerificationEmail` describe block (zero coverage today) and updated `sendInvitationEmail` assertions (Task 35-02-03)
- [x] No framework install needed — Vitest/RTL already configured in both workspaces

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rendered invitation/verification email reads correctly in a mail client | INVITE-03 | Template text is asserted automatically; visual rendering is not | Trigger an invitation from `/invite` against local Resend sandbox, open the email, confirm no "review/approve" wording |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the one `checkpoint:human-verify` task, 35-03-03, uses `<human-check>` per the project's checkpoint convention, matching Phase 34's `34-09` Task 2 precedent)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only the final task, 35-03-03, is manual)
- [x] Wave 0 covers all MISSING references (the composed test and the `sendVerificationEmail` coverage gap, both closed above)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency < 120s (per-task; the one-time ~7 min full-suite gate is the phase-level sample, not a per-task one)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-09
