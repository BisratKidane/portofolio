---
phase: 13-membership-gating-account-linking
verified: 2026-07-22T06:08:41Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 13: Membership Gating & Account Linking Verification Report

**Phase Goal:** App access is gated on being an admin-linked family member — enforced at the resolver layer, not just the frontend route — with an explicit carve-out so the first bootstrapped admin isn't locked out of the tools needed to bootstrap the tree.
**Verified:** 2026-07-22T06:08:41Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria / ACC-01..05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 (ACC-01) | A registered, email-verified user with no linked member is routed to `/pending`; cannot reach family data via the UI | ✓ VERIFIED | `ProtectedRoute.jsx:17` redirects `!user.familyMemberId && role !== 'ADMIN'` to `/pending`, placed before the `allowedRoles` check. `Pending.jsx` renders the exact D-02 static copy and bounces linked/ADMIN users to `/dashboard`, unauthenticated to `/login`. `/pending` registered as a top-level sibling route in `App.jsx:23`, outside the `ProtectedRoute` block (reachable). `familyMemberId` is carried on `ME_QUERY`, `LOGIN_MUTATION`, `VERIFY_EMAIL_MUTATION` (`AuthContext.jsx:8,14,26`) so the gate evaluates correctly immediately after login, not only after a `me` refetch. Frontend suite green (34/34) including `Pending.test.jsx` (4 cases) and `ProtectedRoute.test.jsx` pending-gate cases. |
| 2 (ACC-02) | An admin can link a user account to a family member node (pick-existing OR create-and-link), granting member access on next request | ✓ VERIFIED | `linkUserToMember` mutation (`user.resolver.js:227-273`) is `requireAdmin`-gated, validates exactly-one-of `memberId`/`newMember` via XNOR, resolves an existing member or creates a bare one, updates `targetUser.familyMemberId` inside a transaction. `AdminLinkMembers.jsx` renders the unlinked-user list, a pick-existing `Autocomplete` path and a create-and-link bare-member form, both calling the mutation and removing the row from the list on success (`handleLinked`). Route `/admin/link-members` gated `ProtectedRoute allowedRoles={['ADMIN']}` in `App.jsx:27-29`. Backend `linkUserToMember.test.js` (9+3 cases incl. CR-01/WR-01/WR-03 fixes) and frontend `AdminLinkMembers.test.jsx` (5 cases) all pass. |
| 3 (ACC-03) | First-verified-user ADMIN keeps full access with zero linked members, can create a member node and self-link, without being blocked; v1.1 first-user-ADMIN regression still passes | ✓ VERIFIED | `requireFamilyAccess` (`auth.js:43-47`) returns immediately for `role === 'ADMIN'` before checking `familyMemberId` — zero-link ADMINs are never blocked. `ProtectedRoute.jsx:17` and `Pending.jsx:10` both carve out `role === 'ADMIN'` identically. `linkUserToMember.test.js:148` ("allows an ADMIN to self-link via newMember (ACC-03)") passes: an ADMIN calls the mutation with their own `userId` + a `newMember` payload and ends up linked. The pre-existing `verifyEmail.test.js` first-verified-user-ADMIN promotion tests (unrelated to Phase 13 changes) are part of the still-green 195/195 backend suite — no regression. |
| 4 (ACC-05) | `users.familyMemberId` exists via tracked manual `ALTER TABLE` (not `sync()`) and is boot-verified against a real DB | ✓ VERIFIED | `backend/migrations/manual/012-add-users-family-member-id.sql` adds the column (nullable INT UNSIGNED), a UNIQUE constraint, and an FK with `ON DELETE SET NULL ON UPDATE CASCADE` — matches D-07 exactly. `User.belongsTo(FamilyMember, { foreignKey: { name: 'familyMemberId', allowNull: true, unique: true }, onDelete: 'SET NULL' })` in `models/index.js:38-44` (association-owns-the-column, no field redeclaration in `User.js`, avoiding double-declaration). Automated "boot-verify" equivalent (this codebase's established, non-scripted convention per Phase 9/11 precedent — no standalone JS boot-verify script exists anywhere in the repo) lives in `database.test.js`'s `describe('familyMemberId link column (ACC-05)', ...)` block: persist/reload, UNIQUE-rejection, and ON-DELETE-SET-NULL tests, all passing. |
| 5 (ACC-04) | Every family-domain resolver enforces `requireFamilyAccess` server-side; adversarial test proves a verified-but-unlinked JWT hitting a family operation directly is rejected | ✓ VERIFIED | `requireFamilyAccess(user)` (`auth.js:43-47`): delegates to `requireAuth`, returns for ADMIN, else throws `'Your account is not yet linked to a family member.'` if `!user.familyMemberId`. Applied at the top of `familyMember` resolver body (`familyMember.resolver.js:9-10`) — the only member-facing family-data read query that exists in this phase (`familyMembers` list is intentionally `requireAdmin`-gated, a stricter admin-tooling guard, not a member-facing read). LOCKED adversarial test in `familyMember.resolver.test.js:26-34` ("rejects a verified-but-unlinked USER calling directly (LOCKED adversarial test, SC5)") calls the resolver directly via `graphql()` bypassing the SPA, asserts the exact guard error message and `data.familyMember === null`. Passes. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/utils/auth.js` (`requireFamilyAccess`) | Linked-member OR ADMIN guard | ✓ VERIFIED | Exists, substantive, wired (imported/used in `familyMember.resolver.js`), 4 direct unit tests + 1 adversarial integration test all pass |
| `backend/migrations/manual/012-add-users-family-member-id.sql` | Nullable FK, UNIQUE, ON DELETE SET NULL | ✓ VERIFIED | Exists, correct DDL, documented as a required manual pre-deploy step (consistent with Phase 9/11 precedent) |
| `backend/src/models/index.js` (User↔FamilyMember association) | belongsTo/hasOne wiring | ✓ VERIFIED | Present, matches migration semantics exactly (unique, SET NULL, CASCADE) |
| `backend/src/resolvers/familyMember.resolver.js` + `familyMember.schema.js` | Guarded `familyMember`/`familyMembers` queries | ✓ VERIFIED | Both resolvers exist, guarded, registered in barrels (`schemas/index.js`, `resolvers/index.js`), tested |
| `backend/src/resolvers/user.resolver.js` (`linkUserToMember`, `unlinkedUsers`) | Admin linking mutation + unlinked list query | ✓ VERIFIED | Exists, substantive (transactional, sanitized, duplicate-checked), wired into schema and frontend |
| `frontend/src/components/ProtectedRoute.jsx` | Pending-gate redirect | ✓ VERIFIED | Guard clause present, correctly ordered ahead of `allowedRoles` check |
| `frontend/src/pages/Pending.jsx` | Static `/pending` screen | ✓ VERIFIED | Renders D-02 exact copy, symmetric bounce logic, no polling/admin-contact (as scoped) |
| `frontend/src/pages/AdminLinkMembers.jsx` + route | Admin linking UI | ✓ VERIFIED | Full pick/create flow, per-row isolated error state, registered at `/admin/link-members` behind `ProtectedRoute allowedRoles={['ADMIN']}` |
| `frontend/src/context/AuthContext.jsx` | `familyMemberId` on `me`/`login`/`verifyEmail` | ✓ VERIFIED | All three GraphQL operations select `familyMemberId`, closing the stale-auth-state bug the plan targeted |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ProtectedRoute.jsx` | `AuthContext` `user.familyMemberId`/`role` | `useAuth()` hook read | ✓ WIRED | Redirect logic reads live context state |
| `AdminLinkMembers.jsx` | `linkUserToMember` mutation | `graphqlRequest(LINK_USER_TO_MEMBER_MUTATION, ...)` | ✓ WIRED | Both pick and create-and-link paths call the mutation; response drives `onLinked` row removal |
| `familyMember.resolver.js` | `requireFamilyAccess` | direct function call at top of resolver body | ✓ WIRED | Confirmed via adversarial test rejecting an unlinked caller |
| `linkUserToMember` resolver | `sanitizeNewMember` | direct call before `FamilyMember.create` | ✓ WIRED (CR-01 fix) | Blank optional strings converted to `null` before hitting `isEmail`/DATEONLY validators; test `linkUserToMember.test.js:165` proves it |
| `linkUserToMember` resolver | `sequelize.transaction` | wraps member create/find + `targetUser.update` | ✓ WIRED (WR-01 fix) | Rollback-on-failure test at `linkUserToMember.test.js:202` proves no orphaned `family_members` row survives a failed link |
| `App.jsx` | `Pending.jsx` / `AdminLinkMembers.jsx` | `<Route>` registration | ✓ WIRED | `/pending` top-level sibling route (reachable when `ProtectedRoute` redirects there); `/admin/link-members` nested under an ADMIN-only `ProtectedRoute` |

### Behavioral Spot-Checks / Full Test Suite Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend full suite | `npm test` (backend, vitest run) | 29 test files, **195/195 passed** | ✓ PASS — matches SUMMARY claim exactly |
| Frontend full suite | `npm test -- --run` (frontend, vitest run) | 9 test files, **34/34 passed** | ✓ PASS — matches SUMMARY claim exactly |
| Frontend production build | `vite build` | `✓ built in 946ms`, no errors | ✓ PASS |
| CR-01/WR-01/WR-03 fixes present in code (not just claimed in REVIEW.md) | `git log`, direct file read of `user.resolver.js:24-34,242-244,246-263` | `sanitizeNewMember()`, transaction wrap, already-linked check all present and match commits `5e9fcc5`/`0baa10f`/`3f17ded` | ✓ PASS |
| Debt-marker scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) across all phase-touched files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER..."` on 12 key files | No matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| ACC-01 | 13-03 | Pending gate for unlinked verified users | ✓ SATISFIED | `ProtectedRoute.jsx`, `Pending.jsx`, `App.jsx` routing, `AuthContext.jsx` |
| ACC-02 | 13-02, 13-04 | Admin can link user to member (pick or create) | ✓ SATISFIED | `linkUserToMember` resolver + `AdminLinkMembers.jsx` |
| ACC-03 | 13-01, 13-02, 13-03 | ADMIN carve-out, self-link, no lockout | ✓ SATISFIED | `requireFamilyAccess` ADMIN bypass, `ProtectedRoute`/`Pending` ADMIN carve-out, self-link test |
| ACC-04 | 13-01, 13-02 | `requireFamilyAccess` guards real family resolver + adversarial test | ✓ SATISFIED | `familyMember.resolver.js` + LOCKED SC5 test |
| ACC-05 | 13-01 | `users.familyMemberId` manual ALTER + boot-verify | ✓ SATISFIED | migration 012 + `database.test.js` link-column tests |

No orphaned requirements found in REQUIREMENTS.md for Phase 13 beyond ACC-01..05, all of which are claimed and satisfied.

### Anti-Patterns Found

None (debt-marker scan clean; no stub returns, no empty handlers, no hardcoded-empty props found in the reviewed files).

### Known Non-Blocking Gap (Already Triaged, Not Re-Opened)

**WR-04 — Membership gate is enforced client-side + on `familyMember`/`familyMembers`, but `dashboard` still uses `requireAuth` only (not `requireFamilyAccess`).**

Confirmed still present in code: `user.resolver.js:52-60` — `dashboard` calls `requireAuth(user)`, not `requireFamilyAccess(user)`. This means a verified-but-unlinked ("pending") user can call `dashboard` directly via GraphQL and get a response (a generic greeting + their own record — no family data, no other users' data for a non-admin caller), bypassing the SPA's `/pending` redirect at the server layer.

**Assessment: does this undermine the Phase 13 goal?** No, for the following reasons, all confirmed against the actual code and the roadmap's own wording:
1. ROADMAP Success Criterion 5 / ACC-04 says "every **family-domain** resolver" and the adversarial test proves rejection on the family GraphQL operation that exists in this phase (`familyMember`). `dashboard` is a pre-existing (pre-Phase-12) general-auth resolver, not a family-domain resolver — it was never in scope for this phase's `requireFamilyAccess` rollout.
2. `dashboard` does not leak family-tree data; it returns only a greeting string and the caller's own `User` record (and, for ADMIN, the user list — already `requireAdmin`-equivalent-safe since ADMIN bypasses the gate by design).
3. This was caught by the phase's own code review (`13-REVIEW.md` WR-04) and explicitly, transparently deferred in `deferred-items.md` with a named owner path ("Route via `/gsd:phase` ... or address in the next family-tree milestone phase") rather than silently dropped.
4. It is a real defense-in-depth gap for **future** resolvers (documented explicitly as such) — Phase 14 adds real relationship resolvers, and this verification flags that Phase 14's plan/review MUST confirm every new member-facing resolver calls `requireFamilyAccess`, not just `requireAuth`, or this gap compounds.

This does not change the phase's PASS status but is carried forward as a live risk for Phase 14 review, per the existing deferred-items.md tracking (WR-02, WR-04, INFO-1/2/3 remain open there).

### Human Verification Required

None. All five ACC truths, their supporting artifacts, and their key links are verifiable and verified directly against the codebase (guard logic, migration DDL, route wiring, transaction/sanitization fixes) and against two fully green, independently re-run test suites (backend 195/195, frontend 34/34) plus a clean production build. No visual/real-time/external-service behavior in this phase's scope requires a human check beyond what the existing component tests (`Pending.test.jsx`, `AdminLinkMembers.test.jsx`, `ProtectedRoute.test.jsx`) already exercise.

### Gaps Summary

No blocking gaps. Phase 13 delivers all five ACC-01..05 requirements end-to-end: the SPA gate (`/pending`) and the server-side `requireFamilyAccess` guard both function and are proven by a LOCKED adversarial integration test; the admin linking UI supports both pick-existing and create-and-link with the CR-01/WR-01/WR-03 code-review fixes (sanitization, transactional atomicity, already-linked rejection) verified present and covered by tests; the `users.familyMemberId` column, association, and its automated boot-verify equivalent all exist and pass; the ADMIN carve-out (zero-link access + self-link) is proven by a dedicated test and does not regress the pre-existing first-verified-user-ADMIN promotion behavior. The one open item (WR-04, `dashboard` not using `requireFamilyAccess`) is a previously-identified, explicitly-deferred, non-blocking defense-in-depth gap that does not affect any of the phase's five observable truths as scoped by the ROADMAP/REQUIREMENTS wording, but is flagged here for mandatory attention during Phase 14 review since Phase 14 adds the first real member-facing relationship resolvers.

---

_Verified: 2026-07-22T06:08:41Z_
_Verifier: Claude (gsd-verifier)_
