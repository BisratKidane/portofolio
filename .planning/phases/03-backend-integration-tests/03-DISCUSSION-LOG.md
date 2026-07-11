# Phase 3: Backend Integration Tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 3-Backend Integration Tests
**Areas discussed:** Test entry point & auth, DB isolation & ADMIN quirk, Known-issues doc, Assertion depth

---

## Test entry point & auth

### Q1 — How should the integration tests drive the GraphQL layer?

| Option | Description | Selected |
|--------|-------------|----------|
| executeOperation (in-process) | Fresh ApolloServer from typeDefs+resolvers in a helper; call executeOperation with a hand-built contextValue. Fast, no network, no supertest. Matches PROJECT.md proposal; skips Express/CORS/header layer. | ✓ (via "You decide") |
| Full HTTP via supertest | Real Express app + expressMiddleware, real Bearer header; exercises whole stack incl. getUserFromRequest. Needs a test-friendly app export; adds supertest; slower. | |
| You decide | Claude picks — leaned executeOperation since header→JWT is already unit-tested in Phase 2. | ✓ |

**User's choice:** "You decide" → locked to executeOperation (in-process).
**Notes:** Rationale accepted — Phase 2 D-01 already covers the Bearer→JWT→user path, so HTTP re-drive adds little. server.js has top-level side effects, so tests build their own ApolloServer from the typeDefs/resolvers barrels.

### Q2 — How should the authenticated request (BE-06) get its user?

| Option | Description | Selected |
|--------|-------------|----------|
| Inject resolved user into context | createTestUser() then contextValue { models, user: <instance> }; unauth = user: null. Mirrors getUserFromRequest output. Simple, deterministic. | ✓ |
| Sign a real JWT, run getUserFromRequest | Sign token + fake req, derive context user end-to-end. Overlaps Phase 2, adds ceremony. | |
| A shared context helper | authedContext(user)/anonContext() helper — orthogonal, layerable on either approach. | |

**User's choice:** Inject resolved user into context.
**Notes:** Context helper left to Claude's discretion (layerable if it reduces boilerplate).

---

## DB isolation & ADMIN quirk

### Q1 — How should rows be reset between integration tests?

| Option | Description | Selected |
|--------|-------------|----------|
| resetTables() in beforeEach | Truncate before every test; clean known state; makes first-user-ADMIN predictable per test. | ✓ |
| resetTables() in afterEach | Clean after each; a crashed afterEach can leave residue. | |
| Per-file (beforeAll) | Reset once per file; tests share state, order-dependent, fragile with ADMIN logic. | |

**User's choice:** resetTables() in beforeEach.
**Notes:** This is the stronger per-test isolation Phase 1 deferred to Phase 3.

### Q2 — How should the register test handle first-user-ADMIN vs USER?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicitly test both, seed for USER | Empty table → assert ADMIN; seed a prior user → register → assert USER. Covers the real branch. | ✓ |
| Only assert USER, always seed | Always seed; never assert ADMIN branch. Simpler, leaves first-user-ADMIN untested. | |
| You decide | Claude picks — leaned toward testing both. | |

**User's choice:** Explicitly test both, seed for USER.
**Notes:** dashboard/me tests set role directly via createTestUser({role}) since they inject context, sidestepping the quirk.

---

## Known-issues doc

### Q1 — Where should the doc live, and in what format?

| Option | Description | Selected |
|--------|-------------|----------|
| Repo-root KNOWN-ISSUES.md | Per-issue sections (Title, Location file:line, Expected vs Actual, Severity, test link). Portfolio-visible next to README. | ✓ |
| docs/KNOWN-ISSUES.md | Same content under docs/; less visible. | |
| backend/KNOWN-ISSUES.md | Scoped to backend workspace; less of a whole-project signal. | |
| Reuse .planning CONCERNS.md | Point at existing planning artifact; not a first-class deliverable. | |

**User's choice:** Repo-root KNOWN-ISSUES.md.

### Q2 — Which bugs should the doc capture this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Only what these 4 flows surface | Test-backed entries only (reset-token exposure primary; + what these flows touch). Pointer to CONCERNS.md for the rest. | ✓ |
| All CONCERNS.md security bugs | Port full security list even where untested. More complete, but unbacked entries. | |
| You decide | Claude picks — leaned test-backed core + pointer. | |

**User's choice:** Only what these 4 flows surface.

### Q3 — How should the reset test treat the token-exposure bug?

| Option | Description | Selected |
|--------|-------------|----------|
| Assert current (buggy) behavior | Characterization test pins resetToken IS returned; future fix trips it. | |
| Assert happy path only | Test success + generic message; token leak documented in doc, not pinned by a test. | ✓ |
| You decide | Claude picks — leaned characterization. | |

**User's choice:** Assert happy path only.
**Notes:** Exposure lives in KNOWN-ISSUES.md, not encoded as "expected" in the suite.

---

## Assertion depth

### Q1 — Response only, or also verify DB side-effects?

| Option | Description | Selected |
|--------|-------------|----------|
| Response + key DB side-effects | Assert response shape (verifiable JWT claims, user fields) AND spot-check DB (passwordHash != plaintext, token+expiry stored). | ✓ |
| Response only | API black-box only; wouldn't catch plaintext-in-DB. | |
| You decide | Claude picks — leaned targeted DB checks. | |

**User's choice:** Response + key DB side-effects.
**Notes:** register DB spot-check guards the fragile hashing-via-hooks invariant CONCERNS.md flags.

### Q2 — How precise should negative-case error assertions be?

| Option | Description | Selected |
|--------|-------------|----------|
| Assert exact error messages | Pin the resolver strings (duplicate email, invalid credentials, auth-required). Locks the API contract. | ✓ |
| Assert error presence/type only | Robust to copy tweaks but doesn't guard the message contract. | |
| You decide | Claude picks per case. | |

**User's choice:** Assert exact error messages.

---

## Claude's Discretion

- Test entry point (Q1) — user said "you decide"; locked to executeOperation.
- Spec file layout (one resolver spec vs per-flow files) — co-located `src/**/*.test.js` per Phase 1 D-06.
- Optional Apollo/context test helpers (graphql(), authedContext/anonContext) — add if they cut boilerplate.
- Whether to opportunistically cover `logout` and `resetPassword` (not required by BE-04..07).
- What "invalid input" means for register (schema non-null vs resolver-level rejection).
- test-user email uniqueness approach.

## Deferred Ideas

None — discussion stayed within phase scope. Fixing any documented bug is v2 / FIX-01. Broader CONCERNS.md items untouched by these flows remain in CONCERNS.md, linked from KNOWN-ISSUES.md rather than re-ported.
