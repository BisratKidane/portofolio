---
phase: 26-detail-page-search-initial-load
verified: 2026-08-03T19:10:51Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Log in, click the 'Detail' nav link, and visually confirm /detail opens with the search bar above a single, centered head PersonCard (no descendants, no layout breakage on desktop + mobile widths)."
    expected: "Search bar and head card render cleanly, matching the visual language of /family and /manage; no overlap, clipping, or unstyled flash."
    why_human: "Visual layout/spacing quality cannot be judged from grep/test output; RTL tests assert DOM presence, not visual correctness."
  - test: "Type a partial Latin name (e.g. 2-3 letters) and a partial Ge'ez name into the search bar in a real browser and watch the suggestion dropdown appear."
    expected: "Suggestions feel responsive (debounce doesn't feel laggy or trigger a request per keystroke), each row legibly shows avatar + Latin name + Ge'ez name (RTL/LTR mixed line renders correctly) + birth year + family context, and selecting one visibly swaps the card with no flicker/broken intermediate state."
    why_human: "Real-time typing feel, Ge'ez glyph rendering, and visual swap smoothness require human eyes in an actual browser; Vitest/jsdom cannot assess perceived performance or font rendering."
  - test: "Trigger the failed-request and missing-family-head states in a real environment (e.g. temporarily kill the backend / test against a family with no head) and confirm the Alert copy and Retry button look correct and are actually usable by click."
    expected: "Alert severity colors and Retry button are visually correct and clickable; no console errors."
    why_human: "Visual severity styling (error red vs info blue) and end-to-end Retry usability are not verifiable from static code/test analysis alone."
---

# Phase 26: /detail Page, Search & Initial Load Verification Report

**Phase Goal:** The `/detail` page is reachable by any authenticated user, opens on the family head, and lets users search by Latin or Ge'ez name to reset the main person — all backed by existing loading/error/empty-state components.
**Verified:** 2026-08-03T19:10:51Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Authenticated user can navigate to `/detail`; unauthenticated user redirected to login like every other protected route | ✓ VERIFIED | `frontend/src/App.jsx:32` mounts `<Route path="detail" element={<DetailPage />} />` inside the no-args `<ProtectedRoute />` group (same group as `dashboard`/`manage`/`family`, no `allowedRoles`). `frontend/src/components/ProtectedRoute.jsx:16` does `if (!user) return <Navigate to="/login" replace />;` — identical mechanism used by every other protected route. |
| 2 | On first load `/detail` shows only the family head's `PersonCard`, with no descendants expanded | ✓ VERIFIED | `frontend/src/pages/DetailPage.jsx:54-76` — `loadInitial` calls `FAMILY_HEAD_QUERY`, then chains into `loadPersonById(familyHead.id)` (`FAMILY_MEMBER_QUERY`); happy-path render (lines 114-131) shows exactly one `PersonCard` with `expanded={false}`. `DetailPage.test.jsx` "loads the family head then the head person-by-id..." test asserts `graphqlRequest` called twice, `calls[0][0]` matches `familyHead`, `calls[1][1]` equals `{ id: '1' }`, and exactly `person-card-1` renders with role "Head". Test passes (see below). |
| 3 | Loading, no-search-results, no-children, failed-request, missing-family-head, and missing-person-info states all render via the app's existing components — never an empty or broken card | ✓ VERIFIED | `DetailPage.jsx`: loading → `CircularProgress` (line 81); failed-request → `Alert severity="error"` + Retry `Button` (lines 87-96); missing-family-head → `Alert severity="info"` "No family head found" (lines 98-104); missing-person-info → `Typography` graceful message, no card rendered (lines 106-112). `PersonSearch.jsx:81` → `noOptionsText="No matches"` (no-search-results). no-children → `PersonCard.jsx:81` (`showExpand = !isSpouse && childCount >= 1`) already gates the expand control off when `children` is empty — no separate empty-state component needed, matching the phase's own D-08 decision (`26-CONTEXT.md` line 89-90: "the card simply renders with no expand control ... not an error state"). All 5 DetailPage-level branches + no-matches covered by passing tests. |
| 4 | Typing in the search bar surfaces inline suggestions (no separate page) matching partial/full Latin (case-insensitive) or Ge'ez first/last names, each showing avatar, full Latin name, full Ge'ez name (when present), birth year, and family context | ✓ VERIFIED | `PersonSearch.jsx` is a MUI `Autocomplete` (inline dropdown, not a route) driven by debounced `searchFamilyMembers(term)` (raw term passed through, no client-side filtering — `filterOptions={(x) => x}`). `renderOption` (lines 82-105) renders `MemberAvatarImage`, `fullname`, Ge'ez line via `getGeezDisplay` (omitted when null), and a `b. <year> · <mothersname>` context line. Backend resolver (`backend/src/resolvers/familyMember.resolver.js:53-73`) matches `firstname`/`lastname`/`geezFirstname`/`geezLastname` via `Op.substring` (partial, case-insensitive collation) — pre-existing Phase-24 read, reused unchanged. `PersonSearch.test.jsx` covers min-char threshold, single debounced fetch, rich row content (fullname + Ge'ez + birth year), Ge'ez raw-term pass-through, and no-matches — all passing. |
| 5 | Selecting a suggestion clears the current view and makes that person the new main person, shown alone with descendants collapsed | ✓ VERIFIED | `DetailPage.jsx:118` — `<PersonSearch onSelect={(id) => loadPersonById(id)} />`; `loadPersonById` (lines 45-52) sets `loading=true` (swaps out the whole subtree) then replaces `mainPerson` with the newly-fetched person, rendered with `expanded={false}` (line 125, same as initial load — descendants collapsed). `DetailPage.test.jsx` "selecting a search suggestion re-fetches familyMember by the selected id and swaps the rendered card" asserts `person-card-9` appears and `person-card-1` (old head) is gone, and the last `graphqlRequest` call is `familyMember` with `{ id: '9' }`. Passing. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/pages/DetailPage.jsx` | Protected `/detail` page: head→person-by-id load, mainPerson state, 5 page-level D-08 states, PersonCard composition, PersonSearch mount | ✓ VERIFIED | 132 lines. Contains `FAMILY_HEAD_QUERY`, `FAMILY_MEMBER_QUERY`, `loadPersonById`, `loadInitial`, all 5 render branches, `<PersonSearch onSelect={...}>`, `<PersonCard ... onExpand={() => {}} onEdit={() => {}}>`. |
| `frontend/src/pages/DetailPage.test.jsx` | Vitest+RTL coverage of loading, error+retry, missing-head, missing-person, happy path, search-select, Ge'ez pass-through | ✓ VERIFIED | 8 tests, all passing (see spot-check below). |
| `frontend/src/components/person/PersonSearch.jsx` | Debounced async MUI Autocomplete: `searchFamilyMembers`-driven options, rich `renderOption`, `onSelect(id)` callback | ✓ VERIFIED | 109 lines. `filterOptions={(x) => x}`, `SEARCH_MEMBERS_QUERY`, debounce via `setTimeout` ref, `MIN_CHARS = 2`, `noOptionsText="No matches"`, rich `renderOption`. |
| `frontend/src/components/person/PersonSearch.test.jsx` | Vitest+RTL coverage: debounce, min-char, Latin+Ge'ez pass-through, rich row content, no-matches, select→onSelect | ✓ VERIFIED | 6 tests, all passing. |
| `frontend/src/App.jsx` | `detail` Route mounted inside `<ProtectedRoute />` group | ✓ VERIFIED | Line 32: `<Route path="detail" element={<DetailPage />} />`, nested inside the no-args `<ProtectedRoute />` block (lines 28-37), not the `allowedRoles={['ADMIN']}` block. |
| `frontend/src/components/AppLayout.jsx` | Detail nav Button to `/detail` | ✓ VERIFIED | Lines 59-65: `Button component={RouterLink} to="/detail"` inside the authenticated `Stack`, same `sx` as sibling nav buttons, no role guard. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `DetailPage.jsx` | `familyHead` / `familyMember(id)` | `graphqlRequest` | ✓ WIRED | `loadInitial`/`loadPersonById` both call `graphqlRequest(...)`, `.then`/`.catch`/`.finally` set page state; asserted end-to-end by passing tests (2 sequential `graphqlRequest` calls, correct query + variables). |
| `App.jsx` | `DetailPage` | Route inside `ProtectedRoute` group | ✓ WIRED | `path="detail"` nested inside no-args `<ProtectedRoute />`; confirmed by inspection and by `ProtectedRoute.jsx` redirect logic being generic (applies to all routes in that group). |
| `PersonSearch.jsx` | `searchFamilyMembers(term)` | debounced `graphqlRequest` | ✓ WIRED | `handleInputChange` → `setTimeout` → `graphqlRequest(SEARCH_MEMBERS_QUERY, { term })`; options state feeds the `Autocomplete`. Test-verified single-fetch-per-debounce-window and raw-term pass-through. |
| `DetailPage.jsx` | `PersonSearch onSelect` | `loadPersonById` | ✓ WIRED | `onSelect={(id) => loadPersonById(id)}` at line 118; test-verified suggestion selection re-fetches `familyMember(id)` and swaps the rendered card. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `DetailPage.jsx` `mainPerson` | `mainPerson` state | `graphqlRequest(FAMILY_HEAD_QUERY)` → `graphqlRequest(FAMILY_MEMBER_QUERY, {id})`, both hitting the real `/graphql` endpoint / pre-existing Phase-24 resolvers (`backend/src/resolvers/familyMember.resolver.js`) | ✓ (resolvers query `models.FamilyMember` via Sequelize, not static returns) | ✓ FLOWING |
| `PersonSearch.jsx` `options` | `options` state | `graphqlRequest(SEARCH_MEMBERS_QUERY, {term})` → `searchFamilyMembers` resolver, `Op.substring` DB query against `firstname/lastname/geezFirstname/geezLastname` | ✓ (real Sequelize `findAll` with `Op.or`, not a static array) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| DetailPage + PersonSearch unit/integration tests pass in isolation | `npm test --workspace frontend -- DetailPage PersonSearch` | `Test Files 2 passed (2)`, `Tests 14 passed (14)` | ✓ PASS |
| Full frontend suite has zero regressions from this phase's changes | `npm test --workspace frontend` | `Test Files 38 passed (38)`, `Tests 357 passed (357)` | ✓ PASS |
| No debt markers / stub language in phase-modified files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented" <6 files>` | no matches (grep exit 1) across all 6 phase files | ✓ PASS |
| Commits referenced in SUMMARY.md exist in history | `git show --stat <hash>` for `f4d5485, 8fb9069, ee38642, 40118a7, 13e05f0, d47dfd9` | all 6 commits found with matching messages | ✓ PASS |

Backend spot-checks (curl-based) skipped — no live server/DB in this environment and this phase is frontend-only (zero backend files changed); backend read layer was verified in Phase 24.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DETAIL-01 | 26-01 | `/detail` reachable by any authenticated user; unauthenticated → login | ✓ SATISFIED | `App.jsx` route inside no-args `ProtectedRoute`; `ProtectedRoute.jsx` redirect logic |
| DETAIL-02 | 26-01 | First load shows only family head's card, no descendants expanded | ✓ SATISFIED | `DetailPage.jsx` head-id → person-by-id flow, `expanded={false}` |
| DETAIL-03 | 26-01 | loading/no-search-results/no-children/failed-request/missing-family-head/missing-person-info via existing components | ✓ SATISFIED | See Truth #3 above |
| SEARCH-01 | 26-02 | Search finds people by partial/full Latin (case-insensitive) or Ge'ez name | ✓ SATISFIED | `PersonSearch.jsx` + backend `Op.substring` matching (Phase 24, reused) |
| SEARCH-02 | 26-02 | Matches shown as inline suggestions with avatar/Latin/Ge'ez/birth year/family context | ✓ SATISFIED | `PersonSearch.jsx` `renderOption` |
| SEARCH-03 | 26-02 | Selecting a suggestion clears view, sets new main person, descendants collapsed | ✓ SATISFIED | `onSelect` → `loadPersonById`, `expanded={false}` |

No orphaned requirements — all 6 IDs mapped to this phase in `REQUIREMENTS.md` (DETAIL-01/02/03, SEARCH-01/02/03) are claimed by 26-01-PLAN.md / 26-02-PLAN.md frontmatter `requirements:` fields.

Note: `REQUIREMENTS.md`'s traceability table still shows these 6 IDs as "Not started" and the requirement checkboxes as unchecked — this is a stale tracking artifact (the same is true for Phase 25's CARD-01..04/SPOUSE-01, which are demonstrably implemented and tested), not a code gap. Recommend updating `REQUIREMENTS.md` status/checkboxes at milestone completion.

### Anti-Patterns Found

None (blocker or warning level) in the 6 phase-modified files. `26-REVIEW.md` (code review, standard depth) flagged 2 non-blocking warnings and 2 info items, all about async request-ordering robustness, not about the phase's stated success criteria:

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `PersonSearch.jsx:48-69` | No request-id/staleness guard — a fast backspace-then-retype or out-of-order resolution can show stale search results (WR-01) | ⚠️ Warning (non-blocking) | Does not fail any of the 5 phase truths; a real but latent robustness gap already documented and fix-sketched in `26-REVIEW.md`. |
| `DetailPage.jsx:45-52` | `loadPersonById` has no request-id/staleness guard — currently masked by the loading-state subtree swap, but not defensively guarded (WR-02) | ⚠️ Warning (non-blocking) | Same — latent, documented, not currently reachable given the loading-state unmount behavior. |
| `PersonSearch.jsx:48-69,79-80` | Selecting a suggestion schedules a redundant, currently-harmless extra search fetch (IN-01) | ℹ️ Info | No user-visible effect today. |
| `PersonSearch.jsx:74,106` | `loading` prop has no in-field spinner adornment (IN-02) | ℹ️ Info | Minor UX polish only. |

These are pre-existing, disclosed findings from the phase's own code review — not newly discovered blockers — and none of them cause an empty/broken card or contradict a stated success criterion. Recommend tracking WR-01/WR-02 as a fast-follow (e.g., early in Phase 27, which also touches these same load paths for descendant expand/collapse), but they do not block this phase's goal achievement.

### Human Verification Required

See `human_verification` in frontmatter — 3 items covering visual layout, real-time search feel + Ge'ez glyph rendering, and visual correctness of the Alert/Retry states. All are standard "can't verify from grep/jsdom" items for a phase with `UI hint: yes` in ROADMAP.md; none are known-broken, they are just unverified by this automated pass.

### Gaps Summary

No gaps found. All 5 ROADMAP success criteria and all 6 requirement IDs (DETAIL-01/02/03, SEARCH-01/02/03) are backed by real, wired, tested code — not stubs. 14/14 phase-specific tests pass and the full 357/357 frontend suite is green with no regressions. Status is `human_needed` solely because of the 3 visual/real-time items above, which are routine for a new page + live-search UI and do not indicate a known defect.

---

_Verified: 2026-08-03T19:10:51Z_
_Verifier: Claude (gsd-verifier)_
