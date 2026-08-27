---
phase: 28-admin-actions-on-detail
reviewed: 2026-08-04T14:23:13Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - frontend/src/components/person/PersonCard.jsx
  - frontend/src/components/person/GenerationGrid.jsx
  - frontend/src/hooks/descendantNav.reducer.js
  - frontend/src/hooks/useDescendantNav.js
  - frontend/src/pages/DetailPage.jsx
  - backend/src/resolvers/familyMember.detailAdminActions.test.js
  - frontend/src/components/person/PersonCard.test.jsx
  - frontend/src/components/person/GenerationGrid.test.jsx
  - frontend/src/hooks/descendantNav.reducer.test.js
  - frontend/src/hooks/useDescendantNav.test.js
  - frontend/src/pages/DetailPage.test.jsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-08-04T14:23:13Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 28 wires admin edit/add controls into `/detail` (`PersonCard`'s Add-menu, `useDescendantNav`'s `refreshEntry`/`REFRESH`, and `DetailPage`'s `handleEditClick`/`refreshAfterMutation`/`handleAddRelative`/`autoExpandIfCollapsed`/`handleAddCreated`). Server-side authz is unchanged and is proven to still reject out-of-scope non-admins by the new adversarial backend test (`familyMember.detailAdminActions.test.js`), which is well-constructed (asserts the exact rejection message, `data === null`, and zero DB side effects for all three mutations).

No security vulnerabilities or logic-breaking bugs were found in the reducer/cache-invalidation primitives themselves — `REFRESH`'s new-reference return, `refreshEntry`'s id-agnostic cache write, and the gen1/gen2 forward-shift auto-expand routing all behave as documented, and this was independently confirmed by tracing the actual code paths (not just trusting the green test suite).

The issues found are concentrated in `DetailPage.jsx`'s new wiring code: two gaps in error handling around the new `refreshEntry`-based refresh path (an unhandled promise rejection on refresh failure, and a page-level error state reused for a should-be-local dialog-fetch failure), plus one piece of genuinely dead state (`editLoadingId` is set but never rendered, so there is no loading indicator for the Edit action's field fetch, unlike the equivalent `nav.loadingId` indicator that exists for Add/expand). None of these are covered by the (otherwise thorough) new test suite, which only exercises the happy paths for edit/add wiring.

## Warnings

### WR-01: Refresh failure after a successful edit/add mutation is an unhandled promise rejection with no user-facing error, risking duplicate-submission confusion

**File:** `frontend/src/pages/DetailPage.jsx:142-151` (`refreshAfterMutation`), `:181-187` (`handleAddCreated`), `:276` (`onSaved={() => refreshAfterMutation(editTarget)}`)

**Issue:** `refreshAfterMutation` calls `nav.refreshEntry(member.id).then(...)` with no `.catch`. `nav.refreshEntry` (`frontend/src/hooks/useDescendantNav.js:119-133`) itself has no `.catch` either — a `graphqlRequest` rejection propagates straight out. Every call site of `refreshAfterMutation` (the `EditMemberDialog`'s `onSaved` prop, and `handleAddCreated`) is fire-and-forget: `EditMemberDialog.jsx:69-70` and `AddRelativeDialog.jsx:206-207` call `onSaved()`/`onCreated()` synchronously (not `await`ed) and then immediately call `onClose()`, closing the dialog before the refresh promise can possibly resolve or reject.

Concrete failure scenario: an admin edits a member's phone number. The `editMember` mutation succeeds server-side. `onSaved()` fires `refreshAfterMutation`, which calls `nav.refreshEntry`. If that follow-up GraphQL request fails (transient network blip, momentary auth hiccup, backend hiccup unrelated to the edit itself), the promise rejects with no `.catch` anywhere in the chain — an unhandled promise rejection. The dialog has already closed (it doesn't wait for the refresh). The card on screen still shows the pre-edit phone number, with zero error feedback to the admin. The admin, seeing no change, may re-open Edit and resubmit — harmless for `editMember` (idempotent), but for the equivalent add-child/add-spouse path (`handleAddCreated`, same missing `.catch`), a refresh failure after a successful `addChild`/`addSpouse` leaves the newly created relative invisible with no error shown, which can plausibly lead an admin to retry the Add flow and create a **duplicate family member row**.

**Fix:**
```javascript
const refreshAfterMutation = useCallback(
  (member) =>
    nav.refreshEntry(member.id).then((fresh) => {
      if (fresh && mainPerson && String(fresh.id) === String(mainPerson.id)) {
        setMainPerson(fresh);
      }
      return fresh;
    }).catch((err) => {
      setError(err.message); // or a dedicated non-blocking toast/snackbar state
      return null;
    }),
  [mainPerson, nav.refreshEntry]
);
```
(See WR-02 below for why reusing the page-level `error` state specifically is itself a problem — a separate, non-page-replacing error surface, e.g. a `Snackbar`, is the better fix here.)

### WR-02: `handleEditClick`'s fetch failure reuses the page-level `error` state, wiping the entire navigation view for what should be a localized dialog-open failure

**File:** `frontend/src/pages/DetailPage.jsx:120-126` (`handleEditClick`), `:198-207` (page-level error render branch)

**Issue:** `handleEditClick` is:
```javascript
const handleEditClick = useCallback((member) => {
  setEditLoadingId(member.id);
  return graphqlRequest(FAMILY_MEMBER_EDIT_QUERY, { id: member.id })
    .then((data) => setEditTarget(data.familyMember))
    .catch((err) => setError(err.message))
    .finally(() => setEditLoadingId((current) => (current === member.id ? null : current)));
}, []);
```
`setError` is the SAME state that drives the page's top-level early return: `if (error) { return <Alert>{error}</Alert> ... }` (lines 198-207), which replaces the entire page content — including the currently-expanded gen1/gen2 grids, any forward-shifted promoted-top navigation state, and the search bar — with a full-page error screen whose only recovery action is `Retry` (`loadInitial()`, which reloads from the head, discarding all navigation history).

Concrete failure scenario: an admin has navigated three levels deep (head → gen1 → gen2, or further via a forward-shifted promoted top) and clicks Edit on a card. If the `FAMILY_MEMBER_EDIT_QUERY` fetch fails for any reason (network blip, transient 401 if the JWT expired mid-session, etc.), the entire page collapses to a full-screen error with no way to get back to the in-progress navigation state short of a full reload back to the head. This is a much larger blast radius than the actual failure (a modal that simply didn't open).

**Fix:** Give the edit-fetch failure its own local error state (e.g. a `Snackbar`/inline `Alert` scoped to the Edit action) instead of reusing the page-level `error`:
```javascript
const [editError, setEditError] = useState('');
const handleEditClick = useCallback((member) => {
  setEditLoadingId(member.id);
  setEditError('');
  return graphqlRequest(FAMILY_MEMBER_EDIT_QUERY, { id: member.id })
    .then((data) => setEditTarget(data.familyMember))
    .catch((err) => setEditError(err.message))
    .finally(() => setEditLoadingId((current) => (current === member.id ? null : current)));
}, []);
```

### WR-03: `editLoadingId` is set but never read — no loading indicator for the Edit action's field fetch (dead state / missing feedback)

**File:** `frontend/src/pages/DetailPage.jsx:80` (declaration), `:121` and `:125` (set/reset)

**Issue:** `editLoadingId` is declared via `useState(null)`, written in `handleEditClick`, and reset in its `.finally` — but grep confirms it is never read anywhere else in the file (not passed to `PersonCard`, `GenerationGrid`, or rendered directly). This mirrors the working pattern already present in the same file for `nav.loadingId` (rendered as a `CircularProgress` overlay at `:241-248` and passed into `GenerationGrid` at `:258`/`:269`), which strongly suggests a loading indicator for Edit was intended but never wired up. The practical effect: clicking Edit gives zero visual feedback while `FAMILY_MEMBER_EDIT_QUERY` is in flight — the Edit `IconButton` stays fully clickable and unchanged, so on a slow connection a user can double/triple-click Edit, firing multiple concurrent identical fetches (harmless here since the last response wins, but wasteful and a UX smell).

**Fix:** Either render the existing `editLoadingId` (e.g. disable/spin the clicked card's Edit button, mirroring the `nav.loadingId` overlay pattern already used for Add/expand), or remove the unused state entirely if a loading indicator for Edit is intentionally out of scope. As shipped, the state is dead code that also represents a missing piece of user feedback.

## Info

### IN-01: `refreshEntry` shares `loadingId` with `ensureEntry`/expand handlers — concurrent Edit-refresh and expand/Add actions can produce a misleading spinner

**File:** `frontend/src/hooks/useDescendantNav.js:69` (`loadingId` state), `:90` (`ensureEntry` sets it), `:120` (`refreshEntry` sets it)

**Issue:** `loadingId` is a single piece of state shared by every in-flight `ensureEntry`/`refreshEntry` call. If an admin triggers a `refreshEntry` for person A (e.g. via an Edit save) while a `ensureEntry`-driven expand fetch for person B is still in flight, the second `setLoadingId` call overwrites the first. When the first request's `.finally` fires, its `current === id` guard correctly declines to null out the second request's `loadingId` — so no crash — but the net effect is that the `CircularProgress` spinner in `PersonCard`/`GenerationGrid`/`DetailPage`'s head card can silently stop reflecting one of the two truly-still-pending requests (whichever lost the `loadingId` race), or briefly show for the wrong card. Cosmetic only, but worth noting since Phase 28 is the first caller to add a second concurrent source (`refreshEntry`) onto what was previously a single-source loading flag.

**Fix:** Not required for this phase (performance/UX polish, not correctness), but if addressed, track loading state per-id (a `Set`/`Map` of in-flight ids) rather than a single `loadingId` scalar.

### IN-02: Add-button offset (`right: 56`) is a magic number tied to the Edit button's exact geometry, duplicated with no shared constant

**File:** `frontend/src/components/person/PersonCard.jsx:113` (Edit button `right: 8`), `:124` (Add button `right: 56`)

**Issue:** The Add IconButton's `right: 56` is only correct because it happens to equal Edit's `right: 8` + Edit's ~44px width + an 8px gap (per the plan's own math, documented in the 28-02 summary but not in the component itself). If Edit's button size or position ever changes, this magic number silently desyncs with no compile-time or runtime signal — the two buttons would visually overlap.

**Fix:** Extract a shared constant (e.g. `const ACTION_BUTTON_SIZE = 44; const ACTION_BUTTON_GAP = 8;`) and derive both offsets from it, or compose the two buttons in a flex row instead of two independently-positioned absolute boxes.

---

_Reviewed: 2026-08-04T14:23:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
