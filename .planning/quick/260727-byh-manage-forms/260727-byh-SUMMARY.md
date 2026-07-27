---
quick_id: 260727-byh
slug: manage-forms
status: complete
branch: manage-forms
completed: 2026-07-27
tests: 206 passed (25 files)
build: ok
---

# Quick Task 260727-byh — /manage forms improvements (part 1) — SUMMARY

Frontend-only. Reworked the three /manage member forms around a single shared
`MemberFields` block: role clarity that names the active member, at-most-two-column
layout with MUI X DatePickers, photo-on-create, and a visual account↔member
connection card. Full frontend suite green; production build compiles.

## Dependencies added

- `@mui/x-date-pickers@^7.29.4` — pinned to v7 because the current latest (v9)
  requires MUI 7+, but this project is on MUI 6. v7 is the MUI-6-compatible line.
- `dayjs@^1.11.21` — adapter backing for the DatePicker.
- Root `package-lock.json` updated (single shared lockfile) and committed.

## Per-file changes

**`frontend/src/main.jsx`**
- Wrapped the app once in `<LocalizationProvider dateAdapter={AdapterDayjs}>`
  (inside `ThemeProvider`, around the Router/AuthProvider tree).

**`frontend/src/components/manage/MemberFields.jsx`** (NEW)
- Shared presentational field block used by all three forms.
- Props: `{ form, onChange, withPhoto?, photoPreviewUrl?, onPickPhoto?, onClearPhoto? }`;
  `onChange(field, value)` updates one field.
- Layout is at most two columns: First/Last, Gender/Mother's name,
  Birthdate/Deathdate (DatePickers), Email/Phone, Address (full width).
- Dates stored as `'YYYY-MM-DD'` strings; dayjs↔string conversion happens only at
  the DatePicker boundary (`value={form.x ? dayjs(form.x) : null}`,
  `onChange -> v.isValid() ? v.format('YYYY-MM-DD') : ''`).
- `withPhoto` renders an avatar preview (picked image or gender fallback) + an
  "Add photo"/"Change photo" button (hidden file input → `onPickPhoto(file)`) and a
  "Remove" button when a photo is picked.

**`frontend/src/components/manage/PhotoCropDialog.jsx`**
- Added a deferred (return-blob) mode: when `onCropped` is provided, it crops to the
  same 512×512 JPEG blob and calls `onCropped(blob)` WITHOUT uploading. The
  upload-now path (`member` + `onUploaded`) is unchanged. Submit label shows
  "Saving…" in deferred mode, "Uploading…" in upload-now mode.

**`frontend/src/components/manage/AddRelativeDialog.jsx`**
- New `targetName` prop; the Role select gains helper text naming the active member
  ("Is this person the mother or father of {name}?" for parent; "{name} is this
  child's mother or father." for child). Role label kept as "Role".
- Inline 3-column fields replaced with `<MemberFields withPhoto>`.
- Holds a deferred cropped blob; after the add mutation returns `{ id }`, uploads the
  blob via `uploadMemberPhoto(created.id, blob)`. Photo failure is non-fatal
  (member is kept; a `console.warn` is emitted).

**`frontend/src/components/manage/EditMemberDialog.jsx`**
- Inline 3-column fields replaced with `<MemberFields>` (no photo — the member card
  already owns avatar upload). Mutation, field list, and D-06 behavior preserved.

**`frontend/src/pages/ManagePage.jsx`**
- Threads `targetName` (self/focused member fullname) to `AddRelativeDialog` from
  BOTH branches (MemberBranch + AdminBranch).
- `UnlinkedUserRow` pick mode reworked into a side-by-side connection card: account
  (initials avatar + name + email) left, `LinkRoundedIcon` middle, member picker
  right. Autocomplete options render member avatars + fullname + a muted subtitle
  ("Gender · b.YYYY") via `renderOption`; the selected member shows as an avatar+name
  preview. Primary action reads "Connect account → member".
- Create-and-link uses `<MemberFields withPhoto>`; after `linkUserToMember` returns
  `{ familyMemberId }`, the deferred blob is uploaded to it (non-fatal on failure).
- `familyMembers` query gains `birthdate` (frontend-only; field already exists
  server-side) to feed the option subtitle. Removed now-unused `MenuItem` import.

**Tests**
- NEW `MemberFields.test.jsx` — all fields render; `onChange(field,value)`;
  string→field date round-trip (`'1990-05-15'` → `05/15/1990`); blank date shows
  empty; photo control (`withPhoto`) routes a file and toggles Change/Remove.
- `PhotoCropDialog.test.jsx` — added a deferred-mode test (calls `onCropped` with a
  Blob, never uploads).
- `AddRelativeDialog.test.jsx` — wrapped renders in `LocalizationProvider`; added
  role-clarity assertions (parent + child) and two photo-on-create tests (uploads to
  created id; non-fatal on upload failure).
- `EditMemberDialog.test.jsx` — wrapped render + rerender in `LocalizationProvider`.
- `ManagePage.test.jsx` — wrapped renders in `LocalizationProvider`; updated the link
  button label ("Connect account → member") and option matcher (`/John Doe/`, since
  the subtitle changes the option's accessible name); added connection-card and
  create-and-link-photo tests. Added `react-easy-crop` mock.

## Deviations

- **[Rule 3 — blocking] x-date-pickers version pin.** `@mui/x-date-pickers` latest
  (v9) peer-requires MUI 7/9; project is MUI 6. Installed `@mui/x-date-pickers@^7`
  (the plan already anticipated v7). Not a package substitution — same package, a
  compatible major.
- **Date-picker "write" direction not asserted via typing.** MUI X v7's section-based
  field does not accept `userEvent.type`/`keyboard` input under jsdom (a known
  limitation; keystrokes never reach the section handler and the calendar popover
  does not open in jsdom). The `MemberFields` round-trip test therefore asserts the
  deterministic read direction (stored `'YYYY-MM-DD'` → formatted field value) and the
  empty case. The write direction (`dayjs → 'YYYY-MM-DD'`) is a one-line
  `value.format('YYYY-MM-DD')` at the boundary and is exercised indirectly by the
  existing form-submit tests (which keep the default `''`/pre-filled string values).
- **Role field label kept as "Role"** (helper text carries the active-member naming)
  so the existing `getByLabelText('Role')` queries and MOTHER/FATHER option flow stay
  intact while satisfying the clarity ask.
- **Non-fatal photo failure** is surfaced via `console.warn` (not a persisted UI
  warning) because the create dialogs close on success; the priority per the plan is
  "must not lose the created member", which is met.
- **Untouched:** `env/local.env` shows as modified in the working tree but was not
  changed by this task (pre-existing local change; also a forbidden-values file) — it
  was left unstaged. `docker-deploy/` and `kubernetes-deploy/` left alone.

## Commits (code only; PLAN/SUMMARY/STATE not committed)

- `5c18c21` chore(deps): add @mui/x-date-pickers v7 + dayjs for MUI 6 date fields
- `5ef58a4` feat(manage): wrap app in LocalizationProvider (AdapterDayjs)
- `4e4cfa8` feat(manage): shared MemberFields (<=2 cols, DatePickers, optional photo)
- `3233b1a` feat(manage): PhotoCropDialog deferred (return-blob) mode
- `7307f68` feat(manage): AddRelativeDialog role clarity + MemberFields + photo-on-create
- `67d5bf8` refactor(manage): EditMemberDialog uses shared MemberFields
- `982cbe7` feat(manage): side-by-side account<->member connection card + create-and-link photo

## Verification

- `npm test --workspace frontend -- --run` → **206 passed / 25 files**.
- `npm run build --workspace frontend` → **built OK** (pre-existing >500 kB chunk-size
  advisory only; not introduced by this task).

## Things to visually check

- **Connection card** (admin → Link accounts): account block, the link/chain icon
  (rotates 90° on xs), the member picker with avatar options + "Gender · b.year"
  subtitle, the selected-member preview, and the "Connect account → member" button.
- **Photo-on-create** in AddRelativeDialog and admin create-and-link: pick a file →
  crop → "Save photo" shows the preview; on submit the photo attaches to the new
  member. Confirm a photo-service failure still creates the member.
- **Role clarity**: the parent/child Role helper text should name the focused member.
- **DatePickers** across all three forms render as calendars and persist as
  'YYYY-MM-DD'; confirm editing an existing member preserves its birthdate.
