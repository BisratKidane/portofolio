// Deterministic WCAG AA contrast gate for the person-card surfaces (A11Y-01, D-03).
// jest-axe cannot catch contrast failures under jsdom (its color-contrast rule is disabled
// there by design) -- this is the only code-enforced coverage for SC-2. Pure-data test, no
// DOM/component rendering: it composites the same tokens the components render, imported
// from utils/cardDepth.js, so a regression here means a real user-visible contrast failure
// rather than a test artifact -- and so the gate cannot silently drift away from the
// components the way a hand-copied background constant would.
import { describe, it, expect } from 'vitest';
import contrast from 'wcag-contrast';
import { colors } from './theme.js';
import { META_TINT, RIM_GRADIENT, TEXT_TINT, cardFaceDarkest, cardFaceStops } from './utils/cardDepth.js';
import { CHIP_TEXT_ALIVE } from './components/person/PersonCard.jsx';

const GENDERS = ['Male', 'Female', 'Other'];

// The darkest point of each card's face -- the bottom-right end of the raking
// gradient, which is the worst case for any text drawn on the card.
const CARD_BG = Object.fromEntries(GENDERS.map((g) => [g, cardFaceDarkest(g)]));

describe('WCAG AA contrast -- person-card surfaces', () => {
  it('fullname (colors.ink) on the male/female/other card face meets 4.5:1', () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(colors.ink, CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("/detail Ge'ez name and role label (TEXT_TINT) on the card face meet 4.5:1", () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(TEXT_TINT[gender], CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("/family Ge'ez name and mother row (META_TINT) on the card face meet 4.5:1", () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(META_TINT[gender], CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('"Living" chip text (CHIP_TEXT_ALIVE) meets 4.5:1 against the card face', () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(CHIP_TEXT_ALIVE, CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  // WCAG 1.4.11 non-text contrast: the rim is the gender cue, so every stop of
  // the bevel gradient has to clear 3:1 against what it is actually adjacent
  // to. Closes v4.0 WR-01 (Female rim was 2.97:1 against its own card).
  //
  // The rim's inner neighbour is the card face at the SAME position along the
  // gradient -- both ramps are lit from the same side. The test below proves
  // that invariant rather than assuming it, so re-angling one gradient without
  // the other fails here instead of silently weakening the pairing.
  it('the rim and face ramps darken together, so each rim stop sits beside its own face stop', () => {
    for (const gender of GENDERS) {
      const darkness = (hex) => contrast.hex(hex, '#ffffff');
      const rim = RIM_GRADIENT[gender].map(darkness);
      const face = cardFaceStops(gender).map(darkness);
      for (let i = 1; i < rim.length; i += 1) {
        expect(rim[i]).toBeGreaterThan(rim[i - 1]);
        expect(face[i]).toBeGreaterThanOrEqual(face[i - 1]);
      }
    }
  });

  it('every gender rim stop meets 3:1 against the face stop beside it', () => {
    for (const gender of GENDERS) {
      const face = cardFaceStops(gender);
      RIM_GRADIENT[gender].forEach((stop, i) => {
        expect(contrast.hex(stop, face[i])).toBeGreaterThanOrEqual(3);
      });
    }
  });

  it('every gender rim stop meets 3:1 against the page background behind it', () => {
    for (const gender of GENDERS) {
      for (const stop of RIM_GRADIENT[gender]) {
        expect(contrast.hex(stop, colors.bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
