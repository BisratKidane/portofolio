---
phase: 33
slug: public-signup-form-approval-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-07
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `33-RESEARCH.md` § Validation Architecture. Per-task IDs are filled in by the planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (both workspaces) |
| **Config file** | `frontend/vitest.config.js` (`environment: 'jsdom'`, `setupFiles: ['./test/setup.js']`); `backend/vitest.config.js` |
| **Quick run command** | `npx vitest run src/pages/<File>.test.jsx` (frontend) · `npx vitest run src/resolvers/<file>.test.js` (backend) |
| **Full suite command** | `npm test --workspace frontend` · `npm test --workspace backend` · `npm test --workspaces` |
| **Estimated runtime** | frontend ~8s · backend ~6min (real MySQL) |

**Baseline verified 2026-09-07:** frontend 42 files / 441 tests green · backend 69 files / 556 passed + 3 skipped green.

---

## Sampling Rate

- **After every task commit:** the single most relevant `npx vitest run <file>` for the files touched.
- **After every plan wave:** full `npm test --workspace frontend` (~8s — cheap enough to run on every merge).
- **Backend suite:** at minimum once after the `pendingRegistrations` deletion task — the only backend-touching work in this phase.
- **Before `/gsd:verify-work`:** `npm test --workspaces` green.
- **Max feedback latency:** ~8s frontend, ~6min backend.

> **Do not run two test processes against the backend test database concurrently.** A SIGKILLed run leaves a `TRUNCATE` holding a metadata lock that blocks `globalSetup`'s `sync({ force: true })` indefinitely; symptom is a hang after the vitest banner with near-zero CPU.

---

## Per-Task Verification Map

Task IDs are assigned by the planner. Every task below must carry an `<automated>` verify block.

| Plan | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Wave 0 | REG-01 (D-04) | — | Client validation never accepts an input the server rejects | unit (cross-workspace agreement) | `npx vitest run src/pages/Register.validation.test.js` | ❌ W0 | ⬜ pending |
| form | REG-01 | — | `/register` with no token renders the 4-field public form | component | `npx vitest run src/pages/Register.test.jsx` | ✅ needs new `it()` | ⬜ pending |
| form | REG-04 | — | Success panel names the typed address and states both remaining steps | component | `npx vitest run src/pages/Register.test.jsx` | ✅ needs new `it()` | ⬜ pending |
| form | — (regression) | — | Invited-path `register` call shape unchanged | component | `npx vitest run src/pages/Register.test.jsx` | ✅ 2 existing `it()`s must pass with **zero** assertion changes | ⬜ pending |
| queue | APPR-02 | T-33-01 | Card shows name/email/note/registered-when; approve & reject call the right mutations | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ✅ fixtures retarget to flat `User` shape | ⬜ pending |
| queue | APPR-02 (SC-5) | — | Loading / empty / failed / populated are mutually exclusive | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ⚠️ NEW `it()` — no existing test covers the failure path | ⬜ pending |
| queue | SEC-03 (UI half) | T-33-02 | A note containing HTML renders as literal text, never as markup | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ❌ new `it()` | ⬜ pending |
| queue | — (regression) | — | `InvitationsPage.test.jsx` does not crash after the query swap | component | `npx vitest run src/pages/InvitationsPage.test.jsx` | ✅ mock must be updated in the **same task** as the query swap | ⬜ pending |
| cleanup | APPR-02 (D-10) | — | `pendingRegistrations` fully removed, no red tests left behind | integration | `npx vitest run src/resolvers/approveReject.test.js` (backend) | ✅ delete the `describe('pendingRegistrations query')` block and its 4 `it()`s | ⬜ pending |
| APPR-06 | APPR-06 | — | Approved, unlinked self-registrant lands on `/pending` | component | `npx vitest run src/pages/Pending.test.jsx` | ✅ **already covered** — no code path distinguishes self-registered from invited | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/Register.validation.js` — pure validator module (constants + functions), no test-framework dependency
- [ ] `frontend/src/pages/Register.validation.test.js` — the cross-workspace agreement test; **the single highest-value new test file in this phase**

### Why the agreement test is Wave 0 and not an afterthought

CONTEXT.md D-04 forbids hand-written client approximations of the server's rules. Phase 32's CR-01 was exactly that failure: a client-side email guard more permissive than the model validator, so malformed input fell through into a uniform success message. It shipped despite being TDD'd and mutation-tested, because **every test checked the guard against itself**.

`33-RESEARCH.md` empirically established (with a scratch test, this session) that a frontend Vitest file *can* import and execute the real `backend/src/utils/{emailPolicy,namePolicy,relationshipNotePolicy,passwordPolicy}.js` — including the transitive `validator` dependency, hoisted to root `node_modules` by npm workspaces.

The contract:

- The agreement test imports the **real backend policy modules** and asserts, over a table of inputs, that **client-accepts ⇒ server-accepts**. It must never re-implement either side.
- The cross-workspace import is **test-time only**. Never import backend code into a production bundle.
- This is continuous verification, not a one-off: the test runs on every future `npm test --workspace frontend` and fails the moment the frontend's duplicated thresholds (255 / 254 / 8 / 500) drift from the backend's real `assert*` functions.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card layout reads as scannable when the queue holds many people with long notes | APPR-02 / UI-SPEC | D-08 makes rows variable-height and untruncated; jsdom cannot judge visual density | Seed ~10 pending accounts, several with 400–500 char notes, and view `/approvals` |
| Signup form's four simultaneous inline errors don't read as a wall of red | REG-01 / UI-SPEC | Visual density judgement | Submit the form empty and inspect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, never bare `vitest`)
- [ ] Feedback latency < 10s for frontend tasks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
