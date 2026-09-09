---
phase: 34
slug: open-registration-switch-quality-gate
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-09
---

# Phase 34 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| anonymous visitor -> `Mutation.register` (tokenless) | The public internet crosses here; `isPublicRegistrationEnabled` is the only thing that can close it | none (control-flow decision only) |
| client's `publicRegistrationEnabled` answer -> server's check inside `register` | Outer and inner guard on ONE predicate — the phase's headline risk (D-07) | boolean door state |
| authenticated non-admin -> admin-only resolvers (`publicRegistrationSetting`, `setPublicRegistrationEnabled`, invite/approve/reject) | `requireAdmin` is the only authority | admin actions, attribution (actor name/timestamp) |
| operator/deploy pipeline -> MySQL schema | Migration 021 is applied by hand; `sequelize.sync()` auto-creates an empty `app_settings` if forgotten | schema DDL |
| Pending self-registrant's real JWT -> every authenticated surface | `getUserFromRequest` (`auth.js:9`) is the chokepoint | JWT bearer token |
| test process -> `portofolio_test` | `resetTables()` is shared by 44+ test files | seeded fixture rows |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-34-01-A | Elevation of Privilege | `utils/appSettings.js` `isPublicRegistrationEnabled` | mitigate | Fail-closed on absent row and on throwing read; strict `=== 'true'` — `appSettings.js:71-91` | closed |
| T-34-01-B | Elevation of Privilege | `models/index.js` `initializeDatabase()` | mitigate | `seedDefaultAppSettings` never called at boot — grep for the symbol in `models/index.js` returns zero matches | closed |
| T-34-01-C | Tampering | migration 021 vs `AppSetting.js` | mitigate | `STRING(64)`/`STRING(255)` mirrors `VARCHAR(64)`/`VARCHAR(255)` byte-for-byte, no `COLLATE` in either — `AppSetting.js:17-18`, `021-create-app-settings.sql:35-36` | closed |
| T-34-01-D | Information Disclosure | accessor's catch block | mitigate | `console.error('Failed to read public-registration setting:', err?.name, err?.message)` — never the raw error object — `appSettings.js:89` | closed |
| T-34-01-E | Denial of Service | `resetTables()` | accept | See Accepted Risks Log R-34-01 | closed |
| T-34-01-F | Elevation of Privilege | second `AppSetting.findByPk` call site | mitigate | `getPublicRegistrationSettingRow` is the ONLY production call site — `grep -rn "findByPk" backend/src --include="*.js" \| grep -v .test.js` → single match, `appSettings.js:50` | closed |
| T-34-01-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks Log R-34-02 | closed |
| T-34-02-A | Tampering | `Register.test.jsx` mock harness | mitigate | Query-text dispatch replaces every `Once` chain — `grep -c "Once(" frontend/src/pages/Register.test.jsx` → 0; dispatcher at `Register.test.jsx:20-31` | closed |
| T-34-02-B | Elevation of Privilege | invited registration path (D-08) | mitigate | Synchronous-render assertion + `publicRegistrationEnabled` never called on invited path — `Register.test.jsx:109-120` | closed |
| T-34-02-C | Spoofing | empty-form negative assertion | mitigate | Narrowed to "the register mutation was never called" — `Register.test.jsx:138-156` | closed |
| T-34-02-SC | Tampering | npm installs | accept | See Accepted Risks Log R-34-03 | closed |
| T-34-03-A | Elevation of Privilege | `Mutation.setPublicRegistrationEnabled` | mitigate | `requireAdmin(user)` literal first statement — `setting.resolver.js:60`; asserted unauthenticated + non-admin — `publicRegistrationSwitch.test.js:148-158`; SEC-04 cell `security.boundaries.test.js:182-186,190-197`; mutation M5 in 34-08-SUMMARY.md | closed |
| T-34-03-B | Elevation of Privilege | `Query.publicRegistrationSetting` | mitigate | `requireAdmin(user)` — `setting.resolver.js:54`; `publicRegistrationSwitch.test.js:137-146` (exact messages pinned) | closed |
| T-34-03-C | Elevation of Privilege | `Query.publicRegistrationEnabled` deriving `enabled` | mitigate | Resolves through `isPublicRegistrationEnabled(models)` only — `setting.resolver.js:49-51`; `grep -n "row.value" backend/src/resolvers/*.js` → matches only inside a comment, never live code | closed |
| T-34-03-D | Repudiation | privileged state change with no trace | mitigate | `writeAuditLog` inside the SAME transaction — `setting.resolver.js:105-113`; atomicity proven by injected `AuditLog.create` rejection rolling back the flip — `publicRegistrationSwitch.test.js:250-263`; CR-01 in-transaction read-failure rollback (no fabricated audit row) — `publicRegistrationSwitch.test.js:265-282` | closed |
| T-34-03-E | Information Disclosure | attribution on a public surface | mitigate | Two root fields; public query returns bare `Boolean!`, no attribution keys — `setting.schema.js:11-20`; `publicRegistrationSwitch.test.js:160-165` asserts `Object.keys(data)` is exactly `['publicRegistrationEnabled']` | closed |
| T-34-03-F | Tampering | flip against a database with no settings row | mitigate | `upsert`, not `update` — `setting.resolver.js:88-91`; `publicRegistrationSwitch.test.js:238-248` (absent row gets created) | closed |
| T-34-03-G | Elevation of Privilege | second `AppSetting.findByPk` in attribution payload | mitigate | `buildPublicRegistrationSettingPayload` reads via `getPublicRegistrationSettingRow`, never `findByPk` directly — `setting.resolver.js:21-40`; single-call-site grep (same as T-34-01-F) still holds after CR-01/WR-01 changes | closed |
| T-34-03-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks Log R-34-04 | closed |
| T-34-04-A | Elevation of Privilege | `PublicSignupSwitch` flip | mitigate | Component only sends `setPublicRegistrationEnabled` — `PublicSignupSwitch.jsx:32,86`; authority proven server-side by SEC-04 cell | closed |
| T-34-04-B | Spoofing | rendered switch position | mitigate | `checked` reads only `setting.enabled` — `PublicSignupSwitch.jsx:69,174`; failed flip returns thumb to server position — `PublicSignupSwitch.test.jsx:123-139` | closed |
| T-34-04-C | Information Disclosure | attribution shown to a non-admin | mitigate | Region wrapped in `isAdmin &&` — `InvitationsPage.jsx:18-23`; non-admin sees no "Public signup" text — `InvitationsPage.test.jsx:29-37` | closed |
| T-34-04-D | Denial of Service (self-inflicted) | closing during a spam wave | mitigate | `handleChange` flips directly with no dialog on the closing branch — `PublicSignupSwitch.jsx:105-111`; only `Dialog` in the file is gated by `confirmOpen`, set only on the opening branch; `PublicSignupSwitch.test.jsx:84-96` asserts no `role="dialog"` on close | closed |
| T-34-04-E | Repudiation | admin cannot tell what state the door is in | mitigate | Headline text + lock icon + tooltip carry state independently of colour, no `Switch` rendered until resolved — `PublicSignupSwitch.jsx:135-179`; `PublicSignupSwitch.test.jsx:58-82` (D-06 variants) | closed |
| T-34-04-SC | Tampering | npm installs | accept | See Accepted Risks Log R-34-05 | closed |
| T-34-05-A | Elevation of Privilege | client-side-only enforcement | mitigate | Refusal thrown by the resolver, not the client — `user.resolver.js:216-219`; five-state table + SEC-04 independent proof | closed |
| T-34-05-B | Elevation of Privilege | outer/inner guard divergence | mitigate | Single import of `isPublicRegistrationEnabled` in `user.resolver.js:22` (comment pins "the ONLY import"); Layer 2 call-count spy — `publicRegistrationSwitch.test.js:338-370`; Layer 3 five-state table — `:373-451` | closed |
| T-34-05-C | Elevation of Privilege | fail-open on a failed config read | mitigate | Layer 3 "row absent"/"read throws" rows assert `false` AND the exact door message — `publicRegistrationSwitch.test.js:409-426,441-445` | closed |
| T-34-05-D | Information Disclosure | enumeration-silence regression | mitigate | Door check sits strictly above the uniform-response machinery — `user.resolver.js:216-222` precedes `assertPasswordStrength`/lookups; D-09 zero-side-effect test — `publicRegistrationSwitch.test.js:481-503` | closed |
| T-34-05-E | Business Logic | closing voids issued invitations | mitigate | Door check nested inside `if (!token)`, invited branch (`if (token)`) always returns before it — `user.resolver.js:216-287`; D-08 control — `publicRegistrationSwitch.test.js:466-479` | closed |
| T-34-05-F | Business Logic | closing strands the approval queue | mitigate | D-10 control — `publicRegistrationSwitch.test.js:548-566` (Pending user created before close still visible/approvable) | closed |
| T-34-05-G | Spoofing | refusal passing for the wrong reason | mitigate | Door check precedes `assertPasswordStrength` — `user.resolver.js:216-222`; positive ordering test — `publicRegistrationSwitch.test.js:520-534` | closed |
| T-34-05-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks Log R-34-06 | closed |
| T-34-06-A | Elevation of Privilege | client-side-only enforcement | accept (server is the gate) | See Accepted Risks Log R-34-07 | closed |
| T-34-06-B | Elevation of Privilege | outer/inner guard divergence at the tier boundary | mitigate | `grep -n "\.message\.includes\|\.message\.match\|\.message ===" frontend/src/pages/Register.jsx frontend/src/components/PublicSignupSwitch.jsx` → 0 matches; re-query-and-swap — `Register.jsx:122-131`; test proving rewording is irrelevant — `Register.test.jsx:335-361` | closed |
| T-34-06-C | Information Disclosure | timing leak about an administrative action | mitigate | Single `renderInvitationOnly()` definition used by both the initial-closed branch and the mid-form swap — `Register.jsx:144-183`; byte-identical assertion — `Register.test.jsx:290-295` | closed |
| T-34-06-D | Spoofing | asserting a state before it is known | mitigate | `publicOpen === null` renders spinner only, no chrome — `Register.jsx:167-179`; test — `Register.test.jsx:201-211` | closed |
| T-34-06-E | Denial of Service | invited registration blocked by a failed public read | mitigate | Query guarded on `!token` — `Register.jsx:34-39`; D-08 synchronous regression test — `Register.test.jsx:109-120` | closed |
| T-34-06-F | Business Logic | network failure silently opening the door | mitigate | `.catch(() => setPublicOpen(false))` — `Register.jsx:38`; test — `Register.test.jsx:251-262` | closed |
| T-34-06-SC | Tampering | npm installs | accept | See Accepted Risks Log R-34-08 | closed |
| T-34-07-A | Elevation of Privilege | broken function-level authorization | mitigate | Deny-by-default `PUBLIC_ALLOWLIST` — `security.boundaries.test.js:353-379`; mutations M4/M7 in 34-08-SUMMARY.md turn the sweep red | closed |
| T-34-07-B | Elevation of Privilege | wrong harness for SEC-05 | mitigate | `httpClient()` + real `signToken(pending)` header used exclusively in SEC-05 block — `security.boundaries.test.js:403-406`; `awk`-scoped grep for `graphql(` inside the SEC-05 describe block → 0 real calls (only a comment mentions it) | closed |
| T-34-07-C | Spoofing | validation error read as authorization refusal | mitigate | `validate(schema, parse(query))` must be `[]` before execution — `:401`; `errors[0].path` deep-equal `[fieldName]` after — `:423`; `grep -n "toBeDefined()" security.boundaries.test.js` → 0 matches | closed |
| T-34-07-D | Information Disclosure | silent leak via a null-returning field | mitigate | `Query.me` given its own `NULL_RESULT_FIELDS` assertion, not allowlisted — `security.boundaries.test.js:368,408-411` | closed |
| T-34-07-E | Tampering | allowlist drift | mitigate | Pinned sorted 7-name array + swept-field-count pin — `security.boundaries.test.js:430-450` | closed |
| T-34-07-F | Elevation of Privilege | non-GraphQL surface | mitigate | Three photo-route cells assert 401 with exact guard message — `security.boundaries.test.js:465-486` | closed |
| T-34-07-G | Spoofing | matrix green for the wrong reason | mitigate | Admin positive controls assert NOT `ADMIN_REQUIRED` — `security.boundaries.test.js:209-220` | closed |
| T-34-07-H | Elevation of Privilege | switch as a permission | mitigate | "admin, door closed" cell — `security.boundaries.test.js:262-271` | closed |
| T-34-07-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks Log R-34-09 | closed |
| T-34-08-A | Repudiation | a boundary test that cannot fail | mitigate | All 8 mutations (M1-M8) applied, run, and recorded with verbatim failure messages — `34-08-SUMMARY.md` D-13 table | closed |
| T-34-08-B | Elevation of Privilege | mutation left in the working tree | mitigate | `git checkout --` restore after every mutation + clean `git status --porcelain` — confirmed independently at HEAD (`git status --porcelain` shows only pre-existing untracked `.vscode/`); `grep -rn "sweepCanary" backend/src` → 0 matches (M7's canary fully removed) | closed |
| T-34-08-C | Elevation of Privilege | the CR-01 blind spot recurring | mitigate | M3 recorded as failing on the absolute-value assertion specifically (34-08-SUMMARY.md row M3); independently re-confirmed by reading the current five-state table — `publicRegistrationSwitch.test.js:387-427` still asserts both the absolute value (line ~441) and the agreement (line ~442) as two separate expectations. Note: the SUMMARY's cited line number (394) has drifted to ~441 because the CR-01/WR-01 fixes inserted two new tests earlier in this same file after 34-08 ran — informational only, the assertion itself is intact and unchanged in structure | closed |
| T-34-08-D | Denial of Service | wedged test database | mitigate | Mutations run strictly one at a time, in the foreground, never concurrent — 34-08-SUMMARY.md Performance/Accomplishments section; no MariaDB-wedge incident reported | closed |
| T-34-08-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks Log R-34-10 | closed |
| T-34-09-A | Tampering | migration 021 vs the Sequelize model | mitigate | Verification A (apply real SQL to a real DB, confirm seeded row + OPEN admin surface) — recorded APPROVED by developer, `34-VERIFICATION.md` § Human Verification Required item A | closed |
| T-34-09-B | Elevation of Privilege | forgotten migration failing closed silently | mitigate | README § Manual Database Migrations names the exact symptom ("Public signup is closed — Not changed since setup.") — `README.md:351-356` | closed |
| T-34-09-C | Repudiation | green suite achieved by weakening it | mitigate | Backend skip count confirmed exactly 3, unchanged from baseline — `34-09-SUMMARY.md` line 112 / postfix-gate.log | closed |
| T-34-09-D | Elevation of Privilege | closing path acquiring friction | mitigate | Verification B (human confirms one-click close, no interstitial) — recorded APPROVED, `34-VERIFICATION.md` § Human Verification Required item B | closed |
| T-34-09-E | Information Disclosure | mid-form swap leaking admin timing | mitigate | Verification C (two browser sessions, swapped view byte-identical) — recorded APPROVED, `34-VERIFICATION.md` § Human Verification Required item C | closed |
| T-34-09-F | Spoofing | account pre-hijacking via tokenless registration (CR-02) | accept | See Accepted Risks Log R-34-11 | closed |
| T-34-09-SC | Tampering | npm/pip/cargo installs | accept | See Accepted Risks Log R-34-12 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**61/61 threats closed. 0 transfer dispositions in this phase.**

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| R-34-01 | T-34-01-E | DoS: two extra statements (a one-row TRUNCATE and a `findOrCreate`) added to `resetTables()`, a helper already issuing seven statements; sub-millisecond overhead, measured baseline of 348s stays the reference (34-RESEARCH.md § A4). | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-02 | T-34-01-SC | Supply-chain: zero new packages introduced by this plan — `graphql`, `@apollo/server`, `vitest`, `supertest` are already declared direct dependencies with versions verified in `node_modules` (34-RESEARCH.md § Package Legitimacy Audit: not applicable). | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-03 | T-34-02-SC | Supply-chain: zero new packages — `@testing-library/react` 16.3.2, `jsdom` 26.x, `vitest` 4.1.10 already installed. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-04 | T-34-03-SC | Supply-chain: zero new packages this plan (34-RESEARCH.md § Package Legitimacy Audit: not applicable). | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-05 | T-34-04-SC | Supply-chain: zero new packages — `LockOpenRoundedIcon`/`LockRoundedIcon` confirmed present in the already-installed `@mui/icons-material` 6.3.x during UI-SPEC authoring. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-06 | T-34-05-SC | Supply-chain: zero new packages this plan (34-RESEARCH.md § Package Legitimacy Audit: not applicable). | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-07 | T-34-06-A | Elevation of Privilege: the `/register` surface is presentation only; the actual refusal is `register`'s server-side check (plan 34-05), independently proven by the SEC-04 matrix (plan 34-07). A visitor who bypasses the client UI entirely still gets refused server-side — client-side gating on this surface is defence-in-depth, not the authority boundary. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-08 | T-34-06-SC | Supply-chain: zero new packages this plan. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-09 | T-34-07-SC | Supply-chain: zero new packages — `graphql` 16.14.0 and `supertest` 7.2.2 already declared direct/dev dependencies (34-RESEARCH.md § Package Legitimacy Audit: not applicable). | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-10 | T-34-08-SC | Supply-chain: zero new packages; this plan runs existing commands only. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-11 | T-34-09-F | Spoofing / account pre-hijacking via tokenless registration (CR-02, D-14): an anonymous caller can bind a chosen password to a third party's email address before ownership is proven; the admin-approval gate can be defeated because the attacker forges the signal the admin decides on. Knowingly accepted and out of scope for this phase. Tracking: `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md` — status `pending`, explicitly annotated "This entry stays open deliberately... Do not close this as done." D-02's fail-closed default is partly motivated by this risk. Must be revisited when the registration flow is next touched, or if abuse is observed in practice. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |
| R-34-12 | T-34-09-SC | Supply-chain: zero new packages in this phase. | Bisrat Kidane — plan-time disposition, confirmed at /gsd:secure-phase gate | 2026-09-09 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-09-09 | 61 | 61 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-09

---

## Auditor Notes

- **Post-review mitigations independently re-verified against current HEAD, not the stale plan-time wording.** CR-01 (unlocked read-then-write race in the flip mutation), WR-01 (two-read attribution payload race), and WR-02 (dialog dismiss paths active while an open-flip is in flight) were all found fixed in the current source: `appSettings.js`'s `options` passthrough + rethrow-on-transaction semantics (`appSettings.js:63-91`), `setting.resolver.js`'s locked in-transaction read (`:78`) and single-transaction attribution read (`:21-40`), and `PublicSignupSwitch.jsx`'s `onClose={busy ? undefined : ...}` / `disableEscapeKeyDown={busy}` / `disabled={busy}` on "Keep it closed" (`:186-205`). Corresponding regression tests exist and were read directly (not merely cited): `publicRegistrationSwitch.test.js:210-236,265-282` and `PublicSignupSwitch.test.jsx:141-170`.
- **Grep gates independently re-run, not trusted from narrative:** zero `Once(` calls in `Register.test.jsx`; zero live `row.value` reads outside `setting.resolver.js`'s comment; exactly one production `AppSetting.findByPk` call site (`appSettings.js:50`); zero `err.message.includes/match/===` patterns in `Register.jsx`/`PublicSignupSwitch.jsx`; zero `graphql(` calls inside the SEC-05 describe block; zero `toBeDefined()` in `security.boundaries.test.js`; `seedDefaultAppSettings` absent from `models/index.js`; `sweepCanary` absent from the current schema/resolver (confirming the M7 mutation-testing artifact was fully restored).
- **One informational discrepancy noted, not a blocker (T-34-08-C):** `34-08-SUMMARY.md`'s D-13 record cites `publicRegistrationSwitch.test.js:394` for M3's absolute-value-assertion failure. At current HEAD this assertion sits at approximately line 441, because the CR-01/WR-01 review-fix commits inserted two new tests (`:210-236`, `:265-282`) earlier in the same file after 34-08 ran. The assertion itself (`expect(queryResult.data.publicRegistrationEnabled).toBe(expected)`) is present, unchanged in structure, and still a distinct expectation from the agreement assertion on the following line — the mitigation is intact; only the cited line number has drifted. `34-VERIFICATION.md`'s claim that line 394 "lands on the exact assertion" appears to conflate this file with `security.boundaries.test.js` (whose citations at 195/418/446 do land exactly, and were independently re-confirmed here).
- **No unregistered attack surface found.** `grep -ln "Threat Flags" 34-0*-SUMMARY.md` across all nine SUMMARY.md files returns no matches, confirming the orchestrator's prior grep. A supplementary `grep -in "threat"` sweep of all nine SUMMARY.md files surfaced only one incidental mention (34-03-SUMMARY.md:64, narrative color, not a flagged new surface).
- **Human-verify items (T-34-09-A/D/E) closed on recorded developer sign-off**, per `34-VERIFICATION.md` § Human Verification Required: migration 021 applied to a real DB (A), one-click-close UI-SPEC visual match (B), and the two-browser-session mid-form race (C) were each presented verbatim and returned "approved". This is treated as genuine evidence (a quoted, timestamped human decision), consistent with this project's established human-checkpoint pattern — not as agent self-assessment.
- **Implementation files were read-only throughout this audit.** Only this file (`34-SECURITY.md`) was created.
