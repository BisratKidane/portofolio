---
status: partial
phase: 27-descendant-navigation-performance
source: [27-VERIFICATION.md, 27-REVIEW.md]
started: "2026-08-04T06:35:00Z"
updated: "2026-08-04T06:35:00Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Responsive grid + apex connector visual check
expected: On a real browser, expanding a person reveals children in a responsive per-generation grid with a group-level inverted-V (apex) connector; layout reflows cleanly across mobile/desktop breakpoints. jsdom cannot assert real CSS layout, so the automated suite deliberately skips pixel-level checks.
result: [pending]

### 2. Expand-fetch-failure UX (WR-01)
expected: When the children fetch for an expand rejects (e.g. network error), the user sees a visible error surface (per the project's MUI Alert convention) rather than a silently dead click. NOTE: current code (`useDescendantNav.js` `ensureEntry`) has no `.catch` — on failure the dispatch never runs and the rejection is unhandled. This item verifies whether that behavior is acceptable or needs the WR-01 fix.
result: [pending]

### 3. Same-id search re-selection (WR-03)
expected: Re-selecting the already-displayed person from search collapses any open descendants back to the initial frame. NOTE: current reset effect is keyed on id, so re-selecting the same id does not re-collapse. Confirm whether this matches intended UX.
result: [pending]

### 4. Stale-frame flash on search swap (WR-02)
expected: Swapping to a different person via search shows a clean transition with no flash of the previous person's expanded tree. NOTE: frame reset runs in a passive `useEffect`, theoretically allowing one paint frame of the old expanded tree before collapse. Confirm visually whether any flash is perceptible.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
