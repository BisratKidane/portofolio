// Default member avatar shown when a FamilyMember has no uploaded photo. The
// avatar is colour-coded and cued by gender: Male = blue tile + glasses, Female
// = pink tile + long hair, anything else = slate tile + a plain figure. It fills
// 100% of its container and covers (so it works in both the circular /manage
// avatar and the rounded, full-bleed /family tree node).
//
// Decorative only: the member's gender is already exposed to assistive tech via
// the node's aria-label, so this SVG is aria-hidden and must NOT carry an
// aria-label of its own (a `svg[aria-label="Male"]` would regress the
// MemberNode "gender by colour, not icon" contract). Gender is exposed for tests
// via `data-gender` instead.

const TILE = {
  Male: '#3b82f6',
  Female: '#ec4899',
  Other: '#64748b'
};

function normalizeGender(gender) {
  if (gender === 'Male') return 'Male';
  if (gender === 'Female') return 'Female';
  return 'Other';
}

export default function MemberFallbackAvatar({ gender }) {
  const g = normalizeGender(gender);
  const tile = TILE[g];

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
      <rect width="64" height="64" fill={tile} />

      {/* Female: long-hair frame drawn behind the head so it reads as hair. */}
      {g === 'Female' && (
        <path
          fill="#ffffff"
          d="M17 30 a15 15 0 0 1 30 0 v14 h-6 v-15 a9 9 0 0 0-18 0 v15 h-6 z"
        />
      )}

      {/* Base figure: head + shoulders. */}
      <circle cx="32" cy="26" r="11" fill="#ffffff" />
      <path fill="#ffffff" d="M14 55 c0-9 8-13 18-13 s18 4 18 13 v3 h-36 z" />

      {/* Male: glasses over the face, drawn in the tile colour. */}
      {g === 'Male' && (
        <g fill="none" stroke={tile} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="27" cy="25" r="4" />
          <circle cx="37" cy="25" r="4" />
          <path d="M31 25 h2" />
        </g>
      )}
    </svg>
  );
}
