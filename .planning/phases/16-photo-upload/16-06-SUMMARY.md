---
phase: 16-photo-upload
plan: 06
subsystem: ui
tags: [react, mui, axios, react-easy-crop, vitest, react-testing-library, tdd, blob-fetch, canvas]

# Dependency graph
requires:
  - phase: 16-photo-upload
    plan: 16-04
    provides: "POST /api/family-members/:id/photo, FamilyMember.photoUrl computed field"
  - phase: 16-photo-upload
    plan: 16-05
    provides: "DELETE/GET /api/family-members/:id/photo"
provides:
  - "photoClient.js — axios instance with attachAuthHeader Bearer interceptor, uploadMemberPhoto, removeMemberPhoto, fetchMemberPhotoBlob"
  - "MemberAvatarImage.jsx — authenticated blob-fetch avatar renderer (D-09/D-10)"
  - "PhotoCropDialog.jsx — client-side square-crop/preview dialog (D-02)"
  - "/api proxy entry in the Vite dev server"
affects: [16-07]

# Tech tracking
tech-stack:
  added: ["react-easy-crop ^6.2.3"]
  patterns:
    - "Second axios instance (photoClient) with no baseURL override, resolving relative /api/... paths against the page origin — distinct from graphqlClient's GraphQL-specific baseURL"
    - "attachAuthHeader extracted as a standalone, directly-unit-testable function (same logic as graphqlClient.js's inline interceptor)"
    - "Authenticated <img> replacement pattern: fetch the protected resource as a blob via axios (Bearer header), URL.createObjectURL it, revoke on unmount/prop-change — the app's first authenticated-image pattern"
    - "Client-side crop-to-fixed-size-JPEG-blob via an off-screen <canvas> (drawImage + toBlob), keeping the upload deterministically small and always a JPEG regardless of the source format"

key-files:
  created:
    - frontend/src/api/photoClient.js
    - frontend/src/api/photoClient.test.js
    - frontend/src/components/manage/MemberAvatarImage.jsx
    - frontend/src/components/manage/MemberAvatarImage.test.jsx
    - frontend/src/components/manage/PhotoCropDialog.jsx
    - frontend/src/components/manage/PhotoCropDialog.test.jsx
  modified:
    - frontend/package.json
    - frontend/vite.config.js
    - package-lock.json

key-decisions:
  - "Lockfile change landed in the root package-lock.json (not frontend/package-lock.json as the plan's files_modified listed) — this repo uses a single root lockfile shared across npm workspaces (confirmed in CLAUDE.md/STACK.md); staged and committed the actual file that changed"
  - "MemberAvatarImage.test.jsx's placeholder assertion was corrected mid-TDD-cycle from expecting role='img' to querying .MuiAvatar-root directly — MUI's Avatar only exposes role='img' when it renders a real <img> (i.e. when src resolves); with icon children and no src, alt is a passed prop, not an accessible-name mechanism, so the original assertion was testing an MUI behavior that doesn't exist rather than this component's behavior"
  - "PhotoCropDialog crops via an off-screen <img> (object URL) drawn onto a 512x512 canvas rather than drawing react-easy-crop's own DOM nodes directly — this is the natural way to get pixel data independent of the Cropper's internal rendering, and keeps the crop-to-blob logic pure/testable by mocking window.Image + HTMLCanvasElement in the test file rather than needing real image decoding in jsdom"

patterns-established:
  - "Any future authenticated-<img>-equivalent surface should follow MemberAvatarImage's fetch-blob/createObjectURL/revoke-on-cleanup shape rather than inventing a new one"
  - "photoClient.js is the template for any future non-GraphQL frontend API client: its own axios instance (baseURL only if targeting a different origin), attachAuthHeader as a standalone exported function, Network Error re-thrown with actionable context"

requirements-completed: [PHOTO-01]

# Metrics
duration: 10min
completed: 2026-07-24
---

# Phase 16 Plan 06: Photo Client, Authenticated Avatar & Crop Dialog Summary

**photoClient.js (Bearer-auth axios client for the non-GraphQL photo routes), MemberAvatarImage.jsx (the app's first authenticated-blob-fetch `<img>` replacement, icon-only placeholder per D-10), and PhotoCropDialog.jsx (client-side square-crop to a 512x512 JPEG blob via `react-easy-crop` + off-screen canvas, mirroring `EditMemberDialog`'s shell) — three standalone, fully tested frontend primitives built ahead of their 16-07 wiring**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-24T21:04:24+02:00 (approx, base reset)
- **Completed:** 2026-07-24T21:14:27+02:00
- **Tasks:** 3 (Task 1 auto; Tasks 2–3 each their own TDD RED → GREEN cycle)
- **Files created:** 6
- **Files modified:** 3

## Accomplishments
- `frontend/src/api/photoClient.js` — a second axios instance (no `baseURL` override, so it resolves relative `/api/...` paths against the page origin, unlike `graphqlClient`'s GraphQL-specific `baseURL`); `attachAuthHeader` extracted as a standalone, directly-unit-tested function carrying the exact same Bearer-token logic `graphqlClient.js` already uses; `uploadMemberPhoto`, `removeMemberPhoto`, `fetchMemberPhotoBlob` targeting the 16-04/16-05 route contract, with the same "Network Error" re-throw pattern as `graphqlRequest`
- `frontend/vite.config.js` gained a second dev-server proxy entry (`/api`, reusing the existing `proxyTarget`) alongside `/graphql`
- `frontend/src/components/manage/MemberAvatarImage.jsx` — the app's first authenticated-`<img>`-equivalent: no `photoUrl` renders a `PersonRoundedIcon` placeholder (`aria-hidden`, `#eef1f8`/`colors.slate`) — never initials, never a skeleton; a present `photoUrl` shows a circular `Skeleton` while `fetchMemberPhotoBlob` is pending, then an `Avatar` with the resolved object URL as `src`; object URLs are revoked on unmount and on every `photoUrl` change; a rejected fetch falls back silently to the placeholder with no visible error
- `frontend/src/components/manage/PhotoCropDialog.jsx` — mirrors `EditMemberDialog`'s exact shell (`Dialog fullWidth maxWidth="sm"` → `DialogTitle` → `DialogContent` → `Stack spacing={2}` with the error `Alert` first, action row last); renders a round `react-easy-crop` `Cropper` (`aspect={1}`, `cropShape="round"`, `showGrid={false}`) on `colors.ink`, a `Slider` (`aria-label="Zoom"`, `min={1}`, `max={3}`, `step={0.1}`), and the exact D-02 helper copy; submit draws the `onCropComplete` pixel bounds onto an off-screen 512×512 `<canvas>`, calls `canvas.toBlob('image/jpeg', 0.9)`, then `uploadMemberPhoto(member.id, blob)`; `Save photo` → `Uploading…` with both buttons disabled and `onClose` a no-op while submitting (mirrors `ManagePage.jsx`'s delete-confirm guard); `Cancel` discards the selection without ever calling `uploadMemberPhoto`; a rejected upload renders an error `Alert` and re-enables both buttons
- Full frontend suite: 103/103 green (90 prior + 13 new), no regressions

## Task Commits

Each task was committed individually; Tasks 2–3 as their own RED → GREEN cycle:

1. **Task 1: react-easy-crop install, vite /api proxy, photoClient.js** - `fddf576` (feat)
2. **Task 2: MemberAvatarImage.jsx (D-09/D-10)** - `7b5fa10` (test, RED — component doesn't exist) → `e53af01` (feat, GREEN — all 4 tests pass)
3. **Task 3: PhotoCropDialog.jsx (D-02)** - `77f30e2` (test, RED — component doesn't exist) → `64baede` (feat, GREEN — all 7 tests pass)

_Confirmed via `git log`: `7b5fa10` precedes `e53af01`, and `77f30e2` precedes `64baede` — both TDD cycles' RED commits predate their own GREEN commits._

## Files Created/Modified
- `frontend/src/api/photoClient.js` - Second axios instance, `attachAuthHeader`, `uploadMemberPhoto`, `removeMemberPhoto`, `fetchMemberPhotoBlob`
- `frontend/src/api/photoClient.test.js` - 2 tests: `attachAuthHeader` with/without a stored token
- `frontend/src/components/manage/MemberAvatarImage.jsx` - Authenticated blob-fetch avatar renderer (D-09/D-10)
- `frontend/src/components/manage/MemberAvatarImage.test.jsx` - 4 tests: placeholder, pending-fetch skeleton, resolved-blob avatar + revoke-on-unmount, silent fallback on rejection
- `frontend/src/components/manage/PhotoCropDialog.jsx` - Crop/preview dialog (D-02), 512×512 canvas crop-to-JPEG, upload wiring
- `frontend/src/components/manage/PhotoCropDialog.test.jsx` - 7 tests: buttons, Zoom slider, in-flight state, non-dismissible while submitting, error Alert + re-enable on rejection, Cancel never uploads, successful submit crops + uploads + closes
- `frontend/package.json` - added `react-easy-crop` dependency
- `frontend/vite.config.js` - added `/api` proxy entry
- `package-lock.json` - root workspace lockfile updated for the new dependency

## Decisions Made
- The plan's `files_modified` listed `frontend/package-lock.json`, but this repo uses a single root `package-lock.json` shared across npm workspaces (per `CLAUDE.md`/`STACK.md`) — staged and committed the actual root lockfile that `npm install --workspace frontend` updated, not a nonexistent per-workspace lockfile.
- Corrected `MemberAvatarImage.test.jsx`'s placeholder-state assertion mid-cycle: MUI's `Avatar` only exposes `role="img"` when it renders a real `<img>` element (i.e., when `src` resolves); with icon `children` and no `src`, `alt` is passed through as a prop but produces no accessible-name mechanism on the root. The original RED test asserted `getByRole('img', { name: ... })`, which was testing MUI internals that don't apply to the icon-only placeholder path, not this component's actual behavior. Fixed to query `.MuiAvatar-root` + the icon's `data-testid`/`aria-hidden` directly — still fully exercises the D-10 "icon, never initials, never a skeleton" contract.
- `PhotoCropDialog`'s crop-to-blob step loads the file's object URL into an off-screen `<img>` before drawing onto the canvas (rather than trying to read pixel data directly from `react-easy-crop`'s internal DOM), which keeps the cropping logic independent of the Cropper library's rendering internals and made it testable by stubbing `window.Image` + `HTMLCanvasElement.prototype.{getContext,toBlob}` in the test file, without needing real image decoding in jsdom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `frontend/package-lock.json` reference to the actual root lockfile**
- **Found during:** Task 1, immediately after `npm install`
- **Issue:** The plan's `files_modified` frontmatter listed `frontend/package-lock.json`, but `git status` after the install showed only the root `package-lock.json` changed (this npm-workspaces repo has one shared lockfile, not per-workspace lockfiles).
- **Fix:** Staged and committed the actual root `package-lock.json`.
- **Files modified:** `package-lock.json` (root, not `frontend/package-lock.json`)
- **Verification:** `git status --short` confirmed the correct file was staged; `git log` shows it in the Task 1 commit.
- **Committed in:** `fddf576` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed a self-authored test assertion that relied on MUI behavior that doesn't apply to the icon-only Avatar path**
- **Found during:** Task 2 GREEN step, first test run after implementing `MemberAvatarImage.jsx`
- **Issue:** The RED test asserted `screen.getByRole('img', { name: 'Ada Lovelace' })` for the no-photo placeholder state. MUI's `Avatar` only sets `role="img"` when it renders a real `<img>` element (i.e. `hasImgNotFailing` — `src` present and loading successfully); with icon `children` and no `src`, the component renders a plain `div.MuiAvatar-root` with no ARIA role, so this assertion could never pass for the icon-only path regardless of implementation correctness.
- **Fix:** Rewrote the assertion to query `.MuiAvatar-root` presence and the `PersonRoundedIcon`'s `data-testid`/`aria-hidden` attribute directly — still fully proves the D-10 contract (icon placeholder, never initials, never a skeleton) without asserting a nonexistent MUI role.
- **Files modified:** `frontend/src/components/manage/MemberAvatarImage.test.jsx`
- **Verification:** All 4 `MemberAvatarImage.test.jsx` tests pass; full frontend suite re-run confirmed still green (103/103).
- **Committed in:** `e53af01` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (lockfile path correction, self-authored test assertion fix), both discovered and resolved within the same TDD cycle that introduced them
**Impact on plan:** None on functionality or scope. Neither deviation touched the underlying components' behavior — one was a file-path bookkeeping correction, the other was fixing a test's incorrect assumption about a third-party library's accessibility API before it could mask real regressions.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `photoClient.js`, `MemberAvatarImage.jsx`, and `PhotoCropDialog.jsx` are built, tested, and ready for 16-07 to wire into `MemberCard.jsx` (avatar trigger + camera overlay), `ManagePage.jsx` (dialog open/close orchestration, remove-photo confirm), `RelationshipGroupedPanel.jsx`, and `AdminMemberTable.jsx` (display-only photo usage).
- `MemberAvatarImage` establishes the only authenticated-image pattern this app needs going forward — any future protected-image surface should reuse its fetch-blob/createObjectURL/revoke shape.
- No blockers identified for 16-07.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files verified present on disk; all commits verified present in git log:
- `frontend/src/api/photoClient.js` — FOUND
- `frontend/src/api/photoClient.test.js` — FOUND
- `frontend/src/components/manage/MemberAvatarImage.jsx` — FOUND
- `frontend/src/components/manage/MemberAvatarImage.test.jsx` — FOUND
- `frontend/src/components/manage/PhotoCropDialog.jsx` — FOUND
- `frontend/src/components/manage/PhotoCropDialog.test.jsx` — FOUND
- `fddf576` (Task 1) — FOUND
- `7b5fa10` (Task 2 RED) — FOUND
- `e53af01` (Task 2 GREEN) — FOUND
- `77f30e2` (Task 3 RED) — FOUND
- `64baede` (Task 3 GREEN) — FOUND
- `1caaf6d` (docs summary) — FOUND
