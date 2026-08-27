---
phase: 24
slug: backend-read-layer-for-detail
status: secured
threats_open: 0
threats_closed: 9
asvs_level: 1
created: 2026-08-03
---

# SECURITY.md — Phase 24: Backend Read Layer for /detail

**Audit date:** 2026-08-03
**ASVS Level:** 1
**Disposition:** SECURED — all 9 threats resolved (6 mitigate verified in code + test, 3 accepted risks documented)
**Evidence tests:** 21/21 passing (`familyMember.head.test.js`, `familyMember.search.test.js`, `familyMember.canEdit.test.js`, `familyMember.queryCount.test.js`)

This audit verifies the STRIDE threat register authored at plan time (24-01/24-02/24-03 PLAN.md). Each `mitigate` threat was confirmed present in implementation code and backed by a passing cited test; each `accept` threat's rationale was re-confirmed against the shipped code.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-24-01 | EoP / Info Disclosure — `Query.familyHead` | mitigate | CLOSED | `requireFamilyAccess(user)` is the unconditional first line of `Query.familyHead` (`backend/src/resolvers/familyMember.resolver.js:46`). Anonymous rejection + unlinked-non-admin rejection proven in `familyMember.head.test.js:102` and `:109`. |
| T-24-02 | Info Disclosure — `Query.searchFamilyMembers` | mitigate | CLOSED | `requireFamilyAccess(user)` is the first line of `Query.searchFamilyMembers` (`familyMember.resolver.js:54`), executed before any `term`/`limit` handling or DB access. Anonymous + unlinked rejection proven in `familyMember.search.test.js:92` and `:103`. |
| T-24-03 | Tampering (SQL injection) — search where clause + raw CTE | mitigate | CLOSED | Search uses parameterized `Op.substring` on `firstname`/`lastname`/`geezFirstname`/`geezLastname` only, no string interpolation (`familyMember.resolver.js:63-68`). The one raw `sequelize.query` CTE in `getFamilyHeadId` takes zero user-supplied arguments — fixed SQL string, `QueryTypes.SELECT`, no `replacements` (`backend/src/services/familyMember.service.js:20-39`). |
| T-24-04 | DoS (unbounded result set) — `Query.searchFamilyMembers` | mitigate | CLOSED | `SEARCH_RESULT_HARD_MAX = 50` server-side ceiling via `Math.min(limit ?? 20, 50)` — no client `limit` can exceed 50 (`familyMember.resolver.js:16-17,59`). Blank/whitespace term short-circuits to `[]` before any DB call (`:56-57`). Cap + blank-guard proven in `familyMember.search.test.js:78` and `:67`. See advisory note on WR-01 below. |
| T-24-05 | Tampering (`%`/`_` wildcard semantics) — search | accept | CLOSED (accepted) | See Accepted Risks. |
| T-24-06 | DoS (N+1 amplification) — `familyMember(id){children{...spouses}}` | mitigate | CLOSED | Reuses batched `childrenByParentId` / `spousesByMemberId` DataLoaders unchanged (`familyMember.resolver.js:295-296`). Bounded-SQL proof in `familyMember.queryCount.test.js:149` asserts query count does not grow as direct children scale 3→10 (`largeQueryCount <= smallQueryCount`, both `< 10`). |
| T-24-07 | EoP (canEdit spoofing) — `FamilyMember.canEdit` | mitigate | CLOSED | Resolved purely as `Boolean(user?.role === 'ADMIN')` — no user-supplied argument reaches the resolver (`familyMember.resolver.js:353-355`). `context.user` derives from a verified JWT upstream (`getUserFromRequest` → `jwt.verify`, `backend/src/utils/auth.js:16`; wired at `backend/src/server.js:37`). ADMIN-true / USER-false / anonymous-rejected proven in `familyMember.canEdit.test.js:17,27,37`. |
| T-24-08 | Info Disclosure (parent query bypass) — `familyMember(id)` | accept | CLOSED (accepted) | See Accepted Risks. |
| T-24-SC | Tampering (supply chain) — npm installs | accept | CLOSED (accepted) | See Accepted Risks. |

---

## Accepted Risks Log

### T-24-05 — `%`/`_` LIKE wildcard characters in search term change match semantics
**Component:** `Query.searchFamilyMembers`
**Rationale:** A `%` or `_` in the search term is treated as a LIKE wildcard by `Op.substring`, altering match breadth. This is a correctness quirk, **not** an injection vector — the value remains a bound parameter (verified: `Op.substring` at `familyMember.resolver.js:64-67`, no interpolation), so it cannot escape into SQL structure. Confidentiality/integrity/availability are unaffected. Deferred to v4.0 per RESEARCH.md Pitfall 2. Rationale re-confirmed against shipped code — holds.

### T-24-08 — Parent query bypass on `familyMember(id)`
**Component:** `familyMember(id)` (pre-existing, unmodified this phase)
**Rationale:** `familyMember(id)` is already gated by `requireFamilyAccess(user)` as its first line (`familyMember.resolver.js:25-26`), unchanged by Phase 24. The phase's additive `canEdit` field is only reachable through this already-gated parent query. Confirmed by the anonymous-caller test in `familyMember.canEdit.test.js:37` (parent query nulls the field and returns the login error before `canEdit` resolves). Rationale holds.

### T-24-SC — Supply chain (dependency installs)
**Component:** npm workspace installs
**Rationale:** Zero new runtime or dev dependencies were introduced by Phase 24. All three plan summaries declare `tech-stack.added: []`, and the implementation uses only already-present `sequelize` primitives (`Op`, `QueryTypes`) and existing DataLoaders. No new install/verify surface. Rationale holds.

---

## Unregistered Flags

None. No `## Threat Flags` section is present in any of the three plan summaries (24-01/24-02/24-03 SUMMARY.md), and no new attack surface was introduced beyond the three registered new API surfaces (`familyHead`, `searchFamilyMembers`, `canEdit`), each of which maps to a registered threat.

---

## Advisory Observations (non-blocking)

**WR-01 — no lower-bound clamp on `searchFamilyMembers(limit)`** (from advisory review 24-REVIEW.md)
`cap = Math.min(limit ?? SEARCH_RESULT_CAP, SEARCH_RESULT_HARD_MAX)` has no lower bound (`familyMember.resolver.js:59`). Consequences:
- `limit: 0` → `LIMIT 0` → returns an empty array (benign).
- `limit: -5` → `LIMIT -5` → MySQL syntax error → the single authenticated request fails with a GraphQL error.

**Assessment relative to T-24-04:** This is **not** a DoS/availability gap. The negative-limit path does not produce an unbounded result set (T-24-04's actual concern), does not exhaust server resources, does not crash the process (Apollo surfaces it as a per-request GraphQL error), and leaks no data. It is reachable only by an already-authenticated family member and affects only that caller's own malformed request — a benign self-inflicted client error. T-24-04's declared mitigation (upper-bound ceiling + blank-term short-circuit) is fully present and intact. Recommend a low-priority hardening (`Math.max(1, ...)` or reject non-positive `limit`) for input-validation hygiene, but this does not block the phase. WR-04 is identical to accepted T-24-05.

---

## Verification Method

- Implementation files were read-only; no implementation file was modified during this audit.
- Each `mitigate` threat was verified by locating the actual guard/parameterization/bound call in the cited implementation file, then confirming the cited test exercises the rejection/bound path.
- Evidence tests were executed: `npm test --workspace backend -- familyMember.head.test.js familyMember.search.test.js familyMember.canEdit.test.js familyMember.queryCount.test.js` → **21 passed (21)**.
