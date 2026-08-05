# Milestones

## v4.0 Family Detail & Descendant Navigation (Shipped: 2026-08-05)

**Phases completed:** 6 phases, 20 plans, 40 tasks

**Key accomplishments:**

- Added a bounded recursive-CTE `familyHead` query mirroring the client's `resolveRootAncestorId` rule, and a partial/case-insensitive Latin+Ge'ez `searchFamilyMembers` query, both additive to the existing `familyMember.schema.js`/`familyMember.resolver.js` with zero existing-query changes.
- Added a scaling bounded-SQL-statement-count test proving `familyMember(id) { children { id children { id } spouses { id } } }` stays flat from 3 to 10 direct children, reusing the existing unmodified DataLoaders -- zero production code changes.
- Added a one-line `canEdit: Boolean!` GraphQL field mirroring the existing createdBy/updatedBy admin-check shape, and proved (without rebuilding) that `familyMember(id)` already returns every field the `/detail` person card needs.
- Reusable `PersonCard` component (avatar, Latin/Ge'ez name, role label, Living/Deceased chip, gated edit button, gated child-count/expand control) built on a newly-extracted shared `genderTheme.js`, with gender signaled via color+tint, a deterministic `data-ring-style` avatar-ring border-style, and `data-gender`/`aria-label` — never color alone.
- PersonCard now composes a lateral spouse card via a dashed connector (matching /family's convention) whenever `spouse` is passed to a non-spouse anchor, with a structural recursion guard ensuring a spouse card is always a rendering leaf.
- Shipped the `/detail` page — a protected route that loads the family head first (head-id → person-by-id), renders every state (loading, no-results, no-children, failed+retry, missing-head/person) through existing components, with an inline debounced Latin/Ge'ez `PersonSearch` Autocomplete feeding the Phase 24 `searchFamilyMembers` query and resetting the main person on select.
- Pure, exhaustively-unit-tested `navReducer`/`initial` view-frame state machine modeling expand/collapse, D-01 single-branch auto-collapse, and D-03/D-04 forward-shift with exact push/pop undo — zero React/DOM dependency.
- New presentational `GenerationGrid` wraps one generation's people in a responsive MUI v6 `Grid` (`size` prop) with a single group-level inverted-V apex cue, reusing `PersonCard` unmodified.
- `useDescendantNav(mainPerson)` — the first custom hook in this codebase, combining Plan 27-01's pure `navReducer` with a `useRef(Map)` session cache and an expand-only `EXPAND_CHILDREN_QUERY`, proving PERF-01 (lazy per-generation fetch) and PERF-03 (zero duplicate requests, cache lives outside React state) entirely via `renderHook` before any page wiring exists.
- `DetailPage.jsx` now wires the already-tested `useDescendantNav` hook (27-03) and `GenerationGrid` (27-02) into a live expand/collapse/shift UI, proven end-to-end by 8 new tests (14/14 in the file) covering NAV-01..04, PERF-01, PERF-03, and D-01/D-04 against the real rendered component tree.
- New adversarial integration test proving editMember/addChild/addSpouse are rejected server-side for a non-admin acting outside their editable scope, independent of /detail's client-side canEdit hiding.
- Admin-only Add-relative icon button + 2-item MUI Menu ("Add child"/"Add spouse") added to PersonCard's non-spouse anchor instance, threaded through GenerationGrid, TDD RED-GREEN.
- Added `refreshEntry(id)` to `useDescendantNav` — an always-fresh, single-request refetch that evicts and repopulates any one cached descendant OR the current head, proven id-agnostic via a dedicated no-forward-shift topId test.
- DetailPage's three no-op `onEdit` stubs now open the real EditMemberDialog pre-filled via a fresh full-field fetch, with every save routed through `nav.refreshEntry` uniformly (head, gen1, gen2, or a forward-shifted promoted top).
- All 3 `/detail` render sites (head/gen1/gen2) now open the existing `AddRelativeDialog` pre-targeted at the clicked person via PersonCard's Add-menu, with a successful add refreshing that person's children/spouses in place (head included) and auto-expanding a previously-collapsed target so the new child is immediately visible.
- Two pre-existing MariaDB-incompatible concurrency tests (VERIFY-04, REL-06) now visibly self-skip via a shared `isMariaDB()` engine-detection helper, so `npm test --workspace backend` exits 0 on a developer's local MariaDB dev DB without weakening CI's MySQL 8.4 coverage.
- Installed jest-axe/wcag-contrast, added a deterministic contrast unit test, and fixed 3 real WCAG AA contrast failures on PersonCard's Ge'ez name/role-label/Living-chip text via local component-scoped color constants — no shared gender token touched.
- Added code-enforced axe-core scans and userEvent.tab() focus-order/reachability tests to all four /detail surfaces, and fixed a real production bug where GenerationGrid's responsive per-generation grid never actually applied its 600px/900px breakpoints because it imported the wrong (deprecated) MUI Grid component.
- Human confirmed /detail's mobile layout (360px single-column, 768px 2-per-row) and painted keyboard focus visually pass in a real browser; full `npm test --workspaces` exits 0 locally on MariaDB with VERIFY-04/REL-06 visibly skipped (documented, CI-covered on MySQL 8.4) -- closing out A11Y-01 and the v4.0 milestone's quality gate.

---

## v3.0 Ge'ez Native-Script Names (Shipped: 2026-07-31)

**Phases completed:** 6 phases, 11 plans, 11 tasks

**Key accomplishments:**

- Portable manual migration 018 adds three nullable `utf8mb4` Ge'ez name columns to `family_members`, proven to apply cleanly and round-trip Ethiopic UTF-8 text on real local MariaDB, and documented in README with D-03 portability and D-04 prod-deferred notes.
- Ge'ez name fields now flow through the FamilyMember GraphQL API via the existing spread-passthrough create/edit resolvers, with the geezFullname VIRTUAL hardened to declare its source-field dependencies.
- Self-hosted `@fontsource/noto-sans-ethiopic` (Ethiopic-subset, 400+700 weights) wired into `main.jsx`, with `FONT_SANS`/`FONT_DISPLAY` theme stacks updated and ordering proven by a new `theme.test.js` (2/2 passing, full suite 268/268 green).
- Pure-function `getGeezDisplay(member)` helper in a new `frontend/src/utils/` directory, returning `null` when `member.geezFullname` is absent/blank or `{ text, lang: 'ti' }` when present -- unit-tested with a 7-case none/partial/all-filled matrix using real Ethiopic fixtures, full 275/275 frontend suite green.
- Every read surface (`/family` tree card, `/manage` admin table + relationship cards, incl. non-admin uncles/aunts) renders a member's Ge'ez name stacked below the Latin name via the shared `getGeezDisplay` helper, with admin-table Ge'ez substring search — verified 8/8, 291/291 frontend tests.
- The Ge'ez write path shipped — three inputs in the shared `MemberFields` form wired through the Add-relative and Edit-member dialogs (round-trip + clear-to-null) and a Ge'ez-findable add-relative Autocomplete (Latin-only visible label) — closing the milestone with the full suite green (except two named pre-existing failures) and a human glyph/visual sign-off against a real Tigrinya name (QUAL-01).

---

## v2.0 Collaborative Family Tree (Shipped: 2026-07-25)

**Phases completed:** 6 phases, 31 plans, 68 tasks

**Key accomplishments:**

- FamilyMember Sequelize model — required identity fields, gender ENUM, derived fullname VIRTUAL, and full cross-field date validation — built test-first and registered in the models barrel.
- Self-referencing motherId/fatherId associations with ON DELETE SET NULL cascade-safety, plus a canonical-pair Spouse join model enforcing one row per couple and symmetric reads — built test-first, full backend suite 157/157 green.
- Batched-per-depth ancestor-chain BFS walk (`wouldCreateCycle`, MAX_DEPTH=100) guarding `linkParent`/backing `addChild` — the codebase's first hand-rolled graph algorithm, built test-first, full backend suite 166/166 green.
- Transactional `deleteMember` enforcing the married-in one-hop cascade-safety rule (D-03/D-04) — blood relatives always survive, a married-in-only spouse is removed one hop alongside their partner with no recursion — plus `setSpouse`/`getSpouseRows` completing REL-02; full backend suite 171/171 green, closing Phase 12.
- `requireFamilyAccess` guard (linked-member OR ADMIN) and `users.familyMemberId` link column (nullable, UNIQUE, `ON DELETE SET NULL`) added via a tracked manual migration + `User<->FamilyMember` association, both TDD'd and proven against the sync'd test schema.
- First guarded family-domain GraphQL surface (`familyMember`/`familyMembers`) proving the SC5 locked adversarial rejection test against a real resolver, plus the `linkUserToMember` admin mutation that links existing-or-newly-created bare members to any user account, including admin self-link.
- ProtectedRoute now redirects any authenticated, non-admin, unlinked user to a static `/pending` screen, and `AuthContext`'s login/verifyEmail/me operations all carry `familyMemberId` so a freshly-linked user is never misrouted there without a page refresh.
- The minimal, admin-only `/admin/link-members` screen ACC-02 requires: an admin sees every unlinked account and links each to an existing family member (MUI Autocomplete picker) or creates a bare member and links in one step, backed by the Plan 13-02 `linkUserToMember` mutation.
- Task 1 -- Shared Apollo server config + GraphQL depth-limit validation (D-08):
- Single reused `computeEditableScope` service utility (self/parents/spouses/children/either-parent-siblings, bounded to one hop) proven against all three SC-3 exclusion fixtures, plus the dashboard resolver now gated by `requireFamilyAccess` closing WR-04.
- FamilyMember's mother/father/spouses/children/siblings/linkedUser fields now resolve over GraphQL through the Wave-1 DataLoader factory, with a 255-node/8-generation fixture proving both halves of SC-5: flat/bounded SQL query count and real recursive-field depth-limit rejection.
- First two member-facing relationship mutations — `addParent` and `addSpouse` — each always creating a brand-new `FamilyMember` node and linking it via the extended, reused Phase 12 service helpers (`linkParent`, `setSpouse`), gated by `requireFamilyAccess` and the `computeEditableScope` scope check from 14-02.
- `addChild` and `addSibling` mutations — `addChild`'s optional `otherParentId` carries the phase's primary SC-4 adversarial security-boundary test (an existing-node reference checked against the actor's own `computeEditableScope`), and `addSibling` mirrors REL-04's read-side derivation on the write side, including the mandatory D-04 no-fabricated-parent rejection.
- Phase-closing plan: `editMember` (plain-field edits gated by scope + the D-06 field-lock identity check), `deleteMember` (admin-only by construction — zero `computeEditableScope` calls anywhere in the resolver, proving members have no delete capability structurally), and `myEditableMembers` (a zero-argument, fully server-derived read-only convenience query de-risking the Phase 15 `/manage` UI).
- Row-locked REL-06 duplicate-child guard added to `addChild` in `familyMember.service.js`, closing the TOCTOU race with a `SELECT ... FOR UPDATE` on the shared-parent row(s) before the duplicate-name check, proven safe under genuine concurrency and unconditional for admins and members alike.
- Presentational building blocks for `/manage`: MemberCard (D-06 locked/read-only branch, D-02 derived-sibling chip, admin bypass, no dead Rewire button) and RelationshipGroupedPanel (You/Parents/Spouse/Children/Siblings sections, one shared component for both the member and admin views)
- AddRelativeDialog — one MUI Dialog component parameterized by relationType, covering all four Phase 14 add-relative mutations (addParent/addSpouse/addChild/addSibling) with an in-scope-only "other parent" picker for the child path
- Searchable, client-side-paginated MUI Table over the full familyMembers list, with row-click handing the selected member to a callback for a later ManagePage wiring plan.
- Member-facing `/manage` page wired end to end: `myEditableMembers` fetch + client-side relationship grouping, add-relative dialog, plain-field `EditMemberDialog`, and `/manage` routed behind the unchanged `ProtectedRoute` gate with `/admin/link-members` retired to a redirect.
- Task 1 — Admin branch: table, focus-into-panel, delete confirm
- multer + file-type installed (backend-scoped), photoStorageConfig resolved via __dirname, family_members.profilePicture added via manual-ALTER + TDD boot-verify test, and hand-built spec-valid JPEG/PNG/WebP fixtures for every later upload test
- TDD-built photoStorage.service.js: server-generated UUID filenames, real byte-exact file I/O, and an orphan-free write-then-commit-then-cleanup replace sequence (D-11) — the sole file-system surface later upload/replace routes depend on
- Added a `photo_uploads` named Docker volume mounted into the backend service at the exact path `photoStorageConfig.photosDir` resolves to, plus a repeatable rebuild-and-verify script proving persistence (script written, syntax-validated, and shape-verified; not executed live due to a concurrent worktree sharing the host's mysql container)
- POST /api/family-members/:id/photo — the app's first non-GraphQL route, with magic-byte-only file-type sniffing (file-type/fileTypeFromBuffer), server-generated UUID filenames, transaction-safe orphan-free replace (finalizePhotoReplacement), and a computed FamilyMember.photoUrl field — adversarial tests (path-traversal, content-type spoofing x2, oversized file) written and GREEN before any happy-path test existed
- DELETE (scope-gated, idempotent, D-11) and GET (any-valid-JWT, deliberately no scope check, D-07) added to the existing photo.routes.js — the serve handler is the one place in this phase structurally incapable of an editable-scope check, verified by a grep scoped to just that handler's body
- photoClient.js (Bearer-auth axios client for the non-GraphQL photo routes), MemberAvatarImage.jsx (the app's first authenticated-blob-fetch `<img>` replacement, icon-only placeholder per D-10), and PhotoCropDialog.jsx (client-side square-crop to a 512x512 JPEG blob via `react-easy-crop` + off-screen canvas, mirroring `EditMemberDialog`'s shell) — three standalone, fully tested frontend primitives built ahead of their 16-07 wiring
- MemberCard's avatar is now the live D-01 upload trigger (ButtonBase + hidden file input + camera overlay, D-10 icon placeholder replacing initials everywhere), RelationshipGroupedPanel explicitly threads onPickPhoto/onRemovePhoto through every MemberCard render path, ManagePage wires PhotoCropDialog and a distinct "Remove photo?" confirm dialog into both the member and admin branches, and AdminMemberTable gains a photo thumbnail column — completing every UI-SPEC-declared surface for PHOTO-01
- The `familyMembers` GraphQL query moved from admin-only to linked-member-or-admin (D-13) via a one-line guard swap, proven safe by a TDD red-green cycle and a new regression test showing the per-field `linkedUser` gate (Phase 14 CR-01) is untouched.
- Pure forest-assembly (`buildForest`/`computeInitialExpandSet`/`deriveSiblings`) and a dagre TB layout wrapper for the `/family` tree, with the D-11 SC-1 spike human-approved at ~18-generation synthetic depth — using a working union-node midpoint mechanism in place of RESEARCH.md's dagre-crashing `minlen: 0` approach.
- Built the production `/family` tree canvas -- `MemberNode`/`UnionNode` custom xyflow node types and the `FamilyTreeCanvas` wrapper owning dagre layout-on-visible-subset, bidirectional collapse/expand (descendant + ancestor, D-03), and all four D-05 navigation aids -- removing the temporary SC-1 spike harness now that Plan 17-02's human checkpoint approved the underlying union-node pattern.
- Wired the flat GraphQL fetch, read-only detail panel, route registration, and nav placement that turn Plan 17-03's canvas into the live `/family` page -- closing out the v2.0 Collaborative Family Tree milestone with a full green `npm test --workspaces` run (backend 321/321, frontend 165/165).

---

## v1.1 Security Remediation (Shipped: 2026-07-21)

**Phases completed:** 5 phases (7–11), 19 plans, 42 tasks
**Timeline:** 2026-07-12 → 2026-07-21 (9 days) · 63 files changed, +3,340/−137 (backend + frontend)
**Delivered:** Remediated all 7 security bugs v1.0 documented but left unfixed — closing account-takeover, brute-force, stale-session, and privilege-escalation vectors — TDD red-green-refactor with CI green throughout. Shipped via PR #2 (family → main).

**Key accomplishments:**

- Reset-token exposure closed: the token is now delivered only to the account owner via a pluggable `sendMail()` mailer (console driver in dev/test, SMTP-wired for prod), dropped from the API schema entirely, and stored `sha256`-hashed at rest.
- JWT-secret production fail-fast: the backend refuses to boot when `NODE_ENV=production` and `JWT_SECRET` is unset or the insecure `'change-me'` default — while dev/test keep booting on the weak shared secret (the full suite stays green).
- Per-IP rate limiting on `login` (5/15min) / `register` / `requestPasswordReset` (5/hour), implemented as an Apollo plugin keyed off the parsed GraphQL operation AST (closing an operation-rename bypass) and testable via the in-process `executeOperation()` harness; 429-count parity proven so it adds no enumeration oracle.
- Session revocation via `passwordChangedAt`: a password reset immediately invalidates any JWT issued beforehand (`getUserFromRequest` rejects tokens whose `iat` predates it, null-safe seconds-floor compare), proven by a same-second boundary test.
- Server-side 8-char password minimum enforced in `register` and `resetPassword` before hashing.
- Email verification on registration: `register` returns a message-only payload (no JWT/session/ADMIN), `verifyEmail(token)` logs the user in, `login` rejects unverified accounts, and `resendVerificationEmail` recovers lost tokens; frontend gained a `/verify-email` route and a "check your email" register state.
- First-user-becomes-ADMIN land-grab race closed with a DB-enforced guarantee: `verifyEmail` runs token-consumption + a locking `SELECT COUNT(*) … FOR UPDATE` admin-count read + conditional promotion inside one `sequelize.transaction`, with retry-once-on-`ER_LOCK_DEADLOCK` so a losing racer still gets a valid session. Independently re-verified (reverting the fix fails the concurrency test 3/3 with `Deadlock found`).
- CORS rejection no longer echoes the rejected origin to the client — it's logged server-side and the client-facing error is generic. Verified via a new HTTP-level (supertest) test harness against an importable Express `app`.

**Verification:** All 5 phases passed GSD verification (Phase 11 re-verified 8/8 after gap-closure plan 11-08). Backend suite 121/121 green; Phase 11 concurrency test stable across 5 consecutive real-MySQL runs. SC-5 manual boot-and-verify (migration + 8-step register→verify→dashboard flow) signed off 2026-07-21. Open-artifact audit clear at close; no milestone audit run (waived — all phases individually verified).

---

## v1.0 Full-Stack Testing Safety Net (Shipped: 2026-07-12)

**Phases completed:** 6 phases, 13 plans, 29 tasks

**Key accomplishments:**

- Backend workspace now runs `npm test` via Vitest 4.1.10 against a dedicated `env/test.env`, proven end-to-end by a passing smoke spec.
- Vitest globalSetup lifecycle provisions and tears down an isolated `portofolio_test` MySQL database per run, gated by a two-signal safety guard, with row-level fixture helpers and a live connectivity proof spec — full backend suite (6 tests) passes end-to-end against the real, isolated test database.
- Unit regression suite for `backend/src/utils/auth.js` (JWT sign/verify, role guards, reset-token utilities) using plain Vitest and hand-rolled stubs — zero DB connection, zero application source changes.
- Locked in existing password-hashing and validation guarantees with 4 pure in-memory unit tests against `User.validatePassword` and the `beforeCreate` hook, using `User.runHooks` — no DB connection opened, no application code touched.
- Added a shared in-process Apollo `graphql()` test helper and the first backend integration spec, proving register's ADMIN/USER first-user role matrix, duplicate-email rejection, and Sequelize `isEmail` validation rejection.
- Added login mutation and dashboard/me query integration specs, pinning the JWT-issuance contract, the anti-enumeration login rejection message, and ADMIN/USER dashboard access-control behavior via direct role-injected context users.
- Added the requestPasswordReset integration spec (happy-path only, per D-09) and the repo-root KNOWN-ISSUES.md tracking the reset-token exposure as a documented, unfixed High-severity bug.
- Standalone Vitest+jsdom harness for the frontend workspace, with the full React Testing Library kit installed and a passing proof spec proving render/query/matcher/cleanup all wire together.
- AuthContext component tests via a probe-consumer pattern, driving useAuth() through a real AuthProvider with graphqlRequest mocked at the module boundary
- ProtectedRoute route-guard tests covering all four conditional branches (loading, unauthenticated redirect, authorized render, role-mismatch redirect) via a mocked useAuth() and MemoryRouter route tree
- Login and Register pages tested end-to-end through the real AuthProvider, with only graphqlRequest and useNavigate mocked — covering both the success-navigates and error-alert-no-navigate paths for each page.
- Root `npm test` fans out to both workspaces via `--workspaces`, and a new GitHub Actions workflow reproduces that exact command on every push/PR against a health-checked mysql:8.4 service container matching env/test.env credentials.
- Pushed `family` to GitHub and watched .github/workflows/ci.yml go green (run 29196084093, conclusion `success`, backend 39/39 + frontend 12/12 tests passing), then pushed a scratch branch with a deliberately broken assertion and watched the same workflow go red (run 29196296939, conclusion `failure`, log naming `src/smoke.test.js:5:19 AssertionError: expected 2 to be 3`), before fully reverting and deleting the scratch branch.

---
