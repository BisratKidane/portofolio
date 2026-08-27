---
status: partial
phase: 26-detail-page-search-initial-load
source: [26-VERIFICATION.md]
started: 2026-08-03T19:10:51Z
updated: 2026-08-03T19:10:51Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. /detail opens on a single, centered head card
expected: Log in, click the 'Detail' nav link, and visually confirm /detail opens with the search bar above a single, centered head PersonCard (no descendants, no layout breakage on desktop + mobile widths). Search bar and head card render cleanly, matching the visual language of /family and /manage; no overlap, clipping, or unstyled flash.
result: [pending]

### 2. Live search feel + Ge'ez glyph rendering + card swap
expected: Type a partial Latin name (2-3 letters) and a partial Ge'ez name into the search bar in a real browser and watch the suggestion dropdown appear. Suggestions feel responsive (debounce doesn't feel laggy or fire a request per keystroke), each row legibly shows avatar + Latin name + Ge'ez name (RTL/LTR mixed line renders correctly) + birth year + family context, and selecting one visibly swaps the card with no flicker/broken intermediate state.
result: [pending]

### 3. Failed-request and missing-family-head Alert/Retry states
expected: Trigger the failed-request and missing-family-head states (e.g. temporarily kill the backend / test against a family with no head) and confirm the Alert copy and Retry button look correct and are actually usable by click. Alert severity colors and Retry button are visually correct and clickable; no console errors.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
