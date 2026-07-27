// Default member avatar shown when a FamilyMember has no uploaded photo.
// Male/Female use the illustrated avatar images; any other/unknown gender falls
// back to a neutral slate figure. Fills 100% of its container and covers (so it
// works in both the circular /manage avatar and the rounded, full-bleed /family
// tree node).
//
// Decorative only: the member's gender is already exposed to assistive tech via
// the node's aria-label, so this is aria-hidden and carries no accessible name.
// Gender is exposed for tests via `data-gender`.

import avatarMale from '../assets/avatar-male.png';
import avatarFemale from '../assets/avatar-female.png';

const GENDER_IMAGE = {
  Male: avatarMale,
  Female: avatarFemale
};

const NEUTRAL_TILE = '#64748b';

function normalizeGender(gender) {
  if (gender === 'Male') return 'Male';
  if (gender === 'Female') return 'Female';
  return 'Other';
}

export default function MemberFallbackAvatar({ gender }) {
  const g = normalizeGender(gender);

  if (g === 'Male' || g === 'Female') {
    return (
      <img
        src={GENDER_IMAGE[g]}
        alt=""
        aria-hidden="true"
        data-testid="member-fallback-avatar"
        data-gender={g}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    );
  }

  // Other / unknown gender: neutral figure on a slate tile.
  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-testid="member-fallback-avatar"
      data-gender={g}
      style={{ display: 'block' }}
    >
      <rect width="64" height="64" fill={NEUTRAL_TILE} />
      <circle cx="32" cy="26" r="11" fill="#ffffff" />
      <path fill="#ffffff" d="M14 55 c0-9 8-13 18-13 s18 4 18 13 v3 h-36 z" />
    </svg>
  );
}
