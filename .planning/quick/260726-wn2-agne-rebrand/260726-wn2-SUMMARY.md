---
quick_id: 260726-wn2
slug: agne-rebrand
status: complete
completed: 2026-07-26
branch: agne-rebrand
commits:
  - 1e7f32d feat(brand): Agne tree-of-people logo + favicon, rename from Portofolio
  - 289f72c feat(family): gender-coded default member avatars
---

# Summary — Agne rebrand

Frontend-only branding pass on branch `agne-rebrand`. Full frontend suite green
(**192 passed**, +1 new gender-fallback test).

## What changed
- **Logo:** `BrandMark`/`BrandGlyph` render a white "tree of people" SVG glyph on
  the app gradient tile (replaced the "P"). Reused in navbar + auth cards.
- **Favicon:** `frontend/public/favicon.svg` — self-contained gradient tile + the
  same white tree; linked from `index.html`.
- **Gender default avatars:** new `MemberFallbackAvatar` (Male = blue `#3b82f6` +
  glasses, Female = pink `#ec4899` + long hair, other = slate `#64748b`). Wired
  into `MemberAvatarImage` for the no-photo and fetch-failure branches; fills the
  box and respects `size`/`fill`/`variant`. Decorative (`aria-hidden`,
  `data-gender`) so the MemberNode "gender by colour, not icon" contract holds.
- **Rename Portofolio → Agne:** `index.html` title, navbar brand, `Login` (×2),
  `Register` (×1). Internal ids / package names / DB name left as `portofolio`.

## Tests
- Updated `MemberAvatarImage.test.jsx`: placeholder now asserts
  `data-testid="member-fallback-avatar"` (not PersonRoundedIcon); added a
  Male/Female gender-coding test.
- MemberNode gender tests unaffected (fallback has no `svg[aria-label]`).

## Not done / follow-ups
- SVGs are clean iconographic recreations in the app palette (not pixel copies of
  the uploads) — as chosen.
- Not deployed. Merge `agne-rebrand` → `main` + `./deploy.sh` to ship to
  https://agne.bisrat.ch.
