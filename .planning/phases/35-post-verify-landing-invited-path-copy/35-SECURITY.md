---
phase: 35
slug: post-verify-landing-invited-path-copy
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-10
---

# Phase 35 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| anonymous visitor (post-verify, no session, single-use token already consumed) -> new public `/awaiting-approval` route | Reachable with zero authentication and zero prior state; must not leak anything or trust anything from the URL |
| anonymous visitor -> `/pending` (defence in depth, unchanged) | `Pending.jsx`'s `!user` guard remains the backstop this phase's SC-2 relies on |
| test harness -> real `AuthContext.AuthProvider` | The composed test mounts a real `AuthProvider`; `graphqlRequest` is the sole mocked boundary |
| backend mailer service -> outbound email content | `mailer.js` builds text/HTML an external mail client renders; this phase edits static string literals inside two templates |
| this phase's cumulative diff -> the resolver/schema/AuthContext boundary | D-10 requires the phase to prove it never crosses into authentication/authorization logic |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-35-01 | Tampering | `backend/src/services/mailer.js` `sendInvitationEmail`/`sendVerificationEmail` | mitigate | Both edits are static string literals with zero new interpolation. Independently re-verified: `git diff 876ec38..HEAD -- backend/src/services/mailer.js \| grep -c '^+.*escapeHtml('` → `0`; full diff shows exactly 4 string-literal replacements (text + note for sendInvitationEmail; text + intro for sendVerificationEmail), no other lines touched. Existing `escapeHtml(note)` call inside `sendInvitationEmail`'s html `intro` field is untouched — no existing XSS mitigation regressed. `mailer.test.js` (12 tests) run live and pass, including the new `not.toMatch(/review\|approv/i)` and `not.toMatch(/activate your account/i)` assertions | closed |
| T-35-02 | Information Disclosure | `frontend/src/pages/AwaitingApproval.jsx` | accept | Read the file in full (28 lines): zero hooks, zero props, zero imports of `useAuth`/`useSearchParams`/`useEffect`/`useState`, no per-viewer data ever read. Composed test `verifyLanding.composed.test.jsx` "renders the landing page on a direct hit with no session and zero network calls" asserts `expect(graphqlRequest).not.toHaveBeenCalled()` — run live, passes | closed |
| T-35-03 | Tampering / Repudiation | `VerifyEmail.jsx` single-use verification token vs. new route | mitigate | `AwaitingApproval.jsx` has no `useSearchParams`, reads no URL token, and calls no mutation — confirmed by full-file read. A refresh or second visit cannot re-fire the already-consumed `verifyEmail` mutation because the route never calls it | closed |
| T-35-04 | Spoofing / Elevation of Privilege | Direct unauthenticated hit on `/awaiting-approval` | accept | `frontend/src/App.jsx:29` registers `<Route path="awaiting-approval" element={<AwaitingApproval />} />` as a sibling of `pending`/`verify-email`, strictly before line 30's `<Route element={<ProtectedRoute />}>` wrapper — outside the protected block. No protected resource, mutation, or data read is reachable from the page | closed |
| T-35-05 | Elevation of Privilege | `Pending.jsx`'s `!user -> /login` guard | mitigate | `git diff 876ec38..HEAD -- frontend/src/pages/Pending.jsx` shows only the `AuthShell title` prop and body `Typography` text changed; lines 9-10 (`if (!user) return <Navigate to="/login" replace />;` and the dashboard-redirect guard) are outside the diff hunk, byte-identical. `Pending.test.jsx`'s "redirects to /login when user is null" (line 73) and the composed test's "bounces a no-session /pending hit to /login" (line 68) both exist and were run live — pass | closed |
| T-35-06 | Information Disclosure | `Register.jsx` invited-path copy edit | accept | `git diff 876ec38..HEAD -- frontend/src/pages/Register.jsx` shows exactly one paragraph's text changed (lines 310-311), no new reads, no new branching, no touch to the self-registration paragraph (~211-215) or the `{result ? (...) : (...)}` control flow — enumeration-silence property (SEC-01 / Phase 32 D-08) preserved | closed |
| T-35-07 | Repudiation | Grep sweep and full-suite gate results | mitigate | `35-03-SUMMARY.md` Task 1 records all 11 grep checks as a table (command, actual, expected, result) and Task 2 records the actual `npm test --workspaces` summary output verbatim, with a full count-reconciliation section that explicitly investigates and attributes two stale-baseline discrepancies (frontend 498→499, backend 648→650) via `git diff --stat`/`it()` counts rather than waving them off | closed |
| T-35-08 | Denial of Service | `npm test --workspaces` against the shared `portofolio_test` DB | accept | `35-03-SUMMARY.md`: "Run started 11:19:33, backend duration 393.34s, frontend duration 8.40s. No run was killed or retried." — single foreground run, matching the mitigation plan and the project's documented MariaDB-wedging risk | closed |
| T-35-SC | Tampering | npm/pip/cargo installs (appears identically in all three plans — treated as one threat) | accept | `git diff 876ec38..HEAD --stat -- package.json backend/package.json frontend/package.json package-lock.json` → empty output. Zero new packages across the entire phase | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**9/9 threats closed. 0 transfer dispositions in this phase.**

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| R-35-01 | T-35-02 | Information Disclosure: `AwaitingApproval.jsx` is intentionally stateless (D-02) — it renders identically for every visitor because it reads no session, no query params, and makes no network calls. There is no per-viewer data in scope to disclose. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-10 |
| R-35-02 | T-35-04 | Spoofing/EoP: the route is deliberately public (D-02); it exposes no protected resource, mutation, or data read, so there is nothing to elevate into. Verified: route sits outside `<Route element={<ProtectedRoute />}>` in `App.jsx`. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-10 |
| R-35-03 | T-35-06 | Information Disclosure: static copy change only on the invited-path success paragraph; no new user input read, no branching on account existence, preserving the enumeration-silence property Phase 32 D-08 established on the sibling self-registration branch (untouched by this phase). | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-10 |
| R-35-04 | T-35-08 | DoS: `npm test --workspaces` runs once, foreground, to completion — the documented mitigation for the MariaDB TRUNCATE-metadata-lock wedging risk (project memory: `mariadb-wedged-by-killed-vitest`). Confirmed via 35-03-SUMMARY.md's recorded single run with start time and per-workspace duration. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-10 |
| R-35-05 | T-35-SC | Supply-chain: zero new packages across the entire phase — confirmed via empty `git diff --stat` on all three `package.json` files and the lockfile. RESEARCH.md's Package Legitimacy Audit explicitly "not applicable" for all three plans. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-09-10 | 9 | 9 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-10

---

## Auditor Notes

- **Every mitigation independently re-verified against current HEAD, not trusted from SUMMARY.md narrative.** All `git diff`/`grep` commands cited above were re-run directly against `876ec38..HEAD` rather than copied from the plans' acceptance-criteria tables. `frontend/src/pages/AwaitingApproval.jsx`, `VerifyEmail.jsx`, `Pending.jsx`, `App.jsx`, and `backend/src/services/mailer.js` were read in full.
- **Live test evidence, not just static grep.** `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx src/pages/Pending.test.jsx src/pages/VerifyEmail.test.jsx src/pages/Register.test.jsx` → 4 files / 29 tests passed. `cd backend && npx vitest run src/services/mailer.test.js` (DB-independent — jsonTransport under `nodeEnv: 'test'`, confirmed no `sequelize`/`models`/`resetTables` import before running) → 1 file / 12 tests passed. The full backend suite was NOT run per the task's explicit constraint (killed-vitest MariaDB wedging risk); 35-03-SUMMARY.md's recorded `npm test --workspaces` foreground run (72 backend files/652 passed+3 skipped, 45 frontend files/504 passed) was accepted as the phase-level full-suite evidence for T-35-07/T-35-08 rather than re-run.
- **D-10 boundary re-confirmed phase-wide, independently.** `git diff 876ec38..HEAD --stat -- backend/src/resolvers backend/src/schemas frontend/src/context/AuthContext.jsx` → empty. Matches 35-03-SUMMARY.md's check 11 exactly.
- **No unregistered attack surface found.** `grep -n "Threat Flag" 35-0*-SUMMARY.md` across all three SUMMARY.md files returns no matches. The full phase diff (`git diff 876ec38..HEAD --stat`) touches exactly the files declared across the three plans' `files_modified` lists plus planning-doc/SUMMARY files — no surprise source file appeared.
- **Implementation files were read-only throughout this audit.** Only this file (`35-SECURITY.md`) was created; live test runs executed read-only, DB-independent test files.
