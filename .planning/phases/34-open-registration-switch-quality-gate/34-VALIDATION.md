---
phase: 34
slug: open-registration-switch-quality-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-09
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `34-RESEARCH.md` § Validation Architecture. Plan/task IDs are filled in by the planner; the wave column below reflects the research's recommended sequencing, not a final plan split.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (both workspaces) |
| **Backend config** | `backend/vitest.config.js` — `globalSetup: ['./test/globalSetup.js']`, `setupFiles: ['./test/setupRateLimit.js']`, `pool: 'forks'`, `fileParallelism: false`; sets `ENV_FILE=../env/test.env` and `NODE_ENV=test` at config-load time |
| **Frontend config** | `frontend/vitest.config.js` — `environment: 'jsdom'`, `setupFiles: ['./test/setup.js']` |
| **Backend DB harness** | `globalSetup.js` → `assertTestDatabase()` then `sequelize.sync({ force: true, match: /_test$/ })` |
| **Per-test reset** | `helpers.js` `resetTables()` — **must gain `app_settings` truncate + reseed (Wave 0)** |
| **Resolver harness** | `graphql(query, variables, user, clientIp)` — injects `contextValue.user` directly (`helpers.js:16-26`) |
| **HTTP harness** | `httpClient()` — supertest over `app` (`helpers.js:12`); **the only harness that runs `getUserFromRequest`** |
| **Quick run command** | `npx vitest run <file>` from `backend/` or `frontend/` |
| **Full suite command** | `npm test --workspace backend` (~6 min) · `npm test --workspace frontend` (~9 s) · `npm test --workspaces` (SC-5) |

**Baseline measured 2026-09-09 (serial, both green):** backend 69 files / 551 passed + 3 skipped in 348 s · frontend 43 files / 482 passed in 8.5 s. Workspace total 112 files / 1033 passed + 3 skipped.

The 3 skipped backend tests are pre-existing and unrelated to this phase — do not read their appearance as a regression introduced here.

> **Do not run two test processes against `portofolio_test` concurrently, and never background a full-suite run and then start another.** A SIGKILLed run leaves a `TRUNCATE` holding a metadata lock that blocks the next `globalSetup` `sync({ force: true })` indefinitely; the symptom is a hang right after the vitest banner at near-zero CPU, and `KILL` does not clear it (needs a full MariaDB stop / `pkill` / start ladder). The backend suite takes ~6 minutes: run it once, serially, and wait. **This binds harder than usual in this phase** — D-13's mutation script requires several full-file runs in sequence.

---

## Sampling Rate

- **After every task commit:** the single `npx vitest run <file>` for the file that task touched. Never a bare `vitest` (watch mode), never a full suite per task.
- **After every plan wave:** `npm test --workspace backend` **or** `npm test --workspace frontend` — whichever workspace the wave touched. One at a time.
- **Before `/gsd:verify-work`:** `npm test --workspaces` green.
- **Max feedback latency:** ~9 s frontend, ~6 min backend.

---

## Per-Task Verification Map

| Plan / Task | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(planner)* | 0 | ADMIN-01 (D-02) | Fail-open on failed config read | Accessor: `'true'`→open; `'false'`, garbage, absent row, throwing read →**closed** | unit | `cd backend && npx vitest run src/utils/appSettings.test.js` | ❌ W0 | ⬜ pending |
| *(planner)* | 1 | ADMIN-01 (D-01/D-03) | Missing audit trail on privileged state change | Flip persists; non-admin refused; audit row written with from→to | integration | `cd backend && npx vitest run src/resolvers/publicRegistrationSwitch.test.js` | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | ADMIN-02 (D-09) | Client-side-only enforcement | Tokenless `register` refused while closed, with the exact message | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | ADMIN-02 (D-08) | Business-logic regression | Invited `register` **still succeeds** while closed — the D-08 control | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | ADMIN-02 (D-07) | **Outer/inner guard divergence** | Five-state agreement table asserting **both** the absolute value and the agreement | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | ADMIN-02 (D-07) | **Outer/inner guard divergence** | Both paths call the **identical** accessor — `vi.spyOn` call-count, not behavioural equivalence | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | ADMIN-03 | Broken function-level authz | Admin-only `publicRegistrationSetting` refuses a non-admin | integration | `cd backend && npx vitest run src/resolvers/security.boundaries.test.js` | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-04 | Broken function-level authz | Non-admin refused on 9 admin operations | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-04 | Broken function-level authz | Anonymous tokenless register refused while closed | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-04 | False-green from a wrong-reason refusal | Admin positive controls — the same ops do **not** produce the admin-guard message | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-05 | Broken function-level authz (OWASP API1/API5) | Every non-allowlisted root field refuses a Pending token, **over `httpClient()`** | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-05 | Silent leak via a null-returning field | `Query.me` resolves to `null` (not an error) for a Pending token — **not allowlisted** | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-05 | Allowlist drift | Allowlist pinned to a literal sorted set | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 1 | SEC-05 | Non-GraphQL surface bypass | The three `/api/.../photo` routes return 401 for a Pending token | integration | same file | ❌ W1 | ⬜ pending |
| *(planner)* | 2 | ADMIN-01 (D-05) | — | Switch region renders; closes in one click; confirms on open | component | `cd frontend && npx vitest run src/components/PublicSignupSwitch.test.jsx` | ❌ W2 | ⬜ pending |
| *(planner)* | 2 | ADMIN-03 (D-06) | — | State + attribution rendered; all three attribution variants incl. the seeded-open case | component | same file | ❌ W2 | ⬜ pending |
| *(planner)* | 2 | ADMIN-02 (D-07) | — | `/register` shows the signup form when open, invitation-only when closed | component | `cd frontend && npx vitest run src/pages/Register.test.jsx` | ⚠️ exists — **migrated in W0** | ⬜ pending |
| *(planner)* | 2 | ADMIN-02 (D-07) | Two divergent "closed" messages | Mid-form refusal **re-queries** and swaps to the *same* message — never a string match on the error | component | same file | ❌ W2 | ⬜ pending |
| *(planner)* | — | — (regression) | — | Existing tokenless `register` tests still pass after the seeding change | regression | `cd backend && npx vitest run src/resolvers/register.test.js` | ✅ exists | ⬜ pending |
| *(planner)* | — | — (regression) | — | `InvitationsPage` still renders both existing regions | regression | `cd frontend && npx vitest run src/pages/InvitationsPage.test.jsx` | ✅ exists, needs a 1-line mock branch | ⬜ pending |
| *(planner)* | final | SC-5 | — | Whole workspace green | full suite | `npm test --workspaces` | ✅ baseline above | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/models/AppSetting.js` + registration in `backend/src/models/index.js` — the table must exist under `sync({ force: true })` before any test can seed it
- [ ] `backend/src/utils/appSettings.js` — `PUBLIC_REGISTRATION_KEY`, `isPublicRegistrationEnabled`, `seedDefaultAppSettings`
- [ ] `backend/test/globalSetup.js` — seed after `sync`
- [ ] `backend/test/helpers.js` — `resetTables()` truncates `app_settings` **and reseeds** (shared helper used by **44 test files**)
- [ ] `backend/src/utils/appSettings.test.js` — the accessor's five-state unit coverage
- [ ] `frontend/src/pages/Register.test.jsx` — migrate to a query-dispatching `mockImplementation` + `findBy*` **before** `Register.jsx` gains the loading gate (4 of 5 tests affected)
- [ ] `backend/migrations/manual/021-create-app-settings.sql` + README § Manual Database Migrations entry — no test, but it is the production half of the model

*No test-framework installation needed — both workspaces already on Vitest 4.1.10.*

### Why the seeding change is Wave 0 and not an afterthought

`globalSetup` runs `sync({ force: true })`, which creates `app_settings` but **not the seeded row**. D-02 says an absent row means *closed*. `register.test.js`'s ~25 tokenless tests all assume the door is open. Without a reseed inside `resetTables()`, a large slice of the existing suite goes red for reasons that have nothing to do with this feature — and the failure would look like the feature broke registration.

### Why the SEC-05 sweep must not use the `graphql()` helper

`helpers.js:16-26` injects `contextValue.user` directly, bypassing `getUserFromRequest` — which **is** the gate SEC-05 exists to prove. The sweep must run over `httpClient()` with a real `signToken(pendingUser)` Bearer header. SEC-04's non-admin matrix correctly uses the `graphql()` helper. Two harnesses in one file is deliberate; unifying them silently guts the proof.

### The discriminator that keeps the sweep from being vacuous

A GraphQL **validation** error is not proof of an authorization refusal — a sweep that accepts any error is vacuous. Measured against `@apollo/server` 4.13.0 (identical under `NODE_ENV=test` and `production`): a resolver-thrown guard error returns `INTERNAL_SERVER_ERROR` **with `path: [fieldName]`**; a validation failure returns `GRAPHQL_VALIDATION_FAILED` **with no `path`**. `path` is populated only during execution, so its presence is positive proof the resolver ran. Assert on `path`, not merely on the presence of an error.

---

## Mutation Testing (D-13 — every new boundary test proven red)

For each: apply the mutation, run the named command, **record the observed failure message**, restore, re-run green. "Confirmed red" without the message is the kind of good intention D-13 exists to replace.

| # | Mutation to apply | Command that must go RED | What it proves |
|---|-------------------|--------------------------|----------------|
| M1 | Delete the switch check from `register`'s tokenless branch | `npx vitest run src/resolvers/publicRegistrationSwitch.test.js` | ADMIN-02's server-side enforcement is actually tested |
| M2 | Replace `register`'s `isPublicRegistrationEnabled(models)` call with an inline `findByPk` that fails **open** on an absent row | same | The D-07 agreement test catches divergence, not just absence |
| M3 | Change the accessor's `catch` to `return true` | same | Proves the **absolute**-value assertion matters — the agreement assertion alone still passes here, because both sides agree on the wrong answer. **This is the mutation that would have caught 32-REVIEW.md CR-01.** |
| M4 | Remove `requireAdmin` from `pendingApprovals` | `npx vitest run src/resolvers/security.boundaries.test.js` | The sweep genuinely detects a missing guard |
| M5 | Remove `requireAdmin` from the flip mutation | same | SEC-04 covers the new mutation |
| M6 | Change `auth.js:33` to let `Pending` through | same | The sweep proves the chokepoint's **reach**, which is SEC-05's actual claim |
| M7 | Add a new unguarded root field to the schema + resolver **without touching the allowlist** | same | The sweep inverts the default — a forgotten guard fails on day one (D-12's whole purpose) |
| M8 | Remove `seedDefaultAppSettings` from `resetTables()` | `npx vitest run src/resolvers/register.test.js` | Confirms the Wave 0 seeding is load-bearing, not incidental |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Switch region visual sign-off against `34-UI-SPEC.md` | ADMIN-01 / ADMIN-03 | jsdom has no layout or computed colour — spacing, the 14px radius, `Switch` thumb/track colour and icon tint are not observable | Sign in as ADMIN, open `/invitations`, compare against the UI-SPEC in both OPEN and CLOSED states |
| Production deployment of migration 021 | ADMIN-01 | Only a real deploy proves migration/model parity against a non-test database | Apply `021-create-app-settings.sql` → boot → `/health` → open `/invitations` and confirm the state line reads OPEN with the seeded-open attribution variant |
| The genuine mid-form race | ADMIN-02 (D-07) | The component test proves the re-query-and-swap logic; only a human proves the felt behaviour | Two browser sessions: a visitor part-way through `/register` while an admin closes the door, then submit |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (accessor, model, seeding, `Register.test.jsx` migration)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency < 10 s for frontend tasks
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** derived from research 2026-09-09; per-task IDs pending planner
