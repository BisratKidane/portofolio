// Deterministic WCAG AA contrast gate for /detail's PersonCard surfaces (A11Y-01, D-03).
// jest-axe cannot catch contrast failures under jsdom (its color-contrast rule is disabled
// there by design) -- this is the only code-enforced coverage for SC-2. Pure-data test, no
// DOM/component rendering: computes contrast ratios directly from the same hex tokens
// PersonCard.jsx composites and renders, so a regression here means a real user-visible
// contrast failure, not a test artifact.
import { describe, it, expect } from 'vitest';
import contrast from 'wcag-contrast';
import { colors } from './theme.js';
import { MALE_TINT, FEMALE_TINT } from './utils/genderTheme.js';
import { TEXT_TINT, CHIP_TEXT_ALIVE } from './components/person/PersonCard.jsx';

// Alpha-composites a foreground hex color at the given alpha byte (0-255) over a background
// hex color -- mirrors PersonCard.jsx's `bgcolor: \`${genderTint}14\`` sitting on colors.bg
// (page background), where '14' is the alpha hex byte (0x14 = 20/255).
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function compositeOverPage(hexFg, alphaByte, hexBg = colors.bg) {
  const alpha = alphaByte / 255;
  const [fr, fg, fb] = hexToRgb(hexFg);
  const [br, bg, bb] = hexToRgb(hexBg);
  return rgbToHex([
    fr * alpha + br * (1 - alpha),
    fg * alpha + bg * (1 - alpha),
    fb * alpha + bb * (1 - alpha)
  ]);
}

// The three composited card backgrounds PersonCard.jsx actually renders
// (`bgcolor: \`${genderTint}14\`` over the page's colors.bg), one per gender variant.
const CARD_BG = {
  Male: compositeOverPage(MALE_TINT, 0x14),
  Female: compositeOverPage(FEMALE_TINT, 0x14),
  Other: compositeOverPage(colors.slate, 0x14)
};

const GENDERS = ['Male', 'Female', 'Other'];

describe('WCAG AA contrast — /detail surfaces', () => {
  it('fullname (colors.ink) on the male/female/other card background meets 4.5:1', () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(colors.ink, CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("Ge'ez name text (PersonCard's TEXT_TINT) on its own card background meets 4.5:1 for all three gender variants", () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(TEXT_TINT[gender], CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('role label text (PersonCard\'s TEXT_TINT, reused from the Ge\'ez name fix) on the card background meets 4.5:1', () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(TEXT_TINT[gender], CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('"Living" chip text (PersonCard\'s CHIP_TEXT_ALIVE) meets 4.5:1 against the card background', () => {
    for (const gender of GENDERS) {
      expect(contrast.hex(CHIP_TEXT_ALIVE, CARD_BG[gender])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
