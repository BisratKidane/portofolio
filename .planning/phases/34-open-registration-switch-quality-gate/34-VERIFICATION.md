---
phase: 34-open-registration-switch-quality-gate
verified: 2026-09-09T15:54:02Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 34: Open-Registration Switch & Quality Gate Verification Report

**Phase Goal:** The door can be closed — an admin turns public signup off from inside the app and the server refuses tokenless registration — and the security boundaries of the whole milestone are proven by adversarial tests against the resolvers, with the full workspace suite green.
**Verified:** 2026-09-09T15:54:02Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An admin turns public signup off from inside the app; a tokenless `register` call is refused server-side; `/register` returns to the invitation-only message | VERIFIED | `frontend/src/components/PublicSignupSwitch.jsx` (Switch wired to `setPublicRegistrationEnabled`) → `backend/src/resolvers/setting.resolver.js` (requireAdmin, in-transaction upsert+audit) → `backend/src/resolvers/user.resolver.js:216-219` (door check is the literal first statement of `register`'s tokenless branch, before `assertPasswordStrength`, before any DB read/write) → `frontend/src/pages/Register.jsx:159-224` (`!token` branch renders `renderInvitationOnly()` when `publicOpen === false`, re-queries and swaps on a refused submit). Confirmed by running `security.boundaries.test.js`'s "anonymous, door closed: tokenless register is refused with the exact closed-door message" test live: PASS. |
| 2 | The current on/off state is visible to admins wherever they can change it | VERIFIED | `PublicSignupSwitch.jsx` renders "Public signup is open/closed" plus `describeAttribution()` ("Opened/Closed by {actor} on {date}") directly above the `Switch`, sourced from `publicRegistrationSetting` (admin-only query, `enabled` derived only through `isPublicRegistrationEnabled`). Wired into `InvitationsPage.jsx` as the first admin-only region, above `InvitePage`/`ApprovalsPage`. `InvitationsPage.test.jsx` asserts the switch renders for admins and not for non-admins — ran live: PASS. |
| 3 | Adversarial tests prove a non-admin cannot invite, approve, or reject, and cannot register tokenless while the switch is off | VERIFIED | `backend/src/resolvers/security.boundaries.test.js` — `SEC-04` describe blocks: 11-cell non-admin matrix (`createInvitation`, `approveUser`, `rejectUser`, `setUserPassword`, `pendingApprovals`, `myInvitations`, `invitations`, `linkUserToMember`, `deleteMember`, `publicRegistrationSetting`, `setPublicRegistrationEnabled`) × admin positive controls, plus 3 tokenless-door tests (anonymous+closed refused, invited-token+closed still succeeds (D-08), admin-self+closed still refused — "the switch is not a permission"). Ran the file live: **58/58 passed**. |
| 4 | A self-registered account cannot reach any authenticated resolver until both gates pass — proven against the resolvers, not just the client-side route guard | VERIFIED | Same file, `SEC-05` describe blocks: schema-driven sweep over the real SDL (`buildSchema(typeDefs.join('\n'))`) enumerates every `Query`/`Mutation` root field (14+21=35), excludes a pinned 7-name public allowlist, executes the remaining 28 over real HTTP (`httpClient()` + `Authorization: Bearer signToken(pending)`) so `getUserFromRequest` genuinely runs — asserts `AUTH_ERROR` and `errors[0].path === [fieldName]` (proves the field's own resolver ran). `Query.me` asserted explicitly as a third, null-resolving category. Three non-GraphQL `/api/family-members/:id/photo` routes asserted to return 401 for the same Pending JWT. Ran the file live: included in the same 58/58 pass. |
| 5 | `npm test --workspaces` is green | VERIFIED | Orchestrator's gate log at current HEAD (`71e79b0`, one docs commit behind current `7c4929d`) — `/private/tmp/.../scratchpad/postfix-gate.log`: `npm run build` OK; backend 72 files / 650 passed / 3 skipped; frontend 44 files / 499 passed; exit 0. Independently re-ran the specific new/modified test files for this phase (`security.boundaries.test.js`, `publicRegistrationSwitch.test.js`, `appSettings.test.js`, `PublicSignupSwitch.test.jsx`, `Register.test.jsx`, `InvitationsPage.test.jsx`) directly in this verification session — all green, matching counts. `git status --porcelain` clean (only pre-existing untracked `.vscode/`). |

**Score:** 5/5 roadmap success criteria verified

### Plan-Level Must-Haves (Selected Deep Checks)

| # | Truth (source plan) | Status | Evidence |
|---|---|---|---|
| 6 | `models.AppSetting.findByPk` has exactly ONE production call site (34-01) | VERIFIED | `grep` confirms the only production call site is `getPublicRegistrationSettingRow` in `backend/src/utils/appSettings.js:50`; `setting.resolver.js` calls `getPublicRegistrationSettingRow`/`isPublicRegistrationEnabled`, never `findByPk` directly. |
| 7 | Both public and admin queries resolve `enabled` through the identical `isPublicRegistrationEnabled` function, proven by call-count spy (D-07 Layer 2/3) (34-05) | VERIFIED | `publicRegistrationSwitch.test.js` "Layer 2 — shared call-site proof" (`vi.spyOn(appSettings, 'isPublicRegistrationEnabled')`, asserts call counts 1/2/3) and "Layer 3 — five-state agreement table" (asserts both agreement AND the absolute value across true/false/garbage/absent/throwing states). Ran live: included in 26/26 pass for this file. |
| 8 | CR-01 (unlocked read-then-write race in the flip mutation), WR-01 (two-read payload race), WR-02 (dialog dismiss paths not disabled while busy) from 34-REVIEW.md are actually fixed in code, not just claimed fixed | VERIFIED | Read the current `setting.resolver.js`/`appSettings.js` source directly: the flip mutation now reads `previous` via `isPublicRegistrationEnabled(models, { transaction: t, lock: t.LOCK.UPDATE })` inside the transaction (CR-01 fix present); `buildPublicRegistrationSettingPayload` wraps both reads + actor lookup in one `sequelize.transaction` (WR-01 fix present); `PublicSignupSwitch.jsx`'s `Dialog` has `onClose={busy ? undefined : ...}`, `disableEscapeKeyDown={busy}`, and `<Button disabled={busy}>Keep it closed</Button>` (WR-02 fix present). Regression test added by the addendum commit (`09d0bdc`, transactional-read-failure rollback) ran live and passed. |
| 9 | D-13 mutation-testing record (M1–M8) genuinely proves each new boundary test can fail (34-08) | VERIFIED (evidence-consistent) | `34-08-SUMMARY.md`'s D-13 table cites specific line numbers and verbatim assertion failures; spot-checked cited line numbers (195, 394, 418, 446 in the relevant test files) against the current file contents — all land on the exact assertions described. `git status --porcelain` at session start showed zero leftover mutation (only pre-existing untracked `.vscode/`), consistent with the claimed restore. Direct in-repo mutation of a guard was attempted for independent confirmation but blocked by the sandbox's write-classifier; relied instead on the SUMMARY's highly specific, line-accurate, internally-consistent record plus live re-execution of the resulting (restored) test files, all green. |

**Combined score:** 9/9 must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/manual/021-create-app-settings.sql` | Generic key/value `app_settings` table, seeded OPEN, idempotent | VERIFIED | Present; `settingKey` PK (reserved-word-safe naming), `ON DUPLICATE KEY UPDATE settingKey = settingKey` no-op seed. Human-approved applied against real dev DB (34-09 Task 2, "A"). Production (Hetzner) apply explicitly deferred by developer choice — not a phase blocker. |
| `backend/src/models/AppSetting.js` | Sequelize model matching migration byte-for-byte | VERIFIED | `STRING(64)` PK, `STRING(255)` value, `updatedById` INTEGER.UNSIGNED nullable — matches migration column widths. |
| `backend/src/utils/appSettings.js` | Single shared fail-closed predicate (D-07 Layer 1) | VERIFIED | `isPublicRegistrationEnabled`, `getPublicRegistrationSettingRow`, `seedDefaultAppSettings`, `PUBLIC_REGISTRATION_KEY` exported; only one findByPk call site; options passthrough for CR-01's locked in-transaction read. |
| `backend/src/schemas/setting.schema.js` + `backend/src/resolvers/setting.resolver.js` | Public unauthenticated read, admin-only attributed read, admin-only flip mutation | VERIFIED | Wired into `schemas/index.js` and `resolvers/index.js` barrels. `publicRegistrationEnabled` unguarded (D-07); `publicRegistrationSetting`/`setPublicRegistrationEnabled` both call `requireAdmin` first. |
| `backend/src/resolvers/user.resolver.js` (register) | Door check is the tokenless branch's first statement | VERIFIED | Lines 216-219: `if (!token) { if (!(await isPublicRegistrationEnabled(models))) throw ... }` — precedes `assertPasswordStrength`, the invited-branch lookup, and all writes/emails. |
| `frontend/src/components/PublicSignupSwitch.jsx` | Admin control: state+attribution, asymmetric friction (instant close / confirm open) | VERIFIED | `handleChange` flips directly on close, opens `confirmOpen` dialog on open; dialog dismiss paths disabled while `busy` (WR-02 fix present). |
| `frontend/src/pages/InvitationsPage.jsx` | Switch as third region, admin-only, no new route | VERIFIED | `PublicSignupSwitch` rendered conditionally on `isAdmin`, stacked above `InvitePage`/`ApprovalsPage`; no route/nav changes. |
| `frontend/src/pages/Register.jsx` | Tokenless branch gated on `publicRegistrationEnabled`, single invitation-only view, re-query-on-refusal swap | VERIFIED | `renderInvitationOnly()` defined once, called from both the initial-closed branch and the mid-form-refusal catch; invited branch (`token` truthy) is completely ungated. |
| `backend/src/resolvers/security.boundaries.test.js` | SEC-04 matrix + SEC-05 schema-driven sweep, one file | VERIFIED | 496 lines; 58 tests; ran live, 58/58 passed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `PublicSignupSwitch.jsx` | `setPublicRegistrationEnabled` mutation | `graphqlRequest(SET_PUBLIC_REGISTRATION, {enabled})` in `flip()` | WIRED | Response drives a `load()` re-fetch; `enabled` never set from local intent. |
| `InvitationsPage.jsx` | `PublicSignupSwitch` | direct import + conditional render on `isAdmin` | WIRED | Confirmed via `InvitationsPage.test.jsx` live run. |
| `Register.jsx` | `publicRegistrationEnabled` query | `graphqlRequest(PUBLIC_REGISTRATION_ENABLED_QUERY)` in mount effect + post-refusal re-query | WIRED | Fails closed on rejected read (`.catch(() => setPublicOpen(false))`); re-query on refused submit swaps view without string-matching the server's message. |
| `register` resolver (tokenless) | `isPublicRegistrationEnabled(models)` | direct call, first statement | WIRED | Confirmed by reading source; confirmed behaviorally by the D-07 Layer 2 call-count spy test (passed live). |
| `setPublicRegistrationEnabled` mutation | `writeAuditLog` | same transaction (`{ transaction: t }`) | WIRED | Audit row written inside the same `sequelize.transaction` as the upsert; CR-01 fix confirms the locked read makes the `from` value accurate under concurrency (regression test passed live). |
| `security.boundaries.test.js` (SEC-05) | `getUserFromRequest` chokepoint | `httpClient()` + real `Authorization: Bearer` header, not the `graphql()` context-injection helper | WIRED | File's own header comment documents why `graphql()` would be wrong here; verified this distinction is honored by reading the harness usage in both describe blocks. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `PublicSignupSwitch.jsx` | `setting` (enabled/updatedAt/updatedByName) | `publicRegistrationSetting` query → `buildPublicRegistrationSettingPayload` → real DB row + `models.User.findByPk` for actor name | Yes — real Sequelize reads, no static/empty fallback | FLOWING |
| `Register.jsx` | `publicOpen` | `publicRegistrationEnabled` query → `isPublicRegistrationEnabled(models)` → real `AppSetting.findByPk` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SEC-04/SEC-05 adversarial proof file passes in isolation | `cd backend && npx vitest run src/resolvers/security.boundaries.test.js` | 1 file, 58 tests passed | PASS |
| D-07 three-layer guard-agreement proof passes in isolation | `cd backend && npx vitest run src/resolvers/publicRegistrationSwitch.test.js src/utils/appSettings.test.js` | 2 files, 41 tests passed | PASS |
| Frontend switch + register-gate + invitations-page tests pass in isolation | `cd frontend && npx vitest run src/components/PublicSignupSwitch.test.jsx src/pages/Register.test.jsx src/pages/InvitationsPage.test.jsx` | 3 files, 25 tests passed | PASS |
| Full workspace suite is green (SC-5) | orchestrator's `npm run build && npm test --workspaces` at HEAD 71e79b0 (cited log) | backend 72/650+3skip, frontend 44/499, exit 0 | PASS (cited, not re-run in full — targeted files independently re-verified above) |
| Exactly one production `AppSetting.findByPk` call site | `grep -rn "findByPk" backend/src --include=*.js \| grep -v .test.js` | one match, in `appSettings.js` | PASS |
| No debt markers (TBD/FIXME/XXX) in phase-touched files | `grep -nE "TBD|FIXME|XXX" <20 phase files>` | no matches | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| ADMIN-01 | 34-01, 34-03, 34-04, 34-07, 34-08, 34-09 | Admin can turn public self-registration on/off from inside the app, no redeploy | SATISFIED | `PublicSignupSwitch.jsx` + `setPublicRegistrationEnabled` mutation, durable `app_settings` row, no env var involved. |
| ADMIN-02 | 34-01, 34-02, 34-05, 34-06, 34-07, 34-08, 34-09 | `/register` shows invitation-only message and mutation rejects tokenless registration while off | SATISFIED | `Register.jsx` gate + `register` resolver's first-statement door check; both confirmed live via tests. |
| ADMIN-03 | 34-03, 34-04, 34-07, 34-09 | Current on/off state visible to admins wherever they change it | SATISFIED | `PublicSignupSwitch.jsx`'s state+attribution line, rendered in `InvitationsPage.jsx`. |
| SEC-04 | 34-07, 34-08, 34-09 | Adversarial tests prove non-admin cannot invite/approve/reject/flip, and cannot register tokenless while off | SATISFIED | `security.boundaries.test.js` SEC-04 blocks, 58/58 passing including the tokenless-door-closed cases. |
| SEC-05 | 34-07, 34-08, 34-09 | Self-registered account cannot reach any authenticated resolver until both gates pass, proven against resolvers | SATISFIED | `security.boundaries.test.js` SEC-05 schema-driven sweep (28 root fields) + `me` null-case + 3 photo-route cells, all via real HTTP + real JWT. |

No orphaned requirements: REQUIREMENTS.md maps exactly ADMIN-01, ADMIN-02, ADMIN-03, SEC-04, SEC-05 to Phase 34, and all five appear in at least one plan's `requirements:` frontmatter field.

### Anti-Patterns Found

None. Scanned all 20 files reviewed in `34-REVIEW.md` for `TBD|FIXME|XXX|TODO|HACK|placeholder|coming soon|not yet implemented`, empty-implementation patterns, and hardcoded-empty-data patterns. Only matches were legitimate null-guards in `formatWhen()` (`if (!value) return null`), not stubs.

### Human Verification Required

None outstanding. The phase's three human-verify items (34-09-PLAN.md Task 2, `checkpoint:human-verify gate="blocking"`) were presented verbatim to the developer and resolved with an explicit recorded response ("approved" for all three; "Deferred" for the separate production-migration-apply question):

- **A. Migration 021 applied to a real (non-test) database** — APPROVED by developer.
- **B. Visual sign-off of the switch region against 34-UI-SPEC.md in a real browser** — APPROVED by developer.
- **C. The genuine mid-form race across two browser sessions** — APPROVED by developer.
- Production apply of migration 021 to Hetzner — explicitly DEFERRED by developer as a separate operator step before milestone close (not a phase blocker; consistent with Phase 30's F-03 precedent for its own migration 019).

This verifier treats the recorded developer response as genuine human sign-off evidence (a quoted, timestamped human decision captured by the executor), not an agent's self-assessment, and does not re-open these as pending.

### Gaps Summary

No gaps found. All five roadmap success criteria are verified against running code and passing tests, not SUMMARY narrative alone. The one code-review-flagged critical issue (CR-01, TOCTOU race in the flip mutation's audit history) and two warnings (WR-01 read-consistency race, WR-02 dialog dismiss-while-busy) were independently confirmed fixed by reading the current source — not merely trusting the fix report — and their regression tests were re-run live and pass. The milestone's recurring authz/TOCTOU defect class was specifically probed: the door-check ordering (D-09), the shared-predicate single-source-of-truth (D-07 Layers 1-3), and the SEC-05 chokepoint-reach sweep were all read at the source level and exercised live, not accepted from narrative.

One item is noted for completeness rather than as a gap: this verifier could not independently re-run the D-13 mutation-testing protocol itself (source-mutation write attempts were blocked by the sandbox's auto-mode classifier). Confidence in the D-13 record rests on: (a) its unusually specific, line-accurate, internally cross-checked reporting (verified against current file line numbers), (b) a clean `git status` consistent with full restoration, and (c) live re-execution of the resulting (restored) test files, all green. This is documented, not treated as a blocker.

---

_Verified: 2026-09-09T15:54:02Z_
_Verifier: Claude (gsd-verifier)_
