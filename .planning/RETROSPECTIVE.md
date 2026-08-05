# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Full-Stack Testing Safety Net

**Shipped:** 2026-07-12
**Phases:** 6 | **Plans:** 13 | **Tasks:** 29

### What Was Built
- Vitest test runner in both the backend and frontend workspaces, plus a single root `npm test` fanning out via `--workspaces`.
- An isolated `portofolio_test` MySQL database provisioned/torn down per run, gated by a two-signal safety guard (`NODE_ENV=test` + DB name matching `/_test$/`) so tests can never touch dev data.
- Backend unit tests (JWT sign/verify, password hashing, role guards) and integration tests (register, login, dashboard/me, requestPasswordReset) against the real test DB.
- Frontend component tests for AuthContext, ProtectedRoute, and the Login/Register pages.
- A GitHub Actions CI pipeline running the exact local command against a `mysql:8.4` service container, proven live green (run 29196084093) and red (run 29196296939), with `main` branch protection requiring the `test` check.
- `KNOWN-ISSUES.md` documenting the reset-token exposure and other bugs surfaced but deliberately not fixed.

### What Worked
- **Horizontal-layer phase order** (tooling → unit → integration, per stack half, then CI last) meant every phase's dependencies already existed — no rework from missing prerequisites.
- **A hard test-DB guard** made "tests never touch dev data" a structural guarantee, not a convention.
- **Live-fire CI verification** (Phase 6 Plan 2) caught what local reasoning can't: pushing real green and deliberately-red runs proved the pipeline end-to-end before the phase was called done.
- **Reusing the exact `npm test` in CI** ("what runs locally is what runs in CI") kept the pipeline honest with zero CI-only divergence.

### What Was Inefficient
- The `main`-vs-`family` branch gap (125 commits) surfaced only at ship/complete time; deciding tag-vs-merge ordering late added a round-trip. Deciding the merge/tag strategy up front would have been smoother.
- README carried stale "Node.js 18" references while the repo moved to Node 24 (`.nvmrc`); the drift was correctly scoped out but flagged repeatedly by review — worth a dedicated cleanup pass.
- Branch protection couldn't be enabled until the repo was made public — a GitHub plan-tier constraint discovered during verification rather than planning.

### Patterns Established
- **Probe-consumer pattern** for testing React context (`useAuth()` driven through a real provider with the API mocked at the module boundary).
- **Two-signal test-DB safety guard** as the standard gate before any DB-touching test run.
- **Deliberate-failure smoke test** as the CI-03 phase-gate check (push a broken assertion on a scratch branch, confirm red, revert).
- **Document-don't-fix** for security bugs surfaced mid-milestone — tracked in `KNOWN-ISSUES.md` for a dedicated remediation milestone.

### Key Lessons
1. Verify CI against real infrastructure, not just YAML review — service containers, action pins, and health-check timing can all look correct and still fail live.
2. "Blocks merge" and "red build visible" are two different requirements — the visible-red half is code; the blocks-merge half is account/branch-protection config that can be gated by platform tier.
3. Decide branch/merge/tag strategy at milestone start, not at ship time, when the feature branch has diverged far from the default branch.

### Cost Observations
- Model mix: predominantly Opus (orchestration) + Sonnet (executor/verifier subagents).
- Notable: wave-based execution with fresh-context subagents kept the orchestrator lean across a 6-phase milestone; live CI verification was the highest-value single step.

---

## Milestone: v1.1 — Security Remediation

**Shipped:** 2026-07-21
**Phases:** 5 (7–11) | **Plans:** 19 | **Tasks:** 42

### What Was Built
- Reset-token exposure closed: pluggable `sendMail()` mailer (console in dev/test, SMTP-wired for prod), token dropped from the API schema, stored `sha256`-hashed at rest.
- JWT-secret production fail-fast (unset/`change-me` refuses boot); dev/test unaffected.
- Per-IP rate limiting on login/register/requestPasswordReset as an Apollo plugin keyed off the parsed operation AST, testable via `executeOperation()`, with 429-count parity (no enumeration oracle).
- Session revocation via `passwordChangedAt` (null-safe seconds-floor compare, same-second boundary proven).
- Server-side 8-char password minimum in register + resetPassword.
- Email-verified registration (message-only register, `verifyEmail`, unverified-login rejection, `resendVerificationEmail`, `/verify-email` route) with a DB-enforced race-safe first-verified-user-ADMIN assignment.
- CORS rejection no longer echoes the origin; verified via a new HTTP-level supertest harness.

### What Worked
- **Dependency-first phase sequencing** (foundation → mailer → passwordChangedAt on the same resolver → rate limiting after resolvers stabilized → verification last) meant each shared resolver was touched once, not repeatedly re-edited with unrelated changes interleaved.
- **TDD red-green on real MySQL** caught what unit-level reasoning missed: the phase verifier reproduced VERIFY-04's ADMIN promotion as non-atomic under genuine concurrency, and the gap-closure test was proven to fail against the pre-fix resolver before the fix landed.
- **Independent re-verification that didn't trust the SUMMARY** (reverting the fix and watching the concurrency test fail 3/3) turned "tests pass" into "this test actually guards the invariant."
- **Manual boot-and-verify (SC-5) as an explicit acceptance step** covered the `sequelize.sync()`-won't-alter-existing-tables blind spot that CI's force-recreate can never surface.

### What Was Inefficient
- **The same `main`-vs-`family` branch-strategy gap from v1.0 recurred and grew** (125 → 286 commits): the single long-lived branch and stale `origin/main` meant the "Phase 11" ship was really a whole-branch/milestone PR, and tag-vs-merge timing again had to be decided late. The v1.0 lesson ("decide branch strategy at milestone start") was recorded but not acted on.
- **A plan's literal test design didn't survive contact with real InnoDB locking** (no index on `role` → full-table locks), so the RED harness had to be empirically re-derived (two symmetric transactional promoters) mid-execution — a sign the plan under-modeled the DB's actual lock behavior.
- **Requirement checkboxes in REQUIREMENTS.md drifted** — many stayed `[ ]` though their phases had passed verification; status had to be reconciled at milestone close from phase verification rather than being maintained continuously.

### Patterns Established
- **AST-keyed rate limiting** — never trust the client-supplied `operationName`; key limits off the parsed GraphQL operation to close rename bypasses.
- **Adversarial re-verification** — revert the fix and confirm the new test fails, as the standard proof that a regression guard is real.
- **Transaction + `FOR UPDATE` for read-check-write invariants** under concurrency, with retry-once-on-`ER_LOCK_DEADLOCK` so a losing racer still completes.
- **Manual boot-and-verify checkpoint** for schema changes on already-provisioned DBs (the `sync()` gap).

### Key Lessons
1. For "check a count, then conditionally write" invariants, statement-level timing is not atomic under real concurrency — a single transaction with a locking read is the structural fix, and the regression test must run against real MySQL, not a mock.
2. A concurrency test only counts if it's proven to fail against the broken code — assert that before trusting the green.
3. Act on carried-forward process lessons: the branch/merge/tag strategy should be settled at milestone *start*; deferring it a second time doubled the divergence.

### Cost Observations
- Model mix: Opus (orchestration) + Sonnet-class executor/verifier subagents; the Phase 11 gap-closure executor empirically probed 5 harness designs against the live DB (higher cost, but it produced an honest RED the plan's design couldn't).
- Notable: the highest-value step was the verifier independently reverting the fix to confirm the guard — cheap relative to shipping a silently-broken invariant.

---

## Milestone: v2.0 — Collaborative Family Tree

**Shipped:** 2026-07-25
**Phases:** 6 (12–17) | **Plans:** 31 | **Tasks:** 68

### What Was Built
A full family-tree domain on the existing auth foundation: a cycle/cascade-safe FamilyMember + Spouse data model, membership-gated access with admin account-linking, server-side one-hop permission scoping with adversarial-tested relationship mutations, a `/manage` self-service + admin UI, a hardened photo-upload route on a durable Docker volume, and a pannable/zoomable `/family` tree. Backend 321→326, frontend 165→180 tests at close.

### What Worked
- Wave-based parallel executors with a hard human checkpoint (Phase 17 SC-1 spike) caught a library dead-end (dagre `minlen:0` crash) before the production canvas was built.
- Adversarial-first TDD on every security boundary (privilege escalation, TOCTOU duplicate-child, path traversal, content-type spoofing) — each critical code-review finding was reproduced RED before the fix.
- Verifier independently re-running the suite and tracing fix commits (not trusting SUMMARY claims) repeatedly paid off.

### What Was Inefficient
- **Test fixtures that mock the real integration point hid true blockers.** The tree's render-smoke tests mocked React Flow, so a *green* suite still shipped a canvas that drew **zero edges** (no node handles) — only surfaced by the user in the running app. Same class of miss as Phase 14's untested authz paths.
- **Baked Docker images with no source bind-mount** meant every code change silently required a rebuild; several "it's still broken" rounds were stale-container artifacts, not code.
- The union-node spouse-pairing model (spike-approved, verified) didn't match real data (0 spouses, 0 two-parent children) and was scrapped post-milestone for a pure parent→child hierarchy — a sign the spike fixture wasn't representative of the actual dataset.

### Patterns Established
- Post-phase enhancements driven by real-data feedback (edge model, gender-as-colour, full-window, spouse connector) handled as focused TDD executors with atomic commits + container rebuilds.
- Secrets kept out of git via a gitignored `env/*.secrets.env` override loaded as a second `--env-file`, tracked `.example` documenting it.

### Key Lessons
- A green suite only means as much as its fixtures are real — when a test mocks the exact seam that can fail (edge/handle rendering, DB race, live SMTP), it verifies nothing about that seam. Prefer one un-mocked integration check over many mocked smoke tests.
- Confirm the deployment loop (does the running artifact actually reflect the change?) before debugging the code — a stale baked image looks exactly like a broken fix.
- Validate spike fixtures against the shape of the real data, not just against "realistic depth."

### Cost Observations
- Model mix: Opus orchestration + Sonnet executors/verifier/reviewer/auditor subagents across wave-parallel phases.
- Notable: the code-review gate (finding the union-reveal blocker) and the user's own hands-on testing (missing edges, no spouse link) caught what the automated suite structurally could not.

---

## Milestone: v3.0 — Ge'ez Native-Script Names

**Shipped:** 2026-07-31
**Phases:** 6 (18–23) | **Plans:** 11 | **Tasks:** 11

### What Was Built
Ge'ez (Ethiopic) native-script names end-to-end on the existing family-tree app: three nullable `utf8mb4` columns + a defensive `geezFullname` VIRTUAL (portable migration proven on real MariaDB), zero-new-resolver GraphQL passthrough with clear-to-null, a self-hosted Ethiopic-subset webfont (no CDN), one anti-drift `getGeezDisplay` helper feeding every read surface, and a write path (form inputs in Add/Edit dialogs + a Ge'ez-findable Autocomplete) closed by a human glyph/visual sign-off. Frontend 268→301 tests across the milestone; backend unchanged bar 2 named pre-existing failures.

### What Worked
- **Strict dependency-ordered phases** (data → API → font → shared helper → read → write) with the helper as a single source of truth — no surface re-derived the Latin/Ge'ez precedence, killing the drift bug by construction (Phase 21's whole reason to exist).
- **Read-path-before-write-path sequencing**: rendering was proven against known data before end-user input was wired, so "renders wrong" and "form submits wrong" bugs never got conflated.
- **Code review caught what green tests missed — again**: CR-01 flagged a data-loss risk on the untested non-admin uncle/aunt Edit path (`ManagePage.jsx:35-36` card-only projection) — the exact recurring pattern from Phases 14/15 where non-admin paths lacked coverage. `git show` confirmed it pre-dated v3.0.
- **Human sign-off encoded as an explicit blocking checkpoint plan** (23-03, `autonomous:false`) rather than faked in jsdom — the milestone's real glyph/overflow verification.

### What Was Inefficient
- **The visual sign-off had to be deferred a whole phase (22→23)** because no real Ge'ez data existed until the write path shipped — a foreseen but real serialization cost; Phase 22 closed with a carry-forward UAT item instead of a clean sign-off.
- **No single source of truth for the shared form's field shape**: three hand-copied `EMPTY_FORM`/`EMPTY_LINK_FORM` objects (WR-02) are the root cause behind both WR-01 (LinkAccountsPage missing the 3 new keys → uncontrolled-input warning) and the CR-01 blast radius — adding fields to `MemberFields` silently left consumers behind.
- **New Ge'ez labels being substrings of their Latin twins** silently broke every non-exact `getByLabelText` across all consumers (incl. an out-of-plan file), surfacing only mid-execution and needing an anchored-query sweep.

### Patterns Established
- Server-derived VIRTUAL fields consumed **read-only** on the frontend (never recomputed) as the anti-drift contract.
- Pre-existing/out-of-scope failures **explicitly enumerated by name (D-08)** in the quality gate rather than masked or silently passed over.
- Irreducibly-human verifications (glyph rendering) modeled as blocking `checkpoint:human-verify` plans with concrete step-by-step resume signals.

### Key Lessons
- Shared form components need one authoritative field-shape definition; hand-copied empty-form objects drift silently, and one consumer's stale projection becomes a real data-loss bug on save.
- When new UI text is a substring of existing text, non-exact test queries become fragile — anchor them from the start.
- Some checks can't be automated honestly (real glyph rasterization/overflow) — encode them as explicit human gates instead of pretending jsdom covers them.

### Cost Observations
- Model mix: Opus orchestration + Sonnet executors/verifier/reviewer across 3 sequential single-plan waves (worktree-isolated).
- Notable: fastest milestone yet (2 days, 11 plans) — small, tightly-scoped, dependency-linear phases. The code-review gate + human sign-off again caught what the suite structurally could not (data-loss on an untested path; real-glyph overflow).

---

## Milestone: v4.0 — Family Detail & Descendant Navigation

**Shipped:** 2026-08-05
**Phases:** 6 (24–29) | **Plans:** 20 | **Tasks:** 40

### What Was Built
A new `/detail` page: a reusable `PersonCard` renders any person (head/child/grandchild) with gender cues, spouse pairing, and gated affordances; the page opens on the family head with Latin+Ge'ez inline search; descendants expand by generation (3-gen cap + forward-shift, lazy-loaded and session-cached via the codebase's first custom hook); admins edit/add-child/add-spouse in place, reusing the existing backend-enforced dialogs; all closed by an accessibility & quality gate — axe-core zero-violations, code-enforced WCAG AA text contrast, keyboard tab-order, human-verified mobile layout + painted focus, and an honest dual-engine full-suite green. Backend read layer was purely additive (no schema change, N+1-free); frontend grew to 435 tests.

### What Worked
- **Backend-first, then a reusable card, then compose**: proving the read layer N+1-free (24) and building one `PersonCard` (25) before `/detail` (26)/navigation (27)/admin (28) composed them meant every consumer used real reads and one card component — zero duplicate card UI.
- **Parallel worktree waves** where files didn't overlap (29-01 backend + 29-02 frontend ran concurrently; 24/25 too), serializing only on genuine dependencies — the manifest-scoped cleanup helper merged them safely.
- **Code review + verifier caught what green tests structurally cannot — again**: 29's WCAG gate was text-only, so the reviewer *and* the independent verifier both flagged the residual gender-**border** non-text contrast gap (WCAG 1.4.11, invisible to jest-axe under jsdom). The recurring v2.0/v3.0 pattern held.
- **Honest close gate (D-05)**: a shared `isMariaDB()` helper made the two MySQL-8.4-specific concurrency tests visibly self-skip locally with documented reasons instead of faking "100% green" — CI still runs them unconditionally.
- **Human-verify checkpoint for paint/layout** (29-04, `autonomous:false`): the two things jsdom can't do — mobile reflow and a *painted* focus ring — were an explicit blocking gate, not pretended.

### What Was Inefficient
- **A deprecated-component silent no-op survived two phases**: `GenerationGrid` imported MUI's legacy `Grid` (not `Grid2`), so its `size` breakpoint prop did nothing — the grid never actually reflowed. Built in Phase 27, only caught in Phase 29's a11y pass. The Phase 27 tests asserted the breakpoint *CSS rules existed in markup*, which passed even though the component ignored them.
- **The contrast gate was scoped to text pairs only**, so it gave a green signal while a non-text border contrast failure (WR-01) sat right beside the text it did check — a gate that looks comprehensive but isn't.
- **Milestone tooling papercuts**: two SUMMARY `one_liner` fields were a bare filepath / null, so the auto-generated MILESTONES.md entry had a junk accomplishment (hand-fixed); and the REQUIREMENTS.md traceability *table* stayed "Not started" even though every checkbox was `[x]` (a display-vs-checkbox desync the verifier flagged, fixed in the archive).

### Patterns Established
- **Cross-engine test honesty**: engine-detect (`isMariaDB()`) + visible `ctx.skip` with a documented reason, so a local dev DB that differs from CI never silently weakens or fakes the suite.
- **Code-enforced a11y gates** (`jest-axe` zero-violations + a `wcag-contrast` unit test importing the *actual* component color constants, not re-derived copies) as regression guards.
- **A responsive/visual test must prove the component *applies* the behavior**, not merely that the CSS rule is present — presence-only assertions pass through silent-no-op bugs.

### Key Lessons
- Deprecated components can accept props and silently ignore them; assert observable behavior (does it reflow?) over structural presence (is the rule in the markup?).
- Scope a quality gate to a criterion and it will be blind right next to what it checks — a text-contrast gate says nothing about non-text contrast (WCAG 1.4.11); name the scope explicitly and track the rest.
- Auto-generated milestone artifacts inherit upstream data-quality issues (a bad SUMMARY one-liner, a stale traceability column) — worth a quick review pass at close rather than trusting the CLI output verbatim.

### Cost Observations
- Model mix: Opus orchestration + Sonnet executors/verifier/reviewer; parallel worktree waves where safe, sequential main-tree for the interactive checkpoint plan.
- Notable: the a11y phase paid for itself by surfacing a real production responsive bug (`Grid`→`Grid2`) that had shipped silently two phases earlier — the automated axe/contrast gates plus the adversarial code review are now the reliable "what did green miss" net across every milestone.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 13 | Established GSD wave execution + live-fire CI verification for this project |
| v1.1 | 5 | 19 | Dependency-first sequencing on shared resolvers; adversarial re-verification (revert-to-confirm-RED); real-DB concurrency TDD |
| v2.0 | 6 | 31 | Wave-parallel worktree executors + human spike checkpoints; adversarial-first security TDD; real-data feedback drove post-milestone edge-model rework |
| v3.0 | 6 | 11 | Dependency-linear single-plan waves; shared anti-drift helper as single source of truth; human sign-off gate for un-automatable glyph rendering |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.0 | 51 (backend 39, frontend 12) | Test tooling only; no new runtime deps |
| v1.1 | 121 backend green at close | nodemailer (mailer); no framework changes |
| v2.0 | backend 321, frontend ~180 at close | @xyflow/react + @dagrejs/dagre (tree), file-type (upload), react-easy-crop |
| v3.0 | frontend 301, backend 391 (+2 named pre-existing) | @fontsource/noto-sans-ethiopic (self-hosted font); no framework changes |

### Top Lessons (Verified Across Milestones)

1. Verify against real infrastructure, not just static config review. *(v1.0, reinforced v1.1 — real-MySQL concurrency; v3.0 — real-MariaDB migration + human glyph sign-off)*
2. A test only counts once it's proven to fail against the broken code. *(v1.1)*
3. Settle branch/merge/tag strategy at milestone start — deferring it compounded the divergence across v1.0→v1.1. *(v1.0, recurred v1.1)*
4. A green suite only counts where its fixtures are real; code review + human testing repeatedly caught data-loss/rendering failures on untested non-admin paths that the suite structurally could not. *(v2.0 missing-edges, v3.0 CR-01 uncle/aunt edit + glyph overflow)*
5. Shared components (resolvers, forms) need one authoritative shape; hand-copied duplicates drift silently into bugs. *(v1.1 resolvers, v3.0 EMPTY_FORM triplication)*
