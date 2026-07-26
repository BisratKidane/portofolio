# Quick Task 260726-sh4: Restyle MemberNode card — Summary

Restyled the `/family` tree node into a two-column card (1/3 avatar column + a
rows column: reserved edit row, fullname, birthday, mother name, alive-only
address), plumbed the needed fields into the tree query, and resized the dagre
node box to match. Frontend-only; no runtime/schema change. Full frontend suite
green (191/191).

## Card dimensions chosen

- **Card:** 252 wide × 120 tall (`boxSizing: border-box` preserved).
- **Avatar column:** `flex: 0 0 33%` (~1/3 width), vertically + horizontally
  centered.
- **Avatar size:** 72px (via new `MemberAvatarImage` `size` prop).

## Per-file changes

- `frontend/src/components/manage/MemberAvatarImage.jsx`
  - Added optional `size` prop (default `42`, so /manage + detail-panel callers
    are unchanged). Applied to all four render branches (placeholder Avatar,
    Skeleton, image Avatar, fallback Avatar).

- `frontend/src/components/family/MemberNode.jsx`
  - Rebuilt body as a flex row: left 1/3 avatar column (`size={72}`, centered) +
    right `flex: 1, minWidth: 0` rows column.
  - Rows: reserved empty row (~18px, commented as deferred edit slot) → fullname
    (noWrap + "You" chip when `isViewer`) → birthday → mother name → address.
  - Added `formatDate(dateStr)` helper (`toLocaleDateString`, guards
    null/invalid dates); removed now-dead `formatYears`.
  - Birthday renders only when `birthdate` valid; mother =
    `member.mother?.fullname || member.mothersname` (rendered only when truthy);
    address rendered only when `member.deathdate == null && member.address`.
  - Card grown 180×64 → 252×120. Preserved: all 4 `<Handle>`s + ids, gender
    colour (`data-gender`/`aria-label`/`title`, no icon), viewer outline ring +
    `data-viewer-ring` + "You" chip, both expand badges (`ancestorHiddenCount`
    top / `hiddenCount` bottom) with aria-labels + onToggle handlers,
    `data-testid=member-node-${member.id}`.

- `frontend/src/components/family/MemberNode.test.jsx`
  - Extended `BASE_MEMBER` with `mother: { id: '9', fullname: 'Mary Mother' }`,
    `mothersname: 'Mary Mother'`, `address: '12 Elm St'`.
  - Replaced the `1932–2001` years assertion with a formatted-birthday
    assertion; added birthday-hidden (missing/invalid) coverage.
  - Added mother-row tests: linked `mother.fullname` preferred over
    `mothersname`; falls back to `mothersname` when unlinked; hidden when
    neither present.
  - Added address-row tests: shows when alive + address; hidden when deceased;
    hidden when alive but no address.
  - Removed obsolete `formatYears` variant tests (start-dash / end-dash /
    omit-both) that tested removed behavior.
  - Preserved tests (4 handles + ids, gender-by-colour, viewer ring + chip, both
    badges + onToggle) unchanged and still green.

- `frontend/src/pages/FamilyTreePage.jsx`
  - `FAMILY_TREE_QUERY`: added `mothersname` and `address`; changed
    `mother { id }` → `mother { id fullname }`. `father/spouses/children`
    unchanged. No admin-only/account-link field added (D-14 note honored — these
    are ordinary FamilyMember fields already exposed on /manage).

- `frontend/src/components/family/familyTree.layout.js`
  - `PERSON_W` 180 → 252, `PERSON_H` 64 → 120 so dagre node boxes match the
    rendered card. `nodesep`/`ranksep` left unchanged (layout tests still pass,
    no crowding observed).

## Test result

`npm test --workspace frontend -- --run`: **Test Files 24 passed (24), Tests
191 passed (191)** (baseline was 187; net +4 from the reworked MemberNode
tests).

## Commits

- `f560feb` refactor(family): add optional size prop to MemberAvatarImage
- `1c4742f` feat(family): restyle MemberNode as two-column card
- `02bf398` refactor(family): match dagre node box to new card size

## Deviations from plan

- None functionally. Minor judgment calls within the plan's latitude: chose
  252×120 card, 33% avatar column, and avatar `size=72` (all within the plan's
  suggested ranges). Removed the three obsolete `formatYears` variant tests
  rather than leaving dead assertions (plan mandated removing dead code and only
  named the years/handles/gender/viewer/badge tests to keep). `nodesep`/`ranksep`
  left unchanged (plan said bumping them was optional).
