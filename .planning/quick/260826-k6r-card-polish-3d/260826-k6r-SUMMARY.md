---
phase: quick
plan: 01
status: complete
subsystem: ui
tags: [react, mui, xyflow, family-tree, visual-design, a11y]

requires:
  - phase: 29-card-redesign
    provides: the two-column 252x120 MemberNode card, genderMeta() tint/label source of truth
provides:
  - A depth system for the /family tree card — layered elevation, bevelled gradient rim, gradient face, recessed avatar well, hover lift
  - Deepened gender hues (RIM_GRADIENT/RIM_TINT/META_TINT) that clear WCAG 1.4.11 (3:1) and 1.4.3 (4.5:1)
affects: [family-tree]

tech-stack:
  added: []
  patterns:
    - "Layered box-shadow elevation: contact + ambient + wide falloff + a hue-matched glow, composed by depthShadow() so the resting, hovered and focus-root variants stay in one place."
    - "Bevelled gradient border via stacked background layers — `linear-gradient(...) padding-box` for the face over an opaque white base, `linear-gradient(...) border-box` under a `2px solid transparent` border for the rim."
    - "Recessed inner surfaces need an ::after overlay: a plain `inset` box-shadow is painted beneath child content, so an <img> filling the box hides it."
    - "Local deepened-hue maps keyed off the normalized genderLabel (the PersonCard TEXT_TINT pattern), leaving the shared MALE_TINT/FEMALE_TINT tokens untouched for /manage and PersonCard."

key-files:
  created: []
  modified:
    - frontend/src/components/family/MemberNode.jsx

key-decisions:
  - "Kept the gender rim as the colour cue but made it a three-stop gradient, with the LIGHTEST stop set to the existing MALE_TINT/FEMALE_TINT hue — the card keeps its familiar palette while every stop clears the 3:1 non-text floor, closing the open v4.0 WR-01 review item."
  - "Made the four React Flow handles paint-free instead of grey nubs: they are isConnectable={false} geometry, and their dots visibly interrupted the newly bevelled rim. The 6px box React Flow measures edge endpoints from is unchanged."
  - "Avatar well radius set to 7px — concentric with the new 14px outer radius (14 - 2px rim - 6px padding = 6) plus a hair of softness."
  - "Scope held to the /family tree card. PersonCard (/detail) and MemberCard (/manage) were deliberately left alone."

verification:
  - "435/435 frontend tests pass (42 files), including all 91 family-tree tests."
  - "Visually verified in Chromium via a throwaway Vite preview harness rendering five representative cards (viewer ring, focus-root, +N badges, Ge'ez names, Other-gender fallback avatar) at 1x and 3x, plus a hover-state capture. Harness removed afterwards."

open-items:
  - "The photo-less fallback avatar (MemberFallbackAvatar) renders as a large flat dark block that now looks heavy against the polished card. It is shared with /manage, so it was left untouched."

duration: 20min
completed: 2026-08-26
---
