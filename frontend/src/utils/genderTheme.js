// Shared gender -> color/label mapping, extracted from MemberNode.jsx (D-02,
// Phase 25 RESEARCH.md Pattern 1) so every gender-tinted surface (the
// /family tree card and the reusable PersonCard) reads from one source of
// truth instead of re-hardcoding the same hex values.
//
// Gender is depicted by color (border + soft background tint) rather than a
// gender icon. Because color is a single perceptual channel, consumers must
// also expose gender via a non-color cue (e.g. data-gender + aria-label,
// or PersonCard's avatar-ring border-style) -- this module only owns the
// color/label half of that contract.
import { colors } from '../theme.js';

export const MALE_TINT = '#3b82f6';
export const FEMALE_TINT = '#ec4899';

export function genderMeta(gender) {
  if (gender === 'Male') return { label: 'Male', tint: MALE_TINT };
  if (gender === 'Female') return { label: 'Female', tint: FEMALE_TINT };
  return { label: 'Other', tint: colors.slate };
}
