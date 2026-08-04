---
phase: 27-descendant-navigation-performance
verified: 2026-08-04T08:35:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Visually confirm the responsive GenerationGrid breakpoints (3 cards/row desktop ≥900px, 2/row tablet ~600-900px, 1/row mobile <600px) and that the inverted-V apex connector renders as a calm, restrained cue distinct from the spouse dashed connector and the /family tree edges."
    expected: "Grid reflows correctly at each breakpoint; apex cue is visually subtle (colors.line) and clearly reads as 'these children belong to the couple above' without a line running to each individual card."
    why_human: "jsdom cannot render real CSS layout/breakpoints; the test suite deliberately avoids pixel/getBoundingClientRect assertions (Pitfall 3), so grid reflow and visual apex styling are unverified by any automated test."
  - test: "Trigger an expand click while simulating a network/GraphQL failure (e.g. throttle/offline devtools) and observe the resulting UI state."
    expected: "User sees an error indication (e.g. Alert) and can retry; the app does not silently do nothing."
    why_human: "Code review (27-REVIEW.md WR-01) found ensureEntry's fetch chain has no .catch — on failure the dispatch never runs (no visible state change) and the returned promise rejects unhandled. No test in the suite exercises a rejected graphqlRequest for any expand path, so this failure mode is unverified against real user-facing behavior."
  - test: "Use search to select the person who is already the currently-displayed main person (same id) while some of their descendants are expanded, then observe whether descendants collapse."
    expected: "Per SEARCH-03/D-05 intent, selecting a suggestion should reset to a collapsed view of that person."
    why_human: "Code review (27-REVIEW.md WR-03) found the reset effect is keyed on mainPerson?.id, so a same-id re-selection does not re-run RESET and previously expanded branches stay open. This is a cross-cutting edge case between Phase 26 (search) and this phase's hook, unverified by any test, and best confirmed by a human driving the actual UI."
  - test: "Perform a search-driven main-person swap (search for a different person and select them) and watch closely for a one-frame flash of the previous person's already-expanded descendant grid before it collapses."
    expected: "Clean swap — no visible flash of the old person's expanded tree."
    why_human: "Code review (27-REVIEW.md WR-02) identified that the frame-reset is dispatched from a passive useEffect (post-paint), so there is a theoretical commit where the new mainPerson is set but state.topId still points at the old person's cached, possibly-expanded entry. This is a timing/rendering nuance that automated tests (which assert only after waitFor settles) do not catch, and needs a human to watch the actual browser paint sequence."
---

# Phase 27: Descendant Navigation & Performance Verification Report

**Phase Goal:** Users can expand a person's card to reveal children grouped by generation, capped at three simultaneous generations with a forward-shift on deeper expansion, loaded lazily and cached for the session.
**Verified:** 2026-08-04T08:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Expanding a person's card loads and displays their direct children in a responsive grid grouped by generation (≤3/row desktop, fewer tablet, 1 mobile) with a visible connector | ✓ VERIFIED | `GenerationGrid.jsx` renders `<Grid size={{xs:12,sm:6,md:4}}>` per person + a single `data-testid="generation-apex"` `ApexCue`. Wired into `DetailPage.jsx` (2 `<GenerationGrid>` instances, gen1/gen2). `DetailPage.test.jsx` `NAV-01` test confirms expand click renders `person-card-2` + `generation-apex`. Full suite green (393/393 run live). |
| 2 | Re-clicking the expand control collapses that person's children and hides all descendants beneath, control visibly reflects state | ✓ VERIFIED | `navReducer`'s `EXPAND_TOP`/`EXPAND_CHILD` cases collapse to `null`/`false` (D-02), unit-tested in `descendantNav.reducer.test.js` (11 cases, all pass). `PersonCard.jsx:152,157` toggles `aria-label` ("Show"/"Hide children of...") and rotates the chevron 180deg based on `expanded`. `DetailPage.test.jsx` `NAV-02` test confirms collapsing a child removes the grandchild card from the DOM (`queryByTestId` null). |
| 3 | No more than three generations ever shown at once; expanding a childful grandchild shifts the view forward one generation (grandparent+siblings drop, parent becomes new top, grandchild remains its child, grandchild's children become gen3), no full page reload | ✓ VERIFIED | `EXPAND_GRANDCHILD` reducer case is structurally incapable of a 4th slot (state shape fixed at 4 fields, proven by the NAV-03 `Object.keys` invariant test across two consecutive shifts). `DetailPage.test.jsx`'s combined `NAV-03/NAV-04/D-04` test drives a real 3-level fixture chain through the actual rendered tree, asserts `container.querySelectorAll('[data-testid^="person-card-"]')` has length exactly 3 at the shift's peak, asserts the original head and the promoted parent's sibling are gone, and asserts collapsing the promoted top restores the original head+child+grandchild with zero additional `graphqlRequest` calls (byte-for-byte D-04 undo via the reducer's push/pop history stack). No `window.location`/full-reload call anywhere in the touched files. |
| 4 | Opening `/detail` or expanding a card fetches only the data needed for that step (never the whole tree); descendants already loaded this session are served from cache — no duplicate requests or unnecessary re-renders | ✓ VERIFIED | `useDescendantNav.js` cache is a `useRef(new Map())` (never `useState` — confirmed by `grep -c "useRef(new Map"` = 1), `ensureEntry` short-circuits to `Promise.resolve()` on a cache hit before any network call. `EXPAND_CHILDREN_QUERY` is a separate, narrower query from `DetailPage`'s initial-load `FAMILY_MEMBER_QUERY` (`grep -c "FAMILY_MEMBER_QUERY" useDescendantNav.js` = 0). `DetailPage.test.jsx`'s `PERF-01` test asserts exactly 2 `graphqlRequest` calls before any expand; the `PERF-03` test (Profiler-wrapped) asserts a repeat expand/collapse/re-expand of a cached id fires zero additional `graphqlRequest` calls and an exact, small render-commit count. |

**Score:** 4/4 truths verified (all ROADMAP Success Criteria hold against live-run tests and direct code inspection, not SUMMARY claims alone)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/hooks/descendantNav.reducer.js` | Pure `navReducer`/`initial` state machine, zero imports | ✓ VERIFIED | Exists, 42 lines, 0 imports, exports both functions exactly per plan contract. Read in full — matches spec. |
| `frontend/src/hooks/descendantNav.reducer.test.js` | Exhaustive unit coverage | ✓ VERIFIED | 11 `it(...)` blocks, all pass (live-run). |
| `frontend/src/components/person/GenerationGrid.jsx` | Responsive grid + apex connector wrapper | ✓ VERIFIED | Exists, imports `PersonCard` unmodified, single `data-testid="generation-apex"`, MUI v6 `size` prop used. `PersonCard.jsx` confirmed untouched by this phase (git history shows no phase-27 commit touching it). |
| `frontend/src/components/person/GenerationGrid.test.jsx` | RTL coverage of grid/apex/spouse/loading passthrough | ✓ VERIFIED | 12 `it(...)` blocks, all pass (live-run). |
| `frontend/src/hooks/useDescendantNav.js` | Cache + reducer + expand-only fetch orchestration hook | ✓ VERIFIED | Exists, 99 lines. `useRef` cache, own `EXPAND_CHILDREN_QUERY`, `navReducer` imported not reimplemented. Read in full — matches spec exactly. |
| `frontend/src/hooks/useDescendantNav.test.js` | renderHook-based cache/fetch coverage | ✓ VERIFIED | 7 `it(...)` blocks, all pass (live-run). |
| `frontend/src/pages/DetailPage.jsx` | Live wiring of hook + grids into the real page | ✓ VERIFIED | `nav = useDescendantNav(mainPerson)`, 2 `<GenerationGrid>` instances (gen1 "Child", gen2 "Grandchild"), head card's `onExpand` is live (`nav.onExpandTop`), `onEdit` stays a true no-op everywhere (Phase 28 scope untouched, confirmed 3x `onEdit={() => {}}`). `FAMILY_HEAD_QUERY`/`FAMILY_MEMBER_QUERY` unmodified. |
| `frontend/src/pages/DetailPage.test.jsx` | End-to-end NAV-01..04/PERF-01/PERF-03/D-01/D-04 proof | ✓ VERIFIED | 14 tests total (6 new phase-27 tests plus the updated pre-existing no-op test), each success-criterion ID present as an explicit test title, all pass (live-run). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `useDescendantNav.js` | `descendantNav.reducer.js` | `useReducer(navReducer, mainPerson?.id, initial)` | ✓ WIRED | Import present, reducer driven exclusively through dispatch, confirmed by passing hook tests exercising all four action types end-to-end. |
| `useDescendantNav.js` | backend `familyMember(id)` resolver | `graphqlRequest(EXPAND_CHILDREN_QUERY, { id })` | ✓ WIRED | Confirmed via mocked-request assertions in both `useDescendantNav.test.js` and `DetailPage.test.jsx` (correct `{id}` args, correct call counts on cache hit/miss). |
| `DetailPage.jsx` | `useDescendantNav.js` | `const nav = useDescendantNav(mainPerson)` | ✓ WIRED | Present, called unconditionally above early returns (Rules of Hooks respected). |
| `DetailPage.jsx` | `GenerationGrid.jsx` | `<GenerationGrid people={nav.gen1\|nav.gen2} .../>` conditional on `topExpanded`/`expandedChildId` | ✓ WIRED | Both instances present with correct prop wiring (`onExpand`, `expandedId`, `loadingId`), confirmed rendering real child/grandchild `PersonCard`s in `DetailPage.test.jsx`. |
| `GenerationGrid.jsx` | `PersonCard.jsx` | renders one unmodified `PersonCard` per grid item | ✓ WIRED | `PersonCard` import present, `git diff --stat frontend/src/components/person/PersonCard.jsx` empty across every phase-27 commit — file genuinely untouched. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Reducer + Grid + Hook + DetailPage unit/integration suites | `npm test --workspace frontend -- descendantNav.reducer GenerationGrid useDescendantNav DetailPage` | 4 test files, 44 tests, all passed | ✓ PASS |
| Full frontend regression suite | `npm test --workspace frontend` | 41 test files, 393 tests, all passed (matches SUMMARY's claimed 393/393) | ✓ PASS |
| Backend regression suite | `npm test --workspace backend` | Global setup fails before any test runs: `SequelizeDatabaseError: Can't DROP FOREIGN KEY '34'` during test-DB sync — an environment/test-DB-drift issue, not a code regression. Confirmed via `git show --stat` on every phase-27 commit that **zero backend files were touched** by this phase, so this is a pre-existing local environment condition, not attributable to phase 27. | ⚠️ ENV ISSUE (not a phase-27 regression) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| NAV-01 | 27-02, 27-04 | Expand shows children in responsive grid w/ connector | ✓ SATISFIED | `GenerationGrid.jsx` + `DetailPage.jsx` wiring, tested end-to-end |
| NAV-02 | 27-01, 27-04 | Re-click collapses, hides descendants, control reflects state | ✓ SATISFIED | Reducer + `PersonCard`'s existing chevron/aria-label, tested |
| NAV-03 | 27-01, 27-04 | Never more than 3 generations shown, structural + DOM proof | ✓ SATISFIED | Reducer's fixed 4-field shape + DOM card-count assertion |
| NAV-04 | 27-01, 27-04 | Forward-shift on childful grandchild expand, no reload | ✓ SATISFIED | Reducer push/pop + DOM-level shift/undo test |
| PERF-01 | 27-03, 27-04 | Lazy per-generation fetch, never whole tree on open | ✓ SATISFIED | Separate `EXPAND_CHILDREN_QUERY`, zero-calls-before-expand test |
| PERF-03 | 27-03, 27-04 | Session cache, no duplicate requests, bounded re-renders | ✓ SATISFIED | `useRef` cache + cache-hit-zero-calls + Profiler render-count test |

REQUIREMENTS.md's traceability table (bottom section) still lists these six IDs as "Not started" — this is a **stale documentation artifact**, not a code gap: the same file's per-requirement checklist above the table already marks all six `[x]`, and every ID is backed by passing, requirement-ID-tagged tests as shown above. Flagged as an info-level documentation inconsistency, not a functional gap.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no empty stub returns, and no hardcoded-empty-data patterns found in any of the four files this phase created/modified (`descendantNav.reducer.js`, `useDescendantNav.js`, `GenerationGrid.jsx`, `DetailPage.jsx`).

The phase's own code review (`27-REVIEW.md`, `status: issues_found`, 0 critical / 4 warnings / 3 info) surfaced real, unresolved robustness gaps worth carrying forward here since they are not covered by any automated test and touch this phase's own new files:

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `useDescendantNav.js:60-66` | WR-01: no `.catch` on the expand fetch chain — on failure, dispatch never fires (silent no-op UX) and the promise rejects unhandled | ⚠️ Warning | Expand-failure path has no user-facing error and an unhandled rejection; contradicts the project's `<Alert>`-based error convention used elsewhere (e.g. `DetailPage.loadPersonById`) |
| `useDescendantNav.js:43-48` | WR-02: frame reset dispatched from a passive `useEffect` (post-paint) rather than during render, risking a one-frame stale-tree flash on search-driven person swap | ⚠️ Warning | Cosmetic timing issue on the swap path; untested (tests only assert post-`waitFor`) |
| `DetailPage.jsx:125` + `useDescendantNav.js:48` | WR-03: reset effect is keyed on `mainPerson?.id`, so re-selecting the already-displayed person via search does not collapse open descendants | ⚠️ Warning | Edge case at the Phase 26/27 boundary (SEARCH-03/D-05 intent), untested |
| `DetailPage.test.jsx:424` | WR-04: exact render-commit-count assertion (`toHaveBeenCalledTimes(2)`) is coupled to React's internal commit scheduling and `MemberAvatarImage`'s effect timing | ⚠️ Warning (test brittleness, not a runtime bug) | Future flake risk on a benign refactor/React upgrade, not a user-facing defect |
| `DetailPage.jsx:134,151,162` | IN-01: `onEdit` renders a visible-but-inert Edit button for `canEdit` members | ℹ️ Info | Intentional per Phase 28 scope boundary; documented in this phase's threat model as accepted |

None of these are blockers against the phase's four ROADMAP success criteria (all verified above); they are pre-existing-scope-adjacent robustness/edge-case gaps the phase's own review process already caught and left open. Surfaced as human-verification items below since they need a running app / real browser to confirm impact, not further static analysis.

### Human Verification Required

See frontmatter `human_verification` — four items: (1) visual confirmation of responsive grid breakpoints and apex-connector styling (cannot be verified in jsdom), (2) expand-fetch-failure UX (WR-01, no test coverage), (3) same-id search re-selection collapse behavior (WR-03, no test coverage), (4) stale-frame flash on search-driven person swap (WR-02, no test coverage, timing-only issue).

### Gaps Summary

No FAILED truths, no MISSING/STUB artifacts, no NOT_WIRED key links. All four ROADMAP-declared Success Criteria for Phase 27 are directly observable in the codebase and proven by live-run, passing tests (44/44 phase-specific tests; 393/393 full frontend suite). Status is `human_needed` rather than `passed` solely because (a) the responsive-grid/visual-connector portion of NAV-01 cannot be confirmed without a real browser, and (b) the phase's own code review surfaced three untested edge-case behaviors (expand-failure UX, stale-frame flash, same-id re-select) that a human should exercise before considering the phase fully closed out. None of these block proceeding to Phase 28, but they should not be silently dropped either.

---

_Verified: 2026-08-04T08:35:00Z_
_Verifier: Claude (gsd-verifier)_
