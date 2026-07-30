---
status: partial
phase: 16-photo-upload
source: [16-VERIFICATION.md]
started: 2026-07-24T00:00:00Z
updated: 2026-07-24T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Full browser walkthrough of the upload + crop flow
expected: Click an in-scope member's avatar on /manage, pick a real JPEG/PNG/WebP file, drag/zoom to crop, click "Save photo". The crop dialog opens with a live react-easy-crop preview; the zoom slider works; Save produces a real cropped 512×512 JPEG blob via a genuine browser Canvas; the uploaded photo renders immediately after refetch on every surface (MemberCard, RelationshipGroupedPanel rows, AdminMemberTable).
result: [pending]
why_human: PhotoCropDialog.test.jsx mocks HTMLCanvasElement.getContext/toBlob and the global Image constructor because jsdom has no real Canvas/image-decode implementation — the actual crop-to-512×512-JPEG pixel pipeline has never executed against real image bytes in a real browser. Only the call sequence/props are proven, not the visual/byte correctness of the crop.

### 2. Remove-photo confirm flow end-to-end in a real browser
expected: Click "Remove photo" on a member with a photo, confirm the "Remove photo?" dialog (distinct from "Remove member?"), and verify the avatar reverts to the person-icon placeholder without a page reload.
result: [pending]
why_human: Covered by RTL component/page tests with a mocked photoClient, but never exercised against the real backend + real browser DOM in one pass.

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
