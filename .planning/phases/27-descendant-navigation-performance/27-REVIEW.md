---
phase: 27-descendant-navigation-performance
reviewed: 2026-08-04T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - frontend/src/components/person/GenerationGrid.jsx
  - frontend/src/components/person/GenerationGrid.test.jsx
  - frontend/src/hooks/descendantNav.reducer.js
  - frontend/src/hooks/descendantNav.reducer.test.js
  - frontend/src/hooks/useDescendantNav.js
  - frontend/src/hooks/useDescendantNav.test.js
  - frontend/src/pages/DetailPage.jsx
  - frontend/src/pages/DetailPage.test.jsx
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-08-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the descendant-navigation feature: a pure reducer (`descendantNav.reducer.js`),
a stateful hook wrapping it with a ref-backed fetch cache (`useDescendantNav.js`), a
presentational grid (`GenerationGrid.jsx`), and their wiring into `DetailPage.jsx`.

The core reducer logic is correct and thoroughly specified by its tests — the
forward-shift / symmetric-undo (D-03/D-04) mechanics, the single-open-branch toggle
(D-01), and the exact-object structural assertions all hold up under trace-through. The
cache-hit/cache-miss fetch contract in the hook is also sound and matches its tests.

No security issues and no persistent-state correctness bugs were found. The findings
concentrate on **error-path robustness** and **render-timing** — both areas that the
current test suite does not exercise (every expand test mocks a *resolved* fetch, and no
test drives an expand *failure*). The two most material issues are an unhandled promise
rejection on any expand fetch error (with no user-facing feedback, contrary to the
project's Alert-based error convention) and a stale-frame flash on search-driven person
swaps caused by resetting the view frame inside a `useEffect` rather than during render.

## Warnings

### WR-01: Expand fetch failures are swallowed — no user feedback and an unhandled promise rejection

**File:** `frontend/src/hooks/useDescendantNav.js:60-66` (and callers at `:69-82`)
**Issue:** `ensureEntry` returns the raw `graphqlRequest(...).then(...).finally(...)` chain
with no `.catch`. On a network/GraphQL failure the `.then` that writes the cache is
skipped, `.finally` clears `loadingId`, and the returned promise **rejects**. Each expand
handler then chains `ensureEntry(person).then(() => dispatch(...))` with no rejection
handler, and `PersonCard` invokes it fire-and-forget via `onClick={() => onExpand(member)}`
(`PersonCard.jsx:153`). Net result on any expand failure:
1. The dispatch never runs, so `topExpanded`/`expandedChildId` never update — the user
   clicks "Show children", sees a brief spinner, then **nothing happens**.
2. No error Alert is surfaced, violating the project's frontend error-handling convention
   (`graphqlRequest` errors are supposed to reach the user via MUI `<Alert>`, as
   `DetailPage.loadPersonById` does at `:52`).
3. The rejected promise is unhandled → console error / `unhandledrejection` (and, depending
   on Vitest config, a potential CI failure once a failure path is ever tested).

This entire path is untested — every expand test in `useDescendantNav.test.js` and
`DetailPage.test.js` mocks a resolved value.

**Fix:** Surface the error and keep the promise handled. For example, expose an
`expandError` from the hook and catch at the boundary:
```js
return graphqlRequest(EXPAND_CHILDREN_QUERY, { id: person.id })
  .then((data) => {
    cache.current.set(person.id, { self: person, children: data.familyMember?.children ?? [] });
  })
  .catch((err) => {
    setExpandError(err.message); // rendered via <Alert> in DetailPage
    throw err;                   // or swallow, but do not leave it unhandled at the caller
  })
  .finally(() => {
    setLoadingId((current) => (current === person.id ? null : current));
  });
```
and add a test that drives `graphqlRequest.mockRejectedValueOnce(...)` through an expand.

### WR-02: View-frame reset runs in a `useEffect`, risking a stale-frame flash of the old person's expanded tree on search swap

**File:** `frontend/src/hooks/useDescendantNav.js:43-48`
**Issue:** The `RESET` that collapses descendants on a `mainPerson` change is dispatched
from a passive `useEffect`, which runs *after* commit/paint. During a search-driven swap,
`DetailPage.loadPersonById` sets `mainPerson` (in the fetch `.then`) and clears `loading`
(in the `.finally`) in separate microtasks — both of which flush *before* React runs the
deferred passive effect. There is therefore a commit where `loading === false` and
`mainPerson` is the new person, but `state.topId` is still the **old** id. In that commit
`topPerson = cache.current.get(oldTopId)?.self ?? mainPerson` resolves to the **old**
person, and `topExpanded`/`gen1` still hold the old expanded tree — so the previous
person's fully-expanded card grid can paint for a frame before the effect fires `RESET`
and collapses to the new person. This contradicts D-05's "clean swap, descendants
collapsed" intent. Tests pass only because assertions run after `waitFor` settles.
**Fix:** Reset the frame *during render* on id change instead of in an effect (React's
recommended "adjust state when a prop changes" pattern), or force a fresh hook/subtree via
`key={mainPerson?.id}`. Example (in-render reset):
```js
const [prevId, setPrevId] = useState(mainPerson?.id);
if (mainPerson?.id !== prevId) {
  setPrevId(mainPerson?.id);
  dispatch({ type: 'RESET', id: mainPerson?.id });
}
```

### WR-03: Selecting the currently-displayed person via search does not collapse descendants

**File:** `frontend/src/pages/DetailPage.jsx:125`, `frontend/src/hooks/useDescendantNav.js:48`
**Issue:** `PersonSearch.onSelect` always calls `loadPersonById(id)`, producing a fresh
`mainPerson` object. The reset effect is keyed on `[mainPerson?.id]`, so re-selecting the
person already shown (same id, new object) does **not** re-run — `RESET` is skipped and any
expanded gen1/gen2 branches remain open. Per SEARCH-03/D-05, selecting a suggestion should
"clear the current view and show only the new person's card with descendants collapsed";
that guarantee silently breaks for the same-id case.
**Fix:** Reset the view frame whenever a person is (re-)selected rather than only on id
change — e.g. gate the reset on the loaded person identity/object, or explicitly collapse
in `onSelect`. If same-id re-selection is considered out of scope, filter the current
person out of the search suggestions and document the exclusion.

### WR-04: Brittle exact render-commit-count assertion

**File:** `frontend/src/pages/DetailPage.test.jsx:424`
**Issue:** `expect(onRenderSpy).toHaveBeenCalledTimes(2)` pins the test to an exact number
of React commits, justified by a ~15-line comment reconstructing the precise
dispatch/effect/avatar-mount commit sequence. This couples the test to React's internal
batching and to `MemberAvatarImage`'s mount-effect timing; a benign refactor (or a React
minor upgrade changing effect/commit scheduling) will flip it to 3 without any real
regression, making it a likely future flake. The behavioral guarantee that matters here —
"zero new `graphqlRequest` calls on re-expand" — is already asserted on `:423`.
**Fix:** Assert a bound rather than an exact count (`expect(onRenderSpy.mock.calls.length).toBeLessThanOrEqual(2)`)
or drop the commit-count assertion and keep the network-call assertion, which is the
robust proxy for "served from cache."

## Info

### IN-01: Edit control is rendered but wired to a no-op across the whole /detail view

**File:** `frontend/src/pages/DetailPage.jsx:134`, `:151`, `:162`
**Issue:** All three `onEdit` props (top card and both grids) are `() => {}`. `PersonCard`
still renders an Edit `IconButton` for any `member.canEdit === true` (`PersonCard.jsx:104-112`),
so an editor sees an Edit affordance that does nothing on click. The test at
`DetailPage.test.jsx:147` even codifies the no-op ("does not throw"). If Edit is genuinely
out of scope for this phase this is acceptable, but the visible-yet-inert control is
misleading UX.
**Fix:** Either hide the Edit affordance on /detail until it is wired (e.g. don't pass a
handler / gate its render), or add a TODO referencing the phase that will implement it.

### IN-02: Full person field-set duplicated across two query strings

**File:** `frontend/src/pages/DetailPage.jsx:23-37`, `frontend/src/hooks/useDescendantNav.js:13-29`
**Issue:** The per-person selection set (`fullname geezFullname gender isAlive photoUrl
canEdit spouses { ... } children { id }`) is hand-duplicated between `FAMILY_MEMBER_QUERY`'s
target and `EXPAND_CHILDREN_QUERY`'s `children` block. The two must stay in lock-step for a
promoted child (gen2→gen1 shift) to render identically to a head-loaded person; drift (e.g.
adding a field to one) would produce subtly inconsistent cards.
**Fix:** Extract the shared selection into a single exported GraphQL fragment/constant and
interpolate it into both queries.

### IN-03: Mutable ref (`cache.current`) is read during render

**File:** `frontend/src/hooks/useDescendantNav.js:84-86`
**Issue:** `topPerson`, `gen1`, and `gen2` are derived by reading `cache.current` (a ref)
during render. This is intentional (PERF-03: cache writes must not themselves re-render),
but correctness depends on the invariant that *every* cache write is immediately followed
by a state update (`setLoadingId`/`dispatch`) that triggers the re-render which reads it. It
holds today, but the coupling is implicit and easy to break in a future edit that writes the
cache without a paired state change (the read would then show stale data).
**Fix:** Add a short comment at the derivation site restating the "every cache write is
paired with a state update" invariant, or promote the derived slices behind the state
updates that already drive them so the dependency is explicit.

---

_Reviewed: 2026-08-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
