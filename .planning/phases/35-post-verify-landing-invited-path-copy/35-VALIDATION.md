---
phase: 35
slug: post-verify-landing-invited-path-copy
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Estimated runtime** | ~10 s single frontend file; ~60–120 s full workspace suite |

---

## Sampling Rate

- **After every task commit:** Run the single-file `npx vitest run <path>` for whichever file(s) that task touched
- **After every plan wave:** Run `cd frontend && npx vitest run` (plus `cd backend && npx vitest run` if `mailer.js` was touched in that wave)
- **Before `/gsd:verify-work`:** `npm test --workspaces` must be green, run once from the repo root in the foreground to completion
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | REG-04 | — | Landing renders with no session, never reads/sets `authToken` (D-02) | composed (red first, D-12) | `cd frontend && npx vitest run src/pages/<composed>.test.jsx` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | REG-04, REG-06 | — | Pending user routed to stateless landing; Active user still gets `/dashboard` + stored token (D-01, D-13) | unit + composed | `cd frontend && npx vitest run src/pages/VerifyEmail.test.jsx src/pages/<composed>.test.jsx` | ✅ / ❌ W0 | ⬜ pending |
| 35-01-03 | 01 | 1 | REG-04 (SC-2/SC-4) | — | `Pending.jsx:9` `!user → /login` bounce unchanged; copy no longer says "approval" (D-03, D-07) | unit | `cd frontend && npx vitest run src/pages/Pending.test.jsx` | ✅ | ⬜ pending |
| 35-02-01 | 02 | 1 | INVITE-03 | — | Invited-path success copy says "verify, then sign in" (D-08); self-reg paragraph ~211-215 untouched | unit | `cd frontend && npx vitest run src/pages/Register.test.jsx` | ✅ | ⬜ pending |
| 35-02-02 | 02 | 1 | INVITE-03 | T-35-01 | Invitation email text + html no longer promise a review; static strings only, `escapeHtml` pattern kept (D-08) | unit | `cd backend && npx vitest run src/services/mailer.test.js` | ✅ (assertions to add) | ⬜ pending |
| 35-02-03 | 02 | 1 | REG-04 | T-35-01 | Shared verification email path-neutral, no signature change (D-09); resolver string untouched (D-10) | unit | `cd backend && npx vitest run src/services/mailer.test.js` | ✅ (`sendVerificationEmail` has zero coverage today — W0) | ⬜ pending |
| 35-03-01 | 03 | 2 | REG-04, REG-06, INVITE-03 | — | Mutation tests recorded (D-13): revert `VerifyEmail.jsx:25` → red; weaken copy assertions → red | mutation | `cd frontend && npx vitest run src/pages/<composed>.test.jsx` | ❌ W0 | ⬜ pending |
| 35-03-02 | 03 | 2 | SC-5 | — | Whole-stack gate green | full suite | `npm test --workspaces` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are provisional until the planner emits PLAN.md files; the planner must reconcile this table with its actual task list.*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/<composed>.test.jsx` — composed verify → landing test (D-11/D-12/D-13), written RED before the fix
- [ ] `frontend/src/pages/AwaitingApproval.test.jsx` (or planner's chosen name) — optional landing unit test (Claude's discretion)
- [ ] `backend/src/services/mailer.test.js` — new `sendVerificationEmail` describe block (zero coverage today) and updated `sendInvitationEmail` assertions
- [ ] No framework install needed — Vitest/RTL already configured in both workspaces

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rendered invitation/verification email reads correctly in a mail client | INVITE-03 | Template text is asserted automatically; visual rendering is not | Trigger an invitation from `/invite` against local Resend sandbox, open the email, confirm no "review/approve" wording |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
