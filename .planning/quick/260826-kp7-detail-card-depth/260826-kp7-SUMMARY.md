---
phase: quick
plan: 01
status: complete
subsystem: ui
tags: [react, mui, detail-page, visual-design, a11y, refactor]

requires:
  - phase: quick/260826-k6r
    provides: the depth system, first built inline in /family's MemberNode
provides:
  - utils/cardDepth.js as the single source of truth for person-card depth and gender hues
  - /detail's PersonCard rendering from that system (gradient face, bevelled rim, layered elevation, medallion avatar, raised controls)
  - A WCAG gate that composites the tokens the components render, incl. non-text rim coverage
affects: [detail-page, family-tree]

tech-stack:
  added: []
  patterns:
    - "One depth module, two consumers: MemberNode and PersonCard both call cardSurface(genderLabel) + depthShadow(rimTint), so the surfaces cannot drift apart."
    - "Medallion avatar: bezel proud (outer ring + drop shadow), portrait sunken (::after inset shadow). Two opposite depth directions in one assembly read as more physical than either alone."
    - "Hover motion belongs to things that are pressable. The tree node is a click target and lifts; the /detail card is not and does not -- its controls carry the motion instead."
    - "Controls that overlay imagery get a translucent scrim + backdrop blur, not an opaque disc."
    - "Contrast gates should import the design tokens and composite them, not restate a background hex -- otherwise the gate keeps passing after the component's background changes."

key-files:
  created:
    - frontend/src/utils/cardDepth.js
  modified:
    - frontend/src/components/family/MemberNode.jsx
    - frontend/src/components/person/PersonCard.jsx
    - frontend/src/theme.contrast.test.js

key-decisions:
  - "Two text ramps, not one: META_TINT (vivid, 700-level) for /family's dense node where the Ge'ez name is the visual anchor, TEXT_TINT (deep, 800-level) for /detail's large pale card. Both gated at 4.5:1; consolidating to one would have cost either legibility or life."
  - "The rim gate pairs each stop with the face stop BESIDE it rather than the face's darkest corner. The face and rim ramps are lit from the same side, so a light rim never sits against a dark face -- the test asserts that invariant explicitly rather than assuming it, and a naive worst-case pairing would have failed a rim that is physically fine (2.98:1 against a corner it never touches)."
  - "No hover lift on the /detail card body -- it is not a click target and a lift would promise an interaction that does not exist."
  - "PersonCard re-exports TEXT_TINT from its old path so the existing gate import keeps working."

verification:
  - "438/438 frontend tests pass (42 files); frontend prod build green."
  - "Visually verified in Chromium via a throwaway Vite harness rendering the /detail head+spouse pair and a three-up GenerationGrid (male/female/other, living/deceased, Ge'ez and non-Ge'ez, canEdit controls) at 1x and 3x. Harness removed."
  - "The visual pass caught a paint-order regression: making the avatar well `position: relative` (needed for its ::after recess) put it in the same paint layer as the absolutely-positioned Edit/Add controls and later in DOM order, hiding them. Fixed with z-index."

open-items:
  - "Pre-existing /detail layout issue, surfaced by the polish: in a spouse pair inside DetailPage's maxWidth 420 wrapper each card is ~194px wide, so the top-right Edit/Add controls overlap the 96px centred avatar. Mitigated with a translucent scrim so both stay legible, but the real fix is a layout change (in-flow header row or a narrower avatar) that would alter card heights -- out of scope for a visual pass."
  - "MemberFallbackAvatar (photo-less members) still renders as a large flat dark block on both surfaces. Shared with /manage, so left untouched."
  - "/manage's MemberCard has not been given the depth treatment."

duration: 25min
completed: 2026-08-26
---
