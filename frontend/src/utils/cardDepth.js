// The one depth system every person-card surface renders from (quick task
// 260826-k6r on /family's MemberNode, extended to /detail's PersonCard by
// 260826-kp7). Extracted here rather than duplicated so the two cards stay one
// visual family: same light direction, same rim bevel, same elevation ramp.
//
// A card looks physical when its shadow has a real penumbra and its rim has
// thickness. One blurry blob gives neither, so the elevation is composed from
// cooperating layers:
//   1. BEVEL       -- an inset lit top edge + shaded bottom edge, which is what
//                     makes the 2px rim read as a machined edge rather than a
//                     drawn outline. Listed first so it paints above the rest.
//   2. *_ELEVATION -- a tight contact shadow (the card touching the page), a
//                     mid ambient shadow, and a wide, heavily-offset falloff.
//   3. a gender-tinted glow -- the light pooling under the card picks up the
//                     card's own hue instead of being neutral grey.
//
// Everything here is a plain string/data token: no MUI, no React, so the
// contrast gate in theme.contrast.test.js can import and composite the exact
// values the components render.
import { colors } from '../theme.js';
import { genderMeta } from './genderTheme.js';

export const BEVEL = 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(15,23,42,0.07)';

export const REST_ELEVATION = [
  '0 1px 1px rgba(15,23,42,0.05)',
  '0 2px 4px -1px rgba(15,23,42,0.05)',
  '0 8px 14px -6px rgba(15,23,42,0.10)',
  '0 20px 32px -18px rgba(15,23,42,0.16)'
].join(', ');

export const HOVER_ELEVATION = [
  '0 2px 2px rgba(15,23,42,0.05)',
  '0 6px 10px -2px rgba(15,23,42,0.07)',
  '0 16px 26px -8px rgba(15,23,42,0.12)',
  '0 34px 48px -22px rgba(15,23,42,0.22)'
].join(', ');

export const LIFT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

// Composes the full box-shadow for a card. The focus-root ring goes first so it
// sits on top of (rather than under) the elevation layers.
export function depthShadow(rimTint, { lifted = false, focusRoot = false } = {}) {
  return [
    focusRoot ? `0 0 0 3px ${colors.primary}59` : null,
    BEVEL,
    lifted ? HOVER_ELEVATION : REST_ELEVATION,
    lifted ? `0 20px 30px -16px ${rimTint}59` : `0 12px 20px -14px ${rimTint}4d`
  ]
    .filter(Boolean)
    .join(', ');
}

// --- Gender hues ------------------------------------------------------------
// Deepened variants of the shared MALE_TINT/FEMALE_TINT tokens. genderMeta()
// keeps owning the *soft* surface tint and the normalized label; these darker
// variants exist because the raw tints fail contrast against the card's own
// pale face (v4.0 review item WR-01: Female rim 2.97:1 vs the 3:1 non-text
// floor of WCAG 1.4.11; gender-tinted text sat under the 4.5:1 floor of 1.4.3
// for the same reason). The shared tokens are deliberately untouched --
// /manage's MemberCard and every other tinted surface still read them.
//
// All three maps are keyed off the normalized `genderLabel` from genderMeta(),
// never the raw `member.gender`, so an unrecognized value still resolves to a
// real colour instead of `undefined`.

// The rim is a three-stop gradient, not a flat line: it catches light along the
// top edge and deepens toward the bottom, which is what makes a 2px border read
// as a bevelled edge with thickness. Every stop stays at or above the 3:1
// non-text floor on both the card face and the page behind it, so the light end
// of the bevel is still a valid gender cue -- and that light end is deliberately
// the familiar MALE_TINT/FEMALE_TINT hue, so the cards keep the palette they
// always had while gaining a defensible contrast floor.
export const RIM_GRADIENT = {
  Male: ['#3b82f6', '#2563eb', '#1e40af'],
  Female: ['#ec4899', '#db2777', '#9d174d'],
  Other: ['#64748b', '#475569', '#334155']
};

// The rim's mid stop, reused for the tinted glow under the card and for inner
// hairlines, so card, rim and well all read as the same light source.
export const RIM_TINT = { Male: '#2563eb', Female: '#db2777', Other: '#475569' };

// Two text ramps, both cleared to 4.5:1 against their own card face:
// META_TINT is the vivid one, for /family's dense 252x120 node where the Ge'ez
// name is the card's visual anchor and wants to stay saturated; TEXT_TINT is
// the deep one, for /detail's large pale card where the same hue at the vivid
// stop would sit too close to the background across a much bigger area.
export const META_TINT = { Male: '#1d4ed8', Female: '#be185d', Other: '#475569' };
export const TEXT_TINT = { Male: '#1e40af', Female: '#9d174d', Other: '#334155' };

// --- Card face --------------------------------------------------------------
// The face is a raking gradient over an opaque base, sharing the rim's light
// direction: lit from the top-left, deepening toward the bottom-right.
//
// FACE_STOPS are the tint alpha bytes at the three gradient stops, in the same
// order and running in the SAME direction as RIM_GRADIENT's three stops. That
// is the whole point of the shared light direction and it is what the contrast
// gate leans on: the lit rim stop only ever sits against the lightest part of
// the face, and the shaded stop against the darkest. theme.contrast.test.js
// asserts that both ramps really do darken together, so the pairing cannot
// silently drift if someone re-angles one gradient later.
export const FACE_BASE = '#ffffff';
export const FACE_STOPS = [0x00, 0x12, 0x2e];

const toByte = (n) => n.toString(16).padStart(2, '0');
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function composite(hexFg, alphaByte, hexBg) {
  const alpha = alphaByte / 255;
  const fg = channels(hexFg);
  const bg = channels(hexBg);
  return `#${fg.map((c, i) => toByte(Math.round(c * alpha + bg[i] * (1 - alpha)))).join('')}`;
}

// The `background` shorthand for a card: three layers, painted first-on-top.
//   1. the gender tint, clipped to the padding box (the card face);
//   2. an opaque white base under it, so the card sits *on* the page instead of
//      dissolving into it;
//   3. the rim gradient, clipped to the border box -- which is what a
//      `<n>px solid transparent` border reveals.
export function cardSurface(genderLabel) {
  // genderLabel is already the normalized 'Male' | 'Female' | 'Other', which
  // genderMeta() round-trips: anything that is not Male/Female returns slate.
  const { tint } = genderMeta(genderLabel);
  const [rimLit, rimMid, rimShaded] = RIM_GRADIENT[genderLabel] ?? RIM_GRADIENT.Other;
  const [, faceMid, faceDeep] = FACE_STOPS;
  return [
    `linear-gradient(157deg, rgba(255,255,255,0) 0%, ${tint}${toByte(faceMid)} 46%, ${tint}${toByte(faceDeep)} 100%) padding-box`,
    `linear-gradient(${FACE_BASE}, ${FACE_BASE}) padding-box`,
    `linear-gradient(158deg, ${rimLit} 0%, ${rimMid} 52%, ${rimShaded} 100%) border-box`
  ].join(', ');
}

// The card's face at each gradient stop, as opaque hex -- index-aligned with
// RIM_GRADIENT[genderLabel]. Used by the WCAG gate so it tracks what the
// components actually render instead of a hand-copied constant.
export function cardFaceStops(genderLabel) {
  const { tint } = genderMeta(genderLabel);
  return FACE_STOPS.map((alphaByte) => composite(tint, alphaByte, FACE_BASE));
}

// The darkest point of a card's face -- the worst case for any text drawn on
// it, since text is laid out across the card rather than pinned to one corner.
export function cardFaceDarkest(genderLabel) {
  const stops = cardFaceStops(genderLabel);
  return stops[stops.length - 1];
}
