# Phase 34: Open-Registration Switch & Quality Gate - Research

**Researched:** 2026-09-09
**Domain:** Application settings persistence (first in this codebase) + schema-driven authorization testing (GraphQL/Apollo 4 + Vitest)
**Confidence:** HIGH

## Summary

This phase has two halves with very different risk profiles. The **switch** is small, ordinary code — a key/value table, one accessor, one query, one mutation, one MUI region — whose only real danger is the outer-guard/inner-guard divergence class named in D-07. The **proof** (SEC-04/SEC-05) is where the research effort actually paid: the schema-driven sweep D-12 asks for is easy to write in a way that is *vacuous*, and the difference between a real proof and a vacuous one comes down to three mechanical details that this document verifies empirically rather than assumes.

The single most important finding: **a GraphQL validation error and an authorization refusal are trivially confusable, and this project's own error shapes let you tell them apart precisely.** I built and ran a working prototype of the sweep's query synthesizer against the real SDL — it produces a *semantically valid* operation for all 32 root fields (12 Query + 20 Mutation), verified by running `graphql`'s own `validate()` over each generated document (0 invalid). I then measured Apollo Server 4.13's error shapes: a resolver-thrown guard error carries `extensions.code: 'INTERNAL_SERVER_ERROR'` **and a `path` of `[fieldName]`**, while a validation failure carries `GRAPHQL_VALIDATION_FAILED` **and no `path` at all**. `path` being present is proof the execution phase reached that field's resolver — which is exactly the reachability guarantee the sweep needs and cannot get any other way.

The second finding that changes the plan's shape: **the existing `graphql()` test helper cannot be used for the SEC-05 sweep.** It injects `contextValue.user` directly (`backend/test/helpers.js:16-26`), bypassing `getUserFromRequest` entirely — and `getUserFromRequest` (`backend/src/utils/auth.js:33`) *is* the gate SEC-05 exists to prove. The sweep must run over `httpClient()` + a real `signToken(pendingUser)` Authorization header. SEC-04's non-admin matrix, by contrast, correctly uses the `graphql()` helper, because there the caller *is* authenticated. Two harnesses, one file — the planner must not unify them.

Third: **`resetTables()` must seed the new settings row, and this is a Wave 0 change touching a shared helper used by 44 backend test files.** `globalSetup` runs `sync({ force: true })`, which creates the table but not the seed row; D-02 says an absent row means *closed*; `register.test.js`'s ~25 tokenless tests all assume *open*. Without a reseed in `resetTables()`, adding the switch turns a large part of the existing suite red for a reason that has nothing to do with the feature.

**Primary recommendation:** Build one exported `isPublicRegistrationEnabled(models)` in a new `backend/src/utils/appSettings.js`; have the public query, the admin query, and `register`'s tokenless branch all call *that function object*; and prove they do with a `vi.spyOn` call-count assertion (an idiom already proven to work on ESM namespaces in this repo at `register.test.js:461`) on top of a five-state behavioural agreement table. Then run the D-12 sweep over HTTP with `validate()`-checked generated operations, asserting the exact message `'You must be logged in to perform this action.'` **and** `path === [field]`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `.planning/phases/34-open-registration-switch-quality-gate/34-CONTEXT.md`:

- **D-01:** A **generic `app_settings` key/value table**, added by a new numbered manual migration (`backend/migrations/manual/021-*.sql`, following the `020-add-users-relationship-note.sql` precedent). Shape is roughly `key VARCHAR(64) PRIMARY KEY, value VARCHAR(255) NOT NULL, updatedAt DATETIME NOT NULL, updatedById INT NULL`. Chosen over a dedicated typed `app_config` row so that a future flag is a row rather than another migration; the accepted cost is string values, so the read path needs a small typed accessor rather than reading the column directly.

  **This is not a contradiction of Phase 32 D-03.** That decision banned an *env-var* switch (`PUBLIC_REGISTRATION_ENABLED` or equivalent) precisely because it would require a redeploy to flip. ADMIN-01 requires the opposite property. The ban stands: do not introduce an env variable for this, and do not let an env variable override the stored value.

- **D-02:** **Fail closed, seed open.** The migration seeds the row to enabled, so a correctly-deployed system behaves exactly as production does today. But an **absent row or a failed read resolves to disabled** — invitation-only. Two reasons: an admin's deliberate "off" must never be silently undone by a wiped row or a half-applied migration, and CR-02 (account pre-hijacking, knowingly shipped) is live behind this form, so the unexpected state should be the safe one.

  **Test consequence:** this needs its own coverage. Delete the row → tokenless register refused. Make the read throw → tokenless register refused. A fail-closed default that is never exercised is a fail-open default nobody has noticed yet.

- **D-03:** **Every flip writes an `AuditLog` row** — acting admin, old value → new value, timestamp — via the existing `writeAuditLog` helper (`backend/src/utils/audit.js`). Consistent with how every other consequential admin action is already treated (APPR-04). Chosen over relying on `updatedById`/`updatedAt` alone, which overwrite history: a flag flipped off and back on during a spam incident would otherwise leave no trace of the incident.

- **D-04:** The control lives at the **top of the existing `/invitations` page**. `frontend/src/pages/InvitationsPage.jsx` is 26 lines stacking `InvitePage` + `ApprovalsPage` behind `<ProtectedRoute allowedRoles={['ADMIN']}>`; the switch becomes a third stacked region above them. **No new route, no new nav entry, no new page component.** It sits where an admin already goes to manage who gets in, and the approval queue directly below it is the visible consequence of leaving the door open.

- **D-05:** **Closing is instant; opening asks for confirmation.** ADMIN-01's stated reason for existing is that "a spam wave can be stopped in seconds", so nothing may stand between the admin and shutting the door. Opening is the direction that exposes the public form, so it takes a confirmation naming what it does. The asymmetry is deliberate and derived from the requirement's own wording — do not "simplify" it to symmetric behaviour.

- **D-06:** The control shows **state plus last change** — e.g. "Public signup is OPEN — opened by Bisrat on 8 Sep" — beside the toggle. This satisfies ADMIN-03 and makes the audit trail useful at a glance rather than only in the database.

- **D-07:** A **public, unauthenticated `publicRegistrationEnabled: Boolean!` query** drives the initial render. `frontend/src/pages/Register.jsx:89` already branches on `!token`; inside that branch it now chooses the signup form or the invitation-only message based on this query. **Plus a submit-path fallback:** if the server refuses a tokenless submit anyway, the UI swaps to the same invitation-only message rather than showing a generic error. An admin can close the door while someone is mid-form, and that race is exactly the moment the switch matters most.

  **Constraint the planner MUST honour — this is the phase's dangerous shape.** The client query and the server check are an outer guard and an inner guard on the same predicate. That is the exact bug class that has now hit this project four times across Phases 14, 15, 30, 31, 32 and 33 — most recently *inside* the agreement test built to prevent it. Both sides MUST read the same stored value through the same accessor. Do not let the client's notion of "enabled" be derived independently, cached differently, or defaulted differently from the server's. See D-12.

- **D-08:** The switch gates the **tokenless branch only**. A valid invitation token still registers normally while the door is closed. Closing the door must not silently void invitations an admin has already issued and which recipients are holding. ADMIN-01 and ADMIN-02 both scope themselves to "public self-registration" / "tokenless registration"; this is the literal reading. (A second control for freezing invitations was raised and deferred — see Deferred Ideas.)

- **D-09:** A refused tokenless `register` is **checked first and refused plainly**. The switch check runs before the email lookup, before bcrypt, before any DB write, and throws a clear message to the effect that registration is currently by invitation only. No DB touch, no timing signal, no owner-notification email for an account that will never exist.

  **Interaction with SEC-01 / Phase 32 D-08, which the planner must not get backwards:** enumeration-silence is about not revealing *whether a given email has an account*. It is not about hiding the door's state — the public `publicRegistrationEnabled` query reveals that to anyone, by design. So a plain refusal here does not weaken SEC-01. What *would* weaken it is placing this check after the uniform-response guard, where a closed-door refusal could become distinguishable from the silent path. Check the switch first, before any of that machinery runs.

- **D-10:** Accounts **already in the approval queue when the door closes stay there and remain approvable**. Closing stops new arrivals; it does not void people who already registered and verified. Stated explicitly because it is the kind of obvious that produces a bug — nothing in the switch's implementation should touch `pendingApprovals`, `approveUser`, or `rejectUser`.

- **D-11:** One **new, additive `security.boundaries.test.js`** in `backend/src/resolvers/` — a matrix a reviewer can read top to bottom as "here is the whole boundary", serving as the milestone's proof artifact. Existing per-resolver adversarial cases stay exactly where they are and are **not** moved: `createInvitation.test.js:102` (linked, Active, non-admin refused), `approveReject.test.js`, `setUserPassword.test.js:26`, `accountStatus.test.js:49`. The matrix covers cells they do not, and references rather than duplicates the ones they do.

- **D-12:** SEC-05 is proven by a **schema-driven sweep, not a sample**. The test enumerates every field on `type Query` and `type Mutation` from the SDL and asserts each one refuses a `Pending`, email-verified self-registrant's token — with an **explicit allowlist** for the genuinely public fields (`register`, `login`, `requestPasswordReset`, `resetPassword`, `verifyEmail`, `resendVerificationEmail`, the new `publicRegistrationEnabled`, and whatever else is actually public today; the planner establishes the real list from the schema, not from this sentence).

  **Why this shape and not a sample:** it inverts the default. A resolver added next year that forgets its guard fails this test on day one, and widening the allowlist becomes a conscious, reviewable act rather than an omission nobody sees. This is the structural mechanism the project's repeated failures call for.

  **Note on where the gate actually is:** `backend/src/utils/auth.js:33` already returns `null` from `getUserFromRequest` for any non-`Active` user, so the mechanism exists and `accountStatus.test.js:49` covers it at the chokepoint. SEC-05's contribution is proving the *consequence* holds across the whole surface, and that it keeps holding. Do not treat the existing chokepoint test as making the sweep redundant — the sweep is what checks the claim "every resolver goes through that chokepoint", which no current test asserts.

- **D-13:** **Every new boundary test is mutation-tested.** For each one, remove or weaken the guard it protects, confirm the test actually goes red, restore. Recorded in the plan as a verification step with its result, not as a good intention.

  This is not ceremony. Phase 32's CR-01 and Phase 33's repeat were both TDD'd, both green, both wrong — because the test and the guard shared the same blind spot, and nothing ever checked that the test could fail. A red-state demonstration is the only step that has caught this class every time it was run.

- **D-14:** Scope stays **SC-5 as written**: this phase is done when ADMIN-01..03 and SEC-04..05 are delivered and `npm test --workspaces` is green. Phase 33's two open visual UAT items, the pending `/gsd:verify-work 32` re-check of SEC-01, and the advisory review warnings are **not** absorbed here. They are workflow housekeeping to run before the milestone closes; folding them in would blur what this phase actually proved.

### Claude's Discretion

- The exact setting key name, the migration file's slug, and whether the typed accessor caches (the read is on a rate-limited path and a rarely-loaded public page — caching is optional, but if it caches, the client and server must still share one source per D-07).
- The mutation's name and signature for flipping the switch, and its return shape.
- Visual composition of the admin control — which MUI primitives, spacing, how the OPEN/CLOSED state is signalled — following the app's existing surface treatment. `/gsd:ui-phase 34` will produce the design contract (ROADMAP marks this phase **UI hint: yes**).
- Exact copy for the confirmation dialog, the OPEN/CLOSED state line, the server's refusal message, and the invitation-only message shown on `/register`.
- Whether the new public `publicRegistrationEnabled` query is rate-limited. It is a trivially cheap read on an already CORS-restricted endpoint; the existing AST-keyed rate-limit plugin makes adding it cheap if the planner judges it worthwhile.
- Whether the switch state is ever surfaced to non-admins. Today only admins reach `/invitations` at all, so the default is no.
- Test-file placement for the switch's own coverage (resolver tests, component tests), and whether the schema sweep's allowlist is itself pinned by a second assertion against an expected literal set.

> Every discretion bullet above is answered with a recommendation in this document — see **Discretion Answers** below.

### Deferred Ideas (OUT OF SCOPE)

- **A second switch to freeze outstanding invitations.** Raised while deciding D-08. Today closing the public door leaves invited registration fully working, which is the intended behaviour; a separate "freeze invitations too" control would be a new capability and belongs in its own phase.
- **Absorbing the milestone's open debt into this phase** — Phase 33's two visual UAT items, the `/gsd:verify-work 32` SEC-01 re-check, and the advisory warnings including the missing `users(role, status, emailVerified)` index. Considered and rejected as this phase's work (D-14); they run as separate closing steps before the milestone completes.
- **CR-02 — tokenless register enables account pre-hijacking** (`.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`). Reviewed and deliberately not folded. The todo stays open and annotated; v4.1 ships with the risk documented rather than hidden.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | An admin can turn public self-registration on or off from inside the app, without a redeploy, so a spam wave can be stopped in seconds. | Standard Stack (no new packages); Architecture Pattern 1 (settings store + accessor); Pattern 4 (flip mutation, audit-in-transaction); `Don't Hand-Roll` (no env var, no cache, no migration framework) |
| ADMIN-02 | While public registration is off, `/register` without a token shows the invitation-only message **and** the mutation rejects a tokenless registration — the switch is enforced on the server, not just in the UI. | Pattern 2 (exact `register` insertion point, verified line numbers); Pattern 3 (the one-accessor agreement + `vi.spyOn` call-site proof); Pitfall 1 (validation-vs-authorization); Pitfall 3 (`assertPasswordStrength` precedence) |
| ADMIN-03 | The current on/off state is visible to admins wherever they can change it. | Pattern 5 (admin-only `publicRegistrationSetting` query with attribution, F-01 resolution); 34-UI-SPEC.md is the binding visual contract |
| SEC-04 | Adversarial tests prove the boundaries hold: a non-admin cannot create an invitation, cannot approve or reject an account, and cannot register without a token while public registration is off. | Pattern 6 (SEC-04 matrix, harness = `graphql()` helper); Empirical Guard Map (which message each field produces) |
| SEC-05 | A self-registered account cannot reach any authenticated surface before both gates pass — proven against the resolvers, not just the client-side route guard. | Pattern 7 (schema-driven sweep, verified prototype); Empirical Public-Field List; Pitfall 1, 2, 4; the REST-surface completion (photo routes) |

## Project Constraints (from CLAUDE.md)

| Directive | Source | Consequence for this phase |
|-----------|--------|----------------------------|
| JavaScript ES Modules, npm workspaces, no bundler rewrite | CLAUDE.md § Constraints | New backend files are ESM with explicit `.js` extensions on relative imports |
| Vitest as the single runner across backend and frontend | CLAUDE.md § Constraints | No new test framework; all new tests are Vitest |
| Backend integration tests need an isolated test database | CLAUDE.md § Constraints | New settings tests use `portofolio_test` via the existing `globalSetup`/`resetTables` path — never a second DB |
| Non-destructive to app runtime behaviour | CLAUDE.md § Constraints | **Note:** this phase *does* change runtime behaviour (that constraint describes the v1.0 testing milestone, not v4.1). It still binds in spirit: do not alter the invited path, `pendingApprovals`, `approveUser`, or `rejectUser` (D-08/D-10) |
| Guards throw, they don't return | CLAUDE.md § Error Handling; `utils/auth.js:38-45` | The switch check throws `new Error(...)` at the top of the tokenless branch, matching `requireAuth`/`requireAdmin` |
| Named exports for utilities/config; `export default function` for React components | CLAUDE.md § Module Design | `appSettings.js` uses named exports; `PublicSignupSwitch.jsx` uses a default export |
| Barrel `index.js` aggregators for models/schemas/resolvers | CLAUDE.md § Module Design | A new model/schema/resolver trio must be registered in all three barrels |
| Frontend has no GraphQL client library — plain axios + raw query strings | CLAUDE.md § Pattern Overview | The new queries are string constants passed to `graphqlRequest`, exactly like `ME_QUERY` |
| 2-space indent, single quotes, semicolons, no ESLint/Prettier config | CLAUDE.md § Code Style | Match by hand; there is no formatter to lean on |
| **GSD workflow enforcement** — no direct repo edits outside a GSD command | CLAUDE.md § GSD Workflow Enforcement | This research made **zero** source edits. Two throwaway probe scripts were created under `backend/` and deleted immediately; `git status` is unchanged apart from the pre-existing untracked `.vscode/` |
| Forbidden files: never read anything under `env/` | project policy, restated in the research brief | Honoured. Version/DB facts below came from `package.json`, `node_modules`, `ps`, and the project's own `env.js` loader — never from an env file |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Storing the on/off value | Database / Storage | — | D-01 locks a persisted row; nothing else survives a restart or is visible to a second process |
| Deciding "is the door open?" | API / Backend (`utils/appSettings.js`) | — | Single predicate, single owner. Putting any part of this decision in the browser is the D-07 bug |
| Refusing a tokenless `register` | API / Backend (`user.resolver.js`) | — | ADMIN-02 says explicitly "enforced on the server, not just in the UI" |
| Showing the right `/register` surface | Browser / Client | API (source of truth) | The client *renders* a decision the server made; it never makes one |
| Flipping the switch | API / Backend (mutation) | Browser (trigger only) | `requireAdmin` is server-side; the client contributes intent, not authority |
| Displaying state + last change | Browser / Client | API (admin-only query) | ADMIN-03 is a rendering requirement over server-supplied data |
| Audit history of flips | Database / Storage (`audit_logs`) | API (`writeAuditLog`) | D-03; append-only, never client-writable |
| Proving the boundaries | Test tier (Vitest, backend) | — | SEC-04/SEC-05 are explicitly resolver-level, not client-level |

**Tier misassignment to watch for:** the tempting-but-wrong design is to let `Register.jsx` decide "closed" by pattern-matching the server's refusal message. 34-UI-SPEC.md already forbids this in its "mid-form refusal" section, and it is the same tier error as D-07's warning: it moves the *predicate* into the browser. The correct client behaviour on a refused tokenless submit is to **re-run the query** and let the server decide again.

## Standard Stack

### Core

**No new runtime or dev dependency is required by this phase.** Everything needed is already a declared direct dependency.

| Library | Version (verified installed) | Purpose | Why standard |
|---------|------------------------------|---------|--------------|
| `graphql` | 16.14.0 | `buildSchema` / `parse` / `validate` for the D-12 sweep's field enumeration and validity pre-check | Already a direct dep of `backend/package.json` (`^16.10.0`). `buildSchema` handles the `extend type Query` SDL split across four files — **verified by running it** |
| `@apollo/server` | 4.13.0 | Executes the sweep's operations; supplies the error shapes the sweep discriminates on | Already the app's server |
| `sequelize` + `mysql2` | 6.37.x / 3.11.x | The `AppSetting` model, `findByPk`, transactions | Already the app's ORM |
| `vitest` | 4.1.10 (both workspaces) | Test runner, `vi.spyOn` on ESM namespaces, `vi.mock` for the mailer | Already the app's runner |
| `supertest` | 7.2.2 (backend devDep) | The HTTP harness the SEC-05 sweep **must** use (see Pitfall 2) | Already used by `sessionRevocation.test.js`, `server.cors.test.js`, `photo.*.test.js` |
| `@testing-library/react` + `jsdom` | 16.3.2 / 26.x | `PublicSignupSwitch.test.jsx`, updated `Register.test.jsx` | Already the frontend's component-test stack |
| `@mui/material` / `@mui/icons-material` | 6.3.x | `Switch`, `Tooltip`, `Dialog`, `LockOpenRoundedIcon`, `LockRoundedIcon` | Already the app's component library; 34-UI-SPEC.md confirmed both icons exist in `node_modules` |

### Supporting

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `@graphql-tools/schema` | transitive (via `@apollo/server`) | `makeExecutableSchema` — an alternative way to build the schema for enumeration | **Do not use.** It works (verified), but it is a *transitive* package relying on npm hoisting. `graphql`'s own `buildSchema` is a declared direct dependency and produces the identical field set |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `buildSchema(typeDefs.join('\n'))` | A GraphQL introspection query through the running server | Introspection is subject to `maxDepthRule` with `ignoreIntrospection: false` (`graphql/serverConfig.js:26`) and `env.maxQueryDepth` defaults to **12** (`config/env.js:43`). A full introspection query sits close to that ceiling; a future depth reduction would silently break the sweep. `buildSchema` has no such coupling |
| `buildSchema` | `@graphql-tools/schema`'s `makeExecutableSchema` | Undeclared transitive dependency; no benefit here since the sweep only needs types, not resolvers |
| Persisted `app_settings` row | An env var (`PUBLIC_REGISTRATION_ENABLED`) | **Banned by Phase 32 D-03 and restated in D-01.** Requires a redeploy, which is the opposite of ADMIN-01 |
| Persisted row | An in-memory module flag | Lost on restart, invisible to a second process, no audit trail |
| `key/value` generic table | A typed `app_config` single-row table | Rejected in D-01: a future flag would need another migration |

**Installation:** none. No `npm install` step in this phase.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.**

Every library the plan will touch is already declared in `backend/package.json` or `frontend/package.json` and already present in `node_modules`, verified this session by reading the installed `package.json` of each (`graphql` 16.14.0, `@apollo/server` 4.13.0, `vitest` 4.1.10). No registry lookup, no slopcheck run, and no `checkpoint:human-verify` install gate is needed. If the planner discovers a genuine need for a new package, the Package Legitimacy Gate must be run before it is added.

## Empirical Findings (read these before planning)

### E-1. The real public-field list — established from the schema and resolvers, not from D-12's sentence

D-12 explicitly delegates this: *"the planner establishes the real list from the schema, not from this sentence."* Here it is, derived by reading every root field's resolver body.

The SDL is four files aggregated in `backend/src/schemas/index.js`: `user.schema.js` defines the base `type Query` (`:52`) and `type Mutation` (`:60`); `familyMember.schema.js` (`:80`, `:88`), `invitation.schema.js` (`:41`, `:46`) and `approval.schema.js` (`:2`) `extend` them. `buildSchema` on the concatenation yields **12 Query fields and 20 Mutation fields** — verified by execution.

**Genuinely public (no guard call in the resolver at all) — 6 fields today, 7 after this phase:**

| Field | Resolver | Evidence |
|-------|----------|----------|
| `Mutation.register` | `user.resolver.js:178` | no `requireAuth`/`requireAdmin`/`requireFamilyAccess` |
| `Mutation.login` | `user.resolver.js:335` | — |
| `Mutation.requestPasswordReset` | `user.resolver.js:351` | — |
| `Mutation.resetPassword` | `user.resolver.js:379` | — |
| `Mutation.verifyEmail` | `user.resolver.js:398` | — |
| `Mutation.resendVerificationEmail` | `user.resolver.js:555` | — |
| `Query.publicRegistrationEnabled` | **new this phase** | D-07 requires it be unauthenticated |

D-12's candidate list was exactly right on the six existing ones. **Nothing else is public.**

**`Query.me` is a third category and must NOT be put in the allowlist.**

`me: (_parent, _args, { user }) => serializeUser(user)` (`user.resolver.js:136`). It has no guard, but it does not *need* one: it returns `null` when `user` is null, and `getUserFromRequest` already returns `null` for a Pending user. Putting `me` in the "genuinely public, skip it" allowlist would be a silent hole — a future `me` that leaked a Pending user's row would pass the sweep. Give it its own assertion:

```js
// Pending token => me resolves to null, with NO error.
expect(body.errors).toBeUndefined();
expect(body.data.me).toBeNull();
```

This is also directly confirmed by an existing test: `sessionRevocation.test.js:96` asserts `meWithPreResetToken.body.data.me` is `null` for a revoked token, over HTTP.

**Guarded (25 fields) — all three guards funnel through `requireAuth` first:**

| Guard | Fields |
|-------|--------|
| `requireAdmin` | `users`, `unlinkedUsers`, `pendingApprovals`, `myInvitations`, `invitations`, `linkUserToMember`, `setUserPassword`, `createInvitation`, `approveUser`, `rejectUser`, `deleteMember` |
| `requireFamilyAccess` | `dashboard`, `familyMembers`, `familyMember`, `myEditableMembers`, `familyHead`, `searchFamilyMembers`, `addParent`, `addSpouse`, `addChild`, `addSibling`, `editMember` |
| `requireAuth` | `logout`, `changePassword`, `updateUser` (then `requireAdmin` if not self, `user.resolver.js:644`) |

**Consequence that simplifies the whole sweep:** `requireAdmin` calls `requireAuth` first (`auth.js:43`) and `requireFamilyAccess` calls `requireAuth` first (`auth.js:48`). With a Pending user's token, `getUserFromRequest` returns `null`, so `user` is `null`, so **every one of those 25 fields produces the identical message** — `'You must be logged in to perform this action.'` The sweep's expected value is a single string, not a set.

### E-2. Query synthesis works — verified prototype, 32/32 valid

The hardest part of D-12 is invoking every field *validly*. I wrote and ran a synthesizer against the real SDL. It:

1. Builds `schema = buildSchema(typeDefs.join('\n'))`.
2. For each root field, emits a GraphQL **variable** for every non-null argument (`$v_<argName>: <ExactArgType>`), so the query text stays trivial and typing is exact.
3. Fills each variable with a type-directed dummy: `ID!`→`'1'`, `String!`→`'x'`, `Int`→`1`, `Boolean`→`true`, enum→first value, input object→recursively fill only its **non-null** fields.
4. Emits a selection set by walking the return type: prefer the first scalar/enum leaf field, else recurse one level into the first object field, else `{ __typename }`.
5. **Runs `validate(schema, parse(query))` and asserts the result is empty.**

Result: **0 invalid out of 32.** Representative output (real, from the run):

```
query Sweep($v_id: ID!) { familyMember(id: $v_id) { id } }                       vars={"v_id":"1"}
query Sweep($v_term: String!) { searchFamilyMembers(term: $v_term) { id } }      vars={"v_term":"x"}
mutation Sweep($v_memberId: ID!, $v_role: ParentRole!, $v_newMember: NewFamilyMemberInput!) {
  addChild(memberId: $v_memberId, role: $v_role, newMember: $v_newMember) { id } }
  vars={"v_memberId":"1","v_role":"MOTHER","v_newMember":{"firstname":"x","lastname":"x","gender":"Male"}}
mutation Sweep($v_input: CreateInvitationInput!) { createInvitation(input: $v_input) { registrationUrl } }
  vars={"v_input":{"invitedEmail":"x"}}
mutation Sweep { logout }                                                        vars={}
```

Note the synthesizer correctly picked `registrationUrl` (a `String!` leaf) for `CreateInvitationResult`, `message` for `Dashboard`/`RegisterPayload`/`PasswordResetPayload`, `token` for `AuthPayload`, and `id` for `User`/`FamilyMember`/`Invitation`.

**The step 5 assertion is not optional.** Without it, a future schema change (a new required argument of an unhandled type, a return type with no scalar leaf) would silently turn a sweep row into a validation error that the naive assertion `expect(errors).toBeDefined()` would read as a pass. `validate()` inside the test is what makes the sweep self-checking.

### E-3. Apollo Server 4.13 error shapes — measured, not assumed

Run against a minimal `ApolloServer` with a resolver that throws `new Error('You must be logged in to perform this action.')`. Identical output under `NODE_ENV=test` and `NODE_ENV=production` (so this holds in CI too):

| Case | `data` | `errors[0].message` | `errors[0].extensions.code` | `errors[0].path` |
|------|--------|---------------------|------------------------------|-------------------|
| Valid op, resolver throws | `{ guarded: null }` | preserved verbatim | `INTERNAL_SERVER_ERROR` | **`['guarded']`** |
| Missing required argument | `undefined` | `Field "guarded" argument "id" of type "ID!" is required…` | `GRAPHQL_VALIDATION_FAILED` | **absent** |
| Unknown field | `undefined` | `Cannot query field "nope" on type "Query".` | `GRAPHQL_VALIDATION_FAILED` | **absent** |

**`path` is the reachability proof.** `path` is populated only during the *execution* phase, which is only entered after validation succeeds. So `errors[0].path` deep-equalling `[fieldName]` is positive evidence that the field's own resolver ran and threw — it cannot be produced by a malformed query. This is stronger and cheaper than executing an admin positive-control pass, though the control is still recommended for the SEC-04 matrix (see Pattern 6).

The message-preservation behaviour also matches every existing test in the repo (`setUserPassword.test.js:22`, `createInvitation.test.js:96`, `accountStatus.test.js:26`), so asserting on exact message text is the house idiom, not a novel bet.

### E-4. The test helper cannot prove SEC-05 — a harness split is mandatory

```js
// backend/test/helpers.js:16-26
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp, loaders: createLoaders(models) } }
  );
```

`user` goes straight into the context. `getUserFromRequest` never runs. If the sweep called `graphql(op, vars, pendingUser)`, it would hand every resolver a fully-populated Pending `User` instance — which `requireAuth` happily accepts — and the sweep would be testing a state production can never reach.

SEC-05's claim is *"a self-registered account cannot reach any authenticated resolver"*, and the mechanism that makes it true is `getUserFromRequest` returning `null` at `auth.js:33`. **The sweep must therefore go over HTTP**, using the established idiom from `sessionRevocation.test.js:92-95`:

```js
const res = await httpClient()
  .post('/graphql')
  .set('Authorization', `Bearer ${signToken(pendingUser)}`)
  .send({ query, variables });
```

SEC-04 is the opposite: its actor is a *genuinely authenticated, Active, linked, non-admin* user, so `graphql(op, vars, member)` is correct and matches `createInvitation.test.js:102-109`. Two harnesses in one file is the right answer; a comment should say why so a future reader does not "simplify" them together.

### E-5. `resetTables()` must seed the settings row — Wave 0, shared-helper change

- `backend/test/globalSetup.js:11` runs `sequelize.sync({ force: true, match: /_test$/ })`. This **creates the table but not the row**.
- D-02: absent row ⇒ **closed**.
- `register.test.js` (~25 tokenless cases), `rateLimit.test.js`, and `verifyEmail.test.js` all assume the tokenless path works.
- 44 of the 67 `backend/src/**/*.test.js` files call `resetTables` in a `beforeEach`. The 23 that do not are config/util/model unit tests that never touch `register`.

Therefore: **`resetTables()` must truncate `app_settings` and immediately re-seed it to the open state**, via the same seeding function the migration's semantics describe. `globalSetup` should seed once after `sync` as well, so the 23 non-resetting files also observe production-equivalent state.

Also note `resetTables` disables `FOREIGN_KEY_CHECKS` around its truncate block; if `app_settings.updatedById` carries an FK to `users`, `app_settings` must be truncated inside that block. See Pattern 1 for the recommendation to make `updatedById` FK-less, which sidesteps this entirely (precedent: `User.approvedBy` is deliberately "a plain unassociated INTEGER.UNSIGNED column -- no FK", `models/User.js:61-70`).

### E-6. `Register.test.jsx`'s existing tokenless tests will break, by design

`frontend/src/pages/Register.test.jsx` renders `renderRegister(null)` and asserts on the form **synchronously** (`screen.getByText('Request access')`, line 34 — no `await`). Once the `!token` branch is gated behind the `publicRegistrationEnabled` query (34-UI-SPEC.md's `/register` Loading state), the form is not present on first paint.

4 of the file's 5 tests use the tokenless path (lines 31, 82, 96, 109). All four need: a `graphqlRequest` mock that answers the new query, and `await screen.findBy…` instead of `getBy…`.

The file currently uses `mockResolvedValueOnce` chains, which are **order-sensitive** — inserting a leading query shifts every chain. `InvitationsPage.test.jsx:18-22` already demonstrates the robust alternative and should be adopted here:

```js
graphqlRequest.mockImplementation((query) => {
  if (query.includes('publicRegistrationEnabled')) return Promise.resolve({ publicRegistrationEnabled: true });
  if (query.includes('register')) return Promise.resolve({ register: { message: '…' } });
  return Promise.resolve({});
});
```

### E-7. `column named "key"` is a MySQL reserved word

D-01's sketch says `key VARCHAR(64) PRIMARY KEY`. `KEY` is listed as **`KEY (R)`** — reserved — in the MySQL 8.4 keyword table, and reserved words must be backtick-quoted when used as identifiers. `sequelize` quotes identifiers automatically, but the hand-written migration SQL would not, and `CREATE TABLE app_settings (key VARCHAR(64) …)` is a syntax error.

**Recommendation:** name the column `settingKey`. D-01 says the shape is "roughly" this and delegates "the exact setting key name" to discretion; renaming a column to avoid a reserved word is squarely inside that latitude and removes a whole class of quoting bug from every future ad-hoc query an operator runs. If the planner insists on `key`, every raw-SQL reference must be backticked.

### E-8. Migration/model parity — how this codebase currently keeps them honest, and where it does not

There is exactly **one** parity mechanism, and it is deliberately narrow: `backend/src/config/assertRequiredColumns.js` queries `information_schema.columns` at boot for a single column (`users.relationshipNote`) and throws if it is missing. Its own header comment states it is *"NOT a general schema-drift detector"*.

Its own comment also records the important limitation: `globalSetup.js` calls `sync({ force: true })` directly and **bypasses `initializeDatabase()` entirely**, so the check never runs during `npm test`. Coverage for its logic comes only from `assertRequiredColumns.test.js`'s mocked-sequelize unit tests.

**Nothing verifies that a Sequelize model definition and its hand-written migration agree.** That is a real, pre-existing gap, and it bites this phase in a specific way:

- `sequelize.sync()` (non-force, run by `initializeDatabase()` at production boot) **does create missing tables**. So on a production box where migration 021 was never applied, `app_settings` would be created automatically — empty — and D-02 would fail the door **closed, silently**.
- Column-type drift is the other half: `DataTypes.STRING` is `VARCHAR(255)`. If the migration writes `VARCHAR(64)` for the key, the model must say `DataTypes.STRING(64)` or the test DB and production DB differ.

**Recommendation (see Open Question 1 for the alternative considered):** do **not** add a boot-time assert for `app_settings`. Because `sync()` runs before `assertRequiredColumns` in `initializeDatabase()` (`models/index.js:120-134`), a table-existence assert would be dead code, and a *row*-existence assert would crash the backend in exactly the state D-02 says should fail closed rather than fail loudly. Instead:
1. Make the model's column types match the migration **exactly** (`STRING(64)`, `STRING(255)`).
2. `console.warn` once inside the accessor when the row is absent, so the operator gets a log signal without a crash.
3. Add the README § Manual Database Migrations section for 021 with the standard apply + boot-and-verify steps (every prior migration has one; see README:248-330).
4. The admin UI itself is the loudest signal: an operator who forgot the migration opens `/invitations` and sees "Public signup is closed — Not changed since setup."

### E-9. Do not auto-seed at production boot

A tempting shortcut is to call a `findOrCreate` seed from `initializeDatabase()`. **This directly contradicts D-02's stated reason.** D-02: *"an admin's deliberate 'off' must never be silently undone by a wiped row"*. A boot-time `findOrCreate` re-creates a wiped row as **open** — precisely the silent undo D-02 forbids. Seed in the migration (once) and in the test harness (for determinism). Never at boot.

### E-10. `writeAuditLog` in-transaction would be this codebase's first such caller

All five production call sites fire-and-forget with `.catch()`:
`invitation.resolver.js:62`, `user.resolver.js:233`, `:313`, `:535`, `approval.resolver.js:53`, `:95`.

But `audit.js:1-4`'s own header explicitly anticipates the other mode: *"callers may fire-and-forget (with a .catch) or await inside the same transaction — this helper simply creates the row and lets the caller decide."* It already accepts an `options` object passed straight to `AuditLog.create` (`audit.js:12`), so `{ transaction: t }` works with no helper change.

See Pattern 4 for why the flip should be the first in-transaction caller.

## Architecture Patterns

### System Architecture Diagram

```
  ANONYMOUS VISITOR                    ADMIN (Active, role=ADMIN)          PENDING SELF-REGISTRANT
        |                                       |                          (verified email, status=Pending)
        | GET /register (no token)              | GET /invitations                    |
        v                                       v                                     | Bearer <jwt>
  Register.jsx  ──── if (!token) ────>   InvitationsPage.jsx                          v
        |                                       |  (3rd region, top)          POST /graphql
        | graphqlRequest(                       v                                     |
        |   PUBLIC_REGISTRATION_ENABLED) PublicSignupSwitch.jsx                       |
        |                                  |         |                                |
        |                                  | read    | flip (confirm on OPEN only)    |
        v                                  v         v                                v
  =============================== POST /graphql (Apollo 4) ==============================
        |                                                                             |
        |  express context factory (server.js:34-40)                                  |
        |    user = await getUserFromRequest(req, models)   <=== THE CHOKEPOINT ======>|
        |      auth.js:29  !emailVerified            -> null                          |
        |      auth.js:33  status !== 'Active'       -> null   <== Pending lands here  |
        |                                                                             |
        v                                                                             v
  rateLimitPlugin (didResolveOperation, AST root-field keyed)              user === null
        |   RATE_LIMITS = { login, register,                                          |
        |     requestPasswordReset, resendVerificationEmail }                         |
        v                                                                             v
  +--- RESOLVERS -----------------------------------------------------------+         |
  |                                                                          |        |
  |  Query.publicRegistrationEnabled   (PUBLIC)  --+                         |        |
  |  Query.publicRegistrationSetting   requireAdmin +                        |        |
  |  Mutation.setPublicRegistrationEnabled requireAdmin                      |        |
  |                                                 |                        |        |
  |  Mutation.register                              |                        |        |
  |    assertPasswordStrength                       |                        |        |
  |    if (token) { ...invited path, UNGATED (D-08)... }                     |        |
  |    <<< D-09 INSERTION POINT: tokenless branch, first statement >>>       |        |
  |    if (!await isPublicRegistrationEnabled) throw CLOSED  ----------------+        |
  |    assertRelationshipNoteLength / Name / Email                           |        |
  |    startedAt; try { bcrypt.hash; findOne; create } catch {}              |        |
  |    finishTokenlessRegistration  (MIN_REGISTER_RESPONSE_MS = 400)         |        |
  |                                                                          |        |
  |  25 guarded fields: requireAdmin | requireFamilyAccess | requireAuth  <------------+
  |     ALL call requireAuth first => identical message for a null user      |   throws
  |  Query.me: returns null (no throw)                                    <-----------+
  +--------------------------------------------------------------------------+   returns null
                             |
                             v
        utils/appSettings.js  isPublicRegistrationEnabled(models)   <== ONE PREDICATE, THREE CALLERS
                             |
                             |  findByPk(PUBLIC_REGISTRATION_KEY)
                             |    row missing -> false   (D-02)
                             |    throw       -> false   (D-02)
                             |    value!=='true' -> false
                             v
                      app_settings  (migration 021 seeds 'true'; sync({force}) creates table only)
                             ^
                             |  flip mutation: ONE transaction
                             |    upsert row (value, updatedAt, updatedById)
                             |    writeAuditLog(..., { transaction: t })   <== D-03, awaited
                             v
                        audit_logs
```

### Recommended Project Structure

```
backend/
├── migrations/manual/
│   └── 021-create-app-settings.sql          # NEW  table + seed row (open)
├── src/
│   ├── models/
│   │   ├── AppSetting.js                    # NEW  mirrors AuditLog.js shape
│   │   └── index.js                         # EDIT register initAppSetting + export
│   ├── schemas/
│   │   ├── setting.schema.js                # NEW  extend type Query/Mutation
│   │   └── index.js                         # EDIT add settingTypeDefs
│   ├── resolvers/
│   │   ├── setting.resolver.js              # NEW  2 queries + 1 mutation
│   │   ├── index.js                         # EDIT add settingResolvers
│   │   ├── user.resolver.js                 # EDIT one guard in tokenless branch
│   │   ├── publicRegistrationSwitch.test.js # NEW  D-02 + D-07 agreement table
│   │   └── security.boundaries.test.js      # NEW  SEC-04 matrix + SEC-05 sweep (D-11)
│   └── utils/
│       ├── appSettings.js                   # NEW  THE accessor + key constant + seed fn
│       └── appSettings.test.js              # NEW  unit tests for the accessor itself
└── test/
    ├── globalSetup.js                       # EDIT seed after sync
    └── helpers.js                           # EDIT resetTables truncates + reseeds

frontend/src/
├── components/
│   ├── PublicSignupSwitch.jsx               # NEW  per 34-UI-SPEC.md
│   └── PublicSignupSwitch.test.jsx          # NEW
└── pages/
    ├── InvitationsPage.jsx                  # EDIT 3-line fragment at top of Stack
    ├── InvitationsPage.test.jsx             # EDIT add query branch to mockImplementation
    ├── Register.jsx                         # EDIT gate !token branch, renderInvitationOnly()
    └── Register.test.jsx                    # EDIT 4 tokenless tests -> async + query mock
```

**Why a `setting.*` trio rather than folding into `user.*`:** `approval.schema.js` is a 6-line file holding two mutations, so tiny domain modules are already the house style. D-01's rationale ("a future flag is a row rather than another migration") implies more settings later; a `setting.*` module is where the next one goes. CONTEXT.md's Integration Points line naming `user.schema.js:52/:60` refers to where the *base* `type Query`/`type Mutation` are declared (which the D-12 sweep enumerates) — extending them from another file, as `invitation.schema.js:41` and `approval.schema.js:2` already do, is the same thing to `buildSchema`. Verified: `buildSchema` on the concatenation resolves all `extend`s.

### Pattern 1: The settings store — one accessor, no cache

```js
// backend/src/models/AppSetting.js   (shape follows AuditLog.js)
import { DataTypes, Model } from 'sequelize';

export class AppSetting extends Model {}

export function initAppSetting(sequelize) {
  AppSetting.init(
    {
      // VARCHAR(64) must match migration 021 exactly -- DataTypes.STRING alone
      // would be VARCHAR(255) and silently diverge from production (E-8).
      // Named settingKey, not key: KEY is a MySQL reserved word (E-7).
      settingKey: { type: DataTypes.STRING(64), primaryKey: true },
      value: { type: DataTypes.STRING(255), allowNull: false },
      // Plain unassociated column, no FK -- same call as User.approvedBy
      // (models/User.js:61-70). Keeps app_settings out of resetTables' FK dance.
      updatedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }
    },
    {
      sequelize,
      modelName: 'AppSetting',
      tableName: 'app_settings',
      createdAt: false   // only updatedAt, mirroring AuditLog's `updatedAt: false`
    }
  );
  return AppSetting;
}
```

```js
// backend/src/utils/appSettings.js
export const PUBLIC_REGISTRATION_KEY = 'public_registration_enabled';

// THE single definition of "is the public door open?" (D-07). The public
// query resolver, the admin query resolver, and register's tokenless branch
// all call THIS function. Never re-read the row and never re-derive the
// predicate anywhere else -- that divergence is the bug class that produced
// blockers in Phases 14, 15, 30, 31, 32 and 33.
export async function isPublicRegistrationEnabled(models) {
  try {
    const row = await models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY);
    if (!row) {
      // D-02 fail-closed. Warn so a forgotten migration 021 leaves an
      // operator-visible trace without crashing the boot (E-8/E-9).
      console.warn(`app_settings row '${PUBLIC_REGISTRATION_KEY}' is absent -- defaulting to closed.`);
      return false;
    }
    return row.value === 'true';
  } catch (err) {
    console.error('Failed to read public-registration setting:', err?.name, err?.message);
    return false; // D-02 fail-closed on a failed read
  }
}
```

**No cache.** The discretion bullet allows one; the recommendation is not to. A cache is a second source of truth, which is the exact thing D-07 forbids; any TTL directly contradicts ADMIN-01's "stopped in seconds"; and the cost saved is one primary-key lookup on a page that loads rarely and a mutation that is already rate-limited to 5/hour/IP.

**Anything that is not the exact string `'true'` is closed.** A `NULL`, an empty string, `'1'`, `'TRUE'`, or garbage all resolve to `false`. This is the conservative reading of D-02 and it must be covered by a test row.

### Pattern 2: The `register` insertion point — exact, verified line numbers

`backend/src/resolvers/user.resolver.js`:
- `:178` `register:` opens
- `:179` `assertPasswordStrength(password);` — runs for **both** branches
- `:181-244` `if (token) { … return … }` — the invited branch, **untouched** (D-08)
- `:246-259` the tokenless comment block
- `:260` `const startedAt = Date.now();`
- `:261-263` `assertRelationshipNoteLength` / `assertRegistrationName` / `assertRegistrationEmail`
- `:275` `try {` → `:276` `bcrypt.hash` → `:277` `models.User.findOne`
- `:296` `models.User.create`
- `:320` / `:332` `finishTokenlessRegistration(startedAt)` (the `MIN_REGISTER_RESPONSE_MS = 400` floor)

**Insert at `:260`, immediately before `const startedAt = Date.now();`:**

```js
      // ADMIN-02 / D-09: the tokenless door. Checked FIRST -- before the
      // relationship-note/name/email validators, before startedAt, before
      // bcrypt, before models.User.findOne, before any write, before any
      // email. A closed door costs one primary-key read and nothing else.
      //
      // Deliberately OUTSIDE the uniform-response machinery below (D-09):
      // enumeration-silence (SEC-01 / 32 D-08) hides whether a given EMAIL has
      // an account. It does not hide the door's state, which the public
      // publicRegistrationEnabled query broadcasts by design. Putting this
      // check inside finishTokenlessRegistration's uniform path would make the
      // closed-door outcome indistinguishable from a real registration -- the
      // opposite of ADMIN-02's "the mutation rejects a tokenless registration".
      if (!(await isPublicRegistrationEnabled(models))) {
        throw new Error(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
      }
```

Everything below `:260` is unchanged, so Phase 32 D-09's bcrypt-before-lookup ordering and D-08's uniform-response guard are structurally untouched: the new check either throws before any of it runs, or falls through into exactly the code that exists today.

Because the check sits after the `if (token) { … }` block that always returns, it is reached only when `token` is falsy — D-08 is satisfied structurally, without a second `!token` condition that could drift.

### Pattern 3: Making divergence structurally impossible (the D-07 hard constraint)

Three layers, in increasing order of strength. The plan should implement all three.

**Layer 1 — one function, three callers.** The only definition of the predicate is `isPublicRegistrationEnabled`. `Query.publicRegistrationEnabled`, `Query.publicRegistrationSetting.enabled`, and `Mutation.register` all call it. `user.resolver.js` must never import `AppSetting` or `PUBLIC_REGISTRATION_KEY`. This is the same remedy the `260908-geq-p33-validator-parity` quick task applied to the email-validator divergence: *"import the identical function the server uses instead of a hand-rolled approximation"*, and it should be pinned in the plan's `key_links` with a `pattern` regex the way that plan did.

**Layer 2 — the call-site proof (this is the "structural" part).** A behavioural test proves the answers agree; a spy proves the *code paths* are the same object:

```js
import * as appSettings from '../utils/appSettings.js';

it('the public query and register route through the SAME accessor (D-07)', async () => {
  const spy = vi.spyOn(appSettings, 'isPublicRegistrationEnabled');
  try {
    await graphql(PUBLIC_REGISTRATION_ENABLED_QUERY);
    expect(spy).toHaveBeenCalledTimes(1);
    await graphql(REGISTER_MUTATION, TOKENLESS_VARS);
    expect(spy).toHaveBeenCalledTimes(2);   // register did NOT read the row itself
    await graphql(PUBLIC_REGISTRATION_SETTING_QUERY, {}, admin);
    expect(spy).toHaveBeenCalledTimes(3);
  } finally {
    spy.mockRestore();
  }
});
```

This idiom is **already proven to work in this repo on an ESM namespace**: `register.test.js:461` does `vi.spyOn(authUtils, 'createVerificationToken')` and the resolver's behaviour changes accordingly. If anyone later inlines a second `findByPk` into `register`, this count assertion goes red immediately — a grep-based source-reading test would be weaker and there is no precedent for one here.

**Layer 3 — the five-state agreement table.** Behaviour, not structure. Both the absolute value *and* the agreement must be asserted; asserting only the agreement is how a test passes while both sides are wrong together (which is literally what happened in 32-REVIEW.md CR-01 and again in Phase 33).

```js
const STATES = [
  ['row = "true"',   () => setValue('true'),   true ],
  ['row = "false"',  () => setValue('false'),  false],
  ['row = garbage',  () => setValue('yes'),    false],
  ['row absent',     () => deleteRow(),        false],
  ['read throws',    () => throwOnRead(),      false],   // mockRejectedValue, NOT ...Once
];

for (const [label, setup, expected] of STATES) {
  it(`query and register agree when ${label}`, async () => {
    await setup();

    const q = await graphql(PUBLIC_REGISTRATION_ENABLED_QUERY);
    const r = await graphql(REGISTER_MUTATION, TOKENLESS_VARS);   // strong password!

    const queryAnswer     = q.data.publicRegistrationEnabled;
    const registerAccepted = r.errors === undefined;

    expect(queryAnswer).toBe(expected);            // pins the ABSOLUTE value (D-02)
    expect(registerAccepted).toBe(queryAnswer);    // pins the AGREEMENT   (D-07)
    if (!expected) expect(r.errors[0].message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
  });
}
```

Note `registerAccepted` is a clean discriminator **because of** the uniform-response guard: with valid inputs, a tokenless `register` returns success on *every* outcome (taken email, free email, create failure), so the only way it produces an error is the closed door. The third assertion pins that, so a password/name/email validation error cannot masquerade as a refusal.

**`mockRejectedValue`, not `mockRejectedValueOnce`, for the throwing-read case** — the test makes two calls (query and register) and both must see the throw. This is a genuinely easy mistake that would make the register half of that row silently test the wrong thing.

### Pattern 4: The flip mutation — one transaction, audit awaited

```js
setPublicRegistrationEnabled: async (_parent, { enabled }, { models, user }) => {
  requireAdmin(user);                       // reused verbatim, auth.js:42
  const sequelize = models.AppSetting.sequelize;
  let row;
  await sequelize.transaction(async (t) => {
    const previous = await isPublicRegistrationEnabled(models);   // old value, for the audit
    [row] = await models.AppSetting.upsert(
      { settingKey: PUBLIC_REGISTRATION_KEY, value: enabled ? 'true' : 'false', updatedById: user.id },
      { transaction: t }
    );
    await writeAuditLog(
      models,
      {
        action: 'setting.public_registration_changed',
        actorUserId: user.id,
        metadata: { setting: PUBLIC_REGISTRATION_KEY, from: previous, to: enabled }
      },
      { transaction: t }                    // D-03: awaited, in-transaction
    );
  });
  return buildSettingPayload(models, row);
},
```

**Why in-transaction rather than fire-and-forget, against the five existing call sites' precedent (E-10).** The existing fire-and-forget callers all record a side-fact about an operation whose primary effect is durably visible elsewhere (a user row flipped to `Active`, an invitation consumed). D-03 makes the audit row the **only** history for a value that overwrites itself — a lost write is unrecoverable information, and it is exactly the spam-incident trace D-03 was chosen to preserve. It also keeps `updatedById`/`updatedAt` (which D-06 renders) from disagreeing with the audit trail. `audit.js`'s own header explicitly anticipates this mode and the helper already forwards `options` to `create`, so no helper change is needed. The plan should note this is the first in-transaction caller so a reviewer does not read it as an inconsistency.

**`upsert` vs `update`:** `upsert` is required, not cosmetic — D-02 allows the row to be absent, and an admin flipping the switch on a row-less database must create it, not silently no-op. `models.User.upsert` is not used elsewhere in this codebase, so verify the return shape (`[instance, created]` on MySQL/MariaDB dialects) during implementation rather than assuming it.

### Pattern 5: Two queries, one predicate (F-01 resolution)

CONTEXT.md flags F-01: D-03 chose `AuditLog` as the history mechanism, D-06 needs "who last changed it and when" cheaply on page load, and *"those two do not automatically compose."*

**Resolution: keep both, and say so.** `app_settings` carries `updatedAt`/`updatedById` as a denormalized display convenience **in addition to** the audit row — never instead of it. Rationale:

- D-01's own locked shape already contains `updatedAt DATETIME NOT NULL, updatedById INT NULL`, so the columns are not a new invention.
- Reading the display from `audit_logs` would need `WHERE action = … ORDER BY createdAt DESC LIMIT 1` plus a join to `users` for the name — two queries where the row you already read has the answer.
- D-03's ban is specifically on *"silently drop[ping] the audit row in favour of the columns"*. Writing both, atomically (Pattern 4), honours it exactly.

Schema shape:

```graphql
extend type Query {
  publicRegistrationEnabled: Boolean!            # PUBLIC, unauthenticated (D-07, exact name locked)
  publicRegistrationSetting: PublicRegistrationSetting!   # requireAdmin -- D-06's attribution
}
extend type Mutation {
  setPublicRegistrationEnabled(enabled: Boolean!): PublicRegistrationSetting!
}
type PublicRegistrationSetting {
  enabled: Boolean!
  updatedAt: String
  updatedByName: String
}
```

Two root fields rather than one is deliberate: `publicRegistrationEnabled` is called by an **anonymous** visitor, and attaching the admin's name and the flip timestamp to it would publish who administers the system and when they acted, on a public page. (34-UI-SPEC.md applies the same reasoning to its "do not tell the visitor the door just closed" rule.) The admin query supplies attribution; both resolve `enabled` through the one accessor, and Pattern 3 Layer 2's spy count covers all three call sites.

A single-field alternative — one `publicRegistration: PublicRegistrationState!` with `updatedAt`/`updatedByName` nulled for non-admins, the established pattern at `familyMember.schema.js:36-38` (`createdBy`/`updatedBy` "resolved to the user only for an ADMIN viewer") — was considered and rejected only because D-07 names `publicRegistrationEnabled: Boolean!` literally.

### Pattern 6: The SEC-04 matrix

Harness: the `graphql()` helper with an authenticated non-admin, matching `createInvitation.test.js:102-109`.

```js
const NON_ADMIN_CELLS = [
  // [label, operation, variables, expectedMessage, coveredBy]
  ['createInvitation', CREATE_INVITATION, { input: { invitedEmail: 'x@example.com' } },
     'Admin access is required.', 'createInvitation.test.js:102'],
  ['approveUser',  APPROVE, { userId: '1' }, 'Admin access is required.', 'approveReject.test.js'],
  ['rejectUser',   REJECT,  { userId: '1' }, 'Admin access is required.', 'approveReject.test.js'],
  ['pendingApprovals', PENDING, {}, 'Admin access is required.', null],
  ['myInvitations',    MY_INVITES, {}, 'Admin access is required.', null],
  ['invitations',      ALL_INVITES, {}, 'Admin access is required.', null],
  ['setUserPassword',  SET_PW, {...}, 'Admin access is required.', 'setUserPassword.test.js:26'],
  ['linkUserToMember', LINK, {...}, 'Admin access is required.', null],
  ['deleteMember',     DELETE_MEMBER, { id: '1' }, 'Admin access is required.', null],
];
```

**Three cells that are not "non-admin" and need their own actors:**
1. **Anonymous, door closed → tokenless `register` refused.** SEC-04's third clause. Actor is `null`, not a non-admin.
2. **Anonymous, door closed → invited `register` still works.** The D-08 control. Without it, a matrix could be green because the switch broke *all* registration.
3. **Admin, door closed → tokenless `register` still refused.** The switch is not a permission; being an admin does not reopen the door for yourself.

**D-11's "reference rather than duplicate" tension, and a recommendation.** D-11 says the matrix "covers cells they do not, and references rather than duplicates the ones they do". A *reference* that is not executed rots the moment the referenced test is renamed or moved. Recommendation: keep every cell in one readable table (that is what makes it the proof artifact D-11 wants) with a `coveredBy` column naming the pre-existing per-resolver test, and **still execute all of them** — each cell is a sub-millisecond `executeOperation` call. The `coveredBy` column is the reference; execution is what makes the artifact a proof rather than an index. Flag this to the user if the planner reads D-11 as forbidding execution.

**Positive controls.** Each refusal cell should have an admin counterpart asserting the same operation does *not* produce `'Admin access is required.'` (it may legitimately produce `'User not found.'`, `'Member not found.'`, etc.). Without a control, a matrix stays green even if the actor construction is broken and every call is failing for an unrelated reason — a fresh instance of "the test and the guard shared the same blind spot". `vi.mock('../services/mailer.js', …)` is required for the `createInvitation` control (existing idiom: `register.test.js:7-12`).

### Pattern 7: The SEC-05 schema-driven sweep

Harness: **HTTP + a real token** (E-4). Structure:

```js
import { buildSchema, parse, validate } from 'graphql';
import { typeDefs } from '../schemas/index.js';
import { httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { signToken } from '../utils/auth.js';

const schema = buildSchema(typeDefs.join('\n'));
const AUTH_ERROR = 'You must be logged in to perform this action.';

// THE SECURITY SURFACE. A field is authenticated unless someone deliberately
// writes it down here. Adding a name to this list is a reviewable act.
const PUBLIC_ALLOWLIST = new Set([
  'register', 'login', 'requestPasswordReset', 'resetPassword',
  'verifyEmail', 'resendVerificationEmail', 'publicRegistrationEnabled'
]);
// Fields that legitimately resolve to null for an unauthenticated caller
// instead of throwing. NOT the same as public -- each gets its own assertion.
const NULL_RESULT_FIELDS = new Set(['me']);

// ... buildOperation(opKind, name, field) exactly as prototyped in E-2 ...

for (const [opKind, rootType] of [['query', schema.getQueryType()], ['mutation', schema.getMutationType()]]) {
  for (const [name, field] of Object.entries(rootType.getFields())) {
    if (PUBLIC_ALLOWLIST.has(name)) continue;

    it(`${opKind} ${name} refuses a Pending self-registrant's token`, async () => {
      const pending = await createTestUser({ status: 'Pending', emailVerified: true, email: `p-${name}@example.com` });
      const { query, variables } = buildOperation(opKind, name, field);

      // (1) The operation we are about to send must be SEMANTICALLY VALID.
      //     Without this, a validation error would read as a refusal and the
      //     whole sweep would be vacuous.
      expect(validate(schema, parse(query))).toEqual([]);

      const res = await httpClient()
        .post('/graphql')
        .set('Authorization', `Bearer ${signToken(pending)}`)
        .send({ query, variables });

      if (NULL_RESULT_FIELDS.has(name)) {
        expect(res.body.errors).toBeUndefined();
        expect(res.body.data[name]).toBeNull();
        return;
      }

      // (2) Exact guard message -- every guard funnels through requireAuth (E-1).
      expect(res.body.errors[0].message).toBe(AUTH_ERROR);
      // (3) path proves the FIELD'S OWN RESOLVER ran and threw. A validation
      //     error has no path at all (E-3). This is the reachability proof.
      expect(res.body.errors[0].path).toEqual([name]);
    });
  }
}

// Exhaustiveness: a new root field is authenticated by default. If someone
// adds one that is neither guarded nor allowlisted, the loop above fails it.
// This second assertion additionally pins the allowlist against drift.
it('the public allowlist has not silently grown', () => {
  expect([...PUBLIC_ALLOWLIST].sort()).toEqual([
    'login', 'publicRegistrationEnabled', 'register', 'requestPasswordReset',
    'resendVerificationEmail', 'resetPassword', 'verifyEmail'
  ]);
});
```

**Scope honesty.** The sweep covers *root* fields. Nested field resolvers (`Invitation.inviter`, `FamilyMember.createdBy`) are unreachable without first passing a guarded root field, so root-level coverage is sufficient for SEC-05's claim — but the test file should say so rather than leave a reader to wonder.

**The non-GraphQL surface SEC-05 also covers.** `backend/src/routes/photo.routes.js` mounts three Express routes at `/api/family-members/:id/photo` (POST `:44`, DELETE `:121`, GET `:161`). All three call `getUserFromRequest` and then `requireAuth`, mapping the throw to **401** (`:23-35`, `:168-172`). A Pending user's token therefore gets 401 on all three — but nothing currently asserts it, and SEC-05 says *"any authenticated surface"*, not "any GraphQL resolver". Add three cells:

```js
it.each(['get', 'post', 'delete'])('photo route %s rejects a Pending token with 401', async (method) => {
  const res = await httpClient()[method]('/api/family-members/1/photo')
    .set('Authorization', `Bearer ${signToken(pending)}`);
  expect(res.status).toBe(401);
});
```

### Pattern 8: Test-harness seeding (Wave 0)

```js
// backend/src/utils/appSettings.js  -- one seeding definition, used by both test hooks
export async function seedDefaultAppSettings(models) {
  await models.AppSetting.findOrCreate({
    where: { settingKey: PUBLIC_REGISTRATION_KEY },
    defaults: { value: 'true', updatedById: null }
  });
}
```

```js
// backend/test/globalSetup.js  -- after sync({ force: true })
await seedDefaultAppSettings(models);

// backend/test/helpers.js resetTables() -- inside the FK-checks-off block
await models.AppSetting.destroy({ where: {}, truncate: true });
// ... existing truncations ...
await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
await seedDefaultAppSettings(models);   // production-equivalent: door open
```

**This function must NOT be called from `initializeDatabase()`** (E-9): a boot-time `findOrCreate` would silently re-open a door whose row was wiped, contradicting D-02's stated reason for existing.

### Anti-Patterns to Avoid

- **Reading `app_settings` directly from `user.resolver.js`.** Even one inline `findByPk` recreates the divergence. `user.resolver.js` imports `isPublicRegistrationEnabled` and nothing else from the settings module.
- **Caching the value.** Any TTL breaks "stopped in seconds"; any second store breaks D-07.
- **Matching the server's refusal message string on the client.** Explicitly forbidden by 34-UI-SPEC.md; it is the same tier error as D-07. Re-query instead.
- **Optimistic UI on the flip.** 34-UI-SPEC.md: the `Switch`'s `checked` prop is driven only by the last server-confirmed value.
- **`expect(errors).toBeDefined()` as the sweep's assertion.** A validation error satisfies it. Assert the exact message *and* the path.
- **Using `graphql(op, vars, pendingUser)` for the sweep.** Bypasses the chokepoint; tests a state production cannot reach (E-4).
- **An agreement test that only asserts agreement.** Both sides wrong together still passes. Pin the absolute value too.
- **`mockRejectedValueOnce` for the throwing-read case.** Only the first of two calls sees the throw.
- **Two copies of the invitation-only JSX in `Register.jsx`.** 34-UI-SPEC.md requires one `renderInvitationOnly()` with two call sites.
- **Auto-seeding at boot.** Silently undoes a deliberate close (E-9).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Enumerating root fields | A regex over the `#graphql` template literals | `buildSchema(typeDefs.join('\n')).getQueryType().getFields()` | Handles `extend type` across four files, comments, and multi-line args. Verified: 12 + 20 fields |
| Deciding whether a generated query is well-formed | Eyeballing it / trusting `errors.length > 0` | `validate(schema, parse(query))` from `graphql` | The single mechanism that stops the sweep being vacuous (E-2/E-3) |
| Distinguishing refusal from malformed query | Substring-matching error text | `extensions.code` + `path` (measured in E-3) | `path` is populated only in the execution phase — it *is* the reachability proof |
| Building the schema | `makeExecutableSchema` from `@graphql-tools/schema` | `buildSchema` from `graphql` | `graphql` is a declared direct dep; `@graphql-tools` is transitive and hoisting-dependent |
| Admin guard on the flip mutation | A new role check | `requireAdmin(user)` (`auth.js:42`) | Already throws the exact message the SEC-04 matrix asserts |
| Audit row | A new `settings_history` table | `writeAuditLog` (`audit.js:5`) | D-03 names it; `audit_logs` already has `KEY idx_audit_action` |
| Schema migration tooling | Introducing Umzug/sequelize-cli | A numbered file in `backend/migrations/manual/` + a README section | README:248-250 documents the house process; adding a framework is out of scope and would need a backfill of 020 prior migrations |
| Frontend GraphQL client | Apollo Client / urql | `graphqlRequest` (`api/graphqlClient.js:23`) | The app has no GraphQL client library by design; `ME_QUERY` in `AuthContext.jsx:6` is the template |
| Test-mock ordering | `mockResolvedValueOnce` chains | Query-dispatching `mockImplementation` | `InvitationsPage.test.jsx:18-22`'s pattern survives inserting a new query; `Once` chains do not (E-6) |

**Key insight:** every mechanism this phase needs already exists in the codebase — `requireAdmin`, `writeAuditLog`, `getUserFromRequest`, `graphqlRequest`, `httpClient`, `resetTables`, the manual-migration convention. The only genuinely new artifact is the settings table and its one accessor. The phase's difficulty is not in building things; it is in *not* building a second copy of the one predicate.

## Common Pitfalls

### Pitfall 1: A validation error read as an authorization refusal (makes the whole sweep vacuous)

**What goes wrong:** the sweep sends `mutation { addChild }` with no arguments, gets an error, and passes. It has proven nothing — graphql-js rejected the document before any resolver ran, and would do so identically for an admin, an anonymous caller, or a completely unguarded resolver.
**Why it happens:** generating a *valid* call for 32 heterogeneous signatures looks hard, so the tempting shortcut is to send a minimal query and assert "some error".
**How to avoid:** generate real variables and selection sets (E-2, prototype verified 32/32), assert `validate(schema, parse(query))` is empty *before* executing, and assert the exact guard message plus `path === [field]` after.
**Warning signs:** the sweep's assertion is `expect(errors).toBeDefined()` or a regex; `extensions.code` is never inspected; deleting a `requireAdmin` call does not turn the sweep red.

### Pitfall 2: Proving the wrong claim by using the wrong harness

**What goes wrong:** the sweep uses `graphql(op, vars, pendingUser)`, injecting a Pending `User` into `contextValue`. `requireAuth` accepts it, most fields succeed, and the author "fixes" it by adding status checks to individual resolvers — building new authorization logic SEC-05 says already exists.
**Why it happens:** `helpers.js`'s `graphql()` is the file's default idiom and 44 test files use it.
**How to avoid:** SEC-05's gate is `getUserFromRequest` at `auth.js:33`. Only the HTTP path runs it. Use `httpClient()` + `signToken(pending)`.
**Warning signs:** the sweep never imports `httpClient` or `signToken`; resolvers gain `if (user.status !== 'Active')` checks.

### Pitfall 3: `assertPasswordStrength` runs before the switch check

**What goes wrong:** `assertPasswordStrength(password)` is at `:179`, above the `if (token)` branch, so it runs for both paths. A tokenless register with a weak password and a closed door throws the password error, not the closed-door message. An agreement test using `'weak'` as the password would then see an error and conclude "refused" for the wrong reason — and would keep passing after the switch check was deleted.
**Why it happens:** the natural mental model is "the switch check is first", but it is first *within the tokenless branch*, not first in the resolver.
**How to avoid:** every agreement/matrix case must use a password that satisfies `passwordPolicy.js` (existing tests use `'Password123!'`), and must assert the exact closed-door message rather than merely `errors.length > 0`.
**Warning signs:** a refusal test that does not assert the message text; a test that still passes with the switch check commented out.
*(Hoisting the check above `:179` inside an `if (!token)` was considered. It is not recommended: it duplicates the branch condition, and a password-policy error on a closed door leaks nothing — the door state is public by design, and 34-UI-SPEC.md's re-query fallback renders the invitation-only message correctly regardless of which error came back.)*

### Pitfall 4: The allowlist becomes a dumping ground

**What goes wrong:** a guarded field's sweep row fails during implementation for an incidental reason and gets "temporarily" allowlisted. The list silently grows and the sweep stops inverting the default — the exact failure D-12 exists to prevent.
**Why it happens:** the allowlist is the one place a red row can be made green in five seconds.
**How to avoid:** the second assertion pinning the allowlist against a literal sorted array (Pattern 7). Any addition then requires editing two places and shows up as a deliberate diff in review.
**Warning signs:** the allowlist contains anything other than the 7 names in E-1; `me` appears in it.

### Pitfall 5: Existing tests go red for reasons unrelated to the feature

**What goes wrong:** `register.test.js`'s tokenless cases fail because `resetTables` leaves `app_settings` empty and D-02 fails closed. `Register.test.jsx`'s four tokenless tests fail because the form is now behind a loading gate. Both look like feature bugs and are not.
**How to avoid:** treat both as **Wave 0** (E-5, E-6): the `resetTables`/`globalSetup` seeding change lands before the `register` guard; the `Register.test.jsx` migration to async + query-dispatching mocks lands with (or before) the `Register.jsx` gate.
**Warning signs:** a wave-1 task's verify command shows ~25 unrelated `register.test.js` failures.

### Pitfall 6: `key` as a column name, and model/migration type drift

**What goes wrong:** `CREATE TABLE app_settings (key VARCHAR(64) ...)` is a syntax error (`KEY` is reserved). Separately, `DataTypes.STRING` is `VARCHAR(255)`, so a model that says `STRING` while the migration says `VARCHAR(64)` gives the test DB and production DB different schemas with nothing to detect it (E-8).
**How to avoid:** name the column `settingKey`; write `DataTypes.STRING(64)` and `DataTypes.STRING(255)` explicitly to mirror the migration exactly.
**Warning signs:** unquoted `key` anywhere in the `.sql` file; a bare `DataTypes.STRING` in `AppSetting.js`.

### Pitfall 7: MariaDB locally, MySQL 8.4 in CI

**What goes wrong:** a migration that works on the developer's MariaDB 10.5 fails in CI's `mysql:8.4` (`.github/workflows/ci.yml`). Migration 018 already hit a utf8mb4-collation version of this, and migration 020's header records the lesson.
**How to avoid:** stay on the portable subset — `CREATE TABLE IF NOT EXISTS`, `VARCHAR`, `DATETIME`, `INT UNSIGNED`, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, exactly as `017-create-audit-logs.sql` does. `VARCHAR(64)` with utf8mb4 is 256 bytes as a PRIMARY KEY, far under InnoDB's 3072-byte index limit on both engines.
**Warning signs:** a `COLLATE` clause, a generated column, or `CHECK` constraints in the migration.

### Pitfall 8: Killing a test run wedges the test database

**What goes wrong:** a SIGKILLed vitest leaves a `TRUNCATE` holding a metadata lock that blocks the next run's `sync({ force: true })` forever. The symptom is a hang immediately after the vitest banner at near-zero CPU; `KILL <id>` does not clear it.
**How to avoid:** never run two processes against `portofolio_test` at once, never background a full-suite run and start another. The backend suite takes roughly 6 minutes — run it once, serially, and wait. Recovery needs a full MariaDB stop / `pkill` / start ladder.
*(Recorded in the user's memory as `mariadb-wedged-by-killed-vitest`; restated here because this phase's plans will run the suite repeatedly for D-13 mutation testing.)*

## Runtime State Inventory

This is not a rename/refactor phase, but it **adds new persistent state**, so the same discipline applies in reverse: what will exist at runtime that no file in the repo describes?

| Category | Items | Action required |
|----------|-------|-----------------|
| Stored data | **New:** `app_settings` table, one row `public_registration_enabled = 'true'`. Nothing existing is modified or migrated. Production was checked at v4.1 scoping (3 Active users, 0 Pending) and no data is affected by this phase. | Migration 021 creates + seeds. Test harness seeds separately (Pattern 8) |
| Live service config | **None.** No n8n workflow, Datadog service, Tailscale ACL, or Cloudflare Tunnel references public registration. The switch's state lives only in the app's own MySQL. Verified: the only external services in this repo are SMTP (nodemailer) and the Docker Compose MySQL | none |
| OS-registered state | **None.** No scheduled task, pm2 process name, launchd plist, or systemd unit is affected. Deployment is `docker compose` (`docker-compose.yml`, `npm run docker:remote`) | none |
| Secrets / env vars | **None — and this is load-bearing.** Phase 32 D-03 bans an env-var switch and D-01 restates the ban: do not add `PUBLIC_REGISTRATION_ENABLED` to `env/*.env`, `docker-compose.yml`, `.github/workflows/ci.yml`, or `config/env.js`, and do not let any env value override the stored row | none — actively verify none is added |
| Build artifacts | **None.** No compiled output, no egg-info equivalent, no image tag depends on this | none |
| **Deployment-order hazard** | Migration 021 must be applied **before** the new backend serves traffic. If it is not, `sync()` silently creates an empty `app_settings` and D-02 fails the door **closed** — safe, but confusing, and an operator's only signals are the `console.warn` (Pattern 1) and the admin UI reading CLOSED | README § Manual Database Migrations gets a 021 section with apply + boot-and-verify steps, matching README:252-330's format for every prior migration |

## Code Examples

### The verified query synthesizer (extract from the working prototype — E-2)

```js
// Source: prototyped and executed this session against backend/src/schemas/index.js
import {
  buildSchema, parse, validate,
  isNonNullType, isListType, isScalarType, isEnumType, isObjectType, isInputObjectType
} from 'graphql';

const unwrap = (t) => (isNonNullType(t) || isListType(t) ? unwrap(t.ofType) : t);

function selectionFor(type, depth = 0) {
  const named = unwrap(type);
  if (isScalarType(named) || isEnumType(named)) return '';
  if (depth > 3) return ' { __typename }';
  const fields = named.getFields();
  for (const f of Object.values(fields)) {
    const ft = unwrap(f.type);
    if ((isScalarType(ft) || isEnumType(ft)) && f.args.every((a) => !isNonNullType(a.type))) {
      return ` { ${f.name} }`;
    }
  }
  for (const f of Object.values(fields)) {
    const ft = unwrap(f.type);
    if (isObjectType(ft) && f.args.every((a) => !isNonNullType(a.type))) {
      return ` { ${f.name}${selectionFor(f.type, depth + 1)} }`;
    }
  }
  return ' { __typename }';
}

function dummyValue(type) {
  if (isNonNullType(type)) return dummyValue(type.ofType);
  if (isListType(type)) return [dummyValue(type.ofType)];
  if (isEnumType(type)) return type.getValues()[0].name;
  if (isInputObjectType(type)) {
    const out = {};
    for (const f of Object.values(type.getFields())) {
      if (isNonNullType(f.type)) out[f.name] = dummyValue(f.type);
    }
    return out;
  }
  switch (type.name) {
    case 'ID': return '1';
    case 'Int': return 1;
    case 'Float': return 1.0;
    case 'Boolean': return true;
    default: return 'x';
  }
}

export function buildOperation(opKind, fieldName, field) {
  const varDefs = [], argStrs = [], variables = {};
  for (const arg of field.args) {
    if (!isNonNullType(arg.type)) continue;         // only REQUIRED args
    const varName = `v_${arg.name}`;
    varDefs.push(`$${varName}: ${arg.type.toString()}`);
    argStrs.push(`${arg.name}: $${varName}`);
    variables[varName] = dummyValue(arg.type);
  }
  const varPart = varDefs.length ? `(${varDefs.join(', ')})` : '';
  const argPart = argStrs.length ? `(${argStrs.join(', ')})` : '';
  return {
    query: `${opKind} Sweep${varPart} { ${fieldName}${argPart}${selectionFor(field.type)} }`,
    variables
  };
}
```

### Authenticated HTTP call with a real token

```js
// Source: backend/src/resolvers/sessionRevocation.test.js:92-96 (existing, verified)
const res = await httpClient()
  .post('/graphql')
  .set('Authorization', `Bearer ${token}`)
  .send({ query: ME_QUERY });
expect(res.body.data.me).toBeNull();
```

### Injecting a throwing read (existing idiom)

```js
// Source: backend/src/resolvers/register.test.js:438 (existing, verified)
const spy = vi.spyOn(models.User, 'findOne').mockRejectedValueOnce(new Error('...'));
try { /* ... */ } finally { spy.mockRestore(); }
// For the D-02 throwing-read agreement case use mockRejectedValue (no "Once"):
// the test makes TWO calls (public query + register) and both must see the throw.
```

### Spying on an ESM namespace (proves the shared-accessor call sites)

```js
// Source: backend/src/resolvers/register.test.js:461 (existing, verified to change resolver behaviour)
import * as authUtils from '../utils/auth.js';
const tokenSpy = vi.spyOn(authUtils, 'createVerificationToken').mockImplementationOnce(() => {
  throw new Error('crypto.randomBytes failed');
});
```

### Query-dispatching frontend mock (survives adding a query)

```js
// Source: frontend/src/pages/InvitationsPage.test.jsx:18-22 (existing, verified)
graphqlRequest.mockImplementation((query) => {
  if (query.includes('myInvitations')) return Promise.resolve({ myInvitations: [] });
  if (query.includes('pendingApprovals')) return Promise.resolve({ pendingApprovals: [] });
  return Promise.resolve({});
});
```

### Migration 021 skeleton (portable subset only — Pitfall 7)

```sql
-- Manual, one-time migration (Phase 34 / ADMIN-01 / D-01).
--
-- Generic key/value settings store. Chosen over a typed single-row config
-- table so a future flag is a row, not another migration (D-01).
--
-- Seeded OPEN so a correctly-deployed system behaves exactly as production
-- does today. The READ path fails CLOSED on an absent row or a failed read
-- (D-02) -- see backend/src/utils/appSettings.js. Do NOT re-seed at boot:
-- that would silently undo a deliberate close (D-02's stated reason).
--
-- Column is settingKey, not key: KEY is a MySQL reserved word and would need
-- backtick-quoting in every ad-hoc query.
--
-- updatedById is a plain unassociated column with no FK, matching
-- users.approvedBy's precedent -- keeps this table out of the test reset
-- helper's foreign-key dance.
--
-- Portability: VARCHAR/DATETIME/INT UNSIGNED/utf8mb4 only. No COLLATE clause
-- (018's cross-engine pitfall), no CHECK, no generated columns -- identical
-- on local MariaDB 10.5 and CI's mysql:8.4.

CREATE TABLE IF NOT EXISTS app_settings (
  settingKey VARCHAR(64) NOT NULL,
  value VARCHAR(255) NOT NULL,
  updatedAt DATETIME NOT NULL,
  updatedById INT UNSIGNED NULL DEFAULT NULL,
  PRIMARY KEY (settingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (settingKey, value, updatedAt, updatedById)
VALUES ('public_registration_enabled', 'true', UTC_TIMESTAMP(), NULL)
ON DUPLICATE KEY UPDATE settingKey = settingKey;   -- idempotent: never clobbers a set value
```

## Discretion Answers

Every "Claude's Discretion" bullet from CONTEXT.md, answered with a recommendation the planner can adopt or overrule.

| Discretion item | Recommendation | Why |
|-----------------|----------------|-----|
| Setting key name | `public_registration_enabled` | Reads correctly in an audit `metadata` blob and in a raw SQL row |
| Column name | **`settingKey`, not `key`** | `KEY` is a MySQL reserved word (E-7) |
| Migration slug | `021-create-app-settings.sql` | Matches `016-create-invitations.sql` / `017-create-audit-logs.sql` verb form |
| Does the accessor cache? | **No cache** | A cache is a second source of truth (D-07); any TTL breaks "stopped in seconds" (ADMIN-01); saves one PK lookup |
| Flip mutation name/signature | `setPublicRegistrationEnabled(enabled: Boolean!): PublicRegistrationSetting!` | Explicit boolean beats a `toggle` with no argument — a toggle races two admins into flipping past each other; returning the full setting lets the client re-render from the server-confirmed value (34-UI-SPEC.md forbids optimistic flips) |
| Visual composition | Follow **34-UI-SPEC.md** verbatim — it is an approved contract, not a suggestion | It cites `file:line` for every value and already resolves the medium-`Switch`, no-`Switch`-while-loading, and green/amber-rejected questions |
| Copy | 34-UI-SPEC.md's Copywriting Contract, verbatim. Server refusal message: recommend `'Registration is currently by invitation only.'` | Mirrors the UI's `<Alert severity="info">` first sentence, so a visitor who somehow sees the raw error reads the same thing |
| Rate-limit `publicRegistrationEnabled`? | **No** | `RATE_LIMITS`' own header comment reserves the map for expensive auth mutations ("do not add `logout`, `me`, or `dashboard` here"); the read is one PK lookup on a CORS-restricted endpoint; the door state is public by design so there is nothing to probe; and a rate-limited visitor would see the *wrong* `/register` surface — an ADMIN-02 regression |
| Surface state to non-admins? | **No** | 34-UI-SPEC.md already answers this: the `isAdmin` wrapper in `InvitationsPage.jsx` mirrors the existing belt-and-braces check at `:18`. `publicRegistrationEnabled` is public but carries no attribution |
| Test-file placement | `security.boundaries.test.js` (D-11's matrix + sweep), `publicRegistrationSwitch.test.js` (D-02 states + D-07 agreement), `appSettings.test.js` (accessor unit tests), `PublicSignupSwitch.test.jsx` (component) | Keeps D-11's proof artifact readable top-to-bottom without the switch's own unit coverage diluting it |
| Pin the allowlist with a second assertion? | **Yes** | It is the only thing standing between the allowlist and Pitfall 4 |
| F-01 (audit vs denormalized columns) | **Both**, written atomically in one transaction | D-01's shape already has the columns; D-03 forbids dropping the audit row; Pattern 4/5 |
| Audit write: in-transaction or fire-and-forget? | **In-transaction, awaited** | The audit row is the *only* history for a self-overwriting value (D-03); `audit.js`'s header anticipates this mode; first such caller in the codebase, so annotate it (E-10) |

## State of the Art

| Old approach | Current approach | When changed | Impact here |
|--------------|------------------|--------------|-------------|
| Apollo Server 3 `formatError` masking + `server.schema` getter | Apollo Server 4's `unwrapResolverError` / `extensions.code`; schema is not exposed as a public getter | AS 3→4 | Build the schema with `buildSchema` rather than reaching into the server instance; discriminate errors on `extensions.code` + `path` (measured in E-3) |
| `buildASTSchema` + explicit `extendSchema` for SDL type extensions | `buildSchema` resolves `extend type` within one document | graphql-js 15+ | Concatenating the four typedef strings and calling `buildSchema` once is sufficient — verified |
| `sequelize.sync({ alter: true })` for schema evolution | Numbered hand-written SQL under `backend/migrations/manual/` + README boot-and-verify | project convention since Phase 9 | Migration 021 follows it; do not introduce a migration framework |
| `pendingRegistrations` (invitation-flow queue) | `pendingApprovals` — the one queue | Phase 33 D-10 | D-10 says nothing in this phase touches it; the sweep enumerates `pendingApprovals` only |

**Deprecated / stale within this repo:**
- `.planning/codebase/TESTING.md` is dated **2026-07-11** and states *"No test runner is installed or configured"* — written before the v1.0 testing milestone. It is listed as a canonical reference in 34-CONTEXT.md but describes a codebase that no longer exists (there are now 69 backend and 43 frontend test files, Vitest 4.1.10 in both workspaces). **Do not plan against it.** The live description of the test infrastructure is the Validation Architecture section below.
- `CLAUDE.md` § Technology Stack says Node 18.x pinned by `.nvmrc` and `engines`. The manifests now say `"node": "24.x"` (root, backend, frontend) and the local runtime is **v24.15.0**. CI uses `node-version-file: '.nvmrc'`. Not a blocker for this phase, but do not "fix" anything to 18.
- `CLAUDE.md` § Frameworks says *"no test framework, test config, or test files found in either workspace"* — same staleness as TESTING.md.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | `models.AppSetting.upsert` returns `[instance, created]` on the mysql dialect | Pattern 4 | Low. `upsert` is not used anywhere in this codebase today, so the return shape is from training knowledge, not observation. Verify during implementation; if it differs, re-read the row after the upsert. Flagged in Pattern 4 |
| A2 | `console.warn` in the accessor will not flood logs | Pattern 1 | Low. There is no polling in 34-UI-SPEC.md's design, and the warn only fires in the misconfigured absent-row state |
| A3 | The backend suite takes roughly 6 minutes | Validation Architecture | Low; taken from the user's own recorded note and consistent with the run measured this session |
| A4 | Adding two statements to `resetTables()` will not materially slow the suite | E-5 / Pattern 8 | Low. A `TRUNCATE` + `findOrCreate` on a one-row table is sub-millisecond; `resetTables` already issues seven statements |
| A5 | The SEC-04 positive-control block's mutations will not leave cross-test residue | Pattern 6 | Low. `beforeEach(resetTables)` runs between every test, and `vi.mock` on the mailer prevents outbound email |

Everything else in this document is either `[VERIFIED]` by execution in this session (E-1 through E-7, the field lists, the error shapes, the synthesizer, the version numbers) or `[CITED]` to a file:line in this repository or to the MySQL 8.4 keyword reference.

## Open Questions

1. **Should a boot-time assert guard migration 021, like `assertRequiredColumns` guards 020?**
   - *What we know:* `initializeDatabase()` runs `sequelize.sync()` **before** `assertRequiredColumns` (`models/index.js:120-134`), and `sync()` creates missing tables. So a table-existence assert can never fire. A row-existence assert *would* fire — but it would crash the backend in exactly the state D-02 says should fail closed rather than fail loudly.
   - *What's unclear:* whether the operator's signal (a `console.warn` + the admin UI showing CLOSED) is considered sufficient, or whether a hard boot failure is preferred.
   - *Recommendation:* no boot assert. Warn at read time, document migration 021 in the README with the standard boot-and-verify steps, and rely on ADMIN-03's own surface. Worth one sentence to the user at plan-review, since the 020 precedent makes the opposite choice look like an omission.

2. **Does D-11's "references rather than duplicates" forbid *executing* the already-covered cells?**
   - *What we know:* D-11 wants a matrix readable top-to-bottom as "here is the whole boundary", and says the new file "covers cells they do not, and references rather than duplicates the ones they do".
   - *What's unclear:* whether an executed cell that also names its `coveredBy` counts as duplication.
   - *Recommendation:* execute all cells, carry a `coveredBy` column. A reference that is not executed silently rots when the referenced test is renamed, and each cell costs well under a millisecond. Surface the reading to the user rather than deciding silently.

3. **Should the SEC-04 matrix include admin positive controls, given the extra runtime?**
   - *What we know:* `errors[0].path === [field]` already proves the resolver ran (E-3), so reachability is covered without a control. A control additionally guards against a broken actor fixture making everything fail for unrelated reasons.
   - *Recommendation:* include them for the SEC-04 matrix (9 cells, cheap, and the failure mode they catch is exactly "the test and the guard shared a blind spot"). Skip them for the 25-field SEC-05 sweep, where `path` plus the exact-message assertion already carries the proof and an admin pass would fire 20 real mutations.

4. **`Register.test.jsx`: migrate the whole file to `mockImplementation`, or only the four tokenless tests?**
   - *Recommendation:* the whole file. Mixing `Once` chains and dispatching mocks in one file is how the next person adds a query and breaks tests they did not touch.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | **v24.15.0** (manifests pin `"node": "24.x"`) | — |
| npm | workspaces | yes | 11.12.1 | — |
| MariaDB (local test DB) | backend integration tests | yes, running | 10.5.29 (`mariadbd` live, homebrew) | — |
| MySQL 8.4 | CI (`.github/workflows/ci.yml` service) | n/a locally | 8.4 image in CI | Portability constraints in Pitfall 7 cover the difference |
| Docker | `npm run docker:*`, not needed for this phase | yes | client 29.6.2 | — |
| `graphql` | the D-12 sweep | yes | 16.14.0 | — |
| `@apollo/server` | test harness + app | yes | 4.13.0 | — |
| `vitest` | both suites | yes | 4.1.10 | — |
| `supertest` | the SEC-05 HTTP harness | yes | 7.2.2 | — |
| `@graphql-tools/schema` | not used (see Alternatives) | hoisted transitively | — | not needed |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest **4.1.10** in both workspaces |
| Backend config | `backend/vitest.config.js` — `globalSetup: ['./test/globalSetup.js']`, `setupFiles: ['./test/setupRateLimit.js']`, `pool: 'forks'`, `fileParallelism: false`; sets `ENV_FILE=../env/test.env` and `NODE_ENV=test` at config-load time |
| Frontend config | `frontend/vitest.config.js` — `environment: 'jsdom'`, `setupFiles: ['./test/setup.js']` (jest-dom, jest-axe, `matchMedia` shim, `localStorage.clear()` + `cleanup()` in `afterEach`) |
| Backend DB harness | `globalSetup.js` → `assertTestDatabase()` then `sequelize.sync({ force: true, match: /_test$/ })`; teardown drops and closes |
| Per-test reset | `backend/test/helpers.js` `resetTables()` — FK checks off, truncate AuditLog → Invitation → Spouse → FamilyMember → User, FK checks on. **Must gain `app_settings` + reseed (Pattern 8)** |
| Resolver harness | `graphql(query, variables, user, clientIp)` — direct `executeOperation` with an injected context user |
| HTTP harness | `httpClient()` — `supertest(app)`; the only harness that runs `getUserFromRequest` |
| Quick run (backend) | `npx vitest run <file>` from `backend/` |
| Quick run (frontend) | `npx vitest run <file>` from `frontend/` |
| Full suite (backend) | `npm test --workspace backend` (~6 min) |
| Full suite (frontend) | `npm test --workspace frontend` |
| Workspace gate | `npm test --workspaces` (SC-5) |

### Current green baseline (measured this session)

| Workspace | Files | Tests | Result | Duration |
|-----------|-------|-------|--------|----------|
| backend | 69 passed (69) | **551 passed, 3 skipped** (554) | ✅ green | 348.3 s (~5 min 48 s) |
| frontend | 43 passed (43) | **482 passed** (482) | ✅ green | 8.5 s |
| **workspace total** | **112** | **1033 passed, 3 skipped** | ✅ green | ~6 min |

Both runs executed serially against the live local MariaDB 10.5.29 on 2026-09-09, `npm test --workspace backend` then `npm test --workspace frontend`, exit code 0 for each. The backend figure is the number Phase 34 must still show (plus its own additions) at the SC-5 gate.

The 3 skipped backend tests are pre-existing and unrelated to this phase; the planner should not treat their appearance as a regression introduced here.

**Test-hygiene rule that binds every plan in this phase.** Never run two test processes against `portofolio_test` concurrently, and never background a full-suite run and then start another. A SIGKILLed run leaves a `TRUNCATE` holding a metadata lock that blocks the next `globalSetup` `sync({ force: true })` indefinitely — the symptom is a hang right after the vitest banner at near-zero CPU, and `KILL` does not clear it (it needs a full MariaDB stop / `pkill` / start ladder). The backend suite takes ~6 minutes: run it once, serially, and wait. This matters more than usual here because D-13's mutation script requires several full-file runs in sequence.

### Phase Requirements → Test Map

| Req | Behaviour | Type | Automated command | File exists? |
|-----|-----------|------|-------------------|--------------|
| ADMIN-01 | Admin flip persists; non-admin refused; audit row written with from→to | integration | `npx vitest run src/resolvers/publicRegistrationSwitch.test.js` (backend) | ❌ Wave 1 |
| ADMIN-01 | Accessor: `'true'`→open, `'false'`/garbage/absent/throw→closed | unit | `npx vitest run src/utils/appSettings.test.js` (backend) | ❌ Wave 0 |
| ADMIN-01 | Switch region renders, closes with one click, confirms on open | component | `npx vitest run src/components/PublicSignupSwitch.test.jsx` (frontend) | ❌ Wave 2 |
| ADMIN-02 | Tokenless `register` refused while closed, with the exact message | integration | `npx vitest run src/resolvers/publicRegistrationSwitch.test.js` (backend) | ❌ Wave 1 |
| ADMIN-02 | Invited `register` still succeeds while closed (D-08 control) | integration | same file | ❌ Wave 1 |
| ADMIN-02 | Query/register agreement across all five states (D-07) | integration | same file | ❌ Wave 1 |
| ADMIN-02 | Both paths call the identical accessor (spy call-count) | integration | same file | ❌ Wave 1 |
| ADMIN-02 | `/register` shows the signup form when open, invitation-only when closed | component | `npx vitest run src/pages/Register.test.jsx` (frontend) | ⚠️ exists, **must be migrated in Wave 0** (E-6) |
| ADMIN-02 | Mid-form refusal re-queries and swaps to the same message | component | same file | ❌ Wave 2 |
| ADMIN-03 | State + attribution rendered; three attribution variants | component | `npx vitest run src/components/PublicSignupSwitch.test.jsx` (frontend) | ❌ Wave 2 |
| ADMIN-03 | Admin-only `publicRegistrationSetting` refuses a non-admin | integration | `npx vitest run src/resolvers/security.boundaries.test.js` (backend) | ❌ Wave 1 |
| SEC-04 | Non-admin refused on 9 admin operations | integration | `npx vitest run src/resolvers/security.boundaries.test.js` (backend) | ❌ Wave 1 |
| SEC-04 | Anonymous tokenless register refused while closed | integration | same file | ❌ Wave 1 |
| SEC-04 | Admin positive controls (same ops do not produce the admin-guard message) | integration | same file | ❌ Wave 1 |
| SEC-05 | Every non-allowlisted root field refuses a Pending token, over HTTP | integration | same file | ❌ Wave 1 |
| SEC-05 | `me` resolves to `null` (not an error) for a Pending token | integration | same file | ❌ Wave 1 |
| SEC-05 | Allowlist pinned to a literal sorted set | integration | same file | ❌ Wave 1 |
| SEC-05 | The three `/api/.../photo` routes return 401 for a Pending token | integration | same file | ❌ Wave 1 |
| SC-5 | Whole workspace green | full suite | `npm test --workspaces` | ✅ (baseline above) |
| — | Existing tokenless `register` tests still pass after seeding change | regression | `npx vitest run src/resolvers/register.test.js` (backend) | ✅ exists |
| — | `InvitationsPage` still renders both existing regions | regression | `npx vitest run src/pages/InvitationsPage.test.jsx` (frontend) | ✅ exists, needs a 1-line mock branch |

### Sampling rate

- **Per task commit:** the single `npx vitest run <file>` for the file that task touched. Never a bare `vitest` (watch mode) and never a full suite per task.
- **Per wave merge:** `npm test --workspace backend` **or** `npm test --workspace frontend` — whichever workspace the wave touched. Run one at a time; the backend run is ~6 min and must not overlap another process on `portofolio_test`.
- **Phase gate:** `npm test --workspaces` green before `/gsd:verify-work`.

### Wave 0 gaps (must land before dependent work)

- [ ] `backend/src/models/AppSetting.js` + registration in `backend/src/models/index.js` — the table must exist under `sync({ force: true })` before any test can seed it
- [ ] `backend/src/utils/appSettings.js` — `PUBLIC_REGISTRATION_KEY`, `isPublicRegistrationEnabled`, `seedDefaultAppSettings`
- [ ] `backend/test/globalSetup.js` — seed after `sync`
- [ ] `backend/test/helpers.js` — `resetTables()` truncates `app_settings` and reseeds (E-5; **shared helper used by 44 test files**)
- [ ] `backend/src/utils/appSettings.test.js` — the accessor's own five-state unit coverage
- [ ] `frontend/src/pages/Register.test.jsx` — migrate to a query-dispatching `mockImplementation` and `findBy*` before `Register.jsx` gains the loading gate (E-6; 4 of 5 tests affected)
- [ ] `backend/migrations/manual/021-create-app-settings.sql` + README § Manual Database Migrations entry (no test, but it is the production half of Wave 0's model)

*No test-framework installation is needed — both workspaces are already on Vitest 4.1.10.*

### D-13 mutation-testing script (every new boundary test proven red)

D-13 requires each new boundary test be demonstrated red, with the result recorded. Concretely, for each mutation: apply, run the named command, record the failure, restore, re-run green.

| # | Mutation to apply | Command that must go RED | What it proves |
|---|-------------------|--------------------------|----------------|
| M1 | Delete the switch check from `register`'s tokenless branch | `npx vitest run src/resolvers/publicRegistrationSwitch.test.js` | ADMIN-02's server-side enforcement is actually tested |
| M2 | Replace `register`'s `isPublicRegistrationEnabled(models)` call with an inline `findByPk` that fails **open** on an absent row | same | The D-07 agreement test catches divergence, not just absence |
| M3 | Change the accessor's `catch` to `return true` | same | Proves the *absolute*-value assertion matters — the agreement assertion alone would still pass here, since both sides would agree on the wrong answer. **This is the mutation that would have caught 32-REVIEW.md CR-01.** |
| M4 | Remove `requireAdmin` from `pendingApprovals` | `npx vitest run src/resolvers/security.boundaries.test.js` | The SEC-05 sweep genuinely detects a missing guard |
| M5 | Remove `requireAdmin` from the flip mutation | same | SEC-04 covers the new mutation |
| M6 | Change `auth.js:33` to `if (user.status === 'Disabled') return null` (i.e. let Pending through) | same | The sweep proves the chokepoint's *reach*, which is SEC-05's actual claim |
| M7 | Add a new unguarded root field to `setting.schema.js` + resolver, without touching the allowlist | same | The sweep inverts the default — a forgotten guard fails on day one (D-12's whole purpose) |
| M8 | Remove `seedDefaultAppSettings` from `resetTables()` | `npx vitest run src/resolvers/register.test.js` | Confirms the Wave 0 seeding is load-bearing and not incidental |

Record the observed failure message for each in the plan's verification section, per D-13 — "confirmed red" without the message is the kind of good intention D-13 exists to replace.

### Manual-only behaviours

Genuinely not automatable in this stack; route to HUMAN-UAT:

- Visual sign-off on the switch region against 34-UI-SPEC.md (spacing, the 14px radius, `Switch` thumb/track colour, icon tint) — jsdom has no layout or computed colour.
- The real production deployment of migration 021 (apply → boot → `/health` → open `/invitations` and confirm the state line reads OPEN with "Not changed since setup.").
- The genuine mid-form race with two browser sessions (admin closes the door while a visitor is typing). The component test proves the re-query-and-swap logic; only a human proves the felt behaviour.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section applies.

### Applicable ASVS categories

| ASVS category | Applies | Standard control in this phase |
|---------------|---------|-------------------------------|
| V2 Authentication | yes | Unchanged. `getUserFromRequest` (`auth.js:9-36`) remains the single verification point; this phase proves its reach rather than modifying it |
| V3 Session Management | yes (indirectly) | The Pending-token sweep exercises the JWT → user resolution path including `passwordChangedAt` revocation (`auth.js:24-27`). No change |
| V4 Access Control | **yes — the core of this phase** | `requireAdmin` on the flip mutation and the admin setting query; the SEC-04 matrix and SEC-05 sweep are the verification. The sweep's allowlist is the deny-by-default mechanism ASVS V4 asks for |
| V5 Input Validation | yes | Unchanged. `assertPasswordStrength`, `assertRegistrationName`, `assertRegistrationEmail`, `assertRelationshipNoteLength` all keep running after the switch check. The flip mutation's only input is a `Boolean!`, validated by GraphQL itself |
| V6 Cryptography | no change | `signToken`/`hashVerificationToken` untouched. The settings value is not a secret |
| V7 Error Handling & Logging | yes | D-03's audit row; the accessor's `console.error` logs `err?.name, err?.message` only — never the full object, matching `user.resolver.js:331`'s reason (a Sequelize `DatabaseError`'s `.sql`/`.parameters` can carry an email and a bcrypt hash) |
| V8 Data Protection | yes | Attribution (`updatedByName`, `updatedAt`) is admin-only; the public query returns a bare boolean and nothing else (Pattern 5) |
| V11 Business Logic | yes | D-08/D-10: closing the door must not void issued invitations or the existing approval queue. Both need explicit control tests, not just refusal tests |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status here |
|---------|--------|---------------------|-------------|
| Client-side-only enforcement of a server rule | Elevation of Privilege | Enforce in the resolver; the client only renders | ADMIN-02's explicit requirement; Pattern 2 |
| Outer/inner guard divergence on one predicate | Elevation of Privilege | One function, both callers; agreement test + mutation test | D-07; Pattern 3 — the phase's headline risk |
| Fail-open on a missing/failed config read | Elevation of Privilege | Fail closed, and **exercise the closed default** | D-02; the five-state table |
| Broken function-level authorization (OWASP API1/API5) | Elevation of Privilege | Deny by default; enumerate the surface and allowlist exceptions | D-12's sweep is precisely this control |
| Account enumeration via differential responses | Information Disclosure | Uniform response + response-time floor | Already closed by Phase 32; this phase must not disturb it — the switch check sits *before* the machinery, never inside it (D-09) |
| Timing side channel on registration | Information Disclosure | `MIN_REGISTER_RESPONSE_MS = 400` floor | Untouched. A closed-door refusal deliberately returns fast; it reveals only the publicly-queryable door state |
| Missing audit trail on a privileged state change | Repudiation | Append-only `audit_logs` row per flip | D-03; Pattern 4 (in-transaction so it cannot be lost) |
| Rate-limit bypass on a new public field | Denial of Service | Field-keyed limits in `RATE_LIMITS` | Deliberately not applied to `publicRegistrationEnabled` — see Discretion Answers for the reasoning |
| Account pre-hijacking via tokenless registration | Spoofing | *(no mitigation this milestone)* | **CR-02, live and knowingly accepted.** `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`. Explicitly out of scope (D-14). D-02's fail-closed default is partly motivated by it — the unexpected state should be the one where this vulnerability is not reachable |

## Sources

### Primary (HIGH confidence — executed or read this session)

- `backend/src/schemas/{index,user,familyMember,invitation,approval}.schema.js` — the full SDL; field enumeration verified by running `buildSchema`
- `backend/src/resolvers/{user,familyMember,invitation,approval}.resolver.js` — every root field's guard, read individually
- `backend/src/utils/{auth,audit}.js` — `getUserFromRequest:9-36`, `requireAuth:38`, `requireAdmin:42`, `requireFamilyAccess:47`, `writeAuditLog:5`
- `backend/src/models/{index,User,AuditLog,Invitation}.js`, `backend/src/config/assertRequiredColumns.js`
- `backend/test/{helpers,globalSetup,dbEngine,setupRateLimit}.js`, `backend/vitest.config.js`, `frontend/vitest.config.js`, `frontend/test/setup.js`
- `backend/src/resolvers/{accountStatus,register,sessionRevocation,createInvitation,setUserPassword}.test.js` — harness and adversarial idioms
- `backend/src/{server.js,plugins/rateLimitPlugin.js,config/rateLimits.js,graphql/serverConfig.js,routes/photo.routes.js}`
- `frontend/src/{pages/{Register,InvitationsPage,ApprovalsPage},api/graphqlClient,context/AuthContext}.jsx|js` and their tests
- `backend/migrations/manual/{017,020}-*.sql`, `README.md:248-330`, `.github/workflows/ci.yml`
- **Executed probe A** — `buildSchema(typeDefs.join('\n'))` → 12 Query + 20 Mutation fields, `makeExecutableSchema` agrees
- **Executed probe B** — the query synthesizer + `validate()` over all 32 fields → 0 invalid
- **Executed probe C** — Apollo Server 4.13 error shapes under `NODE_ENV=test` and `production` → `INTERNAL_SERVER_ERROR` + `path` vs `GRAPHQL_VALIDATION_FAILED` + no `path`
- **Executed** — `npm test --workspace backend` and `--workspace frontend` for the baseline below
- Installed versions read from `node_modules/*/package.json`: `graphql` 16.14.0, `@apollo/server` 4.13.0, `vitest` 4.1.10; `node -v` → v24.15.0; `npm -v` → 11.12.1; local `mariadbd` 10.5.29 running

### Secondary (HIGH confidence — official documentation)

- MySQL 8.4 Reference Manual, *Keywords and Reserved Words* — `KEY (R)` is reserved; reserved words require backtick quoting as identifiers. https://dev.mysql.com/doc/refman/8.4/en/keywords.html

### Planning documents (binding, read in full)

- `.planning/phases/34-open-registration-switch-quality-gate/34-CONTEXT.md` (D-01..D-14, F-01)
- `.planning/phases/34-open-registration-switch-quality-gate/34-UI-SPEC.md` (approved, 6/6 dimensions)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` § Phase 34, `.planning/PROJECT.md` § v4.1, `.planning/STATE.md`, `.planning/config.json`
- `.planning/phases/32-tokenless-registration/32-REVIEW.md` (CR-01 — the divergence bug class, with its empirical divergence table)
- `.planning/phases/33-public-signup-form-approval-queue/33-CONTEXT.md` (D-04's hard constraint — D-07's direct ancestor)
- `.planning/quick/260908-geq-p33-validator-parity/` (PLAN + SUMMARY — the "call the identical function" remedy and its `key_links` pattern pinning)
- `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md` (referenced, accepted risk)

### Stale — do not plan against

- `.planning/codebase/TESTING.md` (2026-07-11) — describes a codebase with no test runner. Superseded by the Validation Architecture section above
- `CLAUDE.md` § Technology Stack / § Frameworks — Node 18.x and "no test framework" are both out of date

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new packages; every version read from installed `node_modules` |
| Public-field list (E-1) | HIGH | Derived by reading all 32 resolvers, cross-checked against `buildSchema`'s field enumeration |
| Query synthesis (E-2) | HIGH | Working prototype executed against the real SDL; 32/32 validated by `graphql`'s own `validate()` |
| Error-shape discrimination (E-3) | HIGH | Measured directly against `@apollo/server` 4.13.0 under both `NODE_ENV` values |
| Harness split (E-4) | HIGH | Read from `helpers.js:16-26` and `server.js:34-40`; the HTTP idiom is an existing passing test |
| Settings-store design (Pattern 1/4/5) | MEDIUM-HIGH | Shapes follow verified in-repo precedents (`AuditLog.js`, `User.approvedBy`, `audit.js`'s own header). A1 (`upsert` return shape) is the one unverified detail |
| Architecture / insertion point (Pattern 2) | HIGH | Exact line numbers read from `user.resolver.js` this session |
| Pitfalls | HIGH | 1–7 each trace to a measured behaviour or a file:line; 8 is the user's own recorded incident |
| Test-suite baseline | HIGH | Measured this session — see the Current green baseline block |

**Research date:** 2026-09-09
**Valid until:** 2026-10-09 (30 days — stable stack, no fast-moving dependency; re-verify the baseline if the suite changes)

---

*Phase: 34-open-registration-switch-quality-gate*
