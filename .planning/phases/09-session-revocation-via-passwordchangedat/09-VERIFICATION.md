---
phase: 09-session-revocation-via-passwordchangedat
verified: 2026-07-20T17:01:42Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 9: Session Revocation via passwordChangedAt Verification Report

**Phase Goal:** A password reset invalidates JWTs issued beforehand (session revocation via passwordChangedAt).
**Verified:** 2026-07-20T17:01:42Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The `User` model has a `passwordChangedAt` column, set only inside the existing `changed('passwordHash')`-guarded hook branch (untouched by `role`/`name` updates) | VERIFIED | `backend/src/models/User.js:45-49` declares `passwordChangedAt: { type: DataTypes.DATE(3), allowNull: true, defaultValue: null }`. `beforeUpdate` hook (lines 62-67) only sets `user.passwordChangedAt = new Date()` inside `if (user.changed('passwordHash'))`, alongside the existing bcrypt line — no separate hook, no resolver-level assignment. Regression tests in `backend/src/models/User.test.js:51-85` prove both the stamp-on-change and no-stamp-on-unrelated-field-change (`role`/`name`) cases. Full suite green. |
| 2 | `resetPassword` sets `passwordChangedAt = now()` when the password actually changes, via the model hook only — no resolver-level assignment | VERIFIED | `backend/src/resolvers/user.resolver.js:88-100` — `resetPassword` sets `user.passwordHash = password;` then calls `await user.save();`; no `passwordChangedAt` assignment appears anywhere in the resolver file (`grep -n passwordChangedAt backend/src/resolvers/user.resolver.js` returns zero matches). The stamp is produced exclusively by the `beforeUpdate` hook triggered by the `passwordHash` change, proven end-to-end by `backend/src/resolvers/sessionRevocation.test.js`. |
| 3 | A JWT whose `iat` predates `passwordChangedAt` is treated as unauthenticated by `getUserFromRequest` (protected resolvers see `null`) — mandatory same-second boundary test present | VERIFIED | `backend/src/utils/auth.js:9-28` — `getUserFromRequest` loads the user, then `if (user.passwordChangedAt) { const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime()/1000); if (payload.iat < changedAtSeconds) return null; }`, else returns the user; every failure path degrades to `null`, never throws. Mandatory unit tests in `backend/src/utils/auth.test.js:80-118` cover: same-second accept (the SC-3 pin), prior-second reject, and NULL-never-revokes (D-05). Supplementary HTTP-level end-to-end test `backend/src/resolvers/sessionRevocation.test.js` drives a real login → reset → same-second re-login → two `me` queries through the real Express/Apollo/DB stack and asserts the pre-reset token is rejected (`me` null) and the same-second post-reset token is honored (`me` not null). |
| 4 | A documented manual `ALTER TABLE` migration + README boot-and-verify procedure exist (human-confirmed against a real pre-existing dev DB) | VERIFIED | `backend/migrations/manual/009-add-password-changed-at.sql` contains `ALTER TABLE users ADD COLUMN passwordChangedAt DATETIME(3) NULL DEFAULT NULL;` with rationale comments (no-backfill, DATETIME(3) precision, manual/one-time). `README.md` has a `## Manual Database Migrations` section (line 181) with an `### Add passwordChangedAt to users (Phase 9 / SESS-01)` subsection naming the exact file and a 3-step apply/boot/verify procedure matching the plan's 6-step checkpoint. Per the task framing, the human-action checkpoint (Task 3 of 09-01-PLAN.md, `type="checkpoint:human-action" gate="blocking"`) was already confirmed during phase execution — this is an inherently non-grep-verifiable, one-time infrastructure action with no repo-level artifact trace beyond the documented procedure itself. |
| 5 | RESET-06: password-reset tokens are stored hashed (sha256) at rest, not plaintext | VERIFIED | `backend/src/utils/auth.js:43-45` — `export function hashResetToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }`. `requestPasswordReset` (`user.resolver.js:68`) stores `user.resetPasswordToken = hashResetToken(resetToken);` while still emailing the raw `resetToken` (line 72). `resetPassword` (`user.resolver.js:89`) looks up via `hashResetToken(token)`. `resetPassword.test.js` has an explicit pin test "never persists the raw/emailed reset token — only its hash is stored (RESET-06)" (lines 68-79) plus updated single-use/expiry/short-password fixtures seeded with `hashResetToken(...)`. `resetToken` remains absent from the GraphQL schema (`user.schema.js` `PasswordResetPayload` only has `message`), confirmed by the regression test "rejects querying the removed resetToken field" (`resetPassword.test.js:122-127`). CR-01's 250ms anti-enumeration timing-floor test (`resetPassword.test.js:91-120`) still passes. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/models/User.js` | `passwordChangedAt` DATE(3) column + guarded hook stamp | VERIFIED | Column + hook present exactly as specified; wired into `beforeUpdate`. |
| `backend/src/models/User.test.js` | Regression tests proving hook stamps only on real password changes | VERIFIED | `describe('beforeUpdate passwordChangedAt stamping hook (SESS-01)', ...)` — 2 tests, both pass. |
| `backend/migrations/manual/009-add-password-changed-at.sql` | Documented ALTER TABLE statement | VERIFIED | Exact statement present with rationale comments. |
| `README.md` | Manual Database Migrations section | VERIFIED | Section present, names the migration file, 3-step procedure. |
| `backend/src/utils/auth.js` | `hashResetToken` export + revocation check in `getUserFromRequest` | VERIFIED | Both present, wired, tested. |
| `backend/src/resolvers/user.resolver.js` | `requestPasswordReset`/`resetPassword` use hash-at-rest | VERIFIED | Both call sites confirmed via grep and direct read. |
| `backend/src/resolvers/resetPassword.test.js` | Updated fixtures/assertions proving hash-at-rest + regression coverage | VERIFIED | Hash-at-rest pin test, updated fixtures, CR-01 timing test, removed-field regression test all present and passing. |
| `backend/src/utils/auth.test.js` | Mandatory 3-test SESS-03 block (same-second accept, prior-second reject, NULL-never-revokes) | VERIFIED | All 3 tests present under `describe('getUserFromRequest — passwordChangedAt revocation (SESS-03)', ...)`. |
| `backend/src/resolvers/sessionRevocation.test.js` | Supplementary HTTP-level end-to-end proof | VERIFIED | File exists, exercises `httpClient()` through login/reset/re-login/`me`, asserts both directions of the boundary. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `User.js` `beforeUpdate` hook | `User.js` `passwordChangedAt` column | `changed('passwordHash')`-guarded `user.passwordChangedAt = new Date()` | WIRED | `grep -n -A3 "changed('passwordHash')" backend/src/models/User.js` shows both the bcrypt line and the stamp line inside the same `if` block. |
| `009-add-password-changed-at.sql` | `README.md` | README names the exact migration file path | WIRED | `009-add-password-changed-at.sql` appears in README's Manual Database Migrations section. |
| `user.resolver.js` `requestPasswordReset` | `auth.js` `hashResetToken` | `user.resetPasswordToken = hashResetToken(resetToken)` | WIRED | Confirmed at `user.resolver.js:68`; raw token still passed to `sendPasswordResetEmail` at line 72. |
| `user.resolver.js` `resetPassword` | `auth.js` `hashResetToken` | `findOne({ where: { resetPasswordToken: hashResetToken(token) } })` | WIRED | Confirmed at `user.resolver.js:89`. |
| `auth.js` `getUserFromRequest` | `user.passwordChangedAt` | `Math.floor(user.passwordChangedAt.getTime()/1000)` vs. `payload.iat`, strict `<`, null-guarded | WIRED | Confirmed at `auth.js:19-22`; consumed by Apollo `context()` in `server.js`, proven end-to-end by `sessionRevocation.test.js`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SESS-01 | 09-01 | `User` model gains `passwordChangedAt` column | SATISFIED | Column present, guarded stamp proven by test. REQUIREMENTS.md marked `[x]`. |
| SESS-02 | 09-01 | `resetPassword` sets `passwordChangedAt = now()` on password change | SATISFIED | No resolver-level assignment; hook-only stamp proven end-to-end. REQUIREMENTS.md marked `[x]`. |
| RESET-06 | 09-02 | Reset tokens stored hashed (sha256) at rest | SATISFIED | `hashResetToken` wired at both write and read sites; regression + pin tests pass. REQUIREMENTS.md marked `[x]`. |
| SESS-03 | 09-03 | JWT `iat` predating `passwordChangedAt` is unauthenticated, same-second boundary proven | SATISFIED | Revocation check + mandatory unit test + supplementary HTTP e2e test all present and passing. REQUIREMENTS.md marked `[x]`. |

No orphaned requirements found for Phase 9 in REQUIREMENTS.md's traceability table — all four IDs (RESET-06, SESS-01, SESS-02, SESS-03) map to Phase 9 and are accounted for by the three plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/utils/auth.js` | 16 | `await models.User.findByPk(...)` now runs inside the same `try/catch` used for JWT verification (09-REVIEW.md WR-01) | Info/Warning (carried from code review, not a phase-goal blocker) | A DB error during user lookup is silently converted to "unauthenticated" (`null`) rather than propagating as an infrastructure error. Fails safe (no unauthorized access), but is an observability regression not covered by any test. Does not affect any of this phase's required success criteria. |
| `backend/src/resolvers/user.resolver.js` | 88-99 | Reset-token consumption (`findOne` then `save()`) is not atomic (09-REVIEW.md WR-02) | Info/Warning (carried from code review, not a phase-goal blocker) | Concurrent requests using the same still-valid token could both pass validation before either writes, at odds with the "single-use" invariant under a race. The existing sequential single-use test does not exercise this race. Does not affect any of this phase's required success criteria (single-use is correctly enforced for sequential use, which is what's tested and what the roadmap requires). |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in any file modified by this phase. Both findings above were already surfaced by the phase's own code review (`09-REVIEW.md`, status `issues_found`, 0 critical / 2 warning / 2 info) and are reproduced here for traceability; they concern robustness/concurrency edge cases outside the phase's stated must-haves and roadmap success criteria, so they do not block phase completion but are worth tracking (e.g., as a fast-follow or Phase 10/11 note).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend test suite passes (includes all Phase 9 tests: `User.test.js`, `auth.test.js`, `resetPassword.test.js`, `sessionRevocation.test.js`) | `npm test --workspace backend` | 17 test files, 75 tests, all passed | PASS |
| Git commit hashes cited in all three SUMMARY.md files exist in history | `git cat-file -e <hash>` for all 8 cited hashes | All 8 present (`c7b6b40`, `ea9172a`, `b5351c0`, `9b190fd`, `9943fda`, `135b58f`, `ceabfb8`, `675abc5`) | PASS |
| TDD RED→GREEN commit ordering holds for each plan | `git log --oneline` | `test(09-01)` precedes `feat(09-01)`; `test(09-02)` precedes `feat(09-02)`; `test(09-03)` precedes `feat(09-03)` for both tasks | PASS |

### Probe Execution

Step 7c: SKIPPED (no `scripts/*/tests/probe-*.sh` files found in the repo, and neither PLAN nor SUMMARY for this phase reference any probe scripts — this phase is not a migration/CLI-tooling phase in that sense; its "migration" is a documented manual SQL file, not a probe-verified script).

### Human Verification Required

None. The one human-action checkpoint this phase required (Task 3 of `09-01-PLAN.md`: apply the manual migration and boot-verify against a real pre-existing dev database, ROADMAP SC-4) is a `type="checkpoint:human-action" gate="blocking"` task that pauses execution and requires the developer's live response before the plan can proceed — it is not a deferred end-of-phase item. Per the verification task framing ("this was confirmed during execution") and `09-01-SUMMARY.md`'s explicit record ("A human ran all 6 verification steps... reported 'confirmed' with all 6 steps passing"), this checkpoint was already resolved synchronously during phase execution, not left open for this verification pass.

### Gaps Summary

No gaps found. All four roadmap Success Criteria for Phase 9, all four requirement IDs (SESS-01, SESS-02, SESS-03, RESET-06), and all must-haves declared across the three plans' frontmatter are verified against the actual codebase — not merely SUMMARY.md claims. The backend test suite is green (75/75). Two pre-existing, already-documented code-review findings (WR-01: DB errors silently degrade to "unauthenticated"; WR-02: reset-token consumption is not atomic under concurrency) remain unresolved but fall outside this phase's stated must-haves and the roadmap's Success Criteria — they are reported here as informational/warning-level anti-patterns for tracking, not as blockers to phase completion.

---

_Verified: 2026-07-20T17:01:42Z_
_Verifier: Claude (gsd-verifier)_
